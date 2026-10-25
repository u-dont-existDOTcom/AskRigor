import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { researchAccountKeyForSubject } from "@askrigor/evidence-repository";

import { containsCardReference } from "../findings/acceptance-checks.js";
import { contactDetailKinds, hasDirectionControl, linkKinds } from "./contact-check.js";
import { pageGuardProblems } from "./page-guard.js";

/**
 * The security pieces of the Atlas's votes and comments (decision 171, sections 4D and 4E; design
 * docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, sections D and E): the participant key, the encrypted
 * session and sign-in cookies, the forms' CSRF tokens, the Origin check, the reporter key, the return-path guard, form
 * bodies, and the contact-details-and-links check on comments and display names. Every key comes from two secrets in
 * the server's settings: the session key (cookies and form tokens) and the participant secret (participant keys), kept
 * apart so that rotating the session key signs everyone out without changing anyone's votes or comments. The salt that
 * hashes a reporter's address is neither: it is random and lives in memory for one day.
 */

/**
 * The cookies carry the __Host- prefix: the browser takes them only from this host, over HTTPS, with Path=/ and no
 * Domain, so a sibling subdomain cannot plant one that the pages would read.
 */
export const ATLAS_SESSION_COOKIE = "__Host-askrigor-atlas";
export const ATLAS_LOGIN_COOKIE = "__Host-askrigor-atlas-login";
/** 30 days, the design's session; 10 minutes to finish signing in. */
export const ATLAS_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const ATLAS_LOGIN_SECONDS = 10 * 60;
/** A form's body: at most 16 KiB, as the evidence-gap intake takes. */
export const ATLAS_FORM_MAX_BYTES = 16 * 1_024;
/** The refusal the design words for a comment or a display name that holds contact details or links. */
export const CONTACT_REFUSAL = "Comments can't include contact details or links.";
/** Said after the refusal when a bare domain is all the check found: often a full stop with no space after it. */
export const BARE_DOMAIN_HINT = "If you meant no web address, put a space after the full stop: a word right after one, as " +
  "in \u201cended.It\u201d, reads as an address.";
export const DISPLAY_NAME_REFUSAL = "Display names can't include contact details or links.";

export interface AtlasParticipationSettings {
  /** Where readers reach the pages, such as https://askrigor.com: the sign-in callback and the Origin check use it. */
  publicOrigin: string;
  /** 32 bytes: the cookies' encryption and the forms' tokens derive from it. */
  sessionKey: Uint8Array;
  /** 32 bytes: participant keys are an HMAC of the account key under it. */
  participantSecret: Uint8Array;
  /** The research identity secret the connector derives account keys with. */
  identitySecret: Uint8Array;
}

interface DerivedKeys {
  session: Buffer;
  login: Buffer;
  csrf: Buffer;
}

const keyCache = new WeakMap<Uint8Array, DerivedKeys>();

/** The keys each use takes from the session key (HKDF-SHA256, one info string per use). */
function keysOf(settings: AtlasParticipationSettings): DerivedKeys {
  let keys = keyCache.get(settings.sessionKey);
  if (keys === undefined) {
    const derive = (use: string) => Buffer.from(hkdfSync("sha256", settings.sessionKey, "askrigor-atlas", use, 32));
    keys = {
      session: derive("session-cookie-v1"),
      login: derive("sign-in-cookie-v1"),
      csrf: derive("csrf-v1"),
    };
    keyCache.set(settings.sessionKey, keys);
  }
  return keys;
}

// Participant keys and reporter keys ----------------------------------------------------------------------------------

const PARTICIPANT_KEY = /^[a-f0-9]{64}$/u;

/**
 * The participant key of a signed-in subject: the account key the connector derives (researchAccountKeyForSubject),
 * then an HMAC of it under the participant secret. The pages store only this key, never the subject or the account key.
 */
export function participantKeyFor(settings: AtlasParticipationSettings, subject: string): string {
  const accountKey = researchAccountKeyForSubject(settings.identitySecret, subject);
  return createHmac("sha256", Buffer.from(settings.participantSecret))
    .update("askrigor:atlas-participant:v1\u0000", "utf8")
    .update(accountKey, "utf8")
    .digest("hex");
}

/** The UTC day of an instant, YYYY-MM-DD. */
export const dayOf = (at: Date) => at.toISOString().slice(0, 10);

/**
 * The salt that hashes the address of a reader who reports a comment without signing in: 32 random bytes, drawn for
 * each UTC day and held only in this process's memory, then dropped. A stored hash can therefore not be traced back to
 * an address once its day is over, not even with the server's secrets; a restart draws a new salt.
 */
export class AtlasReportSalt {
  private day = "";
  private salt = Buffer.alloc(0);

  forDay(at: Date): Buffer {
    const day = dayOf(at);
    if (day !== this.day) {
      this.day = day;
      this.salt = randomBytes(32);
    }
    return this.salt;
  }
}

/**
 * Who reports a comment, once per comment: a signed-in participant by their key (p:), anyone else by a hash of their
 * address under the day's salt (a:), so the address is never stored and two days' reports from one address do not link.
 */
export function reporterKeyFor(salt: AtlasReportSalt, participantKey: string | null, clientIp: string, at: Date): string {
  if (participantKey !== null) return `p:${participantKey}`;
  return `a:${createHmac("sha256", salt.forDay(at)).update(clientIp, "utf8").digest("hex")}`;
}

// Sealed cookies --------------------------------------------------------------------------------------------------------

/** AES-256-GCM, a fresh 12-byte nonce each time, the cookie's name as associated data: v1.<base64url(nonce|tag|data)>. */
function seal(key: Buffer, name: string, payload: object): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([nonce, cipher.getAuthTag(), data]).toString("base64url")}`;
}

function open(key: Buffer, name: string, value: string | undefined): unknown {
  if (value === undefined || !value.startsWith("v1.") || value.length > 4_096) return undefined;
  const raw = Buffer.from(value.slice(3), "base64url");
  if (raw.byteLength < 29) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(name, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * A signed-in reader: their participant key, the session's own random id, which binds the CSRF tokens, and when they
 * signed in, which signing out everywhere or deleting everything compares against.
 */
export interface AtlasSession {
  participantKey: string;
  sessionId: string;
  signedInAt: number;
  expiresAt: number;
}

const SESSION_ID = /^[A-Za-z0-9_-]{22}$/u;

export function newSession(participantKey: string, now: Date): AtlasSession {
  return { participantKey, sessionId: randomBytes(16).toString("base64url"), signedInAt: now.getTime(),
    expiresAt: now.getTime() + ATLAS_SESSION_SECONDS * 1_000 };
}

export function sealSession(settings: AtlasParticipationSettings, session: AtlasSession): string {
  return seal(keysOf(settings).session, ATLAS_SESSION_COOKIE,
    { p: session.participantKey, s: session.sessionId, i: session.signedInAt, e: session.expiresAt });
}

/**
 * The session a cookie holds, or undefined when it is missing, altered, foreign or expired. Whether it was ended since
 * (signing out everywhere, deleting everything) is the store's to say (sessionCurrent).
 */
export function openSession(settings: AtlasParticipationSettings, value: string | undefined, now: Date): AtlasSession | undefined {
  const payload = open(keysOf(settings).session, ATLAS_SESSION_COOKIE, value) as
    { p?: unknown; s?: unknown; i?: unknown; e?: unknown } | undefined;
  if (payload === undefined || typeof payload.p !== "string" || !PARTICIPANT_KEY.test(payload.p) ||
    typeof payload.s !== "string" || !SESSION_ID.test(payload.s) || typeof payload.e !== "number" ||
    !Number.isFinite(payload.e) || payload.e <= now.getTime() || payload.e > now.getTime() + ATLAS_SESSION_SECONDS * 1_000 ||
    typeof payload.i !== "number" || !Number.isSafeInteger(payload.i) || payload.i > now.getTime() ||
    payload.i !== payload.e - ATLAS_SESSION_SECONDS * 1_000) {
    return undefined;
  }
  return { participantKey: payload.p, sessionId: payload.s, signedInAt: payload.i, expiresAt: payload.e };
}

/** What signing in carries from the login to the callback: state, nonce, PKCE verifier and where to return. */
export interface AtlasSignInState {
  state: string;
  nonce: string;
  verifier: string;
  returnPath: string;
  expiresAt: number;
}

const RANDOM_TOKEN = /^[A-Za-z0-9_-]{43}$/u;

export function newSignInState(returnPath: string, now: Date): AtlasSignInState {
  const token = () => randomBytes(32).toString("base64url");
  return { state: token(), nonce: token(), verifier: token(), returnPath, expiresAt: now.getTime() + ATLAS_LOGIN_SECONDS * 1_000 };
}

export function sealSignInState(settings: AtlasParticipationSettings, state: AtlasSignInState): string {
  return seal(keysOf(settings).login, ATLAS_LOGIN_COOKIE,
    { s: state.state, n: state.nonce, v: state.verifier, r: state.returnPath, e: state.expiresAt });
}

export function openSignInState(settings: AtlasParticipationSettings, value: string | undefined, now: Date):
  AtlasSignInState | undefined {
  const payload = open(keysOf(settings).login, ATLAS_LOGIN_COOKIE, value) as
    { s?: unknown; n?: unknown; v?: unknown; r?: unknown; e?: unknown } | undefined;
  if (payload === undefined || ![payload.s, payload.n, payload.v].every((token) => typeof token === "string" &&
    RANDOM_TOKEN.test(token)) || typeof payload.r !== "string" || safeReturnPath(payload.r) !== payload.r ||
    typeof payload.e !== "number" || payload.e <= now.getTime() || payload.e > now.getTime() + ATLAS_LOGIN_SECONDS * 1_000) {
    return undefined;
  }
  return { state: payload.s as string, nonce: payload.n as string, verifier: payload.v as string, returnPath: payload.r,
    expiresAt: payload.e };
}

/** The PKCE challenge of a verifier: base64url(SHA-256(verifier)). */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier, "ascii").digest("base64url");

/** Set-Cookie for a sealed __Host- cookie: Path=/, HttpOnly, Secure and SameSite=Lax; maxAge 0 clears it. */
export function cookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${maxAge === 0 ? "" : value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * One cookie of a request, by exact name; undefined when there is none, or more than one, since a second cookie of the
 * same name can only have been planted (the reader is then signed out).
 */
export function readCookie(request: IncomingMessage, name: string): string | undefined {
  const header = request.headers.cookie;
  if (typeof header !== "string" || header.length > 8_192) return undefined;
  let found: string | undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) {
      if (found !== undefined) return undefined;
      found = part.slice(at + 1).trim();
    }
  }
  return found;
}

// CSRF tokens -------------------------------------------------------------------------------------------------------------

const tokenOf = (key: Buffer, parts: readonly string[]) =>
  createHmac("sha256", key).update(parts.join("\u0000"), "utf8").digest("base64url");

function sameToken(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

/** A signed-in form's token: tied to the session's id and the form's purpose, such as vote:P-1001. */
export function csrfToken(settings: AtlasParticipationSettings, session: AtlasSession, purpose: string): string {
  return tokenOf(keysOf(settings).csrf, ["askrigor-atlas-csrf-v1", session.sessionId, purpose]);
}

export function validCsrfToken(settings: AtlasParticipationSettings, session: AtlasSession, purpose: string,
  token: unknown): boolean {
  return sameToken(csrfToken(settings, session, purpose), token);
}

/**
 * A report form's token for a reader who is not signed in (anyone may report): tied to the comment and the UTC day, so
 * a cached page's form works into the next day and no longer.
 */
export function reportToken(settings: AtlasParticipationSettings, publicId: string, at: Date): string {
  return tokenOf(keysOf(settings).csrf, ["askrigor-atlas-report-v1", dayOf(at), publicId]);
}

export function validReportToken(settings: AtlasParticipationSettings, publicId: string, token: unknown, now: Date): boolean {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  return [now, yesterday].some((day) => sameToken(reportToken(settings, publicId, day), token));
}

// The Origin check and the return path ----------------------------------------------------------------------------------

/**
 * Whether a form post comes from the pages themselves. Origin must be the public origin, or the origin the request
 * reached directly (https and its Host). Without Origin, Sec-Fetch-Site must not name another site and the Referer
 * must be one of those origins; with neither header the post is refused.
 */
export function sameSitePost(request: IncomingMessage, publicOrigin: string): boolean {
  const host = request.headers.host;
  const allowed = new Set([publicOrigin, ...(typeof host === "string" && /^[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(host)
    ? [`https://${host}`] : [])]);
  const fetchSite = request.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.origin;
  if (origin !== undefined) return typeof origin === "string" && allowed.has(origin);
  const referer = request.headers.referer;
  if (typeof referer !== "string") return false;
  try {
    return allowed.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

/** An /atlas path to return to after signing in or a form, or /atlas when the given one is anything else. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 300) return "/atlas";
  const path = value.split("#")[0]!;
  return /^\/atlas(?:\/[A-Za-z0-9._-]+)*$/u.test(path) && !path.split("/").some((segment) => segment === "." ||
    segment === "..")
    ? path
    : "/atlas";
}

// Form bodies -----------------------------------------------------------------------------------------------------------

export class AtlasFormError extends Error {
  constructor(readonly status: 400 | 413 | 415) {
    super(`ATLAS_FORM_${status}`);
  }
}

/** A form post's fields: application/x-www-form-urlencoded, at most ATLAS_FORM_MAX_BYTES. */
export async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const type = String(request.headers["content-type"] ?? "");
  if (!/^application\/x-www-form-urlencoded(?:\s*;.*)?$/iu.test(type)) throw new AtlasFormError(415);
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > ATLAS_FORM_MAX_BYTES) throw new AtlasFormError(413);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += bytes.byteLength;
    if (total > ATLAS_FORM_MAX_BYTES) throw new AtlasFormError(413);
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.includes("�")) throw new AtlasFormError(400);
  return new URLSearchParams(text);
}

// Comments and display names ------------------------------------------------------------------------------------------

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

/** A comment as it is stored: line breaks as \n, no control characters, no surrounding space. */
export function normalizedComment(value: string | null): string {
  return (value ?? "").replace(/\r\n?/gu, "\n").trim();
}

/**
 * Why a comment cannot be posted, or undefined: empty, longer than 2,000 characters, a control character, contact
 * details or a link (the design's exact refusal), or a findings card's number; and anything the pages' last check would
 * find in it as a page writes it (a YouTube address in any case, a card's number), which would stop the page.
 */
export function commentProblem(body: string): string | undefined {
  if (body.length === 0) return "Write a comment first.";
  if ([...body].length > 2_000) return "A comment can be at most 2,000 characters.";
  if (CONTROL.test(body)) return "A comment can't hold control characters.";
  // Direction controls can show reversed characters as an address or a link that the checks below never see.
  if (hasDirectionControl(body)) return "A comment can't hold text-direction control characters.";
  const contacts = contactDetailKinds(body);
  const links = linkKinds(body);
  if (contacts.length === 0 && links.length === 1 && links[0] === "bare_domain") {
    return `${CONTACT_REFUSAL} ${BARE_DOMAIN_HINT}`;
  }
  if (contacts.length > 0 || links.length > 0) return CONTACT_REFUSAL;
  // The pages never show a findings card's number (ARF- and four digits or more), whoever writes it.
  if (containsCardReference(body)) return "Comments can't name a findings card.";
  return pageProblem(body, { link: CONTACT_REFUSAL, card: "Comments can't name a findings card.",
    other: "A comment can't hold that text." });
}

/** The refusal for what the pages' last check would find in a text, or undefined when it finds nothing. */
function pageProblem(text: string, words: { link: string; card: string; other: string }): string | undefined {
  const problems = pageGuardProblems(text);
  if (problems.includes("youtube_link")) return words.link;
  if (problems.includes("card_reference")) return words.card;
  return problems.length > 0 ? words.other : undefined;
}

export function normalizedDisplayName(value: string | null): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

/**
 * Why a display name cannot be used, or undefined: empty, longer than 40 characters, a control character, contact
 * details or a link, a findings card's number, AskRigor's own name, or anything else the pages' last check would find
 * in it.
 */
export function displayNameProblem(name: string): string | undefined {
  if (name.length === 0) return "Choose a display name first.";
  // Characters as the store and PostgreSQL count them: code points.
  if ([...name].length > 40) return "A display name can be at most 40 characters.";
  if (CONTROL.test(name)) return "A display name can't hold control characters.";
  if (hasDirectionControl(name)) return "A display name can't hold text-direction control characters.";
  if (contactDetailKinds(name).length > 0 || linkKinds(name).length > 0) return DISPLAY_NAME_REFUSAL;
  if (containsCardReference(name)) return "Display names can't name a findings card.";
  if (namesAskRigor(name)) return "Display names can't use AskRigor's name.";
  return pageProblem(name, { link: DISPLAY_NAME_REFUSAL, card: "Display names can't name a findings card.",
    other: "A display name can't hold that text." });
}

// AskRigor's own name ---------------------------------------------------------------------------------------------------

const BRAND_WORDS: ReadonlySet<string> = new Set(["askrigor", "askrigour"]);

/**
 * The words of a name as the brand check reads them: compatibility form (full-width letters as ASCII), lower case,
 * combining marks removed (ö reads as o), 0 and ø read as o, split at everything that is not a letter or a digit.
 */
function brandWords(name: string): string[] {
  return name.normalize("NFKC").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[0ø]/gu, "o")
    .split(/[^\p{L}\p{N}]+/u).filter((word) => word !== "");
}

/**
 * Whether a display name takes AskRigor's name: a word, or two words side by side, equal to "askrigor" or "askrigour"
 * once read as brandWords does, so "AskRigor team", "Ask Rigor", "AskRig0r" and "AskRigör" are refused and "Task Rigor"
 * is not. Look-alike letters of other scripts (a Cyrillic а) are not read as Latin ones: a stated limit.
 */
export function namesAskRigor(name: string): boolean {
  const words = brandWords(name);
  return words.some((word, index) => BRAND_WORDS.has(word) ||
    (index + 1 < words.length && BRAND_WORDS.has(`${word}${words[index + 1]}`)));
}

// Settings ----------------------------------------------------------------------------------------------------------------

/** A base64url secret of exactly 32 bytes, written canonically, or undefined. */
export function secretFromBase64Url(value: string | undefined): Uint8Array | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") return undefined;
  const bytes = Buffer.from(trimmed, "base64url");
  return bytes.byteLength === 32 && bytes.toString("base64url") === trimmed ? Uint8Array.from(bytes) : undefined;
}

/** The public origin: an https origin with no path, https://askrigor.com by default. */
export function publicOriginFrom(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") return "https://askrigor.com";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && url.origin === trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
