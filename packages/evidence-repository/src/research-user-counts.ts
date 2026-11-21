import type { Pool } from "pg";
import { RESEARCH_CALL_RECORD_RETENTION_MS } from "./research-call-record.js";

/**
 * The public user count (the owner's request of 20 Nov 2026): two numbers, never a key, time or row of anyone.
 * `accounts` is the research accounts with research access on; `usedLast7Days` is how many of them had a call AskRigor
 * answered in the 7 days before the count, read from the content-free call record (migration 0032), which holds 7 days.
 */
export interface ResearchUserCounts {
  accounts: number;
  usedLast7Days: number;
}

/** What a count leaves out: the owner's own accounts, by full key or by the 12-character reference the dev list uses. */
export interface ResearchUserCountsQuery {
  excludedAccountKeys: readonly string[];
  excludedReferences: readonly string[];
  at: Date;
}

export interface ResearchUserCountsSource {
  counts(query: ResearchUserCountsQuery): Promise<ResearchUserCounts>;
}

const ACCOUNT_KEY = /^[a-f0-9]{64}$/u;
const ACCOUNT_REFERENCE = /^[a-f0-9]{12}$/u;

/** Only well-formed keys and references reach the query; anything else would match no account anyway. */
function exclusions(query: ResearchUserCountsQuery): { keys: string[]; references: string[] } {
  return {
    keys: [...new Set(query.excludedAccountKeys.filter((key) => ACCOUNT_KEY.test(key)))],
    references: [...new Set(query.excludedReferences.filter((reference) => ACCOUNT_REFERENCE.test(reference)))],
  };
}

const since = (at: Date): Date => new Date(at.getTime() - RESEARCH_CALL_RECORD_RETENTION_MS);

/** For tests: accounts and calls as plain rows, counted as the Postgres query counts them. */
export class InMemoryResearchUserCounts implements ResearchUserCountsSource {
  constructor(
    private readonly accounts: ReadonlyArray<{ accountKey: string; status: "ACTIVE" | "REVOKED" }>,
    private readonly calls: ReadonlyArray<{ accountKey: string; receivedAt: Date; outcome: "answered" | "refused" | "failed" }>,
  ) {}

  async counts(query: ResearchUserCountsQuery): Promise<ResearchUserCounts> {
    const { keys, references } = exclusions(query);
    const counted = this.accounts.filter((account) => account.status === "ACTIVE" &&
      !keys.includes(account.accountKey) && !references.includes(account.accountKey.slice(0, 12)));
    const from = since(query.at);
    const used = counted.filter((account) => this.calls.some((call) => call.accountKey === account.accountKey &&
      call.outcome === "answered" && call.receivedAt > from && call.receivedAt <= query.at));
    return { accounts: counted.length, usedLast7Days: used.length };
  }
}

/**
 * Borrows the research-access pool (PostgresResearchContributorAccessStore.userCounts); its owner closes it. One read of
 * two aggregates: no row leaves the database.
 */
export class PostgresResearchUserCounts implements ResearchUserCountsSource {
  private readonly accountsTable: string;
  private readonly callsTable: string;

  constructor(private readonly pool: Pool, schema = "living_evidence") {
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) throw new Error("INVALID_SCHEMA");
    this.accountsTable = `${schema}.research_use_accounts`;
    this.callsTable = `${schema}.research_call_record`;
  }

  async counts(query: ResearchUserCountsQuery): Promise<ResearchUserCounts> {
    const { keys, references } = exclusions(query);
    const result = await this.pool.query<{ accounts: number; used: number }>(
      `SELECT count(*)::int AS accounts,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM ${this.callsTable} AS call
                 WHERE call.account_key = account.account_key::text
                   AND call.outcome = 'answered'
                   AND call.received_at > $3
                   AND call.received_at <= $4
              ))::int AS used
         FROM ${this.accountsTable} AS account
        WHERE account.status = 'ACTIVE'
          AND NOT (account.account_key::text = ANY($1::text[])
                   OR left(account.account_key::text, 12) = ANY($2::text[]))`,
      [keys, references, since(query.at), query.at],
    );
    const row = result.rows[0];
    const accounts = Number(row?.accounts);
    const used = Number(row?.used);
    if (!Number.isSafeInteger(accounts) || !Number.isSafeInteger(used) || accounts < 0 || used < 0 || used > accounts) {
      throw new Error("RESEARCH_USER_COUNTS_UNREADABLE");
    }
    return { accounts, usedLast7Days: used };
  }
}
