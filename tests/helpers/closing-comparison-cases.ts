// Owner answer 416a (24 Nov 2026, "both changes"): calls whose closing comparison rests on studies read in different
// ways, and calls carrying the paper's sentence, shared by the switch's tests. They use only what the final check had
// before the switch, so the calls themselves never change: tests/closing-comparison-off.test.ts holds the results the
// check gave them before the switch was built, and checks that the switch, off, still gives exactly those.
import { createHash } from "node:crypto";

import {
  plainAnswerClaimDigest, type FinalizeResearchInput, type FinalizeResearchOptions
} from "../../apps/research-mcp/src/research-finalization-gate.js";
import {
  issueResearchReceipt, plainAnswerAccountBinding, researchTargetDigest
} from "../../apps/research-mcp/src/research-receipts.js";
import { withCommunitySkip } from "./community-skip.js";
import { withSourceReading } from "./source-reading.js";

export const SECRET = "closing-comparison-test-secret-0123456789abcdef";
export const NOW = new Date("2026-11-27T12:00:00.000Z");
const now = () => NOW;
export const TARGET = "Whether magnesium clearance is slower in acute kidney injury";
export const CLAIMS = [
  "Acute kidney injury slows magnesium clearance.",
  "Magnesium levels should be checked daily in acute kidney injury."
] as const;
const PLAIN_TEXT = `${CLAIMS[0]} ${CLAIMS[1]} Most people recover.`;
export const ACCOUNT = plainAnswerAccountBinding(SECRET, "c".repeat(64));

// Three papers: one audited in full text, one read in full without an audit, one read as its PubMed abstract.
export const AUDITED = "10.1000/mag-audited";
export const FULL = "10.1000/mag-full-read";
export const ABSTRACT_PMID = "39000001";
export const ABSTRACT_DOI = "10.1000/mag-abstract";
export const HANDLE_AUDITED = `aft1_${"a".repeat(32)}`;
export const HANDLE_FULL = `aft1_${"b".repeat(32)}`;
export const REPORT = "https://example.org/kidney-report";

// What each paper says, as AskRigor holds it, for the lookups.
export const AUDITED_SENTENCE = "Fractional excretion of magnesium was lower in patients with acute kidney injury than in controls.";
export const FULL_SENTENCE = "Serum magnesium rose in 18 of 40 patients during the first week of acute kidney injury.";
export const ABSTRACT_SENTENCE = "Hypermagnesaemia was uncommon and occurred only in patients given magnesium-containing drugs.";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now });

export const RECEIPTS = {
  plain: sign("plain_answer", {
    claims: CLAIMS.map(plainAnswerClaimDigest), text: sha256(PLAIN_TEXT), target: researchTargetDigest(TARGET),
    acct: ACCOUNT, t: 1_000
  }),
  audited: sign("study_audit", { id: AUDITED, doi: AUDITED, handle: HANDLE_AUDITED, status: "complete_no_unresolved_fields",
    t: 2_000 }),
  full: sign("full_text_read", { id: FULL, doi: FULL, handle: HANDLE_FULL, content: "b".repeat(16), t: 2_100 }),
  abstract: sign("pubmed_record", { pmid: ABSTRACT_PMID, doi: ABSTRACT_DOI, abs: "1", t: 2_200 }),
} as const;

const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the closing comparison." };
const KEY_SOURCES = {
  audited: { id: AUDITED, status: "validated" as const, read_depth: "full_text_audited" as const, answer_marker: "Audited trial" },
  full: { id: FULL, status: "lead_only" as const, read_depth: "full_text_read" as const, answer_marker: "Full-text cohort" },
  abstract: { id: ABSTRACT_PMID, status: "lead_only" as const, read_depth: "abstract_only" as const,
    answer_marker: "Abstract study" },
};
const LINKS = {
  audited: `[Audited trial](https://doi.org/${AUDITED}) was audited in full.`,
  full: `[Full-text cohort](https://doi.org/${FULL}) was read in full.`,
  abstract: `[Abstract study](https://pubmed.ncbi.nlm.nih.gov/${ABSTRACT_PMID}/) was read as an abstract.`,
};
// The answer's own sentences for each point.
export const QUOTES = {
  slower: "In acute kidney injury, the kidneys clear magnesium more slowly than usual.",
  daily: "Checking magnesium every day is reasonable while kidney function is falling.",
  rose: "Magnesium rose in a minority of patients during the first week.",
  uncommon: "High magnesium was uncommon without magnesium-containing drugs.",
};

type Paper = keyof typeof KEY_SOURCES;
export type Comparison = NonNullable<FinalizeResearchInput["plain_answer_comparison"]>;

/**
 * A call whose research read the papers given, with the comparison given, and the quotes in its draft; `check`, the
 * options its fixture readings are read with (a call through the connector passes receipts signed at the real time).
 */
export function comparisonCall(papers: readonly Paper[], comparison: Comparison | undefined,
  overrides: Record<string, unknown> = {}, check: FinalizeResearchOptions = OPTIONS): Record<string, unknown> {
  const call = withCommunitySkip({
    receipts: [RECEIPTS.plain, ...papers.map((paper) => RECEIPTS[paper])],
    research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the closing comparison.",
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the closing comparison." },
    key_sources: papers.map((paper) => KEY_SOURCES[paper]),
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [],
    safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: `${papers.map((paper) => LINKS[paper]).join("\n\n")}\n\n${Object.values(QUOTES).join(" ")}`,
    ...(comparison === undefined ? {} : { plain_answer_comparison: comparison }),
  } as FinalizeResearchInput);
  return withSourceReading({ ...call, ...overrides }, { check });
}

/** The check's options for this account, with its note on, at a fixed time. */
export const OPTIONS: FinalizeResearchOptions = { secret: SECRET, plainAnswer: { note: true, account: ACCOUNT }, now };

/**
 * The calls whose results the switch, off, must leave exactly as they were: each kind of reading behind a point, a web
 * page, and the paper's sentence given in both places a later input can come, which the check before the switch
 * didn't know.
 */
export const OFF_CASES: ReadonlyArray<{ name: string; call: Record<string, unknown> }> = [
  { name: "audited", call: comparisonCall(["audited"], [
    { claim: CLAIMS[0], outcome: "confirmed", answer_quote: QUOTES.slower, sources: [AUDITED] },
    { claim: CLAIMS[1], outcome: "not_checked" }
  ]) },
  { name: "abstract", call: comparisonCall(["abstract"], [
    { claim: CLAIMS[0], outcome: "qualified", answer_quote: QUOTES.uncommon, sources: [ABSTRACT_PMID] },
    { claim: CLAIMS[1], outcome: "not_checked" }
  ]) },
  { name: "full text", call: comparisonCall(["full"], [
    { claim: CLAIMS[0], outcome: "qualified", answer_quote: QUOTES.rose, sources: [FULL] },
    { claim: CLAIMS[1], outcome: "not_checked" }
  ]) },
  { name: "every reading", call: comparisonCall(["audited", "full", "abstract"], [
    { claim: CLAIMS[0], outcome: "corrected", answer_quote: QUOTES.slower, sources: [AUDITED, FULL, ABSTRACT_PMID] },
    { claim: CLAIMS[1], outcome: "confirmed", answer_quote: QUOTES.daily, sources: [ABSTRACT_DOI] }
  ]) },
  { name: "report page", call: comparisonCall(["audited"], [
    { claim: CLAIMS[0], outcome: "confirmed", answer_quote: QUOTES.slower, sources: [REPORT] },
    { claim: CLAIMS[1], outcome: "not_checked" }
  ]) },
  { name: "sentence in later_inputs", call: (() => {
    const call = comparisonCall(["audited"], undefined);
    return { ...call, later_inputs: { ...call.later_inputs as object, plain_answer_comparison: [
      { claim: CLAIMS[0], outcome: "confirmed", answer_quote: QUOTES.slower, sources: [AUDITED],
        source_sentence: AUDITED_SENTENCE },
      { claim: CLAIMS[1], outcome: "not_checked" }
    ] } };
  })() },
  { name: "sentence at the top level", call: comparisonCall(["audited"], [
    { claim: CLAIMS[0], outcome: "confirmed", answer_quote: QUOTES.slower, sources: [AUDITED],
      source_sentence: AUDITED_SENTENCE } as Comparison[number],
    { claim: CLAIMS[1], outcome: "not_checked" }
  ]) },
];

/**
 * A result as the off test compares it: the turn's id, which each check draws at random (check-rounds.ts), set aside in
 * the carried state, and the tokens that sign it left out; everything else as given.
 */
export function comparable(result: Record<string, unknown>): Record<string, unknown> {
  const { round_token: _round, carry_forward: _carry, ...rest } = result;
  const carried = rest.carried;
  return carried !== null && typeof carried === "object" && "turn" in carried
    ? { ...rest, carried: { ...carried, turn: "(the turn's random id)" } } : rest;
}
