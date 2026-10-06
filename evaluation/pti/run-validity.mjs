#!/usr/bin/env node
/**
 * Whether a finished PTI run can be judged. On 2026-10-04 the weekly Claude
 * limit was reached mid-queue: the CLI answered every turn with its limit
 * notice (is_error true, API status 429) and exited 1, yet the run folder had a
 * metrics.json, so the queue counted it as done and a judge scored the notice.
 * The checks below read only the runners' own exit and error fields, never the
 * reply text.
 *
 *   node evaluation/pti/run-validity.mjs <run dir>   # prints the reason and exits 1 when the run failed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Why the run in runDir cannot be judged, or null when it can. */
export function runFailure(runDir) {
  const file = path.join(runDir, "metrics.json");
  if (!fs.existsSync(file)) return "no metrics.json";
  let metrics;
  try {
    metrics = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return "metrics.json is not JSON";
  }
  return metricsFailure(metrics);
}

/** The same check on parsed metrics: run-codex.mjs records `complete`; run-claude.mjs records the CLI's exit and results. */
export function metricsFailure(metrics) {
  if (metrics === null || typeof metrics !== "object") return "metrics are not an object";
  if ("complete" in metrics) {
    return metrics.complete === true ? null : "the Codex run is incomplete";
  }
  const exit = metrics.exit;
  if (exit === null || typeof exit !== "object") return "no exit record";
  if (exit.timed_out === true) return "timed out";
  if (exit.interrupted === true) return "interrupted";
  if (exit.claude_exit_code !== 0) return `claude exited ${exit.claude_exit_code ?? `on signal ${exit.claude_signal}`}`;
  if (metrics.result_is_error === true) return `the final result is an error (${metrics.terminal_reason ?? "no reason given"})`;
  if (Array.isArray(metrics.turns_requested)) {
    const turns = Array.isArray(metrics.turns) ? metrics.turns : [];
    if (turns.length !== metrics.turns_requested.length) {
      return `${turns.length} of ${metrics.turns_requested.length} turns answered`;
    }
    const failed = turns.find((turn) => turn.result_subtype !== "success" || turn.is_error === true);
    if (failed !== undefined) {
      return `turn ${failed.id} failed (${failed.is_error === true ? `API status ${failed.api_error_status ?? "unknown"}` : failed.result_subtype})`;
    }
  }
  return null;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const runDir = process.argv[2];
  if (runDir === undefined) {
    process.stderr.write("Pass a run directory.\n");
    process.exitCode = 2;
  } else {
    const failure = runFailure(runDir);
    if (failure !== null) process.stdout.write(`${failure}\n`);
    process.exitCode = failure === null ? 0 : 1;
  }
}
