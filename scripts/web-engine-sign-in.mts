/**
 * Signs the web-app engine trial (scripts/web-engine.mts) in to AskRigor as the owner's dev account (owner answer
 * 222a, 2 November 2026). The owner runs it: it opens Auth0's Google sign-in in the browser, and the owner signs in
 * with the everyday Google login and allows research use. No session signs in for the owner.
 *
 *   ASKRIGOR_ENGINE_AUTH0_CLIENT_ID_FILE=<file> ASKRIGOR_ENGINE_AUTH0_SECRET_FILE=<file> \
 *     npx tsx scripts/web-engine-sign-in.mts [--sign-out]
 *
 * It asks Auth0's "Claude" application, with PKCE and the return address http://localhost:51947/callback, for one
 * access token for AskRigor's Claude surface with research:use alone: no case review and no refresh token. It keeps
 * the token in a private file (ASKRIGOR_ENGINE_TOKEN_FILE, by default ~/.local/state/askrigor-web-engine/token.json,
 * mode 600), checks it once with manage_research_access inspect, and prints only when it expires and what the account
 * reports. It never prints the token, the client secret or the authorization code. --sign-out deletes the token file.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const AUTH0_ISSUER = "https://askrigor-prod.us.auth0.com";
export const CLAUDE_SURFACE = "https://mcp.askrigor.com/mcp/claude";
export const CALLBACK_PORT = 51947;
export const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
export const SCOPE = "research:use";
const DEFAULT_TOKEN_FILE = join(homedir(), ".local", "state", "askrigor-web-engine", "token.json");
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

function base64url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

/** A PKCE verifier and its S256 challenge (RFC 7636). */
export function pkcePair(random: Buffer = randomBytes(32)): { verifier: string; challenge: string } {
  const verifier = base64url(random);
  return { verifier, challenge: base64url(createHash("sha256").update(verifier, "ascii").digest()) };
}

/** Auth0's authorize address: the Google login only, a fresh sign-in, research:use for the Claude surface alone. */
export function authorizeUrl(clientId: string, challenge: string, state: string): URL {
  const url = new URL("/authorize", AUTH0_ISSUER);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    audience: CLAUDE_SURFACE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    connection: "google-oauth2",
    prompt: "login",
  }).toString();
  return url;
}

/** A JWT's claims, read without checking its signature: AskRigor checks that on every call. */
export function jwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    return typeof claims === "object" && claims !== null ? claims as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The pass to keep from Auth0's token response, or why not: an access token for the Claude surface, issued to the
 * Claude application for a Google login, with research:use and nothing beyond it. A refresh token is never kept.
 */
export function passFrom(
  response: Record<string, unknown>,
  clientId: string,
  nowSeconds: number,
): { pass: { access_token: string; expires_at: number; scope: string; audience: string; obtained_at: string } } |
  { problem: string } {
  const token = response.access_token;
  if (typeof token !== "string") return { problem: "Auth0 returned no access token" };
  const claims = jwtClaims(token);
  if (claims === undefined) return { problem: "the access token is not a JWT" };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.some((audience) => audience === CLAUDE_SURFACE)) return { problem: "the access token is not for AskRigor's Claude surface" };
  if (claims.azp !== clientId && claims.client_id !== clientId) return { problem: "the access token is for another application" };
  if (typeof claims.sub !== "string" || !claims.sub.startsWith("google-oauth2|")) {
    return { problem: "the sign-in was not the Google login: sign in again and choose Google" };
  }
  const scopes = String(claims.scope ?? response.scope ?? "").split(/\s+/u).filter((scope) => scope !== "");
  if (!scopes.includes(SCOPE)) return { problem: "the access token lacks research:use" };
  const extra = scopes.filter((scope) => scope !== SCOPE);
  if (extra.length > 0) return { problem: `the access token carries more than research:use (${extra.join(", ")}), so it was not kept` };
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return { problem: "the access token has already expired" };
  return {
    pass: {
      access_token: token, expires_at: claims.exp, scope: SCOPE, audience: CLAUDE_SURFACE,
      obtained_at: new Date(nowSeconds * 1000).toISOString(),
    },
  };
}

function secretFrom(variable: string): string {
  const path = process.env[variable];
  if (path === undefined || path === "") throw new Error(`${variable} names no file`);
  const value = readFileSync(path, "utf8").trim();
  if (value === "" || /\s/u.test(value)) throw new Error(`The file ${variable} names must hold exactly one value.`);
  return value;
}

/** Redeems the code; a client whose Auth0 setting is Basic rejects the secret in the body, so Basic is tried next. */
async function redeem(code: string, verifier: string, clientId: string, secret: string): Promise<Record<string, unknown>> {
  const endpoint = new URL("/oauth/token", AUTH0_ISSUER);
  const form = { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT_URI, client_id: clientId };
  let response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...form, client_secret: secret }),
  });
  if (response.status === 401) {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`,
      },
      body: new URLSearchParams(form),
    });
  }
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Auth0 refused the sign-in (${response.status} ${String(body.error ?? "")}: ` +
      `${String(body.error_description ?? "no description")})`);
  }
  return body;
}

/** Waits for Auth0's redirect on both loopback addresses, since the browser may resolve localhost to either. */
export function awaitCallback(state: string): Promise<string> {
  return new Promise((resolveCode, rejectCode) => {
    const servers: Server[] = [];
    const finish = (error: Error | undefined, code?: string) => {
      clearTimeout(timer);
      for (const server of servers) { server.close(); server.closeAllConnections(); }
      if (error !== undefined) rejectCode(error); else resolveCode(code!);
    };
    const timer = setTimeout(() => finish(new Error("No sign-in came back within five minutes.")), SIGN_IN_TIMEOUT_MS);
    const handler: Parameters<typeof createServer>[1] = (request, response) => {
      const url = new URL(request.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") { response.writeHead(404).end(); return; }
      const page = (title: string) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><meta charset="utf-8"><title>AskRigor engine sign-in</title><p>${title}</p>`);
      };
      if (url.searchParams.get("state") !== state) { page("This sign-in does not match the one started. Run the command again."); return; }
      const error = url.searchParams.get("error");
      if (error !== null) {
        page("Auth0 did not sign you in. The terminal says why.");
        finish(new Error(`Auth0 did not sign in: ${error}: ${url.searchParams.get("error_description") ?? ""}`));
        return;
      }
      const code = url.searchParams.get("code");
      if (code === null) { page("No sign-in code came back. Run the command again."); return; }
      page("Signed in for the AskRigor engine trial. You can close this tab and go back to the terminal.");
      finish(undefined, code);
    };
    for (const host of ["127.0.0.1", "::1"]) {
      const server = createServer(handler);
      server.on("error", (error: NodeJS.ErrnoException) => {
        // A machine without IPv6 loopback still has 127.0.0.1; a port in use on both is fatal.
        if (host === "::1" && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")) return;
        finish(new Error(`Can't listen on ${host}:${CALLBACK_PORT} (${error.code ?? error.message}).`));
      });
      server.listen(CALLBACK_PORT, host);
      servers.push(server);
    }
  });
}

/** What the account reports through the new pass: one manage_research_access inspect, read only. */
async function inspect(token: string): Promise<string> {
  const mcp = new Client({ name: "askrigor-web-engine-sign-in", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(CLAUDE_SURFACE), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  }));
  try {
    const result = await mcp.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    const content = (result.structuredContent ?? {}) as Record<string, unknown>;
    const access = (content.access ?? {}) as Record<string, unknown>;
    return `research access ${String(access.status)} (${String(access.mode)}), card saving ` +
      `${content.findingsSave === undefined ? "not shown (not a dev account)" : content.findingsSave ? "ON" : "off"}, ` +
      `account reference ${String(content.accountReference)}`;
  } finally {
    await mcp.close();
  }
}

async function main(): Promise<void> {
  const tokenFile = process.env.ASKRIGOR_ENGINE_TOKEN_FILE ?? DEFAULT_TOKEN_FILE;
  if (process.argv.includes("--sign-out")) {
    rmSync(tokenFile, { force: true });
    console.log("Signed out: the engine's pass is deleted.");
    return;
  }
  const clientId = secretFrom("ASKRIGOR_ENGINE_AUTH0_CLIENT_ID_FILE");
  const secret = secretFrom("ASKRIGOR_ENGINE_AUTH0_SECRET_FILE");
  const { verifier, challenge } = pkcePair();
  const state = base64url(randomBytes(16));
  const address = authorizeUrl(clientId, challenge, state).href;
  const callback = awaitCallback(state);
  console.log("Opening Auth0's sign-in in your browser. Sign in with your everyday Google account and allow research use.");
  console.log(`If no browser opens, open this address yourself:\n${address}`);
  try {
    spawn("xdg-open", [address], { detached: true, stdio: "ignore" }).on("error", () => undefined).unref();
  } catch {
    // The address above is enough.
  }
  const code = await callback;
  const kept = passFrom(await redeem(code, verifier, clientId, secret), clientId, Date.now() / 1000);
  if ("problem" in kept) throw new Error(`Not signed in: ${kept.problem}.`);
  mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 });
  const temporary = `${tokenFile}.${process.pid}`;
  writeFileSync(temporary, JSON.stringify(kept.pass), { mode: 0o600 });
  renameSync(temporary, tokenFile);
  console.log(`Signed in. The engine's pass lasts until ${new Date(kept.pass.expires_at * 1000).toISOString()}.`);
  console.log(`AskRigor reports: ${await inspect(kept.pass.access_token).catch((error: unknown) =>
    `could not check (${error instanceof Error ? error.message : String(error)})`)}.`);
  if (!existsSync(tokenFile)) throw new Error("The pass was not saved.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
