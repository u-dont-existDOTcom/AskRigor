import type { Pool } from "pg";

export const RESEARCH_ERROR_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const RESEARCH_ERROR_LOG_APPS = ["chatgpt", "claude", "gemini", "other", "unknown"] as const;
export const RESEARCH_ERROR_LOG_KINDS = [
  "source_timeout", "source_http_error", "source_unavailable", "rate_limited",
  "validation_error", "auth_refused", "internal_error",
] as const;
export const RESEARCH_ERROR_LOG_SOURCES = [
  "pubmed", "europe_pmc", "openalex", "clinicaltrials_gov", "crossref", "retraction_watch",
  "unpaywall", "infoaccess", "publisher", "youtube", "gemini", "reddit", "atlas", "server",
] as const;

export type ResearchErrorLogApp = typeof RESEARCH_ERROR_LOG_APPS[number];
export type ResearchErrorLogKind = typeof RESEARCH_ERROR_LOG_KINDS[number];
export type ResearchErrorLogSource = typeof RESEARCH_ERROR_LOG_SOURCES[number];
export type ResearchPaperIdentifier = { type: "pmid" | "pmcid" | "doi"; value: string };
export interface ResearchErrorLogShape {
  fields: string[];
  word_counts: Record<string, number>;
  options: Record<string, string | number | boolean>;
}

interface ResearchErrorLogBase {
  received_at: string;
  duration_ms: number;
  tool: string;
  app: ResearchErrorLogApp;
  paper_identifiers: ResearchPaperIdentifier[];
}

export type ResearchErrorLogEntry = ResearchErrorLogBase & (
  | { outcome: "slow" }
  | {
    outcome: "error";
    kind: ResearchErrorLogKind;
    source: ResearchErrorLogSource;
    http_status_class?: "4xx" | "5xx";
    shape: ResearchErrorLogShape;
    search_words?: Record<string, string>;
  }
);

export interface ResearchErrorLogStore {
  record(entry: ResearchErrorLogEntry): Promise<void>;
  sweep(now: Date): Promise<number>;
}

/** Uses the research-access pool. The role can insert and expire rows, and can select only their timestamps. */
export class PostgresResearchErrorLogStore implements ResearchErrorLogStore {
  private readonly table: string;

  constructor(private readonly pool: Pool, schema = "living_evidence") {
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) throw new Error("INVALID_SCHEMA");
    this.table = `${schema}.research_error_log`;
  }

  async record(entry: ResearchErrorLogEntry): Promise<void> {
    const error = entry.outcome === "error" ? entry : undefined;
    await this.pool.query(`INSERT INTO ${this.table}
      (received_at, duration_ms, tool, outcome, app, paper_identifiers, kind, source, http_status_class, shape, search_words)
      SELECT $1::timestamptz, $2::integer, $3::text, $4::text, $5::text, $6::jsonb,
        $7::text, $8::text, $9::text, $10::jsonb, $11::jsonb
      WHERE $1::timestamptz > clock_timestamp() - interval '720 hours'`, [
      entry.received_at, entry.duration_ms, entry.tool, entry.outcome, entry.app, JSON.stringify(entry.paper_identifiers),
      error?.kind ?? null, error?.source ?? null, error?.http_status_class ?? null,
      error?.shape ?? null, error?.search_words ?? null,
    ]);
  }

  async sweep(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - RESEARCH_ERROR_LOG_RETENTION_MS);
    return (await this.pool.query(`DELETE FROM ${this.table} WHERE received_at <= $1`, [cutoff])).rowCount ?? 0;
  }
}
