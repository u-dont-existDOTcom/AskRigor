import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import {
  getProtocolManifest,
  loadProtocol,
  verifyProtocolIntegrity,
  type ProtocolName
} from "@askrigor/protocol";
import { z } from "zod";

import { protocolErrorResult, successfulToolResult } from "./tool-result.js";

const protocolSchema = z.enum(["hrp", "universal"]);
const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  revisionDate: z.string(),
  sha256: z.string()
});
const errorSchema = z.object({
  code: z.string(),
  message: z.string()
});

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};

export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_protocol_manifest",
    {
      description: "Return canonical protocol identity and SHA-256 metadata.",
      inputSchema: {
        protocol: protocolSchema.describe("Canonical protocol to inspect.")
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        manifest: manifestSchema.optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol }) => {
      try {
        const manifest = await getProtocolManifest(protocol);
        return successfulToolResult(
          `Protocol manifest: ${manifest.name} ${manifest.version} (${manifest.revisionDate}); SHA-256 ${manifest.sha256}.`,
          { ok: true, protocol, manifest }
        );
      } catch (error) {
        return protocolErrorResult(protocol, error);
      }
    }
  );

  server.registerTool(
    "load_protocol",
    {
      description: "Load the complete, unmodified canonical protocol text.",
      inputSchema: {
        protocol: protocolSchema.describe("Canonical protocol to load in full.")
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        manifest: manifestSchema.optional(),
        text: z.string().optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol }) => {
      try {
        const [text, manifest] = await Promise.all([
          loadProtocol(protocol),
          getProtocolManifest(protocol)
        ]);
        return successfulToolResult(
          `Loaded the complete canonical ${manifest.name} protocol.`,
          { ok: true, protocol, manifest, text }
        );
      } catch (error) {
        return protocolErrorResult(protocol, error);
      }
    }
  );

  server.registerTool(
    "verify_protocol_integrity",
    {
      description: "Validate canonical protocol structure and optionally match its SHA-256.",
      inputSchema: {
        protocol: protocolSchema.describe("Canonical protocol to verify."),
        expected_sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional()
          .describe("Optional lowercase SHA-256 digest that must match exactly.")
      },
      outputSchema: {
        ok: z.boolean(),
        protocol: protocolSchema,
        verified: z.boolean().optional(),
        manifest: manifestSchema.optional(),
        error: errorSchema.optional()
      },
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ protocol, expected_sha256 }) => {
      try {
        const manifest = await verifyIntegrity(protocol, expected_sha256);
        return successfulToolResult(
          `Protocol integrity verified for ${manifest.name}; SHA-256 ${manifest.sha256}.`,
          { ok: true, protocol, verified: true, manifest }
        );
      } catch (error) {
        return protocolErrorResult(protocol, error);
      }
    }
  );
}

async function verifyIntegrity(
  protocol: ProtocolName,
  expectedSha256: string | undefined
) {
  return expectedSha256 === undefined
    ? getProtocolManifest(protocol)
    : verifyProtocolIntegrity(protocol, expectedSha256);
}
