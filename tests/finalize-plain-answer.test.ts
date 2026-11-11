// Owner answer 195: these checks advise the model; only the five named integrity checks block.
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_ACCOUNT_REFERENCE_CHARACTERS,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";

import { DEV_ACCOUNT_REFERENCE_CHARACTERS, devAccountKeysFromEnv } from "../apps/research-mcp/src/config.js";
import { findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import type { FindingsSaveResult } from "../apps/research-mcp/src/findings/contracts.js";
import type { FindingsSaveContext } from "../apps/research-mcp/src/findings/service.js";
import { RESEARCH_OPERATIONS, registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  manageResearchAccessInputSchema, plainAnswerRequest
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
import {
  FINALIZE_REMINDER, FINALIZE_RESEARCH_SHAPES_DESCRIPTION, TOOL_LIST_REFRESH_HINT, finalizeResearch, meaningJudgeSourceOf,
  finalizeResearchInputSchema, forumThreadDigest, plainAnswerClaimDigest, repeatedNotesLine, type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest, issueResearchReceipt, plainAnswerAccountBinding, researchTargetDigest, verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { withSourceReading } from "./helpers/source-reading.js";
import { CARD } from "./helpers/findings-fixtures.js";
// The owner, 9 Nov 2026 (Inbox reply): the form people actually buy or make, asked for with the framing.
import { FORM_PEOPLE_USE } from "../apps/research-mcp/src/research-steering.js";

// Owner answer 190a (2026-10-27) extends 140b to every active account. Originally, 140b (2026-10-20): "for paid and dev accounts at once. Before research, the AI writes the short answer
// it would give without AskRigor's tools and AskRigor signs it with the time; the research checks each of its claims
// and looks beyond them; and the answer ends with a short note quoting the plain answer and saying what changed and
// what backs each change, on by default, with a per-account setting to turn it off."
const SECRET = "plain-answer-test-secret-0123456789abcdefghij";
const TARGET = "Whether vitamin D supplements prevent colds in adults";
const DOI = "10.1000/vitamin-d-trial";
const CLAIMS = ["Vitamin D supplements prevent colds in most adults.", "A daily dose of 1,000 IU is enough."];
const PLAIN_TEXT = `${CLAIMS[0]} ${CLAIMS[1]} Sunlight helps too.`;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
// The account the gate's calls are made for, by the binding its plain-answer receipts sign.
const ACCOUNT = plainAnswerAccountBinding(SECRET, "a".repeat(64));
// Receipts sign their issue order `t`; the research here begins at t = 2000.
const plainReceipt = (t: number, claims: readonly string[] = CLAIMS, target = TARGET, acct = ACCOUNT) =>
  issueResearchReceipt("plain_answer", {
    claims: claims.map(plainAnswerClaimDigest), text: sha256(PLAIN_TEXT), target: researchTargetDigest(target), acct, t
  }, { secret: SECRET });
const audit = (t = 2_000) => issueResearchReceipt("study_audit", {
  id: DOI, status: "complete_no_unresolved_fields", t
}, { secret: SECRET });
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the plain answer." };
const LINK = `[Trial](https://doi.org/${DOI}) was read in full.`;
const CORRECTED = "In three large trials, vitamin D did not prevent colds in adults with normal levels.";
const QUALIFIED = "The trials gave 1,000 to 4,000 IU a day, and only people low in vitamin D might benefit.";
type Comparison = NonNullable<FinalizeResearchInput["plain_answer_comparison"]>;
const COMPARISON: Comparison = [
  { claim: CLAIMS[0]!, outcome: "corrected", answer_quote: CORRECTED, sources: [DOI] },
  { claim: CLAIMS[1]!, outcome: "not_checked" }
];
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => withSourceReading(withCommunitySkip({
  receipts: [plainReceipt(1_000), audit()],
  research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: "Synthetic fixture isolates the plain answer.",
  commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the plain answer." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [],
  mechanism_claims: [], recommendations: [],
  answer_draft: `${LINK}\n\n${CORRECTED} ${QUALIFIED}`,
  plain_answer_comparison: COMPARISON,
  ...overrides
}));
// An account asked for a plain answer, with its note on, unless a test passes its setting, or null for another account.
const check = (overrides: Partial<FinalizeResearchInput> = {}, note: boolean | null = true) =>
  assertNextStepsContract(finalizeResearch(base(overrides), {
    secret: SECRET, ...(note === null ? {} : { plainAnswer: { note, account: ACCOUNT } })
  }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}) =>
  advisoryNotes(check(overrides)).filter((step) => step !== TOOL_LIST_REFRESH_HINT);
const NOTE = "Without AskRigor, a quick answer would have said: “Vitamin D supplements prevent colds in most " +
  "adults.” This research corrected that, from a full-text audit of 1 study: “In three large trials, " +
  "vitamin D did not prevent colds in adults with normal levels.” It would also have said: “A daily dose of " +
  "1,000 IU is enough.” This research did not check that.";
const NOT_CHECKED_NOTE = "Without AskRigor, a quick answer would have said: “Vitamin D supplements prevent colds in " +
  "most adults.” This research did not check that. It would also have said: “A daily dose of 1,000 IU is enough.” " +
  "This research did not check that.";
const UNTIL_CHECKED = ' Until then, the note gives this claim as "This research did not check that."';

describe("finalize_research compares the answer with the plain answer registered before research (owner answer 140b)", () => {
  it("writes the note from the comparison, quoting the registered claims exactly and naming what backs a change", () => {
    const result = check();
    expect(result).toMatchObject({
      status: "ready_with_limits", next_steps: [], plain_answer: { status: "registered", claims: 2 }
    });
    expect(result.plain_answer_note).toBe(NOTE);
    // The note is written for the end of the answer; it is not a caveat the draft must already carry.
    expect(result.caveats.join(" ")).not.toContain("quick answer would have said");
    // In the registered order, whatever the comparison's order; a qualification and a confirmation, with the work
    // behind them in the server's words.
    const both = check({ plain_answer_comparison: [
      { claim: CLAIMS[1]!, outcome: "qualified", answer_quote: QUALIFIED, sources: [DOI, `https://doi.org/${DOI.toUpperCase()}`] },
      { claim: CLAIMS[0]!, outcome: "confirmed", answer_quote: CORRECTED, sources: [DOI] }
    ] });
    expect(both.plain_answer_note).toBe("Without AskRigor, a quick answer would have said: “Vitamin D supplements " +
      "prevent colds in most adults.” This research confirmed that, from a full-text audit of 1 study: “In three large trials, vitamin D did not prevent colds in adults with normal levels.” It would also have said: “A daily dose of " +
      "1,000 IU is enough.” This research qualified that, from a full-text audit of 1 study: “The trials gave " +
      "1,000 to 4,000 IU a day, and only people low in vitamin D might benefit.”");
    // A claim copied with other quotation marks, spacing or case is the same claim.
    expect(check({ plain_answer_comparison: [
      { ...COMPARISON[0]!, claim: `  ${CLAIMS[0]!.toUpperCase()} ` }, COMPARISON[1]!
    ] })).toMatchObject({ next_steps: [], plain_answer: { status: "registered" } });
  });

  // Owner answer 279a (AskRigor#434: "every user would want to know why that 52 minutes was really worthwhile"): the
  // note ends with how long the research took, from its first research receipt to this check, by the signed times.
  it("ends the note with how long the research took, from its first research receipt to the check", () => {
    const at = (minutesAgo: number) => ({ secret: SECRET, now: () => new Date(Date.now() - minutesAgo * 60_000) });
    const plainAt = (minutesAgo: number) => issueResearchReceipt("plain_answer", {
      claims: CLAIMS.map(plainAnswerClaimDigest), text: sha256(PLAIN_TEXT), target: researchTargetDigest(TARGET),
      acct: ACCOUNT, t: 1_000
    }, at(minutesAgo));
    const auditAt = (minutesAgo: number) => issueResearchReceipt("study_audit", {
      id: DOI, status: "complete_no_unresolved_fields", t: 2_000
    }, at(minutesAgo));
    expect(check({ receipts: [plainAt(53), auditAt(52)] }).plain_answer_note)
      .toBe(`${NOTE} The research took about 52 minutes, from its first research call to this check.`);
    expect(check({ receipts: [plainAt(2), auditAt(1)] }).plain_answer_note)
      .toBe(`${NOTE} The research took about 1 minute, from its first research call to this check.`);
    // Under a minute says nothing; the plain answer's own time is not research.
    expect(check({ receipts: [plainAt(90), auditAt(0)] }).plain_answer_note).toBe(NOTE);
    expect(check({ receipts: [plainAt(201), auditAt(200)] }).plain_answer_note).toBe(`${NOTE} The research ran for ` +
      "about 3 hours from its first research call to this check, which may include time spent waiting for the " +
      "person's replies.");
  });

  // Owner answer 221: any audited study is accepted as backing, so the meaning judge, on the owner's dev accounts, reads
  // whether each change the note credits is really backed by what it names. Its doubts are notes only.
  it("gives the meaning judge the entries the note credits, and adds its doubts as notes only", () => {
    const result = check();
    // The not_checked entry is not the judge's question; the credited one keeps its place in the comparison.
    expect(meaningJudgeSourceOf(result)!.comparison).toEqual([{ ...COMPARISON[0], number: 1 }]);
    // A sentence the check accepted as a correction the research found is marked so.
    const corrections = [{ retracted: "Colds always last a week.", change: CORRECTED, by_user: false }];
    expect(meaningJudgeSourceOf(check({ corrections }))!.comparison)
      .toEqual([{ ...COMPARISON[0], number: 1, researchResult: "correction" }]);
    // An entry the note gives as not checked, such as a qualification with nothing behind it, is left out too.
    expect(meaningJudgeSourceOf(check({ plain_answer_comparison: [{ ...COMPARISON[0]!, outcome: "qualified",
      sources: ["10.1000/never-read"] }, COMPARISON[1]!] }))!.comparison).toEqual([]);
    const judged = assertNextStepsContract(finalizeResearch(base(), {
      secret: SECRET, plainAnswer: { note: true, account: ACCOUNT },
      meaningJudgment: { status: "ran", youtube: [], limits: [], standalone: [], sourceLines: [],
        comparison: [{ item: 1, backed: false, why: "The trial studied people with low levels only." },
          { item: 2, backed: false, why: "Not credited, so not judged." }] }
    }));
    expect(judged).toMatchObject({ status: result.status, next_steps: [], plain_answer_note: NOTE,
      meaning_judge: { status: "ran", held: 0, notes: 1 } });
    expect((judged.notes ?? []).filter((note) => note.startsWith("The meaning judge"))).toEqual([
      "The meaning judge doubts that plain_answer_comparison[0] is backed by what it names (The trial studied people " +
        "with low levels only). Name in its sources what shows this change, give the sentence that states what the " +
        "research found, or give it as not_checked, and check the answer again."
    ]);
  });

  it("quotes claims in any language exactly as the comparison copies them", () => {
    const claims = ["ビタミンDは大人の風邪を予防する", "Один грамм в день достаточно."];
    const corrected = "三つの大規模試験では、ビタミンDは風邪を予防しなかった。";
    const result = check({
      receipts: [plainReceipt(1_000, claims), audit()],
      answer_draft: `${LINK}\n\n${corrected}`, answer_language: "ja",
      plain_answer_comparison: [
        { claim: claims[1]!, outcome: "not_checked" },
        { claim: claims[0]!, outcome: "corrected", answer_quote: corrected, sources: [DOI] }
      ]
    });
    expect(result.plain_answer_note).toBe("Without AskRigor, a quick answer would have said: " +
      `“${claims[0]}”. This research corrected that, from a full-text audit of 1 study: “${corrected}” ` +
      `It would also have said: “${claims[1]}” This research did not check that.`);
  });

  it.each(["o354-work-left", "q137", "s359-t1"])("%s: even a sourced confirmation needs the answer's quote", () => {
    const result = check({ plain_answer_comparison: [
      { claim: CLAIMS[0]!, outcome: "confirmed", sources: [DOI] }, COMPARISON[1]!
    ] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.plain_answer_note).toBe(NOT_CHECKED_NOTE);
    expect(advisoryNotes(result)).toContain("plain_answer_comparison[0] is confirmed without answer_quote: copy the answer's own sentence for this item from answer_draft." + UNTIL_CHECKED);
    expect(result.next_step_kinds).toEqual([]);
  });

  it.each(["confirmed", "corrected", "qualified", "not_checked"] as const)(
    "q136-responders: quotes the registered figures even when absent from the draft (%s)", (outcome) => {
      const claim = "Responders were 90.3% versus 24.2%, a difference of 66.1 points and a ratio of 3.73.";
      const changed = "The research did not establish responder rates for this comparison.";
      const result = check({
        receipts: [plainReceipt(1_000, [claim]), audit()],
        answer_draft: `${LINK}\n\n${changed}`,
        plain_answer_comparison: [{ claim, outcome, ...(outcome === "not_checked" ? {} : {
          answer_quote: changed, sources: [DOI]
        }) }]
      });
      expect(result.status, advisoryNotes(result).join("\n")).toBe("ready_with_limits");
      const said = `Without AskRigor, a quick answer would have said: “${claim}”`;
      expect(result.plain_answer_note).toContain(said);
      for (const figure of ["90.3", "24.2", "66.1", "3.73"]) expect(result.plain_answer_note).toContain(figure);
      if (outcome !== "not_checked") {
        // A confirmed or qualified claim says the research did not confirm its figures; a correction replaces them.
        const unchecked = outcome === "corrected" ? "" : ", but not its figures";
        expect(result.plain_answer_note).toContain(`This research ${outcome} that, from a full-text audit of 1 study${unchecked}: “${changed}”`);
      } else expect(result.plain_answer_note).toBe(`${said} This research did not check that.`);
    });

  it("q136-symptom-scale: preserves the registered claim's notation regardless of the draft's figures", () => {
    const claim = "The measured result was １２,５%.";
    const noteFor = (answer: string) => check({
      receipts: [plainReceipt(1_000, [claim]), audit()], answer_draft: `${LINK}\n\n${answer}`,
      plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: answer, sources: [DOI] }]
    });
    const matching = noteFor("The measured result was 12.5%, with uncertainty.");
    expect(matching.status).toBe("ready_with_limits");
    expect(matching.plain_answer_note).toContain(`“${claim}”`);
    const different = noteFor("The measured result was 112.5%, with uncertainty.");
    expect(different.status).toBe("ready_with_limits");
    expect(different.plain_answer_note).toContain(claim);
    // A number hidden in a link destination is not a figure the checked answer gives its reader.
    expect(noteFor("The [result](https://example.com/12.5) has uncertainty.").plain_answer_note).toContain(claim);
    const codeClaim = "The measured result was `90.3%`.";
    const codeResult = check({
      receipts: [plainReceipt(1_000, [codeClaim]), audit()],
      plain_answer_comparison: [{ claim: codeClaim, outcome: "not_checked" }]
    });
    expect(codeResult.status).toBe("ready_with_limits");
    expect(codeResult.plain_answer_note).toContain(codeClaim);
  });

  it.each(["confirmed", "qualified"] as const)("r329/r331/q79: an unbacked %s stays in the note as not checked", (outcome) => {
    const comparison: Comparison = [
      { claim: CLAIMS[0]!, outcome, answer_quote: CORRECTED }, COMPARISON[1]!
    ];
    const missing = check({ plain_answer_comparison: comparison });
    expect(missing.status).toBe("ready_with_limits");
    expect(missing.next_steps).toEqual([]);
    expect(missing.plain_answer_note).toBe(NOT_CHECKED_NOTE);
    expect(advisoryNotes(missing)).toContain(`plain_answer_comparison[0] is ${outcome} with nothing behind it that a ` +
      "quick answer could not have: give in sources a study audited in full text here, a video whose comments " +
      "were read here or, for a claim about what people report, a forum thread read here (the link " +
      "community_searches threads_read gives), or quote as answer_quote a sentence that absence_claims also declares." + UNTIL_CHECKED);
    const backed = check({ plain_answer_comparison: [{ ...comparison[0]!, sources: [DOI] }, COMPARISON[1]!] });
    expect(backed.next_steps).toEqual([]);
    expect(advisoryNotes(backed)).not.toContain(expect.stringContaining("with nothing behind it"));
    expect(backed.plain_answer_note).toContain(`This research ${outcome} that, from a full-text audit of 1 study:`);
  });

  // Owner answer 217b (2 Nov 2026): with the account's note on, a missing comparison holds the answer back, so the note
  // always shows; with the note off it stays advice. Without the plain answer's receipt there is nothing to compare.
  it("blocks until the comparison is given while the note is on, and only advises with the note off", () => {
    const result = check({ plain_answer_comparison: undefined });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      "Give plain_answer_comparison: for each of the 2 claims of the plain answer registered before this research, " +
        "copied exactly as manage_research_access listed it, whether the research confirmed, corrected or qualified " +
        "it, or did not check it (outcome); a confirmation, correction or qualification also gives the answer's sentence stating " +
        "it (answer_quote) and what backs it (sources). The answer then ends with the note comparing the two, which " +
        "the panel also shows."
    ]);
    expect(result.next_step_kinds).toEqual(["declaration"]);
    expect(result).not.toHaveProperty("plain_answer_note");
    const off = check({ plain_answer_comparison: undefined }, false);
    expect(off.status).toBe("ready_with_limits");
    expect(advisoryNotes(off)).toEqual([
      "Give plain_answer_comparison: for each of the 2 claims of the plain answer registered before this research, " +
        "copied exactly as manage_research_access listed it, whether the research confirmed, corrected or qualified " +
        "it, or did not check it (outcome); a confirmation, correction or qualification also gives the answer's sentence stating " +
        "it (answer_quote) and what backs it (sources). Without that field, leave the plain answer's research_receipt " +
        "out of receipts: the answer then ends without the note.",
      TOOL_LIST_REFRESH_HINT
    ]);
    expect(off.finalization_receipt).toEqual(expect.any(String));
    expect(check({ plain_answer_comparison: undefined, receipts: [audit()] }).status).toBe("ready_with_limits");
  });

  it("keeps an unshown change in the note as not checked, naming the problem", () => {
    const corrected = (entry: Partial<Comparison[number]>): Comparison => [{ ...COMPARISON[0]!, ...entry }, COMPARISON[1]!];
    // #394's run: l32-negative-controls' first turn printed a correction with nothing behind it as the research's, while
    // unbacked confirmations and qualifications read "did not check that". A correction now needs the same backing.
    expect(steps({ plain_answer_comparison: corrected({ sources: undefined }) })).toEqual([
      "plain_answer_comparison[0] is corrected with nothing behind it that a quick answer could not have: give in " +
        "sources a study audited in full text here, a video whose comments were read here or, for a claim about what " +
        "people report, a forum thread read here (the link community_searches threads_read gives), or quote as " +
        "answer_quote a sentence that absence_claims also declares." + UNTIL_CHECKED
    ]);
    expect(steps({ plain_answer_comparison: corrected({ answer_quote: undefined }) })).toEqual([
      "plain_answer_comparison[0] is corrected without answer_quote: copy the answer's own sentence for this item from answer_draft." + UNTIL_CHECKED
    ]);
    expect(steps({ plain_answer_comparison: corrected({ sources: [DOI, "10.1000/never-audited"] }) })).toEqual([
      "plain_answer_comparison[0].sources lists 10.1000/never-audited, which no full-text method audit or comment audit " +
        "passed here covers and no community_searches threads_read declares: list studies audited in full text here " +
        "(DOI, PMID or PMCID), videos whose comments were read here (video ID) and forum threads read here " +
        "(the link threads_read gives), or leave sources out."
    ]);
    expect(steps({ plain_answer_comparison: corrected({ answer_quote: "Vitamin D never works." }) })).toEqual([
      "plain_answer_comparison[0].answer_quote gives text the answer does not show: copy each sentence exactly from " +
        "answer_draft." + UNTIL_CHECKED
    ]);
    expect(check({ plain_answer_comparison: corrected({ answer_quote: undefined }) }).plain_answer_note).toBe(NOT_CHECKED_NOTE);
    expect(check({ plain_answer_comparison: corrected({ answer_quote: "Vitamin D never works." }) }).plain_answer_note).toBe(NOT_CHECKED_NOTE);
    expect(check({ plain_answer_comparison: corrected({ sources: [DOI, "10.1000/never-audited"] }) }).plain_answer_note).toBe(NOTE);
    expect(check({ plain_answer_comparison: corrected({ sources: undefined }) }).plain_answer_note).toBe(NOT_CHECKED_NOTE);
  });

  it("needs each registered claim once, copied as registered", () => {
    // A claim left out holds the answer back while the note is on (owner answer 217b); extra entries stay advice.
    const left = check({ plain_answer_comparison: [COMPARISON[0]!] });
    expect(left.status).toBe("not_ready");
    expect(left.next_steps).toEqual([
      "plain_answer_comparison leaves out claim 1 of the plain answer registered before this research, as " +
        "manage_research_access numbered them: give each, copied exactly, with whether the research confirmed, " +
        "corrected or qualified it, or did not check it."
    ]);
    expect(steps({ plain_answer_comparison: [
      ...COMPARISON, { claim: CLAIMS[0]!, outcome: "confirmed" }, { claim: "Vitamin D cures colds.", outcome: "not_checked" }
    ] })).toEqual([
      "plain_answer_comparison[2] gives the same claim as plain_answer_comparison[0]: give each claim one entry.",
      "plain_answer_comparison[3].claim is not one of the 2 claims of the plain answer registered before this " +
        "research: copy it exactly as manage_research_access listed it."
    ]);
  });

  it("accepts a checked absence claim or the research's own correction as what backs a change", () => {
    const absent = "No trial has tested vitamin D against colds in children under two (searched in PubMed).";
    const search = issueResearchReceipt("literature_search", {
      src: "pubmed", q: discoveryQueryDigest(["vitamin D colds infants"]), ret: 0, n: 0, t: 3_000
    }, { secret: SECRET });
    const bounded = "Where this answer says something was not found, it means the searches made here (PubMed) did " +
      "not find it, and they did not cover older or variant terms, citation chains and grey literature; that is not " +
      "evidence that it does not exist.";
    const result = check({
      receipts: [plainReceipt(1_000), audit(), search],
      answer_draft: `${LINK}\n\n${CORRECTED} ${absent}\n\n${bounded}`,
      absence_claims: [{ quote: absent, state: "support_not_located" }],
      plain_answer_comparison: [COMPARISON[0]!, { claim: CLAIMS[1]!, outcome: "qualified", answer_quote: absent }]
    });
    expect(result).toMatchObject({
      status: "ready_with_limits",
      next_steps: []
    });
    // The claim's 1,000 IU is not in this draft, so the note says the research did not confirm its figures.
    expect(result.plain_answer_note).toContain("This research qualified that, from a check of what the evidence does " +
      `not show, but not its figures: “${absent}”`);
    const fixed = "Earlier I gave the dose in milligrams; it is 1,000 IU, about 25 micrograms.";
    const corrected = check({
      answer_draft: `${LINK}\n\n${CORRECTED} ${fixed}`,
      corrections: [{ retracted: "The dose is 1,000 mg a day.", change: fixed, by_user: false }],
      plain_answer_comparison: [COMPARISON[0]!, { claim: CLAIMS[1]!, outcome: "corrected", answer_quote: fixed }]
    });
    expect(corrected).toMatchObject({
      status: "ready_with_limits",
      next_steps: []
    });
    expect(corrected.plain_answer_note).toContain("This research corrected that, from a correction the research made " +
      `to an earlier statement: “${fixed}”`);
  });

  // The 23 Oct regressions l26, l48 and l49 author reply declared corrections of the plain answer's own claims, which the
  // user had not been shown, and l48 then asked the user to approve a bug report about one.
  it("refuses a correction of a plain-answer claim on the first turn, where no answer was shown before", () => {
    const fixed = "A daily dose of 1,000 IU is not enough for everyone; trials used 400 to 4,000 IU.";
    const correction = {
      answer_draft: `${LINK}\n\n${CORRECTED} ${fixed}`,
      corrections: [{ retracted: CLAIMS[1]!, change: fixed, by_user: false }],
      plain_answer_comparison: [COMPARISON[0]!, { claim: CLAIMS[1]!, outcome: "corrected", answer_quote: fixed }]
    } satisfies Partial<FinalizeResearchInput>;
    const result = check(correction);
    const problem = "corrections[0] takes back a claim of the plain answer written before this " +
      "research, which the user has not been shown: leave it out of corrections; plain_answer_comparison records what " +
      "the research changed.";
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result)).toContain(problem);
    expect(result.carried!.first_turn).toBe(true);
    const withinTurn = check({ ...correction, carried_state: result.carry_forward, round_token: result.round_token });
    expect(withinTurn.round?.number).toBe(1);
    expect(withinTurn.carried).toMatchObject({ turn: result.carried!.turn, first_turn: true });
    // The same notes, the problem among them, come back within the turn only as their count (5 Nov 2026).
    expect(advisoryNotes(withinTurn)).not.toContain(problem);
    expect(advisoryNotes(withinTurn)).toContain(repeatedNotesLine(advisoryNotes(result).length));
    // A new turn passes the earlier state's token without the round token: that claim may have been shown.
    const later = check({ ...correction, carried_state: result.carry_forward });
    expect(later.status).toBe("ready_with_limits");
    expect(advisoryNotes(later)).not.toContain(problem);
    expect(later.carried!.first_turn).toBe(false);
    // An unverifiable state remains a later turn, and gets no replacement, as before.
    const invalid = check({ ...correction, carried_state: "invalid", round_token: result.round_token });
    expect(advisoryNotes(invalid).join("\n")).toContain("carried_state does not verify");
    expect(advisoryNotes(invalid)).not.toContain(problem);
    expect(invalid.carry_forward).toBeUndefined();
  });

  it("gives no note, and holds nothing back, without this account's plain answer registered before this research", () => {
    const later = " For a later question, register its plain answer before researching it.";
    // #394's run: q136-weak-lead-given registered again after research began and passed only that receipt.
    const afterResearch = "The plain answer passed was registered after a research receipt passed here was issued, so " +
      "it cannot show what a quick answer would have said, and the answer ends without the note. If a plain answer for " +
      "this research target was registered before the research began, pass its research_receipt with the others: the " +
      "check compares that one. For a later question, register its plain answer before researching it, and pass only " +
      "receipts issued after it.";
    const otherDiscovery = issueResearchReceipt("youtube_search", {
      videos: [], q: "a1a1a1a1a1a1", target: researchTargetDigest("Another question"), t: 200
    }, { secret: SECRET });
    const cases: Array<[string[], string, string]> = [
      [[audit()], "no_receipt", "No plain answer registered with manage_research_access before this research was " +
        "passed in receipts, so the answer ends without the note comparing it with one. If its receipt was omitted or " +
        "failed to verify, copy the original research_receipt from manage_research_access exactly into receipts to " +
        `restore the note when the receipt verifies.${later}`],
      [[audit(), plainReceipt(2_500)], "after_research", afterResearch],
      [[plainReceipt(1_000, CLAIMS, "Another question"), audit()], "other_target", "The plain answer passed was " +
        "registered for another research target, so the answer ends without the note comparing it with this research. " +
        "If it is the quick answer to this same question, worded differently here, call again with research_target word " +
        "for word as given to register_plain_answer (only case and spacing are ignored); its result quoted it." +
        later],
      [[plainReceipt(1_000, CLAIMS, TARGET, plainAnswerAccountBinding(SECRET, "b".repeat(64))), audit()], "other_account",
        `The plain answer passed was registered by another account, so the answer ends without the note comparing it with one.${later}`],
      // Research began with the earliest receipt passed, whatever it was made for: a study audit names no research
      // target, and discovery for an earlier question came before this plain answer too.
      [[audit(500), plainReceipt(1_000), audit()], "after_research", afterResearch],
      [[otherDiscovery, plainReceipt(1_000), audit()], "after_research", afterResearch]
    ];
    for (const [receipts, status, reason] of cases) {
      for (const comparison of [undefined, COMPARISON]) {
        const result = check({ receipts, plain_answer_comparison: comparison });
        expect(result, status).toMatchObject({ status: "ready_with_limits", next_steps: [], plain_answer: { status, reason } });
        expect(result).not.toHaveProperty("plain_answer_note");
      }
    }
  });

  it("compares the latest plain answer this account signed before the research", () => {
    const earlier = plainReceipt(500, ["Vitamin D cures colds."]);
    const result = check({ receipts: [plainReceipt(1_000), earlier, audit()] });
    expect(result).toMatchObject({ next_steps: [], plain_answer: { status: "registered", claims: 2 } });
    expect(result.plain_answer_note).toBe(NOTE);
    // A second registration after research began does not replace the first, when both are passed (q136-weak-lead-given).
    const again = check({ receipts: [plainReceipt(1_000), audit(), plainReceipt(2_500, ["Vitamin D cures colds."])] });
    expect(again).toMatchObject({ next_steps: [], plain_answer: { status: "registered", claims: 2 } });
    expect(again.plain_answer_note).toBe(NOTE);
  });

  it("removes only the note when the account turned it off: the comparison is still asked for and checked", () => {
    const off = check({}, false);
    expect(off).toMatchObject({
      status: "ready_with_limits", next_steps: [],
      plain_answer: {
        status: "note_off", claims: 2,
        reason: "This account has turned off the note comparing the answer with its plain answer, so the answer ends " +
          "without it; manage_research_access with action set_plain_answer_note turns it back on."
      }
    });
    expect(off).not.toHaveProperty("plain_answer_note");
    expect(check({ plain_answer_comparison: undefined }, false).status).toBe("ready_with_limits");
  });

  it("counts a plain-answer receipt for nothing from an account not asked for one", () => {
    const free = check({}, null);
    expect(free).toMatchObject({
      status: "ready_with_limits",
      next_steps: []
    });
    expect(free).not.toHaveProperty("plain_answer");
    expect(free).not.toHaveProperty("plain_answer_note");
    expect(check({ plain_answer_comparison: undefined }, null).status).toBe("ready_with_limits");
    // The saved card's stamp counts research receipts, and a plain answer is not research.
    const verified = verifyResearchReceipt(check().finalization_receipt!, { secret: SECRET });
    expect(verified.ok && verified.claims.receipts).toBe("1");
  });

  it("gives the hidden nested input its JSON in the tool description", () => {
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).toContain("plain_answer_comparison[].sources [\"10.1000/example\"]");
    expect(finalizeResearchInputSchema.shape.plain_answer_comparison.safeParse([
      { claim: "…", outcome: "corrected", answer_quote: "…", sources: ["10.1000/example"] }
    ]).success).toBe(true);
    expect(finalizeResearchInputSchema.shape.plain_answer_comparison.safeParse([
      { claim: "…", outcome: "contradicted" }
    ]).success).toBe(false);
  });
});

describe("manage_research_access and finalize_research through the connector (owner answer 140b)", () => {
  const IDENTITY_SECRET = new TextEncoder().encode("synthetic-plain-answer-identity-secret-of-32-bytes-or-more");
  const AGREEMENT = {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true
  } as const;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function accounts() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor("auth0|free", AGREEMENT);
    await service.acceptFreeContributor("auth0|dev", AGREEMENT);
    store.grantPrivateEntitlement({
      entitlementId: "77777777-7777-4777-a777-777777777777",
      accountKey: service.accountKeyForSubject("auth0|paid"),
      status: "ACTIVE", source: "OWNER_GRANTED", externalReferenceSha256: null,
      grantedAt: "2026-09-01T00:00:00.000Z", expiresAt: null, revokedAt: null
    });
    await service.activatePaidPrivate("auth0|paid");
    // The owner's account is marked dev in the server's settings, as a comma-separated list of the account references
    // manage_research_access shows (or of whole account keys).
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS",
      ` ${"f".repeat(64)}, ${researchAccountReference(service.accountKeyForSubject("auth0|dev")).toUpperCase()} ,not-a-key`);
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    return { store, service };
  }

  function tool(name: "manage_research_access" | "finalize_research", options: RegisterToolsOptions) {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === name) handler = execute;
      }
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", ...options });
    // The published finalize_research input, later_inputs included (owner answer 189a), as a strict client checks it.
    return async (input: Record<string, unknown>, subject: string) => handler!(
      (name === "finalize_research" ? finalizeResearchInputSchema.extend({
        later_inputs: z.record(z.string(), z.unknown()).optional()
      }) : manageResearchAccessInputSchema).parse(input), {
        authInfo: {
          token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
          expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject }
        }
      });
  }
  const text = (result: CallToolResult) => (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n");
  const register = (overrides: Record<string, unknown> = {}) => ({
    action: "register_plain_answer",
    plainAnswer: { researchTarget: TARGET, text: PLAIN_TEXT, claims: CLAIMS, ...overrides }
  });
  // The research a fixture reports: one audited study, passed after the plain answer was registered.
  const request = (receipts: string[], overrides: Record<string, unknown> = {}) => ({ ...base({ receipts }), ...overrides });
  const laterAudit = () => audit(Date.now() + 60_000);

  it("reads the dev accounts from the server's settings, ignoring entries that are not references or keys", () => {
    // A whole key counts as its reference; an entry of another length is ignored.
    expect([...devAccountKeysFromEnv(` ${"A".repeat(64)},${"b".repeat(12)} , ${"c".repeat(63)},${"d".repeat(13)},`)])
      .toEqual(["a".repeat(12), "b".repeat(12)]);
    expect(devAccountKeysFromEnv(undefined).size).toBe(0);
    expect(DEV_ACCOUNT_REFERENCE_CHARACTERS).toBe(RESEARCH_ACCOUNT_REFERENCE_CHARACTERS);
  });

  it("shows each account its reference, the one the dev list takes", async () => {
    const { service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    for (const subject of ["auth0|free", "auth0|paid", "auth0|dev", "auth0|new"]) {
      const inspected = await manage({ action: "inspect" }, subject);
      const reference = researchAccountReference(service.accountKeyForSubject(subject));
      expect(reference).toMatch(/^[a-f0-9]{12}$/u);
      expect(inspected.structuredContent).toMatchObject({ ok: true, accountReference: reference });
      expect(text(inspected)).toContain(`This account's reference, to give the user only when they ask for it: ${reference}.`);
    }
  });

  it("asks every active research account, including free contributors, for a plain answer before research", async () => {
    const { service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    for (const subject of ["auth0|paid", "auth0|dev", "auth0|free"]) {
      const inspected = await manage({ action: "inspect" }, subject);
      expect(inspected.structuredContent).toMatchObject({ ok: true, plainAnswer: { requested: true, note: true } });
      expect(text(inspected)).toContain(plainAnswerRequest(true));
    }
    expect(plainAnswerRequest(true)).toBe("A research run goes: action register_plain_answer with " +
      "later_inputs.framing, a short screen, action plan_research, the tasks chosen, then finalize_research; when a " +
      "result says to ask the person and wait, your reply is that question and the turn ends there. " +
      "Before any research call, write the short answer you would give without " +
      "AskRigor's tools, and register it with action register_plain_answer: plainAnswer.text, that answer (at most " +
      "1,500 characters); plainAnswer.claims, its main claims, 1 to 5 whole sentences each copied exactly from it (at " +
      "most 250 characters each); and plainAnswer.researchTarget, the research target you will give finalize_research. " +
      "AskRigor signs it with the time. Then treat each claim as something to check, confirm or correct, and look " +
      "beyond the claims too. The final check then writes a short note comparing the checked answer with this plain " +
      "answer, for the end of the answer. With it, give later_inputs.framing: likely_question, the question the " +
      "person most likely means; premise_doubts, anything in it that looks inverted or unclear; and " +
      "redirecting_questions, up to three questions whose answers could change what to research (none when it is " +
      "clear). The result says whether to ask the person before researching. " + FORM_PEOPLE_USE);
    const inactive = await manage({ action: "inspect" }, "auth0|new");
    expect(inactive.structuredContent).not.toHaveProperty("plainAnswer");
    expect(text(inactive)).not.toContain("register_plain_answer");
    // Gemini's catalog does not list the tool, and its surface asks for no plain answer.
    const gemini = tool("manage_research_access", { researchContributorAccessService: service, mcpSurface: "/mcp/gemini" });
    expect((await gemini({ action: "inspect" }, "auth0|paid")).structuredContent).not.toHaveProperty("plainAnswer");
    expect((await gemini(register(), "auth0|paid")).structuredContent).toMatchObject({
      ok: false, error: { code: "plain_answer_not_requested" }
    });
  });

  it("signs digests of the plain answer's whole-sentence claims with the time, and keeps none of its text", async () => {
    const { store, service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    const registered = await manage(register(), "auth0|paid");
    expect(registered.isError).not.toBe(true);
    const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
    // 11 Nov 2026: with the next step as a runtime field (whether to ask the person and end the turn, or go on).
    expect(registered.structuredContent).toEqual({
      ok: true, plainAnswer: { requested: true, note: true, claims: 2 }, research_receipt: receipt,
      next_step: expect.any(String)
    });
    const verified = verifyResearchReceipt(receipt, { secret: SECRET });
    expect(verified).toMatchObject({
      ok: true, kind: "plain_answer",
      claims: {
        claims: CLAIMS.map(plainAnswerClaimDigest), text: sha256(PLAIN_TEXT), target: researchTargetDigest(TARGET),
        acct: plainAnswerAccountBinding(SECRET, service.accountKeyForSubject("auth0|paid"))
      }
    });
    expect(verified.ok && typeof verified.claims.t === "string").toBe(true);
    expect(CLAIMS.map(plainAnswerClaimDigest).every((digest) => /^[a-f0-9]{16}$/u.test(digest))).toBe(true);
    // Neither the receipt nor the account row holds the plain answer, or the account key.
    for (const word of ["Vitamin", "colds", "1,000", service.accountKeyForSubject("auth0|paid")]) {
      expect(decodeURIComponent(receipt)).not.toContain(word);
    }
    expect(JSON.stringify(store.allAccounts())).not.toContain("Vitamin");
    expect(text(registered)).toContain(`research_receipt: ${receipt}`);
    expect(text(registered)).toContain(FINALIZE_REMINDER);
    expect(text(registered)).toContain(`Claims: 0 ${JSON.stringify(CLAIMS[0])}; 1 ${JSON.stringify(CLAIMS[1])}.`);
    // The server cannot tell at registration whether research began, so the result doesn't say it didn't (#394's run:
    // q136-weak-lead-given registered again after research began, and both results said "registered before research").
    expect(text(registered)).toContain("Plain answer registered: 2 claims, signed with the time. The final check compares " +
      "the answer with the latest plain answer this account registered for the research target before the research's " +
      "first receipt, so one registered after research began is not compared; if one for this research target was " +
      "registered before the research began, pass that receipt too.");
    expect(text(registered)).not.toContain("registered before research:");
    // #434 (8 Nov 2026): the result quotes the target it signed, so a later turn can give the check the same words.
    expect(text(registered)).toContain(`Research target, as signed: ${JSON.stringify(TARGET)}. Give finalize_research ` +
      "this research_target word for word, in a later turn too (only case and spacing are ignored): a reworded one " +
      "can't be matched to this plain answer, and the answer then ends without the comparison.");

    const refused = async (input: Record<string, unknown>, problems: string[]) => {
      const result = await manage(input, "auth0|dev");
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: false, problems, error: { code: "invalid_request" } });
      expect(result.structuredContent).not.toHaveProperty("research_receipt");
    };
    const notWhole = (index: number) => `plainAnswer.claims[${index}] is not one or more whole sentences copied ` +
      "exactly from plainAnswer.text: copy each claim as the text writes it, from the start of a sentence to its end, " +
      "within one paragraph.";
    await refused(register({ claims: [CLAIMS[0], "Vitamin D cures colds."] }), [notWhole(1)]);
    // A fragment of a sentence is not a claim the note could quote as the plain answer's.
    await refused(register({ claims: ["Vitamin", "1,000 IU is enough."] }), [notWhole(0), notWhole(1)]);
    await refused(register({ claims: [CLAIMS[0], `  ${CLAIMS[0]!.toUpperCase().replace(".", "")} `] }),
      ["plainAnswer.claims[1] repeats plainAnswer.claims[0]: give each claim once."]);
    // Typographic quotation marks, dashes and case are compared as the final check compares answer quotes, and the
    // receipt's size is the same in any script.
    const typographic = await manage(register({
      text: "Vitamin D won’t prevent colds — not in most adults.",
      claims: ["vitamin d won't prevent colds - not in most adults"]
    }), "auth0|dev");
    expect(typographic.structuredContent).toMatchObject({ ok: true, plainAnswer: { claims: 1 } });
    const long = Array.from({ length: 5 }, (_, index) => `${"Витамин ".repeat(30)}${index}.`);
    const cyrillic = await manage(register({ text: long.join(" "), claims: long }), "auth0|dev");
    expect(cyrillic.structuredContent).toMatchObject({ ok: true, plainAnswer: { claims: 5 } });
    expect((cyrillic.structuredContent as { research_receipt: string }).research_receipt.length).toBeLessThan(400);

    const free = await manage(register(), "auth0|free");
    expect(free.structuredContent).toMatchObject({ ok: true, plainAnswer: { requested: true, note: true } });
    expect((await manage({ action: "register_plain_answer" }, "auth0|paid")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect((await manage({ action: "inspect", plainAnswerNote: false }, "auth0|paid")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "invalid_request" } });
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "");
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", "");
    expect((await manage(register(), "auth0|paid")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "receipts_unavailable" } });
  });

  it("q137: explains a miscopied plain-answer receipt and restores the note when copied exactly", async () => {
    const { service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    const finalize = tool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false });
    const subject = "auth0|paid";
    const registered = await manage(register(), subject);
    const { research_receipt } = registered.structuredContent as { research_receipt: string };
    const copied = research_receipt.replace(/text=[^,~]+/u, "text=shortened");
    expect(copied).not.toBe(research_receipt);
    const failed = await finalize(request([copied, laterAudit()]), subject);
    expect(failed.structuredContent).toMatchObject({
      status: "ready_with_limits", next_steps: [],
      receipts_rejected: [{ index: 0, reason: "signature_invalid" }],
      plain_answer: { status: "no_receipt", reason: expect.stringContaining("did not verify") }
    });
    expect(failed.structuredContent).not.toHaveProperty("plain_answer_note");
    expect(text(failed)).toContain("Copy the original research_receipt from manage_research_access exactly into receipts to restore the note");
    expect(text(failed)).not.toContain(copied);
    const omitted = await finalize(request([laterAudit()]), subject);
    expect(text(omitted)).toContain("If its receipt was omitted or failed to verify");
    expect(text(omitted)).toContain("exactly into receipts to restore the note");
    const restored = await finalize(request([research_receipt, laterAudit()]), subject);
    expect(restored.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer_note: NOTE });
  });

  it.each(["auth0|paid", "auth0|free"])("turns the note off and back on for %s, and the final check follows the setting", async (subject) => {
    const { store, service } = await accounts();
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    const finalize = tool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false });
    const receipt = (await manage(register(), subject)).structuredContent as { research_receipt: string };
    const checked = () => finalize(request([receipt.research_receipt, laterAudit()]), subject);

    const on = await checked();
    expect(on.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "registered" } });
    expect((on.structuredContent as { plain_answer_note: string }).plain_answer_note).toBe(NOTE);

    const off = await manage({ action: "set_plain_answer_note", plainAnswerNote: false }, subject);
    expect(off.structuredContent).toEqual({ ok: true, plainAnswer: { requested: true, note: false } });
    expect(store.allAccounts().find(({ accountKey }) => accountKey === service.accountKeyForSubject(subject)))
      .toMatchObject({ plainAnswerNote: false });
    const inspected = await manage({ action: "inspect" }, subject);
    expect(inspected.structuredContent).toMatchObject({ plainAnswer: { requested: true, note: false } });
    expect(text(inspected)).toContain(plainAnswerRequest(false));
    const quiet = await checked();
    expect(quiet.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "note_off" } });
    expect(quiet.structuredContent).not.toHaveProperty("plain_answer_note");
    expect(text(quiet)).toContain("Plain answer: This account has turned off the note comparing the answer with its " +
      "plain answer, so the answer ends without it;");

    await manage({ action: "set_plain_answer_note", plainAnswerNote: true }, subject);
    expect((await checked()).structuredContent).toMatchObject({ plain_answer_note: NOTE });
  });

  it.each(["auth0|dev", "auth0|free"])("ends %s's answer with the note, then the saved line, then the check line", async (subject) => {
    const { service } = await accounts();
    const saved: unknown[] = [];
    const readAnswer = vi.fn(async () => ({ status: "ran" as const, findings: [] }));
    const manage = tool("manage_research_access", { researchContributorAccessService: service });
    const finalize = tool("finalize_research", {
      researchContributorAccessService: service, findingsLibrary: true, secondReader: { enabled: true, readAnswer },
      findingsSave: async (raw: unknown, _context: FindingsSaveContext): Promise<FindingsSaveResult> => {
        saved.push(raw);
        return { status: "saved", retryable: false, card_id: "ARF-0042", occurrence_count: 1 };
      }
    });
    const receipt = (await manage(register(), subject)).structuredContent as { research_receipt: string };
    const card = findingsCardSchema.parse({
      ...CARD, findings: [{ ...CARD.findings[0]!, answer_quote: CORRECTED, sources: [DOI], tags: ["full_text_read"] }]
    });
    const result = await finalize(request([receipt.research_receipt, laterAudit()], { findings_card: card }), subject);
    expect(result.structuredContent).toMatchObject({
      status: "ready_with_limits", plain_answer_note: NOTE,
      saved_line: "Saved to AskRigor's findings library for review as ARF-0042."
    });
    const output = text(result);
    const note = output.indexOf("\nNear the end of the answer, before the saved line and the check line, give this " +
      "note comparing the answer with the plain answer registered before research, its quotations exactly as they are " +
      `and its other words in the answer's language when the answer is not in English: ${NOTE}`);
    const savedLine = output.indexOf("\nJust before the check line, end the answer with this line");
    const checkLine = output.indexOf("\nEnd the answer with this line, as written");
    expect(note).toBeGreaterThan(0);
    expect(savedLine).toBeGreaterThan(note);
    expect(checkLine).toBeGreaterThan(savedLine);
    // The saved card holds none of the plain answer: it reaches only the answer.
    expect(saved).toHaveLength(1);
    expect(readAnswer).toHaveBeenCalledOnce();
    expect(readAnswer.mock.calls[0]?.[0]).toBe(request([]).answer_draft);
    for (const plainText of [PLAIN_TEXT, ...CLAIMS]) expect(JSON.stringify(readAnswer.mock.calls)).not.toContain(plainText);
    expect(JSON.stringify(saved)).not.toContain("prevent colds in most adults");
    expect(JSON.stringify(saved)).not.toContain("1,000 IU is enough");

    // Another account's plain answer is not this one's.
    const closed = tool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false });
    const paid = await closed(request([receipt.research_receipt, laterAudit()]), "auth0|paid");
    expect(paid.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "other_account" } });
    expect(paid.structuredContent).not.toHaveProperty("plain_answer_note");

    // Without a registered receipt, a free contributor gets the same explicit explanation.
    const free = await finalize(request([audit()], { findings_card: card }), "auth0|free");
    expect(free.structuredContent).toMatchObject({ plain_answer: { status: "no_receipt" } });
    expect(text(free)).toContain("Plain answer: No plain answer registered");
  });

  it("tells a paid account why its answer ends without a note, and holds the answer back for nothing", async () => {
    const { service } = await accounts();
    const finalize = tool("finalize_research", { researchContributorAccessService: service, findingsLibrary: false });
    const result = await finalize(request([audit()], { plain_answer_comparison: undefined }), "auth0|paid");
    expect(result.structuredContent).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "no_receipt" } });
    expect(text(result)).toContain("\nPlain answer: No plain answer registered with manage_research_access before " +
      "this research was passed in receipts, so the answer ends without the note comparing it with one.");
  });

  it("adds no tool: the catalog stays at 35, and neither tool has a Custom GPT Action path", () => {
    expect(RESEARCH_OPERATIONS).toHaveLength(35);
    for (const name of ["manage_research_access", "finalize_research"]) {
      expect(RESEARCH_OPERATIONS.find((operation) => operation.name === name)?.actionEnabled).toBe(false);
    }
  });
});


describe("27 Oct exact plain-answer note regressions", () => {
  const claim = "The synthetic fixture suggests an effect.";
  const finding = "The synthetic fixture did not establish an effect.";
  const checkedItem = (outcome: "confirmed" | "corrected" | "qualified", answer_quote?: string) => check({
    receipts: [plainReceipt(1_000, [claim]), audit()], answer_draft: `${LINK}\n\n${finding}`,
    plain_answer_comparison: [{ claim, outcome, ...(answer_quote === undefined ? {} : { answer_quote }), sources: [DOI] }]
  });
  it.each(["confirmed", "corrected", "qualified"] as const)("q137: %s requires a quote in the checked draft", (outcome) => {
    const missing = checkedItem(outcome);
    expect(missing.status).toBe("ready_with_limits");
    expect(advisoryNotes(missing).join(" ")).toContain("plain_answer_comparison[0]");
    expect(advisoryNotes(missing)).toContain(`plain_answer_comparison[0] is ${outcome} without answer_quote: ` +
      "copy the answer's own sentence for this item from answer_draft." + UNTIL_CHECKED);
    expect(missing.plain_answer_note).toBe(`Without AskRigor, a quick answer would have said: “${claim}” This research did not check that.`);
    expect(missing.next_steps).toEqual([]);
    const stale = checkedItem(outcome, "The previous draft used different synthetic words.");
    expect(stale.status).toBe("ready_with_limits");
    expect(advisoryNotes(stale)).toContain("plain_answer_comparison[0].answer_quote gives text the answer does not show: copy each sentence exactly from answer_draft." + UNTIL_CHECKED);
    expect(stale.plain_answer_note).toBe(`Without AskRigor, a quick answer would have said: “${claim}” This research did not check that.`);
    expect(stale.next_steps).toEqual([]);
    expect(checkedItem(outcome, finding).status).toBe("ready_with_limits");
  });
  it.each(["i44", "q136-weak-lead", "r331"])("%s: one quote cannot back two items", () => {
    const claims = [claim, "A second synthetic fixture suggests an effect."];
    const result = check({ receipts: [plainReceipt(1_000, claims), audit()], answer_draft: `${LINK}\n\n${finding}`,
      plain_answer_comparison: claims.map((claim) => ({ claim, outcome: "confirmed", answer_quote: finding })) });
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result)).toContain("plain_answer_comparison[1].answer_quote repeats plain_answer_comparison[0].answer_quote: one quote backs only one item." + UNTIL_CHECKED);
    expect(result.plain_answer_note).toBe(`Without AskRigor, a quick answer would have said: “${claims[0]}” ` +
      `This research did not check that. It would also have said: “${claims[1]}” This research did not check that.`);
    expect(result.next_steps).toEqual([]);
  });
  it("r332: a quote ending in a colon is a lead-in, not the item's sentence", () => {
    const lead = "Synthetic results:";
    const result = check({ receipts: [plainReceipt(1_000, [claim]), audit()], answer_draft: `${LINK}\n\n${lead} ${finding}`,
      plain_answer_comparison: [{ claim, outcome: "confirmed", answer_quote: lead }] });
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result)).toContain("plain_answer_comparison[0].answer_quote ends with a colon: give the answer's sentence for this item, rather than its lead-in." + UNTIL_CHECKED);
    expect(result.plain_answer_note).toBe(`Without AskRigor, a quick answer would have said: “${claim}” This research did not check that.`);
    expect(result.next_steps).toEqual([]);
  });
  it("q136-responders and l32: a first-turn correction needs backing, and is never asked of corrections", () => {
    const result = check({ receipts: [plainReceipt(1_000, [claim])], key_sources: [], answer_draft: `${finding}\n\nNo study's methods were checked in full text for this answer.`,
      plain_answer_comparison: [{ claim, outcome: "corrected", answer_quote: finding }] });
    expect(result.status, advisoryNotes(result).join("\n")).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    // #394's run: l32-negative-controls' first turn printed such a correction, with nothing behind it, as the research's.
    expect(result.plain_answer_note).toBe(`Without AskRigor, a quick answer would have said: “${claim}” This research did not check that.`);
    expect(advisoryNotes(result).join(" ")).toContain("plain_answer_comparison[0] is corrected with nothing behind it");
    expect(advisoryNotes(result).join(" ")).not.toContain("corrections");
    const missing = check({ receipts: [plainReceipt(1_000, [claim])], key_sources: [], answer_draft: `${finding}\n\nNo study's methods were checked in full text for this answer.`,
      plain_answer_comparison: [{ claim, outcome: "corrected" }] });
    expect(advisoryNotes(missing).join(" ")).not.toContain("corrections");
    const qualified = check({ receipts: [plainReceipt(1_000, [claim])], key_sources: [], answer_draft: `${finding}\n\nNo study's methods were checked in full text for this answer.`,
      plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding }] });
    expect(advisoryNotes(qualified).join(" ")).not.toContain("corrections");
  });
});

// #394's run: when a quoted sentence ended inside bold markers, the note put a full stop after its closing quotation mark.
describe("the note's quotations end their sentences inside emphasis", () => {
  it("adds no full stop after a bolded quote that ends its own sentence", () => {
    const bold = `**${CORRECTED}**`;
    const result = check({ answer_draft: `${LINK}\n\n${bold} ${QUALIFIED}`,
      plain_answer_comparison: [{ ...COMPARISON[0]!, answer_quote: bold }, COMPARISON[1]!] });
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toContain(`from a full-text audit of 1 study: “${bold}” It would also have said:`);
    expect(result.plain_answer_note).not.toContain(`${bold}”.`);
  });
});

describe("owner answer 210b: the plain-answer note keeps checked claims and names forum threads read here", () => {
  type Search = NonNullable<FinalizeResearchInput["community_searches"]>[number];
  const thread = { url: "https://www.reddit.com/r/Supplements/comments/abc123/vitamin_d/", title: "Vitamin D experiences" };
  const claim = "People report fewer colds after taking vitamin D.";
  const finding = "In the thread, some people reported fewer colds and others reported no change.";
  const search = (threads_read: Search["threads_read"] = [thread], platform: Search["platform"] = "reddit"): Search => ({
    community: "Synthetic community", platform, queries: [TARGET], threads_read
  });
  const forumCheck = (overrides: Partial<FinalizeResearchInput> = {}) => check({
    receipts: [plainReceipt(1_000, [claim]), audit()],
    answer_draft: `${LINK}\n\n${finding}`,
    community_searches: [search()],
    plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding, sources: [thread.url] }],
    ...overrides
  });
  const notChecked = `Without AskRigor, a quick answer would have said: “${claim}” This research did not check that.`;
  const threadNote = `Without AskRigor, a quick answer would have said: “${claim}” This research qualified that, ` +
    `from my own reading of 1 forum thread ([Vitamin D experiences](${thread.url})): “${finding}”`;
  const unbackedAdvisory = (index: number, outcome: "confirmed" | "qualified") =>
    `plain_answer_comparison[${index}] is ${outcome} with nothing behind it that a quick answer could not have: ` +
    "give in sources a study audited in full text here, a video whose comments were read here or, for a claim " +
    "about what people report, a forum thread read here (the link community_searches threads_read gives), or " +
    "quote as answer_quote a sentence that absence_claims also declares." + UNTIL_CHECKED;
  const sourcesAdvisory = (source: string) => `plain_answer_comparison[0].sources lists ${source}, which no ` +
    "full-text method audit or comment audit passed here covers and no community_searches threads_read declares: " +
    "list studies audited in full text here (DOI, PMID or PMCID), videos whose comments were read here (video ID) " +
    "and forum threads read here (the link threads_read gives), or leave sources out.";
  const comparisonNotes = (result: ReturnType<typeof check>) =>
    advisoryNotes(result).filter((note) => note.startsWith("plain_answer_comparison"));

  it.each(["confirmed", "qualified"] as const)("keeps an unbacked confirmation as not checked beside a backed %s, without blocking", (outcome) => {
    const result = check({ plain_answer_comparison: [
      { claim: CLAIMS[0]!, outcome: "confirmed", answer_quote: CORRECTED },
      { claim: CLAIMS[1]!, outcome, answer_quote: QUALIFIED, sources: [DOI] }
    ] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.next_step_kinds).toEqual([]);
    expect(result.finalization_receipt).toEqual(expect.any(String));
    expect(result.plain_answer_note).toBe("Without AskRigor, a quick answer would have said: “Vitamin D supplements " +
      "prevent colds in most adults.” This research did not check that. It would also have said: “A daily dose of " +
      `1,000 IU is enough.” This research ${outcome} that, from a full-text audit of 1 study: “${QUALIFIED}”`);
    expect(comparisonNotes(result)).toEqual([unbackedAdvisory(0, "confirmed")]);
  });

  it.each([
    ["missing", undefined, "plain_answer_comparison[0] is confirmed without answer_quote: copy the answer's own sentence for this item from answer_draft."],
    ["absent from the draft", "Vitamin D never works.", "plain_answer_comparison[0].answer_quote gives text the answer does not show: copy each sentence exactly from answer_draft."],
    ["ending in a colon", "Synthetic results:", "plain_answer_comparison[0].answer_quote ends with a colon: give the answer's sentence for this item, rather than its lead-in."]
  ] as const)("a quote %s marks only its claim as not checked and keeps the backed qualification", (_, answer_quote, advisory) => {
    const result = check({ answer_draft: `${LINK}\n\nSynthetic results: ${CORRECTED} ${QUALIFIED}`,
      plain_answer_comparison: [
        { claim: CLAIMS[0]!, outcome: "confirmed", ...(answer_quote === undefined ? {} : { answer_quote }), sources: [DOI] },
        { claim: CLAIMS[1]!, outcome: "qualified", answer_quote: QUALIFIED, sources: [DOI] }
      ] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toBe("Without AskRigor, a quick answer would have said: “Vitamin D supplements " +
      "prevent colds in most adults.” This research did not check that. It would also have said: “A daily dose of " +
      `1,000 IU is enough.” This research qualified that, from a full-text audit of 1 study: “${QUALIFIED}”`);
    expect(comparisonNotes(result)).toEqual([advisory + UNTIL_CHECKED]);
  });

  it("a reused quote marks only the later claim as not checked and keeps the backed confirmation", () => {
    const result = check({ plain_answer_comparison: [
      { claim: CLAIMS[0]!, outcome: "confirmed", answer_quote: QUALIFIED, sources: [DOI] },
      { claim: CLAIMS[1]!, outcome: "qualified", answer_quote: QUALIFIED, sources: [DOI] }
    ] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toBe("Without AskRigor, a quick answer would have said: “Vitamin D supplements " +
      `prevent colds in most adults.” This research confirmed that, from a full-text audit of 1 study: “${QUALIFIED}” ` +
      "It would also have said: “A daily dose of 1,000 IU is enough.” This research did not check that.");
    expect(comparisonNotes(result)).toEqual(["plain_answer_comparison[1].answer_quote repeats " +
      "plain_answer_comparison[0].answer_quote: one quote backs only one item." + UNTIL_CHECKED]);
  });

  it("qualifies a claim from a declared thread with its linked title and no comparison advisory", () => {
    const result = forumCheck();
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toBe(threadNote);
    expect(comparisonNotes(result)).toEqual([]);
  });

  it("calls threads read here only when every thread behind the claim has a verified read receipt", () => {
    const receipt = issueResearchReceipt("forum_thread_read", { u: forumThreadDigest(thread.url), n: 20, v: "reddit", t: 2_500 }, { secret: SECRET });
    const result = forumCheck({ receipts: [plainReceipt(1_000, [claim]), audit(), receipt] });
    expect(result.plain_answer_note).toBe(threadNote.replace("my own reading of 1 forum thread", "1 forum thread read here"));
    const other = { url: "https://forum.example/threads/2", title: "Other experiences" };
    const mixed = forumCheck({ receipts: [plainReceipt(1_000, [claim]), audit(), receipt], community_searches: [search([thread, other])],
      plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding, sources: [thread.url, other.url] }] });
    expect(mixed.plain_answer_note).toContain("my own reading of 2 forum threads");
    const both = forumCheck({ receipts: [plainReceipt(1_000, [claim]), audit(), receipt,
      issueResearchReceipt("forum_thread_read", { u: forumThreadDigest(other.url), n: 1_500, v: "page", t: 3_000 }, { secret: SECRET })],
      community_searches: [search([thread, other])],
      plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding, sources: [thread.url, other.url] }] });
    expect(both.plain_answer_note).toContain("2 forum threads read here");
    const changed = forumCheck({ receipts: [plainReceipt(1_000, [claim]), audit(), receipt.slice(0, -1)] });
    expect(changed.plain_answer_note).toBe(threadNote);
  });

  it("matches an old.reddit.com source to the www.reddit.com thread declared read", () => {
    const result = forumCheck({ plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding,
      sources: ["https://old.reddit.com/r/Supplements/comments/abc123/vitamin_d/"] }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.plain_answer_note).toBe(threadNote);
    expect(comparisonNotes(result)).toEqual([]);
  });

  it("names a study audit and a thread together as the claim's combined basis", () => {
    const result = forumCheck({ plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding,
      sources: [DOI, thread.url] }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.plain_answer_note).toBe(`Without AskRigor, a quick answer would have said: “${claim}” ` +
      "This research qualified that, from a full-text audit of 1 study and my own reading of 1 forum thread " +
      `([Vitamin D experiences](${thread.url})): “${finding}”`);
    expect(comparisonNotes(result)).toEqual([]);
  });

  it("names three of four threads, removes square brackets in a title and uses this thread without a title", () => {
    const threads = [
      { ...thread, title: "[Vitamin D] experiences" },
      { url: "https://forum.example/vitamin-d/no-change" },
      { url: "https://forum.example/vitamin-d/fewer-colds", title: "Fewer colds" },
      { url: "https://forum.example/vitamin-d/another", title: "Another experience" }
    ];
    const result = forumCheck({ community_searches: [search(threads)],
      plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding, sources: threads.map(({ url }) => url) }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.plain_answer_note).toBe(`Without AskRigor, a quick answer would have said: “${claim}” ` +
      "This research qualified that, from my own reading of 4 forum threads " +
      `([Vitamin D experiences](${thread.url}), [this thread](https://forum.example/vitamin-d/no-change), ` +
      `[Fewer colds](https://forum.example/vitamin-d/fewer-colds) and 1 more): “${finding}”`);
    expect(comparisonNotes(result)).toEqual([]);
  });

  it("does not back a claim with a review_site page declared read", () => {
    const url = "https://reviews.example/vitamin-d";
    const result = forumCheck({ community_searches: [search([{ url, title: "Vitamin D reviews" }], "review_site")],
      plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding, sources: [url] }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toBe(notChecked);
    expect(comparisonNotes(result)).toEqual([sourcesAdvisory(url), unbackedAdvisory(0, "qualified")]);
  });

  it("does not back a claim with a source no threads_read declares, and names it in the sources advisory", () => {
    const url = "https://forum.example/vitamin-d/not-read";
    const result = forumCheck({ plain_answer_comparison: [{ claim, outcome: "qualified", answer_quote: finding, sources: [url] }] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toBe(notChecked);
    expect(comparisonNotes(result)).toEqual([sourcesAdvisory(url), unbackedAdvisory(0, "qualified")]);
  });

  it("still withholds the note when a registered claim is left out, naming that claim, and blocks while the note is on", () => {
    const leftOut = "plain_answer_comparison leaves out claim 1 of the plain answer " +
      "registered before this research, as manage_research_access numbered them: give each, copied exactly, " +
      "with whether the research confirmed, corrected or qualified it, or did not check it.";
    const result = check({ plain_answer_comparison: [COMPARISON[0]!] });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([leftOut]);
    expect(result).not.toHaveProperty("plain_answer_note");
    // With the note off (the account's choice), the claim left out is advice and the answer passes without the note.
    const off = check({ plain_answer_comparison: [COMPARISON[0]!] }, false);
    expect(off.status).toBe("ready_with_limits");
    expect(off.next_steps).toEqual([]);
    expect(off).not.toHaveProperty("plain_answer_note");
    expect(comparisonNotes(off)).toEqual([leftOut]);
  });

  it("keeps the note for complete entries beside an unknown claim, with its advisory", () => {
    const result = check({ plain_answer_comparison: [
      ...COMPARISON, { claim: "Vitamin D cures colds.", outcome: "not_checked" }
    ] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toBe(NOTE);
    expect(comparisonNotes(result)).toEqual(["plain_answer_comparison[2].claim is not one of the 2 claims of the " +
      "plain answer registered before this research: copy it exactly as manage_research_access listed it."]);
  });

  it("keeps the note for complete entries beside a duplicate claim, with its advisory", () => {
    const result = check({ plain_answer_comparison: [
      ...COMPARISON, { claim: CLAIMS[0]!, outcome: "confirmed" }
    ] });
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.plain_answer_note).toBe(NOTE);
    expect(comparisonNotes(result)).toEqual(["plain_answer_comparison[2] gives the same claim as " +
      "plain_answer_comparison[0]: give each claim one entry."]);
  });
});
