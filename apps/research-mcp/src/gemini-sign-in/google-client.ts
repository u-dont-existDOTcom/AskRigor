import type { Client } from "oidc-provider";

/**
 * Which clients Gemini's sign-in accepts, and the only places its server fetches anything from (design 4.1, v2 F5).
 *
 * Google's Gemini app names each custom connector by a Client ID Metadata Document on accountlinking.google.com; the
 * document says the connector authenticates with `private_key_jwt` (RS256) against Google's keys on www.gstatic.com and
 * receives codes only at Google's own redirect addresses for that same connector.
 */
export const GOOGLE_CLIENT_ID_PATTERN =
  /^https:\/\/accountlinking\.google\.com\/clientidmetadata\/user_bound_provider\/(user_bound_custom-mcp-[A-Za-z0-9_-]{8,64})$/u;
export const GOOGLE_JWKS_URL =
  "https://www.gstatic.com/account-linking/.well-known/client-assertion-signature-verification-key.json";
const GOOGLE_REDIRECT_PATTERN =
  /^https:\/\/oauth-redirect(?:-sandbox|-test)?\.googleusercontent\.com\/[ra]\/(user_bound_custom-mcp-[A-Za-z0-9_-]{8,64})$/u;

/** The connector's own id (`user_bound_custom-mcp-…`) of an accepted client id, or undefined. */
export function googleConnectorIdOf(clientId: unknown): string | undefined {
  return typeof clientId === "string" ? GOOGLE_CLIENT_ID_PATTERN.exec(clientId)?.[1] : undefined;
}

/** Whether an address is one of Google's redirect addresses for a Gemini connector (any connector). */
export function isGoogleRedirect(uri: unknown): boolean {
  return typeof uri === "string" && GOOGLE_REDIRECT_PATTERN.test(uri);
}

/** Before any fetch: only a Gemini connector's document address on Google's one host. */
export function allowGeminiClientFetch(clientId: unknown): boolean {
  return googleConnectorIdOf(clientId) !== undefined;
}

/**
 * Every time a document's client is used, cached or not: Google's key address and method only, and redirects only to
 * Google's six addresses for this same connector.
 */
export function allowGeminiClient(client: Client): boolean {
  const connectorId = googleConnectorIdOf(client.clientId);
  if (connectorId === undefined) return false;
  if (client.clientIdMetadataDocument !== true) return false;
  if (client.tokenEndpointAuthMethod !== "private_key_jwt") return false;
  if (client.tokenEndpointAuthSigningAlg !== "RS256") return false;
  if (client.jwksUri !== GOOGLE_JWKS_URL || client.jwks !== undefined) return false;
  if (client.sectorIdentifierUri !== undefined || (client.requestUris?.length ?? 0) > 0) return false;
  const redirects = client.redirectUris ?? [];
  if (redirects.length === 0 || redirects.length > 12) return false;
  if (!redirects.every((uri) => GOOGLE_REDIRECT_PATTERN.exec(uri)?.[1] === connectorId)) return false;
  const responseTypes = client.responseTypes ?? [];
  if (responseTypes.length !== 1 || responseTypes[0] !== "code") return false;
  const grantTypes = new Set(client.grantTypes ?? []);
  if (!grantTypes.has("authorization_code") || !grantTypes.has("refresh_token")) return false;
  return [...grantTypes].every((type) => type === "authorization_code" || type === "refresh_token");
}

/** At most this many outbound fetches run at once; one more fails at once rather than queueing. */
const MAX_CONCURRENT_FETCHES = 4;
const JWKS_MAX_BYTES = 64 * 1_024;
const JWKS_MAX_KEYS = 20;
const JWKS_MIN_SECONDS = 60;
// Five minutes at most (Fable's recheck, finding 5): a key Google rotates in, or withdraws, is seen within that time.
const JWKS_MAX_SECONDS = 300;
// A client id Google answered without a document is not fetched again for five minutes, and at most 1,000 are kept
// (finding 6), so made-up ids cannot keep the outbound slots busy or turn AskRigor into a source of requests to Google.
const UNKNOWN_CLIENT_MS = 5 * 60_000;
const UNKNOWN_CLIENT_MAX = 1_000;

/**
 * The authorization server library's only way out (its `fetch` option): a Gemini connector's document, passed through
 * with redirects refused (the library bounds its size and time), and Google's key set, fetched once at a time, cached for
 * its `max-age` within one to ten minutes, bounded to 64 KiB and 20 RSA signing keys. Everything else is refused before
 * any connection, including the library's own fetches of addresses a document could name.
 */
export function geminiSignInFetch(options: {
  fetch?: typeof fetch;
  now?: () => number;
} = {}): typeof fetch {
  const upstream = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  let active = 0;
  let cached: { body: string; freshUntil: number } | undefined;
  let pending: Promise<{ body: string; freshUntil: number }> | undefined;
  const unknownClients = new Map<string, number>();

  const limited = async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= MAX_CONCURRENT_FETCHES) throw new Error("GEMINI_SIGN_IN_FETCH_BUSY");
    active += 1;
    try {
      return await work();
    } finally {
      active -= 1;
    }
  };

  const fetchKeys = async (init: RequestInit | undefined): Promise<{ body: string; freshUntil: number }> => {
    const response = await upstream(GOOGLE_JWKS_URL, {
      ...init,
      method: "GET",
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (response.status !== 200) throw new Error("GEMINI_SIGN_IN_JWKS_STATUS");
    const text = await boundedText(response, JWKS_MAX_BYTES);
    const keys = signingKeysOf(text);
    const maxAge = maxAgeOf(response.headers);
    const seconds = Math.min(JWKS_MAX_SECONDS, Math.max(JWKS_MIN_SECONDS, maxAge ?? JWKS_MIN_SECONDS));
    return { body: JSON.stringify({ keys }), freshUntil: now() + seconds * 1_000 };
  };

  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === GOOGLE_JWKS_URL) {
      if (cached === undefined || cached.freshUntil <= now()) {
        pending ??= limited(() => fetchKeys(init)).finally(() => {
          pending = undefined;
        });
        cached = await pending;
      }
      const remaining = Math.max(1, Math.floor((cached.freshUntil - now()) / 1_000));
      return new Response(cached.body, {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": `max-age=${remaining}` },
      });
    }
    if (allowGeminiClientFetch(url)) {
      const until = unknownClients.get(url);
      if (until !== undefined && until > now()) throw new Error("GEMINI_SIGN_IN_CLIENT_UNKNOWN");
      unknownClients.delete(url);
      const response = await limited(() => upstream(url, { ...init, redirect: "error" }));
      if (response.status !== 200) {
        if (unknownClients.size >= UNKNOWN_CLIENT_MAX) unknownClients.delete(unknownClients.keys().next().value!);
        unknownClients.set(url, now() + UNKNOWN_CLIENT_MS);
      }
      return response;
    }
    throw new Error("GEMINI_SIGN_IN_FETCH_REFUSED");
  }) as typeof fetch;
}

async function boundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("GEMINI_SIGN_IN_JWKS_TOO_LARGE");
  if (response.body === null) throw new Error("GEMINI_SIGN_IN_JWKS_EMPTY");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("GEMINI_SIGN_IN_JWKS_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** RSA signing keys only (RS256 or no alg, `sig` or no use), each with a kid, at most 20; anything else is dropped. */
function signingKeysOf(text: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(text);
  const keys = typeof parsed === "object" && parsed !== null ? (parsed as { keys?: unknown }).keys : undefined;
  if (!Array.isArray(keys)) throw new Error("GEMINI_SIGN_IN_JWKS_INVALID");
  const accepted = keys.filter((key): key is Record<string, unknown> =>
    typeof key === "object" && key !== null && !Array.isArray(key) &&
    (key as Record<string, unknown>).kty === "RSA" &&
    typeof (key as Record<string, unknown>).n === "string" &&
    typeof (key as Record<string, unknown>).e === "string" &&
    typeof (key as Record<string, unknown>).kid === "string" &&
    [undefined, "RS256"].includes((key as Record<string, unknown>).alg as string | undefined) &&
    [undefined, "sig"].includes((key as Record<string, unknown>).use as string | undefined) &&
    (key as Record<string, unknown>).d === undefined)
    .map((key) => ({ kty: "RSA", n: key.n, e: key.e, kid: key.kid, alg: "RS256", use: "sig" }));
  if (accepted.length === 0 || accepted.length > JWKS_MAX_KEYS) throw new Error("GEMINI_SIGN_IN_JWKS_INVALID");
  return accepted;
}

function maxAgeOf(headers: Headers): number | undefined {
  const match = /(?:^|,)\s*max-age\s*=\s*(\d{1,9})/iu.exec(headers.get("cache-control") ?? "");
  if (match === null) return undefined;
  const age = Number(headers.get("age") ?? "0");
  return Math.max(0, Number(match[1]) - (Number.isFinite(age) ? age : 0));
}
