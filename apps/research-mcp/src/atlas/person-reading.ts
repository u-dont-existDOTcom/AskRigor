/**
 * Atlas Release B: the reading that labels claims about named people (design 5.1 and 5.2), and the worker that runs it
 * after every save, for every publication, whoever wrote it (design 4.7). It reads what the pages read, through the
 * page source, so the digest it binds a reading to is the digest of what the routes show; it writes only through the
 * review role's functions. Nothing waits on it: a finding not yet read is simply not shown (or, if it was on the pages
 * before the mark, shown under the banner).
 *
 * - One small call per publication: Opus 5.5 at low effort, the fixed rubric cached, strict JSON, no retries of its
 *   own; the server validates the reply strictly and writes every public word itself.
 * - The day's spend is reserved before each call and settled after it, across workers and restarts; at the cap,
 *   findings wait and the log says so once a day (Fable 4.6d).
 * - Three failed attempts on one digest park a finding (Fable 4.6a). A read finding whose digest changed is read again
 *   only once the new digest has held for a pass (Fable 4.6b). A missed-claim report re-reads by sentence key only,
 *   under its own daily limit (Fable 4.6c).
 * - A refusal is logged with its category, never the text: the owner asked to hear of every guardrail block (19 Nov).
 */
import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import {
  ATLAS_PERSON_HINTS_PER_DAY,
  PostgresAtlasPersonClaimStore,
  type AtlasPageSource,
  type AtlasPersonClaimStore,
  type AtlasPersonReading,
  type AtlasPersonSentenceReading,
} from "@askrigor/evidence-repository";

import { keyFromSecretFile, type MeaningJudgeClient } from "../meaning-judge.js";
import { atlasChanges, type AtlasChangeSignal } from "./change-signal.js";
import { allShown, type ShownFinding } from "./page-data.js";
import {
  PERSON_MAX_SENTENCES,
  PERSON_READING_OUTPUT_SCHEMA,
  PERSON_READING_RUBRIC,
  parsePersonReply,
  personBundleOf,
  personDigestOf,
  personFoldedText,
  personReadingState,
  personSentencesOf,
  relevantRemovalNumbers,
  shownBeforeMark,
  type PersonBundle,
  type PersonReadingProblem,
} from "./person-claims.js";

export type PersonReaderFailure = "error" | "timeout" | "refusal" | "unreadable" | PersonReadingProblem;

export interface PersonReadingUsage { input: number; output: number; cacheWrite: number; cacheRead: number;
  thinking?: number }

/** One call: what it found, or why not; what it cost and took. Never the reply's text. */
export interface PersonReadingCall {
  sentences: AtlasPersonSentenceReading[] | null;
  failure: PersonReaderFailure | null;
  refusalCategory: string | null;
  costUsd: number;
  milliseconds: number;
  usage: PersonReadingUsage;
  stopReason: string | null;
}

export interface PersonReader {
  readonly model: string;
  readonly effort: string;
  /** The most one call on this bundle can cost, reserved before it runs. */
  reserveUsd(bundle: PersonBundle): number;
  read(finding: ShownFinding, bundle: PersonBundle): Promise<PersonReadingCall>;
}

interface Prices { input: number; output: number; cacheWrite: number; cacheRead: number }
// Claude API list prices, USD per million tokens (as the meaning judge's table, 2 November 2026).
const PRICES: Readonly<Record<string, Prices>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};
const EFFORTS = new Set(["low", "medium", "high"]);
export const PERSON_READING_DEFAULT_CAP_USD = 1;
export const PERSON_READING_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_SECONDS = 120;

/** Room for thinking and one short line per sentence (Fable's estimate: nearer 800 tokens out than 300). */
export const personMaxTokens = (bundle: PersonBundle) => Math.min(12_000, 3_000 + 60 * bundle.sentences.length);

export interface PersonReaderDependencies {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
  client?: (settings: { apiKey: string; workspaceId: string | undefined; timeoutMs: number }) => MeaningJudgeClient;
  now?: () => number;
  log?: (line: string) => void;
}

/**
 * The reader from the environment, or undefined when it isn't configured: then nothing is read, new findings stay off
 * the pages and earlier ones keep the banner. Its key file and workspace default to the meaning judge's.
 */
export function createPersonReader(dependencies: PersonReaderDependencies = {}): PersonReader | undefined {
  const env = dependencies.env ?? process.env;
  const log = dependencies.log ?? ((line: string) => console.error(`atlas person reading: ${line}`));
  const now = dependencies.now ?? Date.now;
  const keyFile = (env.ASKRIGOR_ATLAS_PERSON_READING_KEY_FILE ?? env.ASKRIGOR_MEANING_JUDGE_KEY_FILE)?.trim();
  if (keyFile === undefined || keyFile === "") { log("key_file_not_set"); return undefined; }
  let key: string | undefined;
  try {
    key = keyFromSecretFile((dependencies.readFile ?? ((path: string) => readFileSync(path, "utf8")))(keyFile));
  } catch { key = undefined; }
  if (key === undefined) { log("key_file_unreadable"); return undefined; }
  const apiKey = key;
  const model = env.ASKRIGOR_ATLAS_PERSON_READING_MODEL?.trim() || "claude-opus-5-5";
  const effort = env.ASKRIGOR_ATLAS_PERSON_READING_EFFORT?.trim() || "low";
  const workspace = (env.ASKRIGOR_ATLAS_PERSON_READING_WORKSPACE_ID ?? env.ASKRIGOR_MEANING_JUDGE_WORKSPACE_ID)?.trim() ||
    undefined;
  const timeoutSeconds = Number(env.ASKRIGOR_ATLAS_PERSON_READING_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS);
  const prices = PRICES[model];
  if (prices === undefined || !EFFORTS.has(effort) || !Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 ||
    timeoutSeconds > 600 || (workspace !== undefined && !/^wrkspc_[A-Za-z0-9]{8,64}$/u.test(workspace))) {
    log("settings_invalid");
    return undefined;
  }
  const timeoutMs = Math.round(timeoutSeconds * 1_000);
  const client = (dependencies.client ?? sdkClient)({ apiKey, workspaceId: workspace, timeoutMs });
  const costOf = (usage: PersonReadingUsage) => (usage.input * prices.input + usage.output * prices.output +
    usage.cacheWrite * prices.cacheWrite + usage.cacheRead * prices.cacheRead) / 1e6;
  return {
    model,
    effort,
    reserveUsd(bundle) {
      // An upper bound: no token is shorter than a byte, all of it written to the cache, plus every output token.
      const input = Buffer.byteLength(PERSON_READING_RUBRIC, "utf8") + Buffer.byteLength(JSON.stringify(bundle), "utf8");
      return (input * prices.cacheWrite + personMaxTokens(bundle) * prices.output) / 1e6;
    },
    async read(finding, bundle) {
      const started = now();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const empty = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
      const failed = (failure: PersonReaderFailure, usage: PersonReadingUsage = empty, stopReason: string | null = null,
        refusalCategory: string | null = null): PersonReadingCall => {
        log(failure === "refusal" ? `refusal category=${refusalCategory ?? "none"} publication=${finding.publicationNumber}`
          : `${failure} publication=${finding.publicationNumber}`);
        return { sentences: null, failure, refusalCategory, costUsd: costOf(usage), milliseconds: now() - started, usage,
          stopReason };
      };
      try {
        const timedOut = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs);
        });
        const message = await Promise.race([Promise.resolve(client.messages.create({
          model,
          max_tokens: personMaxTokens(bundle),
          // Thinking is always on for this model; effort is its only control.
          output_config: {
            effort: effort as "low" | "medium" | "high",
            format: { type: "json_schema", schema: PERSON_READING_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
          },
          system: [{ type: "text", text: PERSON_READING_RUBRIC, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: JSON.stringify(bundle) }],
        }, { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 })), timedOut]);
        const count = (value: number | null | undefined) =>
          typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
        const usage: PersonReadingUsage = {
          input: count(message.usage?.input_tokens), output: count(message.usage?.output_tokens),
          cacheWrite: count(message.usage?.cache_creation_input_tokens),
          cacheRead: count(message.usage?.cache_read_input_tokens),
          ...(message.usage?.output_tokens_details?.thinking_tokens === undefined ? {}
            : { thinking: count(message.usage.output_tokens_details.thinking_tokens) }),
        };
        const stopReason = message.stop_reason ?? null;
        // A refusal is read before the content, which it may leave incomplete.
        if (stopReason === "refusal") {
          const details = (message as unknown as { stop_details?: { category?: string | null } | null }).stop_details;
          return failed("refusal", usage, stopReason, details?.category ?? null);
        }
        const text = message.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
        if (stopReason !== "end_turn" || text === undefined) return failed("unreadable", usage, stopReason);
        let reply: unknown;
        try { reply = JSON.parse(text); } catch { return failed("unparsable", usage, stopReason); }
        const parsed = parsePersonReply(reply, finding, bundle);
        if (!parsed.ok) return failed(parsed.problem, usage, stopReason);
        return { sentences: parsed.sentences, failure: null, refusalCategory: null, costUsd: costOf(usage),
          milliseconds: now() - started, usage, stopReason };
      } catch {
        return failed(controller.signal.aborted ? "timeout" : "error");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The official SDK's client, bound to the API itself, with no retries or logging of its own (as the judge's). */
function sdkClient(settings: { apiKey: string; workspaceId: string | undefined; timeoutMs: number }): MeaningJudgeClient {
  return new Anthropic({
    apiKey: settings.apiKey,
    baseURL: "https://api.anthropic.com",
    timeout: settings.timeoutMs,
    maxRetries: 0,
    logLevel: "off",
    openTelemetry: false,
    // An organization-scoped key names the workspace it bills.
    ...(settings.workspaceId === undefined ? {} : { defaultHeaders: { "anthropic-workspace-id": settings.workspaceId } }),
  });
}

// The worker -----------------------------------------------------------------------------------------------------------

export interface PersonReadingWorkerOptions {
  source: AtlasPageSource;
  store: AtlasPersonClaimStore;
  reader: PersonReader;
  capUsd: number;
  signal?: AtlasChangeSignal;
  now?: () => Date;
  log?: (line: string) => void;
  /** Calls per pass; the rest wait for the next pass. */
  perPass?: number;
  intervalMs?: number;
}

export interface PersonPassReport {
  read: string[];
  failed: Array<{ publicationNumber: string; failure: PersonReaderFailure | "too_long"; parked: boolean }>;
  waiting: number;
  atCap: boolean;
  costUsd: number;
}

interface Candidate { finding: ShownFinding; reading: AtlasPersonReading | undefined; hintKey: string | null;
  hintDispute: number | null; digest: string; priority: number }

const DAY = 24 * 60 * 60 * 1_000;

export class AtlasPersonReadingWorker {
  private readonly lastSeen = new Map<string, string>();
  private running = false;
  private capLoggedOn = "";

  constructor(private readonly options: PersonReadingWorkerOptions) {}

  private now(): Date { return this.options.now?.() ?? new Date(); }
  private log(line: string): void { (this.options.log ?? ((text) => console.error(`atlas person reading: ${text}`)))(line); }

  /** Runs a pass now and every 30 seconds; returns what stops it. */
  start(): () => void {
    const run = () => { void this.pass().catch(() => this.log("pass_failed")); };
    run();
    const timer = setInterval(run, this.options.intervalMs ?? 30_000);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  async pass(): Promise<PersonPassReport> {
    const report: PersonPassReport = { read: [], failed: [], waiting: 0, atCap: false, costUsd: 0 };
    if (this.running) return report;
    this.running = true;
    try {
      const now = this.now();
      const day = now.toISOString().slice(0, 10);
      // Only publications here: a news item's hints are the news pages' (the news design v3, 3.8).
      const hints = new Map((await this.options.store.takeHints("publication", 5, now.toISOString()))
        .map(({ publicationNumber, sentenceKey, disputeNumber }) => [publicationNumber, { sentenceKey, disputeNumber }]));
      const { candidates, removedNames } = await this.candidates(hints, now);
      report.waiting = candidates.length;
      for (const candidate of candidates.slice(0, this.options.perPass ?? 10)) {
        const { finding, digest } = candidate;
        const at = this.now().toISOString();
        const bundleSize = personSentencesOf(finding).length;
        if (bundleSize > PERSON_MAX_SENTENCES || bundleSize === 0) {
          const failure = await this.options.store.recordFailure({ publicationNumber: finding.publicationNumber, digest,
            at, limit: PERSON_READING_ATTEMPTS, reason: "attempt" });
          report.failed.push({ publicationNumber: finding.publicationNumber, failure: "too_long", parked: failure.parked });
          continue;
        }
        const folded = personFoldedText(finding);
        const names = removedNames.filter((name) => name.length >= 4 && folded.includes(name));
        const removed = names.length === 0 ? [] : await this.options.store.removedTexts(names);
        const bundle = personBundleOf(finding, removed, candidate.hintKey);
        const reserved = this.options.reader.reserveUsd(bundle);
        const allowed = await this.options.store.reserveSpend({ day, amountUsd: reserved, capUsd: this.options.capUsd,
          hint: candidate.hintKey !== null, hintCap: ATLAS_PERSON_HINTS_PER_DAY });
        if (!allowed) {
          report.atCap = true;
          if (this.capLoggedOn !== day) {
            this.capLoggedOn = day;
            this.log(`daily_cap_reached cap_usd=${this.options.capUsd} waiting=${candidates.length}`);
          }
          if (candidate.hintKey === null) break;
          continue;
        }
        // The attempt counts before the call, so a crash or restart mid-call uses one (Codex's review of B).
        await this.options.store.recordFailure({ publicationNumber: finding.publicationNumber, digest, at,
          limit: PERSON_READING_ATTEMPTS, reason: "attempt" });
        const call = await this.options.reader.read(finding, bundle);
        // A call that failed in transport may still have been charged: its whole reservation stays spent.
        const charged = call.failure === "error" || call.failure === "timeout" ? reserved : call.costUsd;
        await this.options.store.settleSpend({ day, reservedUsd: reserved, spentUsd: charged });
        report.costUsd += charged;
        if (call.sentences !== null) {
          await this.options.store.saveReading({ publicationNumber: finding.publicationNumber, digest,
            sentences: call.sentences, model: this.options.reader.model, at: this.now().toISOString() });
          report.read.push(finding.publicationNumber);
          if (candidate.hintDispute !== null) await this.options.store.ackHint(candidate.hintDispute, this.now().toISOString());
          (this.options.signal ?? atlasChanges).announce();
        } else {
          const failure = await this.options.store.recordFailure({ publicationNumber: finding.publicationNumber, digest,
            at: this.now().toISOString(), limit: PERSON_READING_ATTEMPTS,
            reason: call.failure === "refusal" ? `refusal:${(call.refusalCategory ?? "none").replace(/[^a-z_]/gu, "_")}`
              : call.failure ?? "error" });
          if (failure.parked) this.log(`parked publication=${finding.publicationNumber}`);
          report.failed.push({ publicationNumber: finding.publicationNumber, failure: call.failure ?? "error",
            parked: failure.parked });
        }
      }
      return report;
    } finally {
      this.running = false;
    }
  }

  /** What waits for a reading, the findings unshown until read first, then changed ones, then the backfill. */
  private async candidates(hints: ReadonlyMap<string, { sentenceKey: string; disputeNumber: number }>, now: Date):
    Promise<{ candidates: Candidate[]; removedNames: string[] }> {
    return await this.options.source.read(async (reads) => {
      const person = reads.personClaims;
      if (person === undefined) return { candidates: [], removedNames: [] };
      const raw: ShownFinding[] = [];
      for await (const finding of allShown(reads, undefined, true, true)) raw.push(finding);
      const readings = new Map<string, AtlasPersonReading>();
      for (let start = 0; start < raw.length; start += 500) {
        for (const reading of await person.readReadings(raw.slice(start, start + 500).map(({ publicationNumber }) =>
          publicationNumber))) readings.set(reading.publicationNumber, reading);
      }
      const memory = await person.listTakenOffMemory();
      const candidates: Candidate[] = [];
      const seen = new Set<string>();
      for (const finding of raw) {
        if (seen.has(finding.publicationNumber)) continue;
        seen.add(finding.publicationNumber);
        const reading = readings.get(finding.publicationNumber);
        const removals = relevantRemovalNumbers(finding, memory);
        const digest = personDigestOf(finding, removals);
        const hint = hints.get(finding.publicationNumber);
        const hintKey = hint?.sentenceKey ?? null;
        const hintDispute = hint?.disputeNumber ?? null;
        const state = personReadingState(finding, reading, removals);
        const parked = reading?.parked === true && reading.attemptDigest === digest;
        const settled = this.lastSeen.get(finding.publicationNumber) === digest;
        this.lastSeen.set(finding.publicationNumber, digest);
        if (hintKey !== null) { candidates.push({ finding, reading, hintKey, hintDispute, digest, priority: 0 }); continue; }
        if (state === "read" || parked) continue;
        if (state === "stale") {
          // Fable 4.6b: a change is read once it has held for a pass, so a flip-flopping state costs nothing.
          if (settled) candidates.push({ finding, reading, hintKey: null, hintDispute: null, digest, priority: 2 });
          continue;
        }
        candidates.push({ finding, reading, hintKey: null, hintDispute: null, digest,
          priority: shownBeforeMark(finding.publishedAt, person.since, now) ? 3 : 1 });
      }
      candidates.sort((left, right) => left.priority - right.priority);
      return { candidates, removedNames: await person.listRemovedNames() };
    });
  }
}

/** The deletion of dispute texts, links and email addresses after 90 days: at start, then every 6 hours. */
export function startAtlasPersonPurge(store: AtlasPersonClaimStore, log: (line: string) => void =
  (line) => console.error(`atlas person disputes: ${line}`), now: () => Date = () => new Date()): () => void {
  const run = () => { void store.purgeDisputes(new Date(now().getTime() - 90 * DAY).toISOString())
    .catch(() => log("purge_failed")); };
  run();
  const timer = setInterval(run, 6 * 60 * 60 * 1_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** When the mark was switched on (ASKRIGOR_ATLAS_PERSON_MARK, an ISO instant), or undefined: the whole feature is off. */
export function personMarkSinceFromEnv(env: NodeJS.ProcessEnv = process.env, log: (line: string) => void =
  (line) => console.error(`atlas person reading: ${line}`)): string | undefined {
  const raw = env.ASKRIGOR_ATLAS_PERSON_MARK?.trim();
  if (raw === undefined || raw === "") return undefined;
  const at = Date.parse(raw);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(raw) || !Number.isFinite(at)) {
    log("mark_setting_invalid");
    return undefined;
  }
  return new Date(at).toISOString();
}

/** The daily cap (ASKRIGOR_ATLAS_PERSON_READING_DAILY_CAP_USD, default USD 1, inside the owner's USD 7 a day). */
export function personReadingCapFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const cap = Number(env.ASKRIGOR_ATLAS_PERSON_READING_DAILY_CAP_USD ?? PERSON_READING_DEFAULT_CAP_USD);
  return Number.isFinite(cap) && cap >= 0 && cap <= 7 ? cap : PERSON_READING_DEFAULT_CAP_USD;
}

/**
 * The dispute store and the worker, from the environment, while the mark is on: the store through the review role, the
 * worker only when the reader is configured too. Undefined store when the review role isn't configured.
 */
export function startAtlasPersonClaimsFromEnv(env: NodeJS.ProcessEnv, source: AtlasPageSource | undefined,
  review: { connectionString: string; schema: string; ssl?: unknown } | undefined, markOn = true):
  { store?: AtlasPersonClaimStore; stop?: () => void } {
  if (review === undefined) return {};
  const store = new PostgresAtlasPersonClaimStore({ connectionString: review.connectionString, schema: review.schema,
    ssl: review.ssl as never });
  // Retention runs whatever the mark, the key or the reading do (Codex's review of B): dispute texts go after 90 days.
  startAtlasPersonPurge(store);
  if (!markOn || source === undefined) return { store };
  const reader = createPersonReader({ env });
  if (reader === undefined) return { store };
  const worker = new AtlasPersonReadingWorker({ source, store, reader, capUsd: personReadingCapFromEnv(env) });
  return { store, stop: worker.start() };
}
