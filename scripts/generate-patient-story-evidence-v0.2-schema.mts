import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { patientStoryEvidenceExtensionV020Schema } from "../packages/contracts/src/patient-story-evidence-v0.2.js";

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Expected ${label} to be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`Expected ${label} to be an array`);
  return value;
}

export function buildPatientStoryEvidenceJsonSchema(): JsonObject {
  const schema = object(z.toJSONSchema(patientStoryEvidenceExtensionV020Schema), "root schema");
  schema.$id = "https://askrigor.com/schemas/patient-story-evidence-extension-v0.2.0.json";
  schema.title = "AskRigor patient-story interview evidence extension v0.2.0";
  schema.description =
    "Append-only evidence-role and follow-up-decision extension for a frozen patient-story v0.1 record. It preserves reported recurrence without treating selected anecdotes as independent frequency observations.";
  schema["x-method-invariants"] = [
    "Specificity and vividness do not establish evidential independence.",
    "Direct recurrence self-report, bounded episodes, exceptions, sampled opportunities, traits, causes, and analyst inference remain separate evidence roles.",
    "Actual opportunity frequency requires a defined sampling frame.",
    "Nonmandatory follow-ups require expected information gain.",
    "Human judgment uses ordinary controls and exports this contract; humans do not hand-edit JSON.",
    "The extension does not reinterpret frozen v0.1 records or previously collected data.",
  ];

  const properties = object(schema.properties, "root properties");
  const evidenceItems = object(properties.evidence_items, "evidence_items");
  const evidenceItem = object(evidenceItems.items, "evidence_items.items");
  const rolePayload = {
    DIRECT_RECURRENCE_SELF_REPORT: ["recurrence_claim", { type: "object" }],
    BOUNDED_EPISODE: ["bounded_episode_ref", { type: "string", minLength: 1 }],
    EXCEPTION_OR_COUNTEREXAMPLE: ["context_or_boundary", { type: "string", minLength: 1 }],
    CONTEXT_OR_BOUNDARY_STATEMENT: ["context_or_boundary", { type: "string", minLength: 1 }],
    SAMPLED_OPPORTUNITY_OBSERVATION: ["sampling_frame", { type: "object" }],
    TRAIT_OR_INTERPRETIVE_LABEL: ["trait_or_interpretive_label", { type: "string", minLength: 1 }],
    CAUSAL_EXPLANATION: ["causal_explanation", { type: "string", minLength: 1 }],
    ANALYST_OR_CODER_INFERENCE: ["analyst_or_coder_inference", { type: "string", minLength: 1 }],
  } as const;
  const rolePayloadFields = Array.from(new Set(Object.values(rolePayload).map(([field]) => field)));
  const roleClauses = Object.entries(rolePayload).map(([role, [field, fieldSchema]]) => ({
    if: { properties: { role: { const: role } }, required: ["role"] },
    then: {
      properties: Object.fromEntries([
        [field, fieldSchema],
        ...rolePayloadFields.filter((candidate) => candidate !== field).map((candidate) => [candidate, { type: "null" }]),
        ...(role === "SAMPLED_OPPORTUNITY_OBSERVATION"
          ? [["evidential_independence", { const: "INDEPENDENT_WITHIN_DEFINED_FRAME" }] as const]
          : []),
      ]),
    },
  }));
  evidenceItem.allOf = [
    ...roleClauses,
    {
      if: { properties: { elicitation_mode: { const: "CONFIRMING_EXAMPLE_REQUEST" } }, required: ["elicitation_mode"] },
      then: { properties: { evidential_independence: { not: { const: "INDEPENDENT_WITHIN_DEFINED_FRAME" } } } },
    },
  ];

  const evidenceProperties = object(evidenceItem.properties, "evidence item properties");
  const recurrenceAnyOf = array(object(evidenceProperties.recurrence_claim, "recurrence_claim").anyOf, "recurrence_claim.anyOf");
  const recurrenceObject = object(recurrenceAnyOf[0], "recurrence claim object");
  recurrenceObject.allOf = [
    {
      if: { properties: { calibration_status: { const: "PROBED_EXCEPTIONS_REPORTED" } }, required: ["calibration_status"] },
      then: { properties: { exceptions: { type: "array", minItems: 1 } } },
    },
    {
      if: { properties: { exceptions: { type: "array", minItems: 1 } }, required: ["exceptions"] },
      then: { properties: { calibration_status: { const: "PROBED_EXCEPTIONS_REPORTED" } } },
    },
  ];

  const followUps = object(properties.follow_up_decisions, "follow_up_decisions");
  const followUp = object(followUps.items, "follow_up_decisions.items");
  followUp.allOf = [
    {
      if: {
        properties: {
          basis: { const: "EXPECTED_INFORMATION_GAIN" },
          status: { enum: ["PLANNED", "ASKED"] },
        },
        required: ["basis", "status"],
      },
      then: {
        properties: {
          uncertainty_target: { type: "string", minLength: 1 },
          plausible_answer_that_changes_next_step: { type: "string", minLength: 1 },
          could_change: { type: "array", minItems: 1 },
        },
      },
    },
    {
      if: { properties: { status: { const: "SKIPPED" } }, required: ["status"] },
      then: { properties: { skip_reason: { type: "string", minLength: 1 } } },
    },
  ];

  schema.allOf = [
    {
      if: {
        properties: { collection_actor: { enum: ["HUMAN_RESPONDENT_INTERVIEW", "HUMAN_REVIEWER"] } },
        required: ["collection_actor"],
      },
      then: { properties: { human_interface: { type: "object" } } },
    },
  ];
  return schema;
}

export function renderPatientStoryEvidenceJsonSchema(): string {
  return `${JSON.stringify(buildPatientStoryEvidenceJsonSchema(), null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(fileURLToPath(new URL("../docs/patient-story-evidence-extension-v0.2.0.json", import.meta.url)));
  await writeFile(output, renderPatientStoryEvidenceJsonSchema(), "utf8");
  process.stdout.write(`${output}\n`);
}
