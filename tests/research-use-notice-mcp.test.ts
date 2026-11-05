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
import { afterEach, describe, expect, it, vi } from "vitest";

import { RESEARCH_USE_SCOPE, createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// Owner answer 171 (2026-10-25): the free contributor notice's fourth version. A free account that
// accepted an earlier version is shown the current one and accepts it through manage_research_access before free
// research continues, on ChatGPT's connector (/mcp) and on Claude's (/mcp/claude) alike.

type Surface = "/mcp" | "/mcp/claude";
const SURFACES = ["/mcp", "/mcp/claude"] as const;
const primaryResource = new URL("https://mcp.askrigor.example/mcp");
const claudeResource = new URL("https://mcp.askrigor.example/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const V2 = "free-contributor-v2-2026-09-30";
const V3 = "free-contributor-v3-2026-10-22";
const V4 = "free-contributor-v4-2026-10-25";
const V5 = "free-contributor-v5-2026-11-05";
const clients: Client[] = [];
const servers: HttpServer[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
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
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "notice-v5-test-key" };
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
    const client = new Client({ name: "notice-v5-test", version: "1.0.0" });
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

// Owner answer 253a (2026-11-05): version 5, whose card summary of what communities reported holds the forum threads'
// links; every earlier account, v4's included, accepts it before free research continues.
describe("free contributor notice v5 on both connector surfaces", () => {
  it("is the current notice, after v1, v2, v3 and v4", () => {
    expect(RESEARCH_USE_NOTICE_VERSION).toBe(V5);
    expect(EARLIER_RESEARCH_USE_NOTICE_VERSIONS).toEqual(["free-contributor-v1-2026-09-01", V2, V3, V4]);
  });

  it.each(SURFACES.flatMap((surface) => EARLIER_RESEARCH_USE_NOTICE_VERSIONS.map((earlier) => [surface, earlier] as const)))(
    "on %s, an account that accepted %s is shown v5 and accepts it before research continues", async (surface, earlier) => {
      const { store, service, connect } = await start();
      const subject = `${earlier}-on-${surface}`;
      await seedEarlierAccount(store, service, subject, earlier);
      const client = await connect(surface, subject);

      const inspected = await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
      expect(inspected.isError).not.toBe(true);
      expect(inspected.structuredContent).toMatchObject({
        ok: true,
        access: { status: "UNENROLLED", mode: null, noticeVersion: V5, notice: RESEARCH_USE_NOTICE },
      });
      expect(RESEARCH_USE_NOTICE).toContain("links to the forum threads AskRigor read, never YouTube comments or video IDs.");
      expect(RESEARCH_USE_NOTICE).toContain(
        "Your findings cards are published in AskRigor's public Atlas as soon as they are saved, written without you and marked \"Not checked by supervisors yet\" until AskRigor's owner has reviewed them, and people who sign in can vote and comment on them.",
      );

      // Research waits for the new notice.
      const refused = await client.callTool(research);
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused.content)).toContain("AskRigor's free contributor notice has changed.");

      // The notice the account accepted before is refused by naming the current one, and nothing changes.
      const stale = await client.callTool({
        name: "manage_research_access",
        arguments: { action: "accept_free_contributor", agreement: agreement(earlier) },
      });
      expect(stale.isError).toBe(true);
      expect(stale.structuredContent).toMatchObject({ ok: false, error: { code: "research_access_required" } });
      expect((stale.content as Array<{ text: string }>)[0]!.text).toContain(`The current free-use notice is ${V5}, not ${earlier}.`);
      expect(store.allAccounts()).toEqual([expect.objectContaining({ noticeVersion: earlier })]);

      const accepted = await client.callTool({
        name: "manage_research_access",
        arguments: { action: "accept_free_contributor", agreement: agreement(V5) },
      });
      expect(accepted.isError).not.toBe(true);
      expect(accepted.structuredContent).toMatchObject({
        ok: true,
        access: { status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: V5, contributionRequired: true },
      });
      expect(store.allAccounts()).toEqual([
        expect.objectContaining({ status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: V5, agreement: agreement(V5) }),
      ]);
      const permitted = await client.callTool(research);
      expect(permitted.isError).not.toBe(true);
    },
  );

  // The review of 5 November (finding 5): switching card saving off publishes nothing, so a dev account still on an
  // earlier notice (the owner's login, the regression harness) switches it off before it accepts v5; switching it on
  // waits for v5, since a saved card may be published.
  it.each(SURFACES)("on %s, a dev account still on v4 switches card saving off, and back on only after accepting v5",
    async (surface) => {
      const { store, service, connect } = await start();
      const subject = `dev-on-${surface}`;
      await seedEarlierAccount(store, service, subject, V4);
      vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", service.accountKeyForSubject(subject));
      const client = await connect(surface, subject);
      const setSaving = async (findingsSave: boolean) =>
        await client.callTool({ name: "manage_research_access", arguments: { action: "set_findings_save", findingsSave } });

      const off = await setSaving(false);
      expect(off.isError).not.toBe(true);
      expect(off.structuredContent).toEqual({ ok: true, findingsSave: false });
      expect(store.allAccounts()).toEqual([expect.objectContaining({ noticeVersion: V4, findingsSave: false })]);

      const on = await setSaving(true);
      expect(on.isError).toBe(true);
      expect(on.structuredContent).toMatchObject({ ok: false, error: { code: "research_access_required" } });
      expect(JSON.stringify(on.content)).toContain("AskRigor's free contributor notice has changed.");
      expect(store.allAccounts()).toEqual([expect.objectContaining({ noticeVersion: V4, findingsSave: false })]);

      const accepted = await client.callTool({ name: "manage_research_access",
        arguments: { action: "accept_free_contributor", agreement: agreement(V5) } });
      expect(accepted.isError).not.toBe(true);
      // Accepting the notice leaves the setting as it was, so nothing is saved, or published, until it is switched on.
      expect(store.allAccounts()).toEqual([expect.objectContaining({ noticeVersion: V5, findingsSave: false })]);
      expect((await setSaving(true)).structuredContent).toEqual({ ok: true, findingsSave: true });
    },
  );
});
