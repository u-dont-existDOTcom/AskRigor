import { chmod, lstat, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MONTHLY_AI_BUDGET_NANO_USD,
  createFileAiBudget,
} from "../apps/research-mcp/src/lessons/ai-budget.js";

const temporaryDirectories: string[] = [];

async function temporaryLedger(): Promise<{ directory: string; ledgerPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "askrigor-ai-budget-"));
  temporaryDirectories.push(directory);
  return { directory, ledgerPath: join(directory, "ai-budget.json") };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true }));
  }));
});

describe("persistent lesson AI budget", () => {
  it("uses an exact hard monthly limit of $50.00 in nano-USD", () => {
    expect(MONTHLY_AI_BUDGET_NANO_USD).toBe(50_000_000_000);
  });

  it("serializes concurrent reservations so their total cannot exceed the limit", async () => {
    const { ledgerPath } = await temporaryLedger();
    const budget = createFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000,
      expectedUid: process.getuid?.(),
      now: () => new Date("2026-08-13T10:00:00.000Z"),
    });

    const reservations = await Promise.all([
      budget.reserve("privacy_generalization", 30_000_000_000),
      budget.reserve("privacy_generalization", 30_000_000_000),
    ]);

    expect(reservations.filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({
      charged_nano_usd: 30_000_000_000,
    });
  });

  it("releases only unused committed cost and makes a reservation terminal once", async () => {
    const { ledgerPath } = await temporaryLedger();
    const budget = createFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000,
      expectedUid: process.getuid?.(),
      now: () => new Date("2026-08-13T10:00:00.000Z"),
    });
    const reservation = await budget.reserve("privacy_generalization", 30_000_000_000);
    expect(reservation).toBeDefined();

    await reservation!.commit(10_000_000_000);
    await expect(reservation!.forfeit()).rejects.toThrow();
    expect(await budget.reserve("privacy_generalization", 40_000_000_000)).toBeDefined();
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({
      charged_nano_usd: 50_000_000_000,
    });
  });

  it("keeps a forfeited reservation fully charged", async () => {
    const { ledgerPath } = await temporaryLedger();
    const budget = createFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000,
      expectedUid: process.getuid?.(),
      now: () => new Date("2026-08-13T10:00:00.000Z"),
    });
    const reservation = await budget.reserve("privacy_generalization", 10_000_000);

    await reservation!.forfeit();

    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({
      charged_nano_usd: 10_000_000,
    });
  });

  it("atomically replaces a 0600 ledger and preserves aggregate charges after restart", async () => {
    const { directory, ledgerPath } = await temporaryLedger();
    const options = {
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000 as const,
      expectedUid: process.getuid?.(),
      now: () => new Date("2026-08-13T10:00:00.000Z"),
    };
    const firstBudget = createFileAiBudget(options);
    const reservation = await firstBudget.reserve("privacy_generalization", 10_000_000_000);
    const firstStat = await lstat(ledgerPath);

    await reservation!.commit(5_000_000_000);

    const secondStat = await lstat(ledgerPath);
    expect(firstStat.ino).not.toBe(secondStat.ino);
    expect(secondStat.mode & 0o777).toBe(0o600);
    expect((await import("node:fs/promises")).readdir(directory)).resolves.toEqual(["ai-budget.json"]);

    const restartedBudget = createFileAiBudget(options);
    expect(await restartedBudget.reserve("privacy_generalization", 45_000_000_000)).toBeDefined();
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({ charged_nano_usd: 50_000_000_000 });
  });

  it("atomically starts a fresh UTC month without retaining request content", async () => {
    const { ledgerPath } = await temporaryLedger();
    let now = new Date("2026-08-31T23:59:59.000Z");
    const budget = createFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000,
      expectedUid: process.getuid?.(),
      now: () => now,
    });
    await budget.reserve("private candidate content must never persist", 10_000_000_000);
    const priorInode = (await lstat(ledgerPath)).ino;

    now = new Date("2026-09-01T00:00:00.000Z");
    expect(await budget.reserve("different private content", 50_000_000_000)).toBeDefined();

    const rawLedger = await readFile(ledgerPath, "utf8");
    const ledger = JSON.parse(rawLedger);
    expect((await lstat(ledgerPath)).ino).not.toBe(priorInode);
    expect(Object.keys(ledger).sort()).toEqual([
      "charged_nano_usd",
      "monthly_limit_nano_usd",
      "schema_version",
      "updated_at",
      "utc_month",
    ]);
    expect(ledger).toEqual({
      schema_version: 1,
      utc_month: "2026-09",
      monthly_limit_nano_usd: 50_000_000_000,
      charged_nano_usd: 50_000_000_000,
      updated_at: "2026-09-01T00:00:00.000Z",
    });
    expect(rawLedger.endsWith("\n")).toBe(true);
    expect(rawLedger).not.toContain("private content");
  });

  it("fails closed when the persisted month is later than the current clock", async () => {
    const { ledgerPath } = await temporaryLedger();
    let now = new Date("2026-09-01T00:00:00.000Z");
    const budget = createFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000,
      expectedUid: process.getuid?.(),
      now: () => now,
    });
    await budget.reserve("privacy_generalization", 10_000_000_000);

    now = new Date("2026-08-31T23:59:59.000Z");

    await expect(budget.reserve("privacy_generalization", 1)).rejects.toThrow("AI budget ledger unavailable");
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({
      utc_month: "2026-09",
      charged_nano_usd: 10_000_000_000,
    });
  });

  it("settles a prior-month reservation without subtracting from the new month", async () => {
    const { ledgerPath } = await temporaryLedger();
    let now = new Date("2026-08-31T23:59:59.000Z");
    const budget = createFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000,
      expectedUid: process.getuid?.(),
      now: () => now,
    });
    const reservation = await budget.reserve("privacy_generalization", 10_000_000_000);

    now = new Date("2026-09-01T00:00:00.000Z");
    await expect(reservation!.commit(5_000_000_000)).resolves.toBeUndefined();
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toMatchObject({
      utc_month: "2026-09",
      charged_nano_usd: 0,
    });
    expect(await budget.reserve("privacy_generalization", 50_000_000_000)).toBeDefined();
  });

  it("fails closed for corrupt, symlinked, non-regular, and group-writable ledgers", async () => {
    const cases: Array<[string, (directory: string, ledgerPath: string) => Promise<void>]> = [
      ["corrupt", async (_directory, ledgerPath) => writeFile(ledgerPath, "not-json", { mode: 0o600 })],
      ["symlinked", async (directory, ledgerPath) => {
        const target = join(directory, "target.json");
        await writeFile(target, "{}", { mode: 0o600 });
        await symlink(target, ledgerPath);
      }],
      ["non-regular", async (_directory, ledgerPath) => {
        await (await import("node:fs/promises")).mkdir(ledgerPath);
      }],
      ["group-writable", async (_directory, ledgerPath) => {
        await writeFile(ledgerPath, "{}", { mode: 0o600 });
        await chmod(ledgerPath, 0o620);
      }],
    ];

    for (const [name, prepare] of cases) {
      const { directory, ledgerPath } = await temporaryLedger();
      await prepare(directory, ledgerPath);
      const budget = createFileAiBudget({
        ledgerPath,
        monthlyLimitNanoUsd: 50_000_000_000,
        expectedUid: process.getuid?.(),
        now: () => new Date("2026-08-13T10:00:00.000Z"),
      });
      await expect(budget.reserve(name, 1)).rejects.toThrow("AI budget ledger unavailable");
    }
  });

  it("fails closed when the ledger owner is not the expected uid", async () => {
    const { ledgerPath } = await temporaryLedger();
    await writeFile(ledgerPath, JSON.stringify({}), { mode: 0o600 });
    const budget = createFileAiBudget({
      ledgerPath,
      monthlyLimitNanoUsd: 50_000_000_000,
      expectedUid: (process.getuid?.() ?? 0) + 1,
      now: () => new Date("2026-08-13T10:00:00.000Z"),
    });

    await expect(budget.reserve("privacy_generalization", 1)).rejects.toThrow("AI budget ledger unavailable");
  });
});
