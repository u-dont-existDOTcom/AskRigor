import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const runRoot = resolve("evaluation/epistemic-verifier/independent-review-development/runs/20260910-full-3x46");
const priorRoot = resolve("evaluation/epistemic-verifier/discovery-ab/runs/20260909-complete-3x8x2");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

const candidateMap = await readJson(resolve(runRoot, "gold/natural/candidate-map.json"));
const priorLedgerPath = resolve(priorRoot, "scoring/trial-scoring-ledger.json");
const priorLedgerBytes = await readFile(priorLedgerPath);
const priorTrials = new Map(
  JSON.parse(priorLedgerBytes.toString("utf8")).trials
    .filter((trial: any) => trial.arm === "B")
    .map((trial: any) => [trial.trial_id, trial])
);

const population: any[] = [];
for (const item of candidateMap) {
  const directory = resolve(runRoot, "gold/natural/adjudications", item.candidate_id, "second");
  const raw = await readFile(resolve(directory, "raw-output.txt"));
  const normalized = await readFile(resolve(directory, "normalized-output.json"));
  const provenance = await readFile(resolve(directory, "provenance.json"));
  const receipt = await readJson(resolve(directory, "ingest-receipt.json"));
  const prior: any = priorTrials.get(item.prior_trial_id);
  if (!prior || !["YES", "NO"].includes(prior.semantic_error)) {
    throw new Error(`Missing binary prior semantic label for ${item.prior_trial_id}`);
  }
  const statuses = receipt.findings.map((finding: any) => finding.status);
  const second = statuses.some((status: string) => ["missing", "distorted"].includes(status))
    ? "DEFECTIVE"
    : statuses.includes("uncertain")
      ? "UNCERTAIN"
      : "FAITHFUL";
  population.push({
    candidate_id: item.candidate_id,
    prior_trial_id: item.prior_trial_id,
    prior_label: prior.semantic_error === "YES" ? "DEFECTIVE" : "FAITHFUL",
    prior_dimensions: prior.semantic_fields_lost,
    second_label: second,
    second_critical_representation: receipt.critical_representation,
    second_problem_dimensions: receipt.findings
      .filter((finding: any) => !["faithful", "not_applicable"].includes(finding.status))
      .map((finding: any) => ({
        dimension: finding.dimension,
        status: finding.status,
        affects_hard_invariant: finding.affects_hard_invariant
      })),
    artifacts: {
      raw_sha256: sha256(raw),
      normalized_sha256: sha256(normalized),
      provenance_sha256: sha256(provenance)
    }
  });
}

const disagreements = population.filter((item) => item.prior_label !== item.second_label);
const receipt = {
  schema_version: 1,
  phase: "DEVELOPMENT_DISCOVERY_POST_SECOND_ADJUDICATION",
  opened_at: new Date().toISOString(),
  prior_label_source: "evaluation/epistemic-verifier/discovery-ab/runs/20260909-complete-3x8x2/scoring/trial-scoring-ledger.json",
  prior_label_source_sha256: sha256(priorLedgerBytes),
  second_adjudication_population_count: population.length,
  second_adjudication_population_sha256: sha256(JSON.stringify(population)),
  reviewer_population_frozen_before_prior_label_access: true,
  disagreement_count: disagreements.length
};

await writeFile(resolve(runRoot, "gold/natural/prior-label-unblinding-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(runRoot, "gold/natural/second-adjudication-comparison.json"), `${JSON.stringify(population, null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(runRoot, "gold/natural/third-adjudication-manifest.json"), `${JSON.stringify({
  schema_version: 1,
  count: disagreements.length,
  rule: "THIRD_ADJUDICATION_WHEN_PRIOR_SEMANTIC_LABEL_DIFFERS_FROM_SECOND_FAITHFUL_DEFECTIVE_UNCERTAIN_LABEL",
  candidates: disagreements.map((item) => ({
    candidate_id: item.candidate_id,
    prior_trial_id: item.prior_trial_id,
    prior_label: item.prior_label,
    second_label: item.second_label
  }))
}, null, 2)}\n`, { flag: "wx" });

console.log(JSON.stringify({ frozen: population.length, disagreements: disagreements.map((item) => item.candidate_id) }));
