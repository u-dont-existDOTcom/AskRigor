import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const runRoot = resolve(
  "evaluation/epistemic-verifier/independent-review-development/runs/20260910-full-3x46"
);
const constructionPath = resolve(
  runRoot,
  "gold/mutations/mutation-construction-manifest.json"
);
const adjudicationRoot = resolve(
  runRoot,
  "gold/mutations/hard-relevance-adjudications"
);
const outputPath = resolve(
  runRoot,
  "gold/mutations/mutation-state-gold.json"
);
const checkpointPath = resolve(
  runRoot,
  "checkpoints/track2-mutation-gold-complete.json"
);

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const readJsonText = async (path: string) => {
  const text = await readFile(path, "utf8");
  return { text, value: JSON.parse(text) };
};
const repositoryPath = (path: string) => path.replace(`${process.cwd()}/`, "");

const construction = JSON.parse(await readFile(constructionPath, "utf8"));
const defective = construction.filter(
  (item: any) => item.faithful_or_defective_gold === "DEFECTIVE"
);

const hardRelevanceByCandidate = new Map<string, any>();
for (const item of defective) {
  const rounds: string[] = ["first", "second"];
  const first = await readJsonText(
    resolve(adjudicationRoot, item.opaque_candidate_id, "first/normalized-output.json")
  );
  const second = await readJsonText(
    resolve(adjudicationRoot, item.opaque_candidate_id, "second/normalized-output.json")
  );
  if (first.value.candidate_id !== item.opaque_candidate_id || second.value.candidate_id !== item.opaque_candidate_id) {
    throw new Error(`candidate identity mismatch for ${item.opaque_candidate_id}`);
  }
  if (first.value.affects_hard_invariant !== second.value.affects_hard_invariant) {
    rounds.push("third");
  }
  const opinions = [];
  for (const round of rounds) {
    const normalizedPath = resolve(
      adjudicationRoot,
      item.opaque_candidate_id,
      round,
      "normalized-output.json"
    );
    const provenancePath = resolve(
      adjudicationRoot,
      item.opaque_candidate_id,
      round,
      "provenance.json"
    );
    const normalized = await readJsonText(normalizedPath);
    const provenance = await readJsonText(provenancePath);
    opinions.push({
      round,
      affects_hard_invariant: normalized.value.affects_hard_invariant,
      affected_gate_or_claim_paths: normalized.value.affected_gate_or_claim_paths,
      rationale: normalized.value.rationale,
      normalized_output_path: repositoryPath(normalizedPath),
      normalized_output_sha256: sha256(normalized.text),
      provenance_path: repositoryPath(provenancePath),
      provenance_sha256: sha256(provenance.text)
    });
  }
  const votes = opinions.map((opinion) => opinion.affects_hard_invariant);
  const trueVotes = votes.filter((vote) => vote === true).length;
  const falseVotes = votes.filter((vote) => vote === false).length;
  const resolved = trueVotes >= 2 ? true : falseVotes >= 2 ? false : null;
  if (resolved === null) {
    throw new Error(`hard relevance did not resolve for ${item.opaque_candidate_id}`);
  }
  hardRelevanceByCandidate.set(item.opaque_candidate_id, {
    affects_hard_invariant: resolved,
    adjudication_rounds: rounds,
    opinions,
    resolution: rounds.length === 3
      ? "THREE_OPINION_MAJORITY"
      : "TWO_INDEPENDENT_OPINIONS_AGREED"
  });
}

const candidates = construction.map((item: any) => {
  const isDefective = item.faithful_or_defective_gold === "DEFECTIVE";
  const hard = isDefective ? hardRelevanceByCandidate.get(item.opaque_candidate_id) : undefined;
  return {
    candidate_id: item.opaque_candidate_id,
    pair_id: item.pair_id,
    dimension: item.dimension,
    semantic_representation_gold: item.faithful_or_defective_gold,
    hard_relevance_gold: !isDefective
      ? "NO_DEFECT"
      : hard.affects_hard_invariant
        ? "HARD_DEFECT"
        : "NONHARD_DEFECT",
    changed_json_pointers: item.changed_json_pointers,
    source_spans: item.source_spans,
    construction_provenance: item.construction_provenance,
    independent_hard_relevance_adjudication: hard ?? null
  };
});

const output = {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_CONTROLLED_MUTATION_GOLD",
  candidate_count: candidates.length,
  counts: {
    faithful: candidates.filter((item: any) => item.semantic_representation_gold === "FAITHFUL").length,
    hard_defect: candidates.filter((item: any) => item.hard_relevance_gold === "HARD_DEFECT").length,
    nonhard_defect: candidates.filter((item: any) => item.hard_relevance_gold === "NONHARD_DEFECT").length,
    third_adjudication_required: candidates.filter(
      (item: any) => item.independent_hard_relevance_adjudication?.adjudication_rounds.length === 3
    ).length
  },
  candidates
};
const outputText = `${JSON.stringify(output, null, 2)}\n`;
await writeFile(outputPath, outputText, { encoding: "utf8", flag: "wx" });

const checkpoint = {
  schema_version: 1,
  phase: "TRACK2_MUTATION_GOLD_COMPLETE",
  status: "COMPLETE",
  hard_relevance_opinions_frozen: defective.length * 2 + output.counts.third_adjudication_required,
  defective_candidates: defective.length,
  third_adjudications: output.counts.third_adjudication_required,
  mutation_candidates_total: candidates.length,
  gold_path: repositoryPath(outputPath),
  gold_sha256: sha256(outputText),
  main_reviewer_outputs_frozen: 0,
  scorer_key_for_main_reviewer_population_opened: false
};
await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx"
});
console.log(JSON.stringify({ counts: output.counts, checkpoint }));
