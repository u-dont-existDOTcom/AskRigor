import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const rootFile = (path: string) => new URL(`../${path}`, import.meta.url);

type ConsentScope = "once" | "conversation";

interface ActionCall {
  operation: "submit_lesson_candidate";
  consent_scope: ConsentScope;
}

interface ExpectedOutcome {
  lesson_proposed: boolean;
  generalized_candidates_displayed: number;
  askrigor_consent_questions: number;
  action_calls: ActionCall[];
  standing_consent_before: boolean;
  standing_consent_after: boolean;
  pending_candidate_after: boolean;
  later_candidate_auto_submitted: boolean;
  success_claim: boolean;
  private_url_displayed: boolean;
  chatgpt_platform_confirmation_may_occur: boolean;
  platform_confirmation_suppressed: boolean;
  receipts: string[];
}

interface ConversationCase {
  id: string;
  scenario: string;
  expected: ExpectedOutcome;
  contract_nodes: string[];
  variants?: string[];
  server_statuses?: string[];
}

interface ConversationFixture {
  schema_version: number;
  display_shell: string;
  status_receipts: Record<string, string>;
  cases: ConversationCase[];
}

interface ContractNode {
  section: string;
  text: string;
}

const mandatoryInstructions = `Propose a lesson only after rechecking the answer, sources, instructions,
protocol state, or tool receipts and concluding that the user's concrete
criticism is valid. A preference, unsupported disagreement, or unresolved doubt
is not a validated lesson.

Never send raw chat text. First display a generalized lesson with no user
identity, individual medical story, uploads, quotations, or unnecessary URLs.

Submit this anonymized lesson to improve AskRigor?
Reply: Yes, Yes always in this chat, or No.`;

const expectedDisplayShell = `**Proposed anonymized lesson**
When [general situation], AskRigor should [correct behavior] because [reason].

**Submit this anonymized lesson to improve AskRigor?**
Reply: **Yes**, **Yes always in this chat**, or **No**.`;

const expectedStatusReceipts = {
  submitted: "Anonymized lesson submitted as candidate {candidate_id}. It requires review before changing AskRigor. Anonymous occurrence count: {occurrence_count}.",
  existing_candidate: "Lesson already existed as {candidate_id}; anonymous occurrence count is now {occurrence_count}.",
  privacy_rejected: "Lesson not submitted: privacy screening rejected the candidate.",
  rate_limited: "Lesson not submitted: submission is rate limited. Try again after {retry_after_seconds} seconds.",
  anonymizer_unavailable: "Lesson not submitted: privacy generalization is unavailable.",
  github_unavailable: "Lesson not submitted: the private review queue is unavailable.",
} as const;

const expectedOutcomes: Record<string, ExpectedOutcome> = {
  validated_missing_sources: {
    lesson_proposed: true,
    generalized_candidates_displayed: 1,
    askrigor_consent_questions: 1,
    action_calls: [],
    standing_consent_before: false,
    standing_consent_after: false,
    pending_candidate_after: true,
    later_candidate_auto_submitted: false,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: false,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
  yes_once: {
    lesson_proposed: true,
    generalized_candidates_displayed: 1,
    askrigor_consent_questions: 1,
    action_calls: [{ operation: "submit_lesson_candidate", consent_scope: "once" }],
    standing_consent_before: false,
    standing_consent_after: false,
    pending_candidate_after: false,
    later_candidate_auto_submitted: false,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: true,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
  yes_always_first_and_later: {
    lesson_proposed: true,
    generalized_candidates_displayed: 2,
    askrigor_consent_questions: 1,
    action_calls: [
      { operation: "submit_lesson_candidate", consent_scope: "conversation" },
      { operation: "submit_lesson_candidate", consent_scope: "conversation" },
    ],
    standing_consent_before: false,
    standing_consent_after: true,
    pending_candidate_after: false,
    later_candidate_auto_submitted: true,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: true,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
  no_silence_ambiguity_or_topic_change: {
    lesson_proposed: true,
    generalized_candidates_displayed: 1,
    askrigor_consent_questions: 1,
    action_calls: [],
    standing_consent_before: false,
    standing_consent_after: false,
    pending_candidate_after: false,
    later_candidate_auto_submitted: false,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: false,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
  stop_clears_standing_consent: {
    lesson_proposed: false,
    generalized_candidates_displayed: 0,
    askrigor_consent_questions: 0,
    action_calls: [],
    standing_consent_before: true,
    standing_consent_after: false,
    pending_candidate_after: false,
    later_candidate_auto_submitted: false,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: false,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
  new_chat_clears_standing_consent: {
    lesson_proposed: false,
    generalized_candidates_displayed: 0,
    askrigor_consent_questions: 0,
    action_calls: [],
    standing_consent_before: false,
    standing_consent_after: false,
    pending_candidate_after: false,
    later_candidate_auto_submitted: false,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: false,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
  unverified_or_preference_disagreement: {
    lesson_proposed: false,
    generalized_candidates_displayed: 0,
    askrigor_consent_questions: 0,
    action_calls: [],
    standing_consent_before: false,
    standing_consent_after: false,
    pending_candidate_after: false,
    later_candidate_auto_submitted: false,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: false,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
  privacy_rejection_or_failure: {
    lesson_proposed: true,
    generalized_candidates_displayed: 1,
    askrigor_consent_questions: 1,
    action_calls: [{ operation: "submit_lesson_candidate", consent_scope: "once" }],
    standing_consent_before: false,
    standing_consent_after: false,
    pending_candidate_after: false,
    later_candidate_auto_submitted: false,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: true,
    platform_confirmation_suppressed: false,
    receipts: [
      "Lesson not submitted: privacy screening rejected the candidate.",
      "Lesson not submitted: privacy generalization is unavailable.",
    ],
  },
  successful_submission_receipt: {
    lesson_proposed: true,
    generalized_candidates_displayed: 1,
    askrigor_consent_questions: 1,
    action_calls: [{ operation: "submit_lesson_candidate", consent_scope: "once" }],
    standing_consent_before: false,
    standing_consent_after: false,
    pending_candidate_after: false,
    later_candidate_auto_submitted: false,
    success_claim: true,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: true,
    platform_confirmation_suppressed: false,
    receipts: [
      "Anonymized lesson submitted as candidate ARL-0042. It requires review before changing AskRigor. Anonymous occurrence count: 1.",
    ],
  },
  platform_confirmation_remains: {
    lesson_proposed: true,
    generalized_candidates_displayed: 1,
    askrigor_consent_questions: 0,
    action_calls: [{ operation: "submit_lesson_candidate", consent_scope: "conversation" }],
    standing_consent_before: true,
    standing_consent_after: true,
    pending_candidate_after: false,
    later_candidate_auto_submitted: true,
    success_claim: false,
    private_url_displayed: false,
    chatgpt_platform_confirmation_may_occur: true,
    platform_confirmation_suppressed: false,
    receipts: [],
  },
};

const expectedNodes: Record<string, string[]> = {
  validated_missing_sources: [
    "eligibility.validated_only",
    "privacy.derived_only",
    "state.no_standing",
  ],
  yes_once: ["state.yes_once", "confirmation.consequential"],
  yes_always_first_and_later: [
    "state.yes_always",
    "state.later_conversation_submission",
    "state.clear_conversation_pending",
    "state.display_receipt_after_response",
    "confirmation.consequential",
  ],
  no_silence_ambiguity_or_topic_change: ["state.no_or_nonanswer"],
  stop_clears_standing_consent: ["state.stop"],
  new_chat_clears_standing_consent: ["state.new_chat"],
  unverified_or_preference_disagreement: ["eligibility.reject_unverified"],
  privacy_rejection_or_failure: [
    "state.yes_once",
    "receipt.no_invented_success",
    "confirmation.consequential",
  ],
  successful_submission_receipt: [
    "state.yes_once",
    "receipt.private_safe",
    "confirmation.consequential",
  ],
  platform_confirmation_remains: [
    "state.later_conversation_submission",
    "state.clear_conversation_pending",
    "confirmation.consequential",
  ],
};

const contractNodes: Record<string, ContractNode> = {
  "eligibility.validated_only": {
    section: "Eligibility details",
    text: "Only a rechecked, explicitly validated concrete criticism can become a lesson candidate.",
  },
  "eligibility.reject_unverified": {
    section: "Eligibility details",
    text: "Do not propose or submit a candidate when the criticism is unverified, is a preference disagreement, or remains in doubt.",
  },
  "privacy.derived_only": {
    section: "Privacy boundary",
    text: "Build only the structured Action fields. Never send raw user or assistant messages, user identity or identifiers, an individual medical story or history, uploads or their contents, quotations, unnecessary URLs, a conversation ID, or any other detail not needed for the generalized product lesson.",
  },
  "state.no_standing": {
    section: "Deterministic conversation-local state",
    text: "With no standing consent, display the candidate first, ask the exact question above, and do not call the Action yet.",
  },
  "state.yes_once": {
    section: "Deterministic conversation-local state",
    text: "`Yes` authorizes exactly the currently displayed candidate: call `submit_lesson_candidate` once with `consent_scope: \"once\"`, then clear the pending candidate without enabling standing consent.",
  },
  "state.yes_always": {
    section: "Deterministic conversation-local state",
    text: "`Yes always in this chat` authorizes the displayed candidate and enables standing consent only in the current chat. Call `submit_lesson_candidate` with `consent_scope: \"conversation\"`.",
  },
  "state.later_conversation_submission": {
    section: "Deterministic conversation-local state",
    text: "For every later independently validated candidate in that same chat, display the generalized candidate first, then call the Action with `consent_scope: \"conversation\"` without repeating AskRigor's consent question.",
  },
  "state.clear_conversation_pending": {
    section: "Deterministic conversation-local state",
    text: "Clear the pending candidate after the initial `Yes always in this chat` submission and after every later standing-consent Action call.",
  },
  "state.display_receipt_after_response": {
    section: "Deterministic conversation-local state",
    text: "After every completed Action response, display its receipt after the already displayed candidate.",
  },
  "state.no_or_nonanswer": {
    section: "Deterministic conversation-local state",
    text: "`No`, silence, ambiguous assent, or a changed subject authorizes no call; discard the pending candidate.",
  },
  "state.stop": {
    section: "Deterministic conversation-local state",
    text: "`Stop submitting lessons` immediately clears standing consent and any pending candidate without making a call.",
  },
  "state.new_chat": {
    section: "Deterministic conversation-local state",
    text: "At the start of every new chat, initialize standing consent to off and the pending candidate to empty; never inherit or recover either value.",
  },
  "confirmation.consequential": {
    section: "Consequential confirmation",
    text: "The Action is consequential, so ChatGPT may still require its own platform confirmation for every call; conversational standing consent cannot suppress, bypass, or replace that confirmation.",
  },
  "receipt.no_invented_success": {
    section: "Truthful receipts",
    text: "Never claim success before a success status, and never convert a failure into a success.",
  },
  "receipt.private_safe": {
    section: "Truthful receipts",
    text: "Never display or infer a private repository URL or issue number.",
  },
};

const expectedOutcomeKeys = [
  "action_calls",
  "askrigor_consent_questions",
  "chatgpt_platform_confirmation_may_occur",
  "generalized_candidates_displayed",
  "later_candidate_auto_submitted",
  "lesson_proposed",
  "pending_candidate_after",
  "platform_confirmation_suppressed",
  "private_url_displayed",
  "receipts",
  "standing_consent_after",
  "standing_consent_before",
  "success_claim",
];

const contradictoryInstructions = [
  "`Yes` also enables standing consent.",
  "A standing-consent Action may leave the pending candidate set.",
  "Later standing-consent submissions repeat AskRigor's consent question.",
  "Display the private repository URL in the receipt.",
] as const;

const universalConsentReaskMutations = [
  "Display the full approved shell before every Action call.",
  "Always show the exact consent question and options before calling the Action.",
  "Before any submission, repeat the consent question and options.",
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

function sameValue(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function validateFixture(fixture: ConversationFixture): string[] {
  const errors: string[] = [];
  if (!sameValue(Object.keys(fixture).sort(), [
    "cases",
    "display_shell",
    "schema_version",
    "status_receipts",
  ])) errors.push("fixture_keys");
  if (fixture.schema_version !== 2) errors.push("schema_version");
  if (fixture.display_shell !== expectedDisplayShell) errors.push("display_shell");
  if (!sameValue(fixture.status_receipts, expectedStatusReceipts)) errors.push("status_receipts");

  const expectedIds = Object.keys(expectedOutcomes);
  const actualIds = fixture.cases.map(({ id }) => id);
  if (!sameValue(actualIds, expectedIds)) errors.push("case_ids");

  for (const conversationCase of fixture.cases) {
    const { id, expected, contract_nodes: nodes } = conversationCase;
    const caseKeys = ["contract_nodes", "expected", "id", "scenario"];
    if (id === "no_silence_ambiguity_or_topic_change") caseKeys.push("variants");
    if (id === "privacy_rejection_or_failure" || id === "successful_submission_receipt") {
      caseKeys.push("server_statuses");
    }
    if (!sameValue(Object.keys(conversationCase).sort(), caseKeys.sort())) {
      errors.push(`${id}.case_keys`);
    }
    if (!conversationCase.scenario.trim()) errors.push(`${id}.scenario`);
    if (!sameValue(Object.keys(expected).sort(), expectedOutcomeKeys)) {
      errors.push(`${id}.expected_keys`);
    }
    if (!sameValue(expected, expectedOutcomes[id])) errors.push(`${id}.expected`);
    if (!sameValue(nodes, expectedNodes[id])) errors.push(`${id}.contract_nodes`);
    for (const node of nodes) {
      if (!contractNodes[node]) errors.push(`${id}.unknown_node:${node}`);
    }
    if (expected.action_calls.length > 0 && !expected.chatgpt_platform_confirmation_may_occur) {
      errors.push(`${id}.confirmation_missing`);
    }
    if (expected.private_url_displayed) errors.push(`${id}.private_url`);
    if (expected.platform_confirmation_suppressed) errors.push(`${id}.confirmation_suppressed`);
  }

  const negative = fixture.cases.find(({ id }) => id === "no_silence_ambiguity_or_topic_change");
  if (!sameValue(negative?.variants, ["No", "silence", "ambiguous assent", "changed subject"])) {
    errors.push("negative.variants");
  }
  const privacy = fixture.cases.find(({ id }) => id === "privacy_rejection_or_failure");
  if (!sameValue(privacy?.server_statuses, ["privacy_rejected", "anonymizer_unavailable"])) {
    errors.push("privacy.server_statuses");
  }
  const submitted = fixture.cases.find(({ id }) => id === "successful_submission_receipt");
  if (!sameValue(submitted?.server_statuses, ["submitted"])) {
    errors.push("submitted.server_statuses");
  }

  const referencedNodes = [...new Set(fixture.cases.flatMap(({ contract_nodes }) => contract_nodes))].sort();
  if (!sameValue(referencedNodes, Object.keys(contractNodes).sort())) errors.push("contract_node_coverage");
  return errors;
}

function validateModule(source: string, fixture: ConversationFixture): string[] {
  const errors: string[] = [];
  const sections = sectionMap(source);
  if (!sections.get("Mandatory instruction")?.includes(mandatoryInstructions)) {
    errors.push("mandatory_instruction_scope");
  }
  if (!sections.get("User-facing shell")?.includes(fixture.display_shell)) {
    errors.push("display_shell_scope");
  }

  for (const node of new Set(fixture.cases.flatMap(({ contract_nodes }) => contract_nodes))) {
    const contract = contractNodes[node];
    if (!contract || !sections.get(contract.section)?.includes(contract.text)) {
      errors.push(`contract_node:${node}`);
    }
  }

  const receiptSection = sections.get("Truthful receipts") ?? "";
  for (const [status, receipt] of Object.entries(fixture.status_receipts)) {
    if (!receiptSection.includes(`\`${status}\` -> \`${receipt}\``)) {
      errors.push(`status_receipt:${status}`);
    }
  }
  for (const contradiction of contradictoryInstructions) {
    if (source.includes(contradiction)) errors.push(`contradiction:${contradiction}`);
  }
  if (requiresUniversalConsentReask(source)) errors.push("universal_consent_reask");
  if (/https?:\/\//u.test(source)) errors.push("private_or_unneeded_url");
  return errors;
}

function requiresUniversalConsentReask(source: string): boolean {
  return source
    .split(/\n\s*\n|(?<=[.!?])\s+/u)
    .map((part) => part.replace(/\s+/gu, " ").trim().toLowerCase())
    .filter((part) => !/(?:do not|without|never)\s+(?:display|repeat|show)|\bwith no standing consent\b/u.test(part))
    .some((part) => {
      const namesConsentUi = /(?:\b(?:full|approved|exact|this)\s+(?:approved\s+)?shell\b|\bconsent question\b|\bquestion and (?:reply )?options\b)/u.test(part);
      const makesUniversal = /(?:\bbefore\s+(?:any|every|each)\s+(?:action\s+)?(?:call|submission)\b|\balways\b.*\bbefore\b.*\b(?:action|call|submission)\b|\bbefore\s+calling\s+the\s+action\b|\bbefore\s+any\s+submission\b)/u.test(part);
      return namesConsentUi && makesUniversal;
    });
}

function caseById(fixture: ConversationFixture, id: string): ConversationCase {
  const found = fixture.cases.find((conversationCase) => conversationCase.id === id);
  if (!found) throw new Error(`Missing fixture case: ${id}`);
  return found;
}

describe("Custom GPT lesson conversation contract", () => {
  it("validates every fixture node and every complete expected outcome", async () => {
    const fixture = await conversationFixture();

    expect(validateFixture(fixture)).toEqual([]);
  });

  it("maps the complete fixture contract into its intended module sections", async () => {
    const fixture = await conversationFixture();
    const module = await lessonModule();

    expect(validateModule(module, fixture)).toEqual([]);
  });

  it("keeps the approved display shell ordered before the exact consent options", async () => {
    const fixture = await conversationFixture();
    const shell = sectionMap(await lessonModule()).get("User-facing shell") ?? "";

    expect(fixture.display_shell).toBe(expectedDisplayShell);
    expect(shell).toContain(expectedDisplayShell);
  });

  it("uses the approved submitted receipt and a separate occurrence-count sentence", async () => {
    const fixture = await conversationFixture();
    const submitted = caseById(fixture, "successful_submission_receipt");

    expect(fixture.status_receipts).toEqual(expectedStatusReceipts);
    expect(submitted.expected.receipts).toEqual([
      "Anonymized lesson submitted as candidate ARL-0042. It requires review before changing AskRigor. Anonymous occurrence count: 1.",
    ]);
  });

  it("clears pending state after initial and later conversation-scope submissions", async () => {
    const fixture = await conversationFixture();

    expect(caseById(fixture, "yes_always_first_and_later").expected).toEqual(
      expectedOutcomes.yes_always_first_and_later
    );
    expect(caseById(fixture, "platform_confirmation_remains").expected).toEqual(
      expectedOutcomes.platform_confirmation_remains
    );
  });

  it("rejects mutations to any reviewed fixture outcome", async () => {
    const fixture = await conversationFixture();
    const mutations: Array<[string, string, keyof ExpectedOutcome, unknown]> = [
      ["yes once call", "yes_once", "action_calls", []],
      ["No call", "no_silence_ambiguity_or_topic_change", "action_calls", [
        { operation: "submit_lesson_candidate", consent_scope: "once" },
      ]],
      ["conversation pending clear", "yes_always_first_and_later", "pending_candidate_after", true],
      ["success privacy", "successful_submission_receipt", "private_url_displayed", true],
      ["platform confirmation", "platform_confirmation_remains", "platform_confirmation_suppressed", true],
      ["exact receipt", "successful_submission_receipt", "receipts", ["Lesson submitted."]],
    ];

    for (const [name, id, key, value] of mutations) {
      const mutated = structuredClone(fixture);
      (caseById(mutated, id).expected as unknown as Record<string, unknown>)[key] = value;
      expect(validateFixture(mutated), name).not.toEqual([]);
    }
  });

  it("rejects unexpected fixture nodes instead of silently ignoring them", async () => {
    const fixture = await conversationFixture();
    const unexpectedTopLevel = structuredClone(fixture) as unknown as Record<string, unknown>;
    unexpectedTopLevel.conversation_id = "must-not-exist";
    const unexpectedCase = structuredClone(fixture);
    (caseById(unexpectedCase, "yes_once") as unknown as Record<string, unknown>).raw_chat = "must-not-exist";

    expect(validateFixture(unexpectedTopLevel as unknown as ConversationFixture))
      .toContain("fixture_keys");
    expect(validateFixture(unexpectedCase)).toContain("yes_once.case_keys");
  });

  it("rejects unknown expected fields and unknown contract-node entries", async () => {
    const fixture = await conversationFixture();
    const unexpectedExpected = structuredClone(fixture);
    (caseById(unexpectedExpected, "yes_once").expected as unknown as Record<string, unknown>)
      .conversation_id = "must-not-exist";
    const unexpectedContractNode = structuredClone(fixture);
    caseById(unexpectedContractNode, "yes_once").contract_nodes.push("state.unknown");

    expect(validateFixture(unexpectedExpected)).toContain("yes_once.expected_keys");
    expect(validateFixture(unexpectedContractNode)).toContain("yes_once.unknown_node:state.unknown");
  });

  it("rejects misplaced required copy and contradictory instructions", async () => {
    const fixture = await conversationFixture();
    const module = await lessonModule();
    const scopedText = contractNodes["state.yes_once"]!;
    const misplaced = module.replace(scopedText.text, "") + `\n${scopedText.text}\n`;

    expect(validateModule(misplaced, fixture)).toContain("contract_node:state.yes_once");
    for (const contradiction of contradictoryInstructions) {
      expect(validateModule(`${module}\n${contradiction}\n`, fixture), contradiction)
        .toContain(`contradiction:${contradiction}`);
    }
  });

  it("rejects any instruction that universally re-asks consent before Action calls", async () => {
    const fixture = await conversationFixture();
    const module = await lessonModule();

    expect(validateModule(module, fixture)).not.toContain("universal_consent_reask");
    for (const mutation of universalConsentReaskMutations) {
      expect(validateModule(`${module}\n${mutation}\n`, fixture), mutation)
        .toContain("universal_consent_reask");
    }
  });

  it("rejects the superseded success copy even when other receipt text remains", async () => {
    const fixture = await conversationFixture();
    const module = await lessonModule();
    const mutated = module.replace(
      expectedStatusReceipts.submitted,
      "Lesson submitted for private review as {candidate_id} (anonymous occurrence {occurrence_count})."
    );

    expect(validateModule(mutated, fixture)).toContain("status_receipt:submitted");
  });
});
