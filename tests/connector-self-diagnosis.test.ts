import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from
  "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  CASE_REVIEW_SCOPE,
  RESEARCH_USE_SCOPE,
  attachOptionalOAuthIdentity,
  createJwtOAuthResourceServer,
} from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer, createAskRigorServer } from
  "../apps/research-mcp/src/server.js";

// Owner reports, 2026-10-03 and 2026-10-06: in ChatGPT every research call
// failed as "The tool failed internally" while get_protocol_manifest worked, so
// neither the user nor the model could see why. A refusal now names its cause,
// and the manifest, which needs no sign-in, reports the connection's state.

const resourceUrl = new URL("https://mcp.askrigor.example/mcp");
const issuerUrl = new URL("https://identity.askrigor.example/");
const CLIENT = "https://chatgpt.example/oauth/client.json";
const clients: Client[] = [];
const servers: HttpServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = { ...(await exportJWK(publicKey)), kid: "test-key" };
  const other = await generateKeyPair("RS256");
  const now = Math.floor(Date.now() / 1_000);
  const sign = (claims: Record<string, unknown>, key = privateKey) => new SignJWT({
    iss: issuerUrl.href,
    aud: resourceUrl.href,
    exp: now + 300,
    client_id: CLIENT,
    scope: RESEARCH_USE_SCOPE,
    sub: "auth0|research-user",
    ...claims,
  }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(key);
  return { jwks: createLocalJWKSet({ keys: [publicJwk] }), sign, otherKey: other.privateKey, now };
}

function config(jwks: JWTVerifyGetKey) {
  return createJwtOAuthResourceServer({ resourceUrl, issuerUrl, jwks, allowedClientIds: [CLIENT] });
}

function request(token?: string): IncomingMessage {
  return { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } } as IncomingMessage;
}

describe("sign-in refusal classes", () => {
  it("says whether a token was absent, accepted, or refused and why, from exact error identities", async () => {
    const { jwks, sign, otherKey, now } = await keys();
    const server = config(jwks);
    const state = (token?: string) => attachOptionalOAuthIdentity(request(token), server);

    expect(await attachOptionalOAuthIdentity(request("x"), undefined)).toBeUndefined();
    expect(await state()).toEqual({ state: "absent" });
    expect(await state(await sign({}))).toEqual({ state: "accepted" });
    const cases: Array<[string, string]> = [
      [await sign({ exp: now - 60 }), "expired"],
      [await sign({ aud: "https://other.example/api" }), "wrong_audience"],
      [await sign({ iss: "https://other-identity.example/" }), "wrong_issuer"],
      [await sign({}, otherKey), "bad_signature"],
      [await sign({ client_id: "some-other-app" }), "client_not_allowed"],
      // An opaque token, as an authorization server issues when the sign-in did not ask for this API.
      ["opaque-token-value", "not_a_signed_token"],
    ];
    for (const [token, refusal] of cases) {
      expect(await state(token), refusal).toEqual({ state: "refused", refusal });
    }
    const unreachable = config(async () => {
      throw new Error("network down");
    });
    expect(await attachOptionalOAuthIdentity(request(await sign({})), unreachable))
      .toEqual({ state: "refused", refusal: "unverifiable" });
  });
});

describe("connection status through /mcp", () => {
  async function start() {
    const { jwks, sign } = await keys();
    const server = createAskRigorHttpServer({
      publicServerEnabled: true,
      oauthResourceServer: config(jwks),
      researchContributorAccessService: new ResearchContributorAccessService({
        store: new InMemoryResearchContributorAccessStore(),
        identitySecret: Buffer.alloc(32, 7),
      }),
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const connect = async (token?: string) => {
      const client = new Client({ name: "self-diagnosis-test", version: "1.0.0" });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(
        new URL("/mcp", base),
        token === undefined ? undefined : { requestInit: { headers: { authorization: `Bearer ${token}` } } },
      ));
      return client;
    };
    return { sign, connect };
  }

  const manifest = (client: Client) => client.callTool({ name: "get_protocol_manifest", arguments: { protocol: "hrp" } });
  const research = (client: Client) => client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "index" } });
  const text = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.stringify(result.content);

  it("reports a missing sign-in in the manifest and in each refused research call", async () => {
    const { connect } = await start();
    const client = await connect();

    const result = await manifest(client);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      connection: { sign_in: "absent", research_access: "sign_in_needed" },
    });
    expect(text(result)).toContain("Research tools will be refused for this connection: This call carried no AskRigor sign-in.");
    const refused = await research(client);
    expect(refused.isError).toBe(true);
    expect(text(refused)).toContain("This call carried no AskRigor sign-in");
  });

  it("names why a sent sign-in was refused", async () => {
    const { connect, sign } = await start();
    const client = await connect(await sign({ client_id: "some-other-app" }));

    expect((await manifest(client)).structuredContent).toMatchObject({
      connection: { sign_in: "refused", sign_in_refusal: "client_not_allowed", research_access: "sign_in_needed" },
    });
    expect(text(await research(client))).toContain("AskRigor refused this call's sign-in (client_not_allowed)");
  });

  it("follows the research mode from not chosen to ready, and flags a missing permission", async () => {
    const { connect, sign } = await start();
    const client = await connect(await sign({}));

    const before = await manifest(client);
    expect(before.structuredContent).toMatchObject({
      connection: { sign_in: "accepted", research_access: "mode_not_chosen" },
    });
    expect((before.structuredContent as { connection: { next_step: string } }).connection.next_step)
      .toContain("Call manage_research_access with action inspect");
    expect(text(await research(client))).toContain("Call manage_research_access with action inspect");

    await client.callTool({
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
    const after = await manifest(client);
    expect(after.structuredContent).toMatchObject({ connection: { sign_in: "accepted", research_access: "ready" } });
    expect((after.structuredContent as { connection: Record<string, unknown> }).connection).not.toHaveProperty("next_step");
    expect(text(after)).toContain("Research tools: ready for this connection.");
    expect((await research(client)).isError).not.toBe(true);

    const unscoped = await connect(await sign({ scope: CASE_REVIEW_SCOPE }));
    expect((await manifest(unscoped)).structuredContent).toMatchObject({
      connection: { sign_in: "accepted", research_access: "permission_missing" },
    });
  });

  it("adds no connection status where the server has no sign-in", async () => {
    const server = createAskRigorServer();
    const client = new Client({ name: "no-oauth", version: "1.0.0" });
    clients.push(client);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await manifest(client);
    expect(result.structuredContent).toMatchObject({ ok: true, protocol: "hrp" });
    expect(result.structuredContent).not.toHaveProperty("connection");
  });
});
