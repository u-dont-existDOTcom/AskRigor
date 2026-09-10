import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  EPISTEMIC_REPRESENTATION_DIMENSIONS,
  createEpistemicRepresentationReviewWorkPackage
} from "../apps/research-mcp/src/epistemic-representation-review.js";
import { epistemicStateV1Schema } from "../apps/research-mcp/src/epistemic-verifier.js";
import {
  createRawInvalidStateReviewEnvelope
} from "../evaluation/epistemic-verifier/independent-review-development/raw-invalid-state-review.js";

const RUN_ROOT = "evaluation/epistemic-verifier/independent-review-development/runs/20260910-full-3x46";
const SOURCE_RUN = "evaluation/epistemic-verifier/discovery-ab/runs/20260909-complete-3x8x2";
const CANONICAL_PROMPT = "evaluation/epistemic-verifier/independent-representation-review-prompt.txt";
const RAW_INVALID_PROMPT = "evaluation/epistemic-verifier/independent-review-development/raw-invalid-representation-review-prompt.txt";
const PACKETS = `${SOURCE_RUN}/dispatch-bundle/canonical/v01-blinded-development-packets.json`;

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const stableId = (prefix: string, value: string) => `${prefix}-${sha256(value).slice(0, 12).toUpperCase()}`;
const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
};
const writeText = async (path: string, value: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { encoding: "utf8", flag: "wx" });
};

type Dimension = (typeof EPISTEMIC_REPRESENTATION_DIMENSIONS)[number];
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function span(source: string, quote: string) {
  const start = source.indexOf(quote);
  if (start < 0) throw new Error(`Missing source quote: ${quote}`);
  return { start, end: start + quote.length, quote };
}

function mutationBase(tag: string) {
  const target = `risk_${tag}`;
  const positive = `rowan_${tag}`;
  const control = `mica_${tag}`;
  const feature = `quartz_${tag}`;
  const source = [
    `The requested target is ${target}.`,
    `Rowan ${tag} is the positive case: the target outcome begins within 2 seconds after 10 units of compound Sol by intravenous liquid infusion.`,
    `Mica ${tag} is the tolerated control: Mica receives the same 10-unit intravenous liquid exposure and does not show the target outcome.`,
    `Feature Quartz is high in Rowan ${tag} and low in Mica ${tag}.`,
    `Test the material hypothesis that Quartz value equals high distinguishes the target outcome.`,
    `The conclusion about ${target} must depend on Rowan's source-grounded target observation and the tolerated-control contrast.`
  ].join(" ");
  const sourceId = `mutation:${tag}:source`;
  const state = epistemicStateV1Schema.parse({
    state_version: "askrigor_epistemic_state_v1",
    target: { target_id: target, label: `Risk ${tag}`, description: `Whether the target outcome occurs for ${tag}.` },
    cases: [
      { case_id: positive, label: `Rowan ${tag}`, comparison_role: "positive", provenance: { kind: "source_grounded", source_id: sourceId } },
      { case_id: control, label: `Mica ${tag}`, comparison_role: "tolerated_control", provenance: { kind: "source_grounded", source_id: sourceId } }
    ],
    observations: [
      {
        observation_id: `obs_positive_${tag}`,
        target_id: target,
        case_id: positive,
        statement: `Rowan ${tag} shows the target outcome.`,
        material: true,
        qualifiers: { onset_seconds: 2, dose_units: 10, route: "intravenous", form: "liquid" },
        high_information_qualifier_keys: ["onset_seconds", "dose_units", "route", "form"],
        provenance: { kind: "source_grounded", source_id: sourceId }
      },
      {
        observation_id: `obs_control_${tag}`,
        target_id: target,
        case_id: control,
        statement: `Mica ${tag} tolerates the exposure and does not show the target outcome.`,
        material: true,
        qualifiers: { dose_units: 10, route: "intravenous", form: "liquid" },
        high_information_qualifier_keys: ["dose_units", "route", "form"],
        provenance: { kind: "source_grounded", source_id: sourceId }
      }
    ],
    features: [
      { case_id: positive, feature_id: feature, value: "high", provenance: { kind: "source_grounded", source_id: sourceId } },
      { case_id: control, feature_id: feature, value: "low", provenance: { kind: "source_grounded", source_id: sourceId } }
    ],
    comparisons: [{ comparison_id: `cmp_${tag}`, target_id: target, positive_case_ids: [positive], control_case_ids: [control] }],
    hypotheses: [{
      hypothesis_id: `hyp_${tag}`,
      target_id: target,
      statement: `Quartz value equals high distinguishes the target outcome for ${tag}.`,
      material: true,
      discriminator: { feature_id: feature, operator: "equals", value: "high", modifier: { kind: "dose", claim_id: `dose_modifier_${tag}` } },
      qualifier_predictions: [{ observation_id: `obs_positive_${tag}`, qualifier_key: "onset_seconds", operator: "lte", value: 2 }]
    }],
    claims: [
      {
        claim_id: `dose_modifier_${tag}`,
        target_id: target,
        kind: "modifier",
        statement: "The represented 10-unit dose is held constant across the comparison.",
        material: true,
        provenance: { kind: "source_grounded", source_id: sourceId },
        dependencies: []
      },
      {
        claim_id: `conclusion_${tag}`,
        target_id: target,
        kind: "conclusion",
        statement: "Quartz survives the represented comparison.",
        material: true,
        provenance: { kind: "inference", source_id: `mutation:${tag}:derived` },
        dependencies: [
          { kind: "observation", id: `obs_positive_${tag}` },
          { kind: "observation", id: `obs_control_${tag}` },
          { kind: "claim", id: `dose_modifier_${tag}` }
        ]
      }
    ]
  });
  return { source, state, target, positive, control, feature };
}

function applyMutation(dimension: Dimension, base: ReturnType<typeof mutationBase>) {
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
      pointers = ["/cases/0/comparison_role", "/cases/1/comparison_role", "/comparisons/0/positive_case_ids", "/comparisons/0/control_case_ids"];
      state.cases[0]!.comparison_role = "tolerated_control";
      state.cases[1]!.comparison_role = "positive";
      state.comparisons[0]!.positive_case_ids = [base.control];
      state.comparisons[0]!.control_case_ids = [base.positive];
      sourceQuote = `Rowan ${base.target.replace("risk_", "")} is the positive case`;
      break;
    case "negative_or_tolerated_comparator":
      pointers = ["/comparisons/0/control_case_ids"];
      state.comparisons[0]!.control_case_ids = [];
      sourceQuote = `Mica ${base.target.replace("risk_", "")} is the tolerated control`;
      break;
    case "high_information_qualifier":
      pointers = ["/observations/0/high_information_qualifier_keys"];
      state.observations[0]!.high_information_qualifier_keys = ["dose_units", "route", "form"];
      sourceQuote = "begins within 2 seconds";
      break;
    case "timing":
      pointers = ["/observations/0/qualifiers/onset_seconds"];
      state.observations[0]!.qualifiers.onset_seconds = 3600;
      sourceQuote = "begins within 2 seconds";
      break;
    case "amount_or_dose":
      pointers = ["/observations/1/qualifiers/dose_units"];
      state.observations[1]!.qualifiers.dose_units = 1;
      sourceQuote = "same 10-unit";
      break;
    case "route_or_form":
      pointers = ["/observations/1/qualifiers/route", "/observations/1/qualifiers/form"];
      state.observations[1]!.qualifiers.route = "oral";
      state.observations[1]!.qualifiers.form = "capsule";
      sourceQuote = "same 10-unit intravenous liquid exposure";
      break;
    case "feature_value":
      pointers = ["/features/1/value"];
      state.features[1]!.value = "high";
      sourceQuote = `low in Mica ${base.target.replace("risk_", "")}`;
      break;
    case "predicate_semantics":
      pointers = ["/hypotheses/0/discriminator/operator", "/hypotheses/0/discriminator/value"];
      state.hypotheses[0]!.discriminator = { feature_id: base.feature, operator: "present", modifier: state.hypotheses[0]!.discriminator.modifier };
      sourceQuote = "Quartz value equals high";
      break;
    case "dependency_or_provenance":
      pointers = ["/claims/1/dependencies"];
      state.claims[1]!.dependencies = [{ kind: "claim", id: `dose_modifier_${base.target.replace("risk_", "")}` }];
      sourceQuote = "must depend on Rowan's source-grounded target observation and the tolerated-control contrast";
      break;
    case "other":
      pointers = ["/hypotheses/0/material"];
      state.hypotheses[0]!.material = false;
      sourceQuote = "material hypothesis";
      break;
  }
  return { state: epistemicStateV1Schema.parse(state), pointers, sourceQuote };
}

function valueAt(value: unknown, pointer: string): Json | undefined {
  let current: unknown = value;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    current = Array.isArray(current)
      ? current[Number(key)]
      : (current as Record<string, unknown>)[key];
  }
  return current as Json | undefined;
}

async function main() {
  const prompt = await readFile(CANONICAL_PROMPT, "utf8");
  const rawInvalidPrompt = await readFile(RAW_INVALID_PROMPT, "utf8");
  const packetDoc = JSON.parse(await readFile(PACKETS, "utf8")) as { packets: Array<{ blind_id: string; source_packet: string }> };
  const sources = new Map(packetDoc.packets.map((item) => [item.blind_id, item.source_packet]));
  const candidates: Array<{ candidate_id: string; track: string; transport: string; work_package_path: string; input_path: string; source_sha256: string; state_sha256: string }> = [];
  const naturalMap: Array<{ candidate_id: string; prior_trial_id: string; replicate: number; blind_id: string }> = [];

  const naturalInputs: Array<{
    replicate: number;
    blindId: string;
    priorTrialId: string;
    statePath: string;
    provenancePath: string;
    rawStateBytes: string;
    state: unknown;
    schemaValid: boolean;
  }> = [];
  for (let replicate = 1; replicate <= 3; replicate += 1) {
    for (const blindId of [...sources.keys()].sort()) {
      const priorTrialId = `r${replicate}-${blindId}-b`;
      const statePath = `${SOURCE_RUN}/raw/arm-b/replicate-${replicate}/${blindId}/initial-state.json`;
      const provenancePath = `${SOURCE_RUN}/raw/arm-b/replicate-${replicate}/${blindId}/provenance.json`;
      const rawStateBytes = await readFile(statePath, "utf8");
      const state = JSON.parse(rawStateBytes);
      const schemaValid = epistemicStateV1Schema.safeParse(state).success;
      naturalInputs.push({ replicate, blindId, priorTrialId, statePath, provenancePath, rawStateBytes, state, schemaValid });
    }
  }
  const invalidNatural = naturalInputs.filter(({ schemaValid }) => !schemaValid);
  if (invalidNatural.length !== 1) {
    throw new Error(`Expected exactly one schema-invalid frozen natural state; found ${invalidNatural.length}`);
  }

  for (const natural of naturalInputs) {
      const { replicate, blindId, priorTrialId, statePath, provenancePath, rawStateBytes, state, schemaValid } = natural;
      const candidateId = stableId("NAT", priorTrialId);
      const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as any;
      const producerSessionId = `conversation-sha256:${provenance.conversation.identity_sha256}`;
      const work = schemaValid
        ? createEpistemicRepresentationReviewWorkPackage({
            source_packet: sources.get(blindId)!,
            candidate_state: state,
            producer: {
              session_id: producerSessionId,
              model: provenance.consumer.model,
              mode: provenance.consumer.mode
            }
          })
        : createRawInvalidStateReviewEnvelope({
            source_packet: sources.get(blindId)!,
            raw_candidate_state_bytes: rawStateBytes,
            producer_session_id: producerSessionId
          });
      const workPath = `${RUN_ROOT}/candidates/${candidateId}/work-package.json`;
      const inputPath = `${RUN_ROOT}/dispatch/reviewer-inputs/${candidateId}.txt`;
      await writeJson(workPath, work);
      await writeText(inputPath, `${schemaValid ? prompt : rawInvalidPrompt}\n\nWORK PACKAGE\n${JSON.stringify(work, null, 2)}\n`);
      if (!schemaValid) await writeText(`${RUN_ROOT}/candidates/${candidateId}/exact-raw-initial-state.json`, rawStateBytes);
      const stateSha = "state_sha256" in work ? work.state_sha256 : work.raw_state_sha256;
      candidates.push({ candidate_id: candidateId, track: "NATURAL", transport: schemaValid ? "CANONICAL_V0_1" : "RAW_INVALID_V0_1", work_package_path: workPath, input_path: inputPath, source_sha256: work.source_sha256, state_sha256: stateSha });
      naturalMap.push({ candidate_id: candidateId, prior_trial_id: priorTrialId, replicate, blind_id: blindId });
  }

  const mutationManifest: Array<Record<string, unknown>> = [];
  for (const [index, dimension] of EPISTEMIC_REPRESENTATION_DIMENSIONS.entries()) {
    const tag = `m${String(index + 1).padStart(2, "0")}`;
    const base = mutationBase(tag);
    const defective = applyMutation(dimension, base);
    const pairId = stableId("PAIR", dimension);
    for (const variant of ["faithful", "defective"] as const) {
      const candidateId = stableId("MUT", `${pairId}|${variant}`);
      const candidateState = variant === "faithful" ? base.state : defective.state;
      const work = createEpistemicRepresentationReviewWorkPackage({
        source_packet: base.source,
        candidate_state: candidateState,
        producer: { session_id: `synthetic-producer-${pairId}`, model: "DETERMINISTIC_FIXTURE", mode: "DEVELOPMENT" }
      });
      const workPath = `${RUN_ROOT}/candidates/${candidateId}/work-package.json`;
      const inputPath = `${RUN_ROOT}/dispatch/reviewer-inputs/${candidateId}.txt`;
      await writeJson(workPath, work);
      await writeText(inputPath, `${prompt}\n\nWORK PACKAGE\n${JSON.stringify(work, null, 2)}\n`);
      candidates.push({ candidate_id: candidateId, track: "MUTATION", transport: "CANONICAL_V0_1", work_package_path: workPath, input_path: inputPath, source_sha256: work.source_sha256, state_sha256: work.state_sha256 });
      const changed = variant === "defective"
        ? defective.pointers.map((pointer) => ({ pointer, before: valueAt(base.state, pointer), after: valueAt(defective.state, pointer) }))
        : [];
      mutationManifest.push({
        opaque_candidate_id: candidateId,
        source_sha256: work.source_sha256,
        state_sha256: work.state_sha256,
        pair_id: pairId,
        dimension,
        faithful_or_defective_gold: variant.toUpperCase(),
        changed_json_pointers: defective.pointers,
        source_spans: [span(base.source, defective.sourceQuote)],
        construction_provenance: "scripts/prepare-independent-semantic-review-development.mts",
        mutation_diff: changed
      });
      if (variant === "defective") {
        const goldPrompt = [
          "You are an independent blinded DEVELOPMENT adjudicator. Review only the exact source packet, candidate EpistemicStateV1, and mechanical source-faithful-mate diff below. Decide whether the represented discrepancy could change a hard epistemic gate result or the conclusion the system is permitted to state. Do not use an expected label, another adjudication, verifier implementation, or outside evidence. Return exactly one compact JSON object with keys candidate_id, affects_hard_invariant (true, false, or null for uncertain), affected_gate_or_claim_paths (array of strings), rationale. Do not repair the state or answer the source question.",
          "",
          JSON.stringify({
            candidate_id: candidateId,
            source_packet: base.source,
            candidate_state: candidateState,
            mutation_diff: changed
          }, null, 2),
          ""
        ].join("\n");
        await writeText(`${RUN_ROOT}/gold/mutations/hard-relevance-inputs/${candidateId}.txt`, goldPrompt);
      }
    }
  }

  const order: Array<{ sequence: number; replicate: number; candidate_id: string; input_path: string; track: string }> = [];
  let sequence = 0;
  for (let replicate = 1; replicate <= 3; replicate += 1) {
    const sorted = [...candidates].sort((a, b) => sha256(`semantic-review-v1|${replicate}|${a.candidate_id}`).localeCompare(sha256(`semantic-review-v1|${replicate}|${b.candidate_id}`)));
    for (const candidate of sorted) order.push({ sequence: ++sequence, replicate, candidate_id: candidate.candidate_id, input_path: candidate.input_path, track: candidate.track });
  }

  await writeJson(`${RUN_ROOT}/gold/natural/candidate-map.json`, naturalMap);
  await writeJson(`${RUN_ROOT}/gold/mutations/mutation-construction-manifest.json`, mutationManifest);
  await writeJson(`${RUN_ROOT}/candidate-manifest.json`, { schema_version: 1, candidate_count: candidates.length, candidates });
  await writeJson(`${RUN_ROOT}/dispatch-order.json`, { schema_version: 1, seed: "semantic-review-v1", review_count: order.length, order });
  await writeJson(`${RUN_ROOT}/preflight-freeze.json`, {
    schema_version: 1,
    phase: "DEVELOPMENT_DISCOVERY",
    base_commit: "2b2426a8794c8d65aa9adedbc3f40d66c68ceb44",
    reviewer_prompt_sha256: sha256(prompt),
    raw_invalid_reviewer_prompt_sha256: sha256(rawInvalidPrompt),
    raw_invalid_adapter_source_sha256: sha256(await readFile("evaluation/epistemic-verifier/independent-review-development/raw-invalid-state-review.ts", "utf8")),
    natural_candidates: naturalMap.length,
    schema_invalid_natural_candidates: invalidNatural.length,
    mutation_candidates: mutationManifest.length,
    total_candidates: candidates.length,
    review_trials: order.length,
    scorer_or_prior_label_accessed_by_preparation: false
  });
  console.log(JSON.stringify({ natural: naturalMap.length, mutations: mutationManifest.length, candidates: candidates.length, reviews: order.length }, null, 2));
}

await main();
