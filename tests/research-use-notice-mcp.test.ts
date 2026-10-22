import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  EARLIER_RESEARCH_USE_NOTICE_VERSIONS,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { RESEARCH_USE_SCOPE, createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// Owner answers 159 (1b and 7) and 160b (2026-10-22): the free contributor notice's third version. A free account that
// accepted an earlier version is shown the current one and accepts it through manage_research_access before free
// research continues, on ChatGPT's connector (/mcp) and on Claude's (/mcp/claude) alike.

type Surface = "/mcp" | "/mcp/claude";
const SURFACES = ["/mcp", "/mcp/claude"] as const;
const primaryResource = new URL("https://mcp.askrigor.example/mcp");
const claudeResource = new URL("https://mcp.askrigor.example/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const V2 = "free-contributor-v2-2026-09-30";
const V3 = "free-contributor-v3-2026-10-22";
const clients: Client[] = [];
const servers: HttpServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const agreement = (noticeVersion: string) => ({
  noticeVersion,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
}) as const;

async function start() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "notice-v3-test-key" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 11) });
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    oauthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: primaryResource, issuerUrl, jwks, allowedClientIds: ["chatgpt-client"],
    }),
    claudeOAuthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: claudeResource, issuerUrl, jwks, allowedClientIds: ["claude-client"],
    }),
    researchContributorAccessService: service,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  const connect = async (surface: Surface, subject: string) => {
    const token = await new SignJWT({
      iss: issuerUrl.href,
      aud: surface === "/mcp" ? primaryResource.href : claudeResource.href,
      exp: Math.floor(Date.now() / 1_000) + 300,
      client_id: surface === "/mcp" ? "chatgpt-client" : "claude-client",
      scope: RESEARCH_USE_SCOPE,
      sub: subject,
    }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
    const client = new Client({ name: "notice-v3-test", version: "1.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(surface, base), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }));
    return client;
  };
  return { store, service, connect };
}

/** A free account as an earlier notice left it: active, under that version's agreement. */
async function seedEarlierAccount(
  store: InMemoryResearchContributorAccessStore,
  service: ResearchContributorAccessService,
  subject: string,
  noticeVersion: (typeof EARLIER_RESEARCH_USE_NOTICE_VERSIONS)[number],
): Promise<void> {
  const at = "2026-10-01T20:30:00.000Z";
  await store.saveAccount({
    accountKey: service.accountKeyForSubject(subject),
    status: "ACTIVE",
    mode: "FREE_CONTRIBUTOR",
    noticeVersion,
    agreement: agreement(noticeVersion),
    activatedAt: at,
    revokedAt: null,
    createdAt: at,
    updatedAt: at,
  });
}

const research = { name: "load_protocol", arguments: { protocol: "universal", section: "index" } };

describe("free contributor notice v3 on both connector surfaces", () => {
  it("is the current notice, after v1 and v2", () => {
    expect(RESEARCH_USE_NOTICE_VERSION).toBe(V3);
    expect(EARLIER_RESEARCH_USE_NOTICE_VERSIONS).toEqual(["free-contributor-v1-2026-09-01", V2]);
  });

  it.each(SURFACES)("on %s, an account that accepted v2 is shown v3 and accepts it before research continues", async (surface) => {
    const { store, service, connect } = await start();
    const subject = `notice-v2-on-${surface}`;
    await seedEarlierAccount(store, service, subject, V2);
    const client = await connect(surface, subject);

    const inspected = await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    expect(inspected.isError).not.toBe(true);
    expect(inspected.structuredContent).toMatchObject({
      ok: true,
      access: { status: "UNENROLLED", mode: null, noticeVersion: V3, notice: RESEARCH_USE_NOTICE },
    });
    expect(RESEARCH_USE_NOTICE).toContain(
      "Findings that AskRigor's owner accepts may be published in AskRigor's public Atlas, written without you.",
    );

    // Research waits for the new notice.
    const refused = await client.callTool(research);
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("AskRigor's free contributor notice has changed.");

    // The notice the account accepted before is refused by naming the current one, and nothing changes.
    const stale = await client.callTool({
      name: "manage_research_access",
      arguments: { action: "accept_free_contributor", agreement: agreement(V2) },
    });
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({ ok: false, error: { code: "research_access_required" } });
    expect((stale.content as Array<{ text: string }>)[0]!.text).toContain(`The current free-use notice is ${V3}, not ${V2}.`);
    expect(store.allAccounts()).toEqual([expect.objectContaining({ noticeVersion: V2 })]);

    const accepted = await client.callTool({
      name: "manage_research_access",
      arguments: { action: "accept_free_contributor", agreement: agreement(V3) },
    });
    expect(accepted.isError).not.toBe(true);
    expect(accepted.structuredContent).toMatchObject({
      ok: true,
      access: { status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: V3, contributionRequired: true },
    });
    expect(store.allAccounts()).toEqual([
      expect.objectContaining({ status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: V3, agreement: agreement(V3) }),
    ]);
    const permitted = await client.callTool(research);
    expect(permitted.isError).not.toBe(true);
  });

  it.each(SURFACES)("on %s, an account that accepted v1 accepts v3 the same way", async (surface) => {
    const { store, service, connect } = await start();
    const subject = `notice-v1-on-${surface}`;
    await seedEarlierAccount(store, service, subject, "free-contributor-v1-2026-09-01");
    const client = await connect(surface, subject);

    expect((await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } })).structuredContent)
      .toMatchObject({ ok: true, access: { status: "UNENROLLED", noticeVersion: V3 } });
    expect((await client.callTool(research)).isError).toBe(true);
    const accepted = await client.callTool({
      name: "manage_research_access",
      arguments: { action: "accept_free_contributor", agreement: agreement(V3) },
    });
    expect(accepted.structuredContent).toMatchObject({ ok: true, access: { status: "ACTIVE", mode: "FREE_CONTRIBUTOR" } });
    expect((await client.callTool(research)).isError).not.toBe(true);
  });
});
