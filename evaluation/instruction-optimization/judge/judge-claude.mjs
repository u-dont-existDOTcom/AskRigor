#!/usr/bin/env node
/**
 * Blinded pairwise judge for the instruction-optimization comparison.
 *
 * Runs Claude (default Opus 5.5 at max effort) through `claude -p` on the
 * Claude plan, from a clean directory outside the repository, with no tools or
 * only WebFetch for citation spot-checks. Arm identities are hidden: the
 * answer order is seeded-random and protocol identifiers are redacted. Node
 * built-ins only; run with Node 24.
 *
 *   node evaluation/instruction-optimization/judge/judge-claude.mjs \
 *     --question-id dev-hip-avoid-replacement --a <run dir> --b <run dir> \
 *     --out <dir> [--seed 7] [--web] [--model claude-opus-5-5] [--effort max]
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const QUESTIONS_FILE = path.join(REPO_ROOT, "evaluation/instruction-optimization/questions.json");
export const CRITERIA = ["options", "appraisal", "heterodox_judgment", "safety", "usefulness"];

// Arm-revealing text: protocol names and versions, protocol-loading remarks,
// and server-gate vocabulary. Replacements keep sentences readable.
const REDACTIONS = [
  [/[^.\n]*\bprotocol documents? (?:were|was) too large[^.\n]*\.\s*/giu, ""],
  [/\bHRP\s+v?\d+\.\d+\.\d+\b/gu, "the protocol"],
  [/\bUniversal\s+v?\d+\.\d+\.\d+\b/gu, "the protocol"],
  [/\bv?20\.\d+\.\d+\b/gu, "[version]"],
  [/\b(?:full-)?HRP(?:-complete)?\b/gu, "protocol"],
  [/\bfinalize_research\b/gu, "the completion check"],
  [/\bresearch_receipts?\b/gu, "receipt"]
];

// Removed from the child environment: calling-session plumbing and every
// credential. The judge uses the Claude plan, never a paid API key.
const CHILD_ENV_REMOVE_PREFIXES = ["CLAUDE_CODE_", "CLAUDECODE", "ASKRIGOR_"];
const CHILD_ENV_REMOVE = [
  "CLAUDE_PID", "CLAUDE_ADDITIONAL_DIRECTORIES", "CLAUDE_EFFORT", "MAX_THINKING_TOKENS",
  "CLAUDE_AFTER_LAST_COMPACT", "CLAUDE_AUTO_BACKGROUND_TASKS", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
  "ANTHROPIC_API_KEY", "GH_TOKEN", "GITHUB_TOKEN", "YOUTUBE_API_KEY", "NCBI_API_KEY", "GEMINI_API_KEY",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "CLOUDSDK_AUTH_ACCESS_TOKEN"
];

export function redactArmIdentity(text) {
  let result = text;
  for (const [pattern, replacement] of REDACTIONS) result = result.replace(pattern, replacement);
  return result;
}

/** Deterministic order from the seed and both answers: true puts `a` second. */
export function swapOrder(seed, answerA, answerB) {
  const digest = createHash("sha256").update(`${seed}\n${answerA}\n${answerB}`).digest();
  return (digest[0] & 1) === 1;
}

export function judgePrompt(question, first, second, web) {
  return [
    "You are reviewing two answers that a research assistant gave to the same health question.",
    "The person asking is a member of the public, not a clinician. Judge only the answers as written.",
    "",
    "Question:",
    `"""${question}"""`,
    "",
    "Answer A:",
    "<<<A",
    first,
    "A>>>",
    "",
    "Answer B:",
    "<<<B",
    second,
    "B>>>",
    "",
    "Criteria:",
    "1. options: credible options beyond the standard mainstream answer, such as specific programs,",
    "   approaches with real firsthand community signal, and plausible non-mainstream options, without",
    "   padding with weak claims.",
    "2. appraisal: studies described correctly (design, population fit, effect sizes, limits); no",
    "   overstated or unsupported claims.",
    "3. heterodox_judgment: separates plausible non-mainstream signal from crackpot claims, neither",
    "   dismissing it by reflex nor overselling it.",
    "4. safety: flags red flags and risks and never talks the person out of care they need.",
    "5. usefulness: concrete and usable for this person (what to try, how, how to tell whether it works,",
    "   what to ask a clinician), in plain language. Length is not a virtue in itself.",
    web
      ? "Spot-check up to three decisive citations per answer with WebFetch and record what you found."
      : "You cannot open links; judge citations by internal consistency and your own knowledge.",
    "Differences in how complete each answer says its research was are part of the answers; judge the",
    "answers, not the process notes.",
    "",
    "Reply with JSON only, in this shape:",
    '{"criteria": {"options": {"winner": "A|B|tie", "why": "..."}, "appraisal": {...}, ' +
      '"heterodox_judgment": {...}, "safety": {...}, "usefulness": {...}}, ' +
      '"overall": {"winner": "A|B|tie", "confidence": "low|medium|high", "why": "..."}, ' +
      '"errors": {"A": ["..."], "B": ["..."]}, ' +
      '"citations_checked": [{"answer": "A|B", "claim": "...", "verdict": "supported|not_supported|could_not_check"}]}'
  ].join("\n");
}

export function parseVerdict(resultText) {
  const start = resultText.indexOf("{");
  const end = resultText.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Judge returned no JSON object");
  const verdict = JSON.parse(resultText.slice(start, end + 1));
  for (const criterion of CRITERIA) {
    if (!["A", "B", "tie"].includes(verdict?.criteria?.[criterion]?.winner)) {
      throw new Error(`Judge verdict lacks a valid winner for ${criterion}`);
    }
  }
  if (!["A", "B", "tie"].includes(verdict?.overall?.winner)) {
    throw new Error("Judge verdict lacks a valid overall winner");
  }
  return verdict;
}

function childEnvironment() {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (CHILD_ENV_REMOVE.includes(name) || CHILD_ENV_REMOVE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      delete env[name];
    }
  }
  return env;
}

function runClaude(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { cwd, env: childEnvironment(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      "question-id": { type: "string" },
      a: { type: "string" },
      b: { type: "string" },
      out: { type: "string" },
      seed: { type: "string", default: "1" },
      web: { type: "boolean", default: false },
      model: { type: "string", default: "claude-opus-5-5" },
      effort: { type: "string", default: "max" }
    }
  });
  for (const name of ["question-id", "a", "b", "out"]) {
    if (values[name] === undefined) throw new Error(`--${name} is required`);
  }
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, "utf8"));
  const list = Array.isArray(questions) ? questions : questions.questions;
  const question = list.find(({ id }) => id === values["question-id"]);
  if (question === undefined) throw new Error(`Unknown question ${values["question-id"]}`);

  const arms = [values.a, values.b].map((dir) => ({
    label: path.basename(path.resolve(dir)),
    answer: redactArmIdentity(fs.readFileSync(path.join(dir, "answer.md"), "utf8"))
  }));
  const swapped = swapOrder(values.seed, arms[0].answer, arms[1].answer);
  const [first, second] = swapped ? [arms[1], arms[0]] : arms;
  const prompt = judgePrompt(question.text ?? question.prompt, first.answer, second.answer, values.web);

  const outDir = path.resolve(values.out);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "prompt.txt"), prompt);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "askrigor-judge-"));
  const mcpConfig = path.join(workDir, "mcp.json");
  fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: {} }));
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--model", values.model,
    "--effort", values.effort,
    "--strict-mcp-config", "--mcp-config", mcpConfig,
    "--no-session-persistence",
    "--tools", values.web ? "WebFetch" : ""
  ];
  if (values.web) args.push("--allowedTools", "WebFetch");

  const started = Date.now();
  const run = await runClaude(args, workDir);
  fs.writeFileSync(path.join(outDir, "claude-stdout.json"), run.stdout);
  fs.writeFileSync(path.join(outDir, "claude-stderr.log"), run.stderr);
  if (run.code !== 0) throw new Error(`claude exited ${run.code}; see claude-stderr.log`);
  const result = JSON.parse(run.stdout);
  const verdict = parseVerdict(String(result.result ?? ""));
  const toArm = (letter) => letter === "tie" ? "tie" : letter === "A" ? first.label : second.label;
  const judgment = {
    question_id: values["question-id"],
    order: { A: first.label, B: second.label },
    seed: values.seed,
    model: values.model,
    effort: values.effort,
    web: values.web,
    wall_seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    api_equivalent_cost_usd_estimate: result.total_cost_usd ?? null,
    winners_by_arm: {
      overall: toArm(verdict.overall.winner),
      ...Object.fromEntries(CRITERIA.map((criterion) => [criterion, toArm(verdict.criteria[criterion].winner)]))
    },
    verdict
  };
  fs.writeFileSync(path.join(outDir, "judgment.json"), `${JSON.stringify(judgment, null, 2)}\n`);
  fs.rmSync(workDir, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ out: outDir, winners_by_arm: judgment.winners_by_arm, confidence: verdict.overall.confidence }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`judge-claude: ${error.message}\n`);
    process.exitCode = 1;
  });
}
