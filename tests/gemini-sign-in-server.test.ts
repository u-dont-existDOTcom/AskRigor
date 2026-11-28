import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  InMemoryResearchContributorAccessStore,
  InMemoryTermsPageAnswerStore,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { searchPubmed } from "@askrigor/sources";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FULL_PROTOCOL_GEMINI } from "../apps/research-mcp/src/full-protocol.js";
import type { GeminiSignIn } from "../apps/research-mcp/src/gemini-sign-in/index.js";
import * as lessonRuntime from "../apps/research-mcp/src/lessons/runtime.js";
import {
  countGeminiLinks,
  disconnectGeminiLinks,
} from "../apps/research-mcp/src/gemini-sign-in/resource.js";
import { submitConnectorLessonCandidate } from "../apps/research-mcp/src/lessons/runtime.js";
import {
  RESEARCH_USE_SCOPE,
  createJwtOAuthResourceServer,
} from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import { lessonDiagnostics } from "./fixtures/lesson-diagnostics.js";
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

vi.mock("../apps/research-mcp/src/lessons/runtime.js", { spy: true });
vi.mock("@askrigor/sources", { spy: true });

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
  vi.unstubAllEnvs();
  vi.mocked(searchPubmed).mockReset();
  vi.mocked(submitConnectorLessonCandidate).mockReset();
});

async function start(options: { gemini: boolean; notice?: boolean }) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "gemini-server-test" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const signAuth0 = (claims: Record<string, unknown>) => new SignJWT({
    iss: issuerUrl.href, aud: primaryResource.href, exp: Math.floor(Date.now() / 1_000) + 300,
    client_id: "chatgpt-client", scope: RESEARCH_USE_SCOPE, sub: PERSON, ...claims,
  }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
  const service = new ResearchContributorAccessService({
    store: new InMemoryResearchContributorAccessStore(),
    identitySecret: Buffer.alloc(32, 7),
  });
  // The free-use notice before Allow (owner answer 419a), on the server's own research accounts.
  const fixture = await startGeminiFixture(options.notice === true
    ? { notice: { access: service, answers: new InMemoryTermsPageAnswerStore() } }
    : {});
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
    researchContributorAccessService: service,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  return { base, fixture, signAuth0, service };
}

async function geminiToken(fixture: GeminiFixture, notice?: "accept" | "decline"): Promise<string> {
  const { code, verifier } = await linkToCode(fixture, new Browser(fixture.baseUrl), notice === undefined ? {} : { notice });
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

  // Owner answer 419a for Gemini (the owner, 27 Nov 2026: "gemini is still not working"): the notice on AskRigor's own
  // page during the link, since Gemini can't show it in its chat.
  it("lets a Gemini-only account accept the free-use notice during the link, after which research is ready on /mcp/gemini", async () => {
    const { base, fixture, service } = await start({ gemini: true, notice: true });
    const client = await connect(base, "/mcp/gemini", await geminiToken(fixture, "accept"));
    const manifest = await client.callTool({ name: "get_protocol_manifest", arguments: { protocol: "hrp" } });
    expect(manifest.structuredContent).toMatchObject({ connection: { sign_in: "accepted", research_access: "ready" } });
    const research = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "index" } });
    expect(research.isError).not.toBe(true);
    expect(await service.inspect(PERSON)).toMatchObject({ acceptance: { acceptedBy: "PERSON_SIGN_IN_PAGE", current: "accepted" } });
  });

  it("completes the link after Decline, and research stays refused with Gemini's guidance to connect again", async () => {
    const { base, fixture, service } = await start({ gemini: true, notice: true });
    const client = await connect(base, "/mcp/gemini", await geminiToken(fixture, "decline"));
    const refused = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "index" } });
    expect(refused.isError).toBe(true);
    const shown = text(refused);
    expect(shown).toContain("Choose free contributor mode");
    expect(shown).toContain("This connector can't show AskRigor's research notice. Tell the person to remove AskRigor " +
      "in Gemini's settings and add it again (AskRigor shows the notice when they sign in), or to open AskRigor once in " +
      "Claude or ChatGPT (https://askrigor.com/add), read the notice there and choose; then retry here.");
    expect(await service.inspect(PERSON)).toMatchObject({ status: "UNENROLLED" });
  });

  it("uses the shared lesson submission only after Gemini sign-in and research access", async () => {
    const receipt = { status: "submitted", retryable: false, candidate_id: "ARL-0042", occurrence_count: 1 } as const;
    const submit = vi.spyOn(lessonRuntime, "submitConnectorLessonCandidate").mockResolvedValue(receipt);
    const { base, fixture } = await start({ gemini: true, notice: true });
    const candidate = {
      category: "missing_sources",
      general_lesson: "When a search fails, AskRigor should explain which sources were unavailable.",
      expected_behavior: "Report the source access failure before drawing a conclusion from the search.",
      failure_reason: "The reply described a failed source search as an empty result.",
      synthetic_regression_example: "Invent an unavailable source and verify that the reply reports the access failure.",
      evidence_basis: "tool_receipt_conflict",
      consent_scope: "once",
      existing_rules: { none: "The example supplies no covering rule." },
      observed_behavior: "The source search returned an access error, which the tool reported as no results.",
      part_to_change: { kind: "tool", name: "search_pubmed" },
    };
    const report = (client: Client) => client.callTool({ name: "submit_lesson_candidate", arguments: candidate });

    try {
      const anonymous = await report(await connect(base, "/mcp/gemini"));
      expect(anonymous.isError).toBe(true);
      expect(JSON.stringify(anonymous)).toContain(GEMINI_METADATA);

      const declined = await report(await connect(base, "/mcp/gemini", await geminiToken(fixture, "decline")));
      expect(declined.isError).toBe(true);
      expect(text(declined)).toContain("Choose free contributor mode");
      expect(submit).not.toHaveBeenCalled();

      const accepted = await report(await connect(base, "/mcp/gemini", await geminiToken(fixture, "accept")));
      expect(accepted.isError).not.toBe(true);
      expect(accepted.structuredContent).toEqual(receipt);
      expect(text(accepted)).toContain("Lesson saved for review");
      expect(submit).toHaveBeenCalledExactlyOnceWith(candidate, { detailedReports: false });
    } finally {
      submit.mockRestore();
    }
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

describe("the full-protocol line on /mcp/gemini", () => {
  it("appends one block to successful results and preserves the original result bytes", async () => {
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", undefined);
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", undefined);
    vi.stubEnv("ASKRIGOR_HRP_CORE", "off");
    vi.mocked(submitConnectorLessonCandidate).mockResolvedValue({
      status: "submitted", candidate_id: "ARL-0042", occurrence_count: 1, retryable: false,
    });
    const query = "synthetic search query";
    vi.mocked(searchPubmed).mockResolvedValue({
      provider: "pubmed", record_type: "pubmed_search_result", retrieved_at: "2026-11-28T00:00:00.000Z",
      query: { query }, source_identity: {}, pagination: { exhausted: true, returned: 0 }, access_status: "complete",
      limitations: [], raw_metadata: { total_count: 0 }, data: [],
    });
    const { base, fixture, signAuth0, service } = await start({ gemini: true, notice: true });
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", service.accountKeyForSubject(PERSON));
    const gemini = await connect(base, "/mcp/gemini", await geminiToken(fixture, "accept"));
    const manifest = { name: "get_protocol_manifest", arguments: { protocol: "hrp" } };
    const search = { name: "search_pubmed", arguments: { query } };
    // Call the registered handler directly, independent of the separate Gemini catalog change.
    const lesson = { name: "submit_lesson_candidate", arguments: {
      ...lessonDiagnostics, category: "missing_sources",
      general_lesson: "When material factual claims are made, AskRigor should attach traceable sources.",
      expected_behavior: "Cite each material claim near the sentence it supports and expose any source-access boundary.",
      failure_reason: "The answer asserted a conclusion without giving the user a way to inspect its evidence.",
      synthetic_regression_example: "A response ranks two interventions and provides no citations for either ranking.",
      evidence_basis: "assistant_self_check", consent_scope: "once",
    } };
    const successful = [manifest, search, lesson];
    const baseline = [];
    for (const request of successful) {
      const result = await gemini.callTool(request);
      expect(result.isError, text(result)).not.toBe(true);
      baseline.push(result);
    }
    expect(searchPubmed).toHaveBeenCalledWith(expect.objectContaining({ query }), expect.any(Object));
    expect(baseline[1]?.structuredContent).toMatchObject({ access_status: "complete" });
    expect(baseline[2]?.structuredContent).toMatchObject({ status: "submitted" });

    for (const mode of ["off", "bogus", "trial"]) {
      vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", mode);
      for (const [index, request] of successful.entries()) {
        expect(JSON.stringify(await gemini.callTool(request)), `${mode} ${request.name}`).toBe(JSON.stringify(baseline[index]));
      }
    }

    const anonymous = await connect(base, "/mcp/gemini");
    const waiting = await connect(base, "/mcp/gemini", await signAuth0({ sub: "auth0|waiting" }));
    const primary = await connect(base, "/mcp", await signAuth0({}));
    const claude = await connect(base, "/mcp/claude", await signAuth0({ aud: claudeResource.href, client_id: "claude-client" }));
    const untouched = [
      [gemini, { name: "load_protocol", arguments: { protocol: "hrp", section: "index" } }],
      [waiting, search], [anonymous, manifest], [primary, manifest], [claude, manifest],
    ] as const;
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "off");
    const before = [];
    for (const [client, request] of untouched) before.push(await client.callTool(request));
    expect(before[0]?.isError).not.toBe(true);
    expect(before[1]?.isError).toBe(true);
    expect(before[2]?.isError).not.toBe(true);

    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "on");
    for (const [index, request] of successful.entries()) {
      const result = await gemini.callTool(request);
      expect(result.content, request.name).toBeInstanceOf(Array);
      const blocks = result.content as unknown[];
      expect(blocks.at(-1)).toEqual({ type: "text", text: FULL_PROTOCOL_GEMINI });
      expect(JSON.stringify({ ...result, content: blocks.slice(0, -1) })).toBe(JSON.stringify(baseline[index]));
    }
    for (const [index, [client, request]] of untouched.entries()) {
      expect(JSON.stringify(await client.callTool(request)), request.name).toBe(JSON.stringify(before[index]));
    }

    const geminiLine = { type: "text", text: FULL_PROTOCOL_GEMINI };
    const manifestLast = async () => ((await gemini.callTool(manifest)).content as unknown[]).at(-1);
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "dev");
    expect(await manifestLast()).toEqual(geminiLine);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", "");
    expect(await manifestLast()).not.toEqual(geminiLine);
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "trial");
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", service.accountKeyForSubject(PERSON));
    const setWindow = (minutes: number) => primary.callTool({ name: "manage_research_access", arguments: {
      action: "set_research_trial", later_inputs: { researchTrial: {
        claimAccounting: false, hrpCore: false, indirectEvidence: false, fullProtocol: true, minutes,
      } },
    } });
    expect((await setWindow(1)).structuredContent).toMatchObject({ researchTrial: { fullProtocol: true } });
    expect(await manifestLast()).toEqual(geminiLine);
    expect((await setWindow(0)).structuredContent).toMatchObject({ researchTrial: { fullProtocol: false } });
    expect(await manifestLast()).not.toEqual(geminiLine);
  });
});
