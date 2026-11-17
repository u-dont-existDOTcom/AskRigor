import { runInNewContext } from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rule } from "../apps/research-mcp/src/check-rules.js";
import { FINAL_CHECK_PANEL_RENDER_SOURCE } from "../apps/research-mcp/src/final-check-panel.js";
import {
  FINAL_CHECK_PANEL_FINDINGS_LEAD, FINDINGS_LEDGER_NOTE, WHAT_STOPS, WHAT_STOPS_TEXT,
  createFindingsLedgerMemory, findingsLedger, findingsLedgerEnabledFromEnv, findingsLedgerGuidance,
  findingsLedgerMemoryKey, issueFindingsLedger, sketchSimilarity, verifyFindingsLedger, whatStops,
  type FindingsLedgerParams, type ObservedFinding,
} from "../apps/research-mcp/src/findings-ledger.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import {
  FINAL_CHECK_BLOCKING_RULES, SECOND_READING_LEFT_TO_CALLER, communitySkipCaveat,
  finalizeResearch as finalizeResearchUnwrapped,
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
const params = (overrides: Partial<FindingsLedgerParams>): FindingsLedgerParams => ({
  secret: SECRET, account: "acct-a", target: "A research target", versions: { hrp: "20.6.43", universal: "20.5.40", build: "abc1234" },
  raw: {}, observed: [], draft: "A draft.", now: NOW, ...overrides,
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

  it("accepts the two later inputs, read from the raw call", () => {
    expect(laterInputNames("finalize_research")).toEqual(expect.arrayContaining(["findings_ledger", "finding_responses"]));
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
    memory.remember(key, first.token!, SECRET, undefined, NOW.getTime());
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
    memory.remember(key, first.token!, SECRET, undefined, NOW.getTime());
    const second = findingsLedger(params({ observed: [draftNote(WARNING)], draft: "Draft two.",
      raw: { later_inputs: { findings_ledger: first.token } }, remembered: memory.get(key, NOW.getTime()) }));
    expect(second.checkFindings.ledger).toBe("continued");
    memory.remember(key, second.token!, SECRET, first.token, NOW.getTime());
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
    expect(WHAT_STOPS_TEXT).toContain("Six checks stop the whole answer");
    for (const { scope } of WHAT_STOPS) expect(WHAT_STOPS_TEXT).toContain(scope);
    expect(WHAT_STOPS_TEXT).toContain("Nothing else stops it");
    // Claim holds wait for the owner's answer on how they fit with the six stops.
    expect(WHAT_STOPS_TEXT).not.toMatch(/\bhold/u);
    expect(whatStops()).toEqual({ text: WHAT_STOPS_TEXT, stops: WHAT_STOPS.map((stop) => ({ ...stop })) });
    expect(WHAT_STOPS_TEXT.length).toBeLessThan(1_200);
  });
});

describe("through the MCP tool", () => {
  it("remembers the ledger each call returns, so a call that leaves it out is noticed", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const memory = createFindingsLedgerMemory();
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false,
      findingsLedger: true, findingsLedgerMemory: memory,
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
      const second = await call(fixture(EDITED));
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
