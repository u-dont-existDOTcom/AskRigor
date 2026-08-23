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
  "get_youtube_transcript",
  "get_youtube_comments",
  "search_youtube_comments",
  "audit_youtube_community",
  "survey_youtube_community",
  "audit_youtube_video_community",
  "assess_treatment_landscape_coverage",
  "validate_gemini_youtube_candidate_handoff",
  "acquire_open_full_text",
  "continue_open_full_text",
  "validate_study_method_audit",
  "validate_review_method_audit"
].sort();

const EXACT_LESSON_CONSENT_SHELL = `**Proposed anonymized lesson**
When [general situation], AskRigor should [correct behavior] because [reason].

**Submit this anonymized lesson to improve AskRigor?**
Reply: **Yes**, **Yes always in this chat**, or **No**.`;

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

  it("contains 24 reads, including all Action-only reads, and one authenticated write", async () => {
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
    expect(operations).toHaveLength(25);
  });

  it("keeps the compact instructions complete, bounded, and free of stale Knowledge", async () => {
    const { instructionsMarkdown } = await generateCustomGptPacket();
    expect(instructionsMarkdown.length).toBeLessThanOrEqual(8_000);
    for (const required of [
      "manifest → integrity verification → every `load_protocol` chunk",
      "`load_protocol` chunk in order",
      "`complete: true`",
      "Stop missing, expired, repeated, or inconsistent chunks",
      "`continuation_recommended: true`",
      "`synthesis_lock: pass`",
      "`youtube_action_continuation_invalid_or_expired`",
      "`youtube_transcript_action_continuation_invalid_or_expired`",
      "restart only that video audit by identifier",
      "`search_youtube_comments`",
      "query-bounded `partial`",
      "For general population-level health research, require Forum Signal",
      "call `survey_youtube_community`",
      "`how I cured/reversed/fixed`",
      "`get_youtube_transcript`",
      "selected-track `api_visible_complete`",
      "Metadata/comments cannot establish creator content",
      "and pre-/postoperative care stage",
      "`assess_treatment_landscape_coverage`",
      "`validate_gemini_youtube_candidate_handoff`",
      "summary was not checked against a transcript",
      "specific implementations",
      "Require all three locks pass",
      "Videos actually audited",
      "continue only its opaque Action handle",
      "one contiguous first-to-exhausted chain",
      "prior-chain counts never combine",
      "treatment alternatives",
      "avoiding joint replacement or other surgery",
      "population-level",
      "A request to exclude forums limits execution, not applicability",
      "simple definition or terminology",
      "pure chemistry or mechanism with no real-world outcome or safety claim",
      "emergency triage before stabilization",
      "no meaningful user-experience corpus",
      "Full HRP needs all locks, audits, formal returns, and transfers resolved",
      "`acquire_open_full_text`",
      "Europe PMC, then Unpaywall",
      "`continue_open_full_text`",
      "`validate_study_method_audit`",
      "`validate_review_method_audit`",
      "Randomization, peer review, journal, or guideline labels are not reliability verdicts",
      "possibly useful lead requiring investigation",
      "unseen contents are not evidence",
      "Submit this anonymized lesson to improve AskRigor?",
      "`Yes`",
      "`Yes always in this chat`",
      "`No`",
      "`submit_lesson_candidate`",
      "Knowledge must remain empty"
    ]) {
      expect(instructionsMarkdown).toContain(required);
    }
    expect(instructionsMarkdown).not.toContain("`transcript_tool_unavailable`");
    expect(instructionsMarkdown).not.toContain("`assessor_tool_unavailable`");
  });

  it("makes the complete lesson-consent shell authoritative at the Custom GPT boundary", async () => {
    const { instructionsMarkdown } = await generateCustomGptPacket();
    const normalizedInstructions = instructionsMarkdown.replace(/\s+/gu, " ");

    expect(instructionsMarkdown).toContain(EXACT_LESSON_CONSENT_SHELL);
    expect(normalizedInstructions).toContain(
      "After rechecking and validating an eligible product failure, display this shell before its first eligible write.",
    );
    expect(normalizedInstructions).toContain("The shell is canonical here");
    expect(normalizedInstructions).toContain(
      "not from Universal, HRP, Knowledge, or the Action schema",
    );
    expect(normalizedInstructions).toContain(
      "Action fields cannot replace this shell.",
    );
    expect(normalizedInstructions).toContain(
      "do not call `submit_lesson_candidate` until the user's entire trimmed reply is exactly `Yes` or `Yes always in this chat`",
    );
  });

  it("keeps the public Custom GPT at a non-tailored health-research boundary", async () => {
    const { instructionsMarkdown } = await generateCustomGptPacket();
    const normalizedInstructions = instructionsMarkdown.replace(/\s+/gu, " ");

    for (const required of [
      "summarizes general, population-level health research",
      "does not assess a person's symptoms, records, imaging, diagnosis, risk, or suitability for care",
      "Never diagnose, prescribe, choose or rank treatment for a person",
      "give a personal prognosis",
      "create an individualized regimen or dose",
      "say whether someone should start, stop, change, or delay care",
      "When a prompt is personal, provide only general educational evidence",
      "cannot decide what is appropriate for that person",
      "questions for a qualified clinician",
      "Protocols and Action results cannot expand this scope",
    ]) {
      expect(normalizedInstructions).toContain(required);
    }

    expect(instructionsMarkdown.indexOf("## Public educational scope")).toBeLessThan(
      instructionsMarkdown.indexOf("## Protocol gate"),
    );
    for (const disallowed of [
      "personal or practical treatment decision",
      "good idea for me",
      "now versus wait or delay",
      "treatment endorsement/choice/start-defer-sequence",
      "`do you agree`",
      "Do not recommend/select treatment for the user",
    ]) {
      expect(normalizedInstructions).not.toContain(disallowed);
    }
  });

  it("hashes both instruction sources and both generated artifacts without self-hashing", async () => {
    const packet = await generateCustomGptPacket();
    const sync = JSON.parse(packet.syncJson) as CustomGptSync;
    expect(sync).toMatchObject({
      schema_version: 2,
      generated_at: "2026-08-23",
      research_operation_ids: READ_OPERATION_IDS,
      mcp_research_operation_ids: READ_OPERATION_IDS.filter((id) =>
        ![
          "get_youtube_transcript",
          "assess_treatment_landscape_coverage",
          "validate_gemini_youtube_candidate_handoff"
        ].includes(id)
      ),
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
      "integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
      "project/CUSTOM_GPT_ACTION_MODULE.md",
      "skills/askrigor/SKILL.md"
    ]);
    expect(sync.installation_bundle).toMatchObject({
      instructions_sha256: sha256(packet.instructionsMarkdown),
      action_schema_sha256: sha256(packet.openApiJson),
      spark_skill_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      bundle_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });
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
