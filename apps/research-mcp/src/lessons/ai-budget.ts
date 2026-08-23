import { constants } from "node:fs";
import {
  lstat,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { z } from "zod";

export const MONTHLY_AI_BUDGET_NANO_USD = 50_000_000_000 as const;

export interface AiBudget {
  reserve(category: string, maximumNanoUsd: number): Promise<BudgetReservation | undefined>;
}

export interface BudgetReservation {
  commit(actualNanoUsd: number): Promise<void>;
  forfeit(): Promise<void>;
}

export interface FileAiBudgetOptions {
  ledgerPath: string;
  monthlyLimitNanoUsd: typeof MONTHLY_AI_BUDGET_NANO_USD;
  expectedUid?: number;
  now: () => Date;
}

const sharedBudgets = new Map<string, AiBudget>();

interface AiBudgetLedger {
  schema_version: 1;
  utc_month: `${number}-${number}`;
  monthly_limit_nano_usd: typeof MONTHLY_AI_BUDGET_NANO_USD;
  charged_nano_usd: number;
  updated_at: string;
}

const ledgerSchema = z.strictObject({
  schema_version: z.literal(1),
  utc_month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u),
  monthly_limit_nano_usd: z.literal(MONTHLY_AI_BUDGET_NANO_USD),
  charged_nano_usd: z.number().int().nonnegative().max(MONTHLY_AI_BUDGET_NANO_USD),
  updated_at: z.string().datetime({ offset: false }),
});

const LEDGER_UNAVAILABLE_MESSAGE = "AI budget ledger unavailable";

class FileAiBudget implements AiBudget {
  private mutex: Promise<void> = Promise.resolve();
  private readonly parentDirectory: string;
  private readonly expectedUid: number;

  constructor(private readonly options: FileAiBudgetOptions) {
    if (options.monthlyLimitNanoUsd !== MONTHLY_AI_BUDGET_NANO_USD) {
      throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    }
    const expectedUid = options.expectedUid ?? process.getuid?.();
    if (!Number.isSafeInteger(expectedUid) || expectedUid! < 0) {
      throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    }
    this.expectedUid = expectedUid!;
    this.parentDirectory = dirname(options.ledgerPath);
  }

  reserve(_category: string, maximumNanoUsd: number): Promise<BudgetReservation | undefined> {
    if (!isSafeNanoUsd(maximumNanoUsd) || maximumNanoUsd === 0) {
      return Promise.reject(new Error(LEDGER_UNAVAILABLE_MESSAGE));
    }

    return this.serialized(async () => {
      try {
        await this.assertSafeParentDirectory();
        const now = this.safeNow();
        const { ledger, needsWrite } = await this.loadLedger(now);
        if (maximumNanoUsd > this.options.monthlyLimitNanoUsd - ledger.charged_nano_usd) {
          if (needsWrite) await this.writeLedger(ledger);
          return undefined;
        }

        const chargedLedger = {
          ...ledger,
          charged_nano_usd: ledger.charged_nano_usd + maximumNanoUsd,
          updated_at: now.toISOString(),
        } satisfies AiBudgetLedger;
        await this.writeLedger(chargedLedger);
        return this.createReservation(maximumNanoUsd, ledger.utc_month);
      } catch {
        throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
      }
    });
  }

  private createReservation(
    maximumNanoUsd: number,
    reservationMonth: AiBudgetLedger["utc_month"],
  ): BudgetReservation {
    let terminal = false;

    return {
      commit: async (actualNanoUsd: number) => {
        if (terminal || !isSafeNanoUsd(actualNanoUsd) || actualNanoUsd > maximumNanoUsd) {
          throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
        }
        terminal = true;
        await this.serialized(async () => {
          try {
            await this.assertSafeParentDirectory();
            const now = this.safeNow();
            const { ledger, needsWrite } = await this.loadLedger(now);
            if (ledger.utc_month < reservationMonth) throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
            if (ledger.utc_month > reservationMonth) {
              if (needsWrite) await this.writeLedger(ledger);
              return;
            }
            const unused = maximumNanoUsd - actualNanoUsd;
            if (ledger.charged_nano_usd < unused) throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
            await this.writeLedger({
              ...ledger,
              charged_nano_usd: ledger.charged_nano_usd - unused,
              updated_at: now.toISOString(),
            });
          } catch {
            throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
          }
        });
      },
      forfeit: async () => {
        if (terminal) throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
        terminal = true;
      },
    };
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutex.then(operation, operation);
    this.mutex = result.then(() => undefined, () => undefined);
    return result;
  }

  private safeNow(): Date {
    const now = this.options.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    }
    return now;
  }

  private async assertSafeParentDirectory(): Promise<void> {
    const stat = await lstat(this.parentDirectory);
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      stat.uid !== this.expectedUid ||
      (stat.mode & 0o022) !== 0
    ) {
      throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    }

    const handle = await open(
      this.parentDirectory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      const openedStat = await handle.stat();
      if (
        !openedStat.isDirectory() ||
        openedStat.dev !== stat.dev ||
        openedStat.ino !== stat.ino ||
        openedStat.uid !== this.expectedUid ||
        (openedStat.mode & 0o022) !== 0
      ) {
        throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
      }
    } finally {
      await handle.close();
    }
  }

  private async loadLedger(now: Date): Promise<{ ledger: AiBudgetLedger; needsWrite: boolean }> {
    let stat;
    try {
      stat = await lstat(this.options.ledgerPath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { ledger: freshLedger(now), needsWrite: true };
      }
      throw error;
    }

    if (
      stat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.uid !== this.expectedUid ||
      (stat.mode & 0o077) !== 0 ||
      stat.nlink !== 1
    ) {
      throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    }

    const handle = await open(this.options.ledgerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let rawLedger: string;
    try {
      const openedStat = await handle.stat();
      if (
        !openedStat.isFile() ||
        openedStat.dev !== stat.dev ||
        openedStat.ino !== stat.ino ||
        openedStat.uid !== this.expectedUid ||
        (openedStat.mode & 0o077) !== 0 ||
        openedStat.nlink !== 1
      ) {
        throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
      }
      rawLedger = await readFile(handle, "utf8");
    } finally {
      await handle.close();
    }

    const parsed = ledgerSchema.safeParse(JSON.parse(rawLedger));
    if (!parsed.success) throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    const ledger = parsed.data as AiBudgetLedger;
    if (ledger.monthly_limit_nano_usd !== this.options.monthlyLimitNanoUsd) {
      throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    }

    const currentMonth = utcMonth(now);
    if (ledger.utc_month > currentMonth) {
      throw new Error(LEDGER_UNAVAILABLE_MESSAGE);
    }
    if (ledger.utc_month < currentMonth) {
      return { ledger: freshLedger(now), needsWrite: true };
    }
    return { ledger, needsWrite: false };
  }

  private async writeLedger(ledger: AiBudgetLedger): Promise<void> {
    const temporaryPath = join(
      this.parentDirectory,
      `.${basename(this.options.ledgerPath)}.${randomUUID()}.tmp`,
    );
    let temporaryExists = false;
    try {
      const handle = await open(
        temporaryPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      temporaryExists = true;
      try {
        await handle.writeFile(`${JSON.stringify(ledger)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      await rename(temporaryPath, this.options.ledgerPath);
      temporaryExists = false;
      const directoryHandle = await open(this.parentDirectory, constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } finally {
      if (temporaryExists) await unlink(temporaryPath).catch(() => undefined);
    }
  }
}

export function createFileAiBudget(options: FileAiBudgetOptions): AiBudget {
  return new FileAiBudget(options);
}

/**
 * Returns one process-wide mutex owner for a ledger path. Multiple Action
 * services must not independently reserve against the same file.
 */
export function createSharedFileAiBudget(options: FileAiBudgetOptions): AiBudget {
  const expectedUid = options.expectedUid ?? process.getuid?.();
  const key = JSON.stringify([
    options.ledgerPath,
    options.monthlyLimitNanoUsd,
    expectedUid,
  ]);
  const existing = sharedBudgets.get(key);
  if (existing) return existing;
  const budget = createFileAiBudget(options);
  sharedBudgets.set(key, budget);
  return budget;
}

function freshLedger(now: Date): AiBudgetLedger {
  return {
    schema_version: 1,
    utc_month: utcMonth(now),
    monthly_limit_nano_usd: MONTHLY_AI_BUDGET_NANO_USD,
    charged_nano_usd: 0,
    updated_at: now.toISOString(),
  };
}

function utcMonth(value: Date): `${number}-${number}` {
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}` as `${number}-${number}`;
}

function isSafeNanoUsd(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
