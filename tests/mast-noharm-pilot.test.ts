import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  deriveNoHarmPilotSelection,
  inspectCleanMastArtifactRoot,
  noharmPilotManifestSchema,
} from "../evaluation/mast/src/noharm-pilot.js";

const manifestUrl = new URL("../evaluation/mast/noharm-pilot-manifest.json", import.meta.url);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

async function manifestFixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(manifestUrl, "utf8")) as Record<string, unknown>;
}

describe("MAST NOHARM pilot and analysis-freeze plan", () => {
  it("derives the sealed outcome-blind pilot, repeat, and untouched confirmation sets", async () => {
    const manifest = noharmPilotManifestSchema.parse(await manifestFixture());
    const selection = deriveNoHarmPilotSelection([
      ...manifest.pilot.baseCaseIds,
      ...manifest.confirmation.untouchedBaseCaseIds,
    ]);

    expect(selection.pilotBaseCaseIds).toEqual(manifest.pilot.baseCaseIds);
    expect(selection.stabilityRepeatCaseIds).toEqual(manifest.pilot.stabilityRepeatCaseIds);
    expect(selection.untouchedBaseCaseIds).toEqual(manifest.confirmation.untouchedBaseCaseIds);
    expect(selection.selectionSha256).toBe(manifest.identities.selectionSha256);
    expect(manifest.confirmation.partialCorpus).toBe(true);
    expect(manifest.execution.maximumEstimatedCostUsdBeforeAbort).toBe(0);
  });

  it("rejects overlap between development and confirmation case families", async () => {
    const manifest = await manifestFixture();
    const pilot = manifest.pilot as { baseCaseIds: string[] };
    const confirmation = manifest.confirmation as { untouchedBaseCaseIds: string[] };
    confirmation.untouchedBaseCaseIds[0] = pilot.baseCaseIds[0];

    expect(noharmPilotManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("rejects pilot-driven HRP repair and premature spend", async () => {
    const manifest = await manifestFixture();
    (manifest.pilot as Record<string, unknown>).hrpRepairFromPilotPermitted = true;
    (manifest.execution as Record<string, unknown>).maximumEstimatedCostUsdBeforeAbort = 1;

    expect(noharmPilotManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("accepts only an empty mode-0700 artifact root outside the repository", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "askrigor-mast-artifacts-"));
    await chmod(artifactRoot, 0o700);
    try {
      await expect(inspectCleanMastArtifactRoot(repositoryRoot, artifactRoot)).resolves.toEqual({
        directoryMode: "0700",
        empty: true,
        outsideRepository: true,
      });
      await writeFile(join(artifactRoot, "unexpected"), "not clean", { mode: 0o600 });
      await expect(inspectCleanMastArtifactRoot(repositoryRoot, artifactRoot))
        .rejects.toThrow("MAST_ARTIFACT_ROOT_NOT_CLEAN");
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
