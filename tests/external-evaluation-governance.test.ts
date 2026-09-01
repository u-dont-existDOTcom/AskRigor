import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertDefectLedgerPolicyMutants,
  compileGovernanceSchemas,
  validateBenchmarkGovernance,
} from "../evaluation/governance/src/validate.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe("external-evaluation benchmark governance", () => {
  it("validates and cross-binds the MAST and Terminal-Bench preflight instances", async () => {
    await expect(validateBenchmarkGovernance(root)).resolves.toEqual({
      status: "PASS",
      schemaVersion: 1,
      manifestCount: 2,
      defectLedgerCount: 2,
      recordedDefectCount: 0,
      noDefectClaimMade: false,
      policyMutantsRejected: 4,
      crossArtifactBindingsVerified: 25,
      paidInferencePerformed: false,
      latentAnswersPublished: false,
    });
  });

  it("rejects malformed immutable identities and ambiguous preflight subjects", async () => {
    const { validateManifest } = await compileGovernanceSchemas(root);
    const manifest = JSON.parse(
      await readFile(rootFile("evaluation/governance/instances/mast-sct-preflight.manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    const benchmark = manifest.benchmark as Record<string, unknown>;
    const sourceIdentity = benchmark.sourceIdentity as Record<string, unknown>;
    const invalidHash = structuredClone(manifest);
    ((invalidHash.benchmark as Record<string, unknown>).sourceIdentity as Record<string, unknown>).value =
      String(sourceIdentity.value).toUpperCase();
    expect(validateManifest(invalidHash)).toBe(false);

    const ambiguousSubject = structuredClone(manifest);
    ambiguousSubject.subjectUnderTest = {
      kind: "MODEL",
      provider: "OpenAI",
      model: "gpt-5.6-sol",
    };
    expect(validateManifest(ambiguousSubject)).toBe(false);
  });

  it("kills consequential-recheck and correction-state policy mutants", async () => {
    const { validateLedger } = await compileGovernanceSchemas(root);
    expect(assertDefectLedgerPolicyMutants(validateLedger)).toBe(4);
  });
});
