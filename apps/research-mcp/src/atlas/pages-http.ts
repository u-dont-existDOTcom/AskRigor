import type { IncomingMessage, ServerResponse } from "node:http";

import { PostgresAtlasPageSource, type AtlasPageSource } from "@askrigor/evidence-repository";

import { atlasPagesEnabledFromEnv, livingEvidenceReuseConfigFromEnv } from "../config.js";
import { createTokenBucketLimiter, type TokenBucketLimiter } from "../rate-limit.js";
import { atlasChanges, type AtlasChangeSignal } from "./change-signal.js";
import { loadAtlasChanges, loadAtlasFinding, loadAtlasHome, loadAtlasTopic } from "./page-data.js";
import {
  ATLAS_CSS,
  atlasPageProblems,
  renderAtlasChanges,
  renderAtlasFinding,
  renderAtlasHome,
  renderAtlasNotFound,
  renderAtlasTooManyRequests,
  renderAtlasTopic,
  renderAtlasUnavailable,
} from "./pages.js";

/**
 * The public Atlas pages over HTTP (decision 171, section 4C; design
 * docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, section C). The research server answers /atlas,
 * /atlas/topics/<topic key>, /atlas/findings/P-<n>, /atlas/changes and /atlas/atlas.css; any other /atlas path answers
 * 404, and every path answers 404 unless ASKRIGOR_ATLAS_PAGES=enabled. Every /atlas response carries the pages' own
 * content policy and headers; none sets a cookie, and nothing about a reader is stored or logged (the per-address rate
 * limit keeps a counter in memory, as the evidence-gap page's does). Rendered pages are cached in memory for 60
 * seconds, bounded in number and size, and dropped whenever a publication or an accepted finding changes in this
 * process (change-signal.ts).
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

const PUBLICATION_ROUTE = /^\/atlas\/findings\/(P-[1-9][0-9]{3,11})$/u;
const TOPIC_ROUTE = /^\/atlas\/topics\/([a-z0-9][a-z0-9._-]{0,199})$/u;

export type AtlasRoute =
  | { kind: "home" }
  | { kind: "stylesheet" }
  | { kind: "changes" }
  | { kind: "topic"; topicKey: string }
  | { kind: "finding"; publicationNumber: string };

/** Whether a path is the Atlas's: /atlas or below it. */
export function isAtlasPath(pathname: string): boolean {
  return pathname === "/atlas" || pathname.startsWith("/atlas/");
}

/** A raw request target under /atlas, before the server checks its form (its own 404 then carries the headers). */
export function isAtlasTarget(target: string | undefined): boolean {
  return target !== undefined && /^\/atlas(?:[/?#]|$)/u.test(target);
}

/** The route an /atlas path names, or undefined for any other path (which answers 404). */
export function atlasRouteOf(pathname: string): AtlasRoute | undefined {
  if (pathname === "/atlas") return { kind: "home" };
  if (pathname === "/atlas/atlas.css") return { kind: "stylesheet" };
  if (pathname === "/atlas/changes") return { kind: "changes" };
  const topic = TOPIC_ROUTE.exec(pathname);
  if (topic !== null) return { kind: "topic", topicKey: topic[1]! };
  const finding = PUBLICATION_ROUTE.exec(pathname);
  if (finding !== null) return { kind: "finding", publicationNumber: finding[1]! };
  return undefined;
}

export interface RenderedAtlasPage {
  status: 200 | 404;
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
): void {
  setPageHeaders(response);
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-cache",
    ...extra,
  });
  response.end(body);
}

const HTML = "text/html; charset=utf-8";
const TEXT = "text/plain; charset=utf-8";

/** A GET or HEAD carries no body; one that declares a body is refused before it is read. */
function declaresBody(request: IncomingMessage): boolean {
  const length = request.headers["content-length"];
  return request.headers["transfer-encoding"] !== undefined || (length !== undefined && length !== "0");
}

export function createAtlasPagesHandler(options: CreateAtlasPagesHandlerOptions): AtlasPagesHandler {
  const rateLimiter = options.rateLimiter ?? createTokenBucketLimiter(ATLAS_PAGES_RATE_LIMIT);
  const cache = new AtlasPageCache({ ...ATLAS_PAGE_CACHE_LIMITS, ...options.cache, now: options.now });
  if (options.enabled) (options.signal ?? atlasChanges).subscribe(() => cache.clear());

  const render = async (route: Exclude<AtlasRoute, { kind: "stylesheet" }>, source: AtlasPageSource):
    Promise<RenderedAtlasPage> => {
    let page: RenderedAtlasPage;
    switch (route.kind) {
      case "home":
        page = { status: 200, html: renderAtlasHome(await loadAtlasHome(source)) };
        break;
      case "changes":
        page = { status: 200, html: renderAtlasChanges(await loadAtlasChanges(source)) };
        break;
      case "topic": {
        const model = await loadAtlasTopic(source, route.topicKey);
        page = model === undefined ? { status: 404, html: renderAtlasNotFound() }
          : { status: 200, html: renderAtlasTopic(model) };
        break;
      }
      case "finding": {
        const model = await loadAtlasFinding(source, route.publicationNumber);
        page = model === undefined ? { status: 404, html: renderAtlasNotFound() }
          : { status: 200, html: renderAtlasFinding(model) };
        break;
      }
    }
    // The stores already refuse a script, a card reference or a YouTube link; a page that holds one is not served.
    if (atlasPageProblems(page.html).length > 0) throw new Error("ATLAS_PAGE_REFUSED");
    return page;
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
      const readOnly = request.method === "GET" || request.method === "HEAD";
      const route = atlasRouteOf(pathname);
      if (route?.kind === "stylesheet") {
        if (!readOnly) {
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
      if (!readOnly) {
        write(response, 405, TEXT, "Method not allowed\n", { allow: "GET, HEAD", connection: "close" });
        return true;
      }
      if (declaresBody(request)) {
        write(response, 400, TEXT, "Bad request\n", { connection: "close" });
        return true;
      }
      const source = options.source;
      if (source === undefined) {
        write(response, 503, HTML, renderAtlasUnavailable());
        return true;
      }
      try {
        const page = await cache.get(pathname, () => render(route, source));
        write(response, page.status, HTML, page.html);
      } catch {
        if (!response.headersSent) write(response, 503, HTML, renderAtlasUnavailable());
      }
      return true;
    },
  });
}

/**
 * The pages from the environment: switched off unless ASKRIGOR_ATLAS_PAGES=enabled, and reading through the
 * living-evidence reader (ASKRIGOR_LIVING_EVIDENCE_REUSE_ENABLED=true with its reader URL, the SELECT-only role); switched
 * on without a usable reader configuration, every page answers 503 and the server runs on.
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
  return createAtlasPagesHandler({ enabled: true, source });
}
