import { withoutLaterInputs } from "./helpers/tool-schema.js";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CONTRIBUTION_EXAMPLES,
  CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  livingEvidenceContributionSchema,
  researchFrontierContributionSchema,
  topicLinkContributionSchema,
} from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { RESEARCH_USE_SCOPE, createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import {
  SUBMIT_RESEARCH_CONTRIBUTION_DESCRIPTION,
  SUBMIT_RESEARCH_CONTRIBUTION_SHAPES_DESCRIPTION,
  submitResearchContributionInputSchema,
  submitResearchContributionPublishedInputSchema,
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { createAskRigorHttpServer, createAskRigorServer } from "../apps/research-mcp/src/server.js";

// Owner question 127 on both connector surfaces: ChatGPT's (/mcp) publishes the
// relaxed schema and Claude's (/mcp/claude) the strict one; on both, every call
// reaches AskRigor's own check, and a rejection names every problem.

type Surface = "/mcp" | "/mcp/claude";
const primaryResource = new URL("https://mcp.askrigor.example/mcp");
const claudeResource = new URL("https://mcp.askrigor.example/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const clients: Client[] = [];
const servers: HttpServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "contribution-problems-test-key" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const store = new InMemoryResearchContributorAccessStore();
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    oauthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: primaryResource, issuerUrl, jwks, allowedClientIds: ["chatgpt-client"],
    }),
    claudeOAuthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: claudeResource, issuerUrl, jwks, allowedClientIds: ["claude-client"],
    }),
    researchContributorAccessService: new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 9) }),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  const connect = async (surface: Surface) => {
    const token = await new SignJWT({
      iss: issuerUrl.href,
      aud: surface === "/mcp" ? primaryResource.href : claudeResource.href,
      exp: Math.floor(Date.now() / 1_000) + 300,
      client_id: surface === "/mcp" ? "chatgpt-client" : "claude-client",
      scope: RESEARCH_USE_SCOPE,
      sub: `contributor-on-${surface}`,
    }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
    const client = new Client({ name: "contribution-problems-test", version: "1.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(surface, base), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }));
    const accepted = await client.callTool({
      name: "manage_research_access",
      arguments: {
        action: "accept_free_contributor",
        agreement: {
          noticeVersion: RESEARCH_USE_NOTICE_VERSION,
          eligibleDeidentifiedResearchContributionRequired: true,
          prohibitedPrivateAndRawContentExcluded: true,
          proposalReviewAndNoAuthorityAcknowledged: true,
          paidPrivateAlternativeAcknowledged: true,
        },
      },
    });
    expect(accepted.isError).not.toBe(true);
    return client;
  };
  return { store, connect };
}

const SURFACES = ["/mcp", "/mcp/claude"] as const;

describe("submit_research_contribution's published input", () => {
  it.each(SURFACES)("publishes the derived schema exactly on %s, and the description gives every record shape", async (surface) => {
    const server = createAskRigorServer("standard", { mcpSurface: surface });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "contribution-schema-test", version: "1" });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const tool = (await client.listTools()).tools.find(({ name }) => name === "submit_research_contribution")!;
      const relaxed = surface === "/mcp";
      const original = withoutLaterInputs(tool.inputSchema);
      expect(original).toEqual(submitResearchContributionPublishedInputSchema({ relaxed }));
      expect(tool.description).toBe(SUBMIT_RESEARCH_CONTRIBUTION_DESCRIPTION);
      const payload = (tool.inputSchema.properties as Record<string, Record<string, unknown>>).payload!;
      if (relaxed) {
        // ChatGPT's app hides payload's type and nested constraints, so it publishes none.
        expect(payload).toEqual({ description: "The record proposalKind names, shaped as this tool's description shows." });
        expect(JSON.stringify(original)).not.toMatch(/"(?:pattern|format|minLength|maxLength|additionalProperties)"/u);
      } else {
        expect(original).toEqual(z.toJSONSchema(submitResearchContributionInputSchema, { target: "draft-7", io: "input" }));
        expect(payload.anyOf).toEqual([
          z.toJSONSchema(researchFrontierContributionSchema, { target: "draft-7", io: "input" }),
          z.toJSONSchema(livingEvidenceContributionSchema, { target: "draft-7", io: "input" }),
          z.toJSONSchema(topicLinkContributionSchema, { target: "draft-7", io: "input" }),
        ].map(({ $schema: _schema, ...rest }) => rest));
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("names every key and allowed value of every record in the description, descriptively", () => {
    const text = SUBMIT_RESEARCH_CONTRIBUTION_SHAPES_DESCRIPTION;
    for (const [kind, schema] of [
      ["RESEARCH_FRONTIER", researchFrontierContributionSchema],
      ["SOURCE_ANALYSIS", livingEvidenceContributionSchema],
      ["TOPIC_LINK", topicLinkContributionSchema],
    ] as const) {
      const walk = (node: unknown, path: string): void => {
        if (node === null || typeof node !== "object") return;
        const object = node as { properties?: Record<string, unknown>; enum?: unknown[] };
        if (Array.isArray(object.enum) && !["analysis.analysisKind", "source.sourceKind"].includes(path)) {
          expect(text, `${kind} ${path}`).toContain(JSON.stringify(object.enum.join("|")));
        }
        for (const [key, child] of Object.entries(object.properties ?? {})) {
          if (path === "" && key === "knowledge") continue;
          expect(text, `${kind} ${path}.${key}`).toContain(`"${key}":`);
          walk(child, path === "" ? key : `${path}.${key}`);
        }
        for (const [key, child] of Object.entries(node)) if (key !== "properties") walk(child, path);
      };
      walk(z.toJSONSchema(schema, { target: "draft-7", io: "input" }), "");
      expect(text).toContain(`${kind} payload {`);
    }
    expect(text).toContain('"analysisKind":"study_method_audit|review_method_audit"');
    expect(text).toContain('"sourceKind":"study|review"');
    expect(text).toContain('"relation":"same|narrower|broader|related"');
    expect(text).not.toMatch(/\b(?:call|must|always|never|do not|don't)\b/iu);
  });
});

const SENTINELS = ["SENTINEL-TITLE", "SENTINEL-CLAIM", "sentinel.person@example.com", "SENTINEL-FILE", "987654321", "interpretationFindings"];

function malformedSourceAnalysis() {
  // The lesson's shape: documented privacy flags, a free-form findings array, no schemaVersion.
  const payload = structuredClone(CONTRIBUTION_EXAMPLES.SOURCE_ANALYSIS) as Record<string, any>;
  delete payload.schemaVersion;
  payload.interpretationFindings = [{ claim: "SENTINEL-CLAIM" }];
  payload.source.displayTitle = `SENTINEL-TITLE ${"y".repeat(500)}`;
  payload.source.identifiers.push({ scheme: "url", value: "sandbox:/mnt/data/SENTINEL-FILE.json" });
  payload.analysis.coverageStatement = "Write to sentinel.person@example.com";
  payload.analysis.sections[0].ordinal = 987654321.5;
  return payload;
}

describe("submit_research_contribution through MCP on both surfaces", () => {
  it.each(SURFACES)("on %s, answers a malformed record with every problem and files nothing", async (surface) => {
    const { store, connect } = await start();
    const client = await connect(surface);
    const result = await client.callTool({
      name: "submit_research_contribution",
      arguments: { proposalKind: "SOURCE_ANALYSIS", privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE, payload: malformedSourceAnalysis() },
    });
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as {
      ok: boolean; error: { code: string; message: string }; problems: Array<Record<string, string>>; problemsNotShown?: number;
    };
    expect(structured.ok).toBe(false);
    expect(structured.error.code).toBe("contribution_privacy_rejected");
    expect(structured.error.message).toMatch(/^The contribution was not filed: 6 problems were found\. Fix each one/u);
    expect(structured.problems.map(({ path, rule }) => `${path} ${rule}`)).toEqual([
      "payload.analysis.coverageStatement contact_pattern",
      "payload.source.identifiers[1].value sandbox_locator",
      "payload unknown_keys",
      "payload.analysis.sections[0].ordinal wrong_type",
      "payload.schemaVersion missing",
      "payload.source.displayTitle too_long",
    ]);
    expect(structured.problems[4]).toEqual({ path: "payload.schemaVersion", rule: "missing", expected: "exactly 1", example: "1" });
    expect(structured.problemsNotShown).toBeUndefined();
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("5. payload.schemaVersion (missing): expected exactly 1. Example: 1");
    expect(text).toContain("The rules that compare fields with each other run once these are fixed.");
    for (const sentinel of SENTINELS) expect(JSON.stringify(result), sentinel).not.toContain(sentinel);
    expect(store.allProposals()).toHaveLength(0);
  });

  it.each(SURFACES)("on %s, reaches the check with arguments the published schema would refuse", async (surface) => {
    const { connect } = await start();
    const client = await connect(surface);
    const result = await client.callTool({
      name: "submit_research_contribution",
      arguments: { proposalKind: "SOURCE_ANALYSIS", payload: "SENTINEL-NOT-A-RECORD", sentinelExtra: true },
    });
    expect(result.isError).toBe(true);
    expect((result.structuredContent as { problems: Array<{ path: string; rule: string }> }).problems
      .map(({ path, rule }) => `${path} ${rule}`)).toEqual([
      "input unknown_keys",
      "payload wrong_type",
      "privacyBoundary missing",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/SENTINEL|sentinelExtra/u);
  });

  it.each(SURFACES)("on %s, checks a topic link's own fields, and files none without the canonical store", async (surface) => {
    const { store, connect } = await start();
    const client = await connect(surface);
    const self = structuredClone(CONTRIBUTION_EXAMPLES.TOPIC_LINK) as Record<string, unknown>;
    self.toTopic = self.fromTopic;
    const refused = await client.callTool({
      name: "submit_research_contribution",
      arguments: { proposalKind: "TOPIC_LINK", privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE, payload: self },
    });
    expect(refused.isError).toBe(true);
    expect((refused.structuredContent as { problems: Array<{ path: string; rule: string }> }).problems
      .map(({ path, rule }) => `${path} ${rule}`)).toEqual(["payload.toTopic cross_field"]);
    // This server has no canonical reader, so the topics a valid link names cannot be checked.
    const unchecked = await client.callTool({
      name: "submit_research_contribution",
      arguments: { proposalKind: "TOPIC_LINK", privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE, payload: CONTRIBUTION_EXAMPLES.TOPIC_LINK },
    });
    expect(unchecked.isError).toBe(true);
    expect(unchecked.structuredContent).toMatchObject({ ok: false, error: { code: "research_access_service_unavailable" } });
    expect(store.allProposals()).toHaveLength(0);
  });

  it.each(SURFACES)("on %s, files a valid record", async (surface) => {
    const { store, connect } = await start();
    const client = await connect(surface);
    const result = await client.callTool({
      name: "submit_research_contribution",
      arguments: { proposalKind: "RESEARCH_FRONTIER", privacyBoundary: CONTRIBUTION_PRIVACY_BOUNDARY_EXAMPLE, payload: CONTRIBUTION_EXAMPLES.RESEARCH_FRONTIER },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      proposal: { proposalKind: "RESEARCH_FRONTIER", status: "PENDING_REVIEW", writeStatus: "inserted", canonicalEvidenceChanged: false },
    });
    expect(store.allProposals()).toHaveLength(1);
  });
});
