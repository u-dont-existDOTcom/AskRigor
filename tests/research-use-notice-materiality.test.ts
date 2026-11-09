import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EARLIER_RESEARCH_USE_NOTICE_VERSIONS,
  InMemoryResearchContributorAccessStore,
  NOTICE_ACCEPTED_BY,
  RESEARCH_USE_NOTICE_CHANGES,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchUseNoticeCovered,
  type ResearchUseAccountRecord,
  type ResearchUseNoticeChange,
} from "@askrigor/evidence-repository";
// The package as the server imports it (its built entry point), so its errors are the classes the connector maps.
import { RESEARCH_USE_SCOPE, createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// The owner, 6 November 2026: "can we make it so that i don't have to keep accepting the askrigor notice every time you
// update? that's annoying". The owner's own login accepts a new notice by the owner's standing instruction, recorded as
// such; for everyone else a new version asks again only when it collects or publishes more than the one they accepted.

const IDENTITY_SECRET = new TextEncoder().encode("synthetic-notice-materiality-secret-at-least-32-bytes");
const OWNER = "auth0|synthetic-owner-login";
const PERSON = "auth0|synthetic-other-person";
const NOW = "2026-11-07T10:00:00.000Z";
const LATER = "2026-11-07T11:00:00.000Z";
const V4 = "free-contributor-v4-2026-10-25";
const V5 = "free-contributor-v5-2026-11-05";
const STANDING = "OWNER_STANDING_INSTRUCTION_2026_11_06";

const agreement = (noticeVersion: string) => ({
  noticeVersion,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
}) as const;

function fixture(now = () => LATER) {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({
    store, identitySecret: IDENTITY_SECRET, now, ownerSubjects: new Set([OWNER]),
  });
  return { store, service };
}

/** A free account as a person left it under notice v4, before this release. */
function underV4(service: ResearchContributorAccessService, subject: string): ResearchUseAccountRecord {
  return {
    accountKey: service.accountKeyForSubject(subject), status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: V4,
    agreement: agreement(V4) as never, activatedAt: NOW, revokedAt: null, createdAt: NOW, updatedAt: NOW,
    noticeAcceptedBy: "PERSON",
  };
}

const change = (version: string, material: boolean): ResearchUseNoticeChange =>
  ({ version, material, change: "synthetic" }) as ResearchUseNoticeChange;

describe("each notice version declares whether it is material", () => {
  it("lists every version the access schema admits, once and in order, ending with the current notice", () => {
    expect(RESEARCH_USE_NOTICE_CHANGES.map(({ version }) => version))
      .toEqual([...EARLIER_RESEARCH_USE_NOTICE_VERSIONS, RESEARCH_USE_NOTICE_VERSION]);
    for (const entry of RESEARCH_USE_NOTICE_CHANGES) {
      expect(typeof entry.material).toBe("boolean");
      expect(entry.change.trim().length).toBeGreaterThan(10);
    }
    // Every version so far collected or published more than the one before it.
    expect(RESEARCH_USE_NOTICE_CHANGES.every(({ material }) => material)).toBe(true);
    expect(Object.isFrozen(RESEARCH_USE_NOTICE_CHANGES)).toBe(true);
    expect(NOTICE_ACCEPTED_BY).toEqual(["PERSON", STANDING]);
  });

  it("covers a yes only when no version after it is material", () => {
    expect(researchUseNoticeCovered(RESEARCH_USE_NOTICE_VERSION)).toBe(true);
    for (const earlier of EARLIER_RESEARCH_USE_NOTICE_VERSIONS) expect(researchUseNoticeCovered(earlier)).toBe(false);
    for (const unknown of [null, undefined, "", "free-contributor-v9-2027-01-01"]) {
      expect(researchUseNoticeCovered(unknown)).toBe(false);
    }
    // A wording-only version carries an earlier yes forward; a material one after it asks again.
    const reworded = [change("a", true), change("b", true), change("c", false)];
    expect(["a", "b", "c"].map((version) => researchUseNoticeCovered(version, reworded))).toEqual([false, true, true]);
    const thenMore = [...reworded, change("d", true), change("e", false)];
    expect(["a", "b", "c", "d", "e"].map((version) => researchUseNoticeCovered(version, thenMore)))
      .toEqual([false, false, false, true, true]);
  });
});

describe("the owner's standing instruction (6 November 2026)", () => {
  it("accepts a new material notice for the owner's own login, and records what, when and how", async () => {
    const { store, service } = fixture();
    await store.saveAccount(underV4(service, OWNER));
    const view = await service.inspect(OWNER);
    expect(view).toMatchObject({
      status: "ACTIVE", mode: "FREE_CONTRIBUTOR", noticeVersion: V5,
      acceptance: { noticeVersion: V5, acceptedAt: LATER, acceptedBy: STANDING, current: "accepted" },
    });
    expect(store.allAccounts()).toEqual([expect.objectContaining({
      accountKey: service.accountKeyForSubject(OWNER), noticeVersion: V5, agreement: agreement(V5),
      activatedAt: LATER, updatedAt: LATER, createdAt: NOW, noticeAcceptedBy: STANDING,
    })]);
    await expect(service.requireActive(OWNER)).resolves.toBe("FREE_CONTRIBUTOR");
    // Once on the current notice, nothing more is written.
    const later = fixture(() => "2026-11-08T00:00:00.000Z");
    await later.store.saveAccount(store.allAccounts()[0]!);
    await later.service.inspect(OWNER);
    expect(later.store.allAccounts()[0]).toMatchObject({ updatedAt: LATER, noticeAcceptedBy: STANDING });
  });

  it("never treats another person's account as the owner's", async () => {
    const { store, service } = fixture();
    // A subject that differs from the owner's in any way, case included, is another person's account.
    const others = [PERSON, `${OWNER}x`, OWNER.toUpperCase(), OWNER.replace("auth0|", "google-oauth2|")];
    for (const subject of others) await store.saveAccount(underV4(service, subject));
    for (const subject of others) {
      expect(await service.inspect(subject)).toMatchObject({ status: "UNENROLLED", mode: null });
      await expect(service.requireActive(subject)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
      await expect(service.activeAccount(subject)).rejects.toMatchObject({ code: "RESEARCH_ACCESS_REQUIRED" });
    }
    expect(store.allAccounts()).toHaveLength(others.length);
    expect(store.allAccounts().every(({ noticeVersion, noticeAcceptedBy, updatedAt }) =>
      noticeVersion === V4 && noticeAcceptedBy === "PERSON" && updatedAt === NOW)).toBe(true);
    // Without owner subjects, not even the owner's login is accepted for.
    const plain = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET, now: () => LATER });
    await store.saveAccount(underV4(plain, OWNER));
    expect(await plain.inspect(OWNER)).toMatchObject({ status: "UNENROLLED" });
  });

  it("leaves the owner's revoked, paid private and never-enrolled logins as they are", async () => {
    const { store, service } = fixture();
    expect(await service.inspect(OWNER)).toMatchObject({ status: "UNENROLLED" });
    expect(store.allAccounts()).toEqual([]);
    await store.saveAccount({ ...underV4(service, OWNER), status: "REVOKED", mode: null, noticeVersion: null,
      agreement: null, activatedAt: null, revokedAt: NOW, noticeAcceptedBy: null });
    expect(await service.inspect(OWNER)).toMatchObject({ status: "REVOKED" });
    expect(store.allAccounts()[0]).toMatchObject({ status: "REVOKED", updatedAt: NOW });
    await store.saveAccount({ ...underV4(service, OWNER), mode: "PAID_PRIVATE", noticeVersion: null, agreement: null,
      noticeAcceptedBy: null });
    expect((await service.inspect(OWNER)).acceptance).toBeUndefined();
    expect(store.allAccounts()[0]).toMatchObject({ mode: "PAID_PRIVATE", updatedAt: NOW });
  });

  it("records a person's own yes as theirs, and shows an unrecorded way of acceptance as unknown", async () => {
    const { store, service } = fixture();
    const accepted = await service.acceptFreeContributor(PERSON, agreement(V5));
    expect(accepted.acceptance).toEqual({ noticeVersion: V5, acceptedAt: LATER, acceptedBy: "PERSON", current: "accepted" });
    expect(store.allAccounts()[0]).toMatchObject({ noticeAcceptedBy: "PERSON" });
    await store.saveAccount({ ...store.allAccounts()[0]!, noticeAcceptedBy: null });
    expect((await service.inspect(PERSON)).acceptance).toEqual({
      noticeVersion: V5, acceptedAt: LATER, acceptedBy: null, current: "accepted",
    });
    await service.revoke(PERSON);
    expect(store.allAccounts()[0]).toMatchObject({ status: "REVOKED", noticeAcceptedBy: null });
  });
});

// Through the connector, on ChatGPT's surface and on Claude's: the owner's login researches on without being shown the
// notice, and inspect says how the notice was accepted; another person's login is asked as before.
const primaryResource = new URL("https://mcp.askrigor.example/mcp");
const claudeResource = new URL("https://mcp.askrigor.example/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const servers: HttpServer[] = [];
const clients: Client[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("the owner's login through the connector", () => {
  it.each(["/mcp", "/mcp/claude"] as const)("researches on %s without the notice, and inspect says why", async (surface) => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "notice-materiality-key" };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const { store, service } = fixture();
    await store.saveAccount(underV4(service, OWNER));
    await store.saveAccount(underV4(service, PERSON));
    const server = createAskRigorHttpServer({
      publicServerEnabled: true,
      oauthResourceServer: createJwtOAuthResourceServer({
        resourceUrl: primaryResource, issuerUrl, jwks, allowedClientIds: ["chatgpt-client"], reviewerSubjects: [OWNER],
      }),
      claudeOAuthResourceServer: createJwtOAuthResourceServer({
        resourceUrl: claudeResource, issuerUrl, jwks, allowedClientIds: ["claude-client"], reviewerSubjects: [OWNER],
      }),
      researchContributorAccessService: service,
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const connect = async (subject: string) => {
      const token = await new SignJWT({
        iss: issuerUrl.href, aud: surface === "/mcp" ? primaryResource.href : claudeResource.href,
        exp: Math.floor(Date.now() / 1_000) + 300, client_id: surface === "/mcp" ? "chatgpt-client" : "claude-client",
        scope: RESEARCH_USE_SCOPE, sub: subject,
      }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
      const client = new Client({ name: "notice-materiality-test", version: "1.0.0" });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(surface, base), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }));
      return client;
    };
    const research = { name: "load_protocol", arguments: { protocol: "universal", section: "index" } };

    const owner = await connect(OWNER);
    expect((await owner.callTool(research)).isError).not.toBe(true);
    const inspected = await owner.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    expect(inspected.structuredContent).toMatchObject({
      ok: true, access: { status: "ACTIVE", acceptance: { noticeVersion: V5, acceptedBy: STANDING, current: "accepted" } },
    });
    expect(inspected.structuredContent).not.toHaveProperty("next_step");
    expect((inspected.content as Array<{ text: string }>)[0]!.text).toContain(
      `The owner's standing instruction of 6 November 2026 accepted notice ${V5} for this login at ${LATER}.`);

    const person = await connect(PERSON);
    const refused = await person.callTool(research);
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("It now collects or publishes more than the notice this account accepted");
    const asked = await person.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    expect(asked.structuredContent).toMatchObject({ access: { status: "UNENROLLED" }, next_step: expect.any(String) });
    expect(store.allAccounts().find(({ accountKey }) => accountKey === service.accountKeyForSubject(PERSON)))
      .toMatchObject({ noticeVersion: V4, noticeAcceptedBy: "PERSON" });
  }, 30_000);
});
