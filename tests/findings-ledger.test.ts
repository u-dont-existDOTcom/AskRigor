import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rule } from "../apps/research-mcp/src/check-rules.js";
import { FINAL_CHECK_PANEL_RENDER_SOURCE } from "../apps/research-mcp/src/final-check-panel.js";
import {
  FINAL_CHECK_PANEL_FINDINGS_LEAD, FINDINGS_LEDGER_LINEAGES, FINDINGS_LEDGER_MEMORY_MS, FINDINGS_LEDGER_NOTE, WHAT_STOPS,
  WHAT_STOPS_TEXT,
  createFindingsLedgerMemory, findingsLedger, findingsLedgerAccountsFromEnv, findingsLedgerEnabledFromEnv,
  findingsLedgerGuidance,
  findingsLedgerMemoryKey, issueFindingsLedger, sketchSimilarity, verifyFindingsLedger, whatStops,
  type FindingsLedgerParams, type ObservedFinding,
} from "../apps/research-mcp/src/findings-ledger.js";
import { finalizeResearchLaterShape, laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import { ANSWER_READING_LABELS } from "../apps/research-mcp/src/source-reading.js";
import {
  FINAL_CHECK_BLOCKING_RULES, SECOND_READING_LEFT_TO_CALLER, communitySkipCaveat,
  finalizeResearch as finalizeResearchUnwrapped, finalizeResearchOutputSchema, settleFindingsLedger,
  type FinalizeResearchInput, type FinalizeResearchOptions, type FinalizeResearchOutput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { withSourceReading } from "./helpers/source-reading.js";

// Enforcing HRP, stage 1 (design-v2 of 17 Nov 2026, after Codex's red team): every problem the final check reports is a
// record with an id carried through edits, bound to account, target, draft and versions, with omission and replay
// detection and dispositions; plan_research says up front which six checks can stop an answer; the panel shows the
// reader what the answer leaves open. All behind ASKRIGOR_FINDINGS_LEDGER, off by default. Claim holds wait for the
// owner's answer to question 1 of 17 Nov 2026 and are not named.

const SECRET = "findings-ledger-test-secret-0123456789abcdef0123";
// The test run's own clock, whole seconds: the fixture's receipt is issued now, and one issued after a fixed check time
// would not verify (the review run of 17 Nov 2026 began before 18:00 UTC, so a fixed 18:00 passed then and fails after).
const NOW = new Date(Math.floor(Date.now() / 1_000) * 1_000);
const finalizeResearch = (input: FinalizeResearchInput & Record<string, unknown>, options: FinalizeResearchOptions) =>
  finalizeResearchUnwrapped(withSourceReading(input, { check: options }), options);

afterEach(() => { vi.unstubAllEnvs(); });

const WARNING = "Coffee late in the day can raise blood pressure in some people.";
const EDITED = "Coffee late in the day can raise blood pressure in some adults.";

// The panel test's validated, full-text-audited fixture, with one sentence a second reading finds undeclared.
function fixture(sentence: string | undefined = WARNING, overrides: Partial<FinalizeResearchInput> = {}):
  FinalizeResearchInput & Record<string, unknown> {
  return {
    receipts: [issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET })],
    research_target: "Synthetic findings-ledger declaration", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the findings ledger.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the findings ledger." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth).\n\n" + (sentence === undefined ? "" : `${sentence}\n\n`) +
      communitySkipCaveat("Synthetic fixture isolates the findings ledger."),
    ...overrides,
  };
}
const reading = (quote: string | undefined): FinalizeResearchOptions["secondReading"] => ({
  status: "ran", findings: quote === undefined ? [] : [{ kind: "safety_claims", quote, why: "An undeclared warning." }],
});
const options = (quote: string | undefined, ledger: FinalizeResearchOptions["findingsLedger"] = { account: "acct-a" }):
  FinalizeResearchOptions => ({ secret: SECRET, now: () => NOW, secondReading: reading(quote), findingsLedger: ledger });
const withLedger = (input: FinalizeResearchInput & Record<string, unknown>, later: Record<string, unknown>) =>
  ({ ...input, later_inputs: { ...(input.later_inputs as Record<string, unknown> | undefined ?? {}), ...later } });
const warningFinding = (output: FinalizeResearchOutput) =>
  output.check_findings?.findings.find(({ kind, text }) => kind === "second_reading" && text !== undefined);

// Direct calls of the pure ledger function.
const note = (text: string): ObservedFinding => ({ kind: "declaration", text, rule: rule`${text}` });
const draftNote = (quote: string): ObservedFinding => {
  const step = rule`The answer says ${JSON.stringify(quote)} without a source.`;
  return { kind: "answer_draft", text: step.text, rule: step };
};
// One chat's calls carry its turn (Fable's check of 17 Nov 2026): the server's memory is used only for them.
const TURN = "0123456789abcdef";
const params = (overrides: Partial<FindingsLedgerParams>): FindingsLedgerParams => ({
  secret: SECRET, account: "acct-a", target: "A research target", versions: { hrp: "20.6.43", universal: "20.5.40", build: "abc1234" },
  raw: {}, observed: [], draft: "A draft.", turns: { call: TURN }, now: NOW, ...overrides,
});

describe("the setting", () => {
  it("is off unless ASKRIGOR_FINDINGS_LEDGER is on", () => {
    expect(findingsLedgerEnabledFromEnv(undefined)).toBe(false);
    expect(findingsLedgerEnabledFromEnv("enabled")).toBe(false);
    expect(findingsLedgerEnabledFromEnv(" on ")).toBe(true);
  });

  it("changes nothing the check finds, stops or holds, and adds nothing while off", () => {
    const off = finalizeResearch(fixture(), { secret: SECRET, now: () => NOW, secondReading: reading(WARNING) });
    const on = finalizeResearch(fixture(), options(WARNING));
    expect(off.check_findings).toBeUndefined();
    expect(off.findings_ledger).toBeUndefined();
    expect(off.notes ?? []).not.toContain(FINDINGS_LEDGER_NOTE);
    for (const field of ["status", "next_steps", "next_step_kinds", "limits", "caveats", "must_report"] as const) {
      expect(on[field], field).toEqual(off[field]);
    }
    expect((on.notes ?? []).filter((text) => text !== FINDINGS_LEDGER_NOTE)).toEqual(off.notes ?? []);
    expect(on.notes).toContain(FINDINGS_LEDGER_NOTE);
  });

  it("accepts the two later inputs, read from the raw call, only while the ledger is active for the call", () => {
    expect(Object.keys(finalizeResearchLaterShape(true))).toEqual(expect.arrayContaining(["findings_ledger",
      "finding_responses"]));
    // Codex's sixth review of 17 Nov 2026, finding 3: otherwise they are unknown inputs, as on main.
    expect(laterInputNames("finalize_research")).not.toContain("findings_ledger");
    expect(Object.keys(finalizeResearchLaterShape(false))).toEqual(laterInputNames("finalize_research"));
  });
});

describe("the signed ledger", () => {
  it("verifies its own token and refuses an altered one", () => {
    const first = findingsLedger(params({ observed: [note("Declare the harms.")] }));
    expect(first.token).toMatch(/^fl1~/u);
    const verified = verifyFindingsLedger(first.token, SECRET);
    expect(verified.ok).toBe(true);
    const altered = `${first.token!.slice(0, -3)}${first.token!.endsWith("A") ? "B" : "A"}${first.token!.slice(-2)}`;
    expect(verifyFindingsLedger(altered, SECRET)).toMatchObject({ ok: false });
    expect(verifyFindingsLedger(first.token, "another-secret-0123456789abcdef0123456789")).toEqual(
      { ok: false, reason: "bad_signature" });
    expect(verifyFindingsLedger(42, SECRET)).toEqual({ ok: false, reason: "malformed" });
    // It holds no words of the answer or the findings.
    expect(JSON.stringify(verified.ok ? verified.payload : {})).not.toContain("harms");
    const again = findingsLedger(params({ observed: [note("Declare the harms.")], draft: "A draft.",
      raw: { later_inputs: { findings_ledger: altered } } }));
    expect(again.checkFindings.ledger).toBe("rejected");
    expect(again.notes.join(" ")).toContain("did not verify");
  });

  it("refuses another account's or another research target's ledger", () => {
    const first = findingsLedger(params({ observed: [note("Declare the harms.")] }));
    const other = findingsLedger(params({ account: "acct-b", observed: [note("Declare the harms.")],
      raw: { later_inputs: { findings_ledger: first.token } } }));
    expect(other.checkFindings.ledger).toBe("rejected");
    expect(other.notes.join(" ")).toContain("belongs to another account");
    const target = findingsLedger(params({ target: "Another target", observed: [note("Declare the harms.")],
      raw: { findings_ledger: first.token } }));
    expect(target.notes.join(" ")).toContain("belongs to another research target");
    // The same finding on another account is another record.
    expect(other.checkFindings.findings[0]!.id).not.toBe(first.checkFindings.findings[0]!.id);
  });

  it("says when the rules or versions changed since it was issued, and matches the findings again", () => {
    const first = findingsLedger(params({ observed: [note("Declare the harms.")] }));
    const later = findingsLedger(params({ versions: { hrp: "20.6.44", universal: "20.5.40", build: "def5678" },
      observed: [note("Declare the harms.")], raw: { later_inputs: { findings_ledger: first.token } } }));
    expect(later.checkFindings.ledger).toBe("versions_changed");
    expect(later.notes.join(" ")).toContain("rules or versions changed");
    expect(later.checkFindings.findings[0]!.id).toBe(first.checkFindings.findings[0]!.id);
  });

  it("keeps a full ledger within its size limit, and issues the same token for the same ledger", () => {
    const observed = Array.from({ length: 60 }, (_, index) => note(`Finding number ${index} ${"word ".repeat(index % 7)}`));
    const result = findingsLedger(params({ observed }));
    expect(result.token).toBeDefined();
    expect(result.token!.length).toBeLessThanOrEqual(24_000);
    const payload = verifyFindingsLedger(result.token, SECRET);
    expect(payload.ok && payload.payload.e.length).toBe(60);
    expect(issueFindingsLedger(payload.ok ? payload.payload : (undefined as never), SECRET)).toBe(result.token);
  });
});

describe("ids carried through edits, and dispositions", () => {
  it("keeps a finding's id while it stays, and through an edit of its words", () => {
    const first = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one." }));
    const id = first.checkFindings.findings[0]!.id;
    expect(id).toMatch(/^F-[0-9a-f]{10}$/u);
    expect(first.checkFindings.findings[0]).toMatchObject({ disposition: "open", reader: true, first_revision: 1 });
    // The same draft again: the same finding, still open, the same revision.
    const same = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one.",
      raw: { later_inputs: { findings_ledger: first.token } } }));
    expect(same.checkFindings.findings[0]).toMatchObject({ id, disposition: "open" });
    expect(same.checkFindings.revision).toBe(1);
    // The sentence reworded but the problem left: the same id, unresolved.
    const edited = findingsLedger(params({ observed: [draftNote(EDITED)], draft: "Draft two.",
      raw: { later_inputs: { findings_ledger: same.token } } }));
    expect(edited.checkFindings.revision).toBe(2);
    expect(edited.checkFindings.findings[0]).toMatchObject({ id, disposition: "unresolved", first_revision: 1,
      last_revision: 2 });
    // A different problem of the same rule is another finding.
    const other = findingsLedger(params({ observed: [draftNote("Vitamin D cures depression in a week.")],
      draft: "Draft three.", raw: { later_inputs: { findings_ledger: edited.token } } }));
    const ids = other.checkFindings.findings.map((finding) => finding.id);
    expect(ids).toContain(id);
    expect(other.checkFindings.findings.find((finding) => finding.id === id)).toMatchObject({ disposition: "fixed" });
    expect(other.checkFindings.findings.find((finding) => finding.id !== id)).toMatchObject({ disposition: "open" });
    expect(sketchSimilarity([], ["abcdef"])).toBe(0);
  });

  it("calls a finding fixed only when a check of a draft no longer finds it", () => {
    const first = findingsLedger(params({ observed: [draftNote(WARNING), note("Declare the harms.")] }));
    const [draftId, declarationId] = first.checkFindings.findings.map(({ id }) => id);
    // No draft in the call: the draft's finding wasn't rechecked; the declaration's was.
    const noDraft = findingsLedger(params({ observed: [], draft: undefined,
      raw: { later_inputs: { findings_ledger: first.token } } }));
    expect(noDraft.checkFindings.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: draftId, disposition: "not_rechecked" }),
      expect.objectContaining({ id: declarationId, disposition: "fixed" }),
    ]));
    const withDraft = findingsLedger(params({ observed: [], draft: "The fixed draft.",
      raw: { later_inputs: { findings_ledger: noDraft.token } } }));
    expect(withDraft.checkFindings.findings).toEqual([expect.objectContaining({ id: draftId, disposition: "fixed" })]);
    // A settled finding is carried, not listed again.
    const after = findingsLedger(params({ observed: [], draft: "The fixed draft.",
      raw: { later_inputs: { findings_ledger: withDraft.token } } }));
    expect(after.checkFindings.findings).toEqual([]);
    // A finding that comes back is unresolved, under its old id.
    const back = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft four.",
      raw: { later_inputs: { findings_ledger: after.token } } }));
    expect(back.checkFindings.findings[0]).toMatchObject({ id: draftId, disposition: "unresolved" });
  });

  it("shows a dispute with its reason, keeps it while the finding stays, and refuses one without a reason", () => {
    const first = findingsLedger(params({ observed: [draftNote(WARNING)] }));
    const id = first.checkFindings.findings[0]!.id;
    const reason = "The sentence reports a guideline's wording, not a claim of this answer.";
    const disputed = findingsLedger(params({ observed: [draftNote(WARNING)], raw: { later_inputs: {
      findings_ledger: first.token, finding_responses: [{ id, response: "disputed", reason }] } } }));
    expect(disputed.checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed", reason });
    const kept = findingsLedger(params({ observed: [draftNote(EDITED)], draft: "Draft two.",
      raw: { later_inputs: { findings_ledger: disputed.token } } }));
    expect(kept.checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed", reason });
    const bare = findingsLedger(params({ observed: [draftNote(WARNING)], raw: { later_inputs: {
      findings_ledger: first.token, finding_responses: JSON.stringify([{ id, response: "disputed" }]) } } }));
    expect(bare.checkFindings.findings[0]).toMatchObject({ disposition: "open" });
    expect(bare.notes.join(" ")).toContain("without a reason");
    const wrong = findingsLedger(params({ observed: [draftNote(WARNING)], raw: { later_inputs: {
      finding_responses: [{ id: "F-0000000000", response: "fixed" }, { id, response: "maybe" }] } } }));
    expect(wrong.notes.join(" ")).toContain("F-0000000000, which is not a finding");
    expect(wrong.notes.join(" ")).toContain("finding_responses[1] was not read");
  });

  it("keeps a finding the writer calls fixed or withdrawn unresolved while the check still finds it", () => {
    const first = findingsLedger(params({ observed: [draftNote(WARNING)] }));
    const id = first.checkFindings.findings[0]!.id;
    const claimed = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft two.", raw: { later_inputs: {
      findings_ledger: first.token, finding_responses: [{ id, response: "fixed" }] } } }));
    expect(claimed.checkFindings.findings[0]).toMatchObject({ id, disposition: "unresolved" });
    expect(claimed.notes).toContain(`${id} is still found by this check, though later_inputs.finding_responses calls it fixed.`);
  });

  it("verifies a withdrawal against the draft, and names a source it rested on that the draft still cites", () => {
    const cited = "Trial 10.1000/xyz123 found it halved migraine days.";
    const first = findingsLedger(params({ observed: [draftNote(cited)], draft: `Intro. ${cited}` }));
    const id = first.checkFindings.findings[0]!.id;
    const still = findingsLedger(params({ observed: [], draft: `Intro. ${cited} Later.`, raw: { later_inputs: {
      findings_ledger: first.token, finding_responses: [{ id, response: "withdrawn", passage: cited }] } } }));
    expect(still.notes.join(" ")).toContain("still appears in the draft");
    expect(still.checkFindings.findings[0]!.disposition).not.toBe("withdrawn");
    const gone = findingsLedger(params({ observed: [], draft: "Intro. See [the trial](https://doi.org/10.1000/xyz123).",
      raw: { later_inputs: { findings_ledger: first.token, finding_responses: [{ id, response: "withdrawn",
        passage: cited }] } } }));
    expect(gone.checkFindings.findings[0]).toMatchObject({ id, disposition: "withdrawn" });
    expect(gone.notes.join(" ")).toContain(`${id} was withdrawn, but the draft still cites 10.1000/xyz123`);
    const clean = findingsLedger(params({ observed: [], draft: "Intro only.", raw: { later_inputs: {
      findings_ledger: first.token, finding_responses: [{ id, response: "withdrawn", passage: cited }] } } }));
    expect(clean.checkFindings.findings[0]).toMatchObject({ disposition: "withdrawn" });
    expect(clean.notes.join(" ")).not.toContain("still cites");
  });

  it("marks findings about the call itself as not for the reader", () => {
    const result = findingsLedger(params({ observed: [{ kind: "receipt_rejected", text: "Receipt 2 did not verify." },
      { text: "A note pushed as text.", call: true }, { text: "A note about the answer." }] }));
    expect(result.checkFindings.findings.map(({ reader }) => reader)).toEqual([false, false, true]);
  });
});

describe("omission and replay", () => {
  it("notices a call that leaves the ledger out, and matches with the one last issued", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const first = findingsLedger(params({ observed: [draftNote(WARNING)] }));
    memory.update(key, () => first.remember, NOW.getTime());
    const omitted = findingsLedger(params({ observed: [draftNote(WARNING)], remembered: memory.get(key, NOW.getTime()) }));
    expect(omitted.checkFindings.ledger).toBe("omitted");
    expect(omitted.notes.join(" ")).toContain("left out later_inputs.findings_ledger");
    expect(omitted.checkFindings.findings[0]!.id).toBe(first.checkFindings.findings[0]!.id);
    // Two hours later the memory has lapsed: a new ledger, with the same id for the same finding.
    expect(memory.get(key, NOW.getTime() + 2 * 60 * 60 * 1000 + 1)).toBeUndefined();
    // A memory of another account or target is never used.
    expect(findingsLedger(params({ account: "acct-b", observed: [draftNote(WARNING)],
      remembered: memory.get(key, NOW.getTime()) })).checkFindings.ledger).toBe("new");
  });

  it("notices an older ledger passed back, and uses the latest", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const first = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one." }));
    memory.update(key, () => first.remember, NOW.getTime());
    const second = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft two.",
      raw: { later_inputs: { findings_ledger: first.token } }, remembered: memory.get(key, NOW.getTime()) }));
    expect(second.checkFindings.ledger).toBe("continued");
    memory.update(key, () => second.remember, NOW.getTime());
    // The same call sent again (a retry: the same ledger, the same draft) is not a replay.
    const retry = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft two.",
      raw: { later_inputs: { findings_ledger: first.token } }, remembered: memory.get(key, NOW.getTime()) }));
    expect(retry.checkFindings.ledger).toBe("continued");
    // The first ledger with another draft: a replay; the latest is used, so the revision goes on from it.
    const replay = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft three.",
      raw: { later_inputs: { findings_ledger: first.token } }, remembered: memory.get(key, NOW.getTime()) }));
    expect(replay.checkFindings.ledger).toBe("replayed");
    expect(replay.notes.join(" ")).toContain("is ledger 1, not the latest (ledger 2)");
    expect(replay.checkFindings.revision).toBe(3);
  });
});

describe("the final check with the ledger on", () => {
  it("records the second reading's finding, carries its id through an edit, and calls it fixed once gone", () => {
    const first = finalizeResearch(fixture(), options(WARNING));
    expect(first.status).toBe("ready_with_limits");
    const finding = warningFinding(first)!;
    expect(finding).toMatchObject({ kind: "second_reading", disposition: "open", reader: true });
    expect(finding.text).toContain(JSON.stringify(WARNING));
    expect(first.findings_ledger).toMatch(/^fl1~/u);
    expect(findingsLedgerGuidance(first.check_findings, first.findings_ledger)).toContain(`- ${finding.id} (note; open): `);

    const edited = finalizeResearch(withLedger(fixture(EDITED), { findings_ledger: first.findings_ledger }), options(EDITED));
    expect(edited.check_findings!.ledger).toBe("continued");
    expect(warningFinding(edited)).toMatchObject({ id: finding.id, disposition: "unresolved" });

    const gone = finalizeResearch(withLedger(fixture(undefined), { findings_ledger: edited.findings_ledger }),
      options(undefined));
    expect(gone.check_findings!.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: finding.id, disposition: "fixed" })]));
    expect(gone.check_findings!.revision).toBe(3);
  });

  it("keeps a finding the writer dismissed through reader_dismissed as disputed, with its reason", () => {
    const first = finalizeResearch(fixture(), options(WARNING));
    const id = warningFinding(first)!.id;
    const reason = "It restates the guideline the answer quotes.";
    const dismissed = finalizeResearch(withLedger(fixture(WARNING, { reader_dismissed: [{ quote: WARNING, reason }] }),
      { findings_ledger: first.findings_ledger }), options(WARNING));
    expect(dismissed.second_reading).toMatchObject({ dismissed: 1, open: 0 });
    expect(dismissed.check_findings!.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, disposition: "disputed", reason })]));
  });

  it("binds the ledger to the account it was issued to", () => {
    const first = finalizeResearch(fixture(), options(WARNING, { account: "acct-a" }));
    const other = finalizeResearch(withLedger(fixture(), { findings_ledger: first.findings_ledger }),
      options(WARNING, { account: "acct-b" }));
    expect(other.check_findings!.ledger).toBe("rejected");
    expect(other.notes!.join(" ")).toContain("belongs to another account");
  });

  it("lists the stops of a check that has not passed as stops", () => {
    const input = fixture(WARNING, { key_sources: [{ id: "10.1000/unknown", status: "validated",
      read_depth: "full_text_audited", answer_marker: "[Texte lu]" }] });
    const result = finalizeResearch(input, options(WARNING));
    expect(result.status).toBe("not_ready");
    const stops = result.check_findings!.findings.filter(({ stop }) => stop !== undefined);
    expect(stops.length).toBeGreaterThan(0);
    for (const { stop } of stops) expect(FINAL_CHECK_BLOCKING_RULES as readonly string[]).toContain(stop);
  });
});

// Codex's review of 17 Nov 2026 (code-review.md), one regression for each of its findings.
describe("the review of 17 Nov 2026", () => {
  const judged = (limit: number): FinalizeResearchOptions["meaningJudgment"] => ({ status: "ran", youtube: [],
    comparison: [], standalone: [], sourceLines: [], significance: [],
    limits: [{ limit, why: "the answer concerns adults only" }] });

  it("1: keeps a finding not rechecked, and says so, when the check that found it did not run in full", () => {
    const first = finalizeResearch(fixture(), { ...options(WARNING), meaningJudgment: judged(1) });
    expect(first.status).toBe("ready_with_limits");
    const warning = warningFinding(first)!;
    const judge = first.check_findings!.findings.find(({ text }) => text?.startsWith("The meaning judge reads"))!;
    expect(judge).toMatchObject({ disposition: "open" });
    // The same draft, with the second reading left to the caller and the meaning judge skipped: neither looked again.
    const skipped = finalizeResearch(withLedger(fixture(), { findings_ledger: first.findings_ledger }), {
      ...options(WARNING), secondReading: { status: "skipped", reason: SECOND_READING_LEFT_TO_CALLER },
      meaningJudgment: { status: "skipped", reason: "timeout" } });
    expect(skipped.check_findings!.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: warning.id, disposition: "not_rechecked" }),
      expect.objectContaining({ id: judge.id, disposition: "not_rechecked" })]));
    const said = (skipped.notes ?? []).join(" ");
    expect(said).toContain(`${warning.id} was not checked again`);
    expect(said).toContain("the second reading");
    expect(said).toContain(`${judge.id} was not checked again`);
    expect(findingsLedgerGuidance(skipped.check_findings, skipped.findings_ledger)).toContain(
      `Not checked again: ${warning.id}`);
    // Its disposition is carried, not lost: the second reading runs again and finds it in the same draft, still open.
    const again = finalizeResearch(withLedger(fixture(), { findings_ledger: skipped.findings_ledger }),
      { ...options(WARNING), meaningJudgment: judged(1) });
    expect(warningFinding(again)).toMatchObject({ id: warning.id, disposition: "open" });
    // Only a run that no longer finds it calls it fixed.
    const gone = finalizeResearch(withLedger(fixture(undefined), { findings_ledger: again.findings_ledger }),
      { ...options(undefined), meaningJudgment: judged(1) });
    expect(gone.check_findings!.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: warning.id, disposition: "fixed" })]));
  });

  it("2: takes only the same request again as a retry; an older ledger with other replies continues from the latest", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const at = NOW.getTime();
    const first = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one." }));
    memory.update(key, () => first.remember, at);
    const id = first.checkFindings.findings[0]!.id;
    const reason = "The sentence reports a guideline's wording, not a claim of this answer.";
    const disputing = { later_inputs: { findings_ledger: first.token,
      finding_responses: [{ id, response: "disputed", reason }] } };
    const disputed = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one.", raw: disputing,
      remembered: memory.get(key, at) }));
    expect(disputed.checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed", reason });
    memory.update(key, () => disputed.remember, at);
    // The first ledger again with the same draft but without the reply: not a retry, so the dispute recorded since stays.
    // The ledger passed back is older than the reason, and the server keeps only its digest (the re-review of 17 Nov
    // 2026, finding 6), so the result says the reason isn't available.
    const rolledBack = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one.",
      raw: { later_inputs: { findings_ledger: first.token } }, remembered: memory.get(key, at) }));
    expect(rolledBack.checkFindings.ledger).toBe("replayed");
    expect(rolledBack.checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed" });
    expect(rolledBack.notes.join(" ")).toContain(`${id} is still disputed, but its reason isn't available for this check.`);
    // The same request sent again is a retry: the same ledger, token for token.
    const retried = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one.", raw: disputing,
      remembered: memory.get(key, at), now: new Date(at + 5_000) }));
    expect(retried.checkFindings.ledger).toBe("continued");
    expect(retried.token).toBe(disputed.token);
  });

  it("3: never lets a call that finishes late overwrite a newer ledger the server remembers", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, undefined, fixture().research_target as string);
    // The edited draft's second reading waits until released, so its call finishes after two later calls.
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    let waiting!: () => void;
    const isWaiting = new Promise<void>((resolve) => { waiting = resolve; });
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false,
      findingsLedger: true, findingsLedgerAccounts: "all", findingsLedgerMemory: memory,
      secondReader: { enabled: true, readAnswer: async (draft) => {
        if (draft.includes(EDITED)) { waiting(); await released; }
        return reading(draft.includes(WARNING) ? WARNING : EDITED) as never;
      } } });
    const client = new Client({ name: "findings-ledger-race-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const call = async (input: Record<string, unknown>) => {
        const response = await client.callTool({ name: "finalize_research", arguments: withSourceReading(input) });
        expect(response.isError).not.toBe(true);
        return response.structuredContent as FinalizeResearchOutput;
      };
      // One chat's calls, each carrying the turn's round token and the carried state (Fable's check of 17 Nov 2026).
      const state = (previous: FinalizeResearchOutput) =>
        ({ carried_state: previous.carry_forward, round_token: previous.round_token });
      const first = await call(fixture());
      const late = call(withLedger({ ...fixture(EDITED), ...state(first) }, { findings_ledger: first.findings_ledger }));
      await isWaiting;
      const second = await call(withLedger({ ...fixture(), ...state(first) }, { findings_ledger: first.findings_ledger }));
      await call(withLedger({ ...fixture(), ...state(second) }, { findings_ledger: second.findings_ledger }));
      expect(memory.get(key)![0]!.payload.seq).toBe(3);
      release();
      const last = await late;
      // It passed the first ledger, older than the latest: it continues from the latest, and the memory moves on.
      expect(last.check_findings!.ledger).toBe("replayed");
      expect(memory.get(key)![0]!.payload.seq).toBe(4);
    } finally { await client.close(); await server.close(); }
  });

  it("4: never gives two findings one id, and signs no ledger that does", () => {
    const first = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft one." }));
    const id = first.checkFindings.findings[0]!.id;
    // A edited into B keeps A's id; then A and B both appear: B keeps the id, and A, whose own first id that is, gets
    // another.
    const edited = findingsLedger(params({ observed: [draftNote(EDITED)], draft: "Draft two.",
      raw: { later_inputs: { findings_ledger: first.token } } }));
    expect(edited.checkFindings.findings[0]!.id).toBe(id);
    const both = findingsLedger(params({ observed: [draftNote(WARNING), draftNote(EDITED)], draft: "Draft three.",
      raw: { later_inputs: { findings_ledger: edited.token } } }));
    const ids = both.checkFindings.findings.map((finding) => finding.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(both.checkFindings.findings.find(({ text }) => text?.includes("some adults"))!.id).toBe(id);
    const signed = verifyFindingsLedger(both.token, SECRET);
    const entries = signed.ok ? signed.payload.e : [];
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    // A payload giving two findings one id is refused, so no token is issued for it.
    const payload = verifyFindingsLedger(edited.token, SECRET);
    const one = payload.ok ? payload.payload : (undefined as never);
    expect(() => issueFindingsLedger({ ...one, e: [one.e[0]!, { ...one.e[0]!, f: "0123456789abcdef" }] }, SECRET))
      .toThrow();
  });

  it("5: keeps every open finding addressable, and says so whenever the ledger can't carry them all", () => {
    const entriesOf = (token: string | undefined) => {
      const verified = verifyFindingsLedger(token, SECRET);
      return verified.ok ? verified.payload.e : [];
    };
    // Sixty-five: every one listed, carried and named in the text.
    const observed = Array.from({ length: 65 }, (_, index) => note(`Finding number ${index} ${"word ".repeat(index % 7)}`));
    const result = findingsLedger(params({ observed }));
    expect(result.checkFindings.findings).toHaveLength(65);
    expect(entriesOf(result.token)).toHaveLength(65);
    const text = findingsLedgerGuidance(result.checkFindings, result.token);
    for (const { id } of result.checkFindings.findings) expect(text).toContain(`- ${id} `);
    // More than one token can hold (the re-review of 17 Nov 2026, finding 3): all listed, the token carries as many as
    // fit, and the rest are named. Each with as many distinct words as a real note, so each
    // record carries a full sketch.
    const many = Array.from({ length: 1_500 }, (_, index) => note(`Distinct finding ${Array.from({ length: 20 }, (_, word) =>
      `w${((index + 1) * (word + 7_919) * 104_729).toString(36)}`).join(" ")}`));
    const big = findingsLedger(params({ observed: many }));
    expect(big.checkFindings.findings).toHaveLength(1_500);
    expect(big.token!.length).toBeLessThanOrEqual(24_000);
    const carried = entriesOf(big.token);
    expect(carried.length).toBeGreaterThan(60);
    expect(carried.length).toBeLessThan(1_500);
    const left = big.checkFindings.findings.filter(({ id }) => !carried.some((entry) => entry.id === id));
    const said = big.notes.join(" ");
    expect(said).toContain(`carries ${carried.length} of this research's 1500 open findings`);
    expect(said).toContain(left[0]!.id);
    // The next check, continuing from that ledger, says the ledger it was given was incomplete.
    const next = findingsLedger(params({ observed: many.slice(0, 10), raw: { later_inputs: { findings_ledger: big.token } } }));
    expect(next.notes.join(" ")).toContain(`could not carry ${left.length} open findings`);
    // Settled findings it drops to stay within its size are said too, never silently.
    const settledLedger = findingsLedger(params({ observed: [], draft: "Every one fixed.",
      raw: { later_inputs: { findings_ledger: big.token } } }));
    expect(settledLedger.checkFindings.findings.filter(({ disposition }) => disposition === "fixed")).toHaveLength(
      carried.length);
  });

  it("6: sweeps what it remembers after two hours, keeps no reason it no longer needs, and says the token is readable", () => {
    const memory = createFindingsLedgerMemory();
    const key = (target: string) => findingsLedgerMemoryKey(SECRET, "acct-a", target);
    const at = NOW.getTime();
    const one = findingsLedger(params({ target: "One target", observed: [draftNote(WARNING)] }));
    memory.update(key("One target"), () => one.remember, at);
    // A later call for another target sweeps the first, never fetched again, once its two hours are over.
    const two = findingsLedger(params({ target: "Another target", observed: [draftNote(WARNING)] }));
    memory.update(key("Another target"), () => two.remember, at + FINDINGS_LEDGER_MEMORY_MS + 1);
    expect(memory.size()).toBe(1);
    // With no call at all, a timer sweeps it.
    vi.useFakeTimers();
    try {
      const idle = createFindingsLedgerMemory();
      idle.update(key("One target"), () => one.remember);
      vi.advanceTimersByTime(FINDINGS_LEDGER_MEMORY_MS + 2_000);
      expect(idle.size()).toBe(0);
    } finally { vi.useRealTimers(); }
    // A dispute's reason is kept in the token while the finding is disputed, and dropped once it is settled; the memory
    // holds only its digest (the re-review of 17 Nov 2026, finding 6), and no words of the findings or the answer.
    const id = one.checkFindings.findings[0]!.id;
    const reason = "A reason that only a disputed finding needs.";
    const disputed = findingsLedger(params({ target: "One target", observed: [draftNote(WARNING)], raw: { later_inputs: {
      findings_ledger: one.token, finding_responses: [{ id, response: "disputed", reason }] } } }));
    expect(JSON.stringify(disputed.remember)).not.toContain(reason);
    const disputedToken = verifyFindingsLedger(disputed.token, SECRET);
    expect(JSON.stringify(disputedToken.ok ? disputedToken.payload : {})).toContain(reason);
    const fixed = findingsLedger(params({ target: "One target", observed: [], draft: "The fixed draft.",
      raw: { later_inputs: { findings_ledger: disputed.token } } }));
    expect(JSON.stringify(fixed.remember)).not.toContain(reason);
    const settled = verifyFindingsLedger(fixed.token, SECRET);
    expect(JSON.stringify(settled.ok ? settled.payload : {})).not.toContain(reason);
    expect(JSON.stringify(disputed.remember)).not.toMatch(/Coffee|blood pressure|A draft/u);
    // What the token carries, and that whoever holds it can read it, is said where the result describes it.
    const described = finalizeResearchOutputSchema.shape.findings_ledger.description!;
    expect(described).toContain("not encrypted");
    expect(described).toContain("dispute reasons");
  });

  it("8: says the sixth stop only as the check applies it", () => {
    const sixth = WHAT_STOPS.find(({ rule: name }) => name === "plain_answer_comparison")!.scope;
    // It stops only with the registered plain answer's receipt passed and the account's note on, for a comparison
    // missing or leaving a claim out; a change the research doesn't back is a note.
    expect(sixth).toContain("receipt of the plain answer");
    expect(sixth).toContain("plain-answer note is on");
    expect(sixth).toContain("plain_answer_comparison missing, or leaving out a claim");
    expect(sixth).toContain("a change the research doesn't back is a note, not a stop");
    expect(WHAT_STOPS_TEXT).toContain(sixth);
    expect(WHAT_STOPS_TEXT.length).toBeLessThan(1_600);
  });
});

// Codex's re-review of 17 Nov 2026 (re-review.md), one regression for each failure it found.
describe("the re-review of 17 Nov 2026", () => {
  const SENTENCE = "Pain fell by 12 points in the exercise group at 6 months, against 3 points with usual care.";
  const CONCLUSION = "Exercise therapy reduced pain, though the effect was small and faded after a year.";
  const sourceLine = (source: string) => ({ source, claim: "Exercise eased knee pain a little.", sentence: SENTENCE,
    conclusion: CONCLUSION, against: "A larger trial found no difference after a year." });
  const looked = (source: string, sentence: "found" | "not_found") =>
    ({ source, sentence, conclusion: "found", text: "full_text" }) as const;

  it("1: keeps a removed source line's finding not rechecked while another line is checked", () => {
    const quoted = `[Autre] [Autre étude](https://doi.org/10.1000/other). "${SENTENCE}" "${CONCLUSION}"`;
    const twoSources = { receipts: [
      issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET }),
      issueResearchReceipt("study_audit", { doi: "10.1000/other", content: "b".repeat(16) }, { secret: SECRET })],
    key_sources: [
      { id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" },
      { id: "10.1000/other", status: "validated", read_depth: "full_text_audited", answer_marker: "[Autre]" }] } as
      Partial<FinalizeResearchInput>;
    const first = finalizeResearch(fixture(quoted, { ...twoSources,
      source_lines: [sourceLine("10.1000/depth"), sourceLine("10.1000/other")] } as Partial<FinalizeResearchInput>),
    { ...options(undefined), sourceLineLookups: [looked("10.1000/depth", "found"), looked("10.1000/other", "not_found")] });
    expect(first.next_steps).toEqual([]);
    expect(first.status).toBe("ready_with_limits");
    const bad = first.check_findings!.findings.find(({ text }) => text?.startsWith("The sentence given for [Autre]"))!;
    expect(bad).toMatchObject({ disposition: "open" });
    // The bad line taken out of source_lines, the good one kept and checked, the draft unchanged: the bad line was not
    // looked up again, so its finding is not fixed.
    const removed = finalizeResearch(withLedger(fixture(quoted, { ...twoSources,
      source_lines: [sourceLine("10.1000/depth")] } as Partial<FinalizeResearchInput>),
    { findings_ledger: first.findings_ledger }), { ...options(undefined), sourceLineLookups: [looked("10.1000/depth", "found")] });
    expect(removed.check_findings!.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bad.id, disposition: "not_rechecked" })]));
    // Its line looked up again and found: fixed.
    const again = finalizeResearch(withLedger(fixture(quoted, { ...twoSources,
      source_lines: [sourceLine("10.1000/depth"), sourceLine("10.1000/other")] } as Partial<FinalizeResearchInput>),
    { findings_ledger: removed.findings_ledger }),
    { ...options(undefined), sourceLineLookups: [looked("10.1000/depth", "found"), looked("10.1000/other", "found")] });
    expect(again.check_findings!.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: bad.id, disposition: "fixed" })]));
  });

  it("2: records a dispute given while the check that found the finding did not run", () => {
    const first = findingsLedger(params({ observed: [draftNote(WARNING)] }));
    const id = first.checkFindings.findings[0]!.id;
    const reason = "The sentence reports a guideline's wording, not a claim of this answer.";
    // No draft in the call: the finding wasn't looked for again, but the dispute is the writer's, and counts.
    const skipped = findingsLedger(params({ observed: [], draft: undefined, raw: { later_inputs: {
      findings_ledger: first.token, finding_responses: [{ id, response: "disputed", reason }] } } }));
    expect(skipped.checkFindings.findings[0]).toMatchObject({ id, disposition: "not_rechecked" });
    expect(skipped.notes.join(" ")).not.toContain("not a finding");
    const again = findingsLedger(params({ observed: [draftNote(WARNING)],
      raw: { later_inputs: { findings_ledger: skipped.token } } }));
    expect(again.checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed", reason });
  });

  // Each with as many distinct words as a real note, so each record carries a full sketch.
  const distinct = (count: number) => Array.from({ length: count }, (_, index) => note(`Distinct finding ${Array.from(
    { length: 20 }, (_, word) => `w${((index + 1) * (word + 7_919) * 104_729).toString(36)}`).join(" ")}`));
  const entriesOf = (token: string | undefined) => {
    const verified = verifyFindingsLedger(token, SECRET);
    return verified.ok ? verified.payload.e : [];
  };

  it("3: carries every open finding of a large check, and keeps saying so when a ledger could not", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const at = NOW.getTime();
    // A hundred and fifty findings of words that share none: each carried whole (the third review of 17 Nov 2026,
    // finding 2; a token holds 195 such findings).
    const many = distinct(150);
    const big = findingsLedger(params({ observed: many }));
    memory.update(key, () => big.remember, at);
    expect(big.token!.length).toBeLessThanOrEqual(24_000);
    expect(entriesOf(big.token)).toHaveLength(150);
    // A dispute of the last finding listed, then the same check again: the dispute stays.
    const last = big.checkFindings.findings.at(-1)!.id;
    const reason = "The note restates the guideline the answer quotes.";
    const disputed = findingsLedger(params({ observed: many, remembered: memory.get(key, at), raw: { later_inputs: {
      findings_ledger: big.token, finding_responses: [{ id: last, response: "disputed", reason }] } } }));
    memory.update(key, () => disputed.remember, at);
    expect(disputed.checkFindings.findings.find(({ id }) => id === last)).toMatchObject({ disposition: "disputed", reason });
    const unchanged = findingsLedger(params({ observed: many, remembered: memory.get(key, at),
      raw: { later_inputs: { findings_ledger: disputed.token } } }));
    expect(unchanged.checkFindings.findings.find(({ id }) => id === last)).toMatchObject({ disposition: "disputed", reason });
    // More than a token holds: what was left out is said at every later check, not only the next.
    const huge = findingsLedger(params({ observed: distinct(1_500) }));
    const left = 1_500 - entriesOf(huge.token).length;
    expect(left).toBeGreaterThan(0);
    const next = findingsLedger(params({ observed: distinct(10), raw: { later_inputs: { findings_ledger: huge.token } } }));
    const after = findingsLedger(params({ observed: [], raw: { later_inputs: { findings_ledger: next.token } } }));
    for (const result of [next, after]) expect(result.notes.join(" ")).toContain(`could not carry ${left} open findings`);
  });

  it("4: never issues a token that its own check refuses", () => {
    // Many disputes with one long reason: a short token that inflates past what a token may hold.
    const reason = "The note restates the guideline the answer quotes, word for word. ".repeat(5).slice(0, 300).trim();
    const result = findingsLedger(params({ observed: distinct(800).map((finding) => ({ ...finding, disputed: reason })) }));
    expect(result.token).toBeDefined();
    expect(verifyFindingsLedger(result.token, SECRET).ok).toBe(true);
    expect(result.notes.join(" ")).toContain("are listed in check_findings but not carried");
  });

  it("6: remembers no reason's words, keeps a dispute without them, and takes them back only from a matching ledger", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const at = NOW.getTime();
    const call = (raw: Record<string, unknown>) => {
      const result = findingsLedger(params({ observed: [draftNote(WARNING)], raw, remembered: memory.get(key, at) }));
      memory.update(key, () => result.remember, at);
      return { result, finding: result.checkFindings.findings[0]! };
    };
    const first = call({});
    const id = first.finding.id;
    const reason = "The sentence reports a guideline's wording, not a claim of this answer.";
    const disputed = call({ later_inputs: { findings_ledger: first.result.token,
      finding_responses: [{ id, response: "disputed", reason }] } });
    expect(disputed.finding).toMatchObject({ id, disposition: "disputed", reason });
    // The server's memory keeps the reason's digest, not its words.
    expect(JSON.stringify(memory.get(key, at))).not.toMatch(/guideline|wording/u);
    // The ledger left out: the finding is still disputed, and the result says its reason isn't available.
    const omitted = call({});
    expect(omitted.result.checkFindings.ledger).toBe("omitted");
    expect(omitted.finding).toMatchObject({ id, disposition: "disputed" });
    expect(omitted.finding.reason).toBeUndefined();
    expect(omitted.result.notes).toContain(`${id} is still disputed, but its reason isn't available for this check. ` +
      "AskRigor doesn't keep a reason's words, and no findings_ledger this call passed back that AskRigor could verify " +
      "has it. Give the reason again in later_inputs.finding_responses so the reader sees it.");
    // An older ledger whose reason matches the one remembered gives it back.
    const restored = call({ later_inputs: { findings_ledger: disputed.result.token } });
    expect(restored.result.checkFindings.ledger).toBe("replayed");
    expect(restored.finding).toMatchObject({ id, disposition: "disputed", reason });
    // Disputed again for another reason, an older ledger never brings the earlier reason back.
    const later = "A later reason: the guideline is quoted, and the answer says so.";
    call({ later_inputs: { findings_ledger: restored.result.token, finding_responses: [{ id, response: "disputed",
      reason: later }] } });
    const stale = call({ later_inputs: { findings_ledger: disputed.result.token } });
    expect(stale.result.checkFindings.ledger).toBe("replayed");
    expect(stale.finding).toMatchObject({ id, disposition: "disputed" });
    expect(stale.finding.reason).toBeUndefined();
  });

  it("7: gives a ledger note once in a turn, as the check gives its own notes", () => {
    const first = finalizeResearch(fixture(), options(WARNING));
    expect(first.notes).toContain(FINDINGS_LEDGER_NOTE);
    expect(first.carry_forward).toBeDefined();
    const second = finalizeResearch(withLedger({ ...fixture(), carried_state: first.carry_forward,
      round_token: first.round_token }, { findings_ledger: first.findings_ledger }), options(WARNING));
    expect(second.check_findings!.ledger).toBe("continued");
    expect(second.notes ?? []).not.toContain(FINDINGS_LEDGER_NOTE);
    // A new note of the ledger is still given.
    const skipped = finalizeResearch(withLedger({ ...fixture(), carried_state: second.carry_forward,
      round_token: second.round_token }, { findings_ledger: second.findings_ledger }), { ...options(WARNING),
      secondReading: { status: "skipped", reason: SECOND_READING_LEFT_TO_CALLER } });
    expect((skipped.notes ?? []).join(" ")).toContain("was not checked again");
  });
});

describe("the third review of 17 Nov 2026", () => {
  const SENTENCE = "Pain fell by 12 points in the exercise group at 6 months, against 3 points with usual care.";
  const OTHER = "Function improved by 8 points in the exercise group at 6 months, against 2 points with usual care.";
  const CONCLUSION = "Exercise therapy reduced pain, though the effect was small and faded after a year.";
  const line = (source: string, sentence = SENTENCE) => ({ source, claim: "Exercise eased knee pain a little.", sentence,
    conclusion: CONCLUSION, against: "A larger trial found no difference after a year." });
  const looked = (source: string, sentence: "found" | "not_found") =>
    ({ source, sentence, conclusion: "found", text: "full_text" }) as const;
  const twoSources = { receipts: [
    issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET }),
    issueResearchReceipt("study_audit", { doi: "10.1000/other", content: "b".repeat(16) }, { secret: SECRET })],
  key_sources: [
    { id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" },
    { id: "10.1000/other", status: "validated", read_depth: "full_text_audited", answer_marker: "[Autre]" }] } as
    Partial<FinalizeResearchInput>;
  const quoted = `[Autre] [Autre étude](https://doi.org/10.1000/other). "${SENTENCE}" "${OTHER}" "${CONCLUSION}"`;
  const linked = "[Autre] [Autre étude](https://doi.org/10.1000/other).";
  const withLines = (lines: Array<ReturnType<typeof line>>, later: Record<string, unknown> = {}) =>
    withLedger(fixture(quoted, { ...twoSources, source_lines: lines } as Partial<FinalizeResearchInput>), later);
  const lookups = (...given: Array<ReturnType<typeof looked>>) => ({ ...options(undefined), sourceLineLookups: given });
  const byId = (output: FinalizeResearchOutput, id: string) => output.check_findings!.findings.find((found) => found.id === id);
  const sentenceNote = (output: FinalizeResearchOutput) =>
    output.check_findings!.findings.find(({ text }) => text?.startsWith("The sentence given for [Autre]"))!;
  const entriesOf = (token: string | undefined) => {
    const verified = verifyFindingsLedger(token, SECRET);
    return verified.ok ? verified.payload.e : [];
  };

  it("1: keeps a source line's finding not rechecked when another line of its source takes its place", () => {
    const first = finalizeResearch(withLines([line("10.1000/depth"), line("10.1000/other")]),
      lookups(looked("10.1000/depth", "found"), looked("10.1000/other", "not_found")));
    const bad = sentenceNote(first);
    expect(bad).toMatchObject({ disposition: "open" });
    // Another line of the same source in its place, looked up and found, the draft unchanged: the bad passage was not
    // looked up again.
    const replaced = finalizeResearch(withLines([line("10.1000/depth"), line("10.1000/other", OTHER)],
      { findings_ledger: first.findings_ledger }), lookups(looked("10.1000/depth", "found"), looked("10.1000/other", "found")));
    expect(byId(replaced, bad.id)).toMatchObject({ disposition: "not_rechecked" });
    // The bad line looked up again and found: fixed.
    const again = finalizeResearch(withLines([line("10.1000/depth"), line("10.1000/other")],
      { findings_ledger: replaced.findings_ledger }), lookups(looked("10.1000/depth", "found"), looked("10.1000/other", "found")));
    expect(byId(again, bad.id)).toMatchObject({ disposition: "fixed" });
  });

  it("1: keeps what a finding was about through a check that still finds it, until each line is looked up again", () => {
    // Two bad lines of one source give one finding; one is taken out while the other still gives it.
    const first = finalizeResearch(withLines([line("10.1000/other"), line("10.1000/other", OTHER)]),
      lookups(looked("10.1000/other", "not_found"), looked("10.1000/other", "not_found")));
    const bad = sentenceNote(first);
    const one = finalizeResearch(withLines([line("10.1000/other", OTHER)], { findings_ledger: first.findings_ledger }),
      lookups(looked("10.1000/other", "not_found")));
    expect(byId(one, bad.id)).toMatchObject({ disposition: "open" });
    // The line kept is found now; the one taken out was never looked up again.
    const found = finalizeResearch(withLines([line("10.1000/other", OTHER)], { findings_ledger: one.findings_ledger }),
      lookups(looked("10.1000/other", "found")));
    expect(byId(found, bad.id)).toMatchObject({ disposition: "not_rechecked" });
  });

  const CLAIM_BAD = "Exercise eased knee pain in the other trial.";
  const CLAIM_GOOD = "Exercise eased knee pain in the audited trial.";
  const claimOf = (quote: string, study: string, passage: string) =>
    ({ quote, studies: [study], groups: 1, passages: [{ study, passage }] });
  const BAD_CLAIM = claimOf(CLAIM_BAD, "O", OTHER);
  const GOOD_CLAIM = claimOf(CLAIM_GOOD, "D", SENTENCE);
  const mapped = (claims: Array<ReturnType<typeof claimOf>>, later: Record<string, unknown> = {}) =>
    withLedger(fixture(`[Autre] [Autre étude](https://doi.org/10.1000/other).\n\n${CLAIM_BAD}\n\n${CLAIM_GOOD}`, {
      ...twoSources, study_map: {
      studies: [{ id: "D", source: "10.1000/depth", group: "Adults with knee pain, Exampleton, 2025" },
        { id: "O", source: "10.1000/other", group: "Adults with knee pain, Sampleville, 2024" }],
      claims } } as Partial<FinalizeResearchInput>), later);
  const mapLookup = (...claims: Array<"found" | "not_found">) => ({ ...options(undefined), studyMapLookup: {
    done: true, studies: [0, 1].map(() => ({ text: "full_text" as const, registry: [], abstractNumbers: [] })),
    links: [], claims: claims.map((outcome) => [outcome]), records: [] } });

  it("1: keeps a removed study_map claim's finding not rechecked while another claim is kept and checked", () => {
    const first = finalizeResearch(mapped([BAD_CLAIM, GOOD_CLAIM]), mapLookup("not_found", "found"));
    const bad = first.check_findings!.findings.find(({ text }) => text?.startsWith("The passage given in study_map.claims[0]"))!;
    expect(bad).toMatchObject({ disposition: "open" });
    // The bad claim taken out, the other kept (now at its place) and found, the draft unchanged.
    const removed = finalizeResearch(mapped([GOOD_CLAIM], { findings_ledger: first.findings_ledger }), mapLookup("found"));
    expect(byId(removed, bad.id)).toMatchObject({ disposition: "not_rechecked" });
    // The bad claim given again, and its passage found: fixed.
    const again = finalizeResearch(mapped([BAD_CLAIM, GOOD_CLAIM], { findings_ledger: removed.findings_ledger }),
      mapLookup("found", "found"));
    expect(byId(again, bad.id)).toMatchObject({ disposition: "fixed" });
  });

  it("2: keeps each finding a ledger carries matched through an edit of its quoted value, with its dispute", () => {
    // More findings than a token carries, each quoting twenty words that share little.
    const quotes = Array.from({ length: 400 }, (_, index) => Array.from({ length: 20 }, (_, word) =>
      `w${((index + 1) * (word + 7_919) * 104_729).toString(36)}`).join(" "));
    const first = findingsLedger(params({ observed: quotes.map(draftNote) }));
    const carried = entriesOf(first.token);
    // Every finding carried keeps what matches it through an edit: its rule and its words' sketch.
    expect(carried.filter(({ r, h }) => r === undefined || h === undefined).map(({ id }) => id)).toEqual([]);
    // One near the end of what is carried, disputed, then its quoted value given one more word.
    const target = carried.at(-3)!.id;
    const at = first.checkFindings.findings.findIndex(({ id }) => id === target);
    const reason = "The note restates the guideline the answer quotes.";
    const disputed = findingsLedger(params({ observed: quotes.map(draftNote), raw: { later_inputs: {
      findings_ledger: first.token, finding_responses: [{ id: target, response: "disputed", reason }] } } }));
    expect(entriesOf(disputed.token).map(({ id }) => id)).toContain(target);
    const edited = findingsLedger(params({ observed: quotes.map((quote, index) => draftNote(index === at ? `${quote} again` : quote)),
      draft: "Draft two.", raw: { later_inputs: { findings_ledger: disputed.token } } }));
    expect(edited.checkFindings.findings[at]).toMatchObject({ id: target, disposition: "disputed", reason });
    expect(edited.checkFindings.findings.filter(({ disposition }) => disposition === "fixed")).toEqual([]);
    // What the token could not carry is said.
    expect(first.notes.join(" ")).toContain("are listed in check_findings but not carried");
  });

  it("3: settles a removed line's finding as withdrawn only by its own passage, once the draft no longer has it", () => {
    // Two bad lines, one of each source, each its own finding.
    const first = finalizeResearch(withLines([line("10.1000/depth", OTHER), line("10.1000/other")]),
      lookups(looked("10.1000/depth", "not_found"), looked("10.1000/other", "not_found")));
    const bad = sentenceNote(first);
    const otherBad = first.check_findings!.findings.find(({ text }) => text?.startsWith("The sentence given for [Texte lu]"))!;
    expect(otherBad).toMatchObject({ disposition: "open" });
    const withdraw = (draftText: string, passage: string) => finalizeResearch(withLedger(fixture(draftText,
      twoSources), { findings_ledger: first.findings_ledger, finding_responses: [{ id: bad.id, response: "withdrawn",
      passage }] }), lookups());
    // Both lines taken out of source_lines. The draft still quoting the passage: not withdrawn.
    const still = withdraw(quoted, SENTENCE);
    expect(byId(still, bad.id)).toMatchObject({ disposition: "not_rechecked" });
    expect(still.notes).toContain(`${bad.id}: the passage later_inputs.finding_responses withdraws still appears in the draft.`);
    // A passage the draft doesn't have, but that the finding was never about, settles nothing: another finding's own
    // passage, or any other.
    for (const passage of [OTHER, "Some sentence this finding was never about, which no draft gives."]) {
      const unbound = withdraw(linked, passage);
      expect(byId(unbound, bad.id)).toMatchObject({ disposition: "not_rechecked" });
      expect(unbound.notes).toContain(`${bad.id} stays as it was: a withdrawal counts only with a passage the finding ` +
        "objects to, of a line it was about, that the draft no longer gives.");
    }
    // Its own passage, gone from the draft: withdrawn, with the warning that what rested on it may remain.
    const gone = withdraw(linked, SENTENCE);
    expect(byId(gone, bad.id)).toMatchObject({ disposition: "withdrawn" });
    expect(gone.notes).toContain(`${bad.id} was withdrawn: its passage is gone from the draft, but a paraphrase of it, ` +
      "or a claim that rested on it, may still be there.");
    expect(byId(gone, otherBad.id)).toMatchObject({ disposition: "not_rechecked" });
  });

  // Codex's fourth review of 17 Nov 2026, finding 1: a withdrawal is bound to the passage the finding objects to, and
  // settles a finding only when every line it was about is looked up again or withdrawn.
  const leaves = (id: string) => `${id} stays as it was: a line it was about that was not looked up again has another ` +
    "passage the finding objects to, and a withdrawal settles a finding only when it leaves none. Give that line again " +
    "so it is looked up.";

  it("3: withdraws a removed line's finding only by the passage it objects to, never by a good quote beside it", () => {
    // The sentence not found, the conclusion found.
    const first = finalizeResearch(withLines([line("10.1000/other")]), lookups(looked("10.1000/other", "not_found")));
    const bad = sentenceNote(first);
    expect(bad).toMatchObject({ disposition: "open" });
    const withdraw = (draftText: string, passage: string) => finalizeResearch(withLedger(fixture(draftText,
      twoSources), { findings_ledger: first.findings_ledger, finding_responses: [{ id: bad.id, response: "withdrawn",
      passage }] }), lookups());
    // The line taken out of source_lines; the good conclusion gone from the draft, the unfound sentence still in it
    // word for word.
    const kept = withdraw(`${linked} "${SENTENCE}"`, CONCLUSION);
    expect(byId(kept, bad.id)).toMatchObject({ disposition: "not_rechecked" });
    expect(kept.notes).toContain(`${bad.id} stays as it was: a withdrawal counts only with a passage the finding ` +
      "objects to, of a line it was about, that the draft no longer gives.");
    // The unfound sentence gone: withdrawn.
    const gone = withdraw(`${linked} "${CONCLUSION}"`, SENTENCE);
    expect(byId(gone, bad.id)).toMatchObject({ disposition: "withdrawn" });
  });

  it("3: settles a finding of several lines only when each is looked up again or withdrawn", () => {
    // Two bad lines of one source give one finding.
    const first = finalizeResearch(withLines([line("10.1000/other"), line("10.1000/other", OTHER)]),
      lookups(looked("10.1000/other", "not_found"), looked("10.1000/other", "not_found")));
    const bad = sentenceNote(first);
    const withdraw = (draftText: string, lines: Array<ReturnType<typeof line>>,
      ...given: Array<ReturnType<typeof looked>>) => finalizeResearch(withLedger(fixture(draftText,
      { ...twoSources, source_lines: lines } as Partial<FinalizeResearchInput>), { findings_ledger: first.findings_ledger,
      finding_responses: [{ id: bad.id, response: "withdrawn", passage: SENTENCE }] }), lookups(...given));
    // Both lines taken out; one bad passage gone, the other still in the draft word for word.
    const half = withdraw(`${linked} "${OTHER}" "${CONCLUSION}"`, []);
    expect(byId(half, bad.id)).toMatchObject({ disposition: "not_rechecked" });
    expect(half.notes).toContain(leaves(bad.id));
    // Both gone, but a withdrawal of one passage leaves the other line's.
    const both = withdraw(`${linked} "${CONCLUSION}"`, []);
    expect(byId(both, bad.id)).toMatchObject({ disposition: "not_rechecked" });
    expect(both.notes).toContain(leaves(bad.id));
    // The other line given again and found, the withdrawn passage gone: withdrawn.
    const checked = withdraw(`${linked} "${OTHER}" "${CONCLUSION}"`, [line("10.1000/other", OTHER)],
      looked("10.1000/other", "found"));
    expect(byId(checked, bad.id)).toMatchObject({ disposition: "withdrawn" });
  });

  it("4: says a dispute's reason isn't available, whether the ledger was left out or did not verify", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const at = NOW.getTime();
    const call = (raw: Record<string, unknown>) => {
      const result = findingsLedger(params({ observed: [draftNote(WARNING)], raw, remembered: memory.get(key, at) }));
      memory.update(key, () => result.remember, at);
      return result;
    };
    const first = call({});
    const id = first.checkFindings.findings[0]!.id;
    const reason = "The sentence reports a guideline's wording, not a claim of this answer.";
    const disputed = call({ later_inputs: { findings_ledger: first.token,
      finding_responses: [{ id, response: "disputed", reason }] } });
    const said = `${id} is still disputed, but its reason isn't available for this check. AskRigor doesn't keep a ` +
      "reason's words, and no findings_ledger this call passed back that AskRigor could verify has it. Give the reason " +
      "again in later_inputs.finding_responses so the reader sees it.";
    // The reason sent, but in a token whose signature is refused.
    const token = disputed.token!;
    const altered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    const refused = call({ later_inputs: { findings_ledger: altered } });
    expect(refused.checkFindings.ledger).toBe("rejected");
    expect(refused.checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed" });
    expect(refused.checkFindings.findings[0]!.reason).toBeUndefined();
    expect(refused.notes).toContain(said);
    // The ledger left out.
    const omitted = call({});
    expect(omitted.checkFindings.ledger).toBe("omitted");
    expect(omitted.notes).toContain(said);
    expect([...refused.notes, ...omitted.notes].join(" ")).not.toContain("wasn't passed back");
  });
});

describe("the fourth review of 17 Nov 2026", () => {
  it("2: says at each check of a turn what a ledger could not carry, through the deferred settlement path", () => {
    // About 400 findings, given after the check as a caller's own notes are: more than a token carries.
    const late = Array.from({ length: 400 }, (_, index) => draftNote(Array.from({ length: 20 }, (_, word) =>
      `w${((index + 1) * (word + 7_919) * 104_729).toString(36)}`).join(" ")));
    const deferred = { ...options(WARNING), findingsLedger: { account: "acct-a", deferred: true } };
    const call = (previous?: FinalizeResearchOutput, responses?: unknown[]) => {
      const result = finalizeResearch(previous === undefined ? fixture() : withLedger({ ...fixture(),
        carried_state: previous.carry_forward, round_token: previous.round_token }, {
        findings_ledger: previous.findings_ledger,
        ...(responses === undefined ? {} : { finding_responses: responses }) }), deferred);
      settleFindingsLedger(result, { late });
      return result;
    };
    const carried = (output: FinalizeResearchOutput) => {
      const verified = verifyFindingsLedger(output.findings_ledger, SECRET);
      return new Set(verified.ok ? verified.payload.e.map(({ id }) => id) : []);
    };
    const first = call();
    expect((first.notes ?? []).join(" ")).toContain("are listed in check_findings but not carried");
    const leftOut = first.check_findings!.findings.filter(({ id }) => !carried(first).has(id)).map(({ id }) => id);
    expect(leftOut.length).toBeGreaterThan(100);
    // A finding the token left out, disputed in the next call of the same turn.
    const target = leftOut.at(-1)!;
    const reason = "The note restates the guideline the answer quotes.";
    let previous = call(first, [{ id: target, response: "disputed", reason }]);
    expect(previous.check_findings!.ledger).toBe("continued");
    expect(previous.check_findings!.findings.find(({ id }) => id === target)).toMatchObject({ disposition: "disputed",
      reason });
    // Each later continuation of the turn says again that dispositions may be lost, while the dispute is.
    for (let continuation = 0; continuation < 4; continuation += 1) {
      const next = call(previous);
      expect(next.check_findings!.ledger).toBe("continued");
      expect(next.check_findings!.findings.find(({ id }) => id === target)).toMatchObject({ disposition: "open" });
      const said = (next.notes ?? []).join(" ");
      expect(said).toContain("An earlier findings_ledger of this research could not carry");
      expect(said).toContain("are listed in check_findings but not carried");
      previous = next;
    }
  }, 30_000);
});

// The panel's harness, as in final-check-panel.test.ts.
class Element {
  children: Element[] = [];
  text = "";
  constructor(readonly tagName: string) {}
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  set innerHTML(_value: string) { throw new Error("Result text must never be HTML"); }
  appendChild(child: Element): Element { this.children.push(child); return child; }
  replaceChildren(): void { this.children = []; this.text = ""; }
  all(tag: string): Element[] { return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.all(tag)]); }
}
function render(result: unknown) {
  const root = new Element("main");
  const document = { getElementById: (id: string) => id === "final-check-panel" ? root : null,
    createElement: (tag: string) => new Element(tag) };
  runInNewContext(`${FINAL_CHECK_PANEL_RENDER_SOURCE}\nrenderFinalCheck(document, result);`, { document, result });
  return root;
}
const OPENING = "Problems AskRigor's check found that this answer leaves open";

describe("the panel", () => {
  const findings = [
    { id: "F-0000000001", text: "A second reading found an undeclared warning.", disposition: "open", reader: true,
      first_revision: 1, last_revision: 1 },
    { id: "F-0000000002", text: "Give the absolute numbers.", disposition: "disputed", reason: "The paper gives none.",
      reader: true, first_revision: 1, last_revision: 2 },
    { id: "F-0000000003", text: "Receipt 2 did not verify.", disposition: "unresolved", reader: false,
      first_revision: 1, last_revision: 2 },
    { id: "F-0000000004", text: "Old problem.", disposition: "fixed", reader: true, first_revision: 1, last_revision: 1 },
    { id: "F-0000000005", disposition: "fixed", reader: true, first_revision: 1, last_revision: 1 },
  ];

  it("lists, folded, what a passing answer leaves open, with the AI's reason for a dispute", () => {
    const root = render({ status: "ready", check_findings: { ledger: "continued", revision: 2, findings } });
    const folds = root.children.filter(({ tagName, children }) =>
      tagName === "details" && children[0]!.textContent.startsWith(OPENING));
    expect(folds).toHaveLength(1);
    expect(folds[0]!.children[0]!.textContent).toBe(`${OPENING} (2)`);
    expect(folds[0]!.children[1]!.textContent).toBe(FINAL_CHECK_PANEL_FINDINGS_LEAD);
    expect(folds[0]!.all("li").map(({ textContent }) => textContent)).toEqual([
      "Not fixed (F-0000000001). A second reading found an undeclared warning.",
      "Disputed by the AI: The paper gives none. (F-0000000002). Give the absolute numbers.",
    ]);
  });

  it("shows nothing of it under a check that has not passed, or without findings", () => {
    expect(render({ status: "not_ready", check_findings: { ledger: "new", revision: 1, findings } }).textContent)
      .not.toContain(OPENING);
    expect(render({ status: "ready" }).textContent).not.toContain(OPENING);
    expect(render({ status: "ready", check_findings: { ledger: "new", revision: 1, findings: findings.slice(2) } })
      .textContent).not.toContain(OPENING);
  });

  it("counts the earlier problems the reader could see that were not checked again, with or without open ones", () => {
    const unchecked = [
      { id: "F-0000000006", disposition: "not_rechecked", reader: true, first_revision: 1, last_revision: 1 },
      { id: "F-0000000007", disposition: "not_rechecked", reader: true, first_revision: 1, last_revision: 1 },
      { id: "F-0000000008", disposition: "not_rechecked", reader: false, first_revision: 1, last_revision: 1 },
    ];
    const both = render({ status: "ready", check_findings: { ledger: "continued", revision: 2,
      findings: [...findings, ...unchecked] } });
    expect(both.textContent).toContain(`${OPENING} (2)`);
    expect(both.all("p").map(({ textContent }) => textContent)).toContain("2 earlier problems were not checked again.");
    // With no open finding, the line is still shown.
    const alone = render({ status: "ready_with_limits", limits: [], check_findings: { ledger: "continued", revision: 2,
      findings: unchecked.slice(1) } });
    expect(alone.textContent).not.toContain(OPENING);
    expect(alone.all("p").map(({ textContent }) => textContent)).toContain("1 earlier problem was not checked again.");
    expect(render({ status: "not_ready", check_findings: { ledger: "continued", revision: 2, findings: unchecked } })
      .textContent).not.toContain("not checked again");
    expect(render({ status: "ready", check_findings: { ledger: "continued", revision: 2, findings: unchecked.slice(2) } })
      .textContent).not.toContain("not checked again");
  });

  it("says plainly when a dispute's reason isn't available for this check", () => {
    const root = render({ status: "ready", check_findings: { ledger: "omitted", revision: 2, findings: [
      { id: "F-0000000009", text: "Give the absolute numbers.", disposition: "disputed", reader: true, first_revision: 1,
        last_revision: 2 }] } });
    expect(root.all("li").map(({ textContent }) => textContent)).toEqual([
      "Disputed by the AI. Its reason isn't available for this check. (F-0000000009). Give the absolute numbers.",
    ]);
  });

  it("lists at most twenty, and says how many more", () => {
    const many = Array.from({ length: 23 }, (_, index) => ({ ...findings[0]!, id: `F-${String(index).padStart(10, "0")}` }));
    const root = render({ status: "ready_with_limits", limits: [], check_findings: { ledger: "new", revision: 1,
      findings: many } });
    const items = root.all("li").map(({ textContent }) => textContent);
    expect(items.filter((text) => text.startsWith("Not fixed"))).toHaveLength(20);
    expect(items).toContain("And 3 more.");
  });
});

describe("what can stop an answer, said up front", () => {
  it("names only the six whole-answer stops that exist today, each in its scope", () => {
    expect(WHAT_STOPS.map(({ rule: name }) => name)).toEqual([...FINAL_CHECK_BLOCKING_RULES]);
    expect(WHAT_STOPS_TEXT).toContain("six checks stop the whole answer");
    for (const { scope } of WHAT_STOPS) expect(WHAT_STOPS_TEXT).toContain(scope);
    expect(WHAT_STOPS_TEXT).toContain("Nothing else stops it");
    // Claim holds wait for the owner's answer on how they fit with the six stops.
    expect(WHAT_STOPS_TEXT).not.toMatch(/\bhold/u);
    expect(whatStops()).toEqual({ text: WHAT_STOPS_TEXT, stops: WHAT_STOPS.map((stop) => ({ ...stop })) });
    expect(WHAT_STOPS_TEXT.length).toBeLessThan(1_600);
  });
});

describe("through the MCP tool", () => {
  it("remembers the ledger each call returns, so a call that leaves it out is noticed", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const memory = createFindingsLedgerMemory();
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false,
      findingsLedger: true, findingsLedgerAccounts: "all", findingsLedgerMemory: memory,
      secondReader: { enabled: true, readAnswer: async (draft) => reading(draft.includes(WARNING) ? WARNING : EDITED) as never } });
    const client = new Client({ name: "findings-ledger-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const call = async (input: Record<string, unknown>) => {
        const response = await client.callTool({ name: "finalize_research", arguments: withSourceReading(input) });
        expect(response.isError).not.toBe(true);
        return { output: response.structuredContent as FinalizeResearchOutput,
          text: (response.content as Array<{ text: string }>).map(({ text }) => text).join("\n") };
      };
      const first = await call(fixture());
      expect(first.output.check_findings!.ledger).toBe("new");
      expect(first.text).toContain(`Pass this as later_inputs.findings_ledger in this research's next finalize_research call: ${first.output.findings_ledger}`);
      const id = warningFinding(first.output)!.id;
      expect(first.text).toContain(`- ${id} (note; open): `);
      // The same chat, carrying its state but not the ledger (Fable's check of 17 Nov 2026: another chat, carrying none
      // of it, starts afresh).
      const second = await call({ ...fixture(EDITED), carried_state: first.output.carry_forward,
        round_token: first.output.round_token });
      expect(second.output.check_findings!.ledger).toBe("omitted");
      expect(second.output.notes!.join(" ")).toContain("left out later_inputs.findings_ledger");
      const third = await call(withLedger(fixture(EDITED), { findings_ledger: second.output.findings_ledger }));
      expect(third.output.check_findings!.ledger).toBe("continued");
    } finally { await client.close(); await server.close(); }
  });

  it("adds nothing while off", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LEDGER", "");
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "findings-ledger-off-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const response = await client.callTool({ name: "finalize_research", arguments: withSourceReading(fixture()) });
      const output = response.structuredContent as FinalizeResearchOutput;
      expect(output.check_findings).toBeUndefined();
      expect(output.findings_ledger).toBeUndefined();
      expect((response.content as Array<{ text: string }>)[0]!.text).not.toContain("findings_ledger");
    } finally { await client.close(); await server.close(); }
  });
});

// finalize_research through the MCP tool, with the ledger on for every caller and a memory of its own.
const mcp = async (run: (call: (input: Record<string, unknown>) => Promise<FinalizeResearchOutput>) => Promise<void>,
  serverOptions: Record<string, unknown> = {}) => {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false,
    findingsLedger: true, findingsLedgerAccounts: "all", findingsLedgerMemory: createFindingsLedgerMemory(),
    secondReader: { enabled: true, readAnswer: async (draft) => reading(draft.includes(WARNING) ? WARNING : undefined) as never },
    ...serverOptions });
  const client = new Client({ name: "findings-ledger-fable-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b); await client.connect(a);
    await run(async (input) => {
      const response = await client.callTool({ name: "finalize_research", arguments: withSourceReading(input) });
      expect(response.isError).not.toBe(true);
      return response.structuredContent as FinalizeResearchOutput;
    });
  } finally { await client.close(); await server.close(); }
};
// The same chat's next call: the turn's round token and the carried state of the call before.
const continuing = (previous: FinalizeResearchOutput, input = fixture()) =>
  ({ ...input, carried_state: previous.carry_forward, round_token: previous.round_token });

// Fable's check of 17 Nov 2026 (fable-check-stage1.md), before the ledger is switched on: one regression for each point.
describe("before switching on (Fable's check of 17 Nov 2026)", () => {
  it("1: starts a second chat's ledger afresh, with nothing of another chat's on the same question", async () => {
    await mcp(async (call) => {
      // The first chat disputes the second reading's finding.
      const first = await call(fixture());
      const id = warningFinding(first)!.id;
      const disputed = await call(withLedger(continuing(first), { findings_ledger: first.findings_ledger,
        finding_responses: [{ id, response: "disputed", reason: "It restates the guideline the answer quotes." }] }));
      expect(warningFinding(disputed)).toMatchObject({ id, disposition: "disputed" });
      // A second chat on the same account asks the same question, carrying none of the first chat's state.
      const other = await call(fixture());
      expect(other.check_findings!.ledger).toBe("new");
      expect(warningFinding(other)).toMatchObject({ disposition: "open" });
      expect(other.check_findings!.findings.filter(({ disposition }) => disposition === "disputed")).toEqual([]);
      expect((other.notes ?? []).join(" ")).not.toContain("left out later_inputs.findings_ledger");
      expect((other.notes ?? []).join(" ")).not.toContain("still disputed");
      // The first chat passing its own ledger back continues it, not the second chat's.
      const back = await call(withLedger(continuing(disputed), { findings_ledger: disputed.findings_ledger }));
      expect(back.check_findings!.ledger).toBe("continued");
      expect(warningFinding(back)).toMatchObject({ id, disposition: "disputed" });
    });
  });

  it("1: uses the ledger it remembers only for a call that carries that ledger's turn, carried state or token", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const turn = TURN;
    const first = findingsLedger(params({ observed: [draftNote(WARNING)], turns: { call: turn } }));
    memory.update(key, () => first.remember, NOW.getTime());
    const remembered = () => memory.get(key, NOW.getTime());
    // Another chat: a turn of its own and no carried state.
    const other = findingsLedger(params({ observed: [draftNote(WARNING)], turns: { call: "fedcba9876543210" },
      remembered: remembered() }));
    expect(other.checkFindings.ledger).toBe("new");
    expect(other.notes.join(" ")).not.toContain("left out later_inputs.findings_ledger");
    // The same turn, or a later turn carrying the state of the call that issued it, is the same chat.
    expect(findingsLedger(params({ observed: [draftNote(WARNING)], turns: { call: turn }, remembered: remembered() }))
      .checkFindings.ledger).toBe("omitted");
    expect(findingsLedger(params({ observed: [draftNote(WARNING)], turns: { call: "1111111111111111", carried: turn },
      remembered: remembered() })).checkFindings.ledger).toBe("omitted");
    // No turn at all inherits nothing.
    expect(findingsLedger(params({ observed: [draftNote(WARNING)], turns: undefined, remembered: remembered() }))
      .checkFindings.ledger).toBe("new");
  });

  it("2: shows a check that did not run apart, in one line, never as a problem not fixed", () => {
    const result = finalizeResearch(fixture(), { ...options(WARNING),
      meaningJudgment: { status: "skipped", reason: "timeout" } });
    expect(result.status).toBe("ready_with_limits");
    // The AI's note stays as it was, with its id.
    expect(result.notes).toContain("The meaning judge did not run (it timed out); this check is as it would be without it.");
    const judge = result.check_findings!.findings.find(({ text }) => text?.startsWith("The meaning judge did not run"));
    expect(judge).toMatchObject({ reader: false });
    expect(result.check_findings!.not_run).toEqual(["the meaning judge"]);
    const root = render(result);
    // The fold of problems the answer leaves open (the AI's notes keep their own fold, as on main).
    const fold = root.children.find(({ tagName, children }) =>
      tagName === "details" && children[0]!.textContent.startsWith(OPENING))!;
    const items = fold.all("li").map(({ textContent }) => textContent);
    expect(items.filter((text) => text.includes("did not run"))).toEqual([]);
    expect(items.filter((text) => text.startsWith("Not fixed"))).toHaveLength(1);
    expect(root.all("p").map(({ textContent }) => textContent)).toContain("Checks that did not run: the meaning judge.");
    // Two, in one line; none under a check that has not passed.
    const both = render({ status: "ready", check_findings: { ledger: "new", revision: 1, findings: [],
      not_run: ["the meaning judge", "AskRigor's review of the draft"] } });
    expect(both.all("p").map(({ textContent }) => textContent))
      .toContain("Checks that did not run: the meaning judge and AskRigor's review of the draft.");
    expect(render({ status: "not_ready", check_findings: { ledger: "new", revision: 1, findings: [],
      not_run: ["the meaning judge"] } }).textContent).not.toContain("did not run");
  });

  it("3: says up front exactly what stops an answer: a call it can't check, and the six checks as the code applies them", () => {
    const scope = (name: string) => WHAT_STOPS.find(({ rule: stop }) => stop === name)!.scope;
    // A call without a usable draft is not checked, and its answer is not ready.
    const blank = finalizeResearch({ ...fixture(), answer_draft: "   " }, options(WARNING));
    expect(blank).toMatchObject({ status: "not_ready", next_step_kinds: ["input_invalid"] });
    expect(WHAT_STOPS_TEXT).toContain("Without a usable answer_draft and research_target the check doesn't run");
    // A key study the answer doesn't link stops it, under source_provenance.
    const unlinked = finalizeResearch(fixture(WARNING, { answer_draft: "[Texte lu] Étude.\n\n" +
      communitySkipCaveat("Synthetic fixture isolates the findings ledger.") }), options(WARNING));
    expect(unlinked.status).toBe("not_ready");
    expect(unlinked.check_findings!.findings).toEqual(expect.arrayContaining([expect.objectContaining({
      stop: "source_provenance", text: expect.stringContaining("has no link in the answer") })]));
    expect(scope("source_provenance")).toContain("not linked in the answer");
    // Either group's figure missing from the quote stops it, not only both.
    expect(WHAT_STOPS_TEXT).not.toContain("lacks both groups' figures");
    expect(scope("numbers")).toContain("lacks either group's figure, that number or its follow-up");
    expect(WHAT_STOPS_TEXT).toContain("Nothing else stops it");
    expect(WHAT_STOPS.map(({ rule: name }) => name)).toEqual([...FINAL_CHECK_BLOCKING_RULES]);
  });

  it("4: calls them problems, never findings, in everything the reader's panel shows of them", () => {
    const texts = (root: Element) => root.all("p").concat(root.all("li"), root.all("summary"))
      .map(({ textContent }) => textContent);
    const unchecked = (id: string) => ({ id, disposition: "not_rechecked", reader: true, first_revision: 1, last_revision: 1 });
    const result = { status: "ready", check_findings: { ledger: "continued", revision: 2, not_run: ["the meaning judge"],
      findings: [
        { id: "F-0000000001", text: "Give the absolute numbers.", disposition: "open", reader: true, first_revision: 1,
          last_revision: 2 },
        { id: "F-0000000002", text: "Name the harm.", disposition: "disputed", reader: true, first_revision: 1,
          last_revision: 2 },
        unchecked("F-0000000003"), unchecked("F-0000000004")] } };
    const base = new Set(texts(render({ status: "ready" })));
    const added = texts(render(result)).filter((text) => !base.has(text));
    expect(added).toContain("2 earlier problems were not checked again.");
    expect(added.filter((text) => /finding/iu.test(text))).toEqual([]);
    expect(texts(render({ status: "ready", check_findings: { ledger: "continued", revision: 2,
      findings: [unchecked("F-0000000003")] } }))).toContain("1 earlier problem was not checked again.");
  });

  it("5: keeps the ledger to the owner's development accounts unless ASKRIGOR_FINDINGS_LEDGER_ACCOUNTS is all", async () => {
    expect(findingsLedgerAccountsFromEnv(undefined)).toBe("dev");
    expect(findingsLedgerAccountsFromEnv("everyone")).toBe("dev");
    expect(findingsLedgerAccountsFromEnv(" all ")).toBe("all");
    // A caller with no development account (here, none at all): nothing by default, the ledger with "all".
    await mcp(async (call) => {
      const output = await call(fixture());
      expect(output.check_findings).toBeUndefined();
      expect(output.findings_ledger).toBeUndefined();
    }, { findingsLedgerAccounts: undefined });
    vi.stubEnv("ASKRIGOR_FINDINGS_LEDGER_ACCOUNTS", "all");
    await mcp(async (call) => {
      expect((await call(fixture())).check_findings!.ledger).toBe("new");
    }, { findingsLedgerAccounts: undefined });
    // With the main setting off, nothing, whatever this one says.
    vi.stubEnv("ASKRIGOR_FINDINGS_LEDGER", "");
    await mcp(async (call) => {
      const output = await call(fixture());
      expect(output.check_findings).toBeUndefined();
      expect(output.findings_ledger).toBeUndefined();
    }, { findingsLedger: undefined, findingsLedgerAccounts: undefined });
  });
});

// Codex's sixth review of 17 Nov 2026 (re-review5.md): one regression for each point.
describe("Codex's sixth review of 17 Nov 2026", () => {
  const reason = "It restates the guideline the answer quotes.";

  it("1: never undoes a dispute when an older ledger of the chat comes back without the chat's state", async () => {
    await mcp(async (call) => {
      const first = await call(fixture());
      const id = warningFinding(first)!.id;
      const disputed = await call(withLedger(continuing(first), { findings_ledger: first.findings_ledger,
        finding_responses: [{ id, response: "disputed", reason }] }));
      const third = await call(withLedger(continuing(disputed), { findings_ledger: disputed.findings_ledger }));
      expect(warningFinding(third)).toMatchObject({ id, disposition: "disputed", reason });
      // The first ledger again, with no round token and no carried state: its own latest history is used.
      const replayed = await call(withLedger(fixture(), { findings_ledger: first.findings_ledger }));
      expect(replayed.check_findings!.ledger).toBe("replayed");
      expect(warningFinding(replayed)).toMatchObject({ id, disposition: "disputed" });
      const notes = replayed.notes!.join(" ");
      expect(notes).toContain("is ledger 1, not the latest (ledger 3)");
      expect(notes).toContain(`${id} is still disputed, but its reason isn't available for this check.`);
    });
  });

  it("1: keeps each chat's ledger apart: a second chat neither inherits the first's nor overwrites it", async () => {
    await mcp(async (call) => {
      const first = await call(fixture());
      const id = warningFinding(first)!.id;
      const disputed = await call(withLedger(continuing(first), { findings_ledger: first.findings_ledger,
        finding_responses: [{ id, response: "disputed", reason }] }));
      // A second chat on the same account asks the same question, and goes on without passing its ledger back.
      const other = await call(fixture());
      expect(other.check_findings!.ledger).toBe("new");
      expect(warningFinding(other)).toMatchObject({ id, disposition: "open" });
      const otherNext = await call(continuing(other));
      expect(otherNext.check_findings!.ledger).toBe("omitted");
      expect(warningFinding(otherNext)).toMatchObject({ id, disposition: "open" });
      // The first chat's first ledger, with none of its state, still finds the first chat's dispute.
      const back = await call(withLedger(fixture(), { findings_ledger: first.findings_ledger }));
      expect(back.check_findings!.ledger).toBe("replayed");
      expect(warningFinding(back)).toMatchObject({ id, disposition: "disputed" });
      // The first chat carrying its state but not its ledger continues its own ledger, not the second chat's.
      const carried = await call(continuing(disputed));
      expect(carried.check_findings!.ledger).toBe("omitted");
      expect(warningFinding(carried)).toMatchObject({ id, disposition: "disputed" });
      // Each chat's ledger names its own lineage, kept through every revision.
      const lineage = (token: unknown) => { const verified = verifyFindingsLedger(token, SECRET);
        return verified.ok ? verified.payload.lin : undefined; };
      expect(lineage(first.findings_ledger)).toMatch(/^[0-9a-f]{16}$/u);
      expect(new Set([first, disputed, back, carried].map(({ findings_ledger: token }) => lineage(token))).size).toBe(1);
      expect(lineage(otherNext.findings_ledger)).toBe(lineage(other.findings_ledger));
      expect(lineage(other.findings_ledger)).not.toBe(lineage(first.findings_ledger));
    });
  });

  it("1: remembers the latest ledger of a bounded number of chats per account and research target, and no words", () => {
    const memory = createFindingsLedgerMemory();
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    const at = NOW.getTime();
    const chat = (turn: string, raw: Record<string, unknown> = {}, now = at) => {
      const result = findingsLedger(params({ observed: [draftNote(WARNING)], turns: { call: turn }, raw,
        remembered: memory.get(key, now) }));
      memory.update(key, () => result.remember, now);
      return result;
    };
    const turns = Array.from({ length: FINDINGS_LEDGER_LINEAGES + 1 }, (_, index) => index.toString(16).padStart(16, "0"));
    const id = chat(turns[0]!).checkFindings.findings[0]!.id;
    // The first chat disputes its finding.
    expect(chat(turns[0]!, { later_inputs: { finding_responses: [{ id, response: "disputed", reason }] } })
      .checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed" });
    // As many other chats as the memory keeps for one account and target: the first chat's is kept apart from theirs.
    const others = turns.slice(1, -1).map((turn) => chat(turn));
    for (const other of others) expect(other.checkFindings.ledger).toBe("new");
    expect(memory.get(key, at)).toHaveLength(FINDINGS_LEDGER_LINEAGES);
    expect(chat(turns[0]!, {}, at + 1).checkFindings.findings[0]).toMatchObject({ id, disposition: "disputed" });
    expect(JSON.stringify(memory.get(key, at + 1))).not.toMatch(/guideline|Coffee|blood pressure/u);
    // One chat more: the chat least recently checked is forgotten, never the one just continued.
    expect(chat(turns.at(-1)!, {}, at + 2).checkFindings.ledger).toBe("new");
    expect(memory.get(key, at + 2)).toHaveLength(FINDINGS_LEDGER_LINEAGES);
    expect(chat(turns[0]!, {}, at + 3).checkFindings.ledger).toBe("omitted");
    expect(chat(turns[1]!, {}, at + 4).checkFindings.ledger).toBe("new");
    // Codex's seventh review of 17 Nov 2026, finding 1: the forgotten chat's ledger passed back is used as it is, and the
    // result says AskRigor could not check whether it is the latest; a chat still remembered is not told so.
    // The second other chat was pushed out by the last call; its ledger is passed back.
    const pushedOut = verifyFindingsLedger(others[1]!.token, SECRET);
    expect(pushedOut.ok).toBe(true);
    expect(memory.get(key, at + 4)!.map(({ payload }) => payload.lin)).not.toContain(pushedOut.ok && pushedOut.payload.lin);
    const forgotten = chat(turns[2]!, { later_inputs: { findings_ledger: others[1]!.token } }, at + 5);
    expect(forgotten.checkFindings.ledger).toBe("continued");
    expect(forgotten.notes).toContain(NOT_REMEMBERED);
    const kept = chat(turns.at(-1)!, { later_inputs: { findings_ledger: forgotten.token } }, at + 6);
    expect(kept.checkFindings.ledger).toBe("continued");
    expect(kept.notes).not.toContain(NOT_REMEMBERED);
  });

  it("2: says up front how reading depth is held as the check holds it, and what the reader's panel lists", () => {
    const scope = WHAT_STOPS.find(({ rule: stop }) => stop === "read_depth")!.scope;
    // The answer's words on how a key source was read, already in the draft, count only with their source_reading entry.
    const words = fixture(WARNING, { answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth) " +
      `(${ANSWER_READING_LABELS.full_text_audited}).\n\n${WARNING}\n\n` +
      communitySkipCaveat("Synthetic fixture isolates the findings ledger.") });
    const without = finalizeResearchUnwrapped(words, options(WARNING));
    expect(without.status).toBe("not_ready");
    expect(without.check_findings!.findings).toEqual(expect.arrayContaining([expect.objectContaining({
      stop: "read_depth", text: expect.stringContaining("is cited in the answer without saying how it was read") })]));
    expect(finalizeResearch(words, options(WARNING)).status).not.toBe("not_ready");
    expect(scope).toContain("without a later_inputs.source_reading entry giving its reading and quoting");
    expect(scope).toContain("the words alone don't count");
    // A lower reading, part of the text or less, needs no receipt; the reader's panel lists it as one the receipts
    // don't show.
    expect(scope).toContain("partial_text or less needs no receipt");
    expect(scope).toContain("the reader is told the receipts don't show it");
    // What the reader's panel lists: at most 20, and nothing about the call or a check that didn't run.
    expect(WHAT_STOPS_TEXT).not.toContain("the reader sees open and disputed ones under the answer");
    expect(WHAT_STOPS_TEXT).toContain("Under a passing answer the reader sees up to 20 problems left open or disputed");
    expect(WHAT_STOPS_TEXT).toContain("none about the call itself or a check that didn't run");
    expect(WHAT_STOPS_TEXT.split("\n")).toHaveLength(1);
  });

  it("3: with the ledger inactive, treats findings_ledger and finding_responses as unknown inputs, as main does", async () => {
    // finalize_research's later inputs on main, before the ledger.
    const main = ["community_evidence", "treatment_choice", "open_leads", "another_pass_estimate", "findings_card",
      "source_lines", "study_map", "user_observations", "community_leads", "source_reading", "name_forms", "key_name",
      "search_coverage", "claim_coverage", "findings_save", "asked", "ai_readings", "research_dossier"];
    const unknown = (name: string, names: readonly string[]) => `later_inputs.${name}: dropped. Unknown later input ` +
      `"${name}" for finalize_research. Its later inputs: ${names.join(", ")}.`;
    const later = { finding_responses: [{ id: "F-0123456789", response: "disputed", reason: "A reason." }],
      synthetic_future_input: 1 };
    const call = withLedger({ ...fixture(), findings_ledger: "fl1~top~level" }, { ...later, findings_ledger: "fl1~a~b" });
    const inactive = (notes: readonly string[] | undefined) => {
      for (const name of ["findings_ledger", "finding_responses", "synthetic_future_input"]) {
        expect(notes).toContain(unknown(name, main));
      }
      expect(notes).toContain("findings_ledger: dropped an unknown field.");
    };
    // The check itself, without the ledger.
    inactive(finalizeResearch(call, { secret: SECRET, now: () => NOW, secondReading: reading(WARNING) }).notes);
    // Through the MCP tool: the ledger off, or on for the owner's development accounts and called by another.
    await mcp(async (run) => inactive((await run(call)).notes), { findingsLedger: false });
    await mcp(async (run) => inactive((await run(call)).notes), { findingsLedgerAccounts: "dev" });
    // Active, both are read, and the guidance for an unknown input names them.
    const ledger = ["findings_ledger", "finding_responses"];
    const active = finalizeResearch(withLedger(fixture(), { ...later, findings_ledger: "fl1~a~b" }), options(WARNING));
    expect(active.notes).toContain(unknown("synthetic_future_input", [...main, ...ledger]));
    expect((active.notes ?? []).filter((text) => ledger.some((name) => text.includes(`${name}: dropped`)))).toEqual([]);
    await mcp(async (run) => {
      const output = await run(withLedger(fixture(), { ...later, findings_ledger: "fl1~a~b" }));
      expect(output.check_findings!.ledger).toBe("rejected");
      expect(output.notes).toContain(unknown("synthetic_future_input", [...main, ...ledger]));
    });
  });
});

// Codex's seventh review of 17 Nov 2026 (re-review6.md), finding 1: the server's memory of a chat's ledgers is short (8
// chats, two hours, this process). Without it, a ledger passed back is used as it is, and the result says so.
const NOT_REMEMBERED = "AskRigor no longer remembers this chat's findings ledgers, so only the findings_ledger this call " +
  "passed back was used, and AskRigor could not check whether it is the latest one.";
describe("Codex's seventh review of 17 Nov 2026", () => {
  const reason = "It restates the guideline the answer quotes.";
  // Chats of one account and research target, each with a turn of its own, sharing one memory.
  const chats = (memory = createFindingsLedgerMemory()) => {
    const key = findingsLedgerMemoryKey(SECRET, "acct-a", "A research target");
    return (turn: string, later: Record<string, unknown> = {}, now = NOW.getTime()) => {
      const result = findingsLedger(params({ observed: [draftNote(WARNING)], turns: { call: turn },
        raw: { later_inputs: later }, remembered: memory.get(key, now), now: new Date(now) }));
      memory.update(key, () => result.remember, now);
      return result;
    };
  };
  const turn = (index: number) => index.toString(16).padStart(16, "0");

  it("1: says so when a disputed chat's older ledger comes back after eight newer chats pushed that chat out", () => {
    const chat = chats();
    const at = NOW.getTime();
    const first = chat(turn(0));
    const id = first.checkFindings.findings[0]!.id;
    const disputed = chat(turn(0), { findings_ledger: first.token,
      finding_responses: [{ id, response: "disputed", reason }] }, at + 1);
    expect(disputed.notes).not.toContain(NOT_REMEMBERED);
    for (let index = 1; index <= FINDINGS_LEDGER_LINEAGES; index += 1) {
      expect(chat(turn(index), {}, at + 1 + index).checkFindings.ledger).toBe("new");
    }
    // Neither a replay nor a refusal: the first ledger is used as it is, its finding open, and the result says why.
    const back = chat(turn(0), { findings_ledger: first.token }, at + 20);
    expect(back.checkFindings.ledger).toBe("continued");
    expect(back.checkFindings.findings[0]).toMatchObject({ id, disposition: "open" });
    expect(back.notes).toContain(NOT_REMEMBERED);
    expect(back.notes.filter((text) => text === NOT_REMEMBERED)).toHaveLength(1);
  });

  it("1: says so when the chat's memory has expired after two hours", () => {
    const chat = chats();
    const at = NOW.getTime();
    const first = chat(turn(0), {}, at);
    const second = chat(turn(0), { findings_ledger: first.token }, at + 1_000);
    expect(second.checkFindings.ledger).toBe("continued");
    expect(second.notes).not.toContain(NOT_REMEMBERED);
    const late = chat(turn(0), { findings_ledger: second.token }, at + 1_000 + FINDINGS_LEDGER_MEMORY_MS + 1);
    expect(late.checkFindings.ledger).toBe("continued");
    expect(late.notes).toContain(NOT_REMEMBERED);
    // An older ledger of the same chat is used as it is too, not taken as a replay.
    const older = chat(turn(0), { findings_ledger: first.token }, at + 2_000 + 2 * FINDINGS_LEDGER_MEMORY_MS);
    expect(older.checkFindings.ledger).toBe("continued");
    expect(older.notes).toContain(NOT_REMEMBERED);
    // The rules having changed since, it is said with that note, not instead of it.
    const changed = findingsLedger(params({ observed: [draftNote(WARNING)], raw: { later_inputs: {
      findings_ledger: first.token } }, versions: { hrp: "20.6.44", universal: "20.5.40", build: "abc1234" } }));
    expect(changed.checkFindings.ledger).toBe("versions_changed");
    expect(changed.notes).toContain(NOT_REMEMBERED);
  });

  it("1: says so through the MCP tool when the server's memory is cold, as after a restart", async () => {
    let issued: FinalizeResearchOutput | undefined;
    await mcp(async (call) => {
      const first = await call(fixture());
      issued = await call(withLedger(continuing(first), { findings_ledger: first.findings_ledger }));
      expect(issued.check_findings!.ledger).toBe("continued");
      expect(issued.notes ?? []).not.toContain(NOT_REMEMBERED);
    });
    // Another server, its memory empty.
    await mcp(async (call) => {
      const restarted = await call(withLedger(fixture(), { findings_ledger: issued!.findings_ledger }));
      expect(restarted.check_findings!.ledger).toBe("continued");
      expect(warningFinding(restarted)).toMatchObject({ disposition: "open" });
      expect(restarted.notes).toContain(NOT_REMEMBERED);
      // The ledger it issued is remembered: the next call passing it back is not told so again.
      const next = await call(withLedger(continuing(restarted), { findings_ledger: restarted.findings_ledger }));
      expect(next.check_findings!.ledger).toBe("continued");
      expect(next.notes ?? []).not.toContain(NOT_REMEMBERED);
    });
  });
});
