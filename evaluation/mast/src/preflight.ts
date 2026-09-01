import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SCT_RATINGS = [-2, -1, 0, 1, 2] as const;

export interface SctScoredResponse {
  response: number;
  normalizedScore: number;
  inExpertSet: boolean;
}

export interface MastSctExamplePreflight {
  itemCount: number;
  sctScore: number;
  percentageInExpertSet: number;
  expectedHeadline: string;
  actualHeadline: string;
  sourceHashes: Record<string, string>;
  status: "pass" | "fail";
}

const PINNED_HASHES: Record<string, string> = {
  "benchmarks/sct/examples/gpt-5.5.jsonl": "36acafd5a6424ab018ec581cbff13686e0321ea4519f07e8b4e624a8f82531f5",
  "benchmarks/sct/examples/gpt-5.5_details.jsonl": "d6a6505f28bbb25d83ca6c81eb144fe5b4f35f24c5a597b81f7f48804f1423e2",
  "benchmarks/sct/examples/gpt-5.5.csv": "2f151bdcbca8cec122d9106ef5022d8b1825f234bb818733207e3bd7aeb31954",
  "benchmarks/sct/score.py": "d767cc898931a1904e5d4b80934888bc06839d1939f5ad968fece46b795a7a04",
  "benchmarks/sct/dataset/rubrics.jsonl": "6b64c27ca34aef765e6edde7dd4d82960325ec3bcd0e4934f1a8a0f06f6b5c13",
  "benchmarks/sct/dataset/items.jsonl": "be79bd4d1cdfd95227398d5d7011b4a644f5b0754345dd89608488d177369bd8",
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseSctRating(response: string): number | null {
  if (typeof response !== "string" || response.length === 0) return null;
  const jsonMatches = [...response.matchAll(/"[Rr]ating"\s*:\s*"?([+-]?[012])"?/gu)];
  if (jsonMatches.length > 0) return Number(jsonMatches.at(-1)![1]);
  const index = response.lastIndexOf("Rating:");
  if (index < 0) return null;
  const match = response.slice(index + "Rating:".length, index + "Rating:".length + 10)
    .match(/[+-]?[012]/u);
  return match ? Number(match[0]) : null;
}

export function scoreSctResponse(
  expertDistribution: number[],
  response: number,
): SctScoredResponse {
  if (
    expertDistribution.length !== SCT_RATINGS.length
    || !SCT_RATINGS.includes(response as (typeof SCT_RATINGS)[number])
    || expertDistribution.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error("Invalid SCT distribution or response");
  }
  const rowMaximum = Math.max(...expertDistribution);
  const selected = expertDistribution[response + 2];
  return {
    response,
    normalizedScore: rowMaximum === 0 ? 0 : selected / rowMaximum,
    inExpertSet: selected > 0,
  };
}

export function scoreSctEpoch(
  rows: Array<{ expertDistribution: number[]; response: number }>,
): { sctScore: number; percentageInExpertSet: number } {
  if (rows.length === 0) throw new Error("SCT epoch cannot be empty");
  const scored = rows.map(({ expertDistribution, response }) =>
    scoreSctResponse(expertDistribution, response));
  return {
    sctScore: scored.reduce((sum, item) => sum + item.normalizedScore, 0) / scored.length,
    percentageInExpertSet: scored.filter(({ inExpertSet }) => inExpertSet).length / scored.length,
  };
}

export async function verifyPinnedMastSctExample(
  mastRepositoryRoot: string,
): Promise<MastSctExamplePreflight> {
  const sourceHashes: Record<string, string> = {};
  const contents = new Map<string, string>();
  for (const [relativePath, expectedHash] of Object.entries(PINNED_HASHES)) {
    const bytes = await readFile(join(mastRepositoryRoot, relativePath));
    const actualHash = sha256(bytes);
    sourceHashes[relativePath] = actualHash;
    if (actualHash !== expectedHash) {
      throw new Error(`MAST_SOURCE_HASH_MISMATCH path=${relativePath}`);
    }
    contents.set(relativePath, bytes.toString("utf8"));
  }

  const rubrics = new Map<string, number[]>();
  for (const line of contents.get("benchmarks/sct/dataset/rubrics.jsonl")!.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed = JSON.parse(line) as { id: string | number; expert_distribution: number[] };
    rubrics.set(String(parsed.id), parsed.expert_distribution);
  }
  const rows: Array<{ expertDistribution: number[]; response: number }> = [];
  for (const line of contents.get("benchmarks/sct/examples/gpt-5.5.jsonl")!.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed = JSON.parse(line) as { id: string | number; response: string };
    const response = parseSctRating(parsed.response);
    const expertDistribution = rubrics.get(String(parsed.id));
    if (response === null || !expertDistribution) {
      throw new Error(`MAST_SCT_EXAMPLE_UNSCORABLE id=${String(parsed.id)}`);
    }
    rows.push({ expertDistribution, response });
  }
  const scored = scoreSctEpoch(rows);
  const csvHeadline = contents.get("benchmarks/sct/examples/gpt-5.5.csv")!
    .split("\n")
    .find((line) => line.startsWith("Overall,sct_score,")) ?? "";
  const expectedHeadline = "Overall,sct_score,174,0.7453,0.0531,0.6912,0.7974";
  const actualHeadline = [
    "Overall",
    "sct_score",
    String(rows.length),
    scored.sctScore.toFixed(4),
  ].join(",");
  const status = rows.length === 174
    && scored.sctScore.toFixed(4) === "0.7453"
    && scored.percentageInExpertSet.toFixed(4) === "0.9310"
    && csvHeadline === expectedHeadline
      ? "pass" as const
      : "fail" as const;
  return {
    itemCount: rows.length,
    ...scored,
    expectedHeadline,
    actualHeadline,
    sourceHashes,
    status,
  };
}
