import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

interface ActionCall {
  operation: "preserve_lesson_incident" | "submit_lesson_candidate";
  consent_scope?: "once" | "conversation";
}

interface ExpectedOutcome {
  lesson_proposed: boolean;
  askrigor_consent_questions: number;
  action_calls: ActionCall[];
  standing_consent_after: boolean;
  pending_candidate_after: boolean;
}

interface ConversationCase {
  id: string;
  scenario: string;
  expected: ExpectedOutcome;
  variants?: string[];
  receipts?: string[];
}

interface ConversationFixture {
  schema_version: number;
  display_shell: string;
  incident_receipts: Record<string, string>;
  generalized_receipts: Record<string, string>;
  cases: ConversationCase[];
}

const expectedDisplayShell = `**Proposed anonymized lesson**
When [general situation], AskRigor should [correct behavior] because [reason].

**Submit this anonymized lesson to improve AskRigor?**
Reply: **Yes**, **Yes always in this chat**, or **No**.`;

const incidentStatuses = [
  "EXACT_TRANSCRIPT_PRESERVED",
  "PARTIAL_TRANSCRIPT_PRESERVED",
  "LESSON_ONLY_NO_TRANSCRIPT",
  "RAW_INCIDENT_NOT_PRESERVED",
] as const;

async function lessonModule(): Promise<string> {
  return readFile(rootFile("project/LESSON_CAPTURE_MODULE.md"), "utf8");
}

async function conversationFixture(): Promise<ConversationFixture> {
  return JSON.parse(
    await readFile(rootFile("tests/fixtures/lesson-capture/conversation-cases.json"), "utf8")
  ) as ConversationFixture;
}

function sectionMap(source: string): Map<string, string> {
  const headings = [...source.matchAll(/^## (.+)$/gmu)];
  return new Map(headings.map((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    return [heading[1]!, source.slice(start, end).trim()];
  }));
}

function caseById(fixture: ConversationFixture, id: string): ConversationCase {
  const found = fixture.cases.find((conversationCase) => conversationCase.id === id);
  if (!found) throw new Error(`Missing fixture case: ${id}`);
  return found;
}

function operations(conversationCase: ConversationCase): string[] {
  return conversationCase.expected.action_calls.map(({ operation }) => operation);
}

describe("Custom GPT two-phase lesson conversation contract", () => {
  it("pins the reviewed fixture schema, shell, and preservation vocabulary", async () => {
    const fixture = await conversationFixture();

    expect(fixture.schema_version).toBe(3);
    expect(Object.keys(fixture).sort()).toEqual([
      "cases",
      "display_shell",
      "generalized_receipts",
      "incident_receipts",
      "schema_version",
    ]);
    expect(fixture.display_shell).toBe(expectedDisplayShell);
    expect(Object.keys(fixture.incident_receipts)).toEqual(incidentStatuses);
    expect(fixture.generalized_receipts.incident_unavailable).toBe(
      "Anonymized lesson not submitted: the exact source incident could not be preserved."
    );
  });

  it("requires private incident preservation before every authorized generalized submission", async () => {
    const fixture = await conversationFixture();

    expect(caseById(fixture, "yes_once").expected.action_calls).toEqual([
      { operation: "preserve_lesson_incident" },
      { operation: "submit_lesson_candidate", consent_scope: "once" },
    ]);
    expect(caseById(fixture, "yes_always_first_and_later").expected.action_calls).toEqual([
      { operation: "preserve_lesson_incident" },
      { operation: "submit_lesson_candidate", consent_scope: "conversation" },
      { operation: "preserve_lesson_incident" },
      { operation: "submit_lesson_candidate", consent_scope: "conversation" },
    ]);
  });

  it("fails closed when the private incident vault is unavailable", async () => {
    const fixture = await conversationFixture();
    const unavailable = caseById(fixture, "incident_vault_unavailable");

    expect(operations(unavailable)).toEqual(["preserve_lesson_incident"]);
    expect(operations(unavailable)).not.toContain("submit_lesson_candidate");
    expect(unavailable.receipts).toEqual([
      "The exact lesson incident was not preserved.",
      "Anonymized lesson not submitted: the exact source incident could not be preserved.",
    ]);
  });

  it("never calls either consequential Action before explicit or standing consent", async () => {
    const fixture = await conversationFixture();

    expect(caseById(fixture, "validated_no_consent").expected.action_calls).toEqual([]);
    expect(caseById(fixture, "validated_no_consent").expected.pending_candidate_after).toBe(true);
    expect(caseById(fixture, "negative_or_ambiguous").expected.action_calls).toEqual([]);
    expect(caseById(fixture, "negative_or_ambiguous").variants).toEqual([
      "No",
      "silence",
      "ambiguous assent",
      "changed subject",
    ]);
    expect(caseById(fixture, "unverified_criticism").expected.lesson_proposed).toBe(false);
  });

  it("maps the fixture into the exact module sections and two-phase ordering", async () => {
    const fixture = await conversationFixture();
    const source = await lessonModule();
    const sections = sectionMap(source);

    expect(sections.get("User-facing shell")).toContain(fixture.display_shell);
    expect(sections.get("Eligibility details")).toContain(
      "Only a rechecked, explicitly validated concrete criticism can become a lesson"
    );
    expect(sections.get("Privacy boundary")).toContain(
      "Treat the exact incident and generalized lesson as two different data classes"
    );

    const order = sections.get("Two-phase capture order") ?? "";
    expect(order.indexOf("call the private incident-capture Action")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("call `submit_lesson_candidate`")).toBeGreaterThan(
      order.indexOf("call the private incident-capture Action")
    );
    expect(order).toContain("require an opaque successful preservation receipt before continuing");
    expect(order).toContain("fail closed: do not call\n`submit_lesson_candidate`");
  });

  it("uses a destination-specific raw-text privacy boundary rather than the obsolete blanket ban", async () => {
    const source = await lessonModule();
    const privacy = sectionMap(source).get("Privacy boundary") ?? "";

    expect(source).not.toContain("Never send raw chat text.");
    expect(source).toContain(
      "Raw incident text may go only to that owner-private encrypted incident-vault\nroute."
    );
    expect(privacy).toContain(
      "The exact minimum message window may be sent only to the private encrypted\nlesson-incident capture Action"
    );
    expect(privacy).toContain(
      "Never send raw user or\nassistant messages"
    );
    expect(privacy).toContain(
      "The generalized submission may include only the opaque incident\nprovenance returned by the private incident-capture stage."
    );
  });

  it("pins the minimum exact incident window and forbids historical reconstruction", async () => {
    const section = sectionMap(await lessonModule()).get("Minimum exact incident window") ?? "";

    for (const required of [
      "the exact user prompt/evidence needed to understand the failure",
      "the exact erroneous AskRigor response",
      "the exact user correction",
      "only immediately necessary neighboring turns for meaning",
      "Whole-conversation capture is not the default",
      "Do not reconstruct missing turns",
    ]) expect(section).toContain(required);
  });

  it("keeps standing consent conversation-local and platform confirmation intact", async () => {
    const state = sectionMap(await lessonModule()).get("Deterministic conversation-local state") ?? "";
    const confirmation = sectionMap(await lessonModule()).get("Consequential confirmation") ?? "";

    expect(state).toContain(
      "Recognize authorization only when the user's entire trimmed reply is exactly\n`Yes` or `Yes always in this chat`."
    );
    expect(state).toContain("standing consent only in the current chat");
    expect(state).toContain("At the start of every new chat");
    expect(state).toContain("`Stop submitting lessons`");
    expect(confirmation).toContain(
      "conversational standing consent\ncannot suppress, bypass, or replace that confirmation"
    );
  });

  it("maps all preservation and generalized receipts without private locators", async () => {
    const fixture = await conversationFixture();
    const receipts = sectionMap(await lessonModule()).get("Truthful receipts") ?? "";

    for (const [status, text] of Object.entries(fixture.incident_receipts)) {
      expect(receipts).toContain(`\`${status}\` -> \`${text}\``);
    }
    for (const [status, text] of Object.entries(fixture.generalized_receipts)) {
      if (status === "incident_unavailable") {
        expect(receipts).toContain(`\`${text}\``);
      } else {
        expect(receipts).toContain(`\`${status}\` -> \`${text}\``);
      }
    }
    expect(receipts).toContain("Never display or infer a private repository URL or issue number.");
    expect(receipts).toContain("Do not display the private incident ID or digest");
    expect(receipts).not.toMatch(/https?:\/\//u);
  });
});
