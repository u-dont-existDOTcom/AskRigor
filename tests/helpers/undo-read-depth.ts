import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect } from "vitest";

async function undoRecordedEdits(text: string, protocol: "hrp" | "universal", file: string): Promise<string> {
  const recorded = JSON.parse(await readFile(new URL(
    `../fixtures/protocol-edits/${file}`, import.meta.url,
  ), "utf8"))[protocol] as {
    from: { sha256: string }; to: { sha256: string }; edits: Array<[string, string]>;
  };
  const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
  expect(hash(text)).toBe(recorded.to.sha256);
  const prior = [...recorded.edits].reverse().reduce((current, [before, after]) => {
    expect(current.split(after), after.slice(0, 80)).toHaveLength(2);
    return current.replace(after, before);
  }, text);
  expect(hash(prior)).toBe(recorded.from.sha256);
  return prior;
}

export async function undoHandoffTarget(text: string): Promise<string> {
  return undoRecordedEdits(text, "hrp", "2026-10-12-handoff-target.json");
}

export async function undoContestedEvidence(text: string): Promise<string> {
  text = await undoHandoffTarget(text);
  return undoRecordedEdits(text, "hrp", "2026-10-12-contested-evidence.json");
}

export async function undoDiminishingReturns(text: string): Promise<string> {
  text = await undoContestedEvidence(text);
  return undoRecordedEdits(text, "hrp", "2026-10-11-diminishing-returns.json");
}

export async function undoReadDepth(text: string, protocol: "hrp" | "universal"): Promise<string> {
  if (protocol === "hrp") text = await undoDiminishingReturns(text);
  return undoRecordedEdits(text, protocol, "2026-10-11-read-depth.json");
}
