import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  generateCustomGptPacket,
  type CustomGptSync
} from "../scripts/generate-custom-gpt-packet.mts";

const ROOT = new URL("../", import.meta.url);
const READ_OPERATION_IDS = [
  "get_protocol_manifest",
  "verify_protocol_integrity",
  "load_protocol",
  "search_pubmed",
  "fetch_pubmed_record",
  "search_europe_pmc",
  "search_clinical_trials",
  "fetch_clinical_trial",
  "resolve_doi",
  "check_retraction_status",
  "search_youtube",
  "get_youtube_video",
  "get_youtube_comments",
  "search_youtube_comments",
  "audit_youtube_community",
  "survey_youtube_community",
  "audit_youtube_video_community"
].sort();

describe("deterministic Custom GPT synchronization packet", () => {
  it("exactly reproduces every committed generated artifact", async () => {
    const packet = await generateCustomGptPacket();
    const [openApi, instructions, sync] = await Promise.all([
      readFile(new URL("docs/custom-gpt-action-openapi.json", ROOT), "utf8"),
      readFile(new URL("docs/custom-gpt-instructions.md", ROOT), "utf8"),
      readFile(new URL("docs/custom-gpt-sync.json", ROOT), "utf8")
    ]);

    expect(packet.openApiJson).toBe(openApi);
    expect(packet.instructionsMarkdown).toBe(instructions);
    expect(packet.syncJson).toBe(sync);
  });

  it("contains the exact 17 read operations and one authenticated consequential write", async () => {
    const packet = await generateCustomGptPacket();
    const document = JSON.parse(packet.openApiJson) as {
      paths: Record<string, Record<string, {
        operationId: string;
        security?: unknown;
        "x-openai-isConsequential": boolean;
      }>>;
    };
    const operations = Object.values(document.paths).flatMap((path) => Object.values(path));
    const readOperations = operations.filter(({ operationId }) =>
      operationId !== "submit_lesson_candidate"
    );

    expect(readOperations.map(({ operationId }) => operationId).sort()).toEqual(
      READ_OPERATION_IDS
    );
    expect(readOperations.every((operation) =>
      operation.security === undefined &&
      operation["x-openai-isConsequential"] === false
    )).toBe(true);
    expect(operations.find(({ operationId }) =>
      operationId === "submit_lesson_candidate"
    )).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-openai-isConsequential": true
    });
    expect(operations).toHaveLength(18);
  });

  it("keeps the compact instructions complete, bounded, and free of stale Knowledge", async () => {
    const { instructionsMarkdown } = await generateCustomGptPacket();
    expect(instructionsMarkdown.length).toBeLessThanOrEqual(7_800);
    for (const required of [
      "manifest → integrity verification → every `load_protocol` chunk",
      "`complete: true`",
      "`continuation_recommended: true`",
      "`synthesis_lock: pass`",
      "`search_youtube_comments`",
      "query-bounded `partial`",
      "Submit this anonymized lesson to improve AskRigor?",
      "`Yes`",
      "`Yes always in this chat`",
      "`No`",
      "`submit_lesson_candidate`",
      "Knowledge must remain empty"
    ]) {
      expect(instructionsMarkdown).toContain(required);
    }
  });

  it("hashes both instruction sources and both generated artifacts without self-hashing", async () => {
    const packet = await generateCustomGptPacket();
    const sync = JSON.parse(packet.syncJson) as CustomGptSync;
    expect(sync).toMatchObject({
      schema_version: 1,
      generated_at: "2026-08-16",
      research_operation_ids: READ_OPERATION_IDS,
      consequential_operation_ids: ["submit_lesson_candidate"],
      editor: {
        knowledge: "empty",
        schema_url: "https://mcp.askrigor.com/actions/openapi.json",
        authentication: "API Key -> Bearer",
        privacy_url: "https://askrigor.com/privacy",
        direct_gpt_url_required: true
      }
    });
    expect(sync.sources.map(({ path }) => path).sort()).toEqual([
      "project/CUSTOM_GPT_ACTION_MODULE.md",
      "skills/askrigor/SKILL.md"
    ]);
    expect(sync.artifacts.map(({ path }) => path).sort()).toEqual([
      "docs/custom-gpt-action-openapi.json",
      "docs/custom-gpt-instructions.md"
    ]);
    expect(packet.syncJson).not.toContain("docs/custom-gpt-sync.json");

    for (const entry of [...sync.sources, ...sync.artifacts]) {
      const content = entry.path === "docs/custom-gpt-action-openapi.json"
        ? packet.openApiJson
        : entry.path === "docs/custom-gpt-instructions.md"
          ? packet.instructionsMarkdown
          : await readFile(new URL(entry.path, ROOT), "utf8");
      expect(entry.sha256).toBe(sha256(content));
    }
  });

  it("contains no secret-like values, private repository references, or unknown operations", async () => {
    const packet = await generateCustomGptPacket();
    const combined = `${packet.openApiJson}\n${packet.instructionsMarkdown}\n${packet.syncJson}`;
    expect(combined).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/u);
    expect(combined).not.toMatch(/gh[pousr]_[A-Za-z0-9]{16,}/u);
    expect(combined).not.toContain("u-dont-existDOTcom");
    expect(combined).not.toContain("AskRigor-lessons");
    expect(combined).not.toContain("github.com/");

    const sync = JSON.parse(packet.syncJson) as CustomGptSync;
    expect([...sync.research_operation_ids, ...sync.consequential_operation_ids].sort())
      .toEqual([...READ_OPERATION_IDS, "submit_lesson_candidate"].sort());
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}
