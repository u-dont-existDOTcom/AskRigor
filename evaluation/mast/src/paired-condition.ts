import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalSha256 } from "../../terminal-bench/verifier-contract.js";

export const BARE_SYSTEM_INSTRUCTIONS = [
  "Answer the clinical benchmark item exactly as requested.",
  "Do not add facts that are not present in the item.",
].join("\n");

export interface MastSharedSettings {
  endpoint: string;
  model: string;
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  maxOutputTokens: number;
  store: false;
  timeoutSeconds: number;
  maximumRetries: number;
  maximumEstimatedCostUsdBeforeAbort: number;
  inputPriceUsdPerMillionTokens: number;
  outputPriceUsdPerMillionTokens: number;
}

export interface MastCondition {
  conditionId: "BARE" | "HRP";
  systemInstructions: string;
  systemInstructionsSha256: string;
  sharedSettings: MastSharedSettings;
  sharedSettingsSha256: string;
}

export interface PairedMastConditions {
  bare: MastCondition;
  hrp: MastCondition;
  onlyDeclaredDifference: "system_instructions";
}

export function createPairedMastConditions(
  sharedSettings: MastSharedSettings,
  bareSystemInstructions: string,
  hrpSystemInstructions: string,
): PairedMastConditions {
  if (bareSystemInstructions.trim().length === 0 || hrpSystemInstructions.trim().length === 0) {
    throw new Error("Both paired conditions require non-empty system instructions");
  }
  if (bareSystemInstructions === hrpSystemInstructions) {
    throw new Error("Paired conditions must differ in system instructions");
  }
  const sharedSettingsSha256 = canonicalSha256(sharedSettings);
  const make = (
    conditionId: MastCondition["conditionId"],
    systemInstructions: string,
  ): MastCondition => ({
    conditionId,
    systemInstructions,
    systemInstructionsSha256: canonicalSha256(systemInstructions),
    sharedSettings: structuredClone(sharedSettings),
    sharedSettingsSha256,
  });
  const paired = {
    bare: make("BARE", bareSystemInstructions),
    hrp: make("HRP", hrpSystemInstructions),
    onlyDeclaredDifference: "system_instructions" as const,
  };
  assertPairedMastConditions(paired);
  return paired;
}

export function assertPairedMastConditions(conditions: PairedMastConditions): void {
  const expectedBareSharedHash = canonicalSha256(conditions.bare.sharedSettings);
  const expectedHrpSharedHash = canonicalSha256(conditions.hrp.sharedSettings);
  if (
    conditions.onlyDeclaredDifference !== "system_instructions"
    || conditions.bare.conditionId !== "BARE"
    || conditions.hrp.conditionId !== "HRP"
    || conditions.bare.systemInstructions === conditions.hrp.systemInstructions
    || conditions.bare.sharedSettingsSha256 !== expectedBareSharedHash
    || conditions.hrp.sharedSettingsSha256 !== expectedHrpSharedHash
    || expectedBareSharedHash !== expectedHrpSharedHash
    || canonicalSha256(conditions.bare.systemInstructions)
      !== conditions.bare.systemInstructionsSha256
    || canonicalSha256(conditions.hrp.systemInstructions)
      !== conditions.hrp.systemInstructionsSha256
  ) {
    throw new Error("PAIRED_CONDITION_EQUALITY_FAILED");
  }
}

export async function loadCanonicalHrpInstructions(repositoryRoot: string): Promise<{
  universalBytes: string;
  hrpBytes: string;
  combinedInstructions: string;
}> {
  const [universalBytes, hrpBytes] = await Promise.all([
    readFile(join(repositoryRoot, "protocols", "Universal_Instructions.xml"), "utf8"),
    readFile(join(repositoryRoot, "protocols", "HRP_Full.xml"), "utf8"),
  ]);
  return {
    universalBytes,
    hrpBytes,
    combinedInstructions: `${universalBytes}\n\n${hrpBytes}`,
  };
}
