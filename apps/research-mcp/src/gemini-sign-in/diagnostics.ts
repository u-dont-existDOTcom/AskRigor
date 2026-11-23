import { decodeJwt, decodeProtectedHeader } from "jose";
import type Provider from "oidc-provider";
import type { KoaContextWithOIDC } from "oidc-provider";

import { GEMINI_ISSUER_PATH, GEMINI_SCOPE } from "./config.js";
import { googleConnectorIdOf, isGoogleRedirect } from "./google-client.js";

/**
 * Gemini's sign-in step log: ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled, off by default (owner answer 408a, 22 Nov 2026).
 *
 * The owner's link of 22 Nov 2026 logged Allow at 19:25:27 and then nothing until a "session expired" ten seconds
 * later; the store kept his consent and no token. The code's issue, Google's token call and the first research call
 * were invisible, so these lines cover them too. Every value a line holds is a name this file lists: which of
 * AskRigor's own addresses an audience is, whether a parameter or header is present, an OAuth error code, a message the
 * library or this server writes word for word (anything else is "unlisted"), a coarse time bucket. Never an id, code,
 * token, client id, address, header value, state, account or any other value a request carries.
 */
export type GeminiSignInStage =
  | "login"
  | "consent"
  | "callback"
  | "library"
  | "authorization"
  | "token"
  | "revocation"
  | "resource";

export type GeminiSignInDetail = Readonly<Record<string, string | number | boolean>>;

export interface GeminiSignInDiagnostic {
  readonly event: "askrigor_gemini_sign_in";
  readonly stage: GeminiSignInStage;
  readonly outcome: string;
  readonly detail?: GeminiSignInDetail;
}

export type GeminiSignInNote = (stage: GeminiSignInStage, outcome: string, detail?: GeminiSignInDetail) => void;

/** The note function of a diagnostic sink, or undefined when the step log is off. */
export function geminiSignInNote(
  diagnostic: ((record: GeminiSignInDiagnostic) => void) | undefined,
): GeminiSignInNote | undefined {
  if (diagnostic === undefined) return undefined;
  return (stage, outcome, detail) => diagnostic({
    event: "askrigor_gemini_sign_in",
    stage,
    outcome,
    ...(detail === undefined || Object.keys(detail).length === 0 ? {} : { detail }),
  });
}

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const OAUTH_CODE = /^[a-z_]{1,40}$/u;
const OWN_ERROR = /^GEMINI_SIGN_IN_[A-Z_]{1,48}$/u;
const JOSE_CODE = /^ERR_[A-Z_]{1,60}$/u;
const KNOWN_SCOPES = ["openid", "offline_access", GEMINI_SCOPE, "cases:review"] as const;
const KNOWN_PROMPTS = new Set(["none", "login", "consent", "select_account", "create"]);
const KNOWN_MODES = new Set(["query", "fragment", "form_post"]);
const KNOWN_ALGS = new Set(["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"]);
const KNOWN_TYPS = new Set(["JWT", "client-authentication+jwt"]);
const KNOWN_MCP_METHODS = new Set([
  "initialize", "notifications/initialized", "tools/list", "tools/call", "ping", "resources/list", "prompts/list",
]);

/**
 * Messages written word for word by this server's assertion check (provider.ts), oidc-provider 9.15.0 and jose 6 on
 * the paths a Gemini link takes; a test checks each one still occurs in that source. Only these are logged as reasons.
 */
export const GEMINI_SIGN_IN_KNOWN_REASONS: ReadonlySet<string> = new Set([
  // provider.ts, assertJwtClientAuthClaimsAndHeader
  "alg must be RS256",
  "sub must equal iss",
  "every audience must be this authorization server",
  "expiry too far ahead",
  "issued in the future",
  // oidc-provider lib/shared/jwt_client_auth.js
  "alg mismatch",
  "expiration must be specified in the client_assertion JWT",
  "unique jti (JWT ID) must be provided in the client_assertion JWT",
  "iss (JWT issuer) must be provided in the client_assertion JWT",
  "iss (JWT issuer) must be the client_id",
  "aud (JWT audience) must be provided in the client_assertion JWT",
  "list of audience (aud) must include the endpoint url, issuer identifier or token endpoint url",
  "audience (aud) must equal the endpoint url, issuer identifier or token endpoint url",
  "client assertion tokens must only be used once",
  // oidc-provider lib/shared/client_auth.js
  "client_id mismatch",
  "client authentication must only be provided using one mechanism",
  "invalid authorization header value format",
  "client_id and client_secret in the authorization header are not properly encoded",
  "client_secret must be provided in the Authorization header",
  "invalid client_assertion format",
  "sub (JWT subject) must be provided in the client_assertion JWT",
  "client_assertion_type must be provided",
  `client_assertion_type must have value ${ASSERTION_TYPE}`,
  "no client authentication mechanism provided",
  "client not found",
  "the provided authentication mechanism does not match the registered client authentication method",
  // oidc-provider lib/helpers/jwt.js, and jose's own messages, as the cause of a failed assertion
  "jwt expired",
  "jwt not active yet",
  "jwt issued in the future",
  "invalid exp value",
  "invalid iat value",
  "invalid nbf value",
  "invalid jti value",
  "invalid iss value",
  "invalid aud value",
  "invalid sub value",
  "payload is not of JWT type (JSON serialized object)",
  "no applicable key found in the JSON Web Key Set",
  "signature verification failed",
  // oidc-provider grants, PKCE and resource indicators
  "authorization code not found",
  "authorization code already consumed",
  "authorization code is expired",
  "authorization code redirect_uri mismatch",
  "refresh token not found",
  "refresh token already consumed",
  "refresh token is expired",
  "refresh token already used",
  "client mismatch",
  "grant not found",
  "grant is expired",
  "code_verifier must be provided",
  "code_verifier does not match code_challenge",
  "unsupported code_challenge_method",
  "code_verifier must not be provided without a code_challenge",
  "requested grant type is not allowed for this client",
  "scope contains invalid characters",
  "resource indicator must be an absolute URI",
  "resource indicator must not contain a fragment component",
  // oidc-provider authorization and resume
  "client is invalid",
  "interaction session id cookie not found",
  "interaction session not found",
  "session not found",
  "session principal changed",
  "Authorization Server policy requires PKCE to be used for this request",
  "code_challenge_method must be provided",
  "code_challenge must be provided with code_challenge_method",
  "not supported value of code_challenge_method",
  "requested response_mode is not allowed for this client or request",
  "requested response_type is not allowed for this client",
  "requested scope is not allowed",
  "unsupported prompt value requested",
  "prompt none must only be used alone",
]);

/** The logged reason of a library or server error: a listed message, this server's own error name, a jose code. */
export function geminiSignInReasonOf(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unlisted";
  const fields = error as {
    error_detail?: unknown; error_description?: unknown; message?: unknown; cause?: unknown; code?: unknown;
  };
  const cause = typeof fields.cause === "object" && fields.cause !== null
    ? fields.cause as { message?: unknown; code?: unknown }
    : undefined;
  // The library keeps a failure's own message in error_detail (invalid_client, invalid_grant) or error_description
  // (invalid_request); a wrapped failure's in its cause.
  for (const candidate of [fields.error_detail, fields.error_description, cause?.message, fields.message]) {
    if (typeof candidate === "string" && (GEMINI_SIGN_IN_KNOWN_REASONS.has(candidate) || OWN_ERROR.test(candidate))) {
      return candidate;
    }
  }
  for (const code of [cause?.code, fields.code]) {
    if (typeof code === "string" && JOSE_CODE.test(code)) return code;
  }
  return "unlisted";
}

function oauthCode(value: unknown): string {
  return typeof value === "string" && OAUTH_CODE.test(value) ? value : "unlisted";
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** One parameter's single value; "several" when it was repeated. */
function single(source: Record<string, unknown> | URLSearchParams | undefined, name: string): string | undefined | "several" {
  if (source === undefined) return undefined;
  if (source instanceof URLSearchParams) {
    const values = source.getAll(name);
    return values.length === 0 ? undefined : values.length === 1 ? values[0] : "several";
  }
  const value = source[name];
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === "string" ? value[0] : "several";
  return typeof value === "string" ? value : undefined;
}

function clientKind(value: string | undefined): string {
  if (value === undefined || value === "") return "absent";
  if (value === "several") return "several";
  return googleConnectorIdOf(value) === undefined ? "other" : "gemini_document";
}

function redirectKind(value: string | undefined): string {
  if (value === undefined || value === "") return "absent";
  if (value === "several") return "several";
  return isGoogleRedirect(value) ? "google" : "other";
}

function resourceKind(value: string | undefined, resource: string): string {
  if (value === undefined || value === "") return "absent";
  if (value === "several") return "several";
  return value === resource ? "this_resource" : "other";
}

function namedOrOther(value: string | undefined, known: ReadonlySet<string>): string {
  if (value === undefined || value === "") return "absent";
  return known.has(value) ? value : "other";
}

/** Shape of an authorization request's query (Gemini sends it by GET): which parts are present, never their values. */
export function authorizationRequestShape(query: string, resource: string): GeminiSignInDetail {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const scope = single(params, "scope");
  const requested = scope === undefined || scope === "several" ? [] : scope.split(" ").filter(Boolean);
  const known = KNOWN_SCOPES.filter((name) => requested.includes(name));
  const prompt = single(params, "prompt");
  const prompts = prompt === undefined || prompt === "several" ? [] : prompt.split(" ").filter(Boolean);
  const responseType = single(params, "response_type");
  const challengeMethod = single(params, "code_challenge_method");
  return {
    client: clientKind(single(params, "client_id")),
    redirect: redirectKind(single(params, "redirect_uri")),
    response_type: responseType === undefined ? "absent" : responseType === "code" ? "code" : "other",
    scopes: scope === "several" ? "several" : known.length === 0 ? "none" : known.join("+"),
    other_scopes: requested.filter((name) => !(KNOWN_SCOPES as readonly string[]).includes(name)).length,
    resource: resourceKind(single(params, "resource"), resource),
    response_mode: namedOrOther(single(params, "response_mode"), KNOWN_MODES),
    prompt: prompts.length === 0 ? "absent" : prompts.map((name) => KNOWN_PROMPTS.has(name) ? name : "other").join("+"),
    pkce: challengeMethod === undefined ? (present(single(params, "code_challenge")) ? "no_method" : "absent")
      : challengeMethod === "S256" ? "S256" : challengeMethod === "plain" ? "plain" : "other",
    state: present(single(params, "state")),
    nonce: present(single(params, "nonce")),
  };
}

function secondsBucket(seconds: number): string {
  if (seconds <= 0) return "past";
  if (seconds <= 60) return "le_60s";
  if (seconds <= 300) return "le_5min";
  if (seconds <= 3_600) return "le_1h";
  if (seconds <= 3_630) return "le_1h30s";
  return "gt_1h30s";
}

/** Which of AskRigor's own addresses each audience is; "other" for anything else. */
function audienceKinds(aud: unknown, issuer: string, resource: string): string {
  const values = Array.isArray(aud) ? aud : [aud];
  const origin = new URL(issuer).origin;
  const named: Record<string, string> = {
    [issuer]: "issuer",
    [`${issuer}/`]: "issuer_slash",
    [`${issuer}/token`]: "token_endpoint",
    [`${issuer}/token/`]: "token_endpoint_slash",
    [`${issuer}/token/revocation`]: "revocation_endpoint",
    [resource]: "resource",
    [origin]: "origin",
    [`${origin}/`]: "origin",
  };
  const kinds = new Set(values.map((value) => typeof value === "string" ? named[value] ?? "other" : "not_a_string"));
  return kinds.size === 0 ? "absent" : [...kinds].sort().join("+");
}

/** Shape of a client assertion, decoded without trusting it: which claims are present and what kind each is. */
export function assertionShape(
  assertion: string | undefined,
  issuer: string,
  resource: string,
  nowSeconds: number,
): GeminiSignInDetail {
  if (assertion === undefined || assertion === "" || assertion === "several") {
    return { assertion_claims: assertion === "several" ? "several" : "absent" };
  }
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeProtectedHeader(assertion) as Record<string, unknown>;
    claims = decodeJwt(assertion) as Record<string, unknown>;
  } catch {
    return { assertion_claims: "undecodable" };
  }
  const exp = typeof claims.exp === "number" ? claims.exp : undefined;
  const iat = typeof claims.iat === "number" ? claims.iat : undefined;
  return {
    assertion_claims: "decoded",
    alg: namedOrOther(typeof header.alg === "string" ? header.alg : undefined, KNOWN_ALGS),
    kid: present(header.kid),
    typ: namedOrOther(typeof header.typ === "string" ? header.typ : undefined, KNOWN_TYPS),
    iss: clientKind(typeof claims.iss === "string" ? claims.iss : undefined),
    sub_equals_iss: typeof claims.sub === "string" && claims.sub === claims.iss,
    aud: claims.aud === undefined ? "absent" : audienceKinds(claims.aud, issuer, resource),
    aud_array: Array.isArray(claims.aud),
    jti: present(claims.jti),
    iat: iat !== undefined,
    nbf: claims.nbf !== undefined,
    exp_in: exp === undefined ? "absent" : secondsBucket(exp - nowSeconds),
    lifetime: exp === undefined || iat === undefined ? "unknown" : secondsBucket(exp - iat),
  };
}

/** Shape of a token or revocation request: which parameters and headers are present, and the assertion's shape. */
export function tokenRequestShape(
  ctx: KoaContextWithOIDC,
  issuer: string,
  resource: string,
  nowSeconds: number,
): GeminiSignInDetail {
  const body = typeof ctx.oidc?.body === "object" && ctx.oidc.body !== null
    ? ctx.oidc.body as Record<string, unknown>
    : undefined;
  const authorization = ctx.get("authorization");
  const grantType = single(body, "grant_type");
  const assertionType = single(body, "client_assertion_type");
  return {
    content_type: ctx.is("application/x-www-form-urlencoded") ? "form" : ctx.is("application/json") ? "json"
      : present(ctx.get("content-type")) ? "other" : "absent",
    body: body === undefined ? "unparsed" : "parsed",
    grant_type: grantType === undefined ? "absent"
      : grantType === "authorization_code" || grantType === "refresh_token" ? grantType : "other",
    assertion_type: assertionType === undefined ? "absent" : assertionType === ASSERTION_TYPE ? "jwt_bearer" : "other",
    client_id_param: clientKind(single(body, "client_id")),
    client_secret_param: present(single(body, "client_secret")),
    basic_header: /^basic\s/iu.test(authorization),
    other_authorization_header: present(authorization) && !/^basic\s/iu.test(authorization),
    dpop_header: present(ctx.get("dpop")),
    resource_param: resourceKind(single(body, "resource"), resource),
    redirect_uri_param: redirectKind(single(body, "redirect_uri")),
    code_param: present(single(body, "code")),
    code_verifier_param: present(single(body, "code_verifier")),
    refresh_token_param: present(single(body, "refresh_token")),
    scope_param: present(single(body, "scope")),
    ...assertionShape(single(body, "client_assertion"), issuer, resource, nowSeconds),
  };
}

/** Where an authorization or resume response sent the browser, and with what. */
function authorizationOutcome(ctx: KoaContextWithOIDC, issuer: string): { outcome: string; detail: Record<string, string | boolean> } {
  const header = ctx.response.get("location");
  const location = typeof header === "string" ? header : "";
  if (ctx.status >= 300 && ctx.status < 400 && location !== "") {
    let target: URL;
    try {
      target = new URL(location, issuer);
    } catch {
      return { outcome: "redirect_unparsable", detail: {} };
    }
    if (target.origin === new URL(issuer).origin) {
      return {
        outcome: target.pathname.startsWith(`${GEMINI_ISSUER_PATH}/interaction/`) ? "to_interaction" : "same_site_redirect",
        detail: {},
      };
    }
    const query = target.searchParams;
    const fragment = new URLSearchParams(target.hash.startsWith("#") ? target.hash.slice(1) : "");
    const params = query.has("code") || query.has("error") ? query : fragment;
    const detail = {
      to: isGoogleRedirect(`${target.origin}${target.pathname}`) ? "google" : "other_site",
      in: params === query ? "query" : "fragment",
      state_param: params.has("state"),
      iss_param: params.has("iss"),
    };
    if (params.has("code")) return { outcome: "code_issued", detail };
    if (params.has("error")) return { outcome: "error_redirect", detail: { ...detail, error: oauthCode(params.get("error")) } };
    return { outcome: "redirect_without_result", detail };
  }
  if (ctx.status === 200 && single(ctx.oidc?.params as Record<string, unknown> | undefined, "response_mode") === "form_post") {
    return { outcome: "form_post_page", detail: {} };
  }
  if (ctx.status >= 400) {
    const body = ctx.body as { error?: unknown } | undefined;
    return { outcome: "error_page", detail: { status: String(ctx.status), ...(body?.error === undefined ? {} : { error: oauthCode(body.error) }) } };
  }
  return { outcome: `status_${ctx.status}`, detail: {} };
}

/**
 * Installs the step log in the library: its error events give each failed step's reason, and one middleware writes a
 * line per authorization, resume, token and revocation request. Call before the library's request handler is created
 * (Koa composes its middleware then).
 */
export function watchGeminiSignInLibrary(
  provider: Provider,
  note: GeminiSignInNote,
  settings: { issuer: string; resource: string; now: () => Date },
): void {
  const reasons = new WeakMap<object, string>();
  const remember = (ctx: unknown, error: unknown) => {
    if (typeof ctx === "object" && ctx !== null) reasons.set(ctx, geminiSignInReasonOf(error));
  };
  for (const event of ["authorization.error", "grant.error", "revocation.error", "server_error"] as const) {
    provider.on(event, remember);
  }
  provider.use(async (ctx, next) => {
    await next();
    const route = ctx.oidc?.route;
    const reason = reasons.get(ctx);
    const why: Record<string, string> = reason === undefined ? {} : { reason };
    if (route === "authorization" || route === "resume") {
      const { outcome, detail } = authorizationOutcome(ctx, settings.issuer);
      note("authorization", outcome, { step: route, ...detail, ...why });
      return;
    }
    if (route === "token" || route === "revocation") {
      const shape = tokenRequestShape(ctx, settings.issuer, settings.resource, Math.floor(settings.now().getTime() / 1_000));
      const stage = route === "token" ? "token" : "revocation";
      if (ctx.status === 200) {
        const body = ctx.body as { refresh_token?: unknown; scope?: unknown } | undefined;
        note(stage, route === "token" ? "issued" : "revoked", {
          ...shape,
          ...(route === "token" ? {
            refresh_token: typeof body?.refresh_token === "string",
            scope: body?.scope === GEMINI_SCOPE ? "research_use" : present(body?.scope) ? "other" : "absent",
          } : {}),
        });
        return;
      }
      const body = ctx.body as { error?: unknown } | undefined;
      note(stage, oauthCode(body?.error), { status: String(ctx.status), ...shape, ...why });
    }
  });
}

/** The research call that presented (or failed to present) a Gemini token: its MCP method name, when it is a known one. */
export function mcpMethodOf(body: unknown): string {
  const method = typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as { method?: unknown }).method
    : Array.isArray(body) ? "batch" : undefined;
  if (method === "batch") return "batch";
  return typeof method === "string" && KNOWN_MCP_METHODS.has(method) ? method : method === undefined ? "absent" : "other";
}
