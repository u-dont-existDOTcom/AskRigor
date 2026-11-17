import { Pool } from "pg";

/**
 * AskRigor#477, stage 1 (owner answer 329a, 16 November 2026): a free contributor's research dossier, saved privately
 * for the owner's review (migration 0037_research_dossiers). One dossier per account, research target and question;
 * one immutable version per research run that saves it. The research-access role appends and reads back through
 * SECURITY DEFINER functions, which check the account in the same transaction; the review role erases with forget_card.
 */

export const RESEARCH_DOSSIER_IDENTIFIER_SCHEMES = ["doi", "pmid", "pmcid", "nct"] as const;
export type ResearchDossierIdentifierScheme = typeof RESEARCH_DOSSIER_IDENTIFIER_SCHEMES[number];

export interface ResearchDossierAppendInput {
  /** The account's pseudonymous key (64 hexadecimal characters). */
  accountKey: string;
  /** HMAC of the account, the research target's digest and the question's key: the dossier's identity. */
  dossierKey: string;
  /** The findings card's research-thread key, so forget_card finds the dossier. */
  threadKey: string;
  /** Digest of the dossier key, the checked answer's digest and the dossier's digest: a retry returns its version. */
  requestKey: string;
  /** Digest of the dossier as the AI sent it and the checks read it. */
  inputSha256: string;
  /** The stored dossier. */
  payload: Record<string, unknown>;
  /** Digest of the stored dossier (sha256 of its stable JSON). */
  payloadSha256: string;
  /** The findings card saved in the same call, by its number, or null. */
  cardNumber: number | null;
  identifiers: ReadonlyArray<{ scheme: ResearchDossierIdentifierScheme; value: string }>;
  /** The newest version when the save began, or null when there was none. */
  expectedPreviousVersionId: string | null;
  versionId: string;
  at: Date;
}

export type ResearchDossierAppendOutcome = "inserted" | "replayed" | "same_as_latest";

export type ResearchDossierAppendResult =
  | {
    outcome: ResearchDossierAppendOutcome;
    dossierNumber: string;
    versionNumber: number;
    versionId: string;
    payloadSha256: string;
    writtenAlongside: boolean;
  }
  /** The account is not an active free contributor whose yes covers notice v6 with card saving on, as it is now. */
  | { outcome: "account_refused" };

export interface ResearchDossierVersionRead {
  dossierNumber: string;
  versionNumber: number;
  /** null once erased. */
  payload: Record<string, unknown> | null;
  payloadSha256: string | null;
}

export interface ResearchDossierStore {
  latestVersion(accountKey: string, dossierKey: string): Promise<{ versionId: string; versionNumber: number } | null>;
  append(input: ResearchDossierAppendInput): Promise<ResearchDossierAppendResult>;
  readVersion(accountKey: string, versionId: string): Promise<ResearchDossierVersionRead | null>;
}

export interface ResearchDossierEraseInput {
  /**
   * The research thread forget_card forgets: exactly the person who asked. Never a card number, which another person's
   * save of the same findings shares (Codex's review of 16 Nov 2026, finding 1).
   */
  threadKey: string;
  at: Date;
}

export interface ResearchDossierEraser {
  /** Erases the thread's dossiers; returns how many versions it erased. */
  eraseThread(input: ResearchDossierEraseInput): Promise<number>;
}

const HEX_64 = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function assertAppendInput(input: ResearchDossierAppendInput): void {
  for (const value of [input.accountKey, input.dossierKey, input.threadKey, input.requestKey, input.inputSha256,
    input.payloadSha256]) {
    if (!HEX_64.test(value)) throw new Error("RESEARCH_DOSSIER_INPUT_INVALID");
  }
  if (!UUID.test(input.versionId) || (input.expectedPreviousVersionId !== null && !UUID.test(input.expectedPreviousVersionId)) ||
    (input.cardNumber !== null && (!Number.isSafeInteger(input.cardNumber) || input.cardNumber <= 0)) ||
    !(input.at instanceof Date) || Number.isNaN(input.at.getTime()) ||
    // 40 studies, each with up to 4 identifiers given and the aliases its receipts add.
    input.identifiers.length > 400 ||
    input.identifiers.some(({ scheme, value }) => !RESEARCH_DOSSIER_IDENTIFIER_SCHEMES.includes(scheme) ||
      value.length < 1 || value.length > 300)) {
    throw new Error("RESEARCH_DOSSIER_INPUT_INVALID");
  }
}

function assertEraseInput(input: ResearchDossierEraseInput): void {
  if (!HEX_64.test(input.threadKey) || Number.isNaN(input.at.getTime())) {
    throw new Error("RESEARCH_DOSSIER_ERASE_INPUT_INVALID");
  }
}

/** The research-access role's side: append, the newest version and the readback, on the access store's pool. */
export class PostgresResearchDossierStore implements ResearchDossierStore {
  constructor(private readonly pool: Pool, private readonly schema: string) {}

  async latestVersion(accountKey: string, dossierKey: string): Promise<{ versionId: string; versionNumber: number } | null> {
    const result = await this.pool.query<{ version_id: string; version_number: number }>(
      `SELECT version_id, version_number FROM ${this.schema}.latest_research_dossier_version($1, $2)`,
      [accountKey, dossierKey],
    );
    const row = result.rows[0];
    return row === undefined ? null : { versionId: row.version_id, versionNumber: row.version_number };
  }

  async append(input: ResearchDossierAppendInput): Promise<ResearchDossierAppendResult> {
    assertAppendInput(input);
    const result = await this.pool.query<{
      outcome: string;
      dossier_number: string | null;
      version_number: number | null;
      version_id: string | null;
      payload_sha256: string | null;
      written_alongside: boolean | null;
    }>(
      `SELECT outcome, dossier_number, version_number, version_id, payload_sha256, written_alongside
         FROM ${this.schema}.append_research_dossier_version(
           $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::uuid, $11::uuid, $12::timestamptz)`,
      [input.accountKey, input.dossierKey, input.threadKey, input.requestKey, input.inputSha256,
        JSON.stringify(input.payload), input.payloadSha256, input.cardNumber, JSON.stringify(input.identifiers),
        input.expectedPreviousVersionId, input.versionId, input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_APPEND_RESULT_MISSING");
    if (row.outcome === "account_refused") return { outcome: "account_refused" };
    if ((row.outcome !== "inserted" && row.outcome !== "replayed" && row.outcome !== "same_as_latest") ||
      row.dossier_number === null || row.version_number === null || row.version_id === null ||
      row.payload_sha256 === null || row.written_alongside === null) {
      throw new Error("RESEARCH_DOSSIER_APPEND_RESULT_INVALID");
    }
    return {
      outcome: row.outcome,
      dossierNumber: row.dossier_number,
      versionNumber: row.version_number,
      versionId: row.version_id,
      payloadSha256: row.payload_sha256,
      writtenAlongside: row.written_alongside,
    };
  }

  async readVersion(accountKey: string, versionId: string): Promise<ResearchDossierVersionRead | null> {
    if (!UUID.test(versionId)) throw new Error("RESEARCH_DOSSIER_INPUT_INVALID");
    const result = await this.pool.query<{
      dossier_number: string;
      version_number: number;
      payload_json: Record<string, unknown> | null;
      payload_sha256: string | null;
    }>(
      `SELECT dossier_number, version_number, payload_json, payload_sha256
         FROM ${this.schema}.read_research_dossier_version($1, $2::uuid)`,
      [accountKey, versionId],
    );
    const row = result.rows[0];
    return row === undefined ? null : {
      dossierNumber: row.dossier_number,
      versionNumber: row.version_number,
      payload: row.payload_json,
      payloadSha256: row.payload_sha256,
    };
  }
}

/** The review role's side: forget_card's erasure, on its own pool. */
export class PostgresResearchDossierEraser implements ResearchDossierEraser {
  private readonly pool: Pool;

  constructor(private readonly options: {
    connectionString: string;
    schema: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
  }) {
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(options.schema)) throw new Error("RESEARCH_DOSSIER_SCHEMA_INVALID");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ...(options.ssl === undefined ? {} : { ssl: options.ssl }),
      max: 2,
    });
  }

  async eraseThread(input: ResearchDossierEraseInput): Promise<number> {
    assertEraseInput(input);
    const result = await this.pool.query<{ erased: number }>(
      `SELECT ${this.options.schema}.erase_research_dossiers($1, $2::timestamptz) AS erased`,
      [input.threadKey, input.at.toISOString()],
    );
    return result.rows[0]?.erased ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface MemoryVersion {
  versionId: string;
  dossierNumber: string;
  versionNumber: number;
  previousVersionId: string | null;
  inputSha256: string | null;
  payload: Record<string, unknown> | null;
  payloadSha256: string | null;
  cardNumber: number | null;
  identifiers: Array<{ scheme: ResearchDossierIdentifierScheme; value: string }>;
  writtenAlongside: boolean;
  createdAt: Date;
  erasedAt: Date | null;
  events: Array<{ event: "submitted" | "withdrawn" | "accepted" | "rejected" | "erased"; reason: string | null; at: Date }>;
}

interface MemoryDossier {
  dossierNumber: string;
  dossierKey: string | null;
  accountKey: string | null;
  threadKey: string | null;
  erasedAt: Date | null;
}

/**
 * The same rules in memory, for tests: the account check (eligible), one writer per dossier at a time, each request
 * key's replay of the version it got, content equal to the newest version while that version is not withdrawn,
 * rejected or erased, erasure by research thread, and revocation's withdrawal (revoke, which the database does with
 * its trigger).
 */
export class InMemoryResearchDossierStore implements ResearchDossierStore, ResearchDossierEraser {
  private readonly dossiers = new Map<string, MemoryDossier>();
  private readonly versions = new Map<string, MemoryVersion>();
  /** Each request key and the version it got (the database's research_dossier_requests). */
  private readonly requests = new Map<string, string>();
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Accounts revoked here (revoke), as research_use_accounts says REVOKED; the public copies follow them. */
  private readonly revoked = new Set<string>();
  private nextNumber = 1;

  constructor(private readonly options: {
    /** Whether the account may save a dossier now: active, free, notice v6, card saving on. Every account by default. */
    eligible?: (accountKey: string) => boolean | Promise<boolean>;
  } = {}) {}

  async latestVersion(accountKey: string, dossierKey: string): Promise<{ versionId: string; versionNumber: number } | null> {
    const dossier = [...this.dossiers.values()].find((entry) => entry.dossierKey === dossierKey &&
      entry.accountKey === accountKey);
    if (dossier === undefined) return null;
    const latest = this.latestOf(dossier.dossierNumber);
    return latest === undefined ? null : { versionId: latest.versionId, versionNumber: latest.versionNumber };
  }

  async append(input: ResearchDossierAppendInput): Promise<ResearchDossierAppendResult> {
    assertAppendInput(input);
    const previous = this.queues.get(input.dossierKey) ?? Promise.resolve();
    const run = previous.then(() => this.appendNow(input), () => this.appendNow(input));
    this.queues.set(input.dossierKey, run.catch(() => undefined));
    return await run;
  }

  async readVersion(accountKey: string, versionId: string): Promise<ResearchDossierVersionRead | null> {
    const version = this.versions.get(versionId);
    if (version === undefined) return null;
    const dossier = this.dossiers.get(version.dossierNumber)!;
    if (dossier.accountKey !== accountKey) return null;
    return {
      dossierNumber: version.dossierNumber,
      versionNumber: version.versionNumber,
      payload: version.payload === null ? null : structuredClone(version.payload),
      payloadSha256: version.payloadSha256,
    };
  }

  async eraseThread(input: ResearchDossierEraseInput): Promise<number> {
    assertEraseInput(input);
    let erased = 0;
    for (const dossier of this.dossiers.values()) {
      if (dossier.threadKey !== input.threadKey || dossier.erasedAt !== null) continue;
      for (const version of this.versions.values()) {
        if (version.dossierNumber !== dossier.dossierNumber || version.erasedAt !== null) continue;
        version.events.push({ event: "erased", reason: "deletion_requested", at: input.at });
        Object.assign(version, { payload: null, payloadSha256: null, inputSha256: null,
          cardNumber: null, identifiers: [], erasedAt: input.at });
        for (const [request, versionId] of this.requests) if (versionId === version.versionId) this.requests.delete(request);
        erased += 1;
      }
      Object.assign(dossier, { dossierKey: null, accountKey: null, threadKey: null, erasedAt: input.at });
    }
    return erased;
  }

  /** What the database's revocation trigger does: withdraws the account's versions still waiting for review. */
  revoke(accountKey: string, at: Date): number {
    this.revoked.add(accountKey);
    let withdrawn = 0;
    for (const version of this.versions.values()) {
      const dossier = this.dossiers.get(version.dossierNumber)!;
      if (dossier.accountKey !== accountKey || version.erasedAt !== null ||
        version.events.some(({ event }) => event !== "submitted")) continue;
      version.events.push({ event: "withdrawn", reason: "contributor_access_revoked", at });
      withdrawn += 1;
    }
    return withdrawn;
  }

  /**
   * What the public copies need to know of a private version (AskRigor#477 stage 2, research-dossier-publications.ts),
   * as the database's publish function and triggers read it: whose it is, whether it is its dossier's newest,
   * whether it was withdrawn, rejected or erased, and whether its account was revoked.
   */
  versionFacts(versionId: string): {
    accountKey: string | null; dossierNumber: string; versionNumber: number; newest: boolean; closed: boolean;
    erased: boolean; accountRevoked: boolean;
    /** The saved record, as the publish function reads it; null once erased. */
    payload: Record<string, unknown> | null;
  } | undefined {
    const version = this.versions.get(versionId);
    if (version === undefined) return undefined;
    const dossier = this.dossiers.get(version.dossierNumber)!;
    return {
      accountKey: dossier.accountKey,
      dossierNumber: version.dossierNumber,
      versionNumber: version.versionNumber,
      newest: this.latestOf(version.dossierNumber)?.versionId === versionId,
      closed: version.events.some(({ event }) => event === "withdrawn" || event === "rejected" || event === "erased"),
      erased: version.erasedAt !== null,
      accountRevoked: dossier.accountKey !== null && this.revoked.has(dossier.accountKey),
      payload: version.payload === null ? null : structuredClone(version.payload),
    };
  }

  /** Every version's events and state, for tests. */
  snapshot(): Array<{ dossierNumber: string; versionNumber: number; versionId: string; erased: boolean;
    writtenAlongside: boolean; events: string[]; identifiers: number; cardNumber: number | null }> {
    return [...this.versions.values()]
      .sort((left, right) => left.dossierNumber.localeCompare(right.dossierNumber) || left.versionNumber - right.versionNumber)
      .map((version) => ({
        dossierNumber: version.dossierNumber,
        versionNumber: version.versionNumber,
        versionId: version.versionId,
        erased: version.erasedAt !== null,
        writtenAlongside: version.writtenAlongside,
        events: version.events.map(({ event }) => event),
        identifiers: version.identifiers.length,
        cardNumber: version.cardNumber,
      }));
  }

  private latestOf(dossierNumber: string): MemoryVersion | undefined {
    let latest: MemoryVersion | undefined;
    for (const version of this.versions.values()) {
      if (version.dossierNumber === dossierNumber && (latest === undefined || version.versionNumber > latest.versionNumber)) {
        latest = version;
      }
    }
    return latest;
  }

  private async appendNow(input: ResearchDossierAppendInput): Promise<ResearchDossierAppendResult> {
    if (!(await (this.options.eligible?.(input.accountKey) ?? true))) return { outcome: "account_refused" };
    let dossier = [...this.dossiers.values()].find((entry) => entry.dossierKey === input.dossierKey);
    if (dossier === undefined) {
      dossier = {
        dossierNumber: `ARD-${String(this.nextNumber++).padStart(4, "0")}`,
        dossierKey: input.dossierKey,
        accountKey: input.accountKey,
        threadKey: input.threadKey,
        erasedAt: null,
      };
      this.dossiers.set(dossier.dossierNumber, dossier);
    }
    if (dossier.accountKey !== input.accountKey || dossier.threadKey !== input.threadKey) {
      throw new Error("RESEARCH_DOSSIER_IDENTITY_MISMATCH");
    }
    const requested = this.requests.get(input.requestKey);
    const existing = requested === undefined ? undefined : this.versions.get(requested);
    if (existing !== undefined) {
      if (existing.dossierNumber !== dossier.dossierNumber ||
        (existing.inputSha256 !== null && existing.inputSha256 !== input.inputSha256)) {
        throw new Error("RESEARCH_DOSSIER_REQUEST_KEY_MISMATCH");
      }
      return { outcome: "replayed", ...this.resultOf(existing) };
    }
    const latest = this.latestOf(dossier.dossierNumber);
    if (latest !== undefined && latest.inputSha256 === input.inputSha256 &&
      !latest.events.some(({ event }) => event === "withdrawn" || event === "rejected" || event === "erased")) {
      this.requests.set(input.requestKey, latest.versionId);
      return { outcome: "same_as_latest", ...this.resultOf(latest) };
    }
    const version: MemoryVersion = {
      versionId: input.versionId,
      dossierNumber: dossier.dossierNumber,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      previousVersionId: latest?.versionId ?? null,
      inputSha256: input.inputSha256,
      payload: structuredClone(input.payload),
      payloadSha256: input.payloadSha256,
      cardNumber: input.cardNumber,
      identifiers: input.identifiers.map((identifier) => ({ ...identifier })),
      writtenAlongside: latest !== undefined && input.expectedPreviousVersionId !== latest.versionId,
      createdAt: input.at,
      erasedAt: null,
      events: [{ event: "submitted", reason: null, at: input.at }],
    };
    if (this.versions.has(version.versionId)) throw new Error("RESEARCH_DOSSIER_VERSION_EXISTS");
    this.versions.set(version.versionId, version);
    this.requests.set(input.requestKey, version.versionId);
    return { outcome: "inserted", ...this.resultOf(version) };
  }

  private resultOf(version: MemoryVersion): {
    dossierNumber: string; versionNumber: number; versionId: string; payloadSha256: string; writtenAlongside: boolean;
  } {
    return {
      dossierNumber: version.dossierNumber,
      versionNumber: version.versionNumber,
      versionId: version.versionId,
      payloadSha256: version.payloadSha256!,
      writtenAlongside: version.writtenAlongside,
    };
  }
}
