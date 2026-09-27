/**
 * Discovery bench: run the automated Gemini scout once, end to end, and report
 * what it surfaced. Usage (keys come from the environment, never arguments):
 *
 *   GEMINI_API_KEY=... YOUTUBE_API_KEY=... npx tsx \
 *     evaluation/instruction-optimization/discovery-bench/scout-probe.mts \
 *     --target "Adults trying to avoid a hip replacement: what they tried and what happened" \
 *     --terms gelatin,collagen,hydration,water,diet --out /tmp/probe.json \
 *     [--skill path/to/scout-SKILL.md]   # default: the production scout skill
 *
 * Costs: one free-tier Gemini grounded interaction and about one YouTube Data
 * API unit per candidate for identity validation. Output keeps public video
 * IDs, titles, channels, queries and Gemini's provisional annotations only.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { executeResumableAutomatedGeminiScout } from "../../../apps/research-mcp/src/actions/gemini-scout-route.js";
import { advanceGeminiYoutubeScoutBackground } from "../../../packages/sources/src/gemini-youtube-scout.js";

const { values } = parseArgs({
  options: {
    target: { type: "string" },
    diagnosis: { type: "string", default: "diagnosis_not_specified" },
    terms: { type: "string", default: "" },
    out: { type: "string" },
    skill: { type: "string" },
    "max-seconds": { type: "string", default: "300" }
  }
});
if (values.target === undefined) throw new Error("--target is required");
process.env.ASKRIGOR_GEMINI_API_KEY ??= process.env.GEMINI_API_KEY;
process.env.ASKRIGOR_AI_BUDGET_LEDGER ??= path.join(process.cwd(), ".discovery-bench-ai-budget.json");
process.env.ASKRIGOR_AI_MONTHLY_BUDGET_USD ??= "50";

const input = {
  research_target: values.target,
  diagnosis_status: values.diagnosis as "diagnosis_not_specified" | "user_supplied_diagnosis"
};
const started = Date.now();
const skillPath = values.skill;
// The executor reports any thrown error as an unclassified failure; log the cause.
const backgroundScout: typeof advanceGeminiYoutubeScoutBackground = async (...args) => {
  try {
    return await advanceGeminiYoutubeScoutBackground(...args);
  } catch (error) {
    console.error(`scout advance threw: ${(error as Error).message.slice(0, 600)}`);
    throw error;
  }
};
const options = {
  backgroundScout,
  ...(skillPath === undefined ? {} : { loadScoutInstructions: () => readFile(skillPath, "utf8") })
};
let execution = await executeResumableAutomatedGeminiScout(input, undefined, options);
let advances = 1;
while ("controller_progress" in execution && Date.now() - started < Number(values["max-seconds"]) * 1_000) {
  execution = await executeResumableAutomatedGeminiScout(input, {
    checkpoint: execution.controller_progress.checkpoint,
    accountedNanoUsd: execution.controller_progress.accounted_nano_usd
  }, options);
  advances += 1;
}
const seconds = Math.round((Date.now() - started) / 1_000);
if (!("controller_completion" in execution)) {
  console.log(JSON.stringify({ seconds, advances, outcome: execution }, null, 2));
  process.exit(1);
}
const { packet, validation } = execution.controller_completion;
const terms = values.terms.split(",").map((term) => term.trim().toLowerCase()).filter(Boolean);
const validated = validation.validated_candidates.map((candidate) => ({
  video_id: candidate.video_id,
  title: candidate.provider_metadata.title,
  channel: candidate.provider_metadata.channel_title,
  family: candidate.gemini_provisional_annotations.intervention_family,
  program: candidate.gemini_provisional_annotations.specific_program,
  limitations: candidate.limitations.filter((limitation) => limitation.startsWith("The scout's declared"))
}));
const text = JSON.stringify([packet.discovery_queries, validated]).toLowerCase();
const report = {
  seconds,
  advances,
  status: validation.status,
  validated: validated.length,
  rejected: validation.rejected_candidates.map(({ video_id, rejection_reasons }) => ({ video_id, rejection_reasons })),
  unresolved: validation.unresolved_candidates.length,
  families: Object.fromEntries([...new Set(validated.map(({ family }) => family))]
    .map((family) => [family, validated.filter((candidate) => candidate.family === family).length])),
  terms_found: Object.fromEntries(terms.map((term) => [term, text.includes(term)])),
  queries: packet.discovery_queries,
  search_gaps: packet.search_gaps,
  videos: validated
};
if (values.out !== undefined) await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, videos: validated.map(({ title, family }) => `${family}: ${title}`) }, null, 2));
