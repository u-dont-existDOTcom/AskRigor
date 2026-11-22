import type { AtlasTraditionLabel, AtlasTraditionRow } from "@askrigor/evidence-repository";
import type { ShownFinding } from "./page-data.js";
import { rowPassesPageGuard } from "./page-guard.js";
import { traditionSectionOf } from "./traditions-tree.js";

export const MODERN_CHECK_WORDS = {
  supports: "supports it", corrects: "corrects it: right idea, wrong dose, form or people",
  contradicts: "contradicts it", mixed: "mixed", too_little_evidence: "too little evidence",
  not_tested_as_used: "not tested the way the tradition uses it",
} as const;
export const traditionLine = (label: AtlasTraditionLabel) =>
  `${label.tradition}${label.region ? `, ${label.region}` : ""}${label.preparation ? `: ${label.preparation}` : ""}`;
export const modernCheckLine = (label: AtlasTraditionLabel) => `${MODERN_CHECK_WORDS[label.modern_check]}; ${label.match}`;
/** One label per section, a publication's label taking precedence over its accepted finding's label. */
export function traditionLabelsOf(finding: ShownFinding, labels: readonly AtlasTraditionRow[]): AtlasTraditionRow[] {
  const result = new Map<string, AtlasTraditionRow>();
  const numbers = [finding.publicationNumber, ...(finding.status.kind === "unreviewed" ? [] : [finding.status.atlasNumber])];
  for (const number of numbers) for (const label of labels) {
    if (label.item === number && !result.has(label.section) && traditionSectionOf(label.section) !== undefined &&
      Object.hasOwn(MODERN_CHECK_WORDS, label.modern_check) && rowPassesPageGuard(label)) result.set(label.section, label);
  }
  return [...result.values()];
}
