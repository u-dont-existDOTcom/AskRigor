import type { Server } from "node:http";

import { atlasHoldReadiness, atlasHoldReadinessText, type AtlasHoldReadiness } from "./findings/runtime.js";
import { createAskRigorHttpServer } from "./server.js";

/**
 * Starts the HTTP server once it is ready to serve (Codex's fourth review of 17 Nov 2026): while saves publish in the
 * Atlas, the living-person hold must be able to run in the database (atlasHoldReadiness). When it can't, the server
 * says why and doesn't start, so a release that skipped its migrate or provision-research-review-role cannot serve.
 * Resolves to the listening server, or undefined when it didn't start.
 */
export async function startAskRigorServer(options: {
  port: number;
  readiness?: () => Promise<AtlasHoldReadiness>;
  createServer?: () => Server;
  log?: (line: string) => void;
  error?: (line: string) => void;
}): Promise<Server | undefined> {
  const readiness = await (options.readiness ?? (() => atlasHoldReadiness()))();
  if (!readiness.ready) {
    (options.error ?? console.error)(atlasHoldReadinessText(readiness));
    return undefined;
  }
  const server = (options.createServer ?? createAskRigorHttpServer)();
  await new Promise<void>((resolve) => server.listen(options.port, "0.0.0.0", resolve));
  (options.log ?? console.log)(`AskRigor MCP server listening on port ${options.port}`);
  return server;
}
