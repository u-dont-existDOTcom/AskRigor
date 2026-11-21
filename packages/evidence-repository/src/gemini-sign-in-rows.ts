import type { Pool } from "pg";

/**
 * Rows of Gemini's sign-in (owner answer 386b; migration 0039_gemini_oauth_store): the state of AskRigor's own
 * authorization server for Google's Gemini app. This store only moves opaque bytes. The application seals every payload
 * and computes every key (HMACs) before a row reaches it, so nothing here can read a token, a code or a subject.
 *
 * Two operations are atomic, as the authorization server library requires against concurrent replay and reuse:
 * `putIfAbsent` (a client assertion's single-use mark) and `consume` (a code's single use). Each reports whether it
 * changed a row; the caller throws when it did not.
 */
export const GEMINI_SIGN_IN_MODELS = [
  "Session",
  "Interaction",
  "AuthorizationCode",
  "AccessToken",
  "RefreshToken",
  "Grant",
  "ReplayDetection",
] as const;

export type GeminiSignInModel = typeof GEMINI_SIGN_IN_MODELS[number];

export interface GeminiSignInRow {
  readonly model: GeminiSignInModel;
  /** HMAC-SHA-256 of the record's id: 32 bytes. */
  readonly key: Buffer;
  /** The sealed record: nonce, ciphertext and tag. */
  readonly payload: Buffer;
  /** HMAC of the grant the record belongs to (a Grant row carries its own). */
  readonly grantKey: Buffer | null;
  /** HMAC of a Session's uid. */
  readonly uidKey: Buffer | null;
  /** HMAC of a Grant's account (its OAuth subject), so one person's links can be found and ended. */
  readonly accountRef: Buffer | null;
  readonly expiresAt: Date | null;
}

export interface GeminiSignInStoredRow {
  readonly key: Buffer;
  readonly payload: Buffer;
  readonly consumedAt: Date | null;
  readonly expiresAt: Date | null;
}

export interface GeminiSignInRowStore {
  /** Inserts the row, or replaces an existing row's payload and indexes; a consumed row stays consumed. */
  put(row: GeminiSignInRow): Promise<void>;
  /** Inserts the row unless an unexpired row with its model and key exists: false then, and nothing changes. */
  putIfAbsent(row: GeminiSignInRow, now: Date): Promise<boolean>;
  /** The row, when it exists and has not expired. */
  get(model: GeminiSignInModel, key: Buffer, now: Date): Promise<GeminiSignInStoredRow | undefined>;
  /** A Session row by the HMAC of its uid, when it exists and has not expired. */
  getSessionByUid(uidKey: Buffer, now: Date): Promise<GeminiSignInStoredRow | undefined>;
  /** Marks the row consumed: false when it is missing, expired or already consumed, and nothing changes. */
  consume(model: GeminiSignInModel, key: Buffer, now: Date): Promise<boolean>;
  delete(model: GeminiSignInModel, key: Buffer): Promise<void>;
  /** Deletes the model's rows of one grant. */
  deleteByGrant(model: GeminiSignInModel, grantKey: Buffer): Promise<void>;
  /** The grant keys of one account's unexpired Grants. */
  grantKeysOfAccount(accountRef: Buffer, now: Date): Promise<Buffer[]>;
  /** Deletes every row, of every model, of these grants (the Grant rows included); returns the Grants deleted. */
  deleteGrants(grantKeys: readonly Buffer[]): Promise<number>;
  /** Deletes expired rows; returns how many. */
  sweep(now: Date): Promise<number>;
}

const KEY_BYTES = 32;

function checkKey(value: Buffer | null, name: string): void {
  if (value !== null && (!Buffer.isBuffer(value) || value.byteLength !== KEY_BYTES)) {
    throw new Error(`GEMINI_SIGN_IN_${name}_INVALID`);
  }
}

function checkRow(row: GeminiSignInRow): void {
  if (!(GEMINI_SIGN_IN_MODELS as readonly string[]).includes(row.model)) throw new Error("GEMINI_SIGN_IN_MODEL_INVALID");
  checkKey(row.key, "KEY");
  checkKey(row.grantKey, "GRANT_KEY");
  checkKey(row.uidKey, "UID_KEY");
  checkKey(row.accountRef, "ACCOUNT_REF");
  if (row.accountRef !== null && row.model !== "Grant") throw new Error("GEMINI_SIGN_IN_ACCOUNT_REF_INVALID");
  if (row.uidKey !== null && row.model !== "Session") throw new Error("GEMINI_SIGN_IN_UID_KEY_INVALID");
  if (!Buffer.isBuffer(row.payload) || row.payload.byteLength < 29 || row.payload.byteLength > 65_536) {
    throw new Error("GEMINI_SIGN_IN_PAYLOAD_INVALID");
  }
  if (row.expiresAt !== null && Number.isNaN(row.expiresAt.getTime())) throw new Error("GEMINI_SIGN_IN_EXPIRY_INVALID");
}

export class PostgresGeminiSignInRowStore implements GeminiSignInRowStore {
  private readonly table: string;

  constructor(private readonly pool: Pool, schema = "living_evidence") {
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) throw new Error("INVALID_SCHEMA");
    this.table = `${schema}.gemini_oauth_store`;
  }

  async put(row: GeminiSignInRow): Promise<void> {
    checkRow(row);
    await this.pool.query(
      `INSERT INTO ${this.table} AS stored
        (model, key, payload, grant_key, uid_key, account_ref, expires_at, consumed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
      ON CONFLICT (model, key) DO UPDATE SET payload = EXCLUDED.payload, grant_key = EXCLUDED.grant_key,
        uid_key = EXCLUDED.uid_key, account_ref = EXCLUDED.account_ref, expires_at = EXCLUDED.expires_at`,
      [row.model, row.key, row.payload, row.grantKey, row.uidKey, row.accountRef, row.expiresAt],
    );
  }

  async putIfAbsent(row: GeminiSignInRow, now: Date): Promise<boolean> {
    checkRow(row);
    const result = await this.pool.query(
      `INSERT INTO ${this.table} AS stored
        (model, key, payload, grant_key, uid_key, account_ref, expires_at, consumed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
      ON CONFLICT (model, key) DO UPDATE SET payload = EXCLUDED.payload, grant_key = EXCLUDED.grant_key,
        uid_key = EXCLUDED.uid_key, account_ref = EXCLUDED.account_ref, expires_at = EXCLUDED.expires_at,
        consumed_at = NULL
      WHERE stored.expires_at IS NOT NULL AND stored.expires_at <= $8`,
      [row.model, row.key, row.payload, row.grantKey, row.uidKey, row.accountRef, row.expiresAt, now],
    );
    return result.rowCount === 1;
  }

  async get(model: GeminiSignInModel, key: Buffer, now: Date): Promise<GeminiSignInStoredRow | undefined> {
    checkKey(key, "KEY");
    const result = await this.pool.query<{
      key: Buffer; payload: Buffer; consumed_at: Date | null; expires_at: Date | null;
    }>(
      `SELECT key, payload, consumed_at, expires_at FROM ${this.table}
        WHERE model = $1 AND key = $2 AND (expires_at IS NULL OR expires_at > $3)`,
      [model, key, now],
    );
    return storedRowOf(result.rows[0]);
  }

  async getSessionByUid(uidKey: Buffer, now: Date): Promise<GeminiSignInStoredRow | undefined> {
    checkKey(uidKey, "UID_KEY");
    const result = await this.pool.query<{
      key: Buffer; payload: Buffer; consumed_at: Date | null; expires_at: Date | null;
    }>(
      `SELECT key, payload, consumed_at, expires_at FROM ${this.table}
        WHERE model = 'Session' AND uid_key = $1 AND (expires_at IS NULL OR expires_at > $2)
        ORDER BY expires_at DESC NULLS FIRST LIMIT 1`,
      [uidKey, now],
    );
    return storedRowOf(result.rows[0]);
  }

  async consume(model: GeminiSignInModel, key: Buffer, now: Date): Promise<boolean> {
    checkKey(key, "KEY");
    const result = await this.pool.query(
      `UPDATE ${this.table} SET consumed_at = $3
        WHERE model = $1 AND key = $2 AND consumed_at IS NULL AND (expires_at IS NULL OR expires_at > $3)`,
      [model, key, now],
    );
    return result.rowCount === 1;
  }

  async delete(model: GeminiSignInModel, key: Buffer): Promise<void> {
    checkKey(key, "KEY");
    await this.pool.query(`DELETE FROM ${this.table} WHERE model = $1 AND key = $2`, [model, key]);
  }

  async deleteByGrant(model: GeminiSignInModel, grantKey: Buffer): Promise<void> {
    checkKey(grantKey, "GRANT_KEY");
    await this.pool.query(`DELETE FROM ${this.table} WHERE model = $1 AND grant_key = $2`, [model, grantKey]);
  }

  async grantKeysOfAccount(accountRef: Buffer, now: Date): Promise<Buffer[]> {
    checkKey(accountRef, "ACCOUNT_REF");
    const result = await this.pool.query<{ grant_key: Buffer }>(
      `SELECT grant_key FROM ${this.table}
        WHERE model = 'Grant' AND account_ref = $1 AND grant_key IS NOT NULL
          AND (expires_at IS NULL OR expires_at > $2)`,
      [accountRef, now],
    );
    return result.rows.map((row) => row.grant_key);
  }

  async deleteGrants(grantKeys: readonly Buffer[]): Promise<number> {
    if (grantKeys.length === 0) return 0;
    for (const grantKey of grantKeys) checkKey(grantKey, "GRANT_KEY");
    const result = await this.pool.query<{ model: string }>(
      `DELETE FROM ${this.table} WHERE grant_key = ANY($1::bytea[]) RETURNING model`,
      [grantKeys],
    );
    return result.rows.filter((row) => row.model === "Grant").length;
  }

  async sweep(now: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM ${this.table} WHERE expires_at IS NOT NULL AND expires_at <= $1`,
      [now],
    );
    return result.rowCount ?? 0;
  }
}

function storedRowOf(row: {
  key: Buffer; payload: Buffer; consumed_at: Date | null; expires_at: Date | null;
} | undefined): GeminiSignInStoredRow | undefined {
  return row === undefined
    ? undefined
    : { key: row.key, payload: row.payload, consumedAt: row.consumed_at, expiresAt: row.expires_at };
}

/** The same semantics in process memory, for tests and local runs; every operation is atomic. */
export class MemoryGeminiSignInRowStore implements GeminiSignInRowStore {
  private readonly rows = new Map<string, {
    row: GeminiSignInRow; consumedAt: Date | null;
  }>();

  private static id(model: GeminiSignInModel, key: Buffer): string {
    return `${model}:${key.toString("hex")}`;
  }

  private static live(entry: { row: GeminiSignInRow }, now: Date): boolean {
    return entry.row.expiresAt === null || entry.row.expiresAt.getTime() > now.getTime();
  }

  private static stored(entry: { row: GeminiSignInRow; consumedAt: Date | null }): GeminiSignInStoredRow {
    return {
      key: Buffer.from(entry.row.key),
      payload: Buffer.from(entry.row.payload),
      consumedAt: entry.consumedAt,
      expiresAt: entry.row.expiresAt,
    };
  }

  /** How many rows are held, of every model (tests). */
  get size(): number {
    return this.rows.size;
  }

  /** A copy of every row (tests: what is at rest). */
  snapshot(): GeminiSignInRow[] {
    return [...this.rows.values()].map(({ row }) => ({ ...row, payload: Buffer.from(row.payload) }));
  }

  async put(row: GeminiSignInRow): Promise<void> {
    checkRow(row);
    const id = MemoryGeminiSignInRowStore.id(row.model, row.key);
    const existing = this.rows.get(id);
    this.rows.set(id, { row: copyRow(row), consumedAt: existing?.consumedAt ?? null });
  }

  async putIfAbsent(row: GeminiSignInRow, now: Date): Promise<boolean> {
    checkRow(row);
    const id = MemoryGeminiSignInRowStore.id(row.model, row.key);
    const existing = this.rows.get(id);
    if (existing !== undefined && !(existing.row.expiresAt !== null && existing.row.expiresAt.getTime() <= now.getTime())) {
      return false;
    }
    this.rows.set(id, { row: copyRow(row), consumedAt: null });
    return true;
  }

  async get(model: GeminiSignInModel, key: Buffer, now: Date): Promise<GeminiSignInStoredRow | undefined> {
    checkKey(key, "KEY");
    const entry = this.rows.get(MemoryGeminiSignInRowStore.id(model, key));
    return entry !== undefined && MemoryGeminiSignInRowStore.live(entry, now)
      ? MemoryGeminiSignInRowStore.stored(entry)
      : undefined;
  }

  async getSessionByUid(uidKey: Buffer, now: Date): Promise<GeminiSignInStoredRow | undefined> {
    checkKey(uidKey, "UID_KEY");
    for (const entry of this.rows.values()) {
      if (entry.row.model === "Session" && entry.row.uidKey?.equals(uidKey) === true &&
        MemoryGeminiSignInRowStore.live(entry, now)) {
        return MemoryGeminiSignInRowStore.stored(entry);
      }
    }
    return undefined;
  }

  async consume(model: GeminiSignInModel, key: Buffer, now: Date): Promise<boolean> {
    checkKey(key, "KEY");
    const entry = this.rows.get(MemoryGeminiSignInRowStore.id(model, key));
    if (entry === undefined || entry.consumedAt !== null || !MemoryGeminiSignInRowStore.live(entry, now)) return false;
    entry.consumedAt = now;
    return true;
  }

  async delete(model: GeminiSignInModel, key: Buffer): Promise<void> {
    checkKey(key, "KEY");
    this.rows.delete(MemoryGeminiSignInRowStore.id(model, key));
  }

  async deleteByGrant(model: GeminiSignInModel, grantKey: Buffer): Promise<void> {
    checkKey(grantKey, "GRANT_KEY");
    for (const [id, entry] of this.rows) {
      if (entry.row.model === model && entry.row.grantKey?.equals(grantKey) === true) this.rows.delete(id);
    }
  }

  async grantKeysOfAccount(accountRef: Buffer, now: Date): Promise<Buffer[]> {
    checkKey(accountRef, "ACCOUNT_REF");
    return [...this.rows.values()]
      .filter((entry) => entry.row.model === "Grant" && entry.row.accountRef?.equals(accountRef) === true &&
        entry.row.grantKey !== null && MemoryGeminiSignInRowStore.live(entry, now))
      .map((entry) => Buffer.from(entry.row.grantKey!));
  }

  async deleteGrants(grantKeys: readonly Buffer[]): Promise<number> {
    for (const grantKey of grantKeys) checkKey(grantKey, "GRANT_KEY");
    let grants = 0;
    for (const [id, entry] of this.rows) {
      if (entry.row.grantKey !== null && grantKeys.some((grantKey) => grantKey.equals(entry.row.grantKey!))) {
        if (entry.row.model === "Grant") grants += 1;
        this.rows.delete(id);
      }
    }
    return grants;
  }

  async sweep(now: Date): Promise<number> {
    let deleted = 0;
    for (const [id, entry] of this.rows) {
      if (!MemoryGeminiSignInRowStore.live(entry, now)) {
        this.rows.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
}

function copyRow(row: GeminiSignInRow): GeminiSignInRow {
  return {
    model: row.model,
    key: Buffer.from(row.key),
    payload: Buffer.from(row.payload),
    grantKey: row.grantKey === null ? null : Buffer.from(row.grantKey),
    uidKey: row.uidKey === null ? null : Buffer.from(row.uidKey),
    accountRef: row.accountRef === null ? null : Buffer.from(row.accountRef),
    expiresAt: row.expiresAt === null ? null : new Date(row.expiresAt.getTime()),
  };
}
