import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { createHmac } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { issueCarriedState, verifyCarriedState, type CarriedState } from "../apps/research-mcp/src/carried-state.js";
import { CORRECTION_REPORT_OFFER, finalizeResearch, finalizeResearchInputSchema, type FinalizeResearchInput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
const SECRET = "carried-state-fixture-secret-01234567890123456789";
const NOW = () => new Date("2026-10-17T12:00:00.000Z");
const observation = { observation: "a friend's drowsiness after the same product", response: "effect" as const, source: "someone_else" as const };
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [], research_target: "Synthetic continuity test", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage", not_relevant_reason: "Synthetic emergency fixture",
  key_sources: [], answer_draft: "Synthetic answer.", absence_claims: [], scale_results: [], binary_results: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  user_observations: [], proposed_tests: [], ...overrides
});
const check = (overrides: Partial<FinalizeResearchInput> = {}) => assertNextStepsContract(finalizeResearch(base(overrides), { secret: SECRET, now: NOW }));
const carriedSteps = (overrides: Partial<FinalizeResearchInput>) => {
  const result = check(overrides);
  return [...advisoryNotes(result), ...result.next_steps].filter((step) => /earlier|carried_state|primary_outcome|rejected/.test(step));
};

describe("conversation state carried between final checks", () => {
  it("returns signed, readable declarations, including on not_ready calls, and accepts the same observations next turn", () => {
    const first = check({ user_observations: [observation], primary_outcome: "Explain the effect", rejected_options: ["Option A"], principal_communities: [{ name: "r/Example", platform: "reddit", named_by_user: true }] });
    expect(first.carry_forward).toBeDefined(); expect(verifyCarriedState(first.carry_forward!, { secret: SECRET })).toEqual({ ok: true, state: first.carried });
    expect(first.carried).toMatchObject({ observations: [observation], primary_outcome: "Explain the effect", rejected: ["Option A"], named_communities: [], current_turn_named_communities: ["r/Example"] });
    expect(carriedSteps({ carried_state: first.carry_forward, user_observations: [observation], primary_outcome: "Explain the effect", rejected_options: ["Option A"] })).toEqual([]);
    expect(check({ user_observations: [observation], proposed_tests: [{ quote: "Try it.", repeats: 9, blinded: true }] }).status).toBe("ready_with_limits");
    expect(check({ proposed_tests: [{ quote: "Try it.", repeats: 9, blinded: true }] }).carry_forward).toBeDefined();
  });
  it("names a dropped observation, caps those steps at ten, and accepts a withdrawn observation with its caveat", () => {
    const token = check({ user_observations: [observation] }).carry_forward;
    expect(carriedSteps({ carried_state: token })).toContain(`user_observations leaves out ${JSON.stringify(observation.observation)} from earlier in this conversation: keep it, marked withdrawn or uncertain if its source took it back.`);
    const withdrawn = check({ carried_state: token, user_observations: [{ ...observation, response: "withdrawn" }] });
    expect(advisoryNotes(withdrawn).join("\n")).not.toContain("user_observations leaves out");
    expect(withdrawn.caveats).toContain(`A report its source has taken back: ${observation.observation}. It counts neither for nor against an effect.`);
    // The call that left it out still carries it, so its token cannot shed it.
    expect(check({ carried_state: token }).carried!.observations).toEqual([observation]);
    const added = { ...observation, observation: "a new observation" };
    expect(check({ carried_state: token, user_observations: [added] }).carried!.observations).toEqual([added, observation]);
    const many = check({ user_observations: Array.from({ length: 13 }, (_, i) => ({ ...observation, observation: `Observation ${i}` })) }).carry_forward;
    const missing = carriedSteps({ carried_state: many }); expect(missing).toHaveLength(11); expect(missing.at(-1)).toBe("and 3 more earlier observations.");
  });
  it("rejects tampering and still runs the other checks, without inheriting its contents", () => {
    const token = check({ user_observations: [observation], rejected_options: ["Old option"] }).carry_forward!;
    const tampered = token.slice(0, -3) + (token.at(-3) === "a" ? "b" : "a") + token.slice(-2);
    const result = check({ carried_state: tampered, rejected_options: ["Option A"], recommendations: [{ quote: "Try A.", intervention: "Option A", safety_check: "resolved", long_term_use: false }] });
    expect(advisoryNotes(result)).toContain("carried_state does not verify: pass exactly the carry_forward value from the last final check in this conversation that gave one, or leave carried_state out if none has.");
    expect(advisoryNotes(result).join("\n")).toContain("recommendations[0] puts forward Option A");
    // No replacement token, so the model cannot pass on a state that lost the earlier one.
    expect(result.carry_forward).toBeUndefined(); expect(result.carried).toBeUndefined();
  });
  it("rejects an earlier retracted statement except inside this call's own change sentence", () => {
    const wrong = "The rate was 40%.";
    const token = check({ corrections: [{ retracted: wrong, change: "The rate is corrected.", by_user: false }] }).carry_forward;
    expect(carriedSteps({ carried_state: token, answer_draft: `## ${wrong}` })).toContain(`The answer repeats a statement taken back earlier in this conversation: ${JSON.stringify(wrong)}. Leave it out.`);
    const change = `Earlier I said ${wrong} That is taken back.`;
    expect(carriedSteps({ carried_state: token, answer_draft: change, corrections: [{ retracted: wrong, change, by_user: false }] })).toEqual([]);
    expect(carriedSteps({ carried_state: token, answer_draft: `${change}\n\n${wrong}`, corrections: [{ retracted: wrong, change, by_user: false }] }).join("\n")).toContain("repeats a statement");
  });
  it("keeps retractions blocking and carried even when advisory caveats contain them (owner 195)", () => {
    const unblinded = { quote: "Try it.", blinded: false };
    const caveat = check({ proposed_tests: [unblinded] }).caveats.find((text) => text.startsWith("A test the person does on themselves without blinding"))!;
    const draft = `Try it.\n\n${caveat}`;
    const declared = check({ proposed_tests: [unblinded], answer_draft: draft,
      corrections: [{ retracted: caveat, change: "Try it.", by_user: false }] });
    expect(declared.status).toBe("not_ready");
    expect(declared.next_steps).toEqual([expect.stringContaining("wrong statement still appears")]);
    expect(declared.carried!.retracted).toEqual([caveat.slice(0, 200)]);
    const later = check({ carried_state: declared.carry_forward, proposed_tests: [unblinded], answer_draft: draft });
    expect(later.next_steps).toEqual([expect.stringContaining("taken back earlier")]);
    expect(later.carried!.retracted).toEqual([caveat.slice(0, 200)]);
    const partial = check({ proposed_tests: [unblinded], answer_draft: draft,
      corrections: [{ retracted: "can show how they did", change: "Try it.", by_user: false }] });
    expect(partial.next_steps).toEqual([expect.stringContaining("wrong statement still appears")]);
  });
  it("keeps the latest twelve distinct retracted statements truncated to 200 characters", () => {
    const first = check({ corrections: Array.from({ length: 10 }, (_, i) => ({ retracted: `${i} ${"甲".repeat(250)}`, change: "Changed.", by_user: false })) });
    const next = check({ carried_state: first.carry_forward, corrections: Array.from({ length: 5 }, (_, i) => ({ retracted: `new ${i}`, change: "Changed.", by_user: false })) });
    expect(next.carried!.retracted).toHaveLength(12); expect(next.carried!.retracted[0]).toHaveLength(200); expect(next.carried!.retracted.at(-1)).toBe("new 4");
  });
  it("requires earlier rejected options, accepts reopening case-insensitively, and prevents recommendations of a rejected option", () => {
    const token = check({ rejected_options: ["Option A"] }).carry_forward;
    expect(carriedSteps({ carried_state: token }).join("\n")).toContain("rejected_options leaves out Option A");
    expect(check({ carried_state: token }).carried!.rejected).toEqual(["Option A"]);
    expect(check({ carried_state: token, rejected_options: ["Option B"] }).carried!.rejected).toEqual(["Option B", "Option A"]);
    const reopened = check({ carried_state: token, reopened: [" option a "] });
    expect(advisoryNotes(reopened).join("\n")).not.toContain("rejected_options leaves out"); expect(reopened.carried!.rejected).toEqual([]);
    const rec = { quote: "Try A.", intervention: "OPTION A", safety_check: "resolved" as const, long_term_use: false };
    expect(advisoryNotes(check({ rejected_options: ["option a"], recommendations: [rec] })).join("\n")).toContain("recommendations[0] puts forward OPTION A, which the user rejected");
    expect(advisoryNotes(check({ rejected_options: ["option a"], reopened: ["Option A"], recommendations: [rec] })).join("\n")).not.toContain("which the user rejected");
  });
  it("requires the carried primary goal unless the user changed it, and keeps named communities", () => {
    const token = check({ primary_outcome: "Explain why", principal_communities: [{ name: "r/Example", platform: "reddit", named_by_user: true }] }).carry_forward;
    expect(carriedSteps({ carried_state: token }).join("\n")).toContain("Give primary_outcome:");
    expect(carriedSteps({ carried_state: token, primary_outcome: "Another goal" }).join("\n")).toContain("primary_outcome differs");
    expect(check({ carried_state: token, primary_outcome: "Another goal" }).carried!.primary_outcome).toBe("Explain why");
    expect(check({ carried_state: token, primary_outcome: "Another goal", primary_outcome_changed: true }).carried!.primary_outcome).toBe("Another goal");
    expect(carriedSteps({ carried_state: token, primary_outcome: "Another goal", primary_outcome_changed: true })).toEqual([]);
    const result = check({ carried_state: token, primary_outcome: "Explain why", principal_communities: [{ name: "YouTube", platform: "youtube" }] });
    expect(advisoryNotes(result)).toContain("principal_communities leaves out r/Example, which the user named earlier in this conversation: keep it with named_by_user, or withdraw it in withdrawn_named_communities with name and reason."); expect(result.carried!.named_communities).toContain("r/Example");
  });
  it("preserves observation, goal and rejection continuity without locking this turn’s community label", () => {
    const first = check({
      user_observations: [observation], rejected_options: ["Option A"], primary_outcome: "Explain why",
      principal_communities: [{ name: "r/Example", platform: "reddit", named_by_user: true }],
      corrections: [{ retracted: "The rate was 40%.", change: "Corrected.", by_user: false }],
      proposed_tests: [{ quote: "Try it.", repeats: 9, blinded: true }]
    });
    const current = {
      carried_state: first.carry_forward, round_token: first.round_token,
      principal_communities: [{ name: "YouTube", platform: "youtube" as const }],
      answer_draft: "The rate was 40%."
    };
    const steps = carriedSteps(current);
    expect(steps).toEqual([
      `user_observations leaves out ${JSON.stringify(observation.observation)} from earlier in this conversation: keep it, marked withdrawn or uncertain if its source took it back.`,
      "rejected_options leaves out Option A, which the user rejected earlier in this conversation: keep it, or list it in reopened if the user reopened it.",
      'Give primary_outcome: the user\'s main goal carried from earlier in this conversation is "Explain why".',
      'The answer repeats a statement taken back earlier in this conversation: "The rate was 40%.". Leave it out.'
    ]);
    expect(carriedSteps({ ...current, primary_outcome: "Another goal" })).toContain(
      'primary_outcome differs from the main goal carried from earlier in this conversation ("Explain why"): keep it, or set primary_outcome_changed if the user changed it.'
    );
    // The existing way out of each step still closes it.
    expect(carriedSteps({
      carried_state: first.carry_forward, round_token: first.round_token, user_observations: [observation],
      reopened: ["Option A"], primary_outcome: "Another goal", primary_outcome_changed: true,
      principal_communities: [{ name: "r/Example", platform: "reddit", named_by_user: true }]
    })).toEqual([]);
  });
  it("returns no carry without the receipt secret and never puts it into the finalization receipt", () => {
    expect(finalizeResearch(base(), { secret: undefined })).not.toHaveProperty("carry_forward");
    const result = check({ answer_draft: "No study's methods were checked in full text for this answer." }); expect(result.finalization_receipt).toBeDefined();
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET, now: NOW });
    expect(receipt.ok).toBe(true); expect(JSON.stringify(receipt)).not.toMatch(/carry_forward|carried|observations|primary_outcome/); expect(result.finalization_receipt).not.toContain(result.carry_forward!);
  });
});

function maximumState(text: (length: number) => string): CarriedState {
  return { v: 2, issued_at: NOW().toISOString(), observations: Array.from({ length: 30 }, () => ({ ...observation, observation: text(200) })), retracted: Array.from({ length: 12 }, () => text(200)), primary_outcome: text(300), rejected: Array.from({ length: 12 }, () => text(120)), named_communities: Array.from({ length: 8 }, () => text(120)), current_turn_named_communities: Array.from({ length: 8 }, () => text(120)) };
}
describe("carried-state ledger at its size limit", () => {
  it("lets a full ledger choose which observations and rejected options to keep", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => ({ ...observation, observation: `Observation ${i}` }));
    const token = check({ user_observations: thirty, rejected_options: Array.from({ length: 12 }, (_, i) => `Option ${i}`) }).carry_forward;
    const replaced = [...thirty.slice(1), { ...observation, observation: "Observation 30" }];
    const result = check({ carried_state: token, user_observations: replaced, rejected_options: Array.from({ length: 12 }, (_, i) => `Option ${i + 1}`) });
    expect(advisoryNotes(result).join("\n")).not.toMatch(/(?:user_observations|rejected_options) leaves out/u);
    expect(result.carried!.observations).toEqual(replaced); expect(result.carried!.rejected).toHaveLength(12);
  });
});

describe("carried-state token bounds and authentication", () => {
  it("round-trips the optional turn fields in cs2 without changing the size limit", () => {
    const state: CarriedState = {
      ...maximumState((length) => "甲".repeat(length)), turn: "0123456789abcdef", first_turn: false,
      previous_open: ["input_invalid", "receipt_rejected", "research", "declaration", "answer_draft", "carried_state", "second_reading", "tool_list"]
    };
    const token = issueCarriedState(state, { secret: SECRET })!;
    expect(token).toMatch(/^cs2~/u);
    expect(token.length).toBeLessThanOrEqual(48_000);
    expect(verifyCarriedState(token, { secret: SECRET })).toEqual({ ok: true, state });
    for (const turn of ["0123456789ABCDEf", "0123456789abcde", "0123456789abcdef0"]) {
      expect(() => issueCarriedState({ ...state, turn }, { secret: SECRET })).toThrow();
    }
  });
  it("round-trips every field at its limit in varied three-byte UTF-8 characters within 48000 characters", () => {
    let seed = 17;
    const text = (length: number) => Array.from({ length }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return String.fromCharCode(0x4e00 + seed % 20000); }).join("");
    const state = maximumState(text); const token = issueCarriedState(state, { secret: SECRET })!;
    expect(token.length).toBeLessThanOrEqual(48_000); expect(verifyCarriedState(token, { secret: SECRET })).toEqual({ ok: true, state });
  });
  it("round-trips every field at its limit in characters JSON escapes, even with a fully escaped payload above 64 KB", () => {
    const state = maximumState((length) => "\u0001".repeat(length));
    const token = issueCarriedState(state, { secret: SECRET })!;
    expect(verifyCarriedState(token, { secret: SECRET })).toEqual({ ok: true, state });
    const escaped = JSON.stringify(state).replace(/[\s\S]/gu, (c) => c.charCodeAt(0) > 127 ? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}` : c);
    expect(Buffer.byteLength(escaped)).toBeGreaterThan(64 * 1024);
    const payload = deflateRawSync(Buffer.from(escaped)).toString("base64url"); const body = `cs2~${payload}`;
    const key = createHmac("sha256", SECRET).update("askrigor carried state v2").digest();
    const signed = `${body}~${createHmac("sha256", key).update(body).digest().subarray(0, 16).toString("base64url")}`;
    expect(verifyCarriedState(signed, { secret: SECRET })).toEqual({ ok: true, state });
  });
  it("rejects malformed, unsupported, wrongly signed and oversized inflated tokens without expiry", () => {
    const state = maximumState(() => "甲"); const token = issueCarriedState(state, { secret: SECRET })!;
    expect(verifyCarriedState("invalid", { secret: SECRET })).toEqual({ ok: false, reason: "malformed" });
    expect(verifyCarriedState(token.replace(/^cs2/u, "cs3"), { secret: SECRET })).toEqual({ ok: false, reason: "unsupported_version" });
    expect(verifyCarriedState(token, { secret: "other" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyCarriedState(issueCarriedState({ ...state, issued_at: "2000-01-01T00:00:00.000Z" }, { secret: SECRET })!, { secret: SECRET }).ok).toBe(true);
    const payload = deflateRawSync(Buffer.from(" ".repeat(300_000))).toString("base64url"); const body = `cs2~${payload}`;
    const key = createHmac("sha256", SECRET).update("askrigor carried state v2").digest();
    expect(verifyCarriedState(`${body}~${createHmac("sha256", key).update(body).digest().subarray(0, 16).toString("base64url")}`, { secret: SECRET })).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("observation, test and correction declarations (109)", () => {
  it("requires both declarations with a draft and keeps their limits strict", () => {
    const input = base(); delete input.user_observations; delete input.proposed_tests;
    expect(advisoryNotes(finalizeResearch(input, { secret: SECRET })).join("\n")).toContain("user_observations is missing:");
    const wording = "which attempt in user_observations it repeats (its index in repeats, left out if none)";
    expect(advisoryNotes(finalizeResearch(input, { secret: SECRET })).join("\n")).toContain(
      `proposed_tests is missing: with answer_draft, it lists each test or self-measurement the answer proposes, ${wording}`);
    expect(finalizeResearchInputSchema.shape.proposed_tests.description).toContain(wording);
    expect(finalizeResearchInputSchema.safeParse(base({ proposed_tests: [{ quote: "Test.", repeats: false as never, blinded: true }] })).success).toBe(false);
    expect(finalizeResearchInputSchema.safeParse(base({ proposed_tests: [{ quote: "Test.", repeats: null as never, blinded: true }] })).success).toBe(false);
    expect(finalizeResearchInputSchema.safeParse(base({ user_observations: [{ ...observation, observation: "甲".repeat(201) }] })).success).toBe(false);
  });
  it("requires uncertainty and unblinded caveats, checks repetition indexes and exact difference quotes", () => {
    const result = check({ user_observations: [{ ...observation, response: "uncertain" }], proposed_tests: [{ quote: "Try again.", repeats: 0, blinded: false }, { quote: "Different test.", repeats: 5, difference: "Different timing.", blinded: true }] });
    expect(result.caveats).toContain(`A report its source is no longer sure of: ${observation.observation}. It counts neither for nor against an effect.`);
    // An observation that ends its own sentence keeps its stop, with no second one (the 23 Oct ".)." of l33).
    expect(check({ user_observations: [{ ...observation, observation: "a friend's drowsiness; amount unspecified.", response: "uncertain" }] }).caveats)
      .toContain("A report its source is no longer sure of: a friend's drowsiness; amount unspecified. It counts neither for nor against an effect.");
    expect(result.caveats).toContain("A test the person does on themselves without blinding can show how they did, not what caused a change, because expectation, effort and practice can move it too.");
    expect(advisoryNotes(result).join("\n")).toContain("proposed_tests[0] repeats what the user already tried"); expect(advisoryNotes(result).join("\n")).toContain("proposed_tests[1].repeats names user_observations[5]"); expect(advisoryNotes(result).join("\n")).toContain("proposed_tests[1].difference");
    expect(advisoryNotes(check({ answer_draft: "Try again. Different timing.", user_observations: [observation], proposed_tests: [{ quote: "Try again.", repeats: 0, difference: "Different timing.", blinded: true }] })).join("\n")).not.toContain("proposed_tests");
  });
  it("requires a user correction's shown report", () => {
    const correction = { retracted: "Wrong.", change: "Corrected.", by_user: true };
    expect(advisoryNotes(check({ corrections: [correction] }))).toContain("Give corrections[0].report: the bug report the answer shows the user, copied from answer_draft.");
    const report = "When a comparison is ruled out, AskRigor should keep it because it constrains explanations.";
    expect(advisoryNotes(check({ corrections: [{ ...correction, report }] })).join("\n")).toContain("corrections[0].report");
    expect(advisoryNotes(check({ answer_draft: `Corrected. ${report} ${CORRECTION_REPORT_OFFER}`, corrections: [{ ...correction, report }] })).join("\n")).not.toContain("corrections[0].report");
  });
  it("allows Reddit names and labels required by a caveat or a declared community, and still rejects internal labels", () => {
    for (const text of ["r/Copper_deficiency", "u/Copper_deficiency"]) expect(advisoryNotes(check({ answer_draft: text })).join("\n")).not.toContain("internal labels");
    expect(advisoryNotes(check({ answer_draft: "Copper_deficiency" })).join("\n")).toContain("internal labels (Copper_deficiency)");
    expect(advisoryNotes(check({ answer_draft: "REQUIRED_NOW finalize_research" })).join("\n")).toContain("internal labels (REQUIRED_NOW, finalize_research)");
    const named = check({ answer_draft: "Copper_deficiency", principal_communities: [{ name: "r/Copper_deficiency", platform: "reddit" }] }); expect(advisoryNotes(named).join("\n")).not.toContain("internal labels");
    const uncertain = { ...observation, observation: "r/Copper_deficiency report", response: "uncertain" as const };
    const first = check({ user_observations: [uncertain] });
    expect(advisoryNotes(check({ answer_draft: `Copper_deficiency. ${first.caveats.join(" ")}`, user_observations: [uncertain] })).join("\n")).not.toContain("internal labels");
  });
});


describe("27 Oct community carry regressions", () => {
  it.each(["q82", "l30"])("%s: replaces an invented combined label within one turn", () => {
    const first = check({ principal_communities: [{ name: "r/ExampleOne and r/ExampleTwo", platform: "reddit", named_by_user: true }] });
    const second = check({ carried_state: first.carry_forward, round_token: first.round_token,
      principal_communities: ["r/ExampleOne", "r/ExampleTwo"].map((name) => ({ name, platform: "reddit", named_by_user: true })) });
    expect(advisoryNotes(second).join("\n")).not.toContain("which the user named earlier");
    expect(second.carried).toMatchObject({ v: 2, named_communities: [], current_turn_named_communities: ["r/ExampleOne", "r/ExampleTwo"] });
    const nextTurn = check({ carried_state: second.carry_forward, principal_communities: [{ name: "YouTube", platform: "youtube" }] });
    expect(nextTurn.carried!.named_communities).toEqual(["r/ExampleOne", "r/ExampleTwo"]);
    expect(nextTurn.carried!.named_communities).not.toContain("r/ExampleOne and r/ExampleTwo");
  });

  it("o355-keto: a later same-turn declaration can remove named_by_user", () => {
    const first = check({ principal_communities: [{ name: "r/ExampleOne", platform: "reddit", named_by_user: true }] });
    const revised = check({ carried_state: first.carry_forward, round_token: first.round_token,
      principal_communities: [{ name: "r/ExampleOne", platform: "reddit" }] });
    expect(advisoryNotes(revised).join("\n")).not.toContain("which the user named earlier");
    expect(revised.carried!.current_turn_named_communities).toEqual([]);
    expect(check({ carried_state: revised.carry_forward }).carried!.named_communities).toEqual([]);
  });

  it("l27: enforces earlier-turn names until exact withdrawal, without a caveat", () => {
    const first = check({ principal_communities: [{ name: "r/ExampleOne", platform: "reddit", named_by_user: true }] });
    const other = [{ name: "YouTube", platform: "youtube" as const }];
    const later = check({ carried_state: first.carry_forward, principal_communities: other });
    expect(advisoryNotes(later).join("\n")).toContain("principal_communities leaves out r/ExampleOne");
    expect(advisoryNotes(check({ carried_state: later.carry_forward, round_token: later.round_token, principal_communities: other })).join("\n"))
      .toContain("principal_communities leaves out r/ExampleOne");
    const withdrawn = check({ carried_state: later.carry_forward, round_token: later.round_token, principal_communities: other,
      withdrawn_named_communities: [{ name: "r/ExampleOne", reason: "The combined label was misattributed." }] });
    expect(advisoryNotes(withdrawn).join("\n")).not.toContain("principal_communities leaves out");
    expect(withdrawn.carried!.named_communities).toEqual([]);
    expect(withdrawn.caveats.join(" ")).not.toContain("r/ExampleOne");
    expect(check({ carried_state: withdrawn.carry_forward, principal_communities: other }).carried!.named_communities).toEqual([]);
    const wrong = check({ carried_state: later.carry_forward, principal_communities: other,
      withdrawn_named_communities: [{ name: "r/exampleone", reason: "The combined label was misattributed." }] });
    expect(advisoryNotes(wrong).join("\n")).toContain("withdrawn_named_communities[0].name is not an enforced earlier-turn name");
    expect(wrong.carried!.named_communities).toEqual(["r/ExampleOne"]);
    for (const reason of ["x".repeat(9), "x".repeat(301)]) expect(finalizeResearchInputSchema.safeParse(base({
      withdrawn_named_communities: [{ name: "r/ExampleOne", reason }]
    })).success).toBe(false);
    for (const reason of ["x".repeat(10), "x".repeat(300)]) expect(finalizeResearchInputSchema.safeParse(base({
      withdrawn_named_communities: [{ name: "r/ExampleOne", reason }]
    })).success).toBe(true);
    const currentOnly = check({ carried_state: first.carry_forward, round_token: first.round_token,
      withdrawn_named_communities: [{ name: "r/ExampleOne", reason: "The combined label was misattributed." }] });
    expect(advisoryNotes(currentOnly).join("\n")).toContain("not an enforced earlier-turn name");
  });

  it("q82: promoting a full current-turn set never silently drops names to fit the state bound", () => {
    const first = check();
    const earlier = Array.from({ length: 8 }, (_, i) => `r/Earlier${i}`);
    const latest = Array.from({ length: 8 }, (_, i) => `r/Latest${i}`);
    const token = issueCarriedState({ ...first.carried!, named_communities: earlier,
      current_turn_named_communities: latest }, { secret: SECRET });
    const blocked = check({ carried_state: token });
    expect(blocked.carry_forward).toBeUndefined();
    expect(advisoryNotes(blocked).join(" ")).toContain("No name is dropped automatically");
    const withdrawn = check({ carried_state: token,
      principal_communities: latest.map((name) => ({ name, platform: "reddit", named_by_user: true })),
      withdrawn_named_communities: earlier.map((name) => ({ name, reason: "The user withdrew this earlier community." })) });
    expect(withdrawn.carried!.named_communities).toEqual(latest);
    expect(advisoryNotes(withdrawn).join(" ")).not.toContain("principal_communities leaves out");
  });

  it("q82: accepts cs1 names as enforced earlier-turn names even with the same turn id", () => {
    const first = check();
    const { current_turn_named_communities: _current, ...state } = first.carried!;
    const old = { ...state, v: 1, named_communities: ["r/ExampleOne"] };
    const body = `cs1~${deflateRawSync(Buffer.from(JSON.stringify(old))).toString("base64url")}`;
    const key = createHmac("sha256", SECRET).update("askrigor carried state v1").digest();
    const token = `${body}~${createHmac("sha256", key).update(body).digest().subarray(0, 16).toString("base64url")}`;
    expect(verifyCarriedState(token, { secret: SECRET })).toMatchObject({ ok: true, state: {
      v: 2, named_communities: ["r/ExampleOne"], current_turn_named_communities: []
    } });
    const second = check({ carried_state: token, round_token: first.round_token,
      principal_communities: [{ name: "YouTube", platform: "youtube" }] });
    expect(advisoryNotes(second).join("\n")).toContain("principal_communities leaves out r/ExampleOne");
    expect(second.carry_forward).toMatch(/^cs2~/u);
  });
});
