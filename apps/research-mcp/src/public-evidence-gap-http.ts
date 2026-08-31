import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  PostgresPublicGapIntakeStore,
  PUBLIC_PROLACTINOMA_GAP_SLUG,
  PublicEvidenceGapIntakeService,
  publicEvidenceGapDefinition,
} from "@askrigor/evidence-repository";
import { z, ZodError } from "zod";

import type { TokenBucketLimiter } from "./rate-limit.js";
import { createTokenBucketLimiter } from "./rate-limit.js";
import {
  PUBLIC_EVIDENCE_GAP_CSS,
  PUBLIC_EVIDENCE_GAP_JS,
  PUBLIC_EVIDENCE_GAP_PAGE,
} from "./public-evidence-gap-page.js";

const MAX_REQUEST_BYTES = 16 * 1_024;
const DEFAULT_RATE_LIMIT = {
  capacity: 30,
  refillTokensPerMinute: 15,
  maxKeys: 10_000,
  idleTtlMs: 15 * 60_000,
} as const;

export interface PublicEvidenceGapIntakeConfig {
  connectionString: string;
  schema: string;
  ssl: false | { rejectUnauthorized: false };
  encryptionKey: Uint8Array;
  encryptionKeyId: string;
  reviewApiKey: string;
}

export interface PublicEvidenceGapIntakeDispatchOptions {
  pathname: string;
  clientIp: string;
}

export interface PublicEvidenceGapIntakeHandler {
  dispatch(
    request: IncomingMessage,
    response: ServerResponse,
    options: PublicEvidenceGapIntakeDispatchOptions,
  ): Promise<boolean>;
}

export interface CreatePublicEvidenceGapIntakeHandlerOptions {
  service: PublicEvidenceGapIntakeService;
  reviewApiKey: string;
  rateLimiter?: TokenBucketLimiter;
}

export function publicEvidenceGapIntakeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicEvidenceGapIntakeConfig | undefined {
  if (env.ASKRIGOR_EVIDENCE_GAP_INTAKE_ENABLED !== "true") return undefined;
  const connectionString = env.ASKRIGOR_EVIDENCE_GAP_DATABASE_URL?.trim();
  const schema =
    env.ASKRIGOR_EVIDENCE_GAP_DATABASE_SCHEMA?.trim() || "living_evidence";
  const encodedKey = env.ASKRIGOR_EVIDENCE_GAP_ENCRYPTION_KEY_BASE64URL?.trim();
  const encryptionKeyId = env.ASKRIGOR_EVIDENCE_GAP_ENCRYPTION_KEY_ID?.trim();
  const reviewApiKey = env.ASKRIGOR_EVIDENCE_GAP_REVIEW_API_KEY?.trim();
  if (
    connectionString === undefined ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(schema) ||
    encodedKey === undefined ||
    encryptionKeyId === undefined ||
    !/^[A-Za-z0-9._-]{1,100}$/u.test(encryptionKeyId) ||
    reviewApiKey === undefined ||
    Buffer.byteLength(reviewApiKey, "utf8") < 32
  ) {
    throw new Error("Public evidence-gap intake configuration unavailable");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("Public evidence-gap intake configuration unavailable");
  }
  const encryptionKey = Buffer.from(encodedKey, "base64url");
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    encryptionKey.byteLength !== 32
  ) {
    throw new Error("Public evidence-gap intake configuration unavailable");
  }
  const sslMode = env.ASKRIGOR_EVIDENCE_GAP_DATABASE_SSLMODE?.trim() || "disable";
  if (!["disable", "require"].includes(sslMode)) {
    throw new Error("Public evidence-gap intake configuration unavailable");
  }
  return {
    connectionString,
    schema,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : false,
    encryptionKey,
    encryptionKeyId,
    reviewApiKey,
  };
}

export function createPublicEvidenceGapIntakeHandlerFromConfig(
  config: PublicEvidenceGapIntakeConfig,
): PublicEvidenceGapIntakeHandler {
  return createPublicEvidenceGapIntakeHandler({
    service: createPublicEvidenceGapIntakeServiceFromConfig(config),
    reviewApiKey: config.reviewApiKey,
  });
}

export function createPublicEvidenceGapIntakeServiceFromConfig(
  config: PublicEvidenceGapIntakeConfig,
): PublicEvidenceGapIntakeService {
  const store = new PostgresPublicGapIntakeStore({
    connectionString: config.connectionString,
    schema: config.schema,
    ssl: config.ssl,
  });
  return new PublicEvidenceGapIntakeService(store, {
    encryptionKey: config.encryptionKey,
    encryptionKeyId: config.encryptionKeyId,
  });
}

export function createPublicEvidenceGapIntakeHandler(
  options: CreatePublicEvidenceGapIntakeHandlerOptions,
): PublicEvidenceGapIntakeHandler {
  const reviewApiKey = validateApiKey(options.reviewApiKey);
  const rateLimiter = options.rateLimiter ?? createTokenBucketLimiter(DEFAULT_RATE_LIMIT);

  return Object.freeze({
    async dispatch(
      request: IncomingMessage,
      response: ServerResponse,
      dispatchOptions: PublicEvidenceGapIntakeDispatchOptions,
    ): Promise<boolean> {
      const { pathname } = dispatchOptions;
      if (!isEvidenceGapPath(pathname)) return false;

      try {
        if (request.method === "GET" && pathname === `/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}`) {
          writeText(response, 200, "text/html; charset=utf-8", PUBLIC_EVIDENCE_GAP_PAGE);
          return true;
        }
        if (request.method === "GET" && pathname === "/evidence-gap-intake.css") {
          writeText(response, 200, "text/css; charset=utf-8", PUBLIC_EVIDENCE_GAP_CSS);
          return true;
        }
        if (request.method === "GET" && pathname === "/evidence-gap-intake.js") {
          writeText(response, 200, "text/javascript; charset=utf-8", PUBLIC_EVIDENCE_GAP_JS);
          return true;
        }
        if (
          request.method === "GET" &&
          pathname === `/api/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}`
        ) {
          writeJson(response, 200, {
            gap: publicEvidenceGapDefinition,
            rawSubmissionsPublic: false,
            partialSubmissionsAccepted: true,
            privateGptReviewAvailable: true,
          });
          return true;
        }

        if (!rateLimiter.consume(dispatchOptions.clientIp)) {
          writeJson(response, 429, { error: "PUBLIC_GAP_RATE_LIMIT_EXCEEDED" });
          return true;
        }

        const reviewMatch = pathname.match(
          /^\/internal\/evidence-gaps\/([a-z0-9]+(?:-[a-z0-9]+)*)\/review-queue$/u,
        );
        if (request.method === "GET" && reviewMatch !== null) {
          if (!validBearer(request, reviewApiKey)) {
            writeJson(response, 401, { error: "PUBLIC_GAP_REVIEW_AUTH_REQUIRED" });
            return true;
          }
          writeJson(response, 200, await options.service.reviewQueue(reviewMatch[1]));
          return true;
        }

        if (!sameOriginOrAbsent(request)) {
          writeJson(response, 403, { error: "PUBLIC_GAP_ORIGIN_NOT_ALLOWED" });
          return true;
        }
        if (request.method === "POST" && !isJsonContentType(request)) {
          writeJson(response, 415, { error: "PUBLIC_GAP_JSON_REQUIRED" });
          return true;
        }

        if (
          request.method === "POST" &&
          pathname === `/api/evidence-gaps/${PUBLIC_PROLACTINOMA_GAP_SLUG}/submissions/start`
        ) {
          const body = await readJson(request);
          if (typeof body.website === "string" && body.website.length > 0) {
            writeJson(response, 400, { error: "PUBLIC_GAP_FORM_NOT_ACCEPTED" });
            return true;
          }
          writeJson(
            response,
            201,
            await options.service.start({
              gapSlug: PUBLIC_PROLACTINOMA_GAP_SLUG,
              provenance: body.provenance,
            }),
          );
          return true;
        }

        const submissionMatch = pathname.match(
          /^\/api\/evidence-gap-submissions\/([0-9a-f-]{36})(?:\/(narrative|details|submit|withdraw))?$/u,
        );
        if (submissionMatch !== null) {
          const recoveryKey = bearer(request);
          if (recoveryKey === null) {
            writeJson(response, 401, { error: "PUBLIC_GAP_RECOVERY_KEY_REQUIRED" });
            return true;
          }
          const submissionId = submissionMatch[1];
          const action = submissionMatch[2];
          if (request.method === "GET" && action === undefined) {
            writeJson(
              response,
              200,
              await options.service.inspect(submissionId, recoveryKey),
            );
            return true;
          }
          if (request.method === "POST" && action !== undefined) {
            const body = await readJson(request);
            if (action === "narrative") {
              writeJson(
                response,
                200,
                await options.service.saveNarrative(
                  submissionId,
                  recoveryKey,
                  body.narrative,
                ),
              );
              return true;
            }
            if (action === "details") {
              writeJson(
                response,
                200,
                await options.service.saveDetails(submissionId, recoveryKey, body),
              );
              return true;
            }
            if (action === "submit") {
              writeJson(
                response,
                200,
                await options.service.submit(submissionId, recoveryKey, body),
              );
              return true;
            }
            writeJson(
              response,
              200,
              await options.service.withdraw(submissionId, recoveryKey),
            );
            return true;
          }
        }

        writeJson(response, 404, { error: "PUBLIC_GAP_ROUTE_NOT_FOUND" });
        return true;
      } catch (error) {
        const mapped = mapError(error);
        writeJson(response, mapped.status, { error: mapped.code });
        return true;
      }
    },
  });
}

function isEvidenceGapPath(pathname: string): boolean {
  return (
    pathname.startsWith("/evidence-gaps/") ||
    pathname.startsWith("/api/evidence-gaps/") ||
    pathname.startsWith("/api/evidence-gap-submissions/") ||
    pathname.startsWith("/internal/evidence-gaps/") ||
    pathname === "/evidence-gap-intake.css" ||
    pathname === "/evidence-gap-intake.js"
  );
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      throw new Error("PUBLIC_GAP_REQUEST_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PUBLIC_GAP_REQUEST_OBJECT_REQUIRED");
  }
  return value as Record<string, unknown>;
}

function isJsonContentType(request: IncomingMessage): boolean {
  return /^application\/json(?:\s*;|$)/iu.test(
    String(request.headers["content-type"] ?? ""),
  );
}

function sameOriginOrAbsent(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== "string" || request.headers.host === undefined) return false;
  try {
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.host === request.headers.host
    );
  } catch {
    return false;
  }
}

function validateApiKey(value: string): string {
  if (
    value.trim() !== value ||
    /[\r\n]/u.test(value) ||
    Buffer.byteLength(value, "utf8") < 32
  ) {
    throw new Error("PUBLIC_GAP_REVIEW_API_KEY_INVALID");
  }
  return value;
}

function bearer(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const value = header.slice("Bearer ".length);
  return value.length > 0 ? value : null;
}

function validBearer(request: IncomingMessage, expected: string): boolean {
  const actual = bearer(request);
  if (actual === null) return false;
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
}

function writeText(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
): void {
  setSecurityHeaders(response);
  response.writeHead(status, { "content-type": contentType });
  response.end(body);
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  setSecurityHeaders(response);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

function mapError(error: unknown): { status: number; code: string } {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return { status: 400, code: "PUBLIC_GAP_INVALID_INPUT" };
  }
  const code = error instanceof Error ? error.message : "PUBLIC_GAP_INTERNAL_ERROR";
  if (code === "PUBLIC_GAP_SUBMISSION_ACCESS_DENIED") {
    return { status: 404, code };
  }
  if (code === "PUBLIC_GAP_REQUEST_TOO_LARGE") return { status: 413, code };
  if (
    code.endsWith("_STATE_INVALID") ||
    code.endsWith("_REQUIRED_FIRST") ||
    code === "PUBLIC_GAP_NARRATIVE_ALREADY_SAVED" ||
    code === "PUBLIC_GAP_STRUCTURED_STEP_REQUIRED"
  ) {
    return { status: 409, code };
  }
  if (code === "PUBLIC_GAP_NOT_FOUND") return { status: 404, code };
  if (code.startsWith("PUBLIC_GAP_")) return { status: 400, code };
  return { status: 500, code: "PUBLIC_GAP_INTERNAL_ERROR" };
}
