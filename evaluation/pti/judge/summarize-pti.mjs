#!/usr/bin/env node
/**
 * Tables for a PTI comparison, from the judges' verdict.json files: per case
 * and arm, per arm, judge disagreements, and a paired comparison of two arms.
 * Each judge is reported separately; nothing is averaged across judges.
 *
 *   node evaluation/pti/judge/summarize-pti.mjs --root <runs root> --cases <case dir> \
 *     [--baseline <arm label>] [--candidate <arm label>] [--json]
 *
 * <runs root>/<case id>/<arm label>/judge-<judge>/verdict.json, as run-arm.sh
 * writes them. Metrics are recomputed from each verdict with the current code. A
 * case with no top action reached counts as one turn past its decision window
 * when times are compared. Node built-ins only.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { computeMetrics } from "./judge-pti.mjs";

const JUDGES = ["claude", "codex"];

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    cases: { type: "string" },
    baseline: { type: "string" },
    candidate: { type: "string" },
    json: { type: "boolean", default: false }
  },
  strict: true
});
if (!values.root || !values.cases) {
  process.stderr.write("Pass --root and --cases.\n");
  process.exit(2);
}

const cases = new Map();
for (const name of fs.readdirSync(values.cases).filter((file) => file.endsWith(".json")).sort()) {
  const caseFile = JSON.parse(fs.readFileSync(path.join(values.cases, name), "utf8"));
  cases.set(caseFile.id, caseFile);
}

const rows = [];
for (const [caseId, caseFile] of cases) {
  const caseDir = path.join(values.root, caseId);
  if (!fs.existsSync(caseDir)) continue;
  for (const arm of fs.readdirSync(caseDir).filter((name) => fs.statSync(path.join(caseDir, name)).isDirectory())) {
    for (const judge of JUDGES) {
      const file = path.join(caseDir, arm, `judge-${judge}`, "verdict.json");
      if (!fs.existsSync(file)) continue;
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      // Metrics are recomputed from the verdict, so a run judged before a metric change counts the same way.
      const metrics = record.valid ? computeMetrics(caseFile, record.verdict) : null;
      rows.push({ case_id: caseId, arm, judge, valid: record.valid, window: caseFile.decision_window.length,
        metrics: metrics === null ? null : { ...metrics, ...runTiming(path.join(caseDir, arm), caseFile, metrics) } });
    }
  }
}

/**
 * What the user waits for, from the runner's per-turn records: seconds to the first reply, seconds until the top
 * action is proposed (null when it never is), and tool calls before the solution turn.
 */
function runTiming(runDir, caseFile, metrics) {
  const file = path.join(runDir, "metrics.json");
  if (!fs.existsSync(file)) return { first_reply_seconds: null, seconds_to_top: null, window_tool_calls: null };
  const turns = new Map((JSON.parse(fs.readFileSync(file, "utf8")).turns ?? []).map((turn) => [turn.id, turn]));
  const window = caseFile.decision_window.map((id) => turns.get(id));
  if (window.some((turn) => turn === undefined)) return { first_reply_seconds: null, seconds_to_top: null, window_tool_calls: null };
  const toolCalls = (turn) => typeof turn.tool_calls === "number" ? turn.tool_calls
    : Object.entries(turn.tool_items ?? {}).filter(([type]) => type !== "error").reduce((total, [, count]) => total + count, 0);
  const reached = metrics.time_to_useful_test;
  return {
    first_reply_seconds: Math.round(window[0].seconds),
    seconds_to_top: reached === null ? null : Math.round(window.slice(0, reached).reduce((total, turn) => total + turn.seconds, 0)),
    window_tool_calls: window.reduce((total, turn) => total + toolCalls(turn), 0)
  };
}

const valid = rows.filter((row) => row.valid && row.metrics !== null);
const arms = [...new Set(valid.map(({ arm }) => arm))].sort();
const timeOf = (row) => row.metrics.time_to_useful_test ?? row.window + 1;
const median = (numbers) => {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const sum = (numbers) => numbers.reduce((total, value) => total + value, 0);
const scoreTotal = (scores) => sum(Object.values(scores));

const perArm = [];
for (const judge of JUDGES) {
  for (const arm of arms) {
    const own = valid.filter((row) => row.judge === judge && row.arm === arm);
    if (own.length === 0) continue;
    perArm.push({
      judge,
      arm,
      runs: own.length,
      captured: own.filter((row) => row.metrics.gold_action_capture).length,
      median_time: median(own.map(timeOf)),
      median_burden: median(own.map((row) => row.metrics.burden_before_top)),
      median_unlisted: median(own.map((row) => row.metrics.unlisted_before_top ?? 0)),
      repeats_failed: sum(own.map((row) => row.metrics.repeats_failed)),
      asks_known_info_turns: sum(own.map((row) => row.metrics.asks_known_info_turns)),
      unsafe_proposals: sum(own.map((row) => row.metrics.unsafe_proposals)),
      severe_failures: sum(own.map((row) => row.metrics.severe_failures)),
      overclaims: sum(own.map((row) => row.metrics.overclaims)),
      matched_endpoint_used: own.filter((row) => row.metrics.matched_endpoint === "used").length,
      mean_score_total: Number((sum(own.map((row) => scoreTotal(row.metrics.scores))) / own.length).toFixed(2)),
      median_first_reply_seconds: median(own.map((row) => row.metrics.first_reply_seconds).filter((value) => value !== null)),
      median_seconds_to_top: median(own.map((row) => row.metrics.seconds_to_top).filter((value) => value !== null)),
      median_window_tool_calls: median(own.map((row) => row.metrics.window_tool_calls).filter((value) => value !== null))
    });
  }
}

// Disagreements between judges on the primary fields of the same run.
const disagreements = [];
for (const [caseId] of cases) {
  for (const arm of arms) {
    const [first, second] = JUDGES.map((judge) =>
      valid.find((row) => row.case_id === caseId && row.arm === arm && row.judge === judge));
    if (!first || !second) continue;
    if (first.metrics.time_to_useful_test !== second.metrics.time_to_useful_test ||
      first.metrics.top_rank !== second.metrics.top_rank) {
      disagreements.push({ case_id: caseId, arm,
        claude: { time: first.metrics.time_to_useful_test, rank: first.metrics.top_rank },
        codex: { time: second.metrics.time_to_useful_test, rank: second.metrics.top_rank } });
    }
  }
}

// Paired comparison: the earlier time to the top action wins; equal times tie.
let paired = null;
if (values.baseline && values.candidate) {
  paired = JUDGES.map((judge) => {
    const result = { judge, candidate_earlier: [], baseline_earlier: [], same: [] };
    for (const [caseId] of cases) {
      const [base, cand] = [values.baseline, values.candidate].map((arm) =>
        valid.find((row) => row.case_id === caseId && row.arm === arm && row.judge === judge));
      if (!base || !cand) continue;
      const difference = timeOf(base) - timeOf(cand);
      (difference > 0 ? result.candidate_earlier : difference < 0 ? result.baseline_earlier : result.same).push(caseId);
    }
    // One-sided sign test on the untied pairs: P(at least this many candidate wins | p = 0.5).
    const wins = result.candidate_earlier.length;
    const untied = wins + result.baseline_earlier.length;
    let tail = 0;
    for (let k = wins; k <= untied; k += 1) tail += binomial(untied, k) / 2 ** untied;
    return { ...result, sign_test_p_one_sided: untied === 0 ? null : Number(tail.toFixed(4)) };
  });
}

function binomial(n, k) {
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
}

const invalid = rows.filter((row) => !row.valid).map(({ case_id, arm, judge }) => ({ case_id, arm, judge }));
const summary = { per_arm: perArm, disagreements, paired, invalid_verdicts: invalid,
  per_run: valid.map(({ case_id, arm, judge, metrics }) => ({ case_id, arm, judge, ...metrics })) };

if (values.json) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else {
  const lines = [];
  for (const judge of JUDGES) {
    const own = perArm.filter((row) => row.judge === judge);
    if (own.length === 0) continue;
    lines.push(`### Judge: ${judge}`, "",
      "| Arm | Runs | Top action reached | Median turn | Median burden | Median unlisted | Repeats | Known-info asks | Unsafe | Severe | Overclaims | Matched endpoint | Mean score (of 15) | First reply (s) | To top action (s) | Tool calls before solution |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const row of own) {
      lines.push(`| ${row.arm} | ${row.runs} | ${row.captured} | ${row.median_time} | ${row.median_burden} | ${row.median_unlisted} | ${row.repeats_failed} | ` +
        `${row.asks_known_info_turns} | ${row.unsafe_proposals} | ${row.severe_failures} | ${row.overclaims} | ` +
        `${row.matched_endpoint_used} | ${row.mean_score_total} | ${row.median_first_reply_seconds ?? ""} | ` +
        `${row.median_seconds_to_top ?? "never"} | ${row.median_window_tool_calls ?? ""} |`);
    }
    lines.push("", "| Case | " + arms.join(" | ") + " |", "| --- |" + arms.map(() => " --- |").join(""));
    for (const [caseId] of cases) {
      const cells = arms.map((arm) => {
        const row = valid.find((item) => item.case_id === caseId && item.arm === arm && item.judge === judge);
        if (!row) return "";
        const m = row.metrics;
        return m.time_to_useful_test === null ? `never (burden ${m.burden_before_top})`
          : `turn ${m.time_to_useful_test}, rank ${m.top_rank}, burden ${m.burden_before_top}`;
      });
      if (cells.some((cell) => cell !== "")) lines.push(`| ${caseId} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  if (paired) {
    lines.push(`### Paired: ${values.candidate} against ${values.baseline}`, "");
    for (const result of paired) {
      lines.push(`- ${result.judge}: candidate earlier in ${result.candidate_earlier.length}, baseline earlier in ` +
        `${result.baseline_earlier.length}, same in ${result.same.length}; one-sided sign test p = ${result.sign_test_p_one_sided}`);
    }
    lines.push("");
  }
  lines.push(`Judge disagreements on time or rank: ${disagreements.length}`);
  for (const item of disagreements) {
    lines.push(`- ${item.case_id} / ${item.arm}: claude turn ${item.claude.time} rank ${item.claude.rank}; ` +
      `codex turn ${item.codex.time} rank ${item.codex.rank}`);
  }
  if (invalid.length > 0) lines.push("", `Invalid verdicts: ${invalid.map((item) => `${item.case_id}/${item.arm}/${item.judge}`).join(", ")}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}
