import type { Pool } from "pg";

export const RESEARCH_CALL_RECORD_RETENTION_DAYS = 7 as const;
export const RESEARCH_CALL_RECORD_RETENTION_MS = RESEARCH_CALL_RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1_000;

export interface ResearchCallRecordEntry {
  accountKey: string;
  receivedAt: Date;
  tool: string;
  action: string | null;
  route: "/mcp" | "/mcp/claude" | "/mcp/gemini";
  chatgpt: boolean;
  outcome: "answered" | "refused" | "failed";
  code: string | null;
  durationMs: number;
}

export interface ResearchCallRecordStore {
  record(entry: ResearchCallRecordEntry): Promise<void>;
  list(accountKey: string, now: Date): Promise<ResearchCallRecordEntry[]>;
  sweep(now: Date): Promise<number>;
}

const cutoff = (now: Date): Date => new Date(now.getTime() - RESEARCH_CALL_RECORD_RETENTION_MS);

/** Copy only the disclosed fields, including when a caller supplies an object with extra properties. */
function copy(entry: ResearchCallRecordEntry): ResearchCallRecordEntry {
  return {
    accountKey: entry.accountKey, receivedAt: new Date(entry.receivedAt), tool: entry.tool,
    action: entry.action, route: entry.route, chatgpt: entry.chatgpt, outcome: entry.outcome,
    code: entry.code, durationMs: entry.durationMs,
  };
}

export class InMemoryResearchCallRecordStore implements ResearchCallRecordStore {
  private entries: ResearchCallRecordEntry[] = [];

  async record(entry: ResearchCallRecordEntry): Promise<void> {
    const before = cutoff(entry.receivedAt);
    this.entries = this.entries.filter((row) => row.accountKey !== entry.accountKey || row.receivedAt >= before);
    this.entries.push(copy(entry));
  }

  async list(accountKey: string, now: Date): Promise<ResearchCallRecordEntry[]> {
    const before = cutoff(now);
    return this.entries.filter((row) => row.accountKey === accountKey && row.receivedAt > before)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()).slice(0, 500).map(copy);
  }

  async sweep(now: Date): Promise<number> {
    const count = this.entries.length;
    const before = cutoff(now);
    this.entries = this.entries.filter((row) => row.receivedAt >= before);
    return count - this.entries.length;
  }
}

/** Borrows the research-access pool; its owner remains responsible for closing it. */
export class PostgresResearchCallRecordStore implements ResearchCallRecordStore {
  private readonly table: string;

  constructor(private readonly pool: Pool, schema = "living_evidence") {
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) throw new Error("INVALID_SCHEMA");
    this.table = `${schema}.research_call_record`;
  }

  async record(entry: ResearchCallRecordEntry): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.table} WHERE account_key = $1 AND received_at < $2`,
      [entry.accountKey, cutoff(entry.receivedAt)]);
    await this.pool.query(`INSERT INTO ${this.table}
      (account_key, received_at, tool, action, route, chatgpt, outcome, code, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [entry.accountKey, entry.receivedAt, entry.tool, entry.action, entry.route, entry.chatgpt,
      entry.outcome, entry.code, entry.durationMs]);
  }

  async list(accountKey: string, now: Date): Promise<ResearchCallRecordEntry[]> {
    const result = await this.pool.query<{
      account_key: string; received_at: Date; tool: string; action: string | null;
      route: ResearchCallRecordEntry["route"]; chatgpt: boolean; outcome: ResearchCallRecordEntry["outcome"];
      code: string | null; duration_ms: number;
    }>(`SELECT account_key, received_at, tool, action, route, chatgpt, outcome, code, duration_ms
      FROM ${this.table} WHERE account_key = $1 AND received_at > $2 ORDER BY received_at DESC LIMIT 500`,
    [accountKey, cutoff(now)]);
    return result.rows.map((row) => ({ accountKey: row.account_key, receivedAt: row.received_at,
      tool: row.tool, action: row.action, route: row.route, chatgpt: row.chatgpt, outcome: row.outcome,
      code: row.code, durationMs: row.duration_ms }));
  }

  async sweep(now: Date): Promise<number> {
    const result = await this.pool.query(`DELETE FROM ${this.table} WHERE received_at < $1`, [cutoff(now)]);
    return result.rowCount ?? 0;
  }
}
