import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

interface ConversationCase {
  id: string;
  scenario: string;
  expected: Record<string, unknown>;
  required_contract_text: string[];
  variants?: string[];
  server_statuses?: string[];
}

interface ConversationFixture {
  schema_version: number;
  cases: ConversationCase[];
}

const mandatoryInstructions = `Propose a lesson only after rechecking the answer, sources, instructions,
protocol state, or tool receipts and concluding that the user's concrete
criticism is valid. A preference, unsupported disagreement, or unresolved doubt
is not a validated lesson.

Never send raw chat text. First display a generalized lesson with no user
identity, individual medical story, uploads, quotations, or unnecessary URLs.

Submit this anonymized lesson to improve AskRigor?
Reply: Yes, Yes always in this chat, or No.`;

async function lessonModule(): Promise<string> {
  try {
    return await readFile(rootFile("project/LESSON_CAPTURE_MODULE.md"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function conversationFixture(): Promise<ConversationFixture> {
  return JSON.parse(
    await readFile(rootFile("tests/fixtures/lesson-capture/conversation-cases.json"), "utf8")
  ) as ConversationFixture;
}

describe("Custom GPT lesson conversation contract", () => {
  it("ships the mandatory eligibility, privacy, and consent copy verbatim", async () => {
    const module = await lessonModule();

    expect(module).toContain(mandatoryInstructions);
  });

  it("defines all ten fixture-driven conversation outcomes exactly", async () => {
    const fixture = await conversationFixture();
    const module = await lessonModule();

    expect(fixture.schema_version).toBe(1);
    expect(fixture.cases.map(({ id }) => id)).toEqual([
      "validated_missing_sources",
      "yes_once",
      "yes_always_first_and_later",
      "no_silence_ambiguity_or_topic_change",
      "stop_clears_standing_consent",
      "new_chat_clears_standing_consent",
      "unverified_or_preference_disagreement",
      "privacy_rejection_or_failure",
      "successful_submission_receipt",
      "platform_confirmation_remains"
    ]);

    for (const conversationCase of fixture.cases) {
      expect(conversationCase.scenario, conversationCase.id).not.toBe("");
      expect(Object.keys(conversationCase.expected).length, conversationCase.id).toBeGreaterThan(0);
      expect(conversationCase.required_contract_text.length, conversationCase.id).toBeGreaterThan(0);
      for (const requiredText of conversationCase.required_contract_text) {
        expect(module, conversationCase.id).toContain(requiredText);
      }
    }
  });

  it("keeps consent deterministic and conversation-local in the fixtures", async () => {
    const { cases } = await conversationFixture();
    const expectedById = Object.fromEntries(cases.map(({ id, expected }) => [id, expected]));

    expect(expectedById.yes_once).toMatchObject({
      action_calls: [{ operation: "submit_lesson_candidate", consent_scope: "once" }],
      standing_consent_after: false
    });
    expect(expectedById.yes_always_first_and_later).toMatchObject({
      generalized_candidates_displayed: 2,
      askrigor_consent_questions: 1,
      action_calls: [
        { operation: "submit_lesson_candidate", consent_scope: "conversation" },
        { operation: "submit_lesson_candidate", consent_scope: "conversation" }
      ],
      standing_consent_after: true,
      later_candidate_auto_submitted: true
    });
    expect(expectedById.stop_clears_standing_consent).toMatchObject({
      standing_consent_before: true,
      standing_consent_after: false,
      pending_candidate_after: false,
      action_calls: []
    });
    expect(expectedById.new_chat_clears_standing_consent).toMatchObject({
      standing_consent_after: false,
      pending_candidate_after: false,
      action_calls: []
    });
  });

  it("authorizes no call for every negative or non-answer variant", async () => {
    const { cases } = await conversationFixture();
    const negative = cases.find(({ id }) => id === "no_silence_ambiguity_or_topic_change");

    expect(negative?.variants).toEqual([
      "No",
      "silence",
      "ambiguous assent",
      "changed subject"
    ]);
    expect(negative?.expected).toMatchObject({
      action_calls: [],
      standing_consent_after: false,
      pending_candidate_after: false
    });
  });

  it("maps every Task 6 public status truthfully without exposing a private URL", async () => {
    const module = await lessonModule();

    for (const mapping of [
      "`submitted` -> `Lesson submitted for private review as {candidate_id} (anonymous occurrence {occurrence_count}).`",
      "`existing_candidate` -> `Lesson already existed as {candidate_id}; anonymous occurrence count is now {occurrence_count}.`",
      "`privacy_rejected` -> `Lesson not submitted: privacy screening rejected the candidate.`",
      "`rate_limited` -> `Lesson not submitted: submission is rate limited. Try again after {retry_after_seconds} seconds.`",
      "`anonymizer_unavailable` -> `Lesson not submitted: privacy generalization is unavailable.`",
      "`github_unavailable` -> `Lesson not submitted: the private review queue is unavailable.`"
    ]) {
      expect(module).toContain(mapping);
    }
    expect(module).toContain("Never display or infer a private repository URL or issue number.");
    expect(module).not.toMatch(/https?:\/\//u);
  });

  it("forbids sensitive source material and preserves consequential confirmation", async () => {
    const module = await lessonModule();

    for (const forbiddenInput of [
      "raw user or assistant messages",
      "user identity or identifiers",
      "individual medical story or history",
      "uploads or their contents",
      "quotations",
      "unnecessary URLs"
    ]) {
      expect(module).toContain(forbiddenInput);
    }
    expect(module).toContain("`x-openai-isConsequential: true`");
    expect(module).toContain(
      "Never relabel, split, or otherwise alter the operation to avoid ChatGPT's confirmation."
    );
  });
});
