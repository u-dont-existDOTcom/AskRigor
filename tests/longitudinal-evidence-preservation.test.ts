import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import {
  patientStoryEvidenceExtensionV030Schema,
  type PatientStoryEvidenceExtensionV030,
} from "../packages/contracts/src/index.js";
import { buildPatientStoryEvidenceV030JsonSchema } from "../scripts/generate-patient-story-evidence-v0.3-schema.mjs";

const ROOT = new URL("../", import.meta.url);
const FROZEN = {
  "docs/patient-story-intake-contract-v0.1.0.json": "19d83431bfebf5239e37f71d21ffed049d1b71d5d859220a76dda48a7c4af82d",
  "packages/contracts/src/patient-story.ts": "635f4146f3380dfbc4ae0f14e6d0ad5003ddadb79df7af1be4b84e65cca19967",
  "docs/patient-story-interview-method-v0.2.0.md": "d6aadca51e5e23e3d6dd2f69f747238442a4058eb94f31f0685f730ec8b7ec39",
  "docs/patient-story-evidence-extension-v0.2.0.json": "776f69b7e2c5fc5494b1fe58298a9062a4286ce85259dd0e774758048d8d7537",
  "packages/contracts/src/patient-story-evidence-v0.2.ts": "581e10d1d7faf096c3c9cd58758b9192b0481fffe135f0be7231e8b354c4abb3",
} as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function validExtension(): PatientStoryEvidenceExtensionV030 {
  return {
    schema_version: "0.3.0",
    extension_id: "ARIE-LONGITUDINAL01",
    story_id: "ARS-LONGITUDINAL01",
    source_story_schema_version: "0.1.0",
    source_story_payload_sha256: "a".repeat(64),
    method_version: "patient-story-interview-method-0.3.0",
    collection_actor: "HUMAN_REVIEWER",
    human_interface: {
      interface_id: "longitudinal-review-form",
      interface_version: "0.3.0",
      ordinary_controls_confirmed: true,
      raw_serialization_required: false,
      blinding_preserved: true,
    },
    evidence_items: [
      {
        evidence_id: "AREV-EXPOSURE01",
        role: "CONTEXT_OR_BOUNDARY_STATEMENT",
        source_text: "Widespread lesions began immediately after one specific exposure.",
        elicitation_mode: "OPEN_ENDED",
        evidential_independence: "DIRECT_REPORT_ONLY",
        recurrence_claim: null,
        bounded_episode_ref: null,
        context_or_boundary: "Onset immediately followed the candidate exposure.",
        sampling_frame: null,
        trait_or_interpretive_label: null,
        causal_explanation: null,
        analyst_or_coder_inference: null,
        source_turn_or_record_id: "turn-1",
        collected_at: "2026-09-10T00:00:00Z",
        notes: null,
      },
      {
        evidence_id: "AREV-RESPONSE01",
        role: "DIRECT_RECURRENCE_SELF_REPORT",
        source_text: "The systemic illness persisted for years and repeatedly improved with the same treatment class.",
        elicitation_mode: "SPONTANEOUS",
        evidential_independence: "DIRECT_REPORT_ONLY",
        recurrence_claim: {
          behavioral_or_symptom_proposition: "Systemic symptoms improve after the treatment class",
          original_quantifier: "repeatedly",
          opportunity_scope_or_denominator: "Repeated treatment courses over several years",
          life_period_or_context: "The chronic illness period",
          exceptions: [],
          exception_frequency: null,
          quantifier_uncertainty: "Exact course count not supplied",
          calibration_status: "NOT_YET_PROBED",
        },
        bounded_episode_ref: null,
        context_or_boundary: null,
        sampling_frame: null,
        trait_or_interpretive_label: null,
        causal_explanation: null,
        analyst_or_coder_inference: null,
        source_turn_or_record_id: "turn-1",
        collected_at: "2026-09-10T00:00:00Z",
        notes: null,
      },
      {
        evidence_id: "AREV-PHOTO01",
        role: "CONTEXT_OR_BOUNDARY_STATEMENT",
        source_text: "The photograph resembles a common chronic inflammatory dermatosis.",
        elicitation_mode: "PUBLIC_SOURCE_EXTRACTION",
        evidential_independence: "NOT_APPLICABLE",
        recurrence_claim: null,
        bounded_episode_ref: null,
        context_or_boundary: "Current cross-sectional morphology",
        sampling_frame: null,
        trait_or_interpretive_label: null,
        causal_explanation: null,
        analyst_or_coder_inference: null,
        source_turn_or_record_id: "image-1",
        collected_at: "2026-09-10T00:00:00Z",
        notes: null,
      },
    ],
    follow_up_decisions: [],
    prior_data_reinterpreted: false,
    created_at: "2026-09-10T00:00:00Z",
    causal_assessment_status: "RANKED",
    causal_assessment: {
      complete_supplied_history_reviewed: true,
      longitudinal_constraints: [
        {
          observation_id: "ARLO-ONSET01",
          kind: "ONSET_RELATIVE_TO_EXPOSURE",
          observation: "Lesions began immediately after the candidate exposure.",
          source_evidence_ids: ["AREV-EXPOSURE01"],
          high_information_reason: "The onset sharply constrains causal timing.",
          uncertainty: "The exact elapsed interval was not quantified.",
        },
        {
          observation_id: "ARLO-PERSIST01",
          kind: "PERSISTENCE",
          observation: "Systemic illness persisted for years.",
          source_evidence_ids: ["AREV-RESPONSE01"],
          high_information_reason: "The proposed cause must explain a chronic systemic trajectory.",
          uncertainty: null,
        },
        {
          observation_id: "ARLO-CLASSRESP01",
          kind: "TREATMENT_CLASS_RESPONSE",
          observation: "Symptoms repeatedly improved with one mechanistically relevant treatment class.",
          source_evidence_ids: ["AREV-RESPONSE01"],
          high_information_reason: "Repeated class response discriminates maintaining-mechanism hypotheses.",
          uncertainty: "Course count and concurrent changes remain unknown.",
        },
      ],
      phenotype_observations: [
        {
          phenotype_observation_id: "ARPH-PHOTO01",
          observation_type: "PHOTOGRAPH",
          description: "Image morphology resembles a common chronic inflammatory dermatosis.",
          source_evidence_ids: ["AREV-PHOTO01"],
          etiology_status: "PHENOTYPE_ONLY",
          independent_etiology_evidence_ids: [],
        },
      ],
      causal_hypotheses: [
        {
          hypothesis_id: "ARHY-EXPOSURE01",
          hypothesis: "The exposure initiated a process that persists or is maintained downstream.",
          causal_role: "BOTH",
          rank: 1,
          overall_fit: "FITS_COMPLETE_PATTERN",
          constraint_predictions: [
            { observation_id: "ARLO-ONSET01", prediction: "EXPECTED", explanation: "Exposure precedes immediate onset." },
            { observation_id: "ARLO-PERSIST01", prediction: "EXPECTED", explanation: "A maintained downstream process permits persistence." },
            { observation_id: "ARLO-CLASSRESP01", prediction: "EXPECTED", explanation: "Class response is compatible with the proposed mechanism." },
          ],
          ranking_exception_reason: null,
        },
        {
          hypothesis_id: "ARHY-MORPHOLOGY01",
          hypothesis: "A common idiopathic inflammatory dermatosis independently explains the full illness.",
          causal_role: "BOTH",
          rank: 2,
          overall_fit: "CONFLICTS_WITH_HIGH_INFORMATION_EVIDENCE",
          constraint_predictions: [
            { observation_id: "ARLO-ONSET01", prediction: "UNEXPECTED", explanation: "It does not explain exposure-linked onset." },
            { observation_id: "ARLO-PERSIST01", prediction: "COMPATIBLE_BUT_NONSPECIFIC", explanation: "Chronic persistence is possible but nonspecific." },
            { observation_id: "ARLO-CLASSRESP01", prediction: "UNEXPECTED", explanation: "It does not predict repeated class response without another mechanism." },
          ],
          ranking_exception_reason: null,
        },
      ],
    },
    evidence_updates: [
      {
        update_id: "ARUP-REWEIGHT01",
        source_turn_or_record_id: "turn-2",
        classification: "REWEIGHTING_OR_CORRECTION_OF_ALREADY_PRESENT_EVIDENCE",
        decisive_evidence_ids: ["AREV-EXPOSURE01", "AREV-RESPONSE01"],
        decisive_evidence_already_present: true,
        earlier_failure: "EVIDENCE_WEIGHTING_FAILURE",
        explanation: "The follow-up highlighted chronology and repeated response already present in turn 1.",
      },
    ],
  };
}

describe("canonical longitudinal-evidence and phenotype–etiology gates", () => {
  it("extends the existing Universal evidence-discrimination architecture once", async () => {
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(XMLValidator.validate(universal)).toBe(true);
    expect(universal).toMatch(/version="20\.5\.23" revisionDate="2026-09-10"/u);
    for (const singleton of [
      '<revision version="20.5.23" priority="Critical">',
      '<evidence_discrimination_gate priority="Critical">',
      '<high_information_qualifier_check priority="Critical">',
      '<phenotype_etiology_firewall priority="Critical">',
    ]) expect(occurrences(universal, singleton), singleton).toBe(1);
    for (const required of [
      "three to seven observations from the complete supplied history",
      "onset relative to candidate exposures",
      "treatment-class response",
      "functional trajectory",
      "discriminating negative or tolerated comparisons",
      "what the observed lesion or phenotype is",
      "what may have initiated or may maintain it",
      "Morphological compatibility alone does not establish etiology",
      "new evidence or as reweighting/correction of already-present evidence",
      "evidence-weighting or semantic-representation failure",
      "Longitudinal-evidence check:",
    ]) expect(universal).toContain(required);
    for (const preserved of [
      '<evidence_direction_check priority="Critical">',
      '<specificity_check priority="Critical">',
      '<comparison_integrity_gate priority="Critical">',
      '<interview_evidence_information_gain_gate priority="Critical">',
    ]) expect(universal).toContain(preserved);
  });

  it("adds one root HRP gate extension, regression, correction classifier, and final checks", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    expect(XMLValidator.validate(hrp)).toBe(true);
    expect(hrp).toMatch(/version="20\.5\.28" revisionDate="2026-09-10"/u);
    for (const singleton of [
      '<Revision version="20.5.28" priority="Critical">',
      '<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">',
      'name="LongitudinalCausalConstraintMap"',
      'name="PhenotypeEtiologyFirewall"',
      'name="CompleteLongitudinalPredictionCheck"',
      'name="AlreadyPresentEvidenceUpdateClassification"',
      'name="AlreadyPresentEvidenceIsNotNew"',
      'id="ImageOverridesLongitudinalHistory"',
      '<Check id="FS205">',
      '<Check id="FS206">',
    ]) expect(occurrences(hrp, singleton), singleton).toBe(1);
    for (const preserved of [
      '<ClinicalManagementPreservationGate priority="Critical">',
      '<PatientSpecificInterventionSafetyReconciliationGate priority="Critical">',
      '<ComparisonEstimandAndDoseExposureIntegrityGate priority="Critical">',
      'name="ReportedRecurrenceIsEvidence"',
      'name="PatientExceptionFirstProbe"',
      '<Check id="FS203">',
      '<Check id="FS204">',
    ]) expect(hrp).toContain(preserved);
  });

  it("activates the rules in the compact Project router", async () => {
    const project = await readFile(new URL("project/PROJECT_INSTRUCTIONS.md", ROOT), "utf8");
    expect(Array.from(project)).toHaveLength(7812);
    for (const required of [
      "### Reasoning, interview, and longitudinal evidence",
      "Before an individual-case differential, extract the 3–7 strongest longitudinal constraints",
      "test every leading hypothesis against them",
      "Keep phenotype/morphology separate from etiology",
      "weighting or representation correction, not new evidence",
      "version pre-collection defects without altering frozen methods/data",
    ]) expect(project).toContain(required);
  });
});

describe("patient-story evidence extension v0.3", () => {
  it("keeps frozen v0.1 and v0.2 artifacts byte-identical", async () => {
    for (const [path, expected] of Object.entries(FROZEN)) {
      expect(sha256(await readFile(new URL(path, ROOT))), path).toBe(expected);
    }
  });

  it("keeps the generated v0.3 JSON Schema synchronized with the typed contract", async () => {
    const checkedIn = JSON.parse(await readFile(
      new URL("docs/patient-story-evidence-extension-v0.3.0.json", ROOT),
      "utf8",
    )) as unknown;
    expect(checkedIn).toEqual(buildPatientStoryEvidenceV030JsonSchema());
  });

  it("accepts a complete image-versus-longitudinal-history assessment", () => {
    expect(patientStoryEvidenceExtensionV030Schema.parse(validExtension())).toEqual(validExtension());
  });

  it("requires three to seven source-linked constraints and complete hypothesis coverage", () => {
    const tooFew = structuredClone(validExtension());
    tooFew.causal_assessment!.longitudinal_constraints.pop();
    expect(() => patientStoryEvidenceExtensionV030Schema.parse(tooFew)).toThrow();

    const missingPrediction = structuredClone(validExtension());
    missingPrediction.causal_assessment!.causal_hypotheses[0]!.constraint_predictions.pop();
    expect(() => patientStoryEvidenceExtensionV030Schema.parse(missingPrediction)).toThrow(/every longitudinal constraint/i);

    const unknownEvidence = structuredClone(validExtension());
    unknownEvidence.causal_assessment!.longitudinal_constraints[0]!.source_evidence_ids = ["AREV-NOTFOUND01"];
    expect(() => patientStoryEvidenceExtensionV030Schema.parse(unknownEvidence)).toThrow(/unknown linked evidence/i);
  });

  it("blocks a visually compatible but longitudinally conflicting hypothesis from outranking the complete fit silently", () => {
    const input = structuredClone(validExtension());
    input.causal_assessment!.causal_hypotheses[0]!.rank = 2;
    input.causal_assessment!.causal_hypotheses[1]!.rank = 1;
    expect(() => patientStoryEvidenceExtensionV030Schema.parse(input)).toThrow(/explicit evidence-supported reason/i);

    input.causal_assessment!.causal_hypotheses[1]!.ranking_exception_reason =
      "Independent etiologic evidence specifically resolves both longitudinal mismatches.";
    expect(patientStoryEvidenceExtensionV030Schema.parse(input)).toEqual(input);
  });

  it("keeps phenotype-only observations from silently carrying etiologic support", () => {
    const phenotypeWithCause = structuredClone(validExtension());
    phenotypeWithCause.causal_assessment!.phenotype_observations[0]!.independent_etiology_evidence_ids = ["AREV-PHOTO01"];
    expect(() => patientStoryEvidenceExtensionV030Schema.parse(phenotypeWithCause)).toThrow(/phenotype-only/i);

    const unsupportedCause = structuredClone(validExtension());
    unsupportedCause.causal_assessment!.phenotype_observations[0]!.etiology_status =
      "INDEPENDENT_ETIOLOGIC_EVIDENCE_PRESENT";
    expect(() => patientStoryEvidenceExtensionV030Schema.parse(unsupportedCause)).toThrow(/requires at least one/i);
  });

  it("rejects calling already-present decisive facts new evidence", () => {
    const input = structuredClone(validExtension());
    input.evidence_updates[0]!.classification = "NEW_EVIDENCE";
    input.evidence_updates[0]!.earlier_failure = null;
    expect(() => patientStoryEvidenceExtensionV030Schema.parse(input)).toThrow(/already present/i);
  });

  it("enforces the portable phenotype and update conditionals in the JSON contract", async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    ajv.addKeyword({ keyword: "x-method-invariants" });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(await readFile(
      new URL("docs/patient-story-evidence-extension-v0.3.0.json", ROOT),
      "utf8",
    )) as object);
    expect(validate(validExtension()), JSON.stringify(validate.errors)).toBe(true);

    const phenotypeWithCause = structuredClone(validExtension());
    phenotypeWithCause.causal_assessment!.phenotype_observations[0]!.independent_etiology_evidence_ids = ["AREV-PHOTO01"];
    expect(validate(phenotypeWithCause)).toBe(false);

    const falseNewEvidence = structuredClone(validExtension());
    falseNewEvidence.evidence_updates[0]!.classification = "NEW_EVIDENCE";
    falseNewEvidence.evidence_updates[0]!.earlier_failure = null;
    expect(validate(falseNewEvidence)).toBe(false);
  });
});
