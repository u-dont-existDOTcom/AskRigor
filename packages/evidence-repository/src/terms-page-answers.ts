import type { Pool } from "pg";

/**
 * The answers AskRigor's terms page at sign-in has taken (owner answer 419a; the security review of 26 Nov 2026), so
 * the Auth0 Action's token answers once: whoever later reads the page's address (a proxy's log, the browser's history,
 * an extension) cannot use the token again to record a yes, nor turn a Decline into one. A row holds only the SHA-256 of
 * a token (whose own HMAC signature keeps it from being guessed or read back), the first answer given with it, and when
 * the token can no longer be used; rows go once that time has passed (migration 0044, research_terms_page_answers).
 */
export const TERMS_PAGE_DECISIONS = ["accept", "decline"] as const;
export type TermsPageDecision = typeof TERMS_PAGE_DECISIONS[number];

/** A claim's result: the token's first answer, or the answer it was first used for. */
export type TermsPageClaim = { claimed: true } | { claimed: false; decision: TermsPageDecision };

export interface TermsPageAnswerStore {
  /**
   * Claims a token for its first answer: deletes the rows whose time has passed, then keeps this token's SHA-256 with
   * the decision until `usableUntil`, unless the token was answered already; claimed false then, with that answer.
   */
  claim(tokenSha256: string, decision: TermsPageDecision, usableUntil: Date, now: Date): Promise<TermsPageClaim>;
}

const SHA256 = /^[0-9a-f]{64}$/u;

function checkClaim(tokenSha256: string, decision: TermsPageDecision, usableUntil: Date, now: Date): void {
  if (!SHA256.test(tokenSha256)) throw new Error("TERMS_PAGE_ANSWER_KEY_INVALID");
  if (!(TERMS_PAGE_DECISIONS as readonly string[]).includes(decision)) throw new Error("TERMS_PAGE_DECISION_INVALID");
  if (!(usableUntil instanceof Date) || !(now instanceof Date) || Number.isNaN(usableUntil.getTime()) ||
    Number.isNaN(now.getTime())) throw new Error("TERMS_PAGE_ANSWER_TIME_INVALID");
}

/** For tests and a server without the research-access database. */
export class InMemoryTermsPageAnswerStore implements TermsPageAnswerStore {
  private readonly rows = new Map<string, { decision: TermsPageDecision; usableUntil: number }>();

  async claim(tokenSha256: string, decision: TermsPageDecision, usableUntil: Date, now: Date): Promise<TermsPageClaim> {
    checkClaim(tokenSha256, decision, usableUntil, now);
    for (const [key, row] of this.rows) if (row.usableUntil <= now.getTime()) this.rows.delete(key);
    const earlier = this.rows.get(tokenSha256);
    if (earlier !== undefined) return { claimed: false, decision: earlier.decision };
    this.rows.set(tokenSha256, { decision, usableUntil: usableUntil.getTime() });
    return { claimed: true };
  }

  /** How many answers are kept: for tests. */
  get size(): number {
    return this.rows.size;
  }
}

export class PostgresTermsPageAnswerStore implements TermsPageAnswerStore {
  private readonly table: string;

  constructor(private readonly pool: Pool, schema: string) {
    this.table = `${schema}.research_terms_page_answers`;
  }

  async claim(tokenSha256: string, decision: TermsPageDecision, usableUntil: Date, now: Date): Promise<TermsPageClaim> {
    checkClaim(tokenSha256, decision, usableUntil, now);
    await this.pool.query(`DELETE FROM ${this.table} WHERE usable_until <= $1`, [now]);
    // One statement decides which answer is first: a second, concurrent claim of the same token waits for the first and
    // then inserts nothing.
    const inserted = await this.pool.query(
      `INSERT INTO ${this.table} (token_sha256, decision, usable_until) VALUES ($1, $2, $3)
       ON CONFLICT (token_sha256) DO NOTHING`,
      [tokenSha256, decision, usableUntil],
    );
    if (inserted.rowCount === 1) return { claimed: true };
    const earlier = await this.pool.query<{ decision: string }>(
      `SELECT decision FROM ${this.table} WHERE token_sha256 = $1`,
      [tokenSha256],
    );
    const found = earlier.rows[0]?.decision;
    if (found === "accept" || found === "decline") return { claimed: false, decision: found };
    // Gone between the two statements, so its time had passed: the token is refused anyway.
    throw new Error("TERMS_PAGE_ANSWER_UNREADABLE");
  }
}
