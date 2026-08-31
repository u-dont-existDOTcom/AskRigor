import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SYNTHETIC_PROLACTINOMA_GAP_SLUG,
  SyntheticProlactinomaGapLoop,
  type SyntheticGapDetailsInput,
} from "../packages/evidence-repository/src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAB_ROOT = resolve(ROOT, "labs/synthetic-evidence-gap");
const DEFAULT_PORT = 43150;
const MAX_BODY_BYTES = 64 * 1024;

const assets = new Map([
  [
    `/evidence-gaps/${SYNTHETIC_PROLACTINOMA_GAP_SLUG}`,
    { path: resolve(LAB_ROOT, "index.html"), type: "text/html; charset=utf-8" },
  ],
  [
    "/synthetic-evidence-gap.css",
    { path: resolve(LAB_ROOT, "styles.css"), type: "text/css; charset=utf-8" },
  ],
  [
    "/synthetic-evidence-gap.js",
    {
      path: resolve(LAB_ROOT, "app.js"),
      type: "text/javascript; charset=utf-8",
    },
  ],
]);

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
}

function json(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  setSecurityHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}

function localRequestAllowed(request: IncomingMessage): boolean {
  const host = request.headers.host ?? "";
  if (!/^(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/u.test(host)) return false;
  const origin = request.headers.origin;
  return (
    origin === undefined ||
    /^http:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/u.test(origin)
  );
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_BODY_BYTES) throw new Error("SYNTHETIC_GAP_REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  if (chunks.length === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SYNTHETIC_GAP_REQUEST_OBJECT_REQUIRED");
  }
  return parsed as Record<string, unknown>;
}

function contributionAction(pathname: string): {
  contributionId: string;
  action: "narrative" | "details" | "publish" | "challenge" | "correct" | "withdraw";
} | null {
  const match = pathname.match(
    /^\/api\/contributions\/(synthetic-gap-[a-z0-9-]+)\/(narrative|details|publish|challenge|correct|withdraw)$/u,
  );
  if (match === null) return null;
  return {
    contributionId: match[1]!,
    action: match[2]! as
      | "narrative"
      | "details"
      | "publish"
      | "challenge"
      | "correct"
      | "withdraw",
  };
}

export function createSyntheticEvidenceGapLabServer(
  lab = new SyntheticProlactinomaGapLoop(),
) {
  return createServer(async (request, response) => {
    try {
      if (!localRequestAllowed(request)) {
        json(response, 421, { error: "SYNTHETIC_GAP_LOCAL_HOST_REQUIRED" });
        return;
      }
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (request.method === "GET" && url.pathname === "/healthz") {
        json(response, 200, {
          ok: true,
          synthetic: true,
          labOnly: true,
          recruitmentActive: false,
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        json(response, 200, lab.snapshot());
        return;
      }
      if (request.method === "GET" && assets.has(url.pathname)) {
        const asset = assets.get(url.pathname)!;
        setSecurityHeaders(response);
        response.statusCode = 200;
        response.setHeader("Content-Type", asset.type);
        response.end(await readFile(asset.path));
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/contributions/start"
      ) {
        const body = await readJson(request);
        json(response, 201, lab.startContribution(body.provenance));
        return;
      }
      if (request.method === "POST") {
        const route = contributionAction(url.pathname);
        if (route !== null) {
          const body = await readJson(request);
          const result = {
            narrative: () =>
              lab.saveUnpromptedAccount(route.contributionId, body.narrative),
            details: () =>
              lab.saveStructuredDetails(
                route.contributionId,
                body as unknown as SyntheticGapDetailsInput,
              ),
            publish: () =>
              lab.consentAndPublish(route.contributionId, {
                publicLead: body.publicLead,
                recontact: body.recontact,
                syntheticOnly: body.syntheticOnly,
              }),
            challenge: () => lab.challengeContribution(route.contributionId),
            correct: () => lab.correctContribution(route.contributionId),
            withdraw: () => lab.withdrawContribution(route.contributionId),
          }[route.action]();
          json(response, 200, { result, state: lab.snapshot() });
          return;
        }
      }
      json(response, 404, { error: "SYNTHETIC_GAP_ROUTE_NOT_FOUND" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SYNTHETIC_GAP_ERROR";
      json(response, 400, { error: message });
    }
  });
}

export async function listenSyntheticEvidenceGapLab(
  input: { port?: number; host?: "127.0.0.1" } = {},
) {
  const port = input.port ?? DEFAULT_PORT;
  const host = input.host ?? "127.0.0.1";
  const server = createSyntheticEvidenceGapLabServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  return { server, host, port };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const parsedPort = Number(process.env.ASKRIGOR_SYNTHETIC_GAP_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error("SYNTHETIC_GAP_PORT_INVALID");
  }
  const { host, port } = await listenSyntheticEvidenceGapLab({ port: parsedPort });
  process.stdout.write(
    `AskRigor synthetic-only evidence-gap lab: http://${host}:${port}/evidence-gaps/${SYNTHETIC_PROLACTINOMA_GAP_SLUG}\n`,
  );
}
