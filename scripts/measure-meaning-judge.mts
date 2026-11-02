/**
 * Development measurement of the meaning judge (owner answer 221, 2 November 2026) on a regression run's Codex event
 * logs: for each turn, its last passing finalize_research call (or the calls --call names), read as the server reads it
 * and judged once by the configured judge. Each judged call is one Claude API call paid from the owner's monthly
 * credits, so the run stops before --budget (USD) is spent.
 *
 *   ASKRIGOR_MEANING_JUDGE=on ASKRIGOR_MEANING_JUDGE_KEY_FILE=<secret file> ASKRIGOR_MEANING_JUDGE_WORKSPACE_ID=<id> \
 *     npx tsx scripts/measure-meaning-judge.mts --logs <dir> --out <file.jsonl> [--runs a,b] [--call run:2]
 *     [--all] [--any-status] [--bundles <file.json>] [--budget 5] [--concurrency 3] [--dry]
 *
 * --all adds every run's last passing call to those --call names (with neither --runs nor --call, every run's is read).
 * --any-status lets --call name a call that did not pass, whose limits show a known misfire (the server judges only
 * passing checks). --bundles adds bundles from a JSON list of {run, bundle}, such as an Atlas finding as published.
 *
 * --out holds answer text and the judge's reasons, so it goes outside the repository; the key is never written.
 * Whether comments were read is taken from the call's community_findings, which the check requires whenever its
 * receipts show comments were read (receipts signed by the production server cannot be verified here). For the same
 * reason the comparison entries the note credits are approximated: those naming sources, or whose sentence is a
 * declared absence claim or a correction the research found (the server reads which ones the check accepted).
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { createMeaningJudge, meaningJudgeBundle, type MeaningJudgeBundle } from "../apps/research-mcp/src/meaning-judge.js";
import { parseFinalizeResearchInput, sameQuote } from "../apps/research-mcp/src/research-finalization-gate.js";

interface LoggedCall { run: string; call: number; args: Record<string, unknown>; result: Record<string, unknown> }

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Each finalize_research call a Codex event log completed, with its arguments and structured result, in order. */
export function loggedCalls(path: string): LoggedCall[] {
  const run = basename(path).replace(/\.jsonl$/u, "");
  const calls: LoggedCall[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    let event: { type?: string; item?: Record<string, unknown> };
    try { event = JSON.parse(line); } catch { continue; }
    const item = event.item;
    if (event.type !== "item.completed" || item?.type !== "mcp_tool_call" ||
      !String(item.tool ?? "").endsWith("finalize_research")) continue;
    const result = (item.result ?? {}) as Record<string, unknown>;
    calls.push({
      run, call: calls.length + 1,
      args: (item.arguments ?? {}) as Record<string, unknown>,
      result: (result.structured_content ?? result.structuredContent ?? {}) as Record<string, unknown>,
    });
  }
  return calls;
}

/** The bundle the server would send for this logged call, or undefined when the check did not pass or has nothing. */
export function bundleOf(logged: LoggedCall, anyStatus = false): MeaningJudgeBundle | undefined {
  const status = logged.result.status;
  if (!anyStatus && status !== "ready" && status !== "ready_with_limits") return undefined;
  const parsed = parseFinalizeResearchInput(logged.args);
  if (!parsed.success || parsed.data.answer_draft === undefined) return undefined;
  const input = parsed.data;
  const card = (logged.result.findings_card as { status?: string } | undefined)?.status === "checked"
    ? input.findings_card : undefined;
  const plain = (logged.result.plain_answer as { status?: string } | undefined)?.status;
  const resultOf = (quote: string | undefined) => quote === undefined ? undefined
    : (input.absence_claims ?? []).some(({ quote: claimed }) => sameQuote(quote, claimed)) ? "not_found" as const
      : (input.corrections ?? []).some(({ change, by_user }) => by_user === false && sameQuote(quote, change))
        ? "correction" as const : undefined;
  const comparison = (input.plain_answer_comparison ?? []).flatMap((entry, place) => {
    const result = resultOf(entry.answer_quote);
    return entry.outcome === "not_checked" || entry.answer_quote === undefined ||
      ((entry.sources ?? []).length === 0 && result === undefined) ? []
      : [{ ...entry, number: place + 1, ...(result === undefined ? {} : { researchResult: result }) }];
  });
  return meaningJudgeBundle({
    answer: input.answer_draft!,
    commentsRead: (input.community_findings?.videos_reviewed ?? []).length > 0,
    ...(card === undefined ? {} : { card }),
    ...(plain === "registered" ? { comparison } : {}),
    keySources: input.key_sources,
    limits: Array.isArray(logged.result.limits) ? logged.result.limits.map(String) : [],
  });
}

async function main(): Promise<void> {
  const logs = argument("--logs");
  const out = argument("--out");
  if (logs === undefined || out === undefined) throw new Error("--logs and --out are required");
  const runs = argument("--runs")?.split(",").filter((run) => run !== "");
  const named = (argument("--call") ?? "").split(",").filter((entry) => entry !== "").map((entry) => {
    const [run, call] = entry.split(":");
    return { run: run!, call: Number(call) };
  });
  const budget = Number(argument("--budget") ?? 5);
  const concurrency = Math.max(1, Math.min(4, Number(argument("--concurrency") ?? 3)));
  const dry = process.argv.includes("--dry");
  const anyStatus = process.argv.includes("--any-status");
  const all = process.argv.includes("--all");
  const extra = argument("--bundles");

  const selected: Array<{ logged: LoggedCall; bundle: MeaningJudgeBundle }> = [];
  for (const file of readdirSync(logs).filter((name) => name.endsWith(".jsonl")).sort()) {
    const calls = loggedCalls(join(logs, file));
    const run = calls[0]?.run ?? file.replace(/\.jsonl$/u, "");
    // The calls --call names, and each selected run's last passing call (every run's, with neither option).
    const namedHere = calls.filter(({ call }) => named.some((entry) => entry.run === run && entry.call === call));
    const lastPassing = (runs === undefined ? named.length === 0 || all : runs.includes(run))
      ? calls.filter(({ result }) => result.status === "ready" || result.status === "ready_with_limits").slice(-1) : [];
    for (const logged of [...new Set([...namedHere, ...lastPassing])]) {
      const bundle = bundleOf(logged, anyStatus && namedHere.includes(logged));
      if (bundle !== undefined) selected.push({ logged, bundle });
    }
  }
  if (extra !== undefined) {
    for (const { run, bundle } of JSON.parse(readFileSync(extra, "utf8")) as Array<{ run: string; bundle: MeaningJudgeBundle }>) {
      selected.push({ logged: { run, call: 0, args: {}, result: {} }, bundle });
    }
  }
  process.stdout.write(`${selected.length} call(s) selected; ${selected.reduce((sum, { bundle }) =>
    sum + JSON.stringify(bundle).length, 0)} characters of bundles\n`);
  if (dry) return;

  const judge = createMeaningJudge({ log: (failure) => process.stderr.write(`judge: ${failure}\n`) });
  if (!judge.enabled) throw new Error("The meaning judge is off: set ASKRIGOR_MEANING_JUDGE=on and its key file.");
  let spent = 0;
  let next = 0;
  const work = async () => {
    while (next < selected.length && spent < budget) {
      const { logged, bundle } = selected[next++]!;
      const call = await judge.judge(bundle);
      spent += call.costUsd;
      appendFileSync(out, `${JSON.stringify({ run: logged.run, call: logged.call, ...call, bundle })}\n`);
      process.stdout.write(`${logged.run}#${logged.call}: ${call.judgment.status}` +
        `${call.judgment.status === "skipped" ? ` (${call.judgment.reason})` : ""}, $${call.costUsd.toFixed(4)}, ` +
        `${(call.milliseconds / 1000).toFixed(1)} s; total $${spent.toFixed(4)}\n`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, work));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "measurement failed"}\n`);
    process.exitCode = 1;
  });
}
