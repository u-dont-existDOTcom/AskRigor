import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import { z } from "zod";

/**
 * Daily count of YouTube video seconds sent to Gemini.
 *
 * Google's free tier reads at most 8 hours of YouTube video a day, per
 * project, and its daily quotas reset at midnight Pacific time (Gemini API
 * docs, video understanding and rate limits, checked 2026-10-03). Every
 * AskRigor user shares one project, and a pass may count the whole video
 * again, so each pass is charged its video's full length before it starts and
 * a pass that would go past the limit is refused. A charge is never refunded:
 * Google may count a request that failed.
 *
 * The ledger sits beside the AI budget ledger, in the same owner-only
 * directory, and is checked the same way: no symbolic links, owned by this
 * process's user, not writable by others, written atomically.
 */

export const GEMINI_VIDEO_DAILY_LIMIT_SECONDS = 8 * 60 * 60;
const LEDGER_FILE_NAME = "gemini-video-seconds.json";
const UNAVAILABLE = "Gemini video ledger unavailable";

export type VideoSecondsCharge =
  | { charged: true; remaining_seconds: number }
  | { charged: false; remaining_seconds: number };

export interface GeminiVideoLedger {
  /** Charges a pass, or refuses it when it would pass today's limit. Throws when the ledger is unavailable. */
  charge(seconds: number): Promise<VideoSecondsCharge>;
}

export interface FileGeminiVideoLedgerOptions {
  ledgerPath: string;
  expectedUid?: number;
  now?: () => Date;
}

const ledgerSchema = z.strictObject({
  schema_version: z.literal(1),
  pacific_day: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u),
  daily_limit_seconds: z.literal(GEMINI_VIDEO_DAILY_LIMIT_SECONDS),
  charged_seconds: z.number().int().nonnegative().max(GEMINI_VIDEO_DAILY_LIMIT_SECONDS),
  updated_at: z.string().datetime({ offset: false })
});
type Ledger = z.output<typeof ledgerSchema>;

const sharedLedgers = new Map<string, GeminiVideoLedger>();

/**
 * The production ledger, beside ASKRIGOR_AI_BUDGET_LEDGER. One instance per
 * path, so every MCP server in this process charges through one queue.
 */
export function productionGeminiVideoLedger(env: NodeJS.ProcessEnv = process.env): GeminiVideoLedger {
  const budgetLedger = env.ASKRIGOR_AI_BUDGET_LEDGER ?? "";
  if (!isAbsolute(budgetLedger) || normalize(budgetLedger) !== budgetLedger) throw new Error(UNAVAILABLE);
  return sharedGeminiVideoLedger({ ledgerPath: join(dirname(budgetLedger), LEDGER_FILE_NAME) });
}

export function sharedGeminiVideoLedger(options: FileGeminiVideoLedgerOptions): GeminiVideoLedger {
  const key = JSON.stringify([options.ledgerPath, options.expectedUid ?? process.getuid?.()]);
  let ledger = sharedLedgers.get(key);
  if (ledger === undefined) {
    ledger = new FileGeminiVideoLedger(options);
    sharedLedgers.set(key, ledger);
  }
  return ledger;
}

/** The calendar day in Pacific time, when Google's daily quotas reset. */
export function pacificDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

class FileGeminiVideoLedger implements GeminiVideoLedger {
  private queue: Promise<void> = Promise.resolve();
  private readonly directory: string;
  private readonly expectedUid: number;
  private readonly now: () => Date;

  constructor(private readonly options: FileGeminiVideoLedgerOptions) {
    const expectedUid = options.expectedUid ?? process.getuid?.();
    if (!Number.isSafeInteger(expectedUid) || expectedUid! < 0) throw new Error(UNAVAILABLE);
    this.expectedUid = expectedUid!;
    this.directory = dirname(options.ledgerPath);
    this.now = options.now ?? (() => new Date());
  }

  charge(seconds: number): Promise<VideoSecondsCharge> {
    if (!Number.isSafeInteger(seconds) || seconds < 1) return Promise.reject(new Error(UNAVAILABLE));
    return this.serialized(async () => {
      try {
        await this.assertSafeDirectory();
        const now = this.now();
        if (!Number.isFinite(now.getTime())) throw new Error(UNAVAILABLE);
        const ledger = await this.load(now);
        const remaining = GEMINI_VIDEO_DAILY_LIMIT_SECONDS - ledger.charged_seconds;
        if (seconds > remaining) return { charged: false, remaining_seconds: remaining };
        await this.write({
          ...ledger,
          charged_seconds: ledger.charged_seconds + seconds,
          updated_at: now.toISOString()
        });
        return { charged: true, remaining_seconds: remaining - seconds };
      } catch {
        throw new Error(UNAVAILABLE);
      }
    });
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async assertSafeDirectory(): Promise<void> {
    const stat = await lstat(this.directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== this.expectedUid || (stat.mode & 0o022) !== 0) {
      throw new Error(UNAVAILABLE);
    }
    const handle = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error(UNAVAILABLE);
    } finally {
      await handle.close();
    }
  }

  private async load(now: Date): Promise<Ledger> {
    const today = pacificDay(now);
    let stat;
    try {
      stat = await lstat(this.options.ledgerPath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return fresh(today, now);
      throw error;
    }
    if (
      stat.isSymbolicLink() || !stat.isFile() || stat.uid !== this.expectedUid ||
      (stat.mode & 0o077) !== 0 || stat.nlink !== 1
    ) {
      throw new Error(UNAVAILABLE);
    }
    const handle = await open(this.options.ledgerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw: string;
    try {
      const opened = await handle.stat();
      if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.nlink !== 1) throw new Error(UNAVAILABLE);
      raw = await readFile(handle, "utf8");
    } finally {
      await handle.close();
    }
    const ledger = ledgerSchema.parse(JSON.parse(raw));
    // A ledger from a later day means the clock went back: refuse rather than
    // reset the count.
    if (ledger.pacific_day > today) throw new Error(UNAVAILABLE);
    return ledger.pacific_day < today ? fresh(today, now) : ledger;
  }

  private async write(ledger: Ledger): Promise<void> {
    const temporary = join(this.directory, `.${basename(this.options.ledgerPath)}.${randomUUID()}.tmp`);
    let temporaryExists = false;
    try {
      const handle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600
      );
      temporaryExists = true;
      try {
        await handle.writeFile(`${JSON.stringify(ledger)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.options.ledgerPath);
      temporaryExists = false;
      const directory = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      if (temporaryExists) await unlink(temporary).catch(() => undefined);
    }
  }
}

function fresh(today: string, now: Date): Ledger {
  return {
    schema_version: 1,
    pacific_day: today,
    daily_limit_seconds: GEMINI_VIDEO_DAILY_LIMIT_SECONDS,
    charged_seconds: 0,
    updated_at: now.toISOString()
  };
}
