import type { GeminiSignInRowStore } from "@askrigor/evidence-repository";

import type { SignInState } from "../oauth-resource-server.js";
import { createTokenBucketLimiter } from "../rate-limit.js";
import type { GeminiLinks } from "../research-contributor-access-tool.js";
import { geminiSignInSettingsFromEnv, type GeminiSignInSettings } from "./config.js";
import { geminiSignInNote, mcpMethodOf } from "./diagnostics.js";
import { GeminiLogin } from "./login.js";
import { createGeminiAuthorizationServer, type GeminiAuthorizationServer } from "./provider.js";
import { countGeminiLinks, disconnectGeminiLinks } from "./resource.js";
import {
  createGeminiSignInRoutes,
  type GeminiNoticeStep,
  type GeminiSignInDiagnostic,
  type GeminiSignInRoutes,
} from "./routes.js";

export { attachGeminiSurfaceIdentity, writeGeminiChallenge } from "./resource.js";
export type { GeminiNoticeStep } from "./routes.js";

/** Gemini's sign-in as the HTTP server uses it (owner answer 386b). */
export interface GeminiSignIn {
  readonly server: GeminiAuthorizationServer;
  readonly routes: GeminiSignInRoutes;
  readonly links: GeminiLinks;
  /**
   * The step log's line for a research call on /mcp/gemini that carried a token (accepted or refused, and the MCP method
   * by name); nothing when the step log is off or no token came.
   */
  noteResourceCheck(signIn: SignInState | undefined, body: unknown): void;
  /** Stops the hourly sweep of expired rows. */
  stop(): void;
}

/**
 * Its own per-address budget, apart from research's: a link takes about ten requests from the person's browser, and
 * Google's servers make the token requests of every Gemini user from shared addresses.
 */
export const GEMINI_SIGN_IN_RATE_LIMIT = {
  capacity: 120,
  refillTokensPerMinute: 120,
  maxKeys: 10_000,
  idleTtlMs: 10 * 60_000,
} as const;

const SWEEP_MS = 60 * 60 * 1_000;

export function createGeminiSignIn(
  settings: GeminiSignInSettings,
  rows: GeminiSignInRowStore,
  options: {
    fetch?: typeof fetch;
    log?: (line: string) => void;
    /** AskRigor's free-use notice before the consent step (owner answer 419a); without it, no notice is shown. */
    notice?: GeminiNoticeStep;
  } = {},
): GeminiSignIn {
  const log = options.log ?? ((line: string) => console.log(line));
  // Off by default. When on, only fixed names are written (diagnostics.ts): no id, token, address or header value.
  const diagnostic = settings.diagnostics ? (record: GeminiSignInDiagnostic) => log(JSON.stringify(record)) : undefined;
  const server = createGeminiAuthorizationServer(settings, rows, {
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(diagnostic === undefined ? {} : { diagnostic }),
  });
  const login = new GeminiLogin(settings);
  const routes = createGeminiSignInRoutes(server, login, {
    rateLimiter: createTokenBucketLimiter(GEMINI_SIGN_IN_RATE_LIMIT),
    ...(diagnostic === undefined ? {} : { diagnostic }),
    ...(options.notice === undefined ? {} : { notice: options.notice }),
  });
  const note = geminiSignInNote(diagnostic);
  const sweep = setInterval(() => {
    rows.sweep(new Date()).catch(() => undefined);
  }, SWEEP_MS);
  sweep.unref();
  return Object.freeze({
    server,
    routes,
    links: {
      count: (subject: string) => countGeminiLinks(server, subject),
      disconnect: (subject: string) => disconnectGeminiLinks(server, subject),
    },
    noteResourceCheck: (signIn: SignInState | undefined, body: unknown) => {
      if (note === undefined || signIn === undefined || signIn.state === "absent") return;
      note("resource", signIn.state, {
        method: mcpMethodOf(body),
        ...(signIn.state === "refused" ? { reason: signIn.refusal } : {}),
      });
    },
    stop: () => clearInterval(sweep),
  });
}

/**
 * Gemini's sign-in from the environment, or undefined while ASKRIGOR_GEMINI_OAUTH is not "enabled". When it is, OAuth
 * and the research-access database must be configured, or the server refuses to start rather than run half of it. The
 * free-use notice step comes from the server's own research accounts and the terms page's answers on that database.
 */
export function geminiSignInFromEnv(
  rows: GeminiSignInRowStore | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: { notice?: GeminiNoticeStep } = {},
): GeminiSignIn | undefined {
  const settings = geminiSignInSettingsFromEnv(env);
  if (settings === undefined) return undefined;
  if (rows === undefined) throw new Error("ASKRIGOR_GEMINI_OAUTH_NEEDS_RESEARCH_ACCESS_DATABASE");
  return createGeminiSignIn(settings, rows, options.notice === undefined ? {} : { notice: options.notice });
}
