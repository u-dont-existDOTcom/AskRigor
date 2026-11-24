import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  InMemoryResearchContributorAccessStore,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import type { GeminiSignIn } from "../apps/research-mcp/src/gemini-sign-in/index.js";
import {
  countGeminiLinks,
  disconnectGeminiLinks,
} from "../apps/research-mcp/src/gemini-sign-in/resource.js";
import {
  RESEARCH_USE_SCOPE,
  createJwtOAuthResourceServer,
} from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import {
  Browser,
  GOOGLE_REDIRECT,
  PERSON,
  clientAssertion,
  linkToCode,
  startGeminiFixture,
  tokenRequest,
  type GeminiFixture,
} from "./helpers/gemini-sign-in-fixture.js";

// /mcp/gemini with AskRigor's own authorization server (owner answer 386b): Gemini's tokens work there and only there,
// a refused token gets a transport 401 naming the Gemini resource metadata, /mcp and /mcp/claude are unchanged.
const primaryResource = new URL("https://mcp.askrigor.com/mcp");
const claudeResource = new URL("https://mcp.askrigor.com/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const GEMINI_METADATA = "https://mcp.askrigor.com/.well-known/oauth-protected-resource/mcp/gemini";
const clients: Client[] = [];
const servers: HttpServer[] = [];
const fixtures: GeminiFixture[] = [];
/** The token checks /mcp/gemini reported to the step log, in order (state, then MCP method). */
const resourceChecks: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
  resourceChecks.length = 0;
});

async function start(options: { gemini: boolean }) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "gemini-server-test" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const signAuth0 = (claims: Record<string, unknown>) => new SignJWT({
    iss: issuerUrl.href, aud: primaryResource.href, exp: Math.floor(Date.now() / 1_000) + 300,
    client_id: "chatgpt-client", scope: RESEARCH_USE_SCOPE, sub: PERSON, ...claims,
  }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
  const fixture = await startGeminiFixture();
  fixtures.push(fixture);
  const geminiSignIn: GeminiSignIn = {
    server: fixture.server,
    routes: fixture.routes,
    links: {
      count: (subject) => countGeminiLinks(fixture.server, subject),
      disconnect: (subject) => disconnectGeminiLinks(fixture.server, subject),
    },
    noteResourceCheck: (signIn, body) => {
      resourceChecks.push(`${signIn?.state ?? "none"} ${(body as { method?: string } | undefined)?.method ?? "none"}`);
    },
    stop: () => undefined,
  };
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    oauthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: primaryResource, issuerUrl, jwks, allowedClientIds: ["chatgpt-client"], reviewerSubjects: ["owner"],
    }),
    claudeOAuthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: claudeResource, issuerUrl, jwks, allowedClientIds: ["claude-client"], reviewerSubjects: ["owner"],
    }),
    geminiSignIn: options.gemini ? geminiSignIn : null,
    researchContributorAccessService: new ResearchContributorAccessService({
      store: new InMemoryResearchContributorAccessStore(),
      identitySecret: Buffer.alloc(32, 7),
    }),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  return { base, fixture, signAuth0 };
}

async function geminiToken(fixture: GeminiFixture): Promise<string> {
  const { code, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl));
  const response = await tokenRequest(fixture, {
    grant_type: "authorization_code", code, redirect_uri: GOOGLE_REDIRECT, code_verifier: verifier,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: await clientAssertion(fixture),
  });
  return (await response.json() as { access_token: string }).access_token;
}

async function connect(base: URL, path: string, bearer?: string) {
  const client = new Client({ name: "gemini-sign-in-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(
    new URL(path, base),
    bearer === undefined ? undefined : { requestInit: { headers: { authorization: `Bearer ${bearer}` } } },
  ));
  return client;
}

const initialize = (bearer?: string) => ({
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
  },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
  }),
});

const text = (result: unknown) => JSON.stringify((result as { content: unknown }).content);

describe("Gemini's sign-in on the HTTP server", () => {
  it("serves nothing new when it is off", async () => {
    const { base } = await start({ gemini: false });
    for (const path of ["/.well-known/oauth-protected-resource/mcp/gemini", "/oauth/gemini/auth",
      "/.well-known/oauth-authorization-server/oauth/gemini", "/oauth/gemini/.well-known/openid-configuration"]) {
      expect((await fetch(new URL(path, base))).status, path).toBe(404);
    }
  });

  it("publishes /mcp/gemini's resource metadata and the authorization server's metadata", async () => {
    const { base } = await start({ gemini: true });
    const resource = await fetch(new URL("/.well-known/oauth-protected-resource/mcp/gemini", base));
    expect(resource.status).toBe(200);
    expect((await resource.json() as { authorization_servers: string[] }).authorization_servers)
      .toEqual(["https://mcp.askrigor.com/oauth/gemini"]);
    const metadata = await fetch(new URL("/.well-known/oauth-authorization-server/oauth/gemini", base));
    expect((await metadata.json() as { issuer: string }).issuer).toBe("https://mcp.askrigor.com/oauth/gemini");
    // /mcp keeps Auth0.
    const primary = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", base));
    expect((await primary.json() as { authorization_servers: string[] }).authorization_servers).toEqual([issuerUrl.href]);
  });

  it("keeps /mcp/gemini open without a token, and answers a refused token with a 401 naming Gemini's metadata", async () => {
    const { base } = await start({ gemini: true });
    expect((await fetch(new URL("/mcp/gemini", base), initialize())).status).toBe(200);
    for (const bearer of ["not-a-real-token-but-long-enough-0123456789abcdef", "a.b.c"]) {
      const response = await fetch(new URL("/mcp/gemini", base), initialize(bearer));
      expect(response.status, bearer).toBe(401);
      const challenge = response.headers.get("www-authenticate") ?? "";
      expect(challenge).toContain(`resource_metadata="${GEMINI_METADATA}"`);
      expect(challenge).toContain('scope="research:use"');
    }
    // Each call's token check reaches the step log (which writes only the calls that carried a token).
    expect(resourceChecks).toEqual(["absent initialize", "refused initialize", "refused initialize"]);
  });

  it("gives a Gemini token's person to the research tools on /mcp/gemini, with Gemini's own notice guidance", async () => {
    const { base, fixture } = await start({ gemini: true });
    const client = await connect(base, "/mcp/gemini", await geminiToken(fixture));
    const result = await client.callTool({ name: "search_pubmed", arguments: { query: "creatine" } });
    const shown = text(result);
    // The sign-in was accepted (no sign-in refusal) and reached the account check of this person's account.
    expect(shown).toContain("Choose free contributor mode");
    expect(shown).not.toContain("refused this call's sign-in");
    expect(shown).toContain("This connector can't show AskRigor's research notice");
    expect(shown).toContain("https://askrigor.com/add");
    expect(shown).not.toContain("Call manage_research_access");
  });

  it("refuses a Gemini token on /mcp and /mcp/claude", async () => {
    const { base, fixture } = await start({ gemini: true });
    const token = await geminiToken(fixture);
    expect((await fetch(new URL("/mcp/claude", base), initialize(token))).status).toBe(401);
    const client = await connect(base, "/mcp", token);
    const shown = text(await client.callTool({ name: "search_pubmed", arguments: { query: "creatine" } }));
    expect(shown).toContain("refused this call's sign-in");
  });

  it("still accepts /mcp's Auth0 tokens on /mcp/gemini, as before", async () => {
    const { base, signAuth0 } = await start({ gemini: true });
    const client = await connect(base, "/mcp/gemini", await signAuth0({}));
    const shown = text(await client.callTool({ name: "search_pubmed", arguments: { query: "creatine" } }));
    expect(shown).toContain("Choose free contributor mode");
    expect(shown).not.toContain("refused this call's sign-in");
  });

  it("lets the person see and end their Gemini links from any connected app (disconnect_gemini)", async () => {
    const { base, fixture, signAuth0 } = await start({ gemini: true });
    const token = await geminiToken(fixture);
    const client = await connect(base, "/mcp", await signAuth0({}));
    const inspected = await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    expect(text(inspected)).toContain("connected to Google Gemini (one link)");
    expect((inspected.structuredContent as { geminiLinks?: number }).geminiLinks).toBe(1);
    const ended = await client.callTool({ name: "manage_research_access", arguments: { action: "disconnect_gemini" } });
    expect((ended.structuredContent as { geminiLinksEnded?: number }).geminiLinksEnded).toBe(1);
    expect((await fetch(new URL("/mcp/gemini", base), initialize(token))).status).toBe(401);
    const again = await client.callTool({ name: "manage_research_access", arguments: { action: "disconnect_gemini" } });
    expect(text(again)).toContain("no Gemini link to end");
  });
});
