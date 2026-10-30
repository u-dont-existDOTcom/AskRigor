import { rule } from "../apps/research-mcp/src/check-rules.js";
import { COMPLETE_CHECKS_TIP } from "../apps/research-mcp/src/final-check-messages.js";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  advanceCheckRound,
  CHECK_ROUND_LIMIT,
  ROUND_TOKEN_MAX_CHARACTERS,
  readCheckRound,
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
      communitySkipCaveat("Synthetic fixture isolates the round limit.") + "\n\n" + COMPLETE_CHECKS_TIP,
    ...overrides
  };
}
// A test that names an observation the call does not give: one declaration step, whose text names the index.
const repeating = (index: number) => ({
  quote: `30 of 100 versus 10 of 100 at 12 weeks, NNT ${index + 100}.`,
  outcome: "response", better: "more" as const, option: "drug", option_events: 30, option_total: 100,
  comparator: "placebo", comparator_events: 10, comparator_total: 100, follow_up: "12 weeks", nnt: index + 100
});
const step = (index: number, test = 0) =>
  `binary_results[${test}] gives nnt ${index + 100}, but by its counts 1 divided by the difference in rates is 5.0, which rounds up to 5: give the reciprocal rounded up, recomputed from the groups' counts the answer uses, or correct the counts.`;
const check = (input: unknown, minutes = 0) => finalizeResearch(input, { secret: SECRET, now: at(minutes) });

describe("the final check's rounds in a turn (owner answer 172a)", () => {
  it("q81: a pass returns this turn’s round and a token for rechecks", () => {
    const passed = check(fixture());
    expect(passed.status).toBe("ready_with_limits");
    expect(passed.round).toEqual({ number: 1, limit: CHECK_ROUND_LIMIT });
    expect(passed.round_token).toMatch(/^cr2~/u);
    const recheck = check(fixture({ carried_state: passed.carry_forward, round_token: passed.round_token }));
    expect(recheck.status).toBe("ready_with_limits");
    expect(recheck.round).toEqual({ number: 1, limit: CHECK_ROUND_LIMIT });
    expect(recheck.carried!.turn).toBe(passed.carried!.turn);
  });

  it("numbers each round with a signed token and stops at the tenth with the reasons", () => {
    let token: string | undefined;
    let result: FinalizeResearchOutput | undefined;
    for (let round = 1; round <= CHECK_ROUND_LIMIT; round += 1) {
      // A different step each round, so none is stuck and only the limit stops the check.
      result = check(fixture({ binary_results: [repeating(round)], ...(token === undefined ? {} : { round_token: token }) }));
      expect(result.round).toEqual({ number: round, limit: CHECK_ROUND_LIMIT });
      if (round < CHECK_ROUND_LIMIT) {
        expect(result.status).toBe("not_ready");
        expect(result.next_steps).toEqual([step(round)]);
        expect(result.round_token).toMatch(/^cr2~/u);
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
    expect(result!.bug_report).toBe("AskRigor's final check stopped at round 10 with this rule still unmet: " + step(10).replace("gives nnt", "gives …").replace("is 5.0", "is …"));
    // Unchecked: no finalization receipt, so no card is saved, and the next turn knows the answer went out unchecked.
    expect(result!.finalization_receipt).toBeUndefined();
    expect(result!.carried).toMatchObject({ last_status: "not_ready", open_kinds: ["declaration"] });
  });

  it("stops asking for a step that comes back unchanged three rounds running", () => {
    const first = check(fixture({ binary_results: [repeating(9), repeating(20)] }));
    expect(first.next_steps).toEqual([step(9), step(20, 1)]);
    const second = check(fixture({ binary_results: [repeating(9), repeating(21)], round_token: first.round_token }));
    expect(second.next_steps).toEqual([step(9), step(21, 1)]);
    const third = check(fixture({ binary_results: [repeating(9), repeating(22)], round_token: second.round_token }));
    expect(third.status).toBe("not_ready");
    expect(third.round).toEqual({ number: 3, limit: CHECK_ROUND_LIMIT });
    expect(third.next_steps).toEqual([step(22, 1)]);
    expect(third.stuck_steps).toEqual([{ kind: "declaration", step: step(9) }]);
    // Once stuck, the step stays out of next_steps for the rest of the turn.
    const fourth = check(fixture({ binary_results: [repeating(9), repeating(23)], round_token: third.round_token }));
    expect(fourth.next_steps).toEqual([step(23, 1)]);
    expect(fourth.stuck_steps).toEqual([{ kind: "declaration", step: step(9) }]);
    // The model fixes the other one: only the stuck step is left, so the check stops.
    const fifth = check(fixture({ binary_results: [repeating(9)], round_token: fourth.round_token }));
    expect(fifth.status).toBe("stopped");
    expect(fifth.stopped).toMatchObject({ reason: "stuck", could_not: [{ kind: "declaration", step: step(9) }], next_turn: [] });
    expect(fifth.check_report?.could_not[0]?.consecutive_rounds).toBe(5);
    expect(fifth.bug_report).toBe("AskRigor's final check stopped at round 5 with this rule still unmet: " + step(9).replace("gives nnt", "gives …").replace("is 5.0", "is …"));
  });

  it("s360-studies: a real stuck step still stops after three unchanged rounds", () => {
    let token: string | undefined;
    const statuses: string[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const result = check(fixture({ binary_results: [repeating(9)], ...(token === undefined ? {} : { round_token: token }) }));
      statuses.push(result.status);
      token = result.round_token;
    }
    expect(statuses).toEqual(["not_ready", "not_ready", "stopped"]);
  });

  it("starts again at round 1 without a token, with an altered one, in a later turn, for another target or after two hours", () => {
    const first = check(fixture({ binary_results: [repeating(1)] }));
    const token = first.round_token!;
    const roundOf = (result: FinalizeResearchOutput) => result.round?.number;
    expect(roundOf(check(fixture({ binary_results: [repeating(2)], round_token: token }), 5))).toBe(2);
    expect(roundOf(check(fixture({ binary_results: [repeating(2)] }), 5))).toBe(1);
    const altered = token.slice(0, -3) + (token.at(-3) === "a" ? "b" : "a") + token.slice(-2);
    expect(roundOf(check(fixture({ binary_results: [repeating(2)], round_token: altered }), 5))).toBe(1);
    // Passing the returned state and token continues this turn; a later turn leaves the token out.
    expect(roundOf(check(fixture({ binary_results: [repeating(2)], round_token: token, carried_state: first.carry_forward }), 5)))
      .toBe(2);
    expect(roundOf(check(fixture({ binary_results: [repeating(2)], carried_state: first.carry_forward }), 5))).toBe(1);
    expect(roundOf(check(fixture({ binary_results: [repeating(2)], round_token: token, research_target: "Another target" }), 5)))
      .toBe(1);
    expect(roundOf(check(fixture({ binary_results: [repeating(2)], round_token: token }), 121))).toBe(1);
  });

  it("keeps counting to ten while each call passes the new carried state and round token", () => {
    let carriedState = check(fixture()).carry_forward;
    expect(carriedState).toBeDefined();
    let token: string | undefined;
    for (let round = 1; round <= CHECK_ROUND_LIMIT; round += 1) {
      const result = check(fixture({ carried_state: carriedState, round_token: token, binary_results: [repeating(round)] }), round);
      expect(result.round).toEqual({ number: round, limit: CHECK_ROUND_LIMIT });
      expect(result.status).toBe(round < CHECK_ROUND_LIMIT ? "not_ready" : "stopped");
      expect(result.carry_forward).toBeDefined();
      expect(result.carry_forward).not.toBe(carriedState);
      if (round < CHECK_ROUND_LIMIT) expect(result.round_token).toBeDefined();
      else {
        expect(result.round_token).toBeUndefined();
        expect(result.next_steps).toEqual([]);
        expect(result.stopped?.reason).toBe("limit");
      }
      carriedState = result.carry_forward;
      token = result.round_token;
    }
    expect(check(fixture({ carried_state: carriedState, binary_results: [repeating(11)] }), 11).round?.number).toBe(1);
  });

  it("keeps the o354 continue sequence in one turn when carried state begins at the fourth call", () => {
    let previous: FinalizeResearchOutput | undefined;
    const rounds: number[] = [];
    const turns: string[] = [];
    // All six calls: three without state, then three with the preceding result's state.
    for (let call = 1; call <= 6; call += 1) {
      const result = check(fixture({
        binary_results: [repeating(call)], round_token: previous?.round_token,
        ...(call <= 3 ? {} : { carried_state: previous?.carry_forward })
      }), call);
      rounds.push(result.round!.number);
      turns.push(result.carried!.turn!);
      expect(result.previous_check).toBeUndefined();
      expect(result.carried!.first_turn).toBe(true);
      previous = result;
    }
    expect(rounds).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(turns).size).toBe(1);
  });

  it("keeps q79's turn through invalid inputs and omitted carried state", () => {
    const invalid = { ...fixture(), receipts: "not a list" };
    const first = check(invalid);
    const second = check(fixture({ binary_results: [repeating(2)], round_token: first.round_token }));
    const third = check({ ...invalid, carried_state: second.carry_forward, round_token: second.round_token });
    const fourth = check(fixture({ binary_results: [repeating(4)], round_token: third.round_token }));
    const fifth = check(fixture({
      binary_results: [repeating(5)], carried_state: fourth.carry_forward, round_token: fourth.round_token
    }));
    const results = [first, second, third, fourth, fifth];
    expect(results.map(({ round }) => round?.number)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map(({ status }) => status)).toEqual(Array(5).fill("not_ready"));
    const turns = results.map(({ round_token }) =>
      JSON.parse(Buffer.from(round_token!.split("~")[1]!, "base64url").toString("utf8")).turn);
    expect(new Set(turns).size).toBe(1);
    expect(fifth.carried).toMatchObject({ turn: turns[0], first_turn: true });
    expect(fifth.previous_check).toBeUndefined();
  });

  it("starts a new turn without a valid v2 token, even with this call's preceding carried state", () => {
    const first = check(fixture({ binary_results: [repeating(1)] }));
    const state = JSON.parse(Buffer.from(first.round_token!.split("~")[1]!, "base64url").toString("utf8"));
    const { turn: _turn, ...old } = state;
    const body = `cr1~${Buffer.from(JSON.stringify({ ...old, v: 1 })).toString("base64url")}`;
    const key = createHmac("sha256", SECRET).update("askrigor check round v1").digest();
    const oldToken = `${body}~${createHmac("sha256", key).update(body).digest().subarray(0, 16).toString("base64url")}`;
    for (const roundToken of [undefined, oldToken, "cr2~invalid~invalid"]) {
      const result = check(fixture({
        binary_results: [repeating(2)], carried_state: first.carry_forward, round_token: roundToken
      }));
      expect(result.round?.number).toBe(1);
      expect(result.carried!.turn).toMatch(/^[0-9a-f]{16}$/u);
      expect(result.carried!.turn).not.toBe(first.carried!.turn);
      expect(result.carried!.first_turn).toBe(false);
      expect(result.previous_check).toEqual({ status: "not_ready", open: ["declaration"] });
    }
  });

  it("keeps stuck steps across returned carried states and stops when only those steps remain", () => {
    let carriedState = check(fixture()).carry_forward;
    let token: string | undefined;
    for (let round = 1; round <= 5; round += 1) {
      const result = check(fixture({
        carried_state: carriedState, round_token: token,
        binary_results: round < 5 ? [repeating(9), repeating(20 + round)] : [repeating(9)]
      }), round);
      expect(result.round?.number).toBe(round);
      expect(result.carry_forward).toBeDefined();
      expect(result.carry_forward).not.toBe(carriedState);
      if (round < 5) {
        expect(result.status).toBe("not_ready");
        expect(result.next_steps).toEqual(round < 3 ? [step(9), step(20 + round, 1)] : [step(20 + round, 1)]);
        if (round >= 3) expect(result.stuck_steps).toEqual([{ kind: "declaration", step: step(9) }]);
      } else {
        expect(result.status).toBe("stopped");
        expect(result.next_steps).toEqual([]);
        expect(result.stopped).toMatchObject({ reason: "stuck", could_not: [{ kind: "declaration", step: step(9) }] });
      }
      carriedState = result.carry_forward;
      token = result.round_token;
    }
  });

  it("binds only the target and turn, and still rejects bad, lapsed, early or oversized tokens", () => {
    const carriedState = check(fixture()).carry_forward;
    const first = check(fixture({ carried_state: carriedState, binary_results: [repeating(1)] }), 1);
    const token = first.round_token!;
    const withToken = (state: string | undefined, extra: Partial<FinalizeResearchInput> = {}, minutes = 2) =>
      check(fixture({ carried_state: state, binary_results: [repeating(2)], round_token: token, ...extra }), minutes).round?.number;
    expect(withToken(carriedState)).toBe(2);
    expect(withToken(first.carry_forward)).toBe(2);
    const foreign = check(fixture(), 2).carry_forward;
    expect(foreign).not.toBe(carriedState);
    expect(foreign).not.toBe(first.carry_forward);
    expect(withToken(foreign)).toBe(2);
    expect(withToken(undefined)).toBe(2);
    expect(withToken(first.carry_forward, { research_target: "Another target" })).toBe(1);
    expect(withToken(first.carry_forward, { round_token: undefined })).toBe(1);
    const parts = token.split("~");
    const state = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    expect(state.v).toBe(2);
    expect(state.bind).toBe(roundBinding(fixture().research_target));
    expect(state.turn).toMatch(/^[0-9a-f]{16}$/u);
    expect(state.turn).toBe(first.carried!.turn);
    expect(state).not.toHaveProperty("next_bind");
    // Changing the turn without signing it again must not change what the token admits.
    state.turn = "f".repeat(16);
    const altered = `${parts[0]}~${Buffer.from(JSON.stringify(state)).toString("base64url")}~${parts[2]}`;
    expect(withToken(foreign, { round_token: altered })).toBe(1);
    expect(withToken(first.carry_forward, { round_token: altered })).toBe(1);
    expect(withToken(first.carry_forward, {}, 121)).toBe(2);
    expect(withToken(first.carry_forward, {}, 122)).toBe(1);
    expect(withToken(first.carry_forward, {}, 0)).toBe(2);
    expect(withToken(first.carry_forward, {}, -1)).toBe(1);
    expect(withToken(first.carry_forward, { round_token: token + "a".repeat(ROUND_TOKEN_MAX_CHARACTERS) })).toBe(1);
  });

  it("checks real receipt gaps after a malformed list is dropped and continues carrying state", () => {
    const first = check(fixture({ carried_state: check(fixture()).carry_forward, binary_results: [repeating(1)] }), 1);
    const invalid = { ...fixture(), receipts: "not a list", carried_state: first.carry_forward };
    const second = check({ ...invalid, round_token: first.round_token }, 2);
    expect(second.round?.number).toBe(2);
    expect(second.carry_forward).toBeDefined();
    const parts = second.round_token!.split("~");
    expect(JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"))).not.toHaveProperty("next_bind");
    const third = check({ ...invalid, round_token: second.round_token }, 3);
    expect(third.round?.number).toBe(3);
    const fourth = check({ ...invalid, round_token: third.round_token }, 4);
    expect(fourth.round?.number).toBe(4);
    expect(fourth.status).toBe("stopped");
    expect(fourth.stopped?.reason).toBe("stuck");
    // Fixing the inputs carries on from the invalid round's unchanged state and token too.
    expect(check(fixture({ carried_state: first.carry_forward, round_token: second.round_token, binary_results: [repeating(2)] }), 3)
      .round?.number).toBe(3);
  });

  it("keeps the turn when a carried state is refused and the next call leaves it out", () => {
    const carriedState = "refused carried state";
    const first = check(fixture({ carried_state: carriedState }), 1);
    expect(first.carry_forward).toBeUndefined();
    const parts = first.round_token!.split("~");
    expect(JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"))).not.toHaveProperty("next_bind");
    const second = check(fixture({ carried_state: carriedState, round_token: first.round_token }), 2);
    expect(second.round?.number).toBe(1);
    expect(second.carry_forward).toBeUndefined();
    expect(check(fixture({ round_token: first.round_token }), 2).round?.number).toBe(1);
    expect(check(fixture({ round_token: first.round_token, binary_results: [repeating(1)] }), 2).round?.number).toBe(2);
  });

  it("counts the research gaps left by dropped receipts, rather than format notes", () => {
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
    expect(first.answer_checked).toBe(true);
    expect(first.notes).toHaveLength(2);
    expect(first.next_step_kinds).not.toContain("input_invalid");
    expect(third.stopped?.could_not.map(({ kind }) => kind)).not.toContain("input_invalid");
    expect(third.stopped?.short_reason).toContain("research step kept failing");
    // A token from a valid round of the same turn carries on into an invalid one.
    const valid = check(fixture({ binary_results: [repeating(1)] }));
    expect(check({ ...invalid, round_token: valid.round_token }).round?.number).toBe(2);
  });

  it("tells the model to stop, show the bug report and ask, and say how the next turn continues", () => {
    let token: string | undefined;
    let result: FinalizeResearchOutput | undefined;
    for (let round = 1; round <= 3; round += 1) {
      result = check(fixture({ binary_results: [repeating(9)], ...(token === undefined ? {} : { round_token: token }) }));
      token = result.round_token;
    }
    const text = uncheckedAnswerInstructions(result!);
    expect(text).toContain("The final check stopped: the only steps left came back unchanged 3 rounds running. This is " +
      "the turn's final result: do not call finalize_research again in this turn, and give the answer now.");
    expect(text).toContain(`what AskRigor could not do (stopped.could_not), then a short general bug report with no personal details, such as ${JSON.stringify(result!.bug_report)}, and asks, as written: "${STOPPED_CHECK_REPORT_OFFER}"`);
    expect(text).not.toContain("what the next turn can do");
    expect(text.endsWith(result!.unchecked_line!)).toBe(true);
    // A round that is still open names its stuck steps and the steps the next turn could do.
    const open = check(fixture({ binary_results: [repeating(1)] }));
    const openText = uncheckedAnswerInstructions(open);
    expect(openText).not.toContain("The final check stopped");
    expect(openText).toContain("what the next turn can do (the steps still open) and how to continue");
    expect(openText).not.toContain(STOPPED_CHECK_REPORT_OFFER);
  });
});

describe("the stopped answer's completion tip (owner answer 187)", () => {
  const withoutTip = () => fixture().answer_draft!.replace("\n\n" + COMPLETE_CHECKS_TIP, "");
  const stop = (overrides: Partial<FinalizeResearchInput> = {}) => {
    let result = check(fixture({ binary_results: [repeating(9)], ...overrides }));
    for (let round = 2; round <= 3; round += 1) {
      result = check(fixture({ binary_results: [repeating(9)], ...overrides, round_token: result.round_token }));
    }
    expect(result.status).toBe("stopped");
    return result;
  };

  it("adds the fixed caveat only when stopped; an unusable call keeps its single message", () => {
    expect(COMPLETE_CHECKS_TIP).toBe('To give AskRigor\'s checks more room to finish, ask it to complete its checks, for example: "complete askrigor checks".');
    expect(check(fixture({ answer_draft: withoutTip() }))).toMatchObject({ status: "ready_with_limits" });
    expect(check(fixture({ answer_draft: withoutTip() })).caveats).not.toContain(COMPLETE_CHECKS_TIP);
    expect(check(fixture({ binary_results: [repeating(9)] })).caveats).not.toContain(COMPLETE_CHECKS_TIP);
    expect(stop().caveats).toContain(COMPLETE_CHECKS_TIP);
    expect(stop().stopped!.could_not).toEqual([{ kind: "declaration", step: step(9) }]);
    let invalid = check({ research_target: 7 });
    expect(invalid.caveats).not.toContain(COMPLETE_CHECKS_TIP);
    for (let round = 2; round <= 3; round += 1) invalid = check({ research_target: 7, round_token: invalid.round_token });
    expect(invalid.status).toBe("not_ready");
    expect(invalid.caveats).toEqual([]);
    expect(invalid.next_steps).toHaveLength(1);
    expect(invalid.round).toBeUndefined();
  });

  it("refuses a stopped draft that leaves out the tip without opening another round", () => {
    const result = stop({ answer_draft: withoutTip() });
    expect(result.round?.number).toBe(3);
    expect(result.stopped!.could_not).toEqual([{ kind: "declaration", step: step(9) }]);
    expect(result.next_steps).toEqual([]);
    expect(result.round_token).toBeUndefined();
    expect(result.finalization_receipt).toBeUndefined();
    expect(result.checked_answer).toBeUndefined();
  });

  it("accepts the declared translated sentence through caveat_renderings", () => {
    const translated = 'Pour laisser davantage de temps aux vérifications d’AskRigor, demandez-lui de les terminer, par exemple : « complete askrigor checks ».';
    const rendering = { caveat: COMPLETE_CHECKS_TIP, text: translated };
    const result = stop({ answer_draft: withoutTip() + "\n\n" + translated, answer_language: "fr", caveat_renderings: [rendering] });
    expect(result.caveats).toContain(COMPLETE_CHECKS_TIP);
    expect(result.stopped!.could_not).toEqual([{ kind: "declaration", step: step(9) }]);
    // Declaring a translation does not count unless the answer visibly states it.
    const missing = stop({ answer_draft: withoutTip(), answer_language: "fr", caveat_renderings: [rendering] });
    expect(missing.stopped!.could_not).toEqual([{ kind: "declaration", step: step(9) }]);
  });

  it.each([
    `\`\`\`\n${COMPLETE_CHECKS_TIP}\n\`\`\``,
    `<!-- ${COMPLETE_CHECKS_TIP} -->`,
    `<details><summary>More</summary>\n\n${COMPLETE_CHECKS_TIP}\n\n</details>`,
  ])("refuses the tip hidden from visible prose: %s", (hidden) => {
    expect(stop({ answer_draft: withoutTip() + "\n\n" + hidden }).stopped!.could_not)
      .toEqual([{ kind: "declaration", step: step(9) }]);
  });
});

describe("what a stopped check could not do and what the next turn can", () => {
  const options = { secret: SECRET, bind: roundBinding("target"), now: START };
  const advance = (steps: readonly CheckStep[], token?: string) => advanceCheckRound(steps, {
    ...options, call: readCheckRound(token, options)
  });
  const research: CheckStep = { kind: "research", text: "Read the study's full text.", rule: rule`Read the study's full text.` };
  const declaration: CheckStep = { kind: "declaration", text: "Give named_target." };
  const toolList: CheckStep = { kind: "tool_list", text: "Refresh the app's tool list." };

  it("leaves research and the tool list to the next turn at the limit, and the rest to a bug report", () => {
    let token: string | undefined;
    let outcome = advance([research], token);
    for (let round = 2; round <= CHECK_ROUND_LIMIT; round += 1) {
      expect(outcome.status).toBe("open");
      token = outcome.status === "open" ? outcome.token : undefined;
      // Each round's text differs, so nothing is stuck.
      outcome = advance([
        { ...research, text: `Read study ${round}.` },
        { ...declaration, text: `Give declaration ${round}.` },
        { ...toolList, text: `Refresh ${round}.` }
      ], token);
    }
    expect(outcome).toMatchObject({
      status: "stopped", round: CHECK_ROUND_LIMIT, reason: "limit",
      couldNot: [{ kind: "declaration" }],
      nextTurn: [{ kind: "research" }, { kind: "tool_list" }]
    });
  });

  it("counts research that keeps coming back as failing, but leaves a stuck tool list to the user", () => {
    let token: string | undefined;
    let outcome = advance([research, toolList], token);
    for (let round = 2; round <= 3; round += 1) {
      token = outcome.status === "open" ? outcome.token : undefined;
      outcome = advance([research, toolList], token);
    }
    expect(outcome).toMatchObject({ status: "stopped", reason: "stuck", couldNot: [research], nextTurn: [toolList] });
    expect(outcome.status === "stopped" ? stoppedCheckBugReport(outcome) : undefined)
      .toBe("AskRigor's final check stopped at round 3 with this rule still unmet: Read the study's full text.");
  });

  it("s360-studies: a source-marked tool limit is never a round step, regardless of its prose", () => {
    const deferred: CheckStep = { ...research, deferUntilNextTurn: true };
    let outcome = advance([deferred]);
    for (let round = 1; round <= 4; round += 1) {
      expect(outcome).toMatchObject({ status: "open", round, open: [], stuck: [] });
      outcome = advance([deferred], outcome.status === "open" ? outcome.token : undefined);
    }
  });

  it("gives no bug report when everything left is for the next turn", () => {
    let token: string | undefined;
    let outcome = advance([toolList], token);
    for (let round = 2; round <= 3; round += 1) {
      token = outcome.status === "open" ? outcome.token : undefined;
      outcome = advance([toolList], token);
    }
    expect(outcome).toMatchObject({ status: "stopped", couldNot: [], nextTurn: [toolList] });
    expect(outcome.status === "stopped" ? stoppedCheckBugReport(outcome) : "open").toBeUndefined();
  });
});


describe("27 Oct round continuity regressions", () => {
  it("s359-t1-given: passing calls do not consume rounds before a blocking recheck", () => {
    let result = check(fixture());
    const turn = result.carried!.turn;
    for (let round = 2; round <= CHECK_ROUND_LIMIT; round += 1) {
      result = check(fixture({ carried_state: result.carry_forward, round_token: result.round_token,
        ...(round <= 5 ? {} : { binary_results: [repeating(round)] }) }));
      expect(result.round?.number).toBe(round <= 5 ? 1 : round - 4);
      expect(result.carried!.turn).toBe(turn);
      expect(result.status).toBe(round <= 5 ? "ready_with_limits" : "not_ready");
    }
    expect(result.stopped).toBeUndefined();
  });

  it("r330: passing calls leave this turn's blocking-round budget available", () => {
    let result = check(fixture());
    for (let round = 2; round <= CHECK_ROUND_LIMIT; round += 1) {
      result = check(fixture({ round_token: result.round_token }));
      expect(result.status).toBe("ready_with_limits");
      expect(result.round?.number).toBe(1);
    }
    const over = check(fixture({ round_token: result.round_token }));
    expect(over.status).toBe("ready_with_limits");
    expect(over.round?.number).toBe(1);
    expect(over.stopped).toBeUndefined();
  });
});
