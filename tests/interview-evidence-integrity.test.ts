import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import {
  patientStoryEvidenceExtensionV020Schema,
  type PatientStoryEvidenceExtensionV020,
} from "../packages/contracts/src/index.js";
import { buildPatientStoryEvidenceJsonSchema } from "../scripts/generate-patient-story-evidence-v0.2-schema.mjs";

const ROOT = new URL("../", import.meta.url);
const V01_JSON_SHA = "19d83431bfebf5239e37f71d21ffed049d1b71d5d859220a76dda48a7c4af82d";
const V01_TYPESCRIPT_SHA = "635f4146f3380dfbc4ae0f14e6d0ad5003ddadb79df7af1be4b84e65cca19967";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function validExtension(): PatientStoryEvidenceExtensionV020 {
  return {
    schema_version: "0.2.0",
    extension_id: "ARIE-RECURRENCE01",
    story_id: "ARS-RECURRENCE01",
    source_story_schema_version: "0.1.0",
    source_story_payload_sha256: "a".repeat(64),
    method_version: "patient-story-interview-method-0.2.0",
    collection_actor: "HUMAN_RESPONDENT_INTERVIEW",
    human_interface: {
      interface_id: "moderated-interview-guide",
      interface_version: "0.2.0",
      ordinary_controls_confirmed: true,
      raw_serialization_required: false,
      blinding_preserved: null,
    },
    evidence_items: [
      {
        evidence_id: "AREV-RECURRENCE01",
        role: "DIRECT_RECURRENCE_SELF_REPORT",
        source_text: "This happens every time I eat X.",
        elicitation_mode: "SPONTANEOUS",
        evidential_independence: "DIRECT_REPORT_ONLY",
        recurrence_claim: {
          behavioral_or_symptom_proposition: "The symptom occurs after eating X",
          original_quantifier: "every time",
          opportunity_scope_or_denominator: "Meals containing X during the last year",
          life_period_or_context: "The last year",
          exceptions: ["A small serving on one occasion did not cause the symptom"],
          exception_frequency: "Almost never",
          quantifier_uncertainty: "Recall is approximate",
          calibration_status: "PROBED_EXCEPTIONS_REPORTED",
        },
        bounded_episode_ref: null,
        context_or_boundary: null,
        sampling_frame: null,
        trait_or_interpretive_label: null,
        causal_explanation: null,
        analyst_or_coder_inference: null,
        source_turn_or_record_id: "turn-1",
        collected_at: "2026-09-08T00:00:00Z",
        notes: null,
      },
    ],
    follow_up_decisions: [
      {
        follow_up_id: "ARFU-EXCEPTION01",
        question: "When meals contain X, how often does the symptom not occur?",
        status: "ASKED",
        basis: "EXPECTED_INFORMATION_GAIN",
        uncertainty_target: "Whether every time has exceptions",
        plausible_answer_that_changes_next_step: "Frequent exceptions would weaken the recurrence estimate",
        could_change: ["INFERENCE", "NEXT_QUESTION"],
        skip_reason: null,
      },
    ],
    prior_data_reinterpreted: false,
    created_at: "2026-09-08T00:00:00Z",
  };
}

describe("interview-evidence protocol integration", () => {
  it("adds the Universal 20.5.22 gate without weakening current integrity controls", async () => {
    const text = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(XMLValidator.validate(text)).toBe(true);
    expect(text).toMatch(/version="20\.5\.22" revisionDate="2026-09-08"/u);
    for (const required of [
      '<revision version="20.5.22" priority="Critical">',
      '<interview_evidence_information_gain_gate priority="Critical">',
      'name="SpecificityIsNotIndependence"',
      'name="DirectRecurrenceSelfReport"',
      'name="OrdinaryLanguageQuantifierCalibration"',
      'name="ExceptionFirstRecurrenceProbe"',
      'name="IncidentInformationGain"',
      'name="CounterexampleValue"',
      'name="FrequencySamplingFrame"',
      'name="NoFormatQuota"',
      'name="EvidenceRoleSeparation"',
      'name="BehaviorVersusTrait"',
      'name="FollowUpExpectedInformationGain"',
      'name="SuppliedMethodologyFirst"',
      'name="HumanJudgmentInterface"',
      'name="PreCollectionMethodDefect"',
      'a self-selected confirming example of X is conditionally sampled',
      'do not count it as a random opportunity',
      'Do not automatically interpret ordinary-language “always”',
      'Several volunteered examples do not become representative',
      'JSON, JSONL, and schemas are machine interchange formats',
      'Interview-evidence check:',
      '<evidence_direction_check priority="Critical">',
      '<specificity_check priority="Critical">',
      '<comparison_integrity_gate priority="Critical">',
    ]) expect(text).toContain(required);
    expect(occurrences(text, '<interview_evidence_information_gain_gate priority="Critical">')).toBe(1);
  });

  it("adds the HRP 20.5.26 patient-history application and regression", async () => {
    const text = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    expect(XMLValidator.validate(text)).toBe(true);
    expect(text).toMatch(/version="20\.5\.26" revisionDate="2026-09-08"/u);
    for (const required of [
      '<Revision version="20.5.26" priority="Critical">',
      '<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">',
      'name="ReportedRecurrenceIsEvidence"',
      'name="PatientExceptionFirstProbe"',
      'name="HealthEvidenceRoleLedger"',
      'name="OpportunityFrequencySampling"',
      'name="HealthFollowUpInformationGain"',
      'name="HealthCollectionMethodIntegrity"',
      'id="EveryFoodExposureRecurrenceReport"',
      'this happens every time I eat X',
      '<Check id="FS202">',
      '<DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch',
      '<ComparisonEstimandAndDoseExposureIntegrityGate priority="Critical">',
    ]) expect(text).toContain(required);
    expect(occurrences(text, '<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">')).toBe(1);
  });

  it("routes AskRigor intake and review workers through the canonical gates", async () => {
    const project = await readFile(new URL("project/PROJECT_INSTRUCTIONS.md", ROOT), "utf8");
    for (const required of [
      "### Reasoning and interview-evidence application",
      "For histories, recurrence, surveys, follow-ups, extraction, and dialogue",
      "apply Universal/HRP interview-evidence gates",
      "Preserve recurrence separately from other roles",
      "probe scope, exceptions, conditions, timing, and contrasts before anecdotes",
      "Retrieve owner methodology, use human controls",
      "without altering frozen methods/data",
    ]) expect(project).toContain(required);
  });
});

describe("patient-story evidence extension v0.2", () => {
  it("keeps the frozen patient-story v0.1 contract and implementation byte-identical", async () => {
    const [json, source] = await Promise.all([
      readFile(new URL("docs/patient-story-intake-contract-v0.1.0.json", ROOT)),
      readFile(new URL("packages/contracts/src/patient-story.ts", ROOT)),
    ]);
    expect(sha256(json)).toBe(V01_JSON_SHA);
    expect(sha256(source)).toBe(V01_TYPESCRIPT_SHA);
  });

  it("keeps the generated JSON Schema synchronized with the typed contract", async () => {
    const checkedIn = JSON.parse(
      await readFile(new URL("docs/patient-story-evidence-extension-v0.2.0.json", ROOT), "utf8"),
    ) as unknown;
    expect(checkedIn).toEqual(buildPatientStoryEvidenceJsonSchema());
  });

  it("accepts calibrated reported recurrence while preserving its evidence role", () => {
    expect(patientStoryEvidenceExtensionV020Schema.parse(validExtension())).toEqual(validExtension());
  });

  it("rejects a selected confirming example labeled as independent frequency evidence", () => {
    const input = structuredClone(validExtension());
    input.evidence_items[0]!.role = "BOUNDED_EPISODE";
    input.evidence_items[0]!.recurrence_claim = null;
    input.evidence_items[0]!.bounded_episode_ref = "episode-selected-after-claim";
    input.evidence_items[0]!.elicitation_mode = "CONFIRMING_EXAMPLE_REQUEST";
    input.evidence_items[0]!.evidential_independence = "INDEPENDENT_WITHIN_DEFINED_FRAME";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/self-selected confirming example/i);

    input.evidence_items[0]!.evidential_independence = "UNKNOWN";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/conditionally sampled detail/i);
  });

  it("requires a defined frame for opportunity-level frequency observations", () => {
    const input = structuredClone(validExtension());
    input.evidence_items[0]!.role = "SAMPLED_OPPORTUNITY_OBSERVATION";
    input.evidence_items[0]!.recurrence_claim = null;
    input.evidence_items[0]!.evidential_independence = "INDEPENDENT_WITHIN_DEFINED_FRAME";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/requires sampling_frame/i);
  });

  it("does not permit defined-frame independence on a nonsampled evidence role", () => {
    const input = structuredClone(validExtension());
    input.evidence_items[0]!.evidential_independence = "INDEPENDENT_WITHIN_DEFINED_FRAME";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/reserved for sampled opportunity/i);
  });

  it("does not infer statistical independence from a valid opportunity frame", () => {
    const input = structuredClone(validExtension());
    input.evidence_items[0]!.role = "SAMPLED_OPPORTUNITY_OBSERVATION";
    input.evidence_items[0]!.recurrence_claim = null;
    input.evidence_items[0]!.elicitation_mode = "VALID_SAMPLING_FRAME";
    input.evidence_items[0]!.evidential_independence = "DEPENDENT_OR_CLUSTERED_WITHIN_DEFINED_FRAME";
    input.evidence_items[0]!.sampling_frame = {
      design: "REPEATED_MEASURES",
      target_opportunity: "Meals containing X",
      observation_period: "Four weeks",
      opportunities_with_target_event_observed: 7,
      opportunities_without_target_event_observed: 5,
      frame_limitations: "Repeated observations are clustered within one participant",
    };
    expect(patientStoryEvidenceExtensionV020Schema.parse(input)).toEqual(input);

    input.evidence_items[0]!.evidential_independence = "CONDITIONALLY_SAMPLED_DETAIL";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/dependence status/i);
  });

  it("does not let one evidence role silently carry another role's payload", () => {
    const input = structuredClone(validExtension());
    input.evidence_items[0]!.trait_or_interpretive_label = "I am cautious";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/another evidence role/i);
  });

  it("rejects empty role payloads and preserves volunteered exceptions before probing", () => {
    const emptyEpisode = structuredClone(validExtension());
    emptyEpisode.evidence_items[0]!.role = "BOUNDED_EPISODE";
    emptyEpisode.evidence_items[0]!.recurrence_claim = null;
    emptyEpisode.evidence_items[0]!.bounded_episode_ref = "";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(emptyEpisode)).toThrow();

    const volunteeredException = structuredClone(validExtension());
    volunteeredException.evidence_items[0]!.recurrence_claim!.calibration_status = "NOT_YET_PROBED";
    expect(patientStoryEvidenceExtensionV020Schema.parse(volunteeredException)).toEqual(volunteeredException);

    volunteeredException.evidence_items[0]!.recurrence_claim!.calibration_status = "PROBED_NO_EXCEPTIONS_REPORTED";
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(volunteeredException)).toThrow(/cannot carry preserved exceptions/i);
  });

  it("requires opportunity-frequency count components together", () => {
    const input = structuredClone(validExtension());
    input.evidence_items[0]!.role = "SAMPLED_OPPORTUNITY_OBSERVATION";
    input.evidence_items[0]!.recurrence_claim = null;
    input.evidence_items[0]!.elicitation_mode = "VALID_SAMPLING_FRAME";
    input.evidence_items[0]!.evidential_independence = "UNKNOWN";
    input.evidence_items[0]!.sampling_frame = {
      design: "STRUCTURED_OPPORTUNITY",
      target_opportunity: "Meals containing X",
      observation_period: "Four weeks",
      opportunities_with_target_event_observed: 7,
      opportunities_without_target_event_observed: null,
      frame_limitations: null,
    };
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/must provide both/i);
  });

  it("requires explicit information gain for a planned nonmandatory follow-up", () => {
    const input = structuredClone(validExtension());
    input.follow_up_decisions[0]!.uncertainty_target = null;
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/nonmandatory follow-up/i);
  });

  it("requires a human-facing interface for human judgment", () => {
    const input = structuredClone(validExtension());
    input.human_interface = null;
    expect(() => patientStoryEvidenceExtensionV020Schema.parse(input)).toThrow(/human-facing interface/i);
  });

  it("enforces the same load-bearing combinations in the JSON contract", async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    ajv.addKeyword({ keyword: "x-method-invariants" });
    addFormats(ajv);
    const schema = JSON.parse(
      await readFile(new URL("docs/patient-story-evidence-extension-v0.2.0.json", ROOT), "utf8"),
    ) as object;
    const validate = ajv.compile(schema);
    expect(validate(validExtension()), JSON.stringify(validate.errors)).toBe(true);

    const confirming = structuredClone(validExtension());
    confirming.evidence_items[0]!.role = "BOUNDED_EPISODE";
    confirming.evidence_items[0]!.recurrence_claim = null;
    confirming.evidence_items[0]!.bounded_episode_ref = "episode-selected-after-claim";
    confirming.evidence_items[0]!.elicitation_mode = "CONFIRMING_EXAMPLE_REQUEST";
    confirming.evidence_items[0]!.evidential_independence = "INDEPENDENT_WITHIN_DEFINED_FRAME";
    expect(validate(confirming)).toBe(false);

    const noInterface = structuredClone(validExtension());
    noInterface.human_interface = null;
    expect(validate(noInterface)).toBe(false);

    const mixedRoles = structuredClone(validExtension());
    mixedRoles.evidence_items[0]!.trait_or_interpretive_label = "I am cautious";
    expect(validate(mixedRoles)).toBe(false);

    const dependentSample = structuredClone(validExtension());
    dependentSample.evidence_items[0]!.role = "SAMPLED_OPPORTUNITY_OBSERVATION";
    dependentSample.evidence_items[0]!.recurrence_claim = null;
    dependentSample.evidence_items[0]!.elicitation_mode = "VALID_SAMPLING_FRAME";
    dependentSample.evidence_items[0]!.evidential_independence = "DEPENDENT_OR_CLUSTERED_WITHIN_DEFINED_FRAME";
    dependentSample.evidence_items[0]!.sampling_frame = {
      design: "REPEATED_MEASURES",
      target_opportunity: "Meals containing X",
      observation_period: "Four weeks",
      opportunities_with_target_event_observed: 7,
      opportunities_without_target_event_observed: 5,
      frame_limitations: "Repeated observations are clustered within one participant",
    };
    expect(validate(dependentSample), JSON.stringify(validate.errors)).toBe(true);

    const promotedDirectReport = structuredClone(validExtension());
    promotedDirectReport.evidence_items[0]!.evidential_independence = "INDEPENDENT_WITHIN_DEFINED_FRAME";
    expect(validate(promotedDirectReport)).toBe(false);

    const emptyEpisode = structuredClone(validExtension());
    emptyEpisode.evidence_items[0]!.role = "BOUNDED_EPISODE";
    emptyEpisode.evidence_items[0]!.recurrence_claim = null;
    emptyEpisode.evidence_items[0]!.bounded_episode_ref = "";
    expect(validate(emptyEpisode)).toBe(false);

    const incompleteCounts = structuredClone(dependentSample);
    incompleteCounts.evidence_items[0]!.sampling_frame!.opportunities_without_target_event_observed = null;
    expect(validate(incompleteCounts)).toBe(false);

    const volunteeredException = structuredClone(validExtension());
    volunteeredException.evidence_items[0]!.recurrence_claim!.calibration_status = "NOT_YET_PROBED";
    expect(validate(volunteeredException), JSON.stringify(validate.errors)).toBe(true);
  });
});
