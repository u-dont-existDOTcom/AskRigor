import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";
import { ACCESS_STATUSES } from "@askrigor/contracts";
import {
  getProtocolManifest,
  loadProtocol,
  verifyProtocolIntegrity,
  type ProtocolName
} from "@askrigor/protocol";
import { fetchPubmedRecord, searchPubmed } from "@askrigor/sources";
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
  message: z.string(),
  http_status: z.number().int().optional(),
  retryable: z.boolean().optional()
}).strict();

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateRangeSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema
}).strict();
const sourceIdentitySchema = z.object({
  canonical_url: z.string().optional(),
  title: z.string().optional(),
  authors_or_channel: z.array(z.string()).optional()
}).strict();
const paginationSchema = z.object({
  cursor: z.string().optional(),
  next_cursor: z.string().optional(),
  page_size: z.number().int().positive().max(100).optional(),
  returned: z.number().int().nonnegative(),
  exhausted: z.boolean().optional()
}).strict();
const accessStatusSchema = z.enum(ACCESS_STATUSES);
const searchPubmedInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000).describe("PubMed search query."),
  date_range: dateRangeSchema.optional().describe(
    "Inclusive publication-date range in YYYY-MM-DD format."
  ),
  page_size: z.number().int().min(1).optional().describe(
    "Requested records per page; values above 100 are clamped to 100."
  ),
  cursor: z.string().min(1).max(4_096).optional().describe(
    "Opaque cursor returned by a previous PubMed search."
  )
}).strict();
const pubmedSearchRecordSchema = z.object({ pmid: z.string() }).strict();
const pubmedSearchEnvelopeSchema = z.object({
  provider: z.literal("pubmed"),
  record_type: z.literal("pubmed_search_result"),
  retrieved_at: z.string(),
  query: z.object({
    query: z.string(),
    date_range: dateRangeSchema.optional()
  }).strict(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: z.object({ total_count: z.number().int().nonnegative() }).strict().optional(),
  error: errorSchema.optional(),
  data: z.array(pubmedSearchRecordSchema)
}).strict();
const pubmedDateSchema = z.object({
  type: z.string(),
  value: z.string()
}).strict();
const pubmedRecordSchema = z.object({
  pmid: z.string().optional(),
  title: z.string().optional(),
  abstract: z.string().optional(),
  journal: z.string().optional(),
  dates: z.array(pubmedDateSchema).optional(),
  authors: z.array(z.string()).optional(),
  doi: z.string().optional(),
  publication_types: z.array(z.string()).optional()
}).strict();
const pubmedRecordEnvelopeSchema = z.object({
  provider: z.literal("pubmed"),
  record_type: z.literal("pubmed_record"),
  primary_identifier: z.string(),
  retrieved_at: z.string(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  error: errorSchema.optional(),
  data: pubmedRecordSchema
}).strict();

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

  server.registerTool(
    "search_pubmed",
    {
      description:
        "Search PubMed citations and return stable PMIDs with explicit pagination and access state; no medical conclusions are generated.",
      inputSchema: searchPubmedInputSchema,
      outputSchema: pubmedSearchEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, date_range, page_size, cursor }) => {
      try {
        const result = await searchPubmed(
          {
            query,
            ...(date_range === undefined ? {} : { dateRange: date_range }),
            ...(page_size === undefined ? {} : { pageSize: page_size }),
            ...(cursor === undefined ? {} : { cursor })
          },
          ncbiConfig()
        );
        return successfulToolResult(
          `PubMed search returned ${result.pagination.returned} PMID record(s); access status ${result.access_status}.`,
          { ...result }
        );
      } catch {
        return pubmedToolErrorResult();
      }
    }
  );

  server.registerTool(
    "fetch_pubmed_record",
    {
      description:
        "Retrieve one PubMed citation by PMID, preserving only metadata PubMed supplies and making no full-text or medical inference.",
      inputSchema: z.object({
        pmid: z.string().regex(/^[1-9]\d{0,15}$/).describe("PubMed identifier.")
      }).strict(),
      outputSchema: pubmedRecordEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ pmid }) => {
      try {
        const result = await fetchPubmedRecord(pmid, ncbiConfig());
        return successfulToolResult(
          `PubMed record ${pmid} retrieval finished with access status ${result.access_status}.`,
          { ...result }
        );
      } catch {
        return pubmedToolErrorResult();
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

function ncbiConfig() {
  return {
    tool: process.env.NCBI_TOOL ?? "askrigor",
    email: process.env.NCBI_EMAIL ?? "",
    ...(process.env.NCBI_API_KEY === undefined
      ? {}
      : { apiKey: process.env.NCBI_API_KEY })
  };
}

function pubmedToolErrorResult(): CallToolResult {
  return {
    content: [{ type: "text", text: "PubMed operation failed." }],
    isError: true
  };
}
