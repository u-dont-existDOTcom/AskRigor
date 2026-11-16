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

import { CALLER_READINGS_NOTE } from "../apps/research-mcp/src/final-check-messages.js";
import { aiReadingsMarker, laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  CALLER_READINGS_CHECK_LINE,
  SECOND_READING_LEFT_TO_CALLER,
  finalizeResearch,
  finalizeResearchInputSchema,
  type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import type { ResearchReviewer } from "../apps/research-mcp/src/research-reviewer.js";
import type { SecondReader } from "../apps/research-mcp/src/second-reader.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { withSourceReading } from "./helpers/source-reading.js";

// Owner answer 310a (15 Nov 2026): a finalize_research call marked later_inputs.ai_readings "caller" leaves the check's
// AI readings (the review of the draft, the second reading and the meaning judge) to the app that sends it. The owner's
// runner makes them on the owner's Claude plan; a dev account's check otherwise pays for the review on every call that
// carries the answer. The owner, the same day: "this should be for all accounts". The rule checks are unchanged. The
// readers here answer from memory; no test reaches the network. The meaning judge and the save are in
// findings-save.test.ts.

const SECRET = "caller-readings-final-check-secret-0123456789";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-caller-readings-identity-secret-of-32-bytes");
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};
const TARGET = "Whether zinc lozenges shorten colds in adults";
const DOI = "10.1000/zinc-lozenge-trial";
const ANSWER = "In two trials, zinc lozenges shortened colds in adults by about a day.";
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the readings." };
const audit = () => issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields", t: 2_000 },
  { secret: SECRET });
/** A final check the server passes, with one audited study; built after the receipts' secret is set. */
const request = (overrides: Partial<FinalizeResearchInput> = {}): Record<string, unknown> =>
  withSourceReading(withCommunitySkip({
    receipts: [audit()],
    research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the readings.",
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the readings." },
    key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [],
    safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: `[Trial](https://doi.org/${DOI}) was read in full.\n\n${ANSWER}`,
    ...overrides,
  } as FinalizeResearchInput)) as unknown as Record<string, unknown>;
/** The same call with one more later input beside the fixture's own. */
const withLater = (input: Record<string, unknown>, later: Record<string, unknown>): Record<string, unknown> =>
  ({ ...input, later_inputs: { ...(input.later_inputs as Record<string, unknown> | undefined), ...later } });
const marked = (input = request()) => withLater(input, { ai_readings: "caller" });

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

/** finalize_research of a server registered with these options, called as a signed-in subject. */
function finalizeTool(options: RegisterToolsOptions) {
  let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
  registerTools({
    registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
      if (registered === "finalize_research") handler = execute;
    },
  } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", findingsLibrary: false, ...options });
  return async (input: Record<string, unknown>, subject = "auth0|dev"): Promise<Result> => await handler!(
    // The runtime input takes a later input at the top level too (later-inputs.ts), as an older app may send it.
    finalizeResearchInputSchema.extend({ later_inputs: z.record(z.string(), z.unknown()).optional(),
      ai_readings: z.unknown().optional() }).parse(input), {
      authInfo: { token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } },
    }) as Result;
}

/** A reviewer and a second reader that answer from memory and count their calls. */
function readers() {
  const calls = { review: 0, second: 0 };
  const researchReviewer: ResearchReviewer = {
    enabled: true, dailyCapUsd: 3, accountDailyCalls: 10,
    review: async () => {
      calls.review += 1;
      return { reviewing: { status: "reviewed", review: { gaps: [], searches: 1 } }, costUsd: 0.11, milliseconds: 10 };
    },
  };
  const secondReader: SecondReader = {
    enabled: true,
    readAnswer: async () => {
      calls.second += 1;
      return { status: "ran", findings: [] };
    },
  };
  return { calls, researchReviewer, secondReader };
}

describe("a final check whose AI readings its caller makes (owner answer 310a)", () => {
  it("makes no review and no second reading for a marked call, on a dev account and on any other", async () => {
    const service = await accounts();
    const { calls, researchReviewer, secondReader } = readers();
    const finalize = finalizeTool({ researchContributorAccessService: service, researchReviewer, secondReader });
    // Unmarked: a dev account's check is reviewed and read a second time; another account's is read a second time.
    const dev = await finalize(request());
    expect(dev.structuredContent).toMatchObject({ status: "ready_with_limits", second_reading: { status: "ran" } });
    expect(calls).toEqual({ review: 1, second: 1 });
    await finalize(request(), "auth0|person");
    expect(calls).toEqual({ review: 1, second: 2 });
    // Marked: neither reader is called, for either account, and the result says who makes the readings.
    for (const subject of ["auth0|dev", "auth0|person"]) {
      const result = await finalize(marked(), subject);
      expect(result.isError, subject).not.toBe(true);
      expect(result.structuredContent, subject).toMatchObject({
        status: "ready_with_limits",
        second_reading: { status: "skipped", reason: SECOND_READING_LEFT_TO_CALLER, findings: 0, open: 0, dismissed: 0 },
        ai_readings: { by: "caller", declared: { safety_question: false, safety_claims: 0, harm_screen: 0,
          scale_results: 0, binary_results: 0, absence_claims: 0, key_terms: 0, recommendations: 0 } },
      });
      expect(notesOf(result), subject).toContain(CALLER_READINGS_NOTE);
      expect(text(result), subject).toContain(`- ${CALLER_READINGS_NOTE}`);
      expect(text(result), subject).not.toContain("AskRigor's own review");
    }
    expect(calls).toEqual({ review: 1, second: 2 });
    expect(SECOND_READING_LEFT_TO_CALLER).toBe("left_to_caller");
  });

  it("runs the same rule checks, and says in the check line and the receipt who made the readings", async () => {
    const service = await accounts();
    const { researchReviewer, secondReader } = readers();
    const finalize = finalizeTool({ researchContributorAccessService: service, researchReviewer, secondReader });
    const plain = (await finalize(request())).structuredContent!;
    const caller = (await finalize(marked())).structuredContent!;
    // Everything the rules decide is the same.
    for (const part of ["status", "next_steps", "next_step_kinds", "receipts_verified", "receipts_rejected", "limits",
      "caveats", "must_report", "answer_checked", "sources", "community"]) {
      expect(caller[part], part).toEqual(plain[part]);
    }
    expect(plain.check_line).toBe("Checked with AskRigor's final check, with the limits it found.");
    expect(caller.check_line).toBe("Checked with AskRigor's final check, with the limits it found. Its rule checks " +
      "ran on AskRigor's server; the app that ran this research made the check's AI readings.");
    expect(caller.check_line).toBe(`${plain.check_line as string}${CALLER_READINGS_CHECK_LINE}`);
    // The receipt signs the mark, and no saving-off mark: such a check's card is saved (owner answer 311a).
    const claims = (receipt: unknown) => verifyResearchReceipt(receipt as string, { secret: SECRET }).claims!;
    expect(claims(caller.finalization_receipt)).toMatchObject({ ar: "caller" });
    expect(claims(plain.finalization_receipt)).not.toHaveProperty("ar");
    expect(claims(caller.finalization_receipt)).not.toHaveProperty("fs");
    expect(claims(plain.finalization_receipt)).not.toHaveProperty("fs");
    // A check that has not passed is marked the same way, with no check line and no receipt.
    const open = await finalize(marked(request({ receipts: [] })));
    expect(open.structuredContent).toMatchObject({ status: "not_ready", ai_readings: { by: "caller" } });
    expect(open.structuredContent).not.toHaveProperty("check_line");
    expect(open.structuredContent).not.toHaveProperty("second_reading");
    expect(open.structuredContent).not.toHaveProperty("finalization_receipt");
    const openPlain = (await finalizeTool({ researchContributorAccessService: service, researchReviewer, secondReader })(
      request({ receipts: [] }))).structuredContent!;
    expect(openPlain.status).toBe("not_ready");
    for (const part of ["next_steps", "next_step_kinds", "receipts_verified", "limits", "caveats", "unchecked_line"]) {
      expect(open.structuredContent![part], part).toEqual(openPlain[part]);
    }
    expect(notesOf(open)).toContain(CALLER_READINGS_NOTE);
    // So is a call the check could not read at all: it says who makes the readings, and counts nothing.
    const { answer_draft: _draft, ...unreadable } = request();
    const refused = await finalize(marked(unreadable));
    expect(refused.structuredContent).toMatchObject({ status: "not_ready", next_step_kinds: ["input_invalid"] });
    expect(refused.structuredContent!.ai_readings).toEqual({ by: "caller" });
    expect(notesOf(refused)).toContain(CALLER_READINGS_NOTE);
    // And one on a server that cannot verify receipts.
    const unsigned = finalizeResearch(marked(), { secret: undefined, aiReadings: "caller" });
    expect(unsigned).toMatchObject({ status: "receipts_unavailable", ai_readings: { by: "caller",
      declared: { safety_question: false, safety_claims: 0 } } });
    expect(finalizeResearch(request(), { secret: undefined })).not.toHaveProperty("ai_readings");
  });

  it("counts what the call declared, since a pass tests only that", async () => {
    const service = await accounts();
    const { researchReviewer, secondReader } = readers();
    const finalize = finalizeTool({ researchContributorAccessService: service, researchReviewer, secondReader });
    const declared = (result: Result) =>
      (result.structuredContent!.ai_readings as { declared: Record<string, unknown> }).declared;
    // One specialized term, declared with the sentence that explains it.
    const sentence = "A lozenge is a tablet that dissolves slowly in the mouth.";
    const withTerm = await finalize(marked(request({
      answer_draft: `[Trial](https://doi.org/${DOI}) was read in full.\n\n${ANSWER} ${sentence}`,
      key_terms: [{ term: "lozenge", explanation: sentence }],
    })));
    expect(withTerm.structuredContent!.status).toBe("ready_with_limits");
    expect(declared(withTerm)).toEqual({ safety_question: false, safety_claims: 0, harm_screen: 0, scale_results: 0,
      binary_results: 0, absence_claims: 0, key_terms: 1, recommendations: 0 });
    // A call that does not say whether the question is about safety reports no safety_question.
    const { safety_question: _left, ...unsaid } = request();
    expect(declared(await finalize(marked(unsaid)))).not.toHaveProperty("safety_question");
  });

  it("reads only the word caller as the mark, and says so for any other value", async () => {
    expect(aiReadingsMarker({ later_inputs: { ai_readings: "caller" } })).toEqual({ caller: true });
    expect(aiReadingsMarker({ later_inputs: { ai_readings: " Caller " } })).toEqual({ caller: true });
    // The three places findings_save is read in: later_inputs, the top level, and later_inputs given as text, which
    // gets a note, since a later input given as text is otherwise dropped.
    expect(aiReadingsMarker({ ai_readings: "caller" })).toEqual({ caller: true });
    expect(aiReadingsMarker({ ai_readings: "CALLER", later_inputs: { ai_readings: "caller" } })).toEqual({ caller: true });
    expect(aiReadingsMarker({ later_inputs: "{\"ai_readings\":\"caller\"}" })).toEqual({ caller: true,
      note: "ai_readings: read as \"caller\" from later_inputs given as text; give later_inputs as an object, with " +
        "ai_readings \"caller\"." });
    for (const raw of [undefined, null, 7, {}, { later_inputs: {} }, { later_inputs: { ai_readings: null } },
      { ai_readings: null }, { later_inputs: "not json" }, { later_inputs: "{\"asked\":\"caller\"}" }]) {
      expect(aiReadingsMarker(raw), JSON.stringify(raw)).toEqual({ caller: false });
    }
    // Two places that disagree are not the mark.
    for (const raw of [{ ai_readings: "caller", later_inputs: { ai_readings: "server" } },
      { ai_readings: "server", later_inputs: { ai_readings: "caller" } }, { ai_readings: true }]) {
      expect(aiReadingsMarker(raw).caller, JSON.stringify(raw)).toBe(false);
      expect(aiReadingsMarker(raw).note, JSON.stringify(raw)).toContain("not read as caller");
    }
    for (const value of [true, "server", "yes", ["caller"], { by: "caller" }, ""]) {
      const read = aiReadingsMarker({ later_inputs: { ai_readings: value } });
      expect(read.caller, JSON.stringify(value)).toBe(false);
      expect(read.note, JSON.stringify(value)).toBe("ai_readings: not read as caller. Only \"caller\" leaves the " +
        "check's AI readings to the app that sends the call; with any other value AskRigor makes its own.");
    }
    expect(laterInputNames("finalize_research")).toContain("ai_readings");
    // Through the tool: another value leaves the readings to AskRigor, with the note.
    const service = await accounts();
    const { calls, researchReviewer, secondReader } = readers();
    const finalize = finalizeTool({ researchContributorAccessService: service, researchReviewer, secondReader });
    const result = await finalize(withLater(request(), { ai_readings: "server" }));
    expect(calls).toEqual({ review: 1, second: 1 });
    expect(result.structuredContent).not.toHaveProperty("ai_readings");
    // A mark at the top level is the mark: a dev account is not charged for a review it left out.
    const top = await finalize({ ...request(), ai_readings: "caller" });
    expect(top.structuredContent).toMatchObject({ status: "ready_with_limits", ai_readings: { by: "caller" } });
    expect(calls).toEqual({ review: 1, second: 1 });
    expect(notesOf(result).some((note) => note.startsWith("ai_readings: not read as caller."))).toBe(true);
    expect(result.structuredContent!.check_line).toBe("Checked with AskRigor's final check, with the limits it found.");
  });
});
