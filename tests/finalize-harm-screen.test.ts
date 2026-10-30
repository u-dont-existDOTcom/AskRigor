import { expectPassingLimits, advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { withoutLaterInputs } from "./helpers/tool-schema.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryResearchContributorAccessStore, RESEARCH_USE_NOTICE_VERSION, ResearchContributorAccessService
} from "@askrigor/evidence-repository";
import { findingsCardSchema } from "../apps/research-mcp/src/findings/card.js";
import type { FindingsSaveResult } from "../apps/research-mcp/src/findings/contracts.js";
import type { FindingsSaveContext } from "../apps/research-mcp/src/findings/service.js";
import { registerTools } from "../apps/research-mcp/src/register-tools.js";
import {
  FINALIZE_RESEARCH_SHAPES_DESCRIPTION, HARM_NOT_CHECKED_CAVEAT_START, HARM_SCREEN_SOURCES, HARM_SCREEN_STATES,
  TOOL_LIST_REFRESH_HINT, finalizeResearch, finalizeResearchPublishedInputSchema, harmNotCheckedCaveat,
  type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { CARD } from "./helpers/findings-fixtures.js";
import { SCREENED_HARM_SENTENCE, withHarmScreen } from "./helpers/harm-screen.js";

// Owner answer "128b" (2026-10-20), from lesson #44 (UDA #403): comparing the safety of a prescribed growth hormone
// with peptides that raise it, an answer searched blood sugar, swelling, joints, the heart and cancer, but never severe
// allergic reactions after injections tolerated before, and the final check, which cannot see a harm the answer never
// mentions, did not notice. The final check now asks for each serious harm the screen searched and what it found: a
// label warning or a reported signal, shown in the answer by its sentence; not found, after a search whose receipt is
// passed; or not checked, which the answer states as "A serious harm this answer did not check: [harm]." (owner answer
// "165a" gave "This answer did not check [harm]." its colon form). Whether the list is complete is meaning, which stays
// the model's declaration (the regression case, and later the second reader, cover it).
const SECRET = "harm-screen-test-secret-0123456789abcdefghij";
const DOI = "10.1000/hormone-trial";
const QUERY = "somatropin anaphylaxis";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1],
  secret = SECRET) => issueResearchReceipt(kind, claims, { secret });
const audit = sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" });
const search = (src: "pubmed" | "europepmc" | "ctgov" = "pubmed", query = QUERY) =>
  sign("literature_search", { src, q: discoveryQueryDigest([query]), ret: 0, n: 0 });
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the harm screen." };
const LINKS = `[Trial](https://doi.org/${DOI}) compared the hormone with placebo.`;
const SAFETY = "Swelling was reported in 12% on the hormone and 3% on placebo.";
const LABEL = "The hormone's label warns of severe allergic reactions, even after earlier doses were tolerated.";
type Harm = NonNullable<FinalizeResearchInput["harm_screen"]>[number];
const onLabel: Harm = {
  harm: "severe allergic reactions", state: "label_warning", sources_searched: ["label"], answer_quote: LABEL
};
const notFound: Harm = {
  harm: "anaphylaxis", state: "not_found", sources_searched: ["case_reports", "trial_serious_events"], search_query: QUERY
};
const notChecked: Harm = { harm: "anaphylaxis", state: "not_checked" };
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [audit], research_target: "Synthetic harm screen", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic fixture isolates the harm screen.",
  intervention_identity: declaration, lab_preparation: declaration,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the harm screen." },
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  mechanism_claims: [], recommendations: [], safety_question: false,
  safety_claims: [{
    quote: SAFETY, direction: "harm", exposure: "prescribed growth hormone", basis: "comparative_rates",
    measured_exposure: "prescribed growth hormone for 26 weeks", studies: [DOI]
  }],
  harm_screen: [onLabel], answer_draft: `${LINKS}\n\n${SAFETY}\n\n${LABEL}`, ...overrides
});
const check = (overrides: Partial<FinalizeResearchInput> = {}, protocolNames?: ReadonlySet<string>) =>
  assertNextStepsContract(finalizeResearch(base(overrides), {
    secret: SECRET, ...(protocolNames === undefined ? {} : { protocolNames })
  }));
const steps = (overrides: Partial<FinalizeResearchInput> = {}, protocolNames?: ReadonlySet<string>) =>
  (() => {
    const result = check(overrides, protocolNames);
    return [...advisoryNotes(result), ...result.next_steps].filter((step) => step !== TOOL_LIST_REFRESH_HINT);
  })();
const missing = (caveat: string) => "The answer leaves out this caveat; include each as its own sentence, as written " +
  "(a link's text may change), or, in an answer not in English, in the answer's language with the same links, given " +
  `in caveat_renderings: "${caveat}"`;
const required = (gap: "is missing" | "lists no harm", why: string) => `harm_screen ${gap}: ${why}, so harm_screen ` +
  "lists the serious harms plausible for this exposure, apart from its common side effects, each searched by name, " +
  "with what the search found: label_warning or reported_signal with the answer's sentence as answer_quote, " +
  "not_found with the exact search_query of a literature search passed here, or not_checked (at least one entry).";
const BECAUSE_CLAIMS = "the answer makes safety statements (safety_claims)";
const BECAUSE_QUESTION = "the question is about safety (safety_question)";
const BECAUSE_LONG_TERM = "the answer recommends, puts forward or ranks a medicine likely to be taken for months or " +
  "years (recommendations)";
type Recommendation = NonNullable<FinalizeResearchInput["recommendations"]>[number];
const RANKED = "Of the options compared, the hormone ranks first for most adults, if a clinician confirms normal " +
  "blood sugar.";
const longTerm = (overrides: Partial<Recommendation> = {}): Recommendation => ({
  quote: RANKED, intervention: "the hormone", safety_check: "conditional", open_inputs: "normal blood sugar",
  long_term_use: true, longest_follow_up: "26 weeks", follow_up_matches_use: true, stopping_covered: true, ...overrides
});
const CONDITIONAL = "An option that depends on something a clinician should confirm first: the hormone. What to " +
  "confirm: normal blood sugar.";
const SAFETY_QUESTION_MISSING = "safety_question is missing: with answer_draft, say whether the question is about " +
  "safety: true when the user asks whether something is safe, how risky it is or what harm it can do, or the answer " +
  "compares options' safety; false otherwise.";
const NO_DRAFT = "The final check needs usable answer_draft: answer_draft is the answer to check; research_target is the question the research answered.";
const NOT_CHECKED = "A serious harm this answer did not check: anaphylaxis.";
const NOT_CHECKED_LIMIT = "A serious harm, anaphylaxis, was not checked: say so in the answer, as the caveat does.";
const BOUNDED = (names: string) => `Where this answer says something was not found, it means the searches made here ` +
  `(${names}) did not find it, and they did not cover older or variant terms, citation chains and grey literature; ` +
  "that is not evidence that it does not exist.";
const BOUNDED_LIMIT = "The answer says something was not found: bound that to the searches made here, as the caveat does.";
const unshown = (...at: string[]) => `${at.join(", ")} ${at.length === 1 ? "gives" : "give"} text the answer does not ` +
  "show: copy each sentence exactly from answer_draft.";
const noReceipt = (index: number, harm: string) => `harm_screen[${index}].search_query is not the query of any ` +
  `literature search passed here: search ${harm} by name with search_pubmed, search_europe_pmc or ` +
  "search_clinical_trials, give that exact query, and pass its research_receipt, or declare it not_checked.";

describe("finalize_research harm_screen: when it is required (owner answer 128b)", () => {
  it("passes an answer whose screen found a harm on the label, which adds no caveat or limit", () => {
    expect(check()).toMatchObject({
      caveats: [],
      limits: [
        "The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked."
      ],
      next_steps: [],
      status: "ready_with_limits"
    });
  });

  it("asks for it, with the connector-refresh hint, whenever safety_claims lists a sentence", () => {
    const result = check({ harm_screen: undefined });
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([required("is missing", BECAUSE_CLAIMS)]);
    expect(result.finalization_receipt).toBeUndefined();
  });

  it("asks for it when the model declares a safety question, even with no safety statement", () => {
    const question = { safety_claims: [], safety_question: true, answer_draft: `${LINKS}\n\n${LABEL}` };
    expect(advisoryNotes(check({ ...question, harm_screen: undefined })))
      .toEqual([required("is missing", BECAUSE_QUESTION), TOOL_LIST_REFRESH_HINT]);
    expect(check(question).status).toBe("ready_with_limits");
    // Safety statements name the reason when both apply.
    expect(steps({ safety_question: true, harm_screen: undefined })).toEqual([required("is missing", BECAUSE_CLAIMS)]);
  });

  it("needs at least one entry: an empty list is named, without the refresh hint", () => {
    expect(check({ harm_screen: [] }).next_steps).toEqual([required("lists no harm", BECAUSE_CLAIMS)]);
    expect(advisoryNotes(check({ harm_screen: [], safety_claims: [], safety_question: true, answer_draft: LINKS })))
      .toEqual([required("lists no harm", BECAUSE_QUESTION), TOOL_LIST_REFRESH_HINT]);
  });

  it("is not required without a safety statement or a safety question, nor before an answer draft", () => {
    expect(check({ safety_claims: [], safety_question: false, harm_screen: undefined, answer_draft: LINKS }).status)
      .toBe("ready");
    expect(check({ safety_claims: [], safety_question: false, harm_screen: [], answer_draft: LINKS }).status)
      .toBe("ready");
    const early = steps({ harm_screen: undefined, answer_draft: undefined });
    expect(early).toEqual([NO_DRAFT]);
  });

  // AskRigor#356: every answer says whether its question is about safety, so leaving safety_question out cannot skip
  // the screen.
  it("needs safety_question with an answer draft, with the connector-refresh hint", () => {
    const undeclared = check({ safety_claims: [], safety_question: undefined, harm_screen: undefined,
      answer_draft: LINKS });
    expect(undeclared).toMatchObject({
      status: "ready",
      notes: [
        "safety_question is missing: with answer_draft, say whether the question is about safety: true when the user asks whether something is safe, how risky it is or what harm it can do, or the answer compares options' safety; false otherwise.",
        "If this chat's AskRigor tool has no such field, its tool list is outdated: tell the user, in their language, that AskRigor has been updated since this app loaded its tools, and that refreshing AskRigor in the app's settings and starting a new chat loads the current list. If it has the field, its tool list is current: give the field, and say nothing to the user about refreshing."
      ],
      next_steps: []
    });
    expect(undeclared.finalization_receipt).toEqual(expect.any(String));
    // With safety statements the screen is asked for too, and the hint comes once.
    expect(advisoryNotes(check({ safety_question: undefined, harm_screen: undefined })))
      .toEqual([SAFETY_QUESTION_MISSING, TOOL_LIST_REFRESH_HINT]);
    expect(check({ safety_question: undefined, harm_screen: undefined }).next_steps)
      .toEqual([required("is missing", BECAUSE_CLAIMS)]);
    // A screen given does not stand in for the declaration.
    expect(steps({ safety_question: undefined })).toEqual([SAFETY_QUESTION_MISSING]);
    // Before an answer draft it is not asked for.
    expect(steps({ safety_question: undefined, answer_draft: undefined })).toEqual([NO_DRAFT]);
    // Declared either way, it is enough; true asks for the screen.
    expect(check({ safety_claims: [], safety_question: true, answer_draft: `${LINKS}\n\n${LABEL}` }).status).toBe("ready_with_limits");
  });

  it("still checks a screen given when it is not required", () => {
    const given = { safety_claims: [], harm_screen: [notChecked] };
    expect(check({ ...given, answer_draft: LINKS })).toMatchObject({
      caveats: [
        "A serious harm this answer did not check: anaphylaxis."
      ],
      limits: [
        "A serious harm this answer did not check: anaphylaxis."
      ],
      status: "ready_with_limits",
      next_steps: []
    });
    expect(check({ ...given, answer_draft: `${LINKS} ${NOT_CHECKED}` }).status).toBe("ready_with_limits");
  });

  it("gives fixtures of other checks one harm found on the label, which changes nothing else", () => {
    const input = withHarmScreen({ ...base(), harm_screen: undefined, answer_draft: `${LINKS}\n\n${SAFETY}` });
    expect(input.answer_draft).toBe(`${LINKS}\n\n${SAFETY}\n\n${SCREENED_HARM_SENTENCE}`);
    expect(finalizeResearch(input, { secret: SECRET })).toMatchObject({
      caveats: [],
      limits: [
        "The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked."
      ],
      status: "ready_with_limits"
    });
    // A fixture with no safety statement, or with its own screen, is left as it is.
    const plain = { ...base(), safety_claims: [], harm_screen: undefined };
    expect(withHarmScreen(plain)).toBe(plain);
    const own = base({ harm_screen: [notChecked] });
    expect(withHarmScreen(own)).toBe(own);
  });
});

// Owner answer 153c (Universal: "or when the answer ranks or puts forward a medicine likely to be taken for months or
// years, list the serious harms"): a recommendations entry with long_term_use asks for the screen too. Which medicine
// is likely taken that long stays the model's declaration.
describe("finalize_research harm_screen: a medicine put forward or ranked for long-term use (owner answer 153c)", () => {
  const ranked = (overrides: Partial<FinalizeResearchInput> = {}) => ({
    safety_claims: [], safety_question: false, recommendations: [longTerm()],
    answer_draft: `${LINKS}\n\n${RANKED} ${CONDITIONAL}\n\n${LABEL}`, ...overrides
  });

  it("asks for the screen, with the connector-refresh hint, when recommendations lists one for long-term use", () => {
    const result = check(ranked({ harm_screen: undefined }));
    expect(result.status).toBe("ready_with_limits");
    expect(advisoryNotes(result)).toEqual([required("is missing", BECAUSE_LONG_TERM), TOOL_LIST_REFRESH_HINT]);
    expect(result.next_step_kinds).toEqual([]);
    expect(steps(ranked({ harm_screen: [] }))).toEqual([required("lists no harm", BECAUSE_LONG_TERM)]);
  });

  it("passes once the screen is given; a general ranking is conditional and states the existing caveat", () => {
    expect(check(ranked())).toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [CONDITIONAL] });
    // Without the caveat the answer is sent back for it, as for any conditional recommendation (FS231).
    expectPassingLimits(check(ranked({ answer_draft: `${LINKS}\n\n${RANKED}\n\n${LABEL}` })), ["An option that depends on something a clinician should confirm first: the hormone. What to confirm: normal blood sugar."]);
  });

  it("is not required for a recommendation that is not for long-term use, nor before an answer draft", () => {
    const shortTerm = check(ranked({ recommendations: [longTerm({ long_term_use: false })], harm_screen: undefined,
      answer_draft: `${LINKS}\n\n${RANKED} ${CONDITIONAL}` }));
    expect(shortTerm).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(steps(ranked({ harm_screen: undefined, answer_draft: undefined }))).toEqual([NO_DRAFT]);
  });

  it("names one reason: the safety statements, else the safety question, else the long-term medicine", () => {
    expect(steps(ranked({ harm_screen: undefined, safety_claims: base().safety_claims,
      answer_draft: `${LINKS}\n\n${SAFETY}\n\n${RANKED} ${CONDITIONAL}` }))).toEqual([required("is missing", BECAUSE_CLAIMS)]);
    expect(steps(ranked({ harm_screen: undefined, safety_question: true })))
      .toEqual([required("is missing", BECAUSE_QUESTION)]);
    // Any entry for long-term use counts, wherever it is listed.
    const second = "A short course of the cream could also help.";
    expect(steps(ranked({ harm_screen: undefined,
      recommendations: [{ quote: second, intervention: "the cream", safety_check: "resolved", long_term_use: false }, longTerm()],
      answer_draft: `${LINKS}\n\n${second} ${RANKED} ${CONDITIONAL}` }))).toEqual([required("is missing", BECAUSE_LONG_TERM)]);
  });
});

describe("finalize_research harm_screen: label warnings and reported signals are shown in the answer", () => {
  it("accepts the sentence that reports the harm, copied from the answer in any language", () => {
    for (const quote of [
      "Des réactions allergiques graves ont été signalées après des injections jusque-là bien tolérées.",
      "以前は問題なく使えていた注射の後でも、重いアレルギー反応が報告されています。",
      "Сообщалось о тяжёлых аллергических реакциях после ранее хорошо переносимых инъекций."
    ]) {
      const harm: Harm = { harm: "severe allergic reactions", state: "reported_signal", sources_searched: ["case_reports"],
        answer_quote: quote };
      expect(check({ harm_screen: [harm], answer_draft: `${LINKS}\n\n${SAFETY}\n\n${quote}` }).status, quote).toBe("ready_with_limits");
    }
    // Compared as other quotes are: its closing mark, quotation marks, emphasis, spacing and case aside.
    expect(check({ harm_screen: [{ ...onLabel, answer_quote: `"${LABEL.slice(0, -1).toUpperCase()}"` }] }).status)
      .toBe("ready_with_limits");
    expect(check({ answer_draft: `${LINKS}\n\n${SAFETY}\n\n**${LABEL.slice(0, 20)}**${LABEL.slice(20)}` }).status)
      .toBe("ready_with_limits");
  });

  it("refuses a sentence the answer does not show, or shows only outside its prose", () => {
    for (const draft of [
      `${LINKS}\n\n${SAFETY}`,
      `${LINKS}\n\n${SAFETY}\n\n\`\`\`\n${LABEL}\n\`\`\``,
      `${LINKS}\n\n${SAFETY}\n\n<!-- ${LABEL} -->`,
      `${LINKS}\n\n${SAFETY}\n\n> ${LABEL}`,
      `${LINKS}\n\n${SAFETY}\n\nThe hormone's label warns of severe reactions.`
    ]) expect(steps({ answer_draft: draft }), draft).toEqual([unshown("harm_screen[0].answer_quote")]);
    // With other declared sentences the answer does not show, one step names them all.
    expect(steps({ answer_draft: LINKS })).toEqual([unshown("safety_claims[0]", "harm_screen[0].answer_quote")]);
  });

  it("needs the sentence and the sources searched, and a label warning found on a label or a regulator's warning", () => {
    expect(steps({ harm_screen: [{ ...onLabel, answer_quote: undefined }] })).toEqual([
      "harm_screen[0] is label_warning without answer_quote: report severe allergic reactions in the answer, and copy " +
        "that sentence from answer_draft."
    ]);
    expect(steps({ harm_screen: [{ ...onLabel, state: "reported_signal", answer_quote: undefined }] })).toEqual([
      "harm_screen[0] is reported_signal without answer_quote: report severe allergic reactions in the answer, and " +
        "copy that sentence from answer_draft."
    ]);
    for (const sources_searched of [undefined, []]) {
      expect(steps({ harm_screen: [{ ...onLabel, sources_searched }] })).toEqual([
        "harm_screen[0] is label_warning without sources_searched: give the kinds of source searched for severe " +
          "allergic reactions."
      ]);
    }
    expect(steps({ harm_screen: [{ ...onLabel, sources_searched: ["case_reports", "community"] }] })).toEqual([
      "harm_screen[0] is label_warning, but sources_searched lists neither label nor regulator_warning: add the one " +
        "whose warning names severe allergic reactions, or declare it reported_signal."
    ]);
    expect(check({ harm_screen: [{ ...onLabel, sources_searched: ["regulator_warning"] }] }).status).toBe("ready_with_limits");
    expect(check({ harm_screen: [{ ...onLabel, state: "reported_signal", sources_searched: ["post_marketing"] }] }).status)
      .toBe("ready_with_limits");
  });

  it("does not use another state's field", () => {
    // A query given with a harm found is not checked against the receipts, as full_text_search ignores the other field.
    expect(check({ harm_screen: [{ ...onLabel, search_query: "a query no receipt has" }] }).status).toBe("ready_with_limits");
  });
});

describe("finalize_research harm_screen: a harm not found rests on a literature search passed here", () => {
  it("accepts the exact query of a PubMed search receipt, bounding the result to the searches made", () => {
    const passed = { receipts: [audit, search()], harm_screen: [onLabel, notFound] };
    const bounded = BOUNDED("PubMed");
    const left = check(passed);
    expect(left).toMatchObject({
      caveats: [
        "Where this answer says something was not found, it means the searches made here (PubMed) did not find it, and they did not cover older or variant terms, citation chains and grey literature; that is not evidence that it does not exist."
      ],
      limits: [
        "The serious-harm screen covered severe allergic reactions (product labels); anaphylaxis (case reports, serious events in trials). Other serious harms may not have been checked.",
        "Where this answer says something was not found, it means the searches made here (PubMed) did not find it, and they did not cover older or variant terms, citation chains and grey literature; that is not evidence that it does not exist."
      ],
      status: "ready_with_limits"
    });
    expectPassingLimits(left, ["Where this answer says something was not found, it means the searches made here (PubMed) did not find it, and they did not cover older or variant terms, citation chains and grey literature; that is not evidence that it does not exist."]);
    expect(check({ ...passed, answer_draft: `${base().answer_draft}\n\n${bounded}` }))
      .toMatchObject({ status: "ready_with_limits", next_steps: [], limits: ["The serious-harm screen covered severe allergic reactions (product labels); anaphylaxis (case reports, serious events in trials). Other serious harms may not have been checked.", bounded], caveats: [bounded] });
  });

  it("compares the query as search receipts sign it: case and spacing aside, nothing else", () => {
    const answer = `${base().answer_draft}\n\n${BOUNDED("PubMed")}`;
    expect(check({ receipts: [audit, search()], answer_draft: answer,
      harm_screen: [onLabel, { ...notFound, search_query: "  Somatropin\n  ANAPHYLAXIS " }] }).status).toBe("ready_with_limits");
    expect(steps({ receipts: [audit, search()], answer_draft: answer,
      harm_screen: [onLabel, { ...notFound, search_query: "somatropin anaphylactic reaction" }] }))
      .toEqual([noReceipt(1, "anaphylaxis")]);
  });

  it("counts Europe PMC and ClinicalTrials.gov searches too, naming them in the bound", () => {
    for (const [src, name] of [["europepmc", "Europe PMC"], ["ctgov", "ClinicalTrials.gov"]] as const) {
      const bounded = BOUNDED(name);
      expect(check({ receipts: [audit, search(src)], harm_screen: [notFound],
        answer_draft: `${base().answer_draft}\n\n${bounded}` })).toMatchObject({ status: "ready_with_limits", caveats: [bounded] });
    }
  });

  it("never accepts a harm not found without a verified literature search for its query", () => {
    const answer = `${base().answer_draft}\n\n${BOUNDED("PubMed")}`;
    const otherServer = sign("literature_search", { src: "pubmed", q: discoveryQueryDigest([QUERY]), ret: 0 },
      "another-server-secret-0123456789abcdefghijkl");
    const youtube = sign("youtube_search", { q: discoveryQueryDigest([QUERY]), videos: [], target: "x" });
    // No literature search at all: the entry's own step, and no second step about the absence of any search.
    expect(steps({ harm_screen: [notFound], answer_draft: LINKS + `\n\n${SAFETY}` })).toEqual([noReceipt(0, "anaphylaxis")]);
    // A receipt that does not verify counts for nothing; a search of another kind is not a literature search.
    const forged = check({ receipts: [audit, otherServer], harm_screen: [notFound], answer_draft: answer });
    expect(advisoryNotes(forged).filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toContain(noReceipt(0, "anaphylaxis"));
    expect(forged.receipts_rejected).toEqual([{ index: 1, reason: "signature_invalid" }]);
    expect(steps({ receipts: [audit, youtube], harm_screen: [notFound], answer_draft: `${LINKS}\n\n${SAFETY}` }))
      .toEqual([noReceipt(0, "anaphylaxis")]);
    // A search for another query bounds what it searched, and still leaves this harm's search unshown.
    expect(steps({ receipts: [audit, search("pubmed", "somatropin edema")], harm_screen: [notFound], answer_draft: answer }))
      .toEqual([noReceipt(0, "anaphylaxis")]);
    expect(steps({ harm_screen: [{ ...notFound, search_query: undefined }], answer_draft: `${LINKS}\n\n${SAFETY}` })).toEqual([
      "harm_screen[0] is not_found without search_query: give the exact query anaphylaxis was searched with, and pass " +
        "that search's research_receipt, or declare it not_checked."
    ]);
    expect(steps({ receipts: [audit, search()], harm_screen: [{ ...notFound, sources_searched: undefined }], answer_draft: answer }))
      .toEqual(["harm_screen[0] is not_found without sources_searched: give the kinds of source searched for anaphylaxis."]);
  });

  it("shares the bounding caveats of absence claims, once, including the full-text one", () => {
    const notLocated = "No study of the peptide's allergic reactions turned up.";
    const bounded = BOUNDED("PubMed");
    const both = check({
      receipts: [audit, search()], harm_screen: [onLabel, notFound],
      absence_claims: [{ quote: notLocated, state: "support_not_located" }],
      answer_draft: `${base().answer_draft}\n\n${notLocated} ${bounded}`
    });
    expect(both).toMatchObject({
      caveats: [
        "Where this answer says something was not found, it means the searches made here (PubMed) did not find it, and they did not cover older or variant terms, citation chains and grey literature; that is not evidence that it does not exist."
      ],
      limits: [
        "The serious-harm screen covered severe allergic reactions (product labels); anaphylaxis (case reports, serious events in trials). Other serious harms may not have been checked.",
        "Where this answer says something was not found, it means the searches made here (PubMed) did not find it, and they did not cover older or variant terms, citation chains and grey literature; that is not evidence that it does not exist."
      ],
      status: "ready_with_limits"
    });
    const sectionQuery = "anaphylaxis AND METHODS:somatropin";
    const sectionSearch = sign("literature_search", {
      src: "europepmc", q: discoveryQueryDigest([sectionQuery]), ret: 1, n: 1, ft: ["METHODS"]
    });
    const fullText = "Where it says something was not found, the full-text searches covered Europe PMC's full texts " +
      "only, about 30% of PubMed records.";
    expect(check({
      receipts: [audit, sectionSearch], full_text_search: { status: "run", queries: [sectionQuery] },
      harm_screen: [{ ...notFound, search_query: sectionQuery }],
      answer_draft: `${base().answer_draft}\n\n${fullText} ${BOUNDED("Europe PMC")}`
    })).toMatchObject({ status: "ready_with_limits", caveats: [fullText, BOUNDED("Europe PMC")] });
  });
});

describe("finalize_research harm_screen: a harm not checked reaches the answer", () => {
  it("writes the caveat with the harm as declared, on one line, with one closing mark", () => {
    expect(harmNotCheckedCaveat("anaphylaxis")).toBe(NOT_CHECKED);
    expect(harmNotCheckedCaveat("  severe allergic\n reactions after   earlier doses  ")).toBe(
      `${HARM_NOT_CHECKED_CAVEAT_START} severe allergic reactions after earlier doses.`);
    expect(harmNotCheckedCaveat("anaphylaxis.")).toBe(NOT_CHECKED);
    expect(harmNotCheckedCaveat("アナフィラキシー。")).toBe(`${HARM_NOT_CHECKED_CAVEAT_START} アナフィラキシー。`);
    const result = check({ harm_screen: [onLabel, { harm: " anaphylaxis\n", state: "not_checked" }] });
    expect(result).toMatchObject({
      caveats: [
        "A serious harm this answer did not check: anaphylaxis."
      ],
      limits: [
        "The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked.",
        "A serious harm this answer did not check: anaphylaxis."
      ],
      status: "ready_with_limits"
    });
    expectPassingLimits(result, ["A serious harm this answer did not check: anaphylaxis."]);
  });

  it("checks it as the other caveats are: its own sentence in prose a reader sees", () => {
    const harms = { harm_screen: [onLabel, notChecked] };
    for (const draft of [
      `${base().answer_draft}\n\n${NOT_CHECKED}`,
      `${base().answer_draft} One more thing. ${NOT_CHECKED} Ask if you want it checked.`,
      `${base().answer_draft}\n\n- **${NOT_CHECKED.slice(0, 20)}**${NOT_CHECKED.slice(20).toUpperCase()}`
    ]) expect(check({ ...harms, answer_draft: draft }).status, draft).toBe("ready_with_limits");
    for (const draft of [
      base().answer_draft!,
      `${base().answer_draft}\n\nIt is false that ${NOT_CHECKED.charAt(0).toLowerCase()}${NOT_CHECKED.slice(1)}`,
      `${base().answer_draft}\n\n${NOT_CHECKED.slice(0, -1)} or any other harm, which is fine.`,
      `${base().answer_draft}\n\n\`\`\`\n${NOT_CHECKED}\n\`\`\``,
      `${base().answer_draft}\n\nNote: \`${NOT_CHECKED}\``,
      `${base().answer_draft}\n\n> ${NOT_CHECKED}`,
      `${base().answer_draft}\n\n<!-- ${NOT_CHECKED} -->`,
      `${base().answer_draft}\n\n${HARM_NOT_CHECKED_CAVEAT_START} every harm.`
    ]) expectPassingLimits(check({ ...harms, answer_draft: draft }), ["A serious harm this answer did not check: anaphylaxis."]);
  });

  it("accepts it in the answer's language through caveat_renderings, checked by place and not by words", () => {
    const french = "Cette réponse n'a pas vérifié le risque d'anaphylaxie.";
    const japanese = "この回答ではアナフィラキシーを調べていません。";
    const harms = { harm_screen: [onLabel, notChecked] };
    for (const [language, text] of [["fr", french], ["ja", japanese]] as const) {
      const renderings = [{ caveat: NOT_CHECKED, text }];
      expect(check({ ...harms, answer_draft: `${base().answer_draft}\n\n${text}`, answer_language: language,
        caveat_renderings: renderings }).status).toBe("ready_with_limits");
      expectPassingLimits(check({ ...harms, answer_language: language, caveat_renderings: renderings }), ["A serious harm this answer did not check: anaphylaxis."]);
      expectPassingLimits(check({ ...harms, answer_draft: `${base().answer_draft}\n\nVoir : ${text.slice(0, -1)}, sauf exception.`,
        answer_language: language, caveat_renderings: renderings }), [NOT_CHECKED]);
    }
    // Limits remain available regardless of the draft's language or rendering declarations.
    expectPassingLimits(check({ ...harms, answer_draft: `${base().answer_draft}\n\n${french}`,
      caveat_renderings: [{ caveat: NOT_CHECKED, text: french }] }), [NOT_CHECKED]);
    // The harm may be declared in the answer's language: the server's words stay English, rendered with it.
    const declared = "l'anaphylaxie";
    expect(check({
      harm_screen: [onLabel, { harm: declared, state: "not_checked" }], answer_language: "fr",
      answer_draft: `${base().answer_draft}\n\n${french}`, caveat_renderings: [{ caveat: harmNotCheckedCaveat(declared), text: french }]
    })).toMatchObject({ status: "ready_with_limits", caveats: [`${HARM_NOT_CHECKED_CAVEAT_START} l'anaphylaxie.`] });
  });

  it("gives each harm not checked its own caveat, and each harm one entry", () => {
    const stroke = harmNotCheckedCaveat("stroke");
    const both = check({
      harm_screen: [onLabel, notChecked, { harm: "stroke", state: "not_checked" }],
      answer_draft: `${base().answer_draft}\n\n${NOT_CHECKED} ${stroke}`
    });
    expect(both).toMatchObject({
      caveats: [
        "A serious harm this answer did not check: anaphylaxis.",
        "A serious harm this answer did not check: stroke."
      ],
      limits: [
        "The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked.",
        "A serious harm this answer did not check: anaphylaxis.",
        "A serious harm this answer did not check: stroke."
      ],
      status: "ready_with_limits"
    });
    const twice = check({
      harm_screen: [onLabel, notChecked, { ...notChecked, harm: "Anaphylaxis." }],
      answer_draft: `${base().answer_draft}\n\n${NOT_CHECKED}`
    });
    expect(twice.caveats).toEqual([NOT_CHECKED]);
    expect(advisoryNotes(twice)).toEqual(["harm_screen[2] names the same harm as harm_screen[1]: give each harm one entry."]);
    // A harm found and declared not checked as well is one harm too.
    expect(steps({ harm_screen: [onLabel, { harm: "Severe  allergic reactions", state: "not_checked" }],
      answer_draft: `${base().answer_draft}\n\n${harmNotCheckedCaveat("Severe allergic reactions")}` }))
      .toEqual(["harm_screen[1] names the same harm as harm_screen[0]: give each harm one entry."]);
  });

  it("asks for the harm in plain words when its caveat would show internal labels", () => {
    const labelled = "anaphylaxis_after_rechallenge";
    expect(steps({ harm_screen: [onLabel, { harm: labelled, state: "not_checked" }],
      answer_draft: `${base().answer_draft}\n\n${harmNotCheckedCaveat(labelled)}` })).toEqual([
      "harm_screen[1].harm shows internal labels (anaphylaxis_after_rechallenge): the answer names this harm in its " +
        "caveat, so give it in plain words."
    ]);
    const named = "ImmuneEffectsAudit harms";
    expect(steps({ harm_screen: [{ harm: named, state: "not_checked" }],
      answer_draft: `${base().answer_draft}\n\n${harmNotCheckedCaveat(named)}` }, new Set(["ImmuneEffectsAudit"]))).toContain(
      "harm_screen[0].harm shows internal labels (ImmuneEffectsAudit): the answer names this harm in its caveat, so give " +
        "it in plain words.");
    // Plain words and a link are not labels; a harm the answer reports in its own sentence is not shown by the server.
    const plain = "reactions listed at https://example.org/a_b";
    expect(check({ harm_screen: [onLabel, { harm: plain, state: "not_checked" }],
      answer_draft: `${base().answer_draft}\n\n${harmNotCheckedCaveat(plain)}` }).status).toBe("ready_with_limits");
    expect(check({ harm_screen: [{ ...onLabel, harm: "allergic_reactions" }] }).status).toBe("ready_with_limits");
  });
});

// An entry goes with an unusable required field, and a note says so (the 30 Oct rerun's connector refusals).
const wholeDropped = (field: string) => `harm_screen[0]: dropped as a whole, since its required ${field} could not be used: send it again with that field usable, or leave it out.`;
describe("finalize_research harm_screen: bounded input, every problem at once", () => {
  const problems = (harm_screen: unknown, extra: Record<string, unknown> = {}, searchedHarm = false) => {
    const result = finalizeResearch({ ...base(), harm_screen, ...extra }, { secret: SECRET });
    expect(result.status).toBe(searchedHarm ? "ready_with_limits" : "not_ready");
    expect(result.answer_checked).toBe(true);
    expect(result.next_step_kinds).not.toContain("input_invalid");
    return result.notes!.filter((note) => /^(?:harm_screen|safety_question).*: (?:dropped|kept)/u.test(note));
  };

  it("bounds the entries and their text", () => {
    expect(problems(Array.from({ length: 21 }, (_, index) => ({ harm: `harm ${index}`, state: "not_checked" }))))
      .toEqual(["harm_screen: kept at most 20 items to stay within the list's size limit."]);
    expect(problems([{ harm: "h".repeat(151), state: "not_checked" }]))
      .toEqual(["harm_screen[0].harm: dropped: needs at most 150 characters.", wholeDropped("harm")]);
    expect(problems([{ ...notFound, search_query: "q".repeat(501) }], {}, true))
      .toEqual(["harm_screen[0].search_query: dropped: needs at most 500 characters."]);
    expect(problems([{ ...onLabel, answer_quote: "a".repeat(1_001) }], {}, true))
      .toEqual(["harm_screen[0].answer_quote: dropped: needs at most 1000 characters."]);
    expect(problems([{ harm: "   ", state: "not_checked" }]))
      .toEqual(["harm_screen[0].harm: dropped: needs at least 1 character.", wholeDropped("harm")]);
    // At the limits, the call runs.
    const twenty = Array.from({ length: 20 }, (_, index) => ({ harm: `harm ${index} ${"h".repeat(140)}`, state: "not_checked" as const }));
    const atLimit = finalizeResearch({ ...base(), harm_screen: [onLabel, ...twenty.slice(1)] }, { secret: SECRET });
    expect(atLimit.caveats).toHaveLength(19);
  });

  it("names every problem together as notes without adding format steps", () => {
    expect(problems([
      { harm: "anaphylaxis", state: "suspected", sources_searched: ["label", "forum"] },
      { harm: "stroke", state: "not_checked", sources_searched: "label", severity: "high" }
    ], { safety_question: "yes" })).toEqual(expect.arrayContaining([
      "safety_question: dropped: expected boolean.",
      "harm_screen[0].state: dropped: not a supported value; use label_warning, reported_signal, not_found, not_checked.",
      "harm_screen[0].sources_searched[1]: dropped: not a supported value; use label, regulator_warning, post_marketing, trial_serious_events, case_reports, community.",
      "harm_screen[1].sources_searched: dropped: expected a list.",
      "harm_screen[1].severity: dropped an unknown field."
    ]));
  });

  it("never echoes a receipt or the signing secret in its steps", () => {
    const receipts = [audit, search(), "rr1~literature_search~q=forged~1~0000"];
    for (const result of [
      finalizeResearch(base({ receipts, harm_screen: [notFound, { ...notFound, harm: "stroke", search_query: "x" }] }),
        { secret: SECRET }),
      finalizeResearch({ ...base({ receipts }), harm_screen: [{ harm: 7 }] }, { secret: SECRET })
    ]) {
      const output = JSON.stringify(advisoryNotes(result));
      expect(output).not.toContain(SECRET);
      expect(output).not.toContain("rr1~");
    }
  });
});

describe("finalize_research harm_screen is request-local (privacy data map)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the harms and queries out of the finalization receipt and the carried state", () => {
    const harms = [onLabel, notFound, { harm: "stroke after rechallenge", state: "not_checked" as const }];
    const result = check({
      receipts: [audit, search()], harm_screen: harms,
      answer_draft: `${base().answer_draft}\n\n${BOUNDED("PubMed")} ${harmNotCheckedCaveat("stroke after rechallenge")}`
    });
    expect(result.status).toBe("ready_with_limits");
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.claims).toMatchObject({
      limits: "3",
      status: "ready_with_limits"
    });
    for (const declared of ["allergic", "anaphylaxis", "somatropin", "rechallenge", QUERY]) {
      expect(JSON.stringify(receipt.claims)).not.toContain(declared);
      expect(JSON.stringify(result.carried ?? {})).not.toContain(declared);
      expect(result.carry_forward ?? "").not.toContain(declared);
    }
    // Outside the caller's checked answer, only a harm not checked comes back, in its caveat and limit for this
    // call. The query and declarations still stay out of the receipt and carried state.
    const output = JSON.stringify({ ...result, checked_answer: undefined, caveats: [], limits: [] });
    for (const declared of ["allergic", "anaphylaxis", "rechallenge", "somatropin"]) expect(output).not.toContain(declared);
    expect(result.caveats).toContain(harmNotCheckedCaveat("stroke after rechallenge"));
  });

  it("saves nothing of the screen with a free contributor's findings card", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({
      store, identitySecret: new TextEncoder().encode("synthetic-harm-screen-identity-secret-of-thirty-two-bytes")
    });
    await service.acceptFreeContributor("auth0|free", {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true
    });
    const saved: unknown[] = [];
    let finalize: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (name: string, _config: unknown, execute: typeof finalize) => {
        if (name === "finalize_research") finalize = execute;
      }
    } as unknown as McpServer, {
      researchAccessRequired: true, mcpSurface: "/mcp/claude", researchContributorAccessService: service,
      findingsLibrary: true,
      findingsSave: async (raw: unknown, _context: FindingsSaveContext): Promise<FindingsSaveResult> => {
        saved.push(raw);
        return { status: "saved", retryable: false, card_id: "ARF-0044", occurrence_count: 1 };
      }
    });
    const card = { ...CARD, findings: [{ ...CARD.findings[0]!, answer_quote: SAFETY, sources: [DOI], tags: ["full_text_read"] }] };
    const stroke = "stroke after rechallenge";
    const result = await finalize!(base({
      receipts: [audit, search()], harm_screen: [onLabel, notFound, { harm: stroke, state: "not_checked" }],
      findings_card: findingsCardSchema.parse(card),
      answer_draft: `${base().answer_draft}\n\n${BOUNDED("PubMed")} ${harmNotCheckedCaveat(stroke)}`
    }), {
      authInfo: {
        token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: "auth0|free" }
      }
    });
    expect(result.structuredContent).toMatchObject({
      status: "ready_with_limits", findings_card: { status: "checked", saved: { status: "saved", card_id: "ARF-0044" } }
    });
    expect(saved).toHaveLength(1);
    for (const declared of ["allergic", "anaphylaxis", "rechallenge", "somatropin", "label_warning", "not_checked"]) {
      expect(JSON.stringify(saved)).not.toContain(declared);
    }
  });
});

describe("finalize_research publishes harm_screen on both surfaces (owner answer 128b)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["/mcp", "/mcp/claude"] as const)("describes harm_screen and checks it through MCP on %s", async (surface) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { mcpSurface: surface });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "harm-screen-test", version: "1" });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const tool = (await client.listTools()).tools.find(({ name }) => name === "finalize_research")!;
      const relaxed = surface === "/mcp";
      type Node = { description?: string; type?: string; maxLength?: number; maxItems?: number; enum?: string[];
        items?: Node; properties?: Record<string, Node> };
      const published = finalizeResearchPublishedInputSchema({ relaxed }) as { properties: Record<string, Node> };
      expect(withoutLaterInputs(tool.inputSchema)).toEqual(published);
      const screen = published.properties.harm_screen!;
      expect(screen.type).toBe("array");
      expect(screen.description).toContain("the serious harms plausible for this exposure, apart from its common side " +
        `effects, each searched by name`);
      expect(screen.description).toContain(`a harm not_checked adds the caveat "${HARM_NOT_CHECKED_CAVEAT_START} [harm]."`);
      expect(Object.keys(screen.items!.properties!)).toEqual(["harm", "state", "sources_searched", "answer_quote", "search_query"]);
      expect(screen.items!.properties!.state!.enum).toEqual([...HARM_SCREEN_STATES]);
      expect(published.properties.safety_question).toMatchObject({ type: "boolean" });
      expect(published.properties.safety_question!.description).toContain("Required with answer_draft: true when");
      const sources = screen.items!.properties!.sources_searched!;
      if (relaxed) {
        // ChatGPT's app shows an array this deep only as "unknown": its JSON is in the tool's description.
        expect(sources).toEqual({ description: expect.stringContaining("The kinds of source searched for it") });
        expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).toContain("harm_screen[].sources_searched [\"label\",\"case_reports\"]");
        expect(screen.maxItems).toBeUndefined();
        expect(screen.items!.properties!.harm!.maxLength).toBeUndefined();
      } else {
        expect(sources.items!.enum).toEqual([...HARM_SCREEN_SOURCES]);
        expect(screen.maxItems).toBe(20);
        expect(screen.items!.properties!.harm!.maxLength).toBe(150);
      }
      expect(tool.description).toContain(FINALIZE_RESEARCH_SHAPES_DESCRIPTION);
      expect(tool.description).toContain("whether the question is about safety (safety_question, required), with " +
        "safety statements (safety_claims), a safety question or a medicine put forward or ranked for long-term use " +
        "(recommendations) the serious harms plausible for the exposure, apart " +
        "from its common side effects, each screened by name (harm_screen: label_warning or reported_signal with the " +
        "answer's sentence reporting it, not_found with the exact query of a PubMed, Europe PMC or ClinicalTrials.gov " +
        `search passed here, or not_checked, which the answer states in the caveat "${HARM_NOT_CHECKED_CAVEAT_START} ` +
        "[harm].\"), visible links");
      expect(screen.description).toContain("when safety_claims lists a sentence, safety_question is true or " +
        "recommendations lists one for long-term use");

      const logged = (["log", "info", "warn", "error", "debug"] as const)
        .map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
      const call = async (input: unknown) => {
        const response = await client.callTool({ name: "finalize_research", arguments: input as Record<string, unknown> });
        expect(response.isError).not.toBe(true);
        const text = (response.content as Array<{ type: string; text?: string }>).map(({ text }) => text ?? "").join("\n");
        return { result: response.structuredContent as Record<string, unknown>, text };
      };
      const screened = await call(base({ harm_screen: [onLabel, notChecked] }));
      expect(screened.result).toMatchObject({
        caveats: [
          "A serious harm this answer did not check: anaphylaxis."
        ],
        limits: [
          "The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked.",
          "A serious harm this answer did not check: anaphylaxis."
        ],
        next_steps: [],
        status: "ready_with_limits"
      });
      expect(screened.text).toContain(`Limit to include in your own words: ${NOT_CHECKED}`);
      const passed = await call(base({ harm_screen: [onLabel, notChecked], answer_draft: `${base().answer_draft}\n\n${NOT_CHECKED}` }));
      expect(passed.result).toMatchObject({ status: "ready_with_limits", caveats: [NOT_CHECKED], limits: ["The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked.", NOT_CHECKED] });
      const unscreened = await call(base({ harm_screen: undefined }));
      expect(unscreened.result.next_steps).toEqual([required("is missing", BECAUSE_CLAIMS)]);
      const undeclared = await call(base({ safety_question: undefined }));
      expect(advisoryNotes(undeclared.result)).toEqual([SAFETY_QUESTION_MISSING, TOOL_LIST_REFRESH_HINT]);
      const ranked = await call(base({ safety_claims: [], recommendations: [longTerm()], harm_screen: undefined,
        answer_draft: `${LINKS}\n\n${RANKED} ${CONDITIONAL}` }));
      expect(advisoryNotes(ranked.result)).toEqual([required("is missing", BECAUSE_LONG_TERM), TOOL_LIST_REFRESH_HINT]);
      // Both surfaces accept any input and answer it with AskRigor's own validation.
      const invalid = await call({ ...base(), harm_screen: [{ harm: "anaphylaxis", state: "suspected", sources_searched: "label" }] });
      expect(invalid.result).toMatchObject({ status: "not_ready", answer_checked: true, notes: [
        "harm_screen[0].state: dropped: not a supported value; use label_warning, reported_signal, not_found, not_checked.",
        "harm_screen[0].sources_searched: dropped: expected a list.",
        wholeDropped("state")
      ] });
      expect(invalid.result.next_step_kinds).not.toContain("input_invalid");
      // Nothing is logged about the call, its harms or its answer.
      for (const spy of logged) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain("anaphylaxis");
        expect(JSON.stringify(spy.mock.calls)).not.toContain("allergic");
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
