import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { RESEARCH_USE_SCOPE, createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import {
  SHARE_OFFER_LINE,
  SharedAnswerVault,
  createShareLimiter,
  type SharedAnswers,
} from "../apps/research-mcp/src/shared-answers.js";

// Owner answer 200a, end to end on both connector surfaces: the final check's offer, the confirmed copy kept with no
// account, its code, the owner's review, and deletion. The published tool lists stay as they are (owner answer 189a).
const primaryResource = new URL("https://mcp.askrigor.example/mcp");
const claudeResource = new URL("https://mcp.askrigor.example/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const OWNER = "auth0|owner";
const clients: Client[] = [];
const servers: HttpServer[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const agreement = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
} as const;
const copy = {
  question: "An adult in their thirties asks whether a week at 800 kcal a day is likely to harm them.",
  answer: "A week at 800 kcal is often tolerated by healthy adults (https://doi.org/10.1186/s12906-018-2136-6).",
  improve: "Give the absolute risks first.",
  confirmed: true,
};
const draft = {
  receipts: [], research_target: "Release probe fixture", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage", not_relevant_reason: "Probe",
  key_sources: [], answer_draft: "No study's methods were checked in full text for this answer.", absence_claims: [],
  scale_results: [], binary_results: [], safety_question: false, safety_claims: [], key_terms: [],
  mechanism_claims: [], recommendations: [], user_observations: [], proposed_tests: [],
};

async function start(sharing: boolean) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "shared-answers-test-key" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 11) });
  const root = mkdtempSync(join(tmpdir(), "askrigor-shared-answers-mcp-"));
  roots.push(root);
  const directory = join(root, "shared-answers");
  const sharedAnswers: SharedAnswers | null = sharing
    ? { vault: new SharedAnswerVault({ directory, key: Buffer.alloc(32, 5) }), allow: createShareLimiter(2) }
    : null;
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    oauthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: primaryResource, issuerUrl, jwks, allowedClientIds: ["chatgpt-client"],
      reviewerSubjects: [OWNER],
    }),
    claudeOAuthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: claudeResource, issuerUrl, jwks, allowedClientIds: ["claude-client"],
      reviewerSubjects: [OWNER],
    }),
    researchContributorAccessService: service,
    sharedAnswers,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  const connect = async (surface: "/mcp" | "/mcp/claude", subject: string, scope = RESEARCH_USE_SCOPE) => {
    const token = await new SignJWT({
      iss: issuerUrl.href,
      aud: surface === "/mcp" ? primaryResource.href : claudeResource.href,
      exp: Math.floor(Date.now() / 1_000) + 300,
      client_id: surface === "/mcp" ? "chatgpt-client" : "claude-client",
      scope,
      sub: subject,
    }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
    const client = new Client({ name: "shared-answers-test", version: "1.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(surface, base), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }));
    return client;
  };
  return { directory, connect };
}

const text = (result: { content?: unknown }) => (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n");

describe("shared questions and answers (owner answer 200a)", () => {
  it.each(["/mcp", "/mcp/claude"] as const)("offers, keeps, reviews and deletes a confirmed copy on %s", async (surface) => {
    const { directory, connect } = await start(true);
    const client = await connect(surface, "auth0|researcher");
    const accepted = await client.callTool({ name: "manage_research_access",
      arguments: { action: "accept_free_contributor", agreement } });
    expect(accepted.isError).not.toBe(true);

    // The final check offers the owner's sentence, after the check line.
    const checked = await client.callTool({ name: "finalize_research", arguments: draft });
    expect(checked.structuredContent).toMatchObject({ share_offer: { line: SHARE_OFFER_LINE } });
    expect(text(checked)).toContain(`end the answer with this question, as written`);
    expect(text(checked)).toContain(SHARE_OFFER_LINE);

    // Nothing is kept without the person's confirmation, or with an e-mail address in it.
    const unconfirmed = await client.callTool({ name: "manage_research_access",
      arguments: { action: "share_answer", later_inputs: { sharedAnswer: { ...copy, confirmed: false } } } });
    expect(unconfirmed.isError).toBe(true);
    const contact = await client.callTool({ name: "manage_research_access", arguments: { action: "share_answer",
      later_inputs: { sharedAnswer: { ...copy, question: `${copy.question} Reply to sam@example.org.` } } } });
    expect(contact.structuredContent).toMatchObject({ ok: false, error: { code: "share_refused" } });
    expect(text(contact)).not.toContain("sam@example.org");
    expect(readdirSync(directory)).toEqual([]);

    const shared = await client.callTool({ name: "manage_research_access",
      arguments: { action: "share_answer", later_inputs: { sharedAnswer: copy } } });
    expect(shared.isError).not.toBe(true);
    const code = (shared.structuredContent as { sharedAnswer: { code: string } }).sharedAnswer.code;
    expect(text(shared)).toContain(code);
    expect(readdirSync(directory)).toHaveLength(1);

    // The owner's review lists it without its text, reads it, and the person's code deletes it.
    const owner = await connect(surface, OWNER, "cases:review");
    const listed = await owner.callTool({ name: "review_research_contribution", arguments: { action: "list_shared_answers" } });
    const [summary] = (listed.structuredContent as { sharedAnswers: { kept: Array<{ id: string }> } }).sharedAnswers.kept;
    expect(JSON.stringify(listed.structuredContent)).not.toContain("800 kcal");
    const read = await owner.callTool({ name: "review_research_contribution",
      arguments: { action: "read_shared_answer", later_inputs: { sharedAnswerId: summary!.id } } });
    expect(read.structuredContent).toMatchObject({ sharedAnswers: { answer: { question: copy.question, improve: copy.improve } } });
    const refusedReview = await client.callTool({ name: "review_research_contribution", arguments: { action: "list_shared_answers" } });
    expect(refusedReview.isError).toBe(true);
    const deleted = await client.callTool({ name: "manage_research_access",
      arguments: { action: "delete_shared_answer", later_inputs: { shareCode: code } } });
    expect(deleted.structuredContent).toMatchObject({ ok: true, sharedAnswerDeleted: true });
    expect(readdirSync(directory)).toEqual([]);
    const again = await client.callTool({ name: "manage_research_access",
      arguments: { action: "delete_shared_answer", later_inputs: { shareCode: code } } });
    expect(again.structuredContent).toMatchObject({ ok: true, sharedAnswerDeleted: false });
  });

  it("limits shares per account per day, and needs an active research account", async () => {
    const { connect } = await start(true);
    const unenrolled = await connect("/mcp/claude", "auth0|newcomer");
    const refused = await unenrolled.callTool({ name: "manage_research_access",
      arguments: { action: "share_answer", later_inputs: { sharedAnswer: copy } } });
    expect(refused.isError).toBe(true);
    const client = await connect("/mcp/claude", "auth0|researcher");
    await client.callTool({ name: "manage_research_access", arguments: { action: "accept_free_contributor", agreement } });
    for (let share = 0; share < 2; share += 1) {
      const kept = await client.callTool({ name: "manage_research_access",
        arguments: { action: "share_answer", later_inputs: { sharedAnswer: copy } } });
      expect(kept.isError).not.toBe(true);
    }
    const third = await client.callTool({ name: "manage_research_access",
      arguments: { action: "share_answer", later_inputs: { sharedAnswer: copy } } });
    expect(third.structuredContent).toMatchObject({ ok: false, error: { code: "share_limit_reached" } });
  });

  it("offers nothing and keeps nothing when the server keeps no shared answers", async () => {
    const { connect } = await start(false);
    const client = await connect("/mcp", "auth0|researcher");
    await client.callTool({ name: "manage_research_access", arguments: { action: "accept_free_contributor", agreement } });
    const checked = await client.callTool({ name: "finalize_research", arguments: draft });
    expect(checked.structuredContent).not.toHaveProperty("share_offer");
    expect(text(checked)).not.toContain(SHARE_OFFER_LINE);
    const shared = await client.callTool({ name: "manage_research_access",
      arguments: { action: "share_answer", later_inputs: { sharedAnswer: copy } } });
    expect(shared.structuredContent).toMatchObject({ ok: false, error: { code: "sharing_unavailable" } });
  });
});
