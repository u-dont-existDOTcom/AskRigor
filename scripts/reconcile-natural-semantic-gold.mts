import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const runRoot = resolve("evaluation/epistemic-verifier/independent-review-development/runs/20260910-full-3x46");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const comparison = await readJson(resolve(runRoot, "gold/natural/second-adjudication-comparison.json"));
const thirdManifest = await readJson(resolve(runRoot, "gold/natural/third-adjudication-manifest.json"));
const thirdIds = new Set(thirdManifest.candidates.map((item: any) => item.candidate_id));

const gold: any[] = [];
for (const item of comparison) {
  const selectedRound = thirdIds.has(item.candidate_id) ? "third" : "second";
  const receiptPath = resolve(runRoot, "gold/natural/adjudications", item.candidate_id, selectedRound, "ingest-receipt.json");
  const receiptText = await readFile(receiptPath, "utf8");
  const receipt = JSON.parse(receiptText);
  const problems = receipt.findings.filter((finding: any) => !["faithful", "not_applicable"].includes(finding.status));
  const semanticRepresentation = problems.some((finding: any) => ["missing", "distorted"].includes(finding.status))
    ? "DEFECTIVE"
    : problems.some((finding: any) => finding.status === "uncertain")
      ? "UNCERTAIN"
      : "FAITHFUL";
  const hardRelevance = problems.some((finding: any) => finding.affects_hard_invariant && ["missing", "distorted"].includes(finding.status))
    ? "HARD_DEFECT"
    : problems.some((finding: any) => finding.affects_hard_invariant && finding.status === "uncertain")
      ? "HARD_UNCERTAIN"
      : "NO_HARD_DEFECT";
  gold.push({
    candidate_id: item.candidate_id,
    prior_trial_id: item.prior_trial_id,
    semantic_representation_gold: semanticRepresentation,
    hard_relevance_gold: hardRelevance,
    gold_findings: receipt.findings,
    reconciliation: {
      prior_label: item.prior_label,
      second_label: item.second_label,
      third_required: thirdIds.has(item.candidate_id),
      selected_detailed_adjudication: selectedRound,
      resolution: thirdIds.has(item.candidate_id)
        ? "SECOND_AND_THIRD_INDEPENDENT_ADJUDICATORS_AGREED; PRIOR_LABEL_OVERRULED"
        : "PRIOR_LABEL_AND_SECOND_ADJUDICATION_AGREED"
    },
    selected_ingest_receipt_path: receiptPath.replace(`${process.cwd()}/`, ""),
    selected_ingest_receipt_sha256: sha256(receiptText)
  });
}

const output = {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_RECONCILED_GOLD",
  candidate_count: gold.length,
  counts: {
    hard_defect: gold.filter((item) => item.hard_relevance_gold === "HARD_DEFECT").length,
    hard_uncertain: gold.filter((item) => item.hard_relevance_gold === "HARD_UNCERTAIN").length,
    no_hard_defect: gold.filter((item) => item.hard_relevance_gold === "NO_HARD_DEFECT").length,
    fully_faithful: gold.filter((item) => item.semantic_representation_gold === "FAITHFUL").length,
    nonhard_or_other_defective: gold.filter((item) => item.semantic_representation_gold === "DEFECTIVE" && item.hard_relevance_gold === "NO_HARD_DEFECT").length,
    uncertain: gold.filter((item) => item.semantic_representation_gold === "UNCERTAIN").length
  },
  candidates: gold
};

await writeFile(resolve(runRoot, "gold/natural/natural-state-adjudication-gold.json"), `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify(output.counts));
