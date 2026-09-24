import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from
  "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import {
  InMemoryResearchContributorAccessStore,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it } from "vitest";

import {
  CASE_REVIEW_SCOPE,
  RESEARCH_USE_SCOPE,
  claudeOAuthResourceServerFromEnv,
  createJwtOAuthResourceServer,
} from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

// The Claude custom connector gets its own resource (/mcp/claude): its own audience,
// its own OAuth client, research:use only, no case review, and a transport-level 401
// so Claude starts OAuth. The existing /mcp surface (ChatGPT) must be unchanged.
const primaryResource = new URL("https://mcp.askrigor.example/mcp");
const claudeResource = new URL("https://mcp.askrigor.example/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const clients: Client[] = [];
const servers: HttpServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = await exportJWK(publicKey);
  jwk.kid = "claude-connector-test-key";
  const sign = (claims: Record<string, unknown>) => new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .sign(privateKey);
  return { jwks: createLocalJWKSet({ keys: [jwk] }), sign };
}

function token(sign: (claims: Record<string, unknown>) => Promise<string>, overrides: Record<string, unknown> = {}) {
  return sign({
    iss: issuerUrl.href,
    aud: claudeResource.href,
    exp: Math.floor(Date.now() / 1_000) + 300,
    client_id: "claude-client",
    scope: RESEARCH_USE_SCOPE,
    sub: "owner",
    ...overrides,
  });
}

async function start(options: { claude: boolean }) {
  const { jwks, sign } = await keys();
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    oauthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: primaryResource, issuerUrl, jwks,
      allowedClientIds: ["chatgpt-client"], reviewerSubjects: ["owner"],
    }),
    claudeOAuthResourceServer: options.claude
      ? createJwtOAuthResourceServer({
        resourceUrl: claudeResource, issuerUrl, jwks,
        allowedClientIds: ["claude-client"], reviewerSubjects: [],
        scopesSupported: [RESEARCH_USE_SCOPE],
      })
      : null,
    researchContributorAccessService: new ResearchContributorAccessService({
      store: new InMemoryResearchContributorAccessStore(),
      identitySecret: Buffer.alloc(32, 7),
    }),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  return { base, sign };
}

const initialize = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

function post(base: URL, path: string, bearer?: string) {
  return fetch(new URL(path, base), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(initialize),
  });
}

async function connect(base: URL, path: string, bearer?: string) {
  const client = new Client({ name: "claude-connector-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(
    new URL(path, base),
    bearer === undefined ? undefined : { requestInit: { headers: { authorization: `Bearer ${bearer}` } } },
  ));
  return client;
}

describe("Claude custom-connector surface", () => {
  it("does not exist unless configured", async () => {
    const { base } = await start({ claude: false });
    expect((await post(base, "/mcp/claude")).status).toBe(404);
    expect((await fetch(new URL("/.well-known/oauth-protected-resource/mcp/claude", base))).status).toBe(404);
  });

  it("publishes its own metadata: exact resource, research:use only", async () => {
    const { base } = await start({ claude: true });
    const response = await fetch(new URL("/.well-known/oauth-protected-resource/mcp/claude", base));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: claudeResource.href,
      authorization_servers: [issuerUrl.href],
      scopes_supported: [RESEARCH_USE_SCOPE],
    });
  });

  it("challenges with HTTP 401 and a resource_metadata pointer when the bearer is missing or wrong", async () => {
    const { base, sign } = await start({ claude: true });
    const bad = [
      undefined,
      "not-a-jwt",
      await token(sign, { client_id: "chatgpt-client" }),
      await token(sign, { aud: primaryResource.href }),
      await token(sign, { exp: Math.floor(Date.now() / 1_000) - 30 }),
      await token(sign, { iss: "https://other-issuer.example/" }),
    ];
    for (const bearer of bad) {
      const response = await post(base, "/mcp/claude", bearer);
      expect(response.status, String(bearer)).toBe(401);
      const challenge = response.headers.get("www-authenticate") ?? "";
      expect(challenge).toContain('Bearer error="invalid_token"');
      expect(challenge).toContain('resource_metadata="https://mcp.askrigor.example/.well-known/oauth-protected-resource/mcp/claude"');
      expect(challenge).toContain(`scope="${RESEARCH_USE_SCOPE}"`);
    }
  });

  it("serves the standard catalog to a valid Claude token", async () => {
    const { base, sign } = await start({ claude: true });
    const client = await connect(base, "/mcp/claude", await token(sign));
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("manage_research_access");
  });

  it("never grants owner case review through the Claude surface, even with cases:review in the token", async () => {
    const { base, sign } = await start({ claude: true });
    const client = await connect(base, "/mcp/claude", await token(sign, { scope: `${RESEARCH_USE_SCOPE} ${CASE_REVIEW_SCOPE}` }));
    const result = await client.callTool({ name: "review_evidence_gap_submissions", arguments: { gap_slug: "prolactinoma-spontaneous-remission" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("not an allowed AskRigor case reviewer");
  });

  it("leaves /mcp unchanged: anonymous initialize still works and a Claude token is not accepted there", async () => {
    const { base, sign } = await start({ claude: true });
    expect((await post(base, "/mcp")).status).toBe(200);
    const client = await connect(base, "/mcp", await token(sign, { aud: primaryResource.href }));
    const result = await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Connect an AskRigor account");
  });
});

describe("primary /mcp surface with the Claude surface enabled", () => {
  it("still authenticates the primary client exactly as before", async () => {
    const { base, sign } = await start({ claude: true });
    const client = await connect(base, "/mcp", await token(sign, { aud: primaryResource.href, client_id: "chatgpt-client" }));
    const result = await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    expect(JSON.stringify(result.content)).not.toContain("Connect an AskRigor account");
  });
});

describe("claudeOAuthResourceServerFromEnv", () => {
  const base = {
    ASKRIGOR_OAUTH_ENABLED: "true",
    ASKRIGOR_OAUTH_ISSUER_URL: issuerUrl.href,
    ASKRIGOR_OAUTH_JWKS_URL: "https://identity.askrigor.example/.well-known/jwks.json",
  };

  it("is off unless the Claude client is configured", () => {
    expect(claudeOAuthResourceServerFromEnv(base)).toBeUndefined();
    expect(claudeOAuthResourceServerFromEnv({ ...base, ASKRIGOR_OAUTH_ENABLED: "false", ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID: "c" })).toBeUndefined();
  });

  it("requires an https /mcp/claude resource and a well-formed client id", () => {
    const ok = claudeOAuthResourceServerFromEnv({
      ...base, ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID: "claude-client", ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL: claudeResource.href,
    });
    expect(ok?.resourceUrl.href).toBe(claudeResource.href);
    expect(ok?.scopesSupported).toEqual([RESEARCH_USE_SCOPE]);
    expect(ok?.reviewerSubjects.size).toBe(0);
    for (const resource of [primaryResource.href, "http://mcp.askrigor.example/mcp/claude", undefined]) {
      expect(() => claudeOAuthResourceServerFromEnv({
        ...base, ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID: "claude-client", ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL: resource,
      })).toThrow(/ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL_INVALID/);
    }
    expect(() => claudeOAuthResourceServerFromEnv({
      ...base, ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID: " bad", ASKRIGOR_OAUTH_CLAUDE_RESOURCE_URL: claudeResource.href,
    })).toThrow(/ASKRIGOR_OAUTH_CLAUDE_CLIENT_ID_INVALID/);
  });
});
