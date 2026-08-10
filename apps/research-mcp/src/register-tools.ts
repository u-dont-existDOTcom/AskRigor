import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ToolAnnotations
} from "@modelcontextprotocol/sdk/types.js";
import { ACCESS_STATUSES, errorEnvelope } from "@askrigor/contracts";
import {
  getProtocolManifest,
  loadProtocol,
  verifyProtocolIntegrity,
  type ProtocolName
} from "@askrigor/protocol";
import {
  fetchPubmedRecord,
  searchEuropePmc,
  searchPubmed
} from "@askrigor/sources";
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
const searchEuropePmcInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000).describe("Europe PMC search query."),
  date_range: dateRangeSchema.optional().describe(
    "Inclusive publication-date range in YYYY-MM-DD format."
  ),
  page_size: z.number().int().min(1).max(100).optional().describe(
    "Requested records per page; allowed range is 1 through 100."
  ),
  cursor: z.string().min(1).max(4_096).optional().describe(
    "Opaque Europe PMC cursor returned by a previous search."
  )
}).strict();
const europePmcRecordSchema = z.object({
  source: z.string(),
  id: z.string(),
  pmid: z.string().optional(),
  pmcid: z.string().optional(),
  doi: z.string().optional(),
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  journal: z.string().optional(),
  year: z.string().optional(),
  cited_by: z.number().int().nonnegative().optional(),
  is_open_access: z.boolean().optional(),
  has_full_text: z.boolean().optional()
}).strict();
const europePmcSearchEnvelopeSchema = z.object({
  provider: z.literal("europe_pmc"),
  record_type: z.literal("europe_pmc_search_result"),
  retrieved_at: z.string(),
  query: z.object({
    query: z.string(),
    date_range: dateRangeSchema.optional()
  }).strict(),
  source_identity: sourceIdentitySchema,
  pagination: paginationSchema,
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  raw_metadata: z.object({ hit_count: z.number().int().nonnegative() }).strict().optional(),
  error: errorSchema.optional(),
  data: z.array(europePmcRecordSchema)
}).strict();

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
const DEFAULT_PUBMED_PAGE_SIZE = 20;
const MAX_PUBMED_PAGE_SIZE = 100;
const DEFAULT_EUROPE_PMC_PAGE_SIZE = 20;
const MAX_EUROPE_PMC_PAGE_SIZE = 100;
const PUBMED_EFETCH_LIMITATION =
  "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated.";

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
        return pubmedToolResult(
          `PubMed search returned ${result.pagination.returned} PMID record(s); access status ${result.access_status}.`,
          result
        );
      } catch (error) {
        return pubmedToolResult(
          "PubMed search retrieval failed; access status error.",
          pubmedSearchFailure(query, date_range, page_size, cursor, error)
        );
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
        return pubmedToolResult(
          `PubMed record ${pmid} retrieval finished with access status ${result.access_status}.`,
          result
        );
      } catch (error) {
        return pubmedToolResult(
          `PubMed record ${pmid} retrieval failed; access status error.`,
          pubmedRecordFailure(pmid, error)
        );
      }
    }
  );

  server.registerTool(
    "search_europe_pmc",
    {
      description:
        "Search Europe PMC records while preserving provider source identifiers and cursors with explicit pagination and access state; no medical conclusions are generated.",
      inputSchema: searchEuropePmcInputSchema,
      outputSchema: europePmcSearchEnvelopeSchema,
      annotations: READ_ONLY_ANNOTATIONS
    },
    async ({ query, date_range, page_size, cursor }) => {
      try {
        const result = await searchEuropePmc({
          query,
          ...(date_range === undefined ? {} : { dateRange: date_range }),
          ...(page_size === undefined ? {} : { pageSize: page_size }),
          ...(cursor === undefined ? {} : { cursor })
        });
        return europePmcToolResult(
          `Europe PMC search returned ${result.pagination.returned} record(s); access status ${result.access_status}.`,
          result
        );
      } catch (error) {
        return europePmcToolResult(
          "Europe PMC search retrieval failed; access status error.",
          europePmcSearchFailure(query, date_range, page_size, cursor, error)
        );
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

function pubmedToolResult(
  text: string,
  structuredContent: object & { error?: unknown }
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...structuredContent },
    ...(structuredContent.error === undefined ? {} : { isError: true })
  };
}

function europePmcToolResult(
  text: string,
  structuredContent: object & { error?: unknown }
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...structuredContent },
    ...(structuredContent.error === undefined ? {} : { isError: true })
  };
}

function pubmedSearchFailure(
  query: string,
  dateRange: { start: string; end: string } | undefined,
  pageSize: number | undefined,
  cursor: string | undefined,
  error: unknown
) {
  return errorEnvelope({
    provider: "pubmed",
    recordType: "pubmed_search_result",
    query: {
      query,
      ...(dateRange === undefined ? {} : { date_range: dateRange })
    },
    pagination: {
      ...(cursor === undefined ? {} : { cursor }),
      page_size: Math.min(pageSize ?? DEFAULT_PUBMED_PAGE_SIZE, MAX_PUBMED_PAGE_SIZE),
      exhausted: false
    },
    returned: 0,
    accessStatus: "error",
    code: pubmedMcpFailureCode(error),
    message: pubmedMcpFailureMessage(error),
    retryable: false,
    data: []
  });
}

function pubmedRecordFailure(pmid: string, error: unknown) {
  return errorEnvelope({
    provider: "pubmed",
    recordType: "pubmed_record",
    primaryIdentifier: pmid,
    sourceIdentity: {
      canonical_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    },
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: "error",
    limitations: [PUBMED_EFETCH_LIMITATION],
    code: pubmedMcpFailureCode(error),
    message: pubmedMcpFailureMessage(error),
    retryable: false,
    data: {}
  });
}

function europePmcSearchFailure(
  query: string,
  dateRange: { start: string; end: string } | undefined,
  pageSize: number | undefined,
  cursor: string | undefined,
  _error: unknown
) {
  return errorEnvelope({
    provider: "europe_pmc",
    recordType: "europe_pmc_search_result",
    query: {
      query,
      ...(dateRange === undefined ? {} : { date_range: dateRange })
    },
    pagination: {
      ...(cursor === undefined ? {} : { cursor }),
      page_size: Math.min(
        pageSize ?? DEFAULT_EUROPE_PMC_PAGE_SIZE,
        MAX_EUROPE_PMC_PAGE_SIZE
      ),
      exhausted: false
    },
    returned: 0,
    accessStatus: "error",
    code: "europe_pmc_tool_failed",
    message: "Europe PMC operation failed",
    retryable: false,
    data: []
  });
}

function pubmedMcpFailureCode(error: unknown): string {
  return isPubmedConfigurationError(error)
    ? "pubmed_configuration_failed"
    : "pubmed_tool_failed";
}

function pubmedMcpFailureMessage(error: unknown): string {
  return isPubmedConfigurationError(error)
    ? "PubMed configuration failed"
    : "PubMed operation failed";
}

function isPubmedConfigurationError(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid PubMed configuration";
}
