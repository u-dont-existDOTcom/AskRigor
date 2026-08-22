import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  assessCustomGptProductAcceptance,
  type CustomGptProductAcceptanceInput
} from "../scripts/custom-gpt-product-acceptance.mts";
import { generateCustomGptPacket } from "../scripts/generate-custom-gpt-packet.mts";

const SPARK_SKILL = new URL(
  "../integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
  import.meta.url
);

describe("Custom GPT product acceptance", () => {
  it("rejects the observed instruction/install failure instead of calling it complete", async () => {
    const input = await validInput();
    input.installed_operation_ids = input.installed_operation_ids.filter((operation) =>
      !["get_youtube_transcript", "assess_treatment_landscape_coverage"]
        .includes(operation)
    );
    input.observed_action_operation_ids = ["audit_youtube_video_community"];
    input.coverage_receipt = {
      synthesis_lock: "pass",
      material_videos_fully_audited: 4,
      materially_distinct_programs_fully_audited: 4,
      independent_channels_or_pools: 4,
      external_scout_candidates_screened: 0
    };
    input.ordinary_output = `### Videos actually audited

- [Video A](https://www.youtube.com/watch?v=videoA1) used one exercise routine; 709 API-visible comments were acquired from a deterministic sample.
- Video B had all 76 discussions audited.

Creator transcript verification tools were not available here. Partial HRP analysis.`;

    const result = await assessCustomGptProductAcceptance(input);

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      "The Custom GPT does not expose the exact operations in the reviewed Action schema.",
      "The broad-treatment replay did not call validate_gemini_youtube_candidate_handoff.",
      "The broad-treatment replay did not call get_youtube_transcript.",
      "The broad-treatment replay did not call assess_treatment_landscape_coverage.",
      "Fewer than eight material videos were fully audited.",
      "Fewer than six materially different programs were audited.",
      "No validated Spark candidate was screened into the treatment landscape.",
      "The audited-video section links fewer than eight unique videos.",
      "An audited-video entry is missing its linked title."
    ]));
    expect(result.issues.join(" ")).toContain("raw API coverage status");
    expect(result.issues.join(" ")).toContain("sampling implementation jargon");
    expect(result.issues.join(" ")).toContain("protocol-compliance preamble");
  });

  it("passes only an exact synchronized install and a diverse Spark-backed replay", async () => {
    const input = await validInput();
    const result = await assessCustomGptProductAcceptance(input);

    expect(result).toEqual({ pass: true, issues: [] });
  });
});

async function validInput(): Promise<CustomGptProductAcceptanceInput> {
  const packet = await generateCustomGptPacket();
  const openApi = JSON.parse(packet.openApiJson) as {
    paths: Record<string, Record<string, { operationId: string }>>;
  };
  const operations = Object.values(openApi.paths)
    .flatMap((path) => Object.values(path))
    .map(({ operationId }) => operationId);
  const videos = Array.from({ length: 8 }, (_, index) =>
    `- [Video ${index + 1}](https://www.youtube.com/watch?v=videoA${index + 1}) — ${
      index < 6 ? `distinct program ${index + 1}` : `replication ${index - 5}`
    }; all publicly available comments and replies were checked.`
  ).join("\n");
  return {
    schema_version: "askrigor-custom-gpt-product-acceptance/v1",
    broad_treatment_question: true,
    substantial_youtube_corpus: true,
    instructions_sha256: sha256(packet.instructionsMarkdown),
    action_schema_sha256: sha256(packet.openApiJson),
    spark_skill_sha256: sha256(await readFile(SPARK_SKILL, "utf8")),
    installed_operation_ids: operations,
    observed_action_operation_ids: [
      "validate_gemini_youtube_candidate_handoff",
      "get_youtube_transcript",
      "assess_treatment_landscape_coverage"
    ],
    coverage_receipt: {
      synthesis_lock: "pass",
      material_videos_fully_audited: 8,
      materially_distinct_programs_fully_audited: 6,
      independent_channels_or_pools: 8,
      external_scout_candidates_screened: 4
    },
    ordinary_output: `The programs had different components and should not be pooled.

### Videos actually audited

${videos}`
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
