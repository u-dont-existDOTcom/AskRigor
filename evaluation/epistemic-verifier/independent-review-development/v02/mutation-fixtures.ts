import { createHash } from "node:crypto";

import {
  EPISTEMIC_REPRESENTATION_DIMENSIONS,
  createEpistemicRepresentationReviewWorkPackage
} from "../../../../apps/research-mcp/src/epistemic-representation-review.js";
import {
  epistemicStateV1Schema,
  type EpistemicStateV1
} from "../../../../apps/research-mcp/src/epistemic-verifier.js";

export const V02_PROCEDURE_ID =
  "askrigor_independent_semantic_representation_review_procedure_v0_2" as const;

type Dimension = (typeof EPISTEMIC_REPRESENTATION_DIMENSIONS)[number];
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface MutationCandidateV02 {
  candidate_id: string;
  pair_id: string;
  dimension: Dimension;
  variant: "FAITHFUL" | "DEFECTIVE";
  source_sha256: string;
  state_sha256: string;
  changed_json_pointers: string[];
  work_package: ReturnType<typeof createEpistemicRepresentationReviewWorkPackage>;
}

export interface MutationPairV02 {
  pair_id: string;
  dimension: Dimension;
  source_packet: string;
  faithful_state: EpistemicStateV1;
  defective_state: EpistemicStateV1;
  changed_json_pointers: string[];
  source_quote: string;
  candidates: [MutationCandidateV02, MutationCandidateV02];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${sha256(value).slice(0, 12).toUpperCase()}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mutationBase(tag: string) {
  const target = `risk_v02_${tag}`;
  const positive = `rowan_v02_${tag}`;
  const control = `mica_v02_${tag}`;
  const feature = `quartz_v02_${tag}`;
  const sourceId = `mutation:v02:${tag}:source`;
  const source = [
    `The requested target is ${target}.`,
    `Rowan ${tag} is the positive case: the target outcome begins exactly 2 seconds after receiving 10 units of compound Sol by intravenous liquid infusion.`,
    `Mica ${tag} is the tolerated control: Mica receives the same 10 units of compound Sol by intravenous liquid infusion and does not show the target outcome.`,
    `Feature Quartz is high in Rowan ${tag} and low in Mica ${tag}.`,
    "Test the material hypothesis that Quartz's stored value equals high and thereby distinguishes the target outcome.",
    "The conclusion must depend on Rowan's source-grounded target observation and the tolerated-control observation."
  ].join(" ");
  const state = epistemicStateV1Schema.parse({
    state_version: "askrigor_epistemic_state_v1",
    target: {
      target_id: target,
      label: `Risk v0.2 ${tag}`,
      description: `Whether the target outcome occurs for ${tag}.`
    },
    cases: [
      {
        case_id: positive,
        label: `Rowan ${tag}`,
        comparison_role: "positive",
        provenance: { kind: "source_grounded", source_id: sourceId }
      },
      {
        case_id: control,
        label: `Mica ${tag}`,
        comparison_role: "tolerated_control",
        provenance: { kind: "source_grounded", source_id: sourceId }
      }
    ],
    observations: [
      {
        observation_id: `obs_positive_v02_${tag}`,
        target_id: target,
        case_id: positive,
        statement: `Rowan ${tag} shows the target outcome exactly 2 seconds after 10 units of compound Sol by intravenous liquid infusion.`,
        material: true,
        qualifiers: {
          onset_seconds: 2,
          dose_units: 10,
          compound: "Sol",
          route: "intravenous",
          form: "liquid"
        },
        high_information_qualifier_keys: [
          "dose_units",
          "compound",
          "route",
          "form",
          "onset_seconds"
        ],
        provenance: { kind: "source_grounded", source_id: sourceId }
      },
      {
        observation_id: `obs_control_v02_${tag}`,
        target_id: target,
        case_id: control,
        statement: `Mica ${tag} receives the same 10 units of compound Sol by intravenous liquid infusion and does not show the target outcome.`,
        material: true,
        qualifiers: {
          dose_units: 10,
          compound: "Sol",
          route: "intravenous",
          form: "liquid"
        },
        high_information_qualifier_keys: ["dose_units", "compound", "route", "form"],
        provenance: { kind: "source_grounded", source_id: sourceId }
      }
    ],
    features: [
      {
        case_id: positive,
        feature_id: feature,
        value: "high",
        provenance: { kind: "source_grounded", source_id: sourceId }
      },
      {
        case_id: control,
        feature_id: feature,
        value: "low",
        provenance: { kind: "source_grounded", source_id: sourceId }
      }
    ],
    comparisons: [{
      comparison_id: `cmp_v02_${tag}`,
      target_id: target,
      positive_case_ids: [positive],
      control_case_ids: [control]
    }],
    hypotheses: [{
      hypothesis_id: `hyp_v02_${tag}`,
      target_id: target,
      statement: `Quartz's stored value equals high and distinguishes the target outcome for ${tag}.`,
      material: true,
      discriminator: { feature_id: feature, operator: "equals", value: "high" },
      qualifier_predictions: []
    }],
    claims: [{
      claim_id: `conclusion_v02_${tag}`,
      target_id: target,
      kind: "conclusion",
      statement: "Quartz's stored value equals high and survives the represented comparison.",
      material: true,
      provenance: { kind: "inference", source_id: `mutation:v02:${tag}:derived` },
      dependencies: [
        { kind: "observation", id: `obs_positive_v02_${tag}` },
        { kind: "observation", id: `obs_control_v02_${tag}` }
      ]
    }]
  });
  return { source, state, target, positive, control, feature, tag };
}

function applyMutation(
  dimension: Dimension,
  base: ReturnType<typeof mutationBase>
): { state: EpistemicStateV1; pointers: string[]; sourceQuote: string } {
  const state = clone(base.state);
  let pointers: string[];
  let sourceQuote: string;
  switch (dimension) {
    case "exact_target":
      pointers = ["/target/target_id"];
      state.target.target_id = `pathway_${base.target}`;
      sourceQuote = `The requested target is ${base.target}.`;
      break;
    case "case_and_comparison_roles":
      pointers = [
        "/cases/0/comparison_role",
        "/cases/1/comparison_role",
        "/comparisons/0/positive_case_ids/0",
        "/comparisons/0/control_case_ids/0"
      ];
      state.cases[0]!.comparison_role = "tolerated_control";
      state.cases[1]!.comparison_role = "positive";
      state.comparisons[0]!.positive_case_ids = [base.control];
      state.comparisons[0]!.control_case_ids = [base.positive];
      sourceQuote = `Rowan ${base.tag} is the positive case`;
      break;
    case "negative_or_tolerated_comparator":
      pointers = ["/comparisons/0/control_case_ids/0"];
      state.comparisons[0]!.control_case_ids = [];
      sourceQuote = `Mica ${base.tag} is the tolerated control`;
      break;
    case "high_information_qualifier":
      pointers = ["/observations/0/high_information_qualifier_keys/4"];
      state.observations[0]!.high_information_qualifier_keys = [
        "dose_units",
        "compound",
        "route",
        "form"
      ];
      sourceQuote = "begins exactly 2 seconds";
      break;
    case "timing":
      pointers = ["/observations/0/qualifiers/onset_seconds"];
      state.observations[0]!.qualifiers.onset_seconds = 3600;
      sourceQuote = "begins exactly 2 seconds";
      break;
    case "amount_or_dose":
      pointers = ["/observations/1/qualifiers/dose_units"];
      state.observations[1]!.qualifiers.dose_units = 1;
      sourceQuote = "same 10 units";
      break;
    case "route_or_form":
      pointers = ["/observations/1/qualifiers/route", "/observations/1/qualifiers/form"];
      state.observations[1]!.qualifiers.route = "oral";
      state.observations[1]!.qualifiers.form = "capsule";
      sourceQuote = "same 10 units of compound Sol by intravenous liquid infusion";
      break;
    case "feature_value":
      pointers = ["/features/1/value"];
      state.features[1]!.value = "high";
      sourceQuote = `low in Mica ${base.tag}`;
      break;
    case "predicate_semantics":
      pointers = ["/hypotheses/0/discriminator/operator", "/hypotheses/0/discriminator/value"];
      state.hypotheses[0]!.discriminator = {
        feature_id: base.feature,
        operator: "present"
      };
      sourceQuote = "Quartz's stored value equals high";
      break;
    case "dependency_or_provenance":
      pointers = ["/claims/0/dependencies/1"];
      state.claims[0]!.dependencies = [
        { kind: "observation", id: `obs_positive_v02_${base.tag}` }
      ];
      sourceQuote = "must depend on Rowan's source-grounded target observation and the tolerated-control observation";
      break;
    case "other":
      pointers = ["/hypotheses/0/material"];
      state.hypotheses[0]!.material = false;
      sourceQuote = "material hypothesis";
      break;
  }
  return { state: epistemicStateV1Schema.parse(state), pointers, sourceQuote };
}

export function buildMutationPairsV02(): MutationPairV02[] {
  return EPISTEMIC_REPRESENTATION_DIMENSIONS.map((dimension, index) => {
    const tag = `m${String(index + 1).padStart(2, "0")}`;
    const base = mutationBase(tag);
    const defective = applyMutation(dimension, base);
    const pairId = stableId("PAIRV02", `${V02_PROCEDURE_ID}|${dimension}`);
    const candidates = ([
      ["FAITHFUL", base.state],
      ["DEFECTIVE", defective.state]
    ] as const).map(([variant, state]) => {
      const workPackage = createEpistemicRepresentationReviewWorkPackage({
        source_packet: base.source,
        candidate_state: state,
        producer: {
          session_id: `synthetic-producer-${pairId}`,
          model: "DETERMINISTIC_FIXTURE",
          mode: "DEVELOPMENT"
        }
      });
      return {
        candidate_id: stableId(
          "MUTV02",
          `${pairId}|${variant}|${workPackage.source_sha256}|${workPackage.state_sha256}`
        ),
        pair_id: pairId,
        dimension,
        variant,
        source_sha256: workPackage.source_sha256,
        state_sha256: workPackage.state_sha256,
        changed_json_pointers: variant === "DEFECTIVE" ? defective.pointers : [],
        work_package: workPackage
      };
    }) as [MutationCandidateV02, MutationCandidateV02];
    return {
      pair_id: pairId,
      dimension,
      source_packet: base.source,
      faithful_state: base.state,
      defective_state: defective.state,
      changed_json_pointers: defective.pointers,
      source_quote: defective.sourceQuote,
      candidates
    };
  });
}

/**
 * Append-only replacement for the v0.2 high-information-qualifier pair.
 *
 * The original pair is intentionally preserved because its blinded
 * adjudication established that deleting only the metadata key did not create
 * a source-to-state defect: the exact timing fact remained fully represented,
 * and the source never required its high-information role to be explicit.
 * This replacement makes that semantic role an exact source requirement while
 * keeping the timing value itself unchanged in both candidates.
 */
export function buildHighInformationReplacementPairV021(): MutationPairV02 {
  const original = buildMutationPairsV02().find(
    ({ dimension }) => dimension === "high_information_qualifier"
  );
  if (!original) throw new Error("Missing v0.2 high-information-qualifier pair");

  const sourcePacket = [
    original.source_packet,
    "The exact 2-second onset is a highest-information qualifier whose role must remain explicit in the representation."
  ].join(" ");
  const faithfulState = clone(original.faithful_state);
  const defectiveState = clone(original.faithful_state);
  defectiveState.observations[0]!.high_information_qualifier_keys = [
    "dose_units",
    "compound",
    "route",
    "form"
  ];
  const changedJsonPointers = ["/observations/0/high_information_qualifier_keys/4"];
  const pairId = stableId(
    "PAIRV021",
    `${V02_PROCEDURE_ID}|high_information_qualifier|explicit-source-role`
  );
  const candidates = ([
    ["FAITHFUL", faithfulState],
    ["DEFECTIVE", defectiveState]
  ] as const).map(([variant, state]) => {
    const workPackage = createEpistemicRepresentationReviewWorkPackage({
      source_packet: sourcePacket,
      candidate_state: state,
      producer: {
        session_id: `synthetic-producer-${pairId}`,
        model: "DETERMINISTIC_FIXTURE",
        mode: "DEVELOPMENT"
      }
    });
    return {
      candidate_id: stableId(
        "MUTV021",
        `${pairId}|${variant}|${workPackage.source_sha256}|${workPackage.state_sha256}`
      ),
      pair_id: pairId,
      dimension: "high_information_qualifier" as const,
      variant,
      source_sha256: workPackage.source_sha256,
      state_sha256: workPackage.state_sha256,
      changed_json_pointers: variant === "DEFECTIVE" ? changedJsonPointers : [],
      work_package: workPackage
    };
  }) as [MutationCandidateV02, MutationCandidateV02];

  return {
    pair_id: pairId,
    dimension: "high_information_qualifier",
    source_packet: sourcePacket,
    faithful_state: faithfulState,
    defective_state: defectiveState,
    changed_json_pointers: changedJsonPointers,
    source_quote: "The exact 2-second onset is a highest-information qualifier whose role must remain explicit in the representation.",
    candidates
  };
}

export function valueAt(value: unknown, pointer: string): Json | undefined {
  let current: unknown = value;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/gu, "/").replace(/~0/gu, "~");
    current = Array.isArray(current)
      ? current[Number(key)]
      : (current as Record<string, unknown>)[key];
  }
  return current as Json | undefined;
}
