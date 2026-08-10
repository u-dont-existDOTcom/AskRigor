import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ProtocolName } from "@askrigor/protocol";

export function successfulToolResult(
  text: string,
  structuredContent: Record<string, unknown>
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}

export function protocolErrorResult(
  protocol: ProtocolName,
  error: unknown
): CallToolResult {
  const message = error instanceof Error ? error.message : "Unknown protocol error";

  return {
    content: [
      {
        type: "text",
        text: `Protocol operation failed: ${message}`
      }
    ],
    structuredContent: {
      ok: false,
      protocol,
      error: {
        code: "protocol_error",
        message
      }
    },
    isError: true
  };
}
