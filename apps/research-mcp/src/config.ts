export const SERVICE_NAME = "askrigor-research";
export const SERVICE_VERSION = "0.1.0";
export const DEFAULT_PORT = 3000;
export const MAX_MCP_REQUEST_BYTES = 1_048_576;

export const SERVER_INSTRUCTIONS =
  "Read-only research retrieval. Preserve identifiers, provenance, pagination and access status. Never treat access failure as negative evidence.";

export const HEALTH_PAYLOAD = {
  status: "ok",
  service: SERVICE_NAME,
  version: SERVICE_VERSION
} as const;
