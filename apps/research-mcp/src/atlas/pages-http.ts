import type { IncomingMessage, ServerResponse } from "node:http";

import { createRemoteJWKSet } from "jose";
import {
  AtlasParticipationError,
  PostgresAtlasPageSource,
  PostgresAtlasParticipationStore,
  type AtlasPageSource,
  type AtlasParticipationStore,
} from "@askrigor/evidence-repository";

import {
  atlasPagesEnabledFromEnv,
  livingEvidenceReuseConfigFromEnv,
  researchContributorAccessConfigFromEnv,
} from "../config.js";
import { createTokenBucketLimiter, type TokenBucketLimiter } from "../rate-limit.js";
import { announcingParticipationStore, atlasChanges, type AtlasChangeSignal } from "./change-signal.js";
import {
  loadAtlasChanges,
  loadAtlasFinding,
  loadAtlasHome,
  loadAtlasTopic,
  type AtlasFindingModel,
  type AtlasFindingParticipationView,
} from "./page-data.js";
import { passesPageGuard } from "./page-guard.js";
import {
  ATLAS_CSS,
  atlasPageProblems,
  findingPath,
  renderAtlasChanges,
  renderAtlasFinding,
  renderAtlasHome,
  renderAtlasMessage,
  renderAtlasNotFound,
  renderAtlasTooManyRequests,
  renderAtlasTopic,
  renderAtlasUnavailable,
} from "./pages.js";
import {
  ATLAS_LOGIN_COOKIE,
  ATLAS_LOGIN_SECONDS,
  ATLAS_SESSION_COOKIE,
  ATLAS_SESSION_SECONDS,
  AtlasFormError,
  AtlasReportSalt,
  commentProblem,
  cookieHeader,
  csrfToken,
  displayNameProblem,
  newSession,
  normalizedComment,
  normalizedDisplayName,
  openSession,
  openSignInState,
  publicOriginFrom,
  readCookie,
  readForm,
  reporterKeyFor,
  reportToken,
  safeReturnPath,
  sameSitePost,
  sealSession,
  sealSignInState,
  secretFromBase64Url,
  validCsrfToken,
  validReportToken,
  type AtlasParticipationSettings,
  type AtlasSession,
} from "./participation.js";
import {
  ATLAS_SIGN_IN_PATH,
  AtlasSignInError,
  finishSignIn,
  startSignIn,
  tenantSignOutUrl,
  type AtlasSignInSettings,
} from "./sign-in.js";

/**
 * The public Atlas pages over HTTP (decision 171, sections 4C to 4E; design
 * docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, sections C to E). The research server answers /atlas,
 * /atlas/topics/<topic key>, /atlas/findings/P-<n>, /atlas/changes and /atlas/atlas.css; any other /atlas path answers
 * 404, and every path answers 404 unless ASKRIGOR_ATLAS_PAGES=enabled. Every /atlas response carries the pages' own
 * content policy and headers. Nothing about a reader is logged; a reader who does not sign in gets no cookie, and the
 * per-address rate limit keeps a counter in memory, as the evidence-gap page's does. Rendered pages are cached in
 * memory for 60 seconds for readers who are not signed in, bounded in number and size, and dropped whenever a
 * publication, an accepted finding, a vote or a comment changes in this process (change-signal.ts).
 *
 * With votes and comments switched on (ASKRIGOR_ATLAS_PARTICIPATION=enabled, every part configured), the sign-in
 * routes (/atlas/auth/login, /atlas/auth/callback, /atlas/auth/logout) and the forms (a finding's /vote and /comments,
 * a comment's /delete and /report, /atlas/account/name and /atlas/account/delete) answer too: every form posts to this
 * origin, passes the Origin check and carries its token; a signed-in reader holds an encrypted session cookie on
 * /atlas, set only at sign-in and cleared at sign-out. Sign-in always starts on the public origin, where the callback
 * and the cookies are.
 */

/** The headers every /atlas response carries, whatever its status. */
export const ATLAS_PAGE_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
});

/** Per address, as the evidence-gap page limits its routes: a burst of 60 pages, then one a second. */
export const ATLAS_PAGES_RATE_LIMIT = {
  capacity: 60,
  refillTokensPerMinute: 60,
  maxKeys: 10_000,
  idleTtlMs: 15 * 60_000,
} as const;

export const ATLAS_PAGE_CACHE_LIMITS = {
  ttlMs: 60_000,
  maxEntries: 256,
  maxBytes: 8 * 1_024 * 1_024,
} as const;

/**
 * Votes and comments (decision 171, section 4E): per participant, 6 comments an hour with 3 at once and 60 votes an
 * hour, as the design sets them; reports, 5 at once and 5 an hour per reporter (a participant, or a day's address
 * hash); display-name changes, 5 at once and 5 an hour. Every post also counts against the address's page limit.
 */
export const ATLAS_PARTICIPATION_LIMITS = {
  comments: { capacity: 3, refillTokensPerMinute: 6 / 60 },
  votes: { capacity: 60, refillTokensPerMinute: 1 },
  reports: { capacity: 5, refillTokensPerMinute: 5 / 60 },
  names: { capacity: 5, refillTokensPerMinute: 5 / 60 },
} as const;

const PUBLICATION_ROUTE = /^\/atlas\/findings\/(P-[1-9][0-9]{3,11})$/u;
const TOPIC_ROUTE = /^\/atlas\/topics\/([a-z0-9][a-z0-9._-]{0,199})$/u;
const FINDING_FORM_ROUTE = /^\/atlas\/findings\/(P-[1-9][0-9]{3,11})\/(vote|comments)$/u;
const COMMENT_FORM_ROUTE = /^\/atlas\/comments\/(C-[1-9][0-9]{3,11})\/(delete|report)$/u;

export type AtlasRoute =
  | { kind: "home" }
  | { kind: "stylesheet" }
  | { kind: "changes" }
  | { kind: "topic"; topicKey: string }
  | { kind: "finding"; publicationNumber: string }
  // Votes and comments (section 4E), only while they are switched on.
  | { kind: "sign-in" }
  | { kind: "callback" }
  | { kind: "sign-out" }
  | { kind: "vote"; publicationNumber: string }
  | { kind: "comment"; publicationNumber: string }
  | { kind: "delete-comment"; publicId: string }
  | { kind: "report-comment"; publicId: string }
  | { kind: "rename" }
  | { kind: "forget" };

type FormRoute = Extract<AtlasRoute,
  { kind: "sign-out" | "vote" | "comment" | "delete-comment" | "report-comment" | "rename" | "forget" }>;
const FORM_KINDS: ReadonlySet<string> = new Set(["sign-out", "vote", "comment", "delete-comment", "report-comment", "rename",
  "forget"]);
const SIGN_IN_KINDS: ReadonlySet<string> = new Set(["sign-in", "callback"]);

/** Whether a path is the Atlas's: /atlas or below it. */
export function isAtlasPath(pathname: string): boolean {
  return pathname === "/atlas" || pathname.startsWith("/atlas/");
}

/** A raw request target under /atlas, before the server checks its form (its own 404 then carries the headers). */
export function isAtlasTarget(target: string | undefined): boolean {
  return target !== undefined && /^\/atlas(?:[/?#]|$)/u.test(target);
}

/**
 * The route an /atlas path names, or undefined for any other path (which answers 404). The sign-in and form routes
 * exist only while votes and comments are switched on.
 */
export function atlasRouteOf(pathname: string, participation = false): AtlasRoute | undefined {
  if (pathname === "/atlas") return { kind: "home" };
  if (pathname === "/atlas/atlas.css") return { kind: "stylesheet" };
  if (pathname === "/atlas/changes") return { kind: "changes" };
  const topic = TOPIC_ROUTE.exec(pathname);
  if (topic !== null) return { kind: "topic", topicKey: topic[1]! };
  const finding = PUBLICATION_ROUTE.exec(pathname);
  if (finding !== null) return { kind: "finding", publicationNumber: finding[1]! };
  if (!participation) return undefined;
  if (pathname === ATLAS_SIGN_IN_PATH) return { kind: "sign-in" };
  if (pathname === "/atlas/auth/callback") return { kind: "callback" };
  if (pathname === "/atlas/auth/logout") return { kind: "sign-out" };
  if (pathname === "/atlas/account/name") return { kind: "rename" };
  if (pathname === "/atlas/account/delete") return { kind: "forget" };
  const findingForm = FINDING_FORM_ROUTE.exec(pathname);
  if (findingForm !== null) {
    return findingForm[2] === "vote" ? { kind: "vote", publicationNumber: findingForm[1]! }
      : { kind: "comment", publicationNumber: findingForm[1]! };
  }
  const commentForm = COMMENT_FORM_ROUTE.exec(pathname);
  if (commentForm !== null) {
    return commentForm[2] === "delete" ? { kind: "delete-comment", publicId: commentForm[1]! }
      : { kind: "report-comment", publicId: commentForm[1]! };
  }
  return undefined;
}

export interface RenderedAtlasPage {
  status: 200 | 403 | 404 | 422;
  html: string;
}

interface CachedAtlasPage extends RenderedAtlasPage {
  bytes: number;
  expiresAt: number;
}

/**
 * Rendered pages by path, for ttlMs; at most maxEntries pages and maxBytes in all, the least recently used dropped
 * first. One render per path at a time; clear() drops everything, and a render that began before it is not kept.
 */
export class AtlasPageCache {
  private readonly entries = new Map<string, CachedAtlasPage>();
  private readonly pending = new Map<string, Promise<RenderedAtlasPage>>();
  private generation = 0;
  private totalBytes = 0;

  constructor(private readonly options: {
    ttlMs: number;
    maxEntries: number;
    maxBytes: number;
    now?: () => number;
  }) {}

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.pending.clear();
    this.totalBytes = 0;
  }

  async get(key: string, render: () => Promise<RenderedAtlasPage>): Promise<RenderedAtlasPage> {
    const now = (this.options.now ?? Date.now)();
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.remove(key);
      if (hit.expiresAt > now) {
        this.insert(key, hit);
        return { status: hit.status, html: hit.html };
      }
    }
    const waiting = this.pending.get(key);
    if (waiting !== undefined) return await waiting;
    const generation = this.generation;
    const rendering = render().then((page) => {
      if (generation === this.generation) {
        const bytes = Buffer.byteLength(page.html, "utf8");
        if (bytes <= this.options.maxBytes) {
          this.insert(key, { ...page, bytes, expiresAt: (this.options.now ?? Date.now)() + this.options.ttlMs });
        }
      }
      return page;
    }).finally(() => {
      if (this.pending.get(key) === rendering) this.pending.delete(key);
    });
    this.pending.set(key, rendering);
    return await rendering;
  }

  private insert(key: string, page: CachedAtlasPage): void {
    this.entries.set(key, page);
    this.totalBytes += page.bytes;
    while (this.entries.size > this.options.maxEntries || this.totalBytes > this.options.maxBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
  }

  private remove(key: string): void {
    const page = this.entries.get(key);
    if (page === undefined) return;
    this.entries.delete(key);
    this.totalBytes -= page.bytes;
  }
}

export interface AtlasPagesDispatchOptions {
  pathname: string;
  clientIp: string;
}

export interface AtlasPagesHandler {
  /** Answers an /atlas path, and returns whether it did. */
  dispatch(request: IncomingMessage, response: ServerResponse, options: AtlasPagesDispatchOptions): Promise<boolean>;
  /** Answers 404, with the pages' headers, a raw /atlas target the server refuses before routing. */
  refuseTarget(request: IncomingMessage, response: ServerResponse): boolean;
}

/** Votes and comments (section 4E): on only when every part is configured, sign-in included. */
export interface AtlasParticipationRuntime {
  settings: AtlasParticipationSettings;
  /** The access role's participation functions. */
  store: AtlasParticipationStore;
  signIn: AtlasSignInSettings;
  /** Each limit's bucket; ATLAS_PARTICIPATION_LIMITS by default. */
  limiters?: Partial<Record<keyof typeof ATLAS_PARTICIPATION_LIMITS, TokenBucketLimiter>>;
}

export interface CreateAtlasPagesHandlerOptions {
  /** ASKRIGOR_ATLAS_PAGES=enabled. */
  enabled: boolean;
  /** What the pages read; undefined while enabled means they are not configured, and answer 503. */
  source?: AtlasPageSource;
  rateLimiter?: TokenBucketLimiter;
  /** The signal that drops the cache; the process's own by default. */
  signal?: AtlasChangeSignal;
  cache?: Partial<typeof ATLAS_PAGE_CACHE_LIMITS>;
  now?: () => number;
  /** Votes, comments and sign-in (ASKRIGOR_ATLAS_PARTICIPATION=enabled); without them no page shows a form. */
  participation?: AtlasParticipationRuntime;
}

function setPageHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(ATLAS_PAGE_HEADERS)) response.setHeader(name, value);
}

function write(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  extra: Record<string, string> = {},
  cookies: readonly string[] = [],
): void {
  setPageHeaders(response);
  if (cookies.length > 0) response.setHeader("set-cookie", [...cookies]);
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-cache",
    ...extra,
  });
  response.end(body);
}

/** A redirect, never cached: 303 after a form or a sign-in, 302 to the tenant's sign-in. */
function redirect(response: ServerResponse, status: 302 | 303, location: string, cookies: readonly string[] = []): void {
  write(response, status, TEXT, "", { location, "cache-control": "no-store" }, cookies);
}

const HTML = "text/html; charset=utf-8";
const TEXT = "text/plain; charset=utf-8";

/** A GET or HEAD carries no body; one that declares a body is refused before it is read. */
function declaresBody(request: IncomingMessage): boolean {
  const length = request.headers["content-length"];
  return request.headers["transfer-encoding"] !== undefined || (length !== undefined && length !== "0");
}

/** The lines a finding page shows after a form, by the done= its redirect carries. */
const NOTICES: Readonly<Record<string, string>> = {
  "signed-in": "You are signed in: you can vote and comment.",
  "signed-out": "You are signed out.",
  voted: "Your vote is saved.",
  "vote-cleared": "Your vote is withdrawn.",
  commented: "Your comment is posted.",
  deleted: "Your comment is deleted.",
  reported: "Thank you: the comment is reported to AskRigor's owner.",
  renamed: "Your display name is saved.",
  forgotten: "Everything you held in the Atlas is deleted: your votes, your comments and your reports.",
};

const queryOf = (request: IncomingMessage) => new URL(request.url ?? "/", "http://atlas.invalid").searchParams;

export function createAtlasPagesHandler(options: CreateAtlasPagesHandlerOptions): AtlasPagesHandler {
  const rateLimiter = options.rateLimiter ?? createTokenBucketLimiter(ATLAS_PAGES_RATE_LIMIT);
  const cache = new AtlasPageCache({ ...ATLAS_PAGE_CACHE_LIMITS, ...options.cache, now: options.now });
  if (options.enabled) (options.signal ?? atlasChanges).subscribe(() => cache.clear());
  const participation = options.participation;
  const limiter = (name: keyof typeof ATLAS_PARTICIPATION_LIMITS) => participation?.limiters?.[name] ??
    createTokenBucketLimiter({ ...ATLAS_PARTICIPATION_LIMITS[name], maxKeys: 10_000, idleTtlMs: 2 * 60 * 60_000 });
  const limits = {
    comments: limiter("comments"),
    votes: limiter("votes"),
    reports: limiter("reports"),
    names: limiter("names"),
  };
  const clock = () => options.now === undefined ? new Date() : new Date(options.now());
  const reportSalt = new AtlasReportSalt();
  /** Where signing in starts: always the public origin, whose callback and cookies the sign-in uses. */
  const signInHref = (settings: AtlasParticipationSettings, returnPath: string) =>
    `${settings.publicOrigin}${ATLAS_SIGN_IN_PATH}?return=${encodeURIComponent(returnPath)}`;

  /** Every rendered page passes the last check: no script, no card reference, no YouTube link. */
  const checked = (page: RenderedAtlasPage): RenderedAtlasPage => {
    if (atlasPageProblems(page.html).length > 0) throw new Error("ATLAS_PAGE_REFUSED");
    return page;
  };

  /** What a finding page's votes and comments render with, for the viewer and the moment. */
  const participationView = (model: AtlasFindingModel, session: AtlasSession | undefined, now: Date,
    extras: { notice?: string | null; signedOut?: boolean; error?: string | null;
      draft?: { body: string; displayName: string } | null }):
    AtlasFindingParticipationView | undefined => {
    if (participation === undefined || model.participation === null) return undefined;
    const settings = participation.settings;
    const raw = model.participation;
    const publicationNumber = model.finding.publicationNumber;
    const own = new Set(raw.viewer?.ownComments ?? []);
    const token = (purpose: string) => csrfToken(settings, session!, purpose);
    // No one's row can stop a page: a comment or a name the last check would refuse is left out, and a draft that holds
    // one is not written back.
    const viewerName = raw.viewer?.displayName ?? null;
    const draft = extras.draft ?? null;
    return {
      totals: { agree: raw.agree, disagree: raw.disagree },
      comments: raw.comments.filter((comment) => passesPageGuard(comment.body) && passesPageGuard(comment.displayName))
        .map((comment) => ({
          ...comment,
          reportToken: session === undefined ? reportToken(settings, comment.publicId, now)
            : token(`report:${comment.publicId}`),
          deleteToken: session !== undefined && own.has(comment.publicId) ? token(`delete:${comment.publicId}`) : null,
        })),
      viewer: session === undefined ? null : {
        displayName: viewerName === null ? null : passesPageGuard(viewerName) ? viewerName : "",
        stopped: raw.viewer?.stopped ?? false,
        vote: raw.viewer?.vote ?? null,
        tokens: {
          vote: token(`vote:${publicationNumber}`),
          comment: token(`comment:${publicationNumber}`),
          name: token("name"),
          signOut: token("sign-out"),
          forget: token("forget"),
        },
      },
      signInHref: signInHref(settings, findingPath(publicationNumber)),
      notice: extras.notice ?? null,
      tenantSignOutHref: extras.signedOut === true ? tenantSignOutUrl(settings, participation.signIn) : null,
      error: extras.error ?? null,
      draft: draft === null ? null : {
        body: passesPageGuard(draft.body) ? draft.body : "",
        displayName: passesPageGuard(draft.displayName) ? draft.displayName : "",
      },
    };
  };

  /** A finding page, with the viewer's votes and comments and the page's notice or refusal. */
  const findingPage = async (source: AtlasPageSource, publicationNumber: string, session: AtlasSession | undefined,
    now: Date, extras: { status?: 200 | 403 | 422; notice?: string | null; signedOut?: boolean; error?: string | null;
      draft?: { body: string; displayName: string } | null } = {}): Promise<RenderedAtlasPage> => {
    const model = await loadAtlasFinding(source, publicationNumber, participation === undefined ? {}
      : { participation: { participantKey: session?.participantKey ?? null } });
    if (model === undefined) return checked({ status: 404, html: renderAtlasNotFound() });
    return checked({ status: extras.status ?? 200, html: renderAtlasFinding(model, participationView(model, session, now, extras)) });
  };

  const render = async (route: Extract<AtlasRoute, { kind: "home" | "changes" | "topic" | "finding" }>,
    source: AtlasPageSource): Promise<RenderedAtlasPage> => {
    switch (route.kind) {
      case "home":
        return checked({ status: 200, html: renderAtlasHome(await loadAtlasHome(source)) });
      case "changes":
        return checked({ status: 200, html: renderAtlasChanges(await loadAtlasChanges(source)) });
      case "topic": {
        const model = await loadAtlasTopic(source, route.topicKey);
        return checked(model === undefined ? { status: 404, html: renderAtlasNotFound() }
          : { status: 200, html: renderAtlasTopic(model) });
      }
      case "finding":
        return await findingPage(source, route.publicationNumber, undefined, clock());
    }
  };

  /** A form or sign-in that cannot go ahead: a short page with the way back, or on. */
  const message = (response: ServerResponse, status: number, title: string, text: string, back: string,
    cookies: readonly string[] = [], linkText = "Go back") => {
    write(response, status, HTML, renderAtlasMessage(title, text, { href: back, text: linkText }), {
      "cache-control": "no-store",
    }, cookies);
  };

  const signInRoute = async (route: Extract<AtlasRoute, { kind: "sign-in" | "callback" }>, request: IncomingMessage,
    response: ServerResponse, runtime: AtlasParticipationRuntime, now: Date) => {
    const query = queryOf(request);
    if (route.kind === "sign-in") {
      const { state, location } = startSignIn(runtime.settings, runtime.signIn, safeReturnPath(query.get("return")), now);
      redirect(response, 302, location,
        [cookieHeader(ATLAS_LOGIN_COOKIE, sealSignInState(runtime.settings, state), "/atlas/auth", ATLAS_LOGIN_SECONDS)]);
      return;
    }
    const clearLogin = cookieHeader(ATLAS_LOGIN_COOKIE, "", "/atlas/auth", 0);
    try {
      const signedIn = await finishSignIn({
        settings: runtime.settings,
        signIn: runtime.signIn,
        query,
        state: openSignInState(runtime.settings, readCookie(request, ATLAS_LOGIN_COOKIE), now),
        now,
      });
      const session = newSession(signedIn.participantKey, now);
      redirect(response, 303, `${signedIn.returnPath}?done=signed-in`, [
        cookieHeader(ATLAS_SESSION_COOKIE, sealSession(runtime.settings, session), "/atlas", ATLAS_SESSION_SECONDS),
        clearLogin,
      ]);
    } catch (error) {
      if (!(error instanceof AtlasSignInError)) throw error;
      message(response, 400, "Sign-in did not complete", error.refusal === "denied"
        ? "The sign-in was cancelled or refused, so you are not signed in."
        : "The sign-in could not be completed, or it took longer than 10 minutes. Nothing about you was kept; you can " +
          "try again.", signInHref(runtime.settings, "/atlas"), [clearLogin], "Try signing in again");
    }
  };

  /** The forms: each from these pages only, with its token, within its limits. */
  const formRoute = async (route: FormRoute, request: IncomingMessage, response: ServerResponse,
    runtime: AtlasParticipationRuntime, source: AtlasPageSource, clientIp: string, now: Date) => {
    const settings = runtime.settings;
    if (!sameSitePost(request, settings.publicOrigin)) {
      message(response, 403, "Form refused", "The form did not come from the Atlas pages, so nothing was changed.", "/atlas");
      return;
    }
    let form: URLSearchParams;
    try {
      form = await readForm(request);
    } catch (error) {
      if (!(error instanceof AtlasFormError)) throw error;
      write(response, error.status, TEXT, error.status === 413 ? "Request too large\n" : "Bad request\n",
        { connection: "close", "cache-control": "no-store" });
      return;
    }
    const session = openSession(settings, readCookie(request, ATLAS_SESSION_COOKIE), now);
    const back = route.kind === "vote" || route.kind === "comment" ? findingPath(route.publicationNumber)
      : safeReturnPath(form.get("return"));
    const expired = () => message(response, 403, "This form has expired",
      "The page was open too long, or you signed in or out since. Nothing was changed: reload the page and try again.", back);
    const done = (notice: keyof typeof NOTICES, anchor: string) => {
      cache.clear();
      redirect(response, 303, `${back}?done=${notice}#${anchor}`);
    };
    const tooMany = () => write(response, 429, HTML, renderAtlasTooManyRequests(), { "retry-after": "60", "cache-control": "no-store" });

    if (route.kind === "report-comment") {
      const valid = validReportToken(settings, route.publicId, form.get("csrf"), now) ||
        (session !== undefined && validCsrfToken(settings, session, `report:${route.publicId}`, form.get("csrf")));
      if (!valid) return expired();
      const reporter = reporterKeyFor(reportSalt, session?.participantKey ?? null, clientIp, now);
      if (!limits.reports.consume(reporter)) return tooMany();
      const outcome = await runtime.store.reportComment(reporter, route.publicId, now.toISOString());
      if (outcome === "not_found") {
        message(response, 404, "Comment not found", "That comment is no longer on the Atlas pages.", back);
        return;
      }
      return done("reported", route.publicId);
    }
    if (session === undefined) {
      if (route.kind === "sign-out") return redirect(response, 303, `${back}?done=signed-out`);
      return redirect(response, 303, signInHref(settings, back));
    }
    const purpose = route.kind === "vote" ? `vote:${route.publicationNumber}`
      : route.kind === "comment" ? `comment:${route.publicationNumber}`
        : route.kind === "delete-comment" ? `delete:${route.publicId}`
          : route.kind === "rename" ? "name" : route.kind === "forget" ? "forget" : "sign-out";
    if (!validCsrfToken(settings, session, purpose, form.get("csrf"))) return expired();
    const key = session.participantKey;
    const at = now.toISOString();
    try {
      switch (route.kind) {
        case "sign-out":
          redirect(response, 303, `${back}?done=signed-out`, [cookieHeader(ATLAS_SESSION_COOKIE, "", "/atlas", 0)]);
          return;
        case "vote": {
          const choice = form.get("vote");
          if (choice !== "agree" && choice !== "disagree" && choice !== "clear") {
            message(response, 400, "Vote not saved", "Choose agree or disagree.", back);
            return;
          }
          if (!limits.votes.consume(key)) return tooMany();
          await runtime.store.setVote(key, route.publicationNumber, choice === "clear" ? null : choice, at);
          return done(choice === "clear" ? "vote-cleared" : "voted", "votes");
        }
        case "comment": {
          const body = normalizedComment(form.get("body"));
          const named = normalizedDisplayName(form.get("displayName"));
          const draft = { body, displayName: named };
          const refuse = async (status: 403 | 422, error: string) => {
            const page = await findingPage(source, route.publicationNumber, session, now, { status, error, draft });
            write(response, page.status, HTML, page.html, { "cache-control": "no-store", vary: "Cookie" });
          };
          const participant = await runtime.store.inspectParticipant(key);
          if (participant?.stopped === true) return await refuse(403, "Your account can't comment in the Atlas.");
          const needsName = participant === null || participant.displayName === null;
          const problem = (needsName ? displayNameProblem(named) : undefined) ?? commentProblem(body);
          if (problem !== undefined) return await refuse(422, problem);
          if (!limits.comments.consume(key)) return tooMany();
          // The first comment brings the display name; posting it and the comment is one step, refused as a whole.
          const publicId = await runtime.store.postComment(key, route.publicationNumber, body, at, needsName ? named : null);
          return done("commented", publicId);
        }
        case "delete-comment": {
          if (!await runtime.store.deleteComment(key, route.publicId)) {
            message(response, 404, "Comment not found", "That comment is not one of yours, or it is already deleted.", back);
            return;
          }
          return done("deleted", "comments");
        }
        case "rename": {
          const named = normalizedDisplayName(form.get("displayName"));
          const problem = displayNameProblem(named);
          if (problem !== undefined) {
            message(response, 422, "Display name not saved", problem, back);
            return;
          }
          if (!limits.names.consume(key)) return tooMany();
          await runtime.store.setDisplayName(key, named, at);
          return done("renamed", "comments");
        }
        case "forget": {
          if (form.get("confirm") !== "yes") {
            message(response, 422, "Nothing was deleted", "Tick the box to confirm that you want everything you hold in " +
              "the Atlas deleted.", back);
            return;
          }
          await runtime.store.forgetParticipant(key, at);
          return done("forgotten", "comments");
        }
      }
    } catch (error) {
      if (!(error instanceof AtlasParticipationError)) throw error;
      switch (error.code) {
        case "NOT_SHOWN":
          message(response, 404, "Finding not found", "That finding is no longer on the Atlas pages, so nothing was saved.",
            "/atlas");
          return;
        case "STOPPED":
          message(response, 403, "Comment not posted", "Your account can't comment in the Atlas.", back);
          return;
        case "DISPLAY_NAME_REQUIRED":
          message(response, 422, route.kind === "rename" ? "Display name not saved" : "Comment not posted",
            route.kind === "rename" ? "Your display name is chosen with your first comment." : "Choose a display name first.",
            back);
          return;
        default:
          message(response, 400, "Not saved", "The form was not valid, so nothing was changed.", back);
          return;
      }
    }
  };

  return Object.freeze({
    refuseTarget(request: IncomingMessage, response: ServerResponse): boolean {
      if (!isAtlasTarget(request.url)) return false;
      write(response, 404, TEXT, "Not found\n");
      return true;
    },

    async dispatch(request: IncomingMessage, response: ServerResponse, dispatchOptions: AtlasPagesDispatchOptions):
      Promise<boolean> {
      const { pathname } = dispatchOptions;
      if (!isAtlasPath(pathname)) return false;
      if (!options.enabled) {
        write(response, 404, TEXT, "Not found\n");
        return true;
      }
      const method = request.method ?? "";
      const route = atlasRouteOf(pathname, participation !== undefined);
      if (route?.kind === "stylesheet") {
        if (method !== "GET" && method !== "HEAD") {
          write(response, 405, TEXT, "Method not allowed\n", { allow: "GET, HEAD", connection: "close" });
        } else {
          write(response, 200, "text/css; charset=utf-8", ATLAS_CSS, { "cache-control": "public, max-age=3600" });
        }
        return true;
      }
      if (!rateLimiter.consume(dispatchOptions.clientIp)) {
        write(response, 429, HTML, renderAtlasTooManyRequests(), { "retry-after": "60" });
        return true;
      }
      if (route === undefined) {
        write(response, 404, HTML, renderAtlasNotFound());
        return true;
      }
      const allowed = FORM_KINDS.has(route.kind) ? ["POST"] : SIGN_IN_KINDS.has(route.kind) ? ["GET"] : ["GET", "HEAD"];
      if (!allowed.includes(method)) {
        write(response, 405, TEXT, "Method not allowed\n", { allow: allowed.join(", "), connection: "close" });
        return true;
      }
      if (method !== "POST" && declaresBody(request)) {
        write(response, 400, TEXT, "Bad request\n", { connection: "close" });
        return true;
      }
      const source = options.source;
      if (source === undefined) {
        write(response, 503, HTML, renderAtlasUnavailable());
        return true;
      }
      try {
        const now = clock();
        if (participation !== undefined && (route.kind === "sign-in" || route.kind === "callback")) {
          await signInRoute(route, request, response, participation, now);
          return true;
        }
        if (participation !== undefined && FORM_KINDS.has(route.kind)) {
          await formRoute(route as FormRoute, request, response, participation, source, dispatchOptions.clientIp, now);
          return true;
        }
        const pageRoute = route as Extract<AtlasRoute, { kind: "home" | "changes" | "topic" | "finding" }>;
        if (participation !== undefined && pageRoute.kind === "finding") {
          const cookie = readCookie(request, ATLAS_SESSION_COOKIE);
          const session = openSession(participation.settings, cookie, now);
          const stale = cookie !== undefined && session === undefined
            ? [cookieHeader(ATLAS_SESSION_COOKIE, "", "/atlas", 0)] : [];
          const done = queryOf(request).get("done") ?? "";
          const notice = Object.hasOwn(NOTICES, done) ? NOTICES[done]! : null;
          if (session !== undefined || notice !== null) {
            // A signed-in reader's page holds their forms' tokens: it is rendered for them, and never cached.
            const page = await findingPage(source, pageRoute.publicationNumber, session, now,
              { notice, signedOut: done === "signed-out" && session === undefined });
            write(response, page.status, HTML, page.html, { "cache-control": "no-store", vary: "Cookie" }, stale);
            return true;
          }
          const page = await cache.get(pathname, () => render(pageRoute, source));
          write(response, page.status, HTML, page.html, { vary: "Cookie" }, stale);
          return true;
        }
        const page = await cache.get(pathname, () => render(pageRoute, source));
        write(response, page.status, HTML, page.html);
      } catch {
        if (!response.headersSent) write(response, 503, HTML, renderAtlasUnavailable());
      }
      return true;
    },
  });
}

/**
 * Votes, comments and sign-in from the environment, all or nothing: ASKRIGOR_ATLAS_PARTICIPATION=enabled; the session
 * key and the participant secret (ASKRIGOR_ATLAS_SESSION_KEY_BASE64URL and ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL,
 * 32 bytes each, different from each other and from the identity secret); the research access configuration, for the
 * identity secret the connector derives account keys with
 * and the access role's database; the Atlas's Auth0 application (ASKRIGOR_ATLAS_AUTH0_CLIENT_ID and
 * ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET); and the tenant the connector uses (ASKRIGOR_OAUTH_ISSUER_URL and
 * ASKRIGOR_OAUTH_JWKS_URL). Without any of them, undefined: the pages show no form and no sign-in link.
 */
export function atlasParticipationFromEnv(env: NodeJS.ProcessEnv = process.env): AtlasParticipationRuntime | undefined {
  if (env.ASKRIGOR_ATLAS_PARTICIPATION?.trim() !== "enabled") return undefined;
  try {
    const sessionKey = secretFromBase64Url(env.ASKRIGOR_ATLAS_SESSION_KEY_BASE64URL);
    const participantSecret = secretFromBase64Url(env.ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL);
    const publicOrigin = publicOriginFrom(env.ASKRIGOR_ATLAS_PUBLIC_ORIGIN);
    const access = researchContributorAccessConfigFromEnv(env);
    const clientId = env.ASKRIGOR_ATLAS_AUTH0_CLIENT_ID?.trim();
    const clientSecret = env.ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET?.trim();
    const issuer = new URL(env.ASKRIGOR_OAUTH_ISSUER_URL?.trim() ?? "");
    const jwks = new URL(env.ASKRIGOR_OAUTH_JWKS_URL?.trim() ?? "");
    if (sessionKey === undefined || participantSecret === undefined || publicOrigin === undefined ||
      access === undefined || clientId === undefined || !/^[A-Za-z0-9._-]{1,200}$/u.test(clientId) ||
      clientSecret === undefined || clientSecret.length < 16 || issuer.protocol !== "https:" || jwks.protocol !== "https:") {
      return undefined;
    }
    // Three secrets for three uses: none may be another.
    const secrets = [sessionKey, participantSecret, access.identitySecret].map((secret) => Buffer.from(secret).toString("hex"));
    if (new Set(secrets).size !== secrets.length) return undefined;
    return {
      settings: { publicOrigin, sessionKey, participantSecret, identitySecret: access.identitySecret },
      store: announcingParticipationStore(new PostgresAtlasParticipationStore({
        connectionString: access.connectionString,
        schema: access.schema,
        ssl: access.ssl,
      })),
      signIn: { issuerUrl: issuer, clientId, clientSecret, jwks: createRemoteJWKSet(jwks) },
    };
  } catch {
    return undefined;
  }
}

/**
 * The pages from the environment: switched off unless ASKRIGOR_ATLAS_PAGES=enabled, and reading through the
 * living-evidence reader (ASKRIGOR_LIVING_EVIDENCE_REUSE_ENABLED=true with its reader URL, the SELECT-only role); switched
 * on without a usable reader configuration, every page answers 503 and the server runs on. Votes and comments come with
 * them when atlasParticipationFromEnv finds every part configured.
 */
export function createAtlasPagesHandlerFromEnv(env: NodeJS.ProcessEnv = process.env): AtlasPagesHandler {
  if (!atlasPagesEnabledFromEnv(env.ASKRIGOR_ATLAS_PAGES)) return createAtlasPagesHandler({ enabled: false });
  let source: AtlasPageSource | undefined;
  try {
    const reader = livingEvidenceReuseConfigFromEnv(env);
    source = reader === undefined ? undefined : new PostgresAtlasPageSource({
      connectionString: reader.connectionString,
      schema: reader.schema,
      ssl: reader.ssl,
      connectionTimeoutMillis: reader.connectionTimeoutMillis,
      queryTimeoutMillis: reader.queryTimeoutMillis,
      statementTimeoutMillis: reader.statementTimeoutMillis,
    });
  } catch {
    source = undefined;
  }
  const participation = atlasParticipationFromEnv(env);
  return createAtlasPagesHandler({ enabled: true, source, ...(participation === undefined ? {} : { participation }) });
}
