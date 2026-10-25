import { describe, expect, it } from "vitest";
import {
  advanceCheckRound,
  CHECK_ROUND_LIMIT,
  roundBinding,
  STOPPED_CHECK_REPORT_OFFER,
  stoppedCheckBugReport,
  type CheckStep
} from "../apps/research-mcp/src/check-rounds.js";
import {
  communitySkipCaveat,
  finalizeResearch,
  UNCHECKED_LINE_START,
  type FinalizeResearchInput,
  type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { uncheckedAnswerInstructions } from "../apps/research-mcp/src/register-tools.js";

// Owner answer 172a (2026-10-24): at most ten rounds of the final check in a turn, and a step that comes back
// unchanged three rounds running is stuck, so the check stops asking for it and counts it as a reason.
const SECRET = "round-limit-test-secret-0123456789012345678901234";
const START = new Date("2026-10-24T12:00:00.000Z");
const at = (minutes: number) => () => new Date(START.getTime() + minutes * 60_000);

// The final-check panel's fixture, which passes with one limit; each test adds what keeps it from passing.
function fixture(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  return {
    receipts: [issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET, now: at(0) })],
    research_target: "Synthetic round-limit fixture", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the round limit.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the round limit." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth). Try it.\n\n" +
      communitySkipCaveat("Synthetic fixture isolates the round limit."),
    ...overrides
  };
}
// A test that names an observation the call does not give: one declaration step, whose text names the index.
const repeating = (index: number) => ({ quote: "Try it.", repeats: index, blinded: true });
const step = (index: number, test = 0) =>
  `proposed_tests[${test}].repeats names user_observations[${index}], which this call does not give.`;
const check = (input: unknown, minutes = 0) => finalizeResearch(input, { secret: SECRET, now: at(minutes) });

describe("the final check's rounds in a turn (owner answer 172a)", () => {
  it("passes without a round when nothing is open", () => {
    const passed = check(fixture());
    expect(passed.status).toBe("ready_with_limits");
    expect(passed.round).toBeUndefined();
    expect(passed.round_token).toBeUndefined();
  });

  it("numbers each round with a signed token and stops at the tenth with the reasons", () => {
    let token: string | undefined;
    let result: FinalizeResearchOutput | undefined;
    for (let round = 1; round <= CHECK_ROUND_LIMIT; round += 1) {
      // A different step each round, so none is stuck and only the limit stops the check.
      result = check(fixture({ proposed_tests: [repeating(round)], ...(token === undefined ? {} : { round_token: token }) }));
      expect(result.round).toEqual({ number: round, limit: CHECK_ROUND_LIMIT });
      if (round < CHECK_ROUND_LIMIT) {
        expect(result.status).toBe("not_ready");
        expect(result.next_steps).toEqual([step(round)]);
        expect(result.round_token).toMatch(/^cr1~/u);
        token = result.round_token;
      }
    }
    expect(result!.status).toBe("stopped");
    expect(result!.next_steps).toEqual([]);
    expect(result!.next_step_kinds).toEqual([]);
    expect(result!.round_token).toBeUndefined();
    expect(result!.stopped).toEqual({
      reason: "limit",
      could_not: [{ kind: "declaration", step: step(CHECK_ROUND_LIMIT) }],
      next_turn: [],
      short_reason: "some of its statements were not checked"
    });
    expect(result!.unchecked_line).toBe(`${UNCHECKED_LINE_START}: some of its statements were not checked.`);
    expect(result!.bug_report).toBe("AskRigor's final check reached its limit of 10 rounds without passing, with steps " +
      "about the answer's declarations still open.");
    // Unchecked: no finalization receipt, so no card is saved, and the next turn knows the answer went out unchecked.
    expect(result!.finalization_receipt).toBeUndefined();
    expect(result!.carried).toMatchObject({ last_status: "not_ready", open_kinds: ["declaration"] });
  });

  it("stops asking for a step that comes back unchanged three rounds running", () => {
    const first = check(fixture({ proposed_tests: [repeating(9), repeating(20)] }));
    expect(first.next_steps).toEqual([step(9), step(20, 1)]);
    const second = check(fixture({ proposed_tests: [repeating(9), repeating(21)], round_token: first.round_token }));
    expect(second.next_steps).toEqual([step(9), step(21, 1)]);
    const third = check(fixture({ proposed_tests: [repeating(9), repeating(22)], round_token: second.round_token }));
    expect(third.status).toBe("not_ready");
    expect(third.round).toEqual({ number: 3, limit: CHECK_ROUND_LIMIT });
    expect(third.next_steps).toEqual([step(22, 1)]);
    expect(third.stuck_steps).toEqual([{ kind: "declaration", step: step(9) }]);
    // Once stuck, the step stays out of next_steps for the rest of the turn.
    const fourth = check(fixture({ proposed_tests: [repeating(9), repeating(23)], round_token: third.round_token }));
    expect(fourth.next_steps).toEqual([step(23, 1)]);
    expect(fourth.stuck_steps).toEqual([{ kind: "declaration", step: step(9) }]);
    // The model fixes the other one: only the stuck step is left, so the check stops.
    const fifth = check(fixture({ proposed_tests: [repeating(9)], round_token: fourth.round_token }));
    expect(fifth.status).toBe("stopped");
    expect(fifth.stopped).toMatchObject({ reason: "stuck", could_not: [{ kind: "declaration", step: step(9) }], next_turn: [] });
    expect(fifth.bug_report).toBe("AskRigor's final check stopped without passing after 5 rounds, because steps about " +
      "the answer's declarations came back unchanged 3 rounds running.");
  });

  it("stops at the third unchanged round when that step is all that is left", () => {
    let token: string | undefined;
    const statuses: string[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const result = check(fixture({ proposed_tests: [repeating(9)], ...(token === undefined ? {} : { round_token: token }) }));
      statuses.push(result.status);
      token = result.round_token;
    }
    expect(statuses).toEqual(["not_ready", "not_ready", "stopped"]);
  });

  it("starts again at round 1 without a token, with an altered one, in a later turn, for another target or after two hours", () => {
    const first = check(fixture({ proposed_tests: [repeating(1)] }));
    const token = first.round_token!;
    const roundOf = (result: FinalizeResearchOutput) => result.round?.number;
    expect(roundOf(check(fixture({ proposed_tests: [repeating(2)], round_token: token }), 5))).toBe(2);
    expect(roundOf(check(fixture({ proposed_tests: [repeating(2)] }), 5))).toBe(1);
    const altered = token.slice(0, -3) + (token.at(-3) === "a" ? "b" : "a") + token.slice(-2);
    expect(roundOf(check(fixture({ proposed_tests: [repeating(2)], round_token: altered }), 5))).toBe(1);
    // The next turn passes this turn's carried state, so this turn's rounds do not count there.
    expect(roundOf(check(fixture({ proposed_tests: [repeating(2)], round_token: token, carried_state: first.carry_forward }), 5)))
      .toBe(1);
    expect(roundOf(check(fixture({ proposed_tests: [repeating(2)], round_token: token, research_target: "Another target" }), 5)))
      .toBe(1);
    expect(roundOf(check(fixture({ proposed_tests: [repeating(2)], round_token: token }), 121))).toBe(1);
  });

  it("counts inputs that fail as rounds, their list as one step", () => {
    const invalid = { ...fixture(), receipts: "not a list" };
    const first = check(invalid);
    expect(first.status).toBe("not_ready");
    expect(first.round).toEqual({ number: 1, limit: CHECK_ROUND_LIMIT });
    const second = check({ ...invalid, round_token: first.round_token });
    expect(second.round?.number).toBe(2);
    const third = check({ ...invalid, round_token: second.round_token });
    expect(third.status).toBe("stopped");
    expect(third.next_steps).toEqual([]);
    expect(third.stopped?.reason).toBe("stuck");
    expect(third.stopped?.short_reason).toBe("the check could not run");
    expect(third.stopped?.could_not.map(({ kind }) => kind)).toEqual(first.next_steps.map(() => "input_invalid"));
    expect(third.bug_report).toBe("AskRigor's final check stopped without passing after 3 rounds, because steps about " +
      "the call's inputs came back unchanged 3 rounds running.");
    // A token from a valid round of the same turn carries on into an invalid one.
    const valid = check(fixture({ proposed_tests: [repeating(1)] }));
    expect(check({ ...invalid, round_token: valid.round_token }).round?.number).toBe(2);
  });

  it("tells the model to stop, show the bug report and ask, and say how the next turn continues", () => {
    let token: string | undefined;
    let result: FinalizeResearchOutput | undefined;
    for (let round = 1; round <= 3; round += 1) {
      result = check(fixture({ proposed_tests: [repeating(9)], ...(token === undefined ? {} : { round_token: token }) }));
      token = result.round_token;
    }
    const text = uncheckedAnswerInstructions(result!);
    expect(text).toContain("The final check stopped: the only steps left came back unchanged 3 rounds running. This is " +
      "the turn's final result: do not call finalize_research again in this turn, and give the answer now.");
    expect(text).toContain(`what AskRigor could not do (stopped.could_not), then a short general bug report with no personal details, such as ${JSON.stringify(result!.bug_report)}, and asks, as written: "${STOPPED_CHECK_REPORT_OFFER}"`);
    expect(text).not.toContain("what the next turn can do");
    expect(text.endsWith(result!.unchecked_line!)).toBe(true);
    // A round that is still open names its stuck steps and the steps the next turn could do.
    const open = check(fixture({ proposed_tests: [repeating(1)] }));
    const openText = uncheckedAnswerInstructions(open);
    expect(openText).not.toContain("The final check stopped");
    expect(openText).toContain("what the next turn can do (the steps still open) and how to continue");
    expect(openText).not.toContain(STOPPED_CHECK_REPORT_OFFER);
  });
});

describe("what a stopped check could not do and what the next turn can", () => {
  const options = { secret: SECRET, bind: roundBinding(undefined, "target"), now: START };
  const research: CheckStep = { kind: "research", text: "Read the study's full text." };
  const declaration: CheckStep = { kind: "declaration", text: "Give named_target." };
  const toolList: CheckStep = { kind: "tool_list", text: "Refresh the app's tool list." };

  it("leaves research and the tool list to the next turn at the limit, and the rest to a bug report", () => {
    let token: string | undefined;
    let outcome = advanceCheckRound([research], { ...options, token });
    for (let round = 2; round <= CHECK_ROUND_LIMIT; round += 1) {
      expect(outcome.status).toBe("open");
      token = outcome.status === "open" ? outcome.token : undefined;
      // Each round's text differs, so nothing is stuck.
      outcome = advanceCheckRound([
        { ...research, text: `Read study ${round}.` },
        { ...declaration, text: `Give declaration ${round}.` },
        { ...toolList, text: `Refresh ${round}.` }
      ], { ...options, token });
    }
    expect(outcome).toMatchObject({
      status: "stopped", round: CHECK_ROUND_LIMIT, reason: "limit",
      couldNot: [{ kind: "declaration" }],
      nextTurn: [{ kind: "research" }, { kind: "tool_list" }]
    });
  });

  it("counts research that keeps coming back as failing, but leaves a stuck tool list to the user", () => {
    let token: string | undefined;
    let outcome = advanceCheckRound([research, toolList], { ...options, token });
    for (let round = 2; round <= 3; round += 1) {
      token = outcome.status === "open" ? outcome.token : undefined;
      outcome = advanceCheckRound([research, toolList], { ...options, token });
    }
    expect(outcome).toMatchObject({ status: "stopped", reason: "stuck", couldNot: [research], nextTurn: [toolList] });
    expect(outcome.status === "stopped" ? stoppedCheckBugReport(outcome) : undefined)
      .toBe("AskRigor's final check stopped without passing after 3 rounds, because steps about research came back " +
        "unchanged 3 rounds running.");
  });

  it("gives no bug report when everything left is for the next turn", () => {
    let token: string | undefined;
    let outcome = advanceCheckRound([toolList], { ...options, token });
    for (let round = 2; round <= 3; round += 1) {
      token = outcome.status === "open" ? outcome.token : undefined;
      outcome = advanceCheckRound([toolList], { ...options, token });
    }
    expect(outcome).toMatchObject({ status: "stopped", couldNot: [], nextTurn: [toolList] });
    expect(outcome.status === "stopped" ? stoppedCheckBugReport(outcome) : "open").toBeUndefined();
  });
});
