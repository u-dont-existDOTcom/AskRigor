import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { generateCustomGptPacket } from "./generate-custom-gpt-packet.mts";

const ROOT = new URL("../", import.meta.url);
const SPARK_SKILL = new URL(
  "../integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
  import.meta.url
);

const receiptSchema = z.strictObject({
  synthesis_lock: z.literal("pass"),
  material_videos_fully_audited: z.number().int().nonnegative(),
  materially_distinct_programs_fully_audited: z.number().int().nonnegative(),
  independent_channels_or_pools: z.number().int().nonnegative(),
  external_scout_candidates_screened: z.number().int().nonnegative()
});

const inputSchema = z.strictObject({
  schema_version: z.literal("askrigor-custom-gpt-product-acceptance/v1"),
  broad_treatment_question: z.boolean(),
  substantial_youtube_corpus: z.boolean(),
  instructions_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  action_schema_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  spark_skill_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  installed_operation_ids: z.array(z.string().min(1)),
  observed_action_operation_ids: z.array(z.string().min(1)),
  coverage_receipt: receiptSchema.optional(),
  ordinary_output: z.string().min(1)
});

export type CustomGptProductAcceptanceInput = z.input<typeof inputSchema>;

export interface CustomGptProductAcceptanceResult {
  pass: boolean;
  issues: string[];
}

const REQUIRED_BROAD_ACTIONS = [
  "validate_gemini_youtube_candidate_handoff",
  "get_youtube_transcript",
  "assess_treatment_landscape_coverage"
] as const;

const FORBIDDEN_ORDINARY_OUTPUT = [
  [/\bapi[_ -]?visible(?:_complete)?\b/iu, "raw API coverage status"],
  [/\bdeterministic sample\b/iu, "sampling implementation jargon"],
  [/\bsynthesis[_ -]?lock\b/iu, "internal lock name"],
  [/\bprovider_reported_comments\b/iu, "internal provider field"],
  [/\brecords_(?:retrieved_cumulative|returned_for_analysis)\b/iu, "internal count field"],
  [/\bprogram fingerprint\b/iu, "internal program-normalization term"],
  [/\bfrontier receipt\b/iu, "internal scouting-receipt term"],
  [/\bPartial HRP analysis\b/iu, "protocol-compliance preamble"]
] as const;

export async function assessCustomGptProductAcceptance(
  rawInput: CustomGptProductAcceptanceInput
): Promise<CustomGptProductAcceptanceResult> {
  const input = inputSchema.parse(rawInput);
  const packet = await generateCustomGptPacket();
  const sparkSkill = await readFile(SPARK_SKILL, "utf8");
  const openApi = JSON.parse(packet.openApiJson) as {
    paths: Record<string, Record<string, { operationId: string }>>;
  };
  const expectedOperations = Object.values(openApi.paths)
    .flatMap((path) => Object.values(path))
    .map(({ operationId }) => operationId)
    .sort();
  const issues: string[] = [];

  compareDigest(input.instructions_sha256, sha256(packet.instructionsMarkdown),
    "installed Instructions", issues);
  compareDigest(input.action_schema_sha256, sha256(packet.openApiJson),
    "installed Action schema", issues);
  compareDigest(input.spark_skill_sha256, sha256(sparkSkill),
    "installed Spark skill", issues);

  const installed = [...new Set(input.installed_operation_ids)].sort();
  if (JSON.stringify(installed) !== JSON.stringify(expectedOperations)) {
    issues.push("The Custom GPT does not expose the exact operations in the reviewed Action schema.");
  }

  for (const [pattern, label] of FORBIDDEN_ORDINARY_OUTPUT) {
    if (pattern.test(input.ordinary_output)) {
      issues.push(`Ordinary output exposes ${label}.`);
    }
  }
  if (/transcript (?:verification|retrieval).{0,40}(?:tool|function|installation).{0,20}(?:unavailable|not available)/iu
    .test(input.ordinary_output)) {
    issues.push("The output falsely treats an installed transcript Action as unavailable.");
  }
  if (/treatment[- ]landscape.{0,40}(?:tool|function|check).{0,20}(?:unavailable|not available)/iu
    .test(input.ordinary_output)) {
    issues.push("The output falsely treats the installed landscape Action as unavailable.");
  }

  if (input.broad_treatment_question && input.substantial_youtube_corpus) {
    for (const operation of REQUIRED_BROAD_ACTIONS) {
      if (!input.observed_action_operation_ids.includes(operation)) {
        issues.push(`The broad-treatment replay did not call ${operation}.`);
      }
    }
    const receipt = input.coverage_receipt;
    if (receipt === undefined) {
      issues.push("The broad-treatment replay has no passed treatment-landscape receipt.");
    } else {
      if (receipt.material_videos_fully_audited < 8) {
        issues.push("Fewer than eight material videos were fully audited.");
      }
      if (receipt.materially_distinct_programs_fully_audited < 6) {
        issues.push("Fewer than six materially different programs were audited.");
      }
      if (receipt.independent_channels_or_pools < 3) {
        issues.push("Fewer than three independent channels or discussion pools were audited.");
      }
      if (receipt.external_scout_candidates_screened < 1) {
        issues.push("No validated Spark candidate was screened into the treatment landscape.");
      }
    }

    const auditedSection = section(input.ordinary_output, "Videos actually audited");
    if (auditedSection === null) {
      issues.push("The output omits the Videos actually audited section.");
    } else {
      const linkedVideoIds = new Set(
        [...auditedSection.matchAll(/youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,20})/gu)]
          .map((match) => match[1])
      );
      if (linkedVideoIds.size < 8) {
        issues.push("The audited-video section links fewer than eight unique videos.");
      }
      if (/^\s*(?:[-*]|\|).+\bhad all \d+ discussions audited\b(?!.*youtube\.com\/watch)/imu
        .test(auditedSection)) {
        issues.push("An audited-video entry is missing its linked title.");
      }
    }
  }

  return { pass: issues.length === 0, issues };
}

function compareDigest(actual: string, expected: string, label: string, issues: string[]): void {
  if (actual !== expected) issues.push(`The ${label} does not match the reviewed release bundle.`);
}

function section(markdown: string, heading: string): string | null {
  const match = new RegExp(`^###?\\s+${escapeRegex(heading)}\\s*$`, "imu").exec(markdown);
  if (match === null) return null;
  const rest = markdown.slice(match.index + match[0].length);
  const nextHeading = /^#{1,3}\s+/mu.exec(rest);
  return nextHeading === null ? rest : rest.slice(0, nextHeading.index);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const path = process.argv[2];
  if (path === undefined) {
    process.stderr.write("Usage: npm run validate:custom-gpt-product -- path/to/local-acceptance.json\n");
    process.exitCode = 2;
  } else {
    const input = JSON.parse(await readFile(resolve(path), "utf8")) as CustomGptProductAcceptanceInput;
    const result = await assessCustomGptProductAcceptance(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.pass ? 0 : 1;
  }
}
