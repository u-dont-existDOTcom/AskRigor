import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BARE_SYSTEM_INSTRUCTIONS,
  createPairedMastConditions,
  loadCanonicalHrpInstructions,
} from "../evaluation/mast/src/paired-condition.js";
import {
  deriveNoHarmPilotSelection,
  inspectCleanMastArtifactRoot,
  noharmPilotManifestSchema,
  PINNED_NOHARM_ARTIFACTS,
  verifyPinnedMastNoHarmPilot,
} from "../evaluation/mast/src/noharm-pilot.js";
import { canonicalSha256 } from "../evaluation/terminal-bench/verifier-contract.js";

function root(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const repositoryRoot = root();
  const manifest = noharmPilotManifestSchema.parse(JSON.parse(await readFile(
    join(repositoryRoot, "evaluation/mast/noharm-pilot-manifest.json"),
    "utf8",
  )) as unknown);

  if (
    canonicalSha256(manifest.source.artifacts)
      !== canonicalSha256(PINNED_NOHARM_ARTIFACTS)
  ) {
    throw new Error("MAST_NOHARM_PUBLIC_SOURCE_IDENTITY_MISMATCH");
  }
  const allBaseCases = [...manifest.pilot.baseCaseIds, ...manifest.confirmation.untouchedBaseCaseIds];
  const selection = deriveNoHarmPilotSelection(allBaseCases);
  if (
    JSON.stringify(selection.pilotBaseCaseIds) !== JSON.stringify(manifest.pilot.baseCaseIds)
    || JSON.stringify(selection.stabilityRepeatCaseIds)
      !== JSON.stringify(manifest.pilot.stabilityRepeatCaseIds)
    || JSON.stringify(selection.untouchedBaseCaseIds)
      !== JSON.stringify(manifest.confirmation.untouchedBaseCaseIds)
    || selection.selectionSha256 !== manifest.identities.selectionSha256
  ) {
    throw new Error("MAST_NOHARM_SELECTION_MISMATCH");
  }

  const protocol = await loadCanonicalHrpInstructions(repositoryRoot);
  if (
    createHash("sha256").update(protocol.universalBytes).digest("hex")
      !== manifest.identities.universalSha256
    || createHash("sha256").update(protocol.hrpBytes).digest("hex")
      !== manifest.identities.hrpSha256
  ) {
    throw new Error("MAST_NOHARM_PROTOCOL_IDENTITY_MISMATCH");
  }
  const paired = createPairedMastConditions(
    manifest.plannedConditions.sharedSettings,
    BARE_SYSTEM_INSTRUCTIONS,
    protocol.combinedInstructions,
  );
  if (
    canonicalSha256(manifest.plannedConditions.sharedSettings)
      !== manifest.identities.pairedSharedSettingsSha256
    || paired.bare.sharedSettingsSha256 !== manifest.identities.pairedSharedSettingsSha256
    || paired.bare.systemInstructionsSha256
      !== manifest.plannedConditions.bareInstructionSha256
    || paired.hrp.systemInstructionsSha256
      !== manifest.plannedConditions.hrpInstructionSha256
  ) {
    throw new Error("MAST_NOHARM_PAIRED_CONDITION_MISMATCH");
  }

  const mastSource = option("--mast-source");
  let sourceInspection: Awaited<ReturnType<typeof verifyPinnedMastNoHarmPilot>>
    | "not_requested" = "not_requested";
  if (mastSource) {
    const [sourceCommit, sourceTree] = [
      execFileSync("git", ["-C", mastSource, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      execFileSync("git", ["-C", mastSource, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
    ];
    if (sourceCommit !== manifest.source.commit || sourceTree !== manifest.source.tree) {
      throw new Error("MAST_NOHARM_SOURCE_GIT_IDENTITY_MISMATCH");
    }
    sourceInspection = await verifyPinnedMastNoHarmPilot(mastSource, manifest);
  }
  const artifactRoot = option("--artifact-root");
  const artifactInspection = artifactRoot
    ? await inspectCleanMastArtifactRoot(repositoryRoot, artifactRoot)
    : "not_requested" as const;

  process.stdout.write(`${JSON.stringify({
    status: "SEALED_NOHARM_PILOT_PLAN_NO_MODEL_RUN",
    pilot_classification: manifest.pilot.classification,
    pilot_base_cases: manifest.pilot.baseCaseIds.length,
    pilot_model_responses: manifest.pilot.modelResponseCount,
    stability_repeat_records: manifest.pilot.stabilityRepeatJudgedRecordCount,
    confirmation_classification: manifest.confirmation.classification,
    untouched_confirmation_base_cases: manifest.confirmation.untouchedBaseCaseIds.length,
    confirmation_partial_corpus: manifest.confirmation.partialCorpus,
    full_open_corpus_interpretation:
      manifest.confirmation.fullThirtyCaseScoreReportedSeparatelyAs,
    analysis_freeze: manifest.analysisFreeze.state,
    source_inspection: sourceInspection,
    artifact_root_inspection: artifactInspection,
    model_inference_performed: manifest.execution.modelInferencePerformed,
    judge_inference_performed: manifest.execution.judgeInferencePerformed,
    paid_inference_performed: manifest.execution.paidInferencePerformed,
    maximum_estimated_cost_usd_before_abort:
      manifest.execution.maximumEstimatedCostUsdBeforeAbort,
    completion: manifest.completion,
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown NOHARM pilot validation failure";
  process.stderr.write(`MAST NOHARM pilot validation failed: ${message}\n`);
  process.exitCode = 1;
});
