import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SHARE_OFFER,
  SHARE_OFFER_LINE,
  SHARED_ANSWER_KEPT,
  SHARED_ANSWER_RETENTION_DAYS,
  SharedAnswerVault,
  SharedAnswersFullError,
  createShareLimiter,
  sharedAnswerInputSchema,
  sharedAnswerProblems,
  sharedAnswerVaultFromEnv,
} from "../apps/research-mcp/src/shared-answers.js";

const key = Buffer.alloc(32, 7);
const copy = {
  question: "An adult in their thirties asks whether a week at 800 kcal a day is likely to harm them.",
  answer: "A week at 800 kcal is often tolerated by healthy adults; see https://doi.org/10.1186/s12906-018-2136-6.",
  improve: "Give the absolute risks first.",
  confirmed: true as const,
};
const roots: string[] = [];
function root(): string {
  const directory = mkdtempSync(join(tmpdir(), "askrigor-shared-answers-"));
  roots.push(directory);
  return join(directory, "shared-answers");
}
afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("shared answers (owner answer 200a)", () => {
  it("offers the owner's sentence word for word and says how the copy is kept before it is sent", () => {
    expect(SHARE_OFFER_LINE).toBe("Send this de-identified question & answer to AskRigor for improvements? If yes, " +
      "optionally specify what should be improved.");
    expect(SHARE_OFFER.line).toBe(SHARE_OFFER_LINE);
    expect(SHARE_OFFER.on_yes).toContain(SHARED_ANSWER_KEPT);
    expect(SHARE_OFFER.on_yes).toContain("Send nothing before they confirm.");
    expect(SHARED_ANSWER_KEPT).toContain(`${SHARED_ANSWER_RETENTION_DAYS} days`);
  });

  it("keeps an encrypted copy with no account, deletes it with its code, and only once", () => {
    const directory = root();
    const vault = new SharedAnswerVault({ directory, key });
    const { code, expiresAt } = vault.share(copy, { build: "d8beec2d766e", hrp: "20.6.33", universal: "20.5.46" });
    expect(code).toMatch(/^sa1-[A-Za-z0-9_-]{22}$/u);
    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const raw = readFileSync(join(directory, files[0]!), "utf8");
    expect(raw).not.toContain("800 kcal");
    expect(raw).not.toContain(code);
    expect(statSync(join(directory, files[0]!)).mode & 0o077).toBe(0);
    expect(statSync(directory).mode & 0o077).toBe(0);
    const [summary] = vault.list();
    expect(summary).toMatchObject({ expiresAt, build: "d8beec2d766e", hrp: "20.6.33",
      characters: { question: copy.question.length, answer: copy.answer.length, improve: copy.improve.length } });
    expect(Object.keys(summary!)).not.toContain("question");
    expect(vault.read(summary!.id)).toMatchObject({ question: copy.question, answer: copy.answer, improve: copy.improve });
    expect(vault.deleteByCode(code)).toBe(true);
    expect(vault.deleteByCode(code)).toBe(false);
    expect(vault.list()).toEqual([]);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("refuses a copy whose text or times were changed on disk", () => {
    const directory = root();
    const vault = new SharedAnswerVault({ directory, key });
    vault.share(copy);
    const [file] = readdirSync(directory);
    const envelope = JSON.parse(readFileSync(join(directory, file!), "utf8"));
    writeFileSync(join(directory, file!), JSON.stringify({ ...envelope, expires_at: "2099-01-01T00:00:00.000Z" }));
    expect(() => vault.read(file!.slice(0, 32))).toThrow("did not authenticate");
  });

  it("deletes copies when their time is up, and the owner can delete one by its ID", () => {
    const directory = root();
    let now = new Date("2026-10-30T00:00:00.000Z");
    const vault = new SharedAnswerVault({ directory, key, now: () => now });
    vault.share(copy);
    vault.share({ ...copy, improve: undefined });
    expect(vault.list()).toHaveLength(2);
    now = new Date(now.getTime() + (SHARED_ANSWER_RETENTION_DAYS * 86_400_000) - 1);
    expect(vault.sweep()).toBe(0);
    const [first] = vault.list();
    expect(vault.deleteById(first!.id)).toBe(true);
    now = new Date(now.getTime() + 1);
    expect(vault.sweep()).toBe(1);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("stops at its limit instead of filling the disk", () => {
    const vault = new SharedAnswerVault({ directory: root(), key, maxRecords: 1 });
    vault.share(copy);
    expect(() => vault.share(copy)).toThrow(SharedAnswersFullError);
  });

  it("needs the person's confirmation and refuses contact details by exact pattern, naming the field only", () => {
    expect(sharedAnswerInputSchema.safeParse({ ...copy, confirmed: false }).success).toBe(false);
    expect(sharedAnswerInputSchema.safeParse({ question: copy.question, answer: copy.answer }).success).toBe(false);
    expect(sharedAnswerProblems(copy)).toEqual([]);
    const problems = sharedAnswerProblems({ ...copy, question: `${copy.question} Write to sam@example.org.` });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("sharedAnswer.question holds what looks like an email address");
    expect(problems[0]).not.toContain("sam@example.org");
  });

  it("counts shares per account per UTC day in memory", () => {
    let now = new Date("2026-10-30T23:59:00.000Z");
    const allow = createShareLimiter(2, () => now);
    expect([allow("a"), allow("a"), allow("a"), allow("b")]).toEqual([true, true, false, true]);
    now = new Date("2026-10-31T00:00:00.000Z");
    expect(allow("a")).toBe(true);
  });

  it("turns sharing off with one log line naming no value when the server's settings are unusable", async () => {
    vi.resetModules();
    const fresh = await import("../apps/research-mcp/src/shared-answers.js");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "not-a-valid-key-value";
    expect(fresh.sharedAnswersFromEnv({ ASKRIGOR_SHARED_ANSWERS_DIRECTORY: root(),
      ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL: secret })).toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]![0])).toMatch(/^AskRigor shared answers are off: /u);
    expect(String(logged.mock.calls[0]![0])).not.toContain(secret);
    logged.mockRestore();
  });

  it("is off unless both settings are given, and refuses a malformed key", () => {
    expect(sharedAnswerVaultFromEnv({})).toBeUndefined();
    expect(() => sharedAnswerVaultFromEnv({ ASKRIGOR_SHARED_ANSWERS_DIRECTORY: root() })).toThrow("go together");
    expect(() => sharedAnswerVaultFromEnv({ ASKRIGOR_SHARED_ANSWERS_DIRECTORY: root(),
      ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL: "short" })).toThrow("32 bytes");
    expect(sharedAnswerVaultFromEnv({ ASKRIGOR_SHARED_ANSWERS_DIRECTORY: root(),
      ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL: key.toString("base64url") })).toBeInstanceOf(SharedAnswerVault);
  });
});
