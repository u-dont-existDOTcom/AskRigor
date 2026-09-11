import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { patientStoryEvidenceExtensionV030Schema } from "../packages/contracts/src/patient-story-evidence-v0.3.js";

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

export function buildPatientStoryEvidenceV030JsonSchema(): JsonObject {
  const schema = object(z.toJSONSchema(patientStoryEvidenceExtensionV030Schema), "root schema");
  schema.$id = "https://askrigor.com/schemas/patient-story-evidence-extension-v0.3.0.json";
  schema.title = "AskRigor patient-story interview evidence extension v0.3.0";
  schema.description =
    "Versioned pre-collection extension for recurrence evidence, longitudinal causal constraints, phenotype–etiology separation, and already-present-evidence correction classification. It does not reinterpret frozen v0.1 or v0.2 data.";
  schema["x-method-invariants"] = [
    "The complete supplied history is reviewed before an individual-case differential or causal ranking.",
    "A ranked differential requires three to seven source-linked, highest-information longitudinal constraints.",
    "Every leading hypothesis predicts every longitudinal constraint exactly once.",
    "A conflicting hypothesis cannot outrank a complete-pattern fit without an explicit evidence-supported reason.",
    "Photographs, morphology, diagnostic labels, common patterns, biomarkers, and other cross-sectional observations remain phenotype-only unless independent etiologic evidence is linked.",
    "Evidence already present before a later update is classified as reweighting or correction, with the earlier weighting or representation failure named.",
    "Specificity, recurrence, sampling, human-interface, and no-prior-data-reinterpretation controls from v0.2 remain active.",
  ];

  const properties = object(schema.properties, "root properties");
  const causalAssessment = object(properties.causal_assessment, "causal_assessment");
  const causalAnyOf = array(causalAssessment.anyOf, "causal_assessment.anyOf");
  const causalObject = object(causalAnyOf[0], "causal assessment object");
  const causalProperties = object(causalObject.properties, "causal assessment properties");

  const phenotypes = object(causalProperties.phenotype_observations, "phenotype_observations");
  const phenotype = object(phenotypes.items, "phenotype_observations.items");
  phenotype.allOf = [
    {
      if: {
        properties: { etiology_status: { const: "INDEPENDENT_ETIOLOGIC_EVIDENCE_PRESENT" } },
        required: ["etiology_status"],
      },
      then: { properties: { independent_etiology_evidence_ids: { type: "array", minItems: 1 } } },
    },
    {
      if: { properties: { etiology_status: { const: "PHENOTYPE_ONLY" } }, required: ["etiology_status"] },
      then: { properties: { independent_etiology_evidence_ids: { type: "array", maxItems: 0 } } },
    },
  ];

  const updates = object(properties.evidence_updates, "evidence_updates");
  const update = object(updates.items, "evidence_updates.items");
  update.allOf = [
    {
      if: {
        properties: { decisive_evidence_already_present: { const: true } },
        required: ["decisive_evidence_already_present"],
      },
      then: {
        properties: {
          classification: { const: "REWEIGHTING_OR_CORRECTION_OF_ALREADY_PRESENT_EVIDENCE" },
          earlier_failure: { enum: ["EVIDENCE_WEIGHTING_FAILURE", "SEMANTIC_REPRESENTATION_FAILURE", "BOTH"] },
        },
      },
    },
    {
      if: { properties: { classification: { const: "NEW_EVIDENCE" } }, required: ["classification"] },
      then: {
        properties: {
          decisive_evidence_already_present: { const: false },
          earlier_failure: { type: "null" },
        },
      },
    },
  ];

  const inheritedAllOf = Array.isArray(schema.allOf) ? schema.allOf : [];
  schema.allOf = [
    ...inheritedAllOf,
    {
      if: { properties: { causal_assessment_status: { const: "RANKED" } }, required: ["causal_assessment_status"] },
      then: { properties: { causal_assessment: { type: "object" } } },
      else: { properties: { causal_assessment: { type: "null" } } },
    },
  ];
  return schema;
}

export function renderPatientStoryEvidenceV030JsonSchema(): string {
  return `${JSON.stringify(buildPatientStoryEvidenceV030JsonSchema(), null, 2)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(fileURLToPath(new URL("../docs/patient-story-evidence-extension-v0.3.0.json", import.meta.url)));
  await writeFile(output, renderPatientStoryEvidenceV030JsonSchema(), "utf8");
  process.stdout.write(`${output}\n`);
}
