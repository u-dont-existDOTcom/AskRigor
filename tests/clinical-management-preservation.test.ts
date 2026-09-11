import { readFile } from "node:fs/promises";

import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url);

interface DevelopmentFamily {
  familyId: string;
  role: string;
  requirements: string[];
}

interface DevelopmentMatrix {
  schemaVersion: number;
  classification: string;
  purpose: string;
  frozenBenchmarkResultsDisposition: string;
  privateClinicalPayloadIncluded: boolean;
  validationClaimPermitted: boolean;
  families: DevelopmentFamily[];
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function section(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endMarker} after ${startMarker}`).toBeGreaterThan(start);
  return text.slice(start, end).replace(/\s+/gu, " ");
}

async function matrix(): Promise<DevelopmentMatrix> {
  return JSON.parse(await readFile(
    new URL("docs/mast-derived-clinical-management-regressions-v0.1.0.json", ROOT),
    "utf8",
  )) as DevelopmentMatrix;
}

function family(input: DevelopmentMatrix, familyId: string): DevelopmentFamily {
  const result = input.families.find((candidate) => candidate.familyId === familyId);
  expect(result, `missing development family ${familyId}`).toBeDefined();
  return result!;
}

describe("root clinical-management and patient-specific safety gates", () => {
  it("places both Critical gates before ranking and outside Functional Health Coaching", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    expect(XMLValidator.validate(hrp)).toBe(true);
    expect(hrp).toMatch(/version="20\.5\.28" revisionDate="2026-09-10"/u);

    const management = '<ClinicalManagementPreservationGate priority="Critical">';
    const safety = '<PatientSpecificInterventionSafetyReconciliationGate priority="Critical">';
    for (const singleton of [
      '<Revision version="20.5.27" priority="Critical">',
      management,
      safety,
      '<Check id="FS203">',
      '<Check id="FS204">',
    ]) expect(occurrences(hrp, singleton), singleton).toBe(1);

    const managementStart = hrp.indexOf(management);
    const safetyStart = hrp.indexOf(safety);
    expect(managementStart).toBeLessThan(safetyStart);
    expect(safetyStart).toBeLessThan(
      hrp.indexOf('<ComparisonEstimandAndDoseExposureIntegrityGate priority="Critical">'),
    );
    expect(safetyStart).toBeLessThan(
      hrp.indexOf('<FunctionalHealthCoachingLayer priority="High">'),
    );
    expect(hrp).toContain("This root-level gate is independent of, and must not be confined to, FunctionalHealthCoachingLayer");
  });

  it("requires the complete action map without inventing dependencies", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    const gate = section(
      hrp,
      '<ClinicalManagementPreservationGate priority="Critical">',
      "</ClinicalManagementPreservationGate>",
    );

    for (const required of [
      "direct diagnosis, diagnostic-workup, treatment, prevention, or management question",
      "before deep research synthesis",
      "`REQUIRED_NOW`",
      "`CONTINGENT_LATER`",
      "`OPTIONAL_ALTERNATIVE`",
      "`AVOID`",
      "controls presentation priority only",
      "must not suppress other independently necessary actions",
      "unless the dependency is clinically real",
      "Preserve `CONTINGENT_LATER` status",
      "Any departure from established management must be explicit",
      "supported by evidence applicable to the exact population and timing",
      "DecisiveRecommendationAfterReconciliation",
      "SingularNextActionDoesNotEraseConcurrentCare",
      "ClinicallyRealDependencyRemainsContingent",
      "ClearContinuationDoesNotBecomeRoutineHold",
    ]) expect(gate).toContain(required);
  });

  it("reconciles every intervention against the patient before efficacy ranking", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    const gate = section(
      hrp,
      '<PatientSpecificInterventionSafetyReconciliationGate priority="Critical">',
      "</PatientSpecificInterventionSafetyReconciliationGate>",
    );

    for (const required of [
      "Before efficacy ranking",
      "every proposed medication",
      "supplement",
      "procedure",
      "diagnostic intervention",
      "salient diagnoses and comorbidities",
      "current prescription and nonprescription medications",
      "allergies and prior adverse reactions",
      "organ-function context",
      "pregnancy, lactation, fertility, or reproductive context when relevant",
      "candidate- or class-level contraindications, precautions, and interactions",
      "Record each field as known, unknown, or not applicable with a reason",
      "ResolveConflictsBeforeRecommendationOrRanking",
      "every material missing safety input is resolved",
      "An unresolved state keeps recommendation or ranking admission at no",
      "case-report-level association is not a categorical universal contraindication",
      "CaseSpecificConflictIsNotUniversalBan",
      "MissingMaterialSafetyHistoryBlocksRanking",
      "nonconflicting alternatives",
    ]) expect(gate).toContain(required);
  });
});

describe("sanitized MAST development regressions", () => {
  it("keeps the five named families development-only and excludes private payload fields", async () => {
    const input = await matrix();
    expect(Object.keys(input).sort()).toEqual([
      "classification",
      "families",
      "frozenBenchmarkResultsDisposition",
      "privateClinicalPayloadIncluded",
      "purpose",
      "schemaVersion",
      "validationClaimPermitted",
    ]);
    expect(input).toMatchObject({
      schemaVersion: 1,
      classification: "DEVELOPMENT_REGRESSION_ONLY",
      frozenBenchmarkResultsDisposition: "PRESERVE_UNCHANGED",
      privateClinicalPayloadIncluded: false,
      validationClaimPermitted: false,
    });
    expect(input.families.map(({ familyId }) => familyId)).toEqual([
      "Neuro007",
      "Derm001",
      "Heme010",
      "Endo002",
      "Pulm005",
    ]);
    for (const candidate of input.families) {
      expect(Object.keys(candidate).sort()).toEqual(["familyId", "requirements", "role"]);
    }
    expect(JSON.stringify(input)).not.toMatch(/rawResponse|judgeOutput|patientPrompt|rubricPayload|archivePath/u);
  });

  it("preserves the Neuro007 lead, concurrent workup, and real escalation boundary", async () => {
    const neuro = family(await matrix(), "Neuro007");
    expect(neuro.role).toBe("CLINICAL_MANAGEMENT_PRESERVATION");
    expect(neuro.requirements).toEqual([
      "Lead with MRI brain without contrast.",
      "Preserve concurrent cognitive assessment, reversible-cause laboratory evaluation, and medication review as current actions.",
      "Keep neurology, EEG, and neuropsychological escalation contingent on persistent symptoms or an unrevealing initial workup.",
    ]);
  });

  it("preserves Derm001 case-specific reconciliation without a universal retinoid ban", async () => {
    const derm = family(await matrix(), "Derm001");
    expect(derm.role).toBe("PATIENT_SPECIFIC_SAFETY_RECONCILIATION");
    expect(derm.requirements.join(" ")).toContain("idiopathic intracranial hypertension");
    expect(derm.requirements.join(" ")).toContain("before efficacy ranking");
    expect(derm.requirements.join(" ")).toContain("case-report-level");
    expect(derm.requirements.join(" ")).toContain("Do not encode a universal tretinoin prohibition");
    expect(derm.requirements.join(" ")).toContain("non-retinoid alternatives");
  });

  it("preserves the Endo002 and Pulm005 positive controls", async () => {
    const input = await matrix();
    const endo = family(input, "Endo002");
    const pulm = family(input, "Pulm005");
    expect(endo.role).toBe("DECISIVE_POSITIVE_CONTROL");
    expect(endo.requirements).toEqual([
      "Preserve the decisive recommendation to continue alendronate rather than routinely holding it when no patient-specific conflict changes management.",
    ]);
    expect(pulm.role).toBe("CONDITIONAL_SEQUENCE_POSITIVE_CONTROL");
    expect(pulm.requirements).toEqual([
      "Preserve legitimate cause-directed pulmonary workup and conditional escalation when the later action has a clinically real prerequisite.",
    ]);
  });

  it("routes Heme010 to target integrity while preserving legitimate prevention", async () => {
    const heme = family(await matrix(), "Heme010");
    expect(heme.role).toBe("BENCHMARK_TARGET_INTEGRITY");
    expect(heme.requirements.join(" ")).toContain("BENCHMARK_TARGET_CONFLICT");
    expect(heme.requirements.join(" ")).toContain("Do not force antiphospholipid testing or late bilateral Doppler solely for benchmark conformity");
    expect(heme.requirements.join(" ")).toContain("counseling and prophylaxis");
  });
});
