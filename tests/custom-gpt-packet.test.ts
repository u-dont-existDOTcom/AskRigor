import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  generateCustomGptPacket,
  type CustomGptSync
} from "../scripts/generate-custom-gpt-packet.mts";

const ROOT = new URL("../", import.meta.url);
const CONTROLLED = [
  "continue_research_session",
  "finalize_research_report",
  "get_research_session_status",
  "start_research_session"
];

describe("controlled Custom GPT projection", () => {
  it("exactly reproduces every committed generated artifact", async () => {
    const packet = await generateCustomGptPacket();
    const [openApi, instructions, sync, runtimeManifest] = await Promise.all([
      readFile(new URL("docs/custom-gpt-action-openapi.json", ROOT), "utf8"),
      readFile(new URL("docs/custom-gpt-instructions.md", ROOT), "utf8"),
      readFile(new URL("docs/custom-gpt-sync.json", ROOT), "utf8"),
      readFile(new URL(
        "apps/research-mcp/src/generated/custom-gpt-bundle.ts",
        ROOT
      ), "utf8")
    ]);
    expect(packet.openApiJson).toBe(openApi);
    expect(packet.instructionsMarkdown).toBe(instructions);
    expect(packet.syncJson).toBe(sync);
    expect(packet.runtimeManifestTypescript).toBe(runtimeManifest);
  });

  it("projects exactly four authenticated controlled reads and one lesson write", async () => {
    const packet = await generateCustomGptPacket();
    const document = JSON.parse(packet.openApiJson) as {
      paths: Record<string, Record<string, {
        operationId: string;
        security?: unknown;
        "x-openai-isConsequential": boolean;
      }>>;
    };
    const operations = Object.values(document.paths).flatMap(Object.values);
    const research = operations.filter(({ operationId }) =>
      operationId !== "submit_lesson_candidate"
    );
    expect(research.map(({ operationId }) => operationId).sort()).toEqual(CONTROLLED);
    expect(research.every(({ security, "x-openai-isConsequential": consequential }) =>
      JSON.stringify(security) === JSON.stringify([{ bearerAuth: [] }]) &&
      consequential === false
    )).toBe(true);
    expect(operations.find(({ operationId }) =>
      operationId === "submit_lesson_candidate"
    )).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-openai-isConsequential": true
    });
    expect(operations).toHaveLength(5);
  });

  it("keeps workflow authority on the server and hides low-level orchestration", async () => {
    const { instructionsMarkdown } = await generateCustomGptPacket();
    for (const required of [
      "server owns protocol loading, research state, required work, completion",
      "Follow only the returned `directive`",
      "For `blocked`, do not start a new session or immediately call continue again",
      "call status once for the same session",
      "collect every `worker_input_json_chunk` in order",
      "perform only the exact bounded work",
      "render only `finalization.reader_facing.report`",
      "Never ask the user to copy a Gemini packet",
      "never turn all exercise",
      "Use plain language",
      "Submit this anonymized lesson to improve AskRigor?"
    ]) expect(instructionsMarkdown).toContain(required);
    for (const forbidden of [
      "get_youtube_transcript",
      "audit_youtube_video_community",
      "acquire_open_full_text",
      "validate_study_method_audit",
      "assess_treatment_landscape_coverage",
      "api_visible_complete"
    ]) expect(instructionsMarkdown).not.toContain(forbidden);
    expect(instructionsMarkdown.length).toBeLessThanOrEqual(5_000);
  });

  it("binds sync metadata to the four-operation installation bundle while retaining 24 MCP tools", async () => {
    const packet = await generateCustomGptPacket();
    const sync = JSON.parse(packet.syncJson) as CustomGptSync;
    expect(sync.schema_version).toBe(3);
    expect(sync.research_operation_ids).toEqual(CONTROLLED);
    expect(sync.mcp_research_operation_ids).toHaveLength(24);
    expect(sync.installation_bundle).toMatchObject({
      instructions_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      action_schema_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      bundle_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });
    expect(sync.internal_scout_skill_sha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
