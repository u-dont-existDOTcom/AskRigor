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

export async function undoOwnerQuestion93Hrp(text: string): Promise<string> {
  return undoRecordedEdits(text, "hrp", "2026-10-15-owner-question-93-hrp.json");
}

export async function undoOwnerQuestions90To92Hrp(text: string): Promise<string> {
  text = await undoOwnerQuestion93Hrp(text);
  return undoRecordedEdits(text, "hrp", "2026-10-14-owner-questions-90-92-hrp.json");
}

export async function undoOwnerQuestions86To89Universal(text: string): Promise<string> {
  return undoRecordedEdits(text, "universal", "2026-10-14-owner-questions-86-89-universal.json");
}

export async function undoOwnerQuestions86To89Hrp(text: string): Promise<string> {
  text = await undoOwnerQuestions90To92Hrp(text);
  return undoRecordedEdits(text, "hrp", "2026-10-14-owner-questions-86-89-hrp.json");
}

export async function undoAcceptedLessonsUniversal(text: string): Promise<string> {
  text = await undoOwnerQuestions86To89Universal(text);
  return undoRecordedEdits(text, "universal", "2026-10-12-accepted-lessons-universal.json");
}

export async function undoAcceptedLessonsHrp(text: string): Promise<string> {
  text = await undoOwnerQuestions86To89Hrp(text);
  return undoRecordedEdits(text, "hrp", "2026-10-12-accepted-lessons-hrp.json");
}

export async function undoReviewProvenance(text: string): Promise<string> {
  text = await undoAcceptedLessonsUniversal(text);
  return undoRecordedEdits(text, "universal", "2026-10-12-review-provenance.json");
}

export async function undoCorrectionReport(text: string): Promise<string> {
  text = await undoReviewProvenance(text);
  return undoRecordedEdits(text, "universal", "2026-10-12-correction-report.json");
}

export async function undoHandoffTarget(text: string): Promise<string> {
  text = await undoAcceptedLessonsHrp(text);
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
  else text = await undoCorrectionReport(text);
  return undoRecordedEdits(text, protocol, "2026-10-11-read-depth.json");
}
