import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";

import { PASSING_NOTES_HEADING } from "../apps/research-mcp/src/final-check-messages.js";
import { finalCheckAsked, laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  FINALIZE_REMINDER, finalizeResearchInputSchema, type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { researchPlanOf, type ResearchPlanner } from "../apps/research-mcp/src/research-planner.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import {
  answerReviewNote,
  type AnswerGap,
  type ResearchReviewer,
  type ResearchReviewerCall,
  type ResearchReviewerSource,
} from "../apps/research-mcp/src/research-reviewer.js";
import { ANSWER_REVIEW_ASKED, ASKED_LIMIT } from "../apps/research-mcp/src/research-steering.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { withSourceReading } from "./helpers/source-reading.js";

// Owner answer 301a (13 Nov 2026): AskRigor's own review of a dev account's draft at the final check, advice only. The
// tools get a reviewer that answers from memory; no test reaches the network.

const SECRET = "research-reviewer-final-check-secret-0123456789";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-research-reviewer-identity-secret-of-32-bytes");
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};
const TARGET = "Whether vitamin D supplements prevent colds in adults";
const DOI = "10.1000/vitamin-d-trial";
const ANSWER = "In three large trials, vitamin D did not prevent colds in adults with normal levels.";
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the review." };
const audit = () => issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields", t: 2_000 },
  { secret: SECRET });
/** A final check the server passes, with one audited study; built after the receipts' secret is set. */
const request = (overrides: Partial<FinalizeResearchInput> = {}): Record<string, unknown> =>
  withSourceReading(withCommunitySkip({
    receipts: [audit()],
    research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the review.",
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the review." },
    key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [],
    safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: `[Trial](https://doi.org/${DOI}) was read in full.\n\n${ANSWER}`,
    ...overrides,
  } as FinalizeResearchInput)) as unknown as Record<string, unknown>;
/** The same call with later_inputs.asked added beside the fixture's own later inputs. */
const withAsked = (input: Record<string, unknown>, asked: unknown): Record<string, unknown> =>
  ({ ...input, later_inputs: { ...(input.later_inputs as Record<string, unknown> | undefined), asked } });

const GAPS: AnswerGap[] = [
  { what: "The draft gives no figure for people low in vitamin D.", next_question: "What about people who are low in it?",
    add: "Give the result for people low in vitamin D from the trials that report it.", kind: "missing" },
  { what: "The first line rules out more than the trials tested.", next_question: "So it does nothing for anyone?",
    add: "Say first what the trials show, then for whom.", kind: "overstated" },
];

type Result = CallToolResult & { structuredContent?: Record<string, unknown> };
const text = (result: Result): string => result.content.map((block) => block.type === "text" ? block.text : "").join("\n");
const notesOf = (result: Result): string[] => (result.structuredContent?.notes as string[] | undefined) ?? [];

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Two free contributor accounts, one listed as a dev account, with the receipts' secret set. */
async function accounts() {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
  for (const subject of ["auth0|dev", "auth0|person"]) await service.acceptFreeContributor(subject, AGREEMENT);
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", researchAccountReference(service.accountKeyForSubject("auth0|dev")));
  return service;
}

/** One tool of a server registered with these options, called as a signed-in subject. */
function tool(name: "finalize_research" | "manage_research_access", options: RegisterToolsOptions) {
  let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
  registerTools({
    registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
      if (registered === name) handler = execute;
    },
  } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", findingsLibrary: false, ...options });
  // finalize_research's published input, later_inputs included (owner answer 189a), as a strict client checks it;
  // manage_research_access's call as the planner's tests send it, its later inputs as they are.
  return async (input: Record<string, unknown>, subject = "auth0|dev"): Promise<Result> => await handler!(
    name === "finalize_research"
      ? finalizeResearchInputSchema.extend({ later_inputs: z.record(z.string(), z.unknown()).optional() }).parse(input)
      : input, {
      authInfo: { token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } },
    }) as Result;
}

/** A reviewer that answers from memory, recording what it was given. */
function memoryReviewer(answer: (source: ResearchReviewerSource) => ResearchReviewerCall["reviewing"] | Promise<
  ResearchReviewerCall["reviewing"]> = () => ({ status: "reviewed", review: { gaps: GAPS, searches: 2 } })) {
  const seen: Array<{ source: ResearchReviewerSource; accountKey: string }> = [];
  const reviewer: ResearchReviewer = {
    enabled: true, dailyCapUsd: 3, accountDailyCalls: 10,
    review: async (source, accountKey) => {
      seen.push({ source, accountKey });
      return { reviewing: await answer(source), costUsd: 0.07, milliseconds: 15 };
    },
  };
  return { reviewer, seen };
}
const OFF: ResearchReviewer = { enabled: false, review: async () => { throw new Error("never called"); } };

/** The parts of a final check's result the review may not change. */
const unchanged = (result: Result) => {
  const { status, next_steps, next_step_kinds, receipts_verified, receipts_rejected, limits, caveats, must_report,
    findings_card, check_line, answer_checked, sources, community, plain_answer } =
    result.structuredContent as Record<string, unknown>;
  return { status, next_steps, next_step_kinds, receipts_verified, receipts_rejected, limits, caveats, must_report,
    findings_card, check_line, answer_checked, sources, community, plain_answer };
};

describe("AskRigor's own review at the final check (owner answer 301a)", () => {
  it("adds its note to a dev account's check and changes nothing else of it, whatever the check's status", async () => {
    const service = await accounts();
    const memory = memoryReviewer();
    const reviewed = tool("finalize_research", { researchContributorAccessService: service, researchReviewer: memory.reviewer });
    const plain = tool("finalize_research", { researchContributorAccessService: service, researchReviewer: OFF });
    const note = answerReviewNote({ reviewing: { status: "reviewed", review: { gaps: GAPS, searches: 2 } } })!;
    // A passing check, and one that does not pass (its key study's receipt left out).
    for (const [input, status] of [[request(), "ready_with_limits"], [request({ receipts: [] }), "not_ready"]] as const) {
      const before = await plain(input);
      const after = await reviewed(input);
      expect(after.isError, status).not.toBe(true);
      expect(unchanged(after), status).toEqual(unchanged(before));
      expect(after.structuredContent?.status).toBe(status);
      // The note comes last among the notes, and the result's words list it under the notes' heading.
      expect(notesOf(after), status).toEqual([...notesOf(before), note]);
      expect(text(after)).toContain(`- ${note}`);
      expect(text(before)).not.toContain("AskRigor's own review");
    }
    // A passing check's notes are introduced by the passing heading.
    const passed = await reviewed(request());
    expect(text(passed)).toContain(`${PASSING_NOTES_HEADING}\n`);
    expect(text(passed).indexOf(`- ${note}`)).toBeGreaterThan(text(passed).indexOf(PASSING_NOTES_HEADING));
    // The review read the research target and the draft as given, for this account, with no words passed on.
    expect(memory.seen[0]).toEqual({ accountKey: service.accountKeyForSubject("auth0|dev"),
      source: { asked: undefined, researchTarget: TARGET, answer: request().answer_draft } });
    expect(memory.seen).toHaveLength(3);
  });

  it("makes no call for another account, nor while it is off", async () => {
    const service = await accounts();
    const memory = memoryReviewer();
    const finalize = tool("finalize_research", { researchContributorAccessService: service, researchReviewer: memory.reviewer });
    const other = await finalize(withAsked(request(), "would vitamin D stop my colds?"), "auth0|person");
    expect(other.structuredContent?.status).toBe("ready_with_limits");
    expect(memory.seen).toHaveLength(0);
    expect(text(other)).not.toContain("AskRigor's own review");
    expect(text(other)).not.toContain("would vitamin D stop my colds?");
    // A dev account with the review off: no call, no note.
    const off = tool("finalize_research", { researchContributorAccessService: service, researchReviewer: OFF });
    expect(text(await off(request()))).not.toContain("AskRigor's own review");
  });

  it("passes the person's words on, as one text or as a list of messages, and reads an unusable value as none", async () => {
    const service = await accounts();
    const memory = memoryReviewer(() => ({ status: "skipped", reason: "given_before" }));
    const finalize = tool("finalize_research", { researchContributorAccessService: service, researchReviewer: memory.reviewer });
    const bare = await finalize(request());
    await finalize(withAsked(request(), "  would vitamin D stop my colds?  "));
    await finalize(withAsked(request(), [" would vitamin D stop my colds? ", "I mean in winter, at 1,000 IU"]));
    expect(memory.seen.slice(1).map(({ source }) => source.asked)).toEqual(["would vitamin D stop my colds?",
      "would vitamin D stop my colds?\n\nI mean in winter, at 1,000 IU"]);
    // Not a text or a list of texts, empty, or longer than the limit in all: the target alone, and no problem, step
    // or note about it.
    for (const asked of [42, [], [""], [{ role: "user", content: "words" }], "x".repeat(ASKED_LIMIT + 1),
      ["x".repeat(ASKED_LIMIT - 10), "y".repeat(20)], null]) {
      memory.seen.length = 0;
      const result = await finalize(withAsked(request(), asked));
      expect(memory.seen.map(({ source }) => source.asked), JSON.stringify(asked).slice(0, 40)).toEqual([undefined]);
      expect(unchanged(result)).toEqual(unchanged(bare));
      expect(notesOf(result)).toEqual(notesOf(bare));
    }
    // The same reading as register_plain_answer's, from later_inputs or else the top level.
    expect(finalCheckAsked({ later_inputs: { asked: ["a", "b"] } })).toBe("a\n\nb");
    expect(finalCheckAsked({ asked: "top level" })).toBe("top level");
    expect(finalCheckAsked({ asked: "top level", later_inputs: { asked: "later" } })).toBe("later");
    expect(finalCheckAsked({ later_inputs: "{\"asked\":\"as text\"}" })).toBeUndefined();
    expect(finalCheckAsked(null)).toBeUndefined();
    expect(laterInputNames("finalize_research")).toContain("asked");
  });

  it("makes no call without a draft", async () => {
    const service = await accounts();
    const memory = memoryReviewer();
    const finalize = tool("finalize_research", { researchContributorAccessService: service, researchReviewer: memory.reviewer });
    const { answer_draft: _draft, ...withoutDraft } = request();
    const result = await finalize(withoutDraft);
    expect(result.structuredContent?.status).toBe("not_ready");
    expect(memory.seen).toHaveLength(0);
    expect(text(result)).not.toContain("AskRigor's own review");
  });

  it("says when the review did not run, adds nothing when it was given before, and never fails the check", async () => {
    const service = await accounts();
    const baseline = await tool("finalize_research", { researchContributorAccessService: service, researchReviewer: OFF })(request());
    for (const [reviewer, note] of [
      [memoryReviewer(() => ({ status: "skipped", reason: "timeout" })).reviewer,
        "AskRigor's own review of this draft did not run (it took too long); the check's result stands."],
      [memoryReviewer(() => ({ status: "skipped", reason: "daily_budget" })).reviewer,
        "AskRigor's own review of this draft did not run (its budget for today is used up); the check's result stands."],
      [memoryReviewer(() => ({ status: "reviewed", review: { gaps: [], searches: 1 } })).reviewer,
        "AskRigor's own review of this draft found nothing this person would have to ask next."],
      [memoryReviewer(() => ({ status: "skipped", reason: "given_before" })).reviewer, undefined],
      [memoryReviewer(() => ({ status: "skipped", reason: "off" })).reviewer, undefined],
      // A review that rejects, or throws before it returns a promise, is a call that failed.
      [{ enabled: true, review: async () => { throw new Error("broken"); } } as ResearchReviewer,
        "AskRigor's own review of this draft did not run (the call failed); the check's result stands."],
      [{ enabled: true, review: () => { throw new Error("broken at once"); } } as ResearchReviewer,
        "AskRigor's own review of this draft did not run (the call failed); the check's result stands."],
    ] as const) {
      const result = await tool("finalize_research", { researchContributorAccessService: service,
        researchReviewer: reviewer })(request());
      expect(result.isError, String(note)).not.toBe(true);
      expect(unchanged(result), String(note)).toEqual(unchanged(baseline));
      expect(notesOf(result), String(note)).toEqual(note === undefined ? notesOf(baseline) : [...notesOf(baseline), note]);
    }
  });

  it("starts the review before the check's other waits and awaits it before the result is returned", async () => {
    const service = await accounts();
    let release: (() => void) | undefined;
    const memory = memoryReviewer(() => new Promise((resolve) => {
      release = () => resolve({ status: "reviewed", review: { gaps: GAPS, searches: 2 } });
    }));
    // The second reading, one of the check's own waits, finds the review already running beside it.
    const reviewsWhenRead: number[] = [];
    const readAnswer = async () => {
      reviewsWhenRead.push(memory.seen.length);
      return { status: "ran" as const, findings: [] };
    };
    const finalize = tool("finalize_research", { researchContributorAccessService: service,
      researchReviewer: memory.reviewer, secondReader: { enabled: true, readAnswer } });
    let settled = false;
    const pending = finalize(request()).then((result) => { settled = true; return result; });
    await vi.waitFor(() => expect(reviewsWhenRead).toEqual([1]));
    // The check has done its own work, and waits for the review.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
    release!();
    const result = await pending;
    expect(notesOf(result).at(-1)).toContain("AskRigor's own review of this draft (advice");
    expect(memory.seen).toHaveLength(1);
  });
});

describe("the registration of a dev account asks for the person's words at the final check, while the review is on", () => {
  const PLAIN = {
    researchTarget: TARGET,
    text: "Vitamin D supplements prevent colds in most adults. Sunlight helps too.",
    claims: ["Vitamin D supplements prevent colds in most adults."],
  };
  const planner = (): ResearchPlanner => ({
    enabled: true, dailyCapUsd: 3, accountDailyCalls: 10,
    plan: async () => ({ planning: { status: "planned", plan: researchPlanOf({
      about: "The question is about vitamin D tablets and colds in adults.", steering_choice: "none",
      tasks: [{ task: "Search the trials of vitamin D against colds", kind: "study_search", could_change: "conclusion" }],
    }, 1)! }, cached: false, costUsd: 0.05, milliseconds: 12 }),
  });

  it("adds the sentence where the planner's texts are, only with the review on and only for a dev account", async () => {
    const service = await accounts();
    const register = { action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: "would vitamin D stop my colds?" } };
    const on = tool("manage_research_access", { researchContributorAccessService: service, researchPlanner: planner(),
      researchReviewer: memoryReviewer().reviewer });
    const registered = await on(register);
    expect(registered.isError, text(registered)).not.toBe(true);
    expect(registered.structuredContent).toMatchObject({ ok: true, research_plan: { source: "askrigor_planning_call" } });
    // Its own text, right after the reminder of the final check (the result's payload follows as text for apps that
    // read only text).
    const reminder = registered.content.findIndex((block) => block.type === "text" && block.text === FINALIZE_REMINDER);
    expect(reminder).toBeGreaterThan(0);
    expect(registered.content[reminder + 1]).toEqual({ type: "text", text: ANSWER_REVIEW_ASKED });
    // The structured content is the planner's as before: the sentence is not in next_step.
    expect(registered.structuredContent?.next_step).not.toContain(ANSWER_REVIEW_ASKED);
    expect(ANSWER_REVIEW_ASKED).toBe("At the final check, give later_inputs.asked again, with any later message of " +
      "theirs about this question added: AskRigor's review of your draft reads them, and AskRigor keeps none of them.");
    // With the planner's call not used, its texts are still there, and so is the sentence.
    const notUsed = tool("manage_research_access", { researchContributorAccessService: service,
      researchPlanner: { ...planner(), plan: async () => ({ planning: { status: "skipped", reason: "timeout" },
        cached: false, costUsd: 0, milliseconds: 0 }) }, researchReviewer: memoryReviewer().reviewer });
    expect(text(await notUsed(register))).toContain(ANSWER_REVIEW_ASKED);
    // Not with the review off, not without the planner's texts, and not for another account.
    for (const [options, subject] of [
      [{ researchPlanner: planner(), researchReviewer: OFF }, "auth0|dev"],
      [{ researchPlanner: { ...planner(), enabled: false }, researchReviewer: memoryReviewer().reviewer }, "auth0|dev"],
      [{ researchPlanner: planner(), researchReviewer: memoryReviewer().reviewer }, "auth0|person"],
    ] as const) {
      const result = await tool("manage_research_access", { researchContributorAccessService: service, ...options })(
        register, subject);
      expect(result.isError, subject).not.toBe(true);
      expect(text(result), subject).not.toContain(ANSWER_REVIEW_ASKED);
      expect(text(result), subject).toContain(FINALIZE_REMINDER);
    }
  });
});
