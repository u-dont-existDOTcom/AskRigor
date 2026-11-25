import { createHash } from "node:crypto";

import { undoOptionsFromLivingTraditions } from "./undo-options-from-living-traditions.js";

/** Rewind owner answer 402a's HRP 20.6.45 changes before historical exact-byte fixtures are compared. */
export function undoTraditionalSystemAccount(text: string): string {
  text = undoOptionsFromLivingTraditions(text);
  if (!text.includes('version="20.6.45" revisionDate="2026-11-22"')) return text;
  for (const expression of [
    /  <Revision version="20\.6\.45" priority="Critical">[\s\S]*?<\/Revision>\n/u,
    / <TraditionalSystemAccount priority="Critical">[\s\S]*?<\/TraditionalSystemAccount>\n\n/u,
    ...TRADITIONAL_SYSTEM_CASE_IDS.map((id) => new RegExp(`  <Case id="${id}">[\\s\\S]*?<\\/Case>\\n\\n`, "u")),
  ]) {
    if ([...text.matchAll(new RegExp(expression.source, "gu"))].length !== 1)
      throw new Error("TRADITIONAL_SYSTEM_ELEMENT_MISSING");
    text = text.replace(expression, "");
  }
  const pointer = "historical safety use; load TraditionalSystemAccount.";
  if (text.split(pointer).length !== 2) throw new Error("TRADITIONAL_SYSTEM_POINTER_MISSING");
  text = text.replace(pointer, "historical safety use.");
  text = text.replace('version="20.6.45" revisionDate="2026-11-22"', 'version="20.6.44" revisionDate="2026-11-22"');
  if (createHash("sha256").update(text).digest("hex") !==
      "a486702b879aba2ce729482eabd5474f4ef0afa7e7b7c3efe57751e8103485ee")
    throw new Error("TRADITIONAL_SYSTEM_REWIND_SHA_MISMATCH");
  return text;
}

export const TRADITIONAL_SYSTEM_CASE_IDS = [
  "TraditionalRemedySafetyWithoutSystemName",
  "DistinctNamedMedicalTraditions",
  "TraditionalLocalNameInAnotherScript",
  "TraditionalDiagnosticConceptMeaning",
  "TraditionalSourcesDisagreeAcrossSchools",
  "TraditionalNonBotanicalMethods",
  "TraditionalMineralAndAnimalMaterials",
  "TraditionalWholeFormulaAndIngredient",
  "TraditionalHouseholdPracticeWithoutText",
  "TraditionalRemedyMedicinesAndPregnancy",
  "TraditionalRemedyUrgentSymptoms",
  "TraditionalRuleUnrelatedDrugHistoryOrFood",
] as const;
