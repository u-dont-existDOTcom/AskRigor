import { z } from "zod";
import { normalizeProductName, productNameOccurs } from "@askrigor/sources";

import {
  ADMINISTRATION_ROUTES,
  EVIDENCE_ROUTE_WORDS,
  USE_ROUTE_WORDS
} from "./administration-routes.js";
import {
  CARRIED_STATE_TOO_LARGE, carriedStateSchema, issueCarriedState, userObservationSchema, verifyCarriedState, type CarriedState
} from "./carried-state.js";
import { analysesSavedSchema } from "./analysis-staging.js";
import { displayedProse, linkTargets, visibleText } from "./displayed-prose.js";
import type { SecondReaderFinding } from "./second-reader.js";
import { extractUnsignedNumbers, includesAbsoluteNumber } from "./unicode-numbers.js";
import {
  FINDINGS_SAVE_OFFER,
  findingsCardDigest,
  findingsCardSchema,
  screenFindingsCard,
  type FindingsCard,
  type FindingsPrivacyReason
} from "./findings/card.js";
import {
  discoveryQueryDigest,
  issueResearchReceipt,
  RESEARCH_RECEIPT_MAX_AGE_MS,
  RESEARCH_RECEIPT_MAX_CHARACTERS,
  readPages,
  receiptIssueOrder,
  researchTargetDigest,
  roundUnreadPages,
  verifyResearchReceipt,
  type ResearchReceiptKind,
  type ResearchReceiptRejection
} from "./research-receipts.js";

/**
 * Server-side completion gate for MCP research (finalize_research).
 *
 * The model passes the research receipts it received, the research target,
 * and its declarations: whether community evidence was researched, whether
 * the answer compares treatments, and which studies it depends on. Discovery
 * and coverage receipts sign a digest of their research target, so only the
 * research done for this target counts. The gate verifies the receipts and answers with next steps
 * (not_ready), the limits the answer must state (ready_with_limits), or ready.
 * Completion claims therefore rest on server-issued receipts rather than on
 * the model's own account, which is what the prose gates used to ask for.
 */

const youtubeVideoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);
const communityPlatformSchema = z.enum([
  "youtube", "reddit", "forum", "facebook", "telegram", "discord", "patient_organization", "review_site", "other"
]);
const communityFindingText = z.string().trim().min(1).max(800);
// How the reviews read on a review site were chosen (HRP ReviewCorpusSelectionAndCounts;
// the Forum Signal Module's review_platforms receipt lists the same values). The first
// four are frames not chosen by outcome; the others show which experiences exist, not
// how common each is, so the answer says so in the words below.
export const REVIEW_SELECTIONS = [
  "all", "condition_mentions", "most_recent", "random_or_stratified", "top_ranked", "outcome_keyword", "other_partial"
] as const;
const PARTIAL_REVIEW_SELECTIONS: ReadonlyMap<string, string> = new Map([
  ["top_ranked", "the ones the site ranks first"],
  ["outcome_keyword", "found by searching for outcomes"],
  ["other_partial", "a partial set"]
]);
// How the threads read in a community were chosen (HRP
// DirectionLabelsNeedOutcomeNeutralSelection; lesson #27 by owner question 92),
// with the same partial frames and words as reviews.
export const THREAD_SELECTIONS = [
  "all_found", "most_recent", "random", "top_ranked", "outcome_keyword", "other_partial"
] as const;
const PARTIAL_THREAD_SELECTIONS: ReadonlyMap<string, string> = new Map([
  ["top_ranked", "the ones ranked first"],
  ["outcome_keyword", "found by searching for outcomes"],
  ["other_partial", "a partial set"]
]);
// The answer's own words for a finding, copied from answer_draft: the gate
// checks that the answer shows them, which works in any language, and leaves
// whether they report the finding to the model that wrote both.
const answerQuote = z.string().trim().max(1_000);
const ANSWER_QUOTES_DESCRIPTION = "With answer_draft: the answer's sentence(s) that report each finding, copied from " +
  "it; one may serve several.";

export const FINALIZE_RESEARCH_CONTRACT = "2026-10-07";
// A chat keeps its own copy of the tool list, so a field added in a release can be missing from it. When a required
// declaration is missing, next_steps names the way out once instead of looping (UDA lane item
// 2026-10-07-finalizer-must-not-require-unexposed-schema-fields).
export const TOOL_LIST_REFRESH_HINT = "If this chat's AskRigor tool has no such field, its tool list is outdated: " +
  "refreshing the AskRigor connector in the app's settings and starting a new chat loads the current list.";

// acquire_open_full_text signs a lead receipt only when the exact public-copy searches are recorded with it
// (canSignFullTextLead), so a step that sends the AI there for one says so, or a retry without them loops.
export const LEAD_RECEIPT_SEARCH = "A lead receipt needs the public-copy search recorded: search for the exact DOI " +
  "and the exact title, then pass those searches as public_copy_search and any public copy found as candidate_urls.";

// Community evidence declared not relevant because the question has no real-world outcome: the answer says so in this
// sentence, completed by the reason the call declares (owner question 125, from lesson #38, where a question whether
// two product names meant the same thing was answered from chemistry alone and nothing showed the skip).
export const COMMUNITY_SKIP_CAVEAT_START = "I did not search firsthand reports or community discussions for this answer:";
export const COMMUNITY_SKIP_LIMIT = "Firsthand reports and community discussions were not searched, for a question " +
  "declared to have no real-world outcome: say so in the answer, with the reason, as the caveat does.";

/** The skip's caveat: the server's words and the declared reason, on one line, ending as a sentence. */
export function communitySkipCaveat(reason: string): string {
  const stated = reason.replace(/\s+/gu, " ").trim();
  return `${COMMUNITY_SKIP_CAVEAT_START} ${stated}${/\p{STerm}$/u.test(stated) ? "" : "."}`;
}

// What a receipt that failed verification needs, by the verifier's reason (UDA lane item
// 2026-10-12-finalizer-bounded-completion-and-receipt-diagnostics): each gets its own step and way out. A step names
// the receipt by its place in receipts and never repeats its contents.
const RECEIPT_REJECTION_STEPS: Readonly<Record<ResearchReceiptRejection, string>> = {
  signature_invalid: "does not verify, because it was changed in copying or issued by another AskRigor server: copy " +
    "it again exactly as the tool returned it",
  malformed: "is not a whole research receipt: copy the whole research_receipt value exactly as the tool returned it",
  expired: `has expired, since a research receipt is valid for ${RESEARCH_RECEIPT_MAX_AGE_MS / 3_600_000} hours: ` +
    "repeat the call it came from and pass the research_receipt it returns",
  unknown_kind: "is a kind of receipt this AskRigor server does not know, perhaps from another version of AskRigor: " +
    "repeat the call it came from and pass the research_receipt it returns"
};
const rejectedReceiptStep = (index: number, reason: ResearchReceiptRejection): string =>
  `receipts[${index}] ${RECEIPT_REJECTION_STEPS[reason]}. Leaving it out is allowed; work that rests only on it ` +
  "then needs its call again.";

// What a harm or safety sentence rests on (owner questions 86 and 89; a share of
// selected reports, lesson #25 by owner question 92).
export const SAFETY_BASES = [
  "comparative_rates", "observed_rates", "share_of_reports", "case_reports", "hazard_measurement", "not_quantified"
] as const;

// The serious-harm screen (owner answer "128b", 2026-10-20, from lesson #44): what the screen found for each serious
// harm plausible for the exposure, and the kinds of source searched for it.
export const HARM_SCREEN_STATES = ["label_warning", "reported_signal", "not_found", "not_checked"] as const;
export const HARM_SCREEN_SOURCES = [
  "label", "regulator_warning", "post_marketing", "trial_serious_events", "case_reports", "community"
] as const;
const HARM_SCREEN_MAX_ENTRIES = 20;
const HARM_TEXT_MAX_CHARACTERS = 150;
const HARM_QUERY_MAX_CHARACTERS = 500;
// A serious harm the screen did not search by name reaches the answer in this sentence, completed by the harm as the
// call declares it (owner answer "128b": "This answer did not check [harm].").
export const HARM_NOT_CHECKED_CAVEAT_START = "This answer did not check";

/** The caveat for a harm not checked: the server's words and the declared harm, on one line, ending as a sentence. */
export function harmNotCheckedCaveat(harm: string): string {
  const stated = harm.replace(/\s+/gu, " ").trim();
  return `${HARM_NOT_CHECKED_CAVEAT_START} ${stated}${/\p{STerm}$/u.test(stated) ? "" : "."}`;
}

// Research results remind the AI, in the turn it researches, that answers using
// the research are checked at the end, in that turn or a later one (owner
// question 86: a "continue" turn dropped AskRigor's final check).
export const FINALIZE_REMINDER = "Answers that use this research are checked with finalize_research before they " +
  "are given, in this turn or a later one.";

export const READ_DEPTH_VALUES = [
  "full_text_audited", "full_text_read", "partial_text", "abstract_only", "conference_abstract",
  "secondary_only", "metadata_only", "inaccessible", "route_error"
] as const;

// One forum report count; a community's report_identity lists one per exposure.
const reportIdentitySchema = z.object({
  exposure: z.string().trim().min(1).max(200)
    .describe("The exact exposure the answer draws on, as reports name it: a form, product, dose or program."),
  reports_read: z.number().int().nonnegative()
    .describe("Reports about it in this community's threads you read: firsthand accounts, advice, hearsay and questions."),
  firsthand_exact: z.number().int().nonnegative()
    .describe("People describing their own use of exactly that exposure."),
  exposure_unclear: z.number().int().nonnegative()
    .describe("Firsthand reports that don't say which form or product was used."),
  other_exposure: z.number().int().nonnegative()
    .describe("Firsthand reports of something else (another form, a food, another product); not counted for the exposure."),
  not_firsthand: z.number().int().nonnegative()
    .describe("Advice, hearsay, questions and speculation; not counted as experiences."),
  measured_after: z.number().int().nonnegative()
    .describe("Of the firsthand_exact reports, those giving a measurement after the change (a laboratory value or test), not only how the person felt.")
}).strict();

// full_text_search and lab_preparation are one object each, not two alternatives: ChatGPT's app shows the model a
// two-branch union only as "unknown" (read-only Codex probes, 2026-10-16), so the model invented their fields and
// the connector rejected the call. The status names the field it needs, which the final check asks for.
export const finalizeResearchInputSchema = z.object({
  receipts: z.array(z.string().max(RESEARCH_RECEIPT_MAX_CHARACTERS)).max(300)
    .describe("Every research_receipt AskRigor tools returned during this research, copied exactly."),
  full_text_search: z.object({
    status: z.enum(["run", "not_needed"]),
    queries: z.array(z.string().min(1).max(500)).min(1).max(10).optional()
      .describe("With status run: the Europe PMC section queries searched."),
    reason: z.string().trim().min(10).max(300).optional()
      .describe("With status not_needed: why no full-text search was needed.")
  }).strict().optional().describe("Records the model's declaration of full-text search: run with the Europe PMC section queries " +
    "searched, or not_needed with its reason. Required when key_sources is non-empty; each run query matches a " +
    "verified Europe PMC section-search receipt."),
  lab_preparation: z.object({
    status: z.enum(["covered", "not_applicable"]),
    answer_quotes: z.array(z.string().trim().min(10).max(500)).min(1).max(5).optional()
      .describe("With status covered: the quotes from answer_draft."),
    reason: z.string().trim().min(10).max(300).optional()
      .describe("With status not_applicable: why no lab result is interpreted and no test planned.")
  }).strict().optional().describe("Records the model's declaration of lab preparation: covered with one to five quotes from " +
    "answer_draft giving collection conditions or preparation advice, or not_applicable with its reason when the " +
    "answer interprets no lab result and plans no test. Required when key_sources is non-empty; each covered quote " +
    "is compared with the answer for this call only. Applicability and advice quality remain the model's declaration."),
  community_evidence: z.enum(["researched", "not_relevant"])
    .describe("researched when firsthand community evidence could plausibly matter; not_relevant needs a basis and a reason."),
  commercial_review_applicability: z.object({
    status: z.enum(["required", "not_applicable"])
      .describe("Whether buyer reviews are required for this question or no product or service people buy is involved."),
    products: z.array(z.string().trim().min(1).max(200)).min(1).max(6).optional()
      .describe("When required: the products or services concerned, each exact product and variant when the user " +
        "named one; for an ingredient, the product forms people buy."),
    reason: z.string().trim().min(10).max(300).optional()
      .describe("When not_applicable: why no product or service people buy is involved.")
  }).strict().optional()
    .describe("Whether the question concerns a product or service people buy (a supplement, consumer health " +
      "product, device, app, formulation, or health service), whose buyers' reviews are then a community lane of " +
      "their own (platform review_site). Records a required declaration when community evidence is researched, " +
      "or when no_real_world_outcome is declared with key studies."),
  not_relevant_basis: z.enum(["no_real_world_outcome", "emergency_before_triage"]).optional()
    .describe("Why firsthand reports cannot matter: no real-world outcome (a definition, calculation, or chemical or " +
      "mechanistic question), or an emergency before triage."),
  not_relevant_reason: z.string().trim().min(1).max(1_000).optional()
    .describe("Needed with not_relevant: why firsthand reports cannot matter, in plain words. With " +
      `no_real_world_outcome the answer states it in the caveat "${COMMUNITY_SKIP_CAVEAT_START} [reason]."`),
  material_video_ids: z.array(youtubeVideoIdSchema).max(60).optional()
    .describe("Videos worth auditing: each adds an approach or substantial firsthand experience. Defaults to every audited video."),
  no_material_video_reason: z.string().trim().min(1).max(1_000).optional()
    .describe("Why none of the videos found was worth auditing; needed only when discovery found videos but material_video_ids is empty."),
  treatment_choice: z.enum(["compared", "not_compared"])
    .describe("compared when the answer compares, ranks or recommends treatment options. Deep research then needs an " +
      "assess_treatment_landscape_coverage result; a first pass presents the comparison as provisional, with no final ranking."),
  research_target: z.string().trim().min(1).max(5_000)
    .describe("The research target, copied exactly as given to the scout, search_youtube and " +
      "assess_treatment_landscape_coverage, and as research_question to surveys and community audits. Discovery " +
      "and coverage receipts made for any other target do not count."),
  research_depth: z.enum(["first_pass", "deep"]).default("first_pass")
    .describe("first_pass unless the user or an automated research brief asked for deep research."),
  open_leads: z.array(z.object({
    direction: z.enum(["studies", "community"]).default("community")
      .describe("studies: a deeper study review (studies whose methods were not audited in full text, or questions not " +
        "yet searched); community: deeper community research (communities, options or subgroups not yet reached)."),
    topic: z.string().trim().min(1).max(200),
    why: z.string().trim().min(1).max(500)
      .describe("What this focus could change in this answer (the conclusion, a ranking, the confidence, or only " +
        "detail) and why it looks promising.")
  }).strict()).max(12).optional()
    .describe("After a first pass: two or three focuses for each way to go deeper, studies and (when community evidence " +
      "was researched) community, each with what it could change in this answer (the conclusion, a ranking, the " +
      "confidence, or only detail) and why it looks promising. When discovery has not saturated, the community " +
      "focuses include the topics where more community signal is likely. Focuses deepen what the answer covers: a " +
      "first pass still covers every plausible option class and the red flags briefly, never leaving them for later."),
  another_pass_estimate: z.string().trim().min(1).max(200).optional()
    .describe("After a first pass: roughly what another pass would take, with a number in digits and a unit, such " +
      "as \"about 20 minutes and 15 YouTube searches\"."),
  community_findings: z.object({
    product_corpora: z.array(z.object({
      product: z.string().trim().min(1).max(200).describe("Records the exact listed product and variant."),
      video_ids: z.array(youtubeVideoIdSchema).max(60).describe("Lists admitted videos covered by this product's comment-audit receipts, possibly empty."),
      exact_product_signal: communityFindingText.describe("Records the signal from comments classified as the exact product."),
      variant_unresolved_signal: communityFindingText.optional().describe("Records signal whose product variant remains unresolved.")
    }).strict()).max(6).optional().describe("Records one corpus per listed product when commercial reviews are required."),
    videos_reviewed: z.array(youtubeVideoIdSchema).min(1).max(60)
      .describe("Every video whose comments you read."),
    benefit_reports: z.string().trim().min(1).max(800),
    no_effect_reports: z.string().trim().min(1).max(800),
    adverse_reports: z.string().trim().min(1).max(800),
    creators_versus_commenters: z.string().trim().min(1).max(500),
    effect_on_answer: z.string().trim().min(1).max(800),
    answer_quotes: z.object({
      benefit_reports: answerQuote,
      no_effect_reports: answerQuote,
      adverse_reports: answerQuote,
      creators_versus_commenters: answerQuote,
      effect_on_answer: answerQuote
    }).strict().optional().describe(ANSWER_QUOTES_DESCRIPTION)
  }).strict().optional()
    .describe("What the YouTube comments you read showed: benefit, no-effect and adverse reports with rough counts, " +
      "how creators differ from independent commenters, and what this changes in the answer. Records summaries without quotations or commenter names. Needed whenever a comment audit ran, even if the signal was weak or neutral; the answer " +
      "must report it (must_report)."),
  principal_communities: z.array(z.object({
    name: z.string().trim().min(1).max(120).describe("As its users know it, such as r/trt, MESO-Rx or YouTube."),
    platform: communityPlatformSchema,
    named_by_user: z.boolean().optional().describe("true when the user asked for this community to be searched; each such community is searched, or its access boundary recorded (HRP PrincipalPlatformMapping).")
  }).strict()).min(1).max(8).optional()
    .describe("Where people discussing this actually talk, the dominant first: subreddits, specialist forums, " +
      "Facebook groups, patient organizations, YouTube, and for a product people buy, the sites where buyers review " +
      "it (platform review_site). Needed when community evidence is researched; coverage includes the dominant " +
      "community and at least one independent community."),
  single_community_reason: z.string().trim().min(1).max(500).optional()
    .describe("Why only one community discusses this, when principal_communities lists one."),
  community_searches: z.array(z.object({
    community: z.string().trim().min(1).max(120).describe("The community searched, named as in principal_communities."),
    platform: communityPlatformSchema.exclude(["youtube"]),
    queries: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
    threads_read: z.array(z.object({
      url: z.string().trim().url().max(2_048).describe("The thread's full link; on Reddit, reddit.com/r/<name>/comments/<id>/…; " +
        "on a review site, the product's reviews page"),
      title: z.string().trim().min(1).max(300).optional()
    }).strict()).max(30).default([]),
    thread_selection: z.enum(THREAD_SELECTIONS).optional()
      .describe("How you chose the threads you read, outside review sites: every relevant one the searches found; the " +
        "most recent; a random sample; the ones ranked first; ones found by searching for outcomes; or another " +
        "partial set. The last three show which experiences exist, not how common they are."),
    // One exposure may come as one object, which ChatGPT's app shows the model only as "unknown" (lesson #30's
    // 2026-10-16 regression sent one); it counts as a list of one.
    report_identity: z.union([reportIdentitySchema, z.array(reportIdentitySchema).min(1).max(4)])
      .transform((identity) => Array.isArray(identity) ? identity : [identity]).optional()
      .describe("Outside review sites, for each exposure the answer draws on from this community's threads: how the reports you read divide. The four classes add up to reports_read (HRP ScopeAxesBeforeSampling, ObjectiveSubjectiveSeparation)."),
    access_boundary: z.enum([
      "no_web_search", "login_required", "blocked", "retrieval_failed", "no_relevant_results"
    ]).optional()
      .describe("What stopped the search: this app has no web search; the site needs a login; the site refused " +
        "access, such as a block page; a search or page fetch failed, such as an error or a timeout; or the " +
        "searches found nothing relevant."),
    url: z.string().trim().url().max(2_048).optional()
      .describe("The community's own address (its forum, group or site link). Needed when no thread was read outside " +
        "Reddit, so the community is known by its site rather than its name."),
    review_corpora: z.array(z.object({
      product: z.string().trim().min(1).max(200).describe("The exact product and variant, as its label names it."),
      ratings_shown: z.number().int().min(0).optional()
        .describe("Records the star-rating count shown by the site, separate from written reviews."),
      reviews_shown: z.number().int().min(0).optional()
        .describe("Records the written-review count shown by the site, separate from star ratings."),
      reviews_read: z.number().int().min(1),
      outcome_search: z.object({
        queries: z.array(z.string().trim().min(1).max(200)).min(1).max(12)
          .describe("Lists searches run in the site's review text for the outcome, in reviewers' everyday words and languages."),
        directions: z.array(z.enum(["benefit", "no_effect", "worse", "adverse", "stopped"])).min(1).max(5)
          .refine((directions) => new Set(directions).size === directions.length, "Directions must be unique.")
          .describe("Lists distinct searched directions, including benefit, no_effect and worse or adverse.")
      }).strict().optional()
        .describe("Records outcome searches run within this product's written reviews, as the model's declaration. Exactly one of outcome_search or outcome_search_boundary is present."),
      outcome_search_boundary: z.enum(["no_text_search", "search_blocked", "login_required"]).optional()
        .describe("Records why this product's reviews could not be searched for the outcome; the reviews read are a preview, not a measure of how often it helps or harms."),
      item_identity: z.object({
        exact_product: z.number().int().nonnegative(),
        variant_unresolved: z.number().int().nonnegative(),
        other_variant_excluded: z.number().int().nonnegative()
      }).strict().optional().describe("Records item-level product identity counts; their sum equals reviews_read. Other variants are excluded from this product's signal."),
      selection: z.enum(REVIEW_SELECTIONS)
        .describe("How you chose the reviews you read: all of them; every one mentioning the condition; the most " +
          "recent; a random sample or one stratified by rating; the ones ranked first; ones found by searching for " +
          "outcomes; or another partial set. The last three show which experiences exist, not how common they are.")
    }).strict()).min(1).max(6).optional()
      .describe("Records each product's review corpus on a review_site: star ratings when given, written reviews shown, " +
        "reviews read and their selection, and outcome-search queries and directions or the review-text search boundary."),
    benefit_reports: communityFindingText.optional(),
    no_effect_reports: communityFindingText.optional(),
    adverse_reports: communityFindingText.optional(),
    effect_on_answer: communityFindingText.optional(),
    answer_quotes: z.object({
      benefit_reports: answerQuote,
      no_effect_reports: answerQuote,
      adverse_reports: answerQuote,
      effect_on_answer: answerQuote
    }).strict().optional().describe(ANSWER_QUOTES_DESCRIPTION)
  }).strict()).max(12).optional()
    .describe("Each community outside YouTube that you searched with your own web search: the queries, the threads " +
      "you read and what they showed (benefit, no-effect and adverse reports with rough counts, and the effect on " +
      "the answer), or the access boundary that stopped the search. Records summaries without quotations or poster names. " +
      "AskRigor cannot see these searches, so the answer links the threads you read and says they were not verified. " +
      "YouTube goes through its own tools."),
  comparison_claims: z.array(z.object({
    quote: answerQuote.describe("The answer's sentence drawing the comparison, copied from answer_draft."),
    arms: z.array(z.object({
      exposure: z.string().trim().min(1).max(200),
      dose: z.number().nonnegative().nullable(),
      unit: z.string().trim().min(1).max(40).nullable()
    }).strict()).length(2)
      .describe("Each side as the reports give it: the exposure, its daily dose as a number, and the unit; null when a report gives none."),
    same_people: z.boolean()
      .describe("true when the reports behind it come from people who used both sides.")
  }).strict()).max(12).optional()
    .describe("With answer_draft, when treatment_choice is compared and forum threads were read: each comparison the answer draws from community reports, with both sides' doses as numbers; an empty list means the answer draws none from them (HRP ScopeAxesBeforeSampling)."),
  key_sources: z.array(z.object({
    id: z.string().trim().min(1).max(300).describe("DOI, PMID or PMCID."),
    status: z.enum(["validated", "lead_only"]),
    read_depth: z.enum(READ_DEPTH_VALUES).optional()
      .describe("Records each source's required reading depth; full_text_audited needs a verified method audit, full_text_read a completed-reading or audit receipt."),
    answer_marker: z.string().trim().min(3).max(80).optional()
      .describe("Required with answer_draft: the visible label for this source, 3–80 characters, on the same line as its link."),
    reason: z.string().trim().min(1).max(1_000).optional()
  }).strict()).max(60)
    .describe("Lists each study the conclusions depend on: validated after a full-text method audit, or lead_only " +
      "when the acquisition (or, for a PMID without a DOI, the PubMed record) receipt shows no open full text. " +
      "The audit's validation checks that its findings cite the document's own blocks and that every domain is " +
      "covered, not that each interpretation is right. " +
      "With answer_draft, each study has a visible link with its DOI, PMID or PMCID, or to a page AskRigor's receipts " +
      "tie to it: a copy read here, or the page resolve_doi found the DOI registered to."),
  intervention_identity: z.object({
    status: z.enum(["not_applicable", "checked"]),
    reason: z.string().trim().min(1).max(1_000).optional(),
    interventions: z.array(z.object({
      study_ids: z.array(z.string().trim().min(1).max(300)).min(1).max(60),
      label: z.string().trim().min(1).max(200),
      status: z.enum(["resolved", "unresolved"]),
      identity: z.object({
        registry_code: z.string().trim().min(1).max(300),
        sponsor_or_maker: z.string().trim().min(1).max(300),
        current_product: z.string().trim().min(1).max(200)
      }).strict().optional()
    }).strict()).min(1).max(60).optional()
  }).strict().optional().describe("Records whether key studies tested coded, branded, combination or multi-ingredient interventions, including co-administered drugs (such as L-DOPA given with carbidopa), and their traced whole-intervention identity. Needed when key_sources is nonempty."),
  shopping: z.object({
    status: z.enum(["not_requested", "buy_options", "no_live_option_found"]),
    destination: z.string().trim().min(1).max(200).optional(),
    offers: z.array(z.object({
      product: z.string().trim().min(1).max(200),
      url: z.string().trim().url().max(2_048),
      offer_state: z.enum(["identity_only", "domestic_orderable", "international_storefront", "destination_confirmed", "live_destination_orderable", "exporter_lead"])
        .describe("Records the offer's declared orderability state. exporter_lead is a business-to-business supplier lead and can only be context; a buy_option requires live_destination_orderable."),
      role: z.enum(["buy_option", "context"])
    }).strict()).max(30).optional(),
    routes_searched: z.array(z.enum(["international_storefronts", "marketplaces", "exporters", "specialist_sellers", "secondary_marketplaces"])).max(5).optional()
  }).strict().optional().describe("Records destination-bound shopping declarations when commercial reviews are required: no request and no offers, live buy options linked in the draft, or a bounded no-result after at least three distinct international routes. These are model declarations, not provider-verified offers."),
  answer_draft: z.string().trim().min(1).max(60_000).optional()
    .describe("The answer you are about to give, exactly as the user will see it. Needed before the gate reports ready; " +
      "it is checked for internal labels, bare video IDs, a pasted long prompt, the sentences answer_quotes copies " +
      "and the caveats (each as its own sentence, as written or as caveat_renderings gives it), and is not stored."),
  reader_dismissed: z.array(z.object({
    quote: answerQuote,
    reason: z.string().trim().min(1).max(200)
  }).strict()).max(20).optional().describe("Sentences a second reading flagged that you judge are not what it says, each " +
    "with a one-line reason; each quote copied from answer_draft."),
  absence_claims: z.array(z.object({
    quote: answerQuote.describe("The sentence(s), copied from answer_draft."),
    state: z.enum(["support_not_located", "direct_null_evidence", "not_established", "bounded_exclusion"])
      .describe("support_not_located: the searches did not find it; direct_null_evidence: studies found no effect; " +
        "not_established: studies were found but do not establish the effect; " +
        "bounded_exclusion: precise studies rule out an effect above a stated size."),
    studies: z.array(z.string().trim().min(1).max(300)).max(20).optional()
      .describe("For direct_null_evidence, not_established and bounded_exclusion: the key sources (DOI, PMID or " +
        "PMCID) it rests on.")
  }).strict()).max(20).optional()
    .describe("With answer_draft: each place the answer says something was not found, not studied, has no evidence or " +
      "has no effect, or calls an intervention's evidence unconvincing, weak, not demonstrated or showing no benefit " +
      "(an empty list if none). Evidence-strength sentences are absence claims, declared with not_established and " +
      "their key sources when studies were found, or support_not_located with search coverage when none were."),
  scale_results: z.array(z.object({
    quote: answerQuote.describe("Records the sentence(s) reporting and explaining the result, copied from answer_draft."),
    scale: z.string().trim().min(1).max(300).describe("Records the scale's name or abbreviation as the answer writes it."),
    range: z.object({ min: z.number(), max: z.number() }).strict()
      .describe("Records the scale's possible range, with both endpoints in the quote."),
    better: z.enum(["lower", "higher"])
      .describe("Records the model's declaration of which direction means a better outcome."),
    values: z.array(z.number()).min(1).max(4)
      .describe("Lists the numbers the quote reports, such as group scores and their difference."),
    benchmark: z.union([
      z.object({
        value: z.number(),
        kind: z.enum(["minimal_important_difference", "clinical_cutoff", "other"])
      }).strict(),
      z.literal("none_established")
    ]).describe("Records a benchmark value in the quote and its kind, or none_established when no benchmark is established.")
  }).strict()).max(20).optional()
    .describe("Lists each scale or questionnaire result reported in answer_draft (an empty list if none). With " +
      "answer_draft this declaration is required. The quote contains the scale name, both range endpoints, each " +
      "value and any benchmark value as numbers; digits in any script and a decimal dot or comma count, compared " +
      "by absolute value. Direction and magnitude interpretation remain the model's declarations."),
  safety_claims: z.array(z.object({
    quote: answerQuote.describe("The sentence(s), copied from answer_draft."),
    direction: z.enum(["harm", "safety"])
      .describe("harm: warns that something can cause harm, is unsafe, toxic or risky, or should be avoided; " +
        "safety: calls something safe or harmless."),
    exposure: z.string().trim().min(1).max(300)
      .describe("What the sentence is about: the substance, form, dose and route, as the answer means it."),
    basis: z.enum(SAFETY_BASES)
      .describe("comparative_rates: a controlled comparison reports it in each group; observed_rates: a rate " +
        "without a comparator; share_of_reports: a share of selected reports, posts or passages, not of people; " +
        "case_reports: reports without a denominator; hazard_measurement: a laboratory, animal or composition " +
        "measurement, not observed outcomes in people; not_quantified: no source found gives a rate."),
    measured_exposure: z.string().trim().min(1).max(300).optional()
      .describe("What the cited evidence actually measured; needed for every basis except not_quantified."),
    studies: z.array(z.string().trim().min(1).max(300)).max(20).optional()
      .describe("The key sources (DOI, PMID or PMCID) it rests on; needed for every basis except not_quantified, " +
        "and for share_of_reports when the reports come from a study.")
  }).strict()).max(20).optional()
    .describe("Records each sentence of the answer that warns that something can cause harm, is unsafe, toxic or " +
      "risky, or should be avoided because of a possible harm, or that calls something safe or harmless, with what " +
      "it is about, its basis and the sources it rests on (an empty list if none)."),
  safety_question: z.boolean().optional()
    .describe("true when the user asks whether something is safe, how risky it is or what harm it can do, or the " +
      "answer compares options' safety. With answer_draft, harm_screen is then required, as it is whenever " +
      "safety_claims lists a sentence."),
  harm_screen: z.array(z.object({
    harm: z.string().trim().min(1).max(HARM_TEXT_MAX_CHARACTERS)
      .describe(`One serious harm plausible for this exposure, in at most ${HARM_TEXT_MAX_CHARACTERS} characters, ` +
        `named as the answer would name it, so that "${HARM_NOT_CHECKED_CAVEAT_START} [harm]." reads as a sentence: ` +
        "for example, severe allergic reactions after injections that were tolerated before."),
    state: z.enum(HARM_SCREEN_STATES)
      .describe("label_warning: an official label or a regulator's safety warning names it; reported_signal: " +
        "post-marketing reports, trials' serious adverse events, case reports or community reports describe it, " +
        "with no such warning; not_found: searched by name and not found; not_checked: not searched by name."),
    sources_searched: z.array(z.enum(HARM_SCREEN_SOURCES)).max(HARM_SCREEN_SOURCES.length).optional()
      .describe("The kinds of source searched for it: label, regulator_warning (a regulator's safety warnings), " +
        "post_marketing (pharmacovigilance and post-marketing reports), trial_serious_events (trials' serious " +
        "adverse events and withdrawals), case_reports and community (firsthand reports); needed for every state " +
        "except not_checked."),
    answer_quote: answerQuote.optional()
      .describe("With label_warning or reported_signal: the answer's sentence reporting it, copied from answer_draft."),
    search_query: z.string().trim().min(1).max(HARM_QUERY_MAX_CHARACTERS).optional()
      .describe("With not_found: the exact query it was searched with in search_pubmed, search_europe_pmc or " +
        "search_clinical_trials, whose research_receipt is passed in receipts.")
  }).strict()).max(HARM_SCREEN_MAX_ENTRIES).optional()
    .describe("With answer_draft, when safety_claims lists a sentence or safety_question is true: the serious harms " +
      "plausible for this exposure, apart from its common side effects, each searched by name, with what the " +
      `search found (at least one entry, at most ${HARM_SCREEN_MAX_ENTRIES}). Each state's own field is checked: ` +
      "answer_quote is shown in the answer, search_query is the query of a literature search passed here, and a " +
      `harm not_checked adds the caveat "${HARM_NOT_CHECKED_CAVEAT_START} [harm]." Whether the list is complete ` +
      "stays the model's declaration."),
  key_terms: z.array(z.object({
    term: z.string().trim().min(1).max(120).describe("The term as the answer writes it."),
    explanation: answerQuote.describe("The sentence that first explains it in plain words, copied from answer_draft.")
  }).strict()).max(20).optional()
    .describe("Records each specialized term that the answer's conclusions depend on, such as a chemical species, a " +
      "test or a statistical measure, with the sentence that first explains it in plain words (an empty list if none)."),
  mechanism_claims: z.array(z.object({
    quote: answerQuote.describe("The sentence(s), copied from answer_draft."),
    use_route: z.enum(ADMINISTRATION_ROUTES).describe("The route of the use the answer describes."),
    evidence_route: z.enum(ADMINISTRATION_ROUTES).describe("The route of the experiment the claim rests on."),
    evidence_in: z.enum(["people", "animals"])
      .describe("Whom the experiment the claim rests on was done in; a test on cells or tissue in a dish is the " +
        "in_vitro route."),
    tissue: z.object({
      measured: z.string().trim().min(1).max(120).describe("Where the response was measured, such as the brain's cortex."),
      claimed: z.string().trim().min(1).max(120).describe("Where the answer applies it, such as the skin.")
    }).strict().optional()
      .describe("Only when the response was measured in a different tissue from the one the answer applies it to."),
    studies: z.array(z.string().trim().min(1).max(300)).min(1).max(20)
      .describe("The key sources (DOI, PMID or PMCID) it rests on.")
  }).strict()).max(20).optional()
    .describe("Records each sentence of the answer that says how an intervention works, or that it does not act " +
      "through a mechanism, with the route of the use it describes, the route of the experiment it rests on, whom " +
      "it was done in, any difference in tissue, and those studies (an empty list if none)."),
  recommendations: z.array(z.object({
    quote: answerQuote.describe("The sentence that puts it forward, copied from answer_draft."),
    intervention: z.string().trim().min(1).max(200).describe("What it is, as the answer names it."),
    safety_check: z.enum(["resolved", "conditional", "unresolved"])
      .describe("Whether this person's safety conflicts and missing safety inputs for it are resolved, resolved on " +
        "a condition a clinician should confirm, or still open."),
    open_inputs: z.string().trim().min(1).max(300).optional()
      .describe("For conditional and unresolved: the conflicts or inputs still open, in a few words."),
    long_term_use: z.boolean().describe("Whether it would likely be taken for months or years."),
    longest_follow_up: z.string().trim().min(1).max(120).optional()
      .describe("For long-term use: the longest follow-up in its evidence, as the sources state it, such as 12 weeks."),
    follow_up_matches_use: z.boolean().optional()
      .describe("For long-term use: whether that follow-up matches how long it would be taken."),
    stopping_covered: z.boolean().optional()
      .describe("For long-term use: whether the answer covers stopping, withdrawal and lasting harms, or says they " +
        "are unknown.")
  }).strict()).max(20).optional()
    .describe("Records each intervention the answer recommends or puts forward for this person, with the sentence " +
      "that does so, whether this person's safety conflicts and inputs are resolved, and, for long-term use, the " +
      "longest follow-up in its evidence and whether stopping is covered (an empty list if none)."),
  user_observations: z.array(userObservationSchema).max(30).optional()
    .describe("With answer_draft: each observation the user reported, about themselves or others, that the answer relies on or rules out, including attempts where nothing happened and reports withdrawn or called uncertain (HRP UserObservationLedger); an empty list if the user reported none."),
  proposed_tests: z.array(z.object({
    quote: answerQuote.describe("The answer's sentence proposing the test, copied from answer_draft."),
    repeats: z.number().int().nonnegative().optional().describe("The index in user_observations of the attempt this test repeats, when the user already made it; left out otherwise."),
    difference: answerQuote.optional().describe("With repeats: the answer's sentence saying how this test differs in a way that could change the result, copied from answer_draft."),
    blinded: z.boolean().describe("true when the person would not know which condition they are in.")
  }).strict()).max(10).optional()
    .describe("With answer_draft: each test or self-measurement the answer proposes to the user, whether it repeats an attempt in user_observations, and whether it is blinded (HRP UserObservationLedger, MeasurementIsNotAttribution); an empty list if none."),
  carried_state: z.string().max(48_000).optional()
    .describe("The carry_forward value the last final check in this conversation returned, passed back exactly; left out in a conversation's first research answer."),
  primary_outcome: z.string().trim().min(1).max(300).optional()
    .describe("The user's main goal for this research, in their words (HRP PrimaryOutcomeContinuity)."),
  primary_outcome_changed: z.boolean().optional()
    .describe("true when the user changed their main goal since the last final check."),
  rejected_options: z.array(z.string().trim().min(1).max(120)).max(12).optional()
    .describe("Every option the user has rejected, earlier ones included, named as the answer names them."),
  reopened: z.array(z.string().trim().min(1).max(120)).max(12).optional()
    .describe("Options from an earlier rejected list that the user has reopened."),
  corrections: z.array(z.object({
    retracted: z.string().trim().min(1).max(1_000)
      .describe("The wrong statement as it read before the correction, such as a rate given under the wrong compound."),
    change: answerQuote.describe("The answer's sentence saying what changed, copied from answer_draft."),
    report: answerQuote.optional().describe("With by_user true: the bug report the answer shows the user, a short general sentence with no personal details, copied from answer_draft."),
    by_user: z.boolean().optional()
      .describe("true when the user pointed out the error and a recheck showed the user was right; false when the " +
        "research found it.")
  }).strict()).max(10).optional()
    .describe("Records each material correction made during this research: the wrong statement as it read, the " +
      "answer's sentence saying what changed, and whether the user pointed it out. The wrong statement must appear " +
      "nowhere else in the answer, including its headings, tables and summaries; after a correction the user pointed " +
      "out, the answer shows the bug report it would send and asks whether AskRigor may send it."),
  search_coverage: z.array(z.enum(["historical_terms", "citation_chains", "grey_literature"])).max(3).optional()
    .describe("What the searches covered beyond the indexed databases."),
  answer_language: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,3}$/u).optional()
    .describe("The answer's language tag, such as fr or pt-BR; needed for caveat_renderings."),
  caveat_renderings: z.array(z.object({
    caveat: z.string().trim().min(1).max(4_000).describe("As the gate returned it."),
    text: z.string().trim().min(1).max(4_000).describe("As the answer states it, with the caveat's links.")
  }).strict()).max(40).optional()
    .describe("In an answer not in English: each caveat in the answer's language."),
  findings_card: findingsCardSchema.optional()
    .describe("With answer_draft, when the answer cites a study or video verified here: the answer's best findings " +
      "for AskRigor's findings library, never claims the user corrected and no personal details, checked against the " +
      "answer and this call's verified sources. Leave it out when the answer cites none. In free " +
      "contributor mode a checked card is saved for the owner's review; in paid private mode it adds a caveat " +
      "offering the save. A rejected card is not saved or offered and does not hold back the answer."),
  reported_model: z.string().trim().min(1).max(80).optional()
    .describe("Your model's name as your app reports it; kept, unverified, with a saved findings card.")
}).strict();

export type FinalizeResearchInput = z.output<typeof finalizeResearchInputSchema>;

/**
 * The inputs ChatGPT's app shows the model only as "unknown": a two-branch union, and an object or array nested below
 * the second level (read-only Codex probes, 2026-10-16). The model sees no parameter description there, only the
 * tool's own, so their JSON goes into it. Tests parse every example with the schema and check that every hidden part
 * of the published schema has one.
 */
export const FINALIZE_RESEARCH_HIDDEN_SHAPES: ReadonlyArray<{
  paths: readonly string[];
  examples: readonly unknown[];
  note?: string;
}> = [
  { paths: ["intervention_identity.interventions"], note: "an unresolved item has no identity", examples: [[{
    study_ids: ["10.1000/example"], label: "…", status: "resolved",
    identity: { registry_code: "…", sponsor_or_maker: "…", current_product: "…" }
  }]] },
  { paths: ["findings_card.findings"], examples: [[{
    claim: "…", certainty: "moderate", applies_to: "…", answer_quote: "…", sources: ["10.1000/example"],
    why_not_usual: "…", what_would_change_it: "…"
  }]] },
  { paths: ["community_searches[].queries"], examples: [["…"]] },
  { paths: ["community_searches[].threads_read"], examples: [[{ url: "https://example.org/t/1", title: "…" }]] },
  { paths: ["community_searches[].report_identity"], note: "or one such object", examples: [[{
    exposure: "…", reports_read: 5, firsthand_exact: 2, exposure_unclear: 1, other_exposure: 1, not_firsthand: 1,
    measured_after: 0
  }]] },
  { paths: ["community_searches[].review_corpora"], examples: [[{
    product: "…", reviews_read: 20, selection: "most_recent",
    outcome_search: { queries: ["…"], directions: ["benefit", "no_effect", "adverse"] },
    item_identity: { exact_product: 18, variant_unresolved: 2, other_variant_excluded: 0 }
  }]] },
  { paths: ["community_searches[].answer_quotes"], examples: [{
    benefit_reports: "…", no_effect_reports: "…", adverse_reports: "…", effect_on_answer: "…"
  }] },
  { paths: ["community_findings.product_corpora"], examples: [[{
    product: "…", video_ids: ["abcdefghijk"], exact_product_signal: "…"
  }]] },
  { paths: ["comparison_claims[].arms"], examples: [[
    { exposure: "…", dose: 6, unit: "mg" }, { exposure: "…", dose: null, unit: null }
  ]] },
  { paths: ["shopping.offers"], examples: [[{
    product: "…", url: "https://example.org/p/1", offer_state: "live_destination_orderable", role: "buy_option"
  }]] },
  { paths: ["scale_results[].range"], examples: [{ min: 0, max: 10 }] },
  { paths: ["scale_results[].values"], examples: [[4.5, 2]] },
  { paths: ["scale_results[].benchmark"], examples: [{ value: 1, kind: "minimal_important_difference" }, "none_established"] },
  { paths: ["mechanism_claims[].tissue"], examples: [{ measured: "…", claimed: "…" }] },
  { paths: ["harm_screen[].sources_searched"], examples: [["label", "case_reports"]] },
  { paths: ["absence_claims[].studies", "safety_claims[].studies", "mechanism_claims[].studies"],
    examples: [["10.1000/example"]] }
];

// Limits the type does not show, which the 2026-10-16 regression's first calls broke.
const FINALIZE_RESEARCH_HIDDEN_LIMITS = "key_sources[].answer_marker is the visible label, 3 to 80 characters, not a " +
  "link; another_pass_estimate has at most 200 characters; answer_language is a language tag such as en or pt-BR.";

/** The tool description's sentence carrying the hidden shapes and limits. */
export const FINALIZE_RESEARCH_SHAPES_DESCRIPTION = "Nested inputs, as JSON: " +
  FINALIZE_RESEARCH_HIDDEN_SHAPES.map(({ paths, examples, note }) =>
    `${paths.join(", ")} ${examples.map((example) => JSON.stringify(example)).join(" or ")}` +
      (note === undefined ? "" : ` (${note})`)).join("; ") +
  `. ${FINALIZE_RESEARCH_HIDDEN_LIMITS}`;

interface FinalizeJsonSchema {
  [key: string]: unknown;
  type?: string | string[];
  description?: string;
  properties?: Record<string, FinalizeJsonSchema>;
  items?: FinalizeJsonSchema;
  anyOf?: FinalizeJsonSchema[];
  oneOf?: FinalizeJsonSchema[];
  required?: string[];
}

/** The SDK uses draft-7 and input mode for tools/list (zod-json-schema-compat). */
export function finalizeResearchPublishedInputSchema({ relaxed }: { relaxed: boolean }): FinalizeJsonSchema {
  const strict = z.toJSONSchema(finalizeResearchInputSchema, { target: "draft-7", io: "input" }) as FinalizeJsonSchema;
  if (!relaxed) return strict;
  const removed = new Set(["minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "minimum",
    "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "uniqueItems", "additionalProperties"]);
  const walk = (node: FinalizeJsonSchema, depth: number): FinalizeJsonSchema => {
    const container = node.properties !== undefined || node.items !== undefined || node.type === "object" || node.type === "array";
    if (node.anyOf !== undefined || node.oneOf !== undefined || (container && depth >= 3)) {
      return node.description === undefined ? {} : { description: node.description };
    }
    const result: FinalizeJsonSchema = {};
    for (const [key, value] of Object.entries(node)) {
      if (removed.has(key)) continue;
      if (key === "properties") result.properties = Object.fromEntries(
        Object.entries(node.properties!).map(([name, child]) => [name, walk(child, depth + 1)]));
      else if (key === "items") result.items = walk(node.items!, depth + 1);
      else result[key] = value;
    }
    return result;
  };
  return walk(strict, 0);
}

/** Runtime acceptance is permissive on both surfaces; only the published schema differs. */
export function finalizeResearchConnectorInputSchema(relaxed: boolean) {
  const published = finalizeResearchPublishedInputSchema({ relaxed });
  return z.looseObject(Object.fromEntries(Object.entries(published.properties!).map(([key, fragment]) =>
    [key, z.unknown().optional().meta(fragment)]))).meta({
      ...published,
      // Override looseObject's generated additionalProperties too, including its absence on /mcp.
      additionalProperties: published.additionalProperties
    });
}

/** Optional empty lists mean none. Clone only the affected containers, preserving the raw call. */
export function parseFinalizeResearchInput(rawInput: unknown) {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const empty = (value: unknown) => Array.isArray(value) && value.length === 0;
  if (!object(rawInput)) return finalizeResearchInputSchema.safeParse(rawInput);
  const input = { ...rawInput };
  if (empty(input.principal_communities)) delete input.principal_communities;
  if (object(input.intervention_identity)) {
    input.intervention_identity = { ...input.intervention_identity };
    if (empty((input.intervention_identity as Record<string, unknown>).interventions)) {
      delete (input.intervention_identity as Record<string, unknown>).interventions;
    }
  }
  if (Array.isArray(input.community_searches)) input.community_searches = input.community_searches.map((entry: unknown) => {
    if (!object(entry)) return entry;
    const copy = { ...entry };
    if (empty(copy.review_corpora)) delete copy.review_corpora;
    if (empty(copy.report_identity)) delete copy.report_identity;
    return copy;
  });
  if (object(input.findings_card) && empty(input.findings_card.findings)) delete input.findings_card;
  return finalizeResearchInputSchema.safeParse(input);
}

function invalidFinalizeResearchInput(error: z.ZodError, options: FinalizeResearchOptions): FinalizeResearchOutput {
  const pathOf = (path: readonly PropertyKey[]) => path.reduce<string>((text, part) =>
    typeof part === "number" ? `${text}[${part}]` : `${text}${text === "" ? "" : "."}${String(part)}`, "") || "inputs";
  const nextSteps = ["The call's inputs have problems, so the final check did not run. Fix each one and call again:"];
  const messageOf = (issue: z.core.$ZodIssue, prefix: readonly PropertyKey[] = []): string => {
    if (issue.code === "invalid_value") return `Expected one of ${issue.values.join(", ")}.`;
    if (issue.code === "invalid_union") return issue.errors.map((branch) => branch.map((child) =>
      `${pathOf([...prefix, ...issue.path, ...child.path])}: ${messageOf(child, [...prefix, ...issue.path])}`).join("; ")).join(" or ");
    return issue.message;
  };
  for (const issue of error.issues.slice(0, 30)) {
    nextSteps.push(`${pathOf(issue.path)}: ${messageOf(issue)}`);
  }
  if (error.issues.length > 30) nextSteps.push(`and ${error.issues.length - 30} more.`);
  const shapes = FINALIZE_RESEARCH_HIDDEN_SHAPES.flatMap((shape) => shape.paths.map((path) => ({ path, shape })));
  const given = new Set<string>();
  for (const issue of error.issues) {
    const path = pathOf(issue.path).replace(/\[\d+\]/gu, "[]");
    const match = shapes.filter(({ path: prefix }) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (match !== undefined && !given.has(match.path)) {
      given.add(match.path);
      nextSteps.push(`${match.path} as JSON: ${match.shape.examples.map((example) => JSON.stringify(example)).join(" or ")}`);
    }
  }
  return {
    contract: FINALIZE_RESEARCH_CONTRACT, status: "not_ready", next_steps: nextSteps,
    ...(options.secondReading === undefined ? {} : {
      second_reading: checkSecondReading(undefined, options.secondReading, nextSteps)
    }),
    limits: [], caveats: [], must_report: [], receipts_verified: 0, receipts_rejected: [], answer_checked: false,
    sources: { validated: [], lead_only: [] },
    community: { decision: "not_relevant", surveys: 0, discovery_rounds: 0, saturated: false, depth: "first_pass",
      first_pass_complete: false, open_leads: [], audited_videos: [], material_videos: [], principal_communities: [], communities_searched: [] },
    findings_card: options.findings === "private" ? privateFindings() : options.findings === "closed" ? closedFindingsLibrary() : noFindingsCard()
  };
}

function retractedStatementShown(draft: string, statement: string, changes: readonly string[]): boolean {
  const shownText = displayedProse(draft).map((block) => caveatText(visibleText(block))).join("\n");
  const occurrences = (text: string): number[] => {
    const found: number[] = [];
    if (text === "") return found;
    for (let at = shownText.indexOf(text); at >= 0; at = shownText.indexOf(text, at + 1)) found.push(at);
    return found;
  };
  const form = (text: string) => quoteForm(text.replace(MARKDOWN_LINK_TEXT, "$1"));
  const wrong = form(statement);
  if (!/[\p{L}\p{N}]/u.test(wrong)) return false;
  const inChange = changes.flatMap((change) => {
    const changed = form(change);
    return occurrences(changed).map((start) => [start, start + changed.length] as const);
  });
  return occurrences(wrong).some((start) => !inChange.some(([from, to]) => start >= from && start + wrong.length <= to));
}

const optionKey = (text: string) => text.trim().toLowerCase();

// The ledger and the rejected list hold at most this many entries; at that size the model chooses which to keep.
const MAX_CARRIED_OBSERVATIONS = 30;
const MAX_CARRIED_REJECTED = 12;

function checkCarriedState(input: FinalizeResearchInput, secret: string, nextSteps: string[]):
  { carried?: CarriedState; invalid: boolean } {
  let carried: CarriedState | undefined;
  let invalid = false;
  if (input.carried_state !== undefined) {
    const verified = verifyCarriedState(input.carried_state, { secret });
    if (verified.ok) carried = verified.state;
    else {
      invalid = true;
      nextSteps.push("carried_state does not verify: pass exactly the carry_forward value from the last final check " +
        "in this conversation that gave one, or leave carried_state out if none has.");
    }
  }
  const rejected = new Set((input.rejected_options ?? []).map(optionKey));
  const reopened = new Set((input.reopened ?? []).map(optionKey));
  if (carried !== undefined) {
    const declared = input.user_observations ?? [];
    const observations = new Set(declared.map(({ observation }) => observation));
    const dropped = declared.length >= MAX_CARRIED_OBSERVATIONS
      ? []
      : carried.observations.filter(({ observation }) => !observations.has(observation));
    for (const { observation } of dropped.slice(0, 10)) nextSteps.push(`user_observations leaves out ${JSON.stringify(observation)} from an earlier turn: keep it, marked withdrawn or uncertain if its source took it back.`);
    if (dropped.length > 10) nextSteps.push(`and ${dropped.length - 10} more earlier observations.`);
    for (const statement of carried.retracted) {
      if (input.answer_draft !== undefined && retractedStatementShown(input.answer_draft, statement, (input.corrections ?? []).map(({ change }) => change))) {
        nextSteps.push(`The answer repeats a statement taken back in an earlier turn: ${JSON.stringify(statement)}. Leave it out.`);
      }
    }
    if ((input.rejected_options ?? []).length < MAX_CARRIED_REJECTED) {
      for (const option of carried.rejected) {
        if (!rejected.has(optionKey(option)) && !reopened.has(optionKey(option))) nextSteps.push(`rejected_options leaves out ${option}, which the user rejected in an earlier turn: keep it, or list it in reopened if the user reopened it.`);
      }
    }
    if (carried.primary_outcome !== undefined) {
      const goal = carried.primary_outcome;
      if (input.primary_outcome === undefined) nextSteps.push(`Give primary_outcome: the user's main goal carried from an earlier turn is ${JSON.stringify(goal)}.`);
      else if (input.primary_outcome.trim() !== goal.trim() && input.primary_outcome_changed !== true) nextSteps.push(`primary_outcome differs from the main goal carried from an earlier turn (${JSON.stringify(goal)}): keep it, or set primary_outcome_changed if the user changed it.`);
    }
    if (input.principal_communities !== undefined) {
      const named = new Set(input.principal_communities.filter(({ named_by_user }) => named_by_user === true).map(({ name }) => name));
      for (const name of carried.named_communities) if (!named.has(name)) nextSteps.push(`principal_communities leaves out ${name}, which the user named in an earlier turn: keep it with named_by_user, or record why it is not searched.`);
    }
  }
  for (const [i, { intervention }] of (input.recommendations ?? []).entries()) {
    if (rejected.has(optionKey(intervention)) && !reopened.has(optionKey(intervention))) nextSteps.push(`recommendations[${i}] puts forward ${intervention}, which the user rejected: leave it out, or list it in reopened if the user reopened it.`);
  }
  return carried === undefined ? { invalid } : { carried, invalid };
}

/**
 * The state only grows or changes by declaration: what a call leaves out is carried on (and the check says so), so a
 * later call cannot shed it by passing this call's token. A withdrawn mark, a reopened option or a changed goal
 * changes it.
 */
function buildCarriedState(input: FinalizeResearchInput, carried: CarriedState | undefined, options: FinalizeResearchOptions):
  { carry_forward: string; carried: CarriedState } | "too_large" | undefined {
  if (options.secret === undefined) return undefined;
  const reopened = new Set((input.reopened ?? []).map(optionKey));
  const retracted = [...(carried?.retracted ?? []), ...(input.corrections ?? []).map(({ retracted }) => retracted)]
    .map((text) => text.slice(0, 200));
  // Keep the latest occurrence of each statement, then the latest twelve statements.
  const latest = [...new Set([...retracted].reverse())].reverse().slice(-12);
  const declared = input.user_observations ?? [];
  const kept = new Set(declared.map(({ observation }) => observation));
  const observations = [...declared, ...(carried?.observations ?? []).filter(({ observation }) => !kept.has(observation))]
    .slice(0, MAX_CARRIED_OBSERVATIONS);
  const rejectedKeys = new Set<string>();
  const rejected = [...(input.rejected_options ?? []), ...(carried?.rejected ?? [])].filter((option) => {
    const key = optionKey(option);
    if (reopened.has(key) || rejectedKeys.has(key)) return false;
    rejectedKeys.add(key);
    return true;
  }).slice(0, MAX_CARRIED_REJECTED);
  const carriedGoal = carried?.primary_outcome;
  const goal = input.primary_outcome === undefined || (carriedGoal !== undefined &&
      input.primary_outcome.trim() !== carriedGoal.trim() && input.primary_outcome_changed !== true)
    ? carriedGoal ?? input.primary_outcome
    : input.primary_outcome;
  const state: CarriedState = {
    v: 1, issued_at: (options.now?.() ?? new Date()).toISOString(),
    observations, retracted: latest,
    ...(goal === undefined ? {} : { primary_outcome: goal }),
    rejected,
    named_communities: [...new Set([...(carried?.named_communities ?? []),
      ...(input.principal_communities ?? []).filter(({ named_by_user }) => named_by_user === true).map(({ name }) => name)])].slice(0, 8)
  };
  const token = issueCarriedState(state, { secret: options.secret });
  if (token === undefined) return "too_large";
  const checked = verifyCarriedState(token, { secret: options.secret });
  return checked.ok ? { carry_forward: token, carried: checked.state } : undefined;
}

const finalizationStatusSchema = z.enum([
  "ready",
  "ready_with_limits",
  "not_ready",
  "receipts_unavailable"
]);

export const finalizeResearchOutputSchema = z.object({
  contract: z.literal(FINALIZE_RESEARCH_CONTRACT).describe("Records the server's finalize_research input contract version."),
  status: finalizationStatusSchema,
  next_steps: z.array(z.string()),
  limits: z.array(z.string()),
  caveats: z.array(z.string())
    .describe("Sentences the answer must contain, each as its own sentence and as written; a link's text may change."),
  must_report: z.array(z.string())
    .describe("What the answer must report from each evidence lane researched, even when weak or neutral."),
  check_line: z.string().optional(),
  receipts_verified: z.number().int().nonnegative(),
  receipts_rejected: z.array(z.object({
    index: z.number().int().nonnegative(),
    reason: z.string()
  }).strict()),
  community: z.object({
    decision: z.enum(["researched", "not_relevant"]),
    surveys: z.number().int().nonnegative(),
    discovery_rounds: z.number().int().nonnegative(),
    saturated: z.boolean(),
    depth: z.enum(["first_pass", "deep"]),
    first_pass_complete: z.boolean(),
    open_leads: z.array(z.string()),
    audited_videos: z.array(z.string()),
    material_videos: z.array(z.string()),
    principal_communities: z.array(z.string()),
    communities_searched: z.array(z.string())
  }).strict(),
  sources: z.object({
    validated: z.array(z.string()),
    lead_only: z.array(z.string())
  }).strict(),
  answer_checked: z.boolean().describe("Whether answer_draft was read in this call."),
  second_reading: z.object({
    status: z.enum(["ran", "skipped"]),
    reason: z.string().optional(),
    findings: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    dismissed: z.number().int().nonnegative()
  }).strict().optional(),
  findings_card: z.object({
    status: z.enum(["checked", "rejected", "absent", "closed", "private"]),
    problems: z.array(z.string()),
    saved: z.object({
      status: z.enum(["saved", "already_saved", "not_saved", "unconfirmed"]),
      card_id: z.string().regex(/^ARF-[0-9]{4,}$/u).optional(),
      reason: z.string().optional()
    }).strict().optional()
  }).strict().describe("Whether findings_card checked, and for a free contributor account whether it was saved; for " +
    "a paid private account a checked card's caveats offer the save. closed: the findings library is not open; " +
    "private: no research account, so nothing is saved."),
  carry_forward: z.string().optional(),
  carried: carriedStateSchema.optional(),
  carry_forward_note: z.string().optional(),
  finalization_receipt: z.string().optional(),
  analyses_saved: analysesSavedSchema.optional().describe("For a free contributor account whose research passed: the " +
    "study and review analyses this account's research validated and had not yet filed, in this chat or another, " +
    "which the server sent to the owner's review inbox.")
}).strict();

export type FinalizeResearchOutput = z.output<typeof finalizeResearchOutputSchema>;

export interface FinalizeResearchOptions {
  secret: string | undefined;
  secondReading?: { status: "ran"; findings: SecondReaderFinding[] } | { status: "skipped"; reason: string };
  now?: () => Date;
  // Rule, module and case names from the canonical protocols, which the answer
  // must not show (the rerun's answer headed its prompt with one).
  protocolNames?: ReadonlySet<string>;
  // What Reddit's public embed endpoint said about each cited Reddit thread, by
  // post id; the MCP tool looks them up before the gate runs.
  redditThreads?: ReadonlyMap<string, RedditThreadCheck>;
  // AskRigor's findings library (owner decisions Q9 to Q11, 2026-09-30):
  // "closed" (the default) while ASKRIGOR_FINDINGS_LIBRARY is not enabled;
  // "save" for a free contributor account, whose answer then needs a card and
  // whose checked card the tool saves; "offer" for a paid private account,
  // whose answer needs a card and, once it checks, offers its save, which
  // waits for the user's yes; "private" for a caller with no research
  // account, whose card is neither checked nor saved.
  findings?: "closed" | "save" | "offer" | "private";
  // The client's own hint that the answer will be read on a phone or tablet:
  // the answer then carries the owner's mobile notice (owner request,
  // 2026-10-15), as Universal's output_style asks wherever a phone shows.
  mobileClient?: boolean;
}

// The owner's words (2026-10-15), many users' reports and the owner's own
// comparison of the same question asked on a phone and on desktop web.
// Universal's correction-report question (owner question 78: after a correction the user pointed out and a recheck
// confirmed, ask whether AskRigor may send a bug report about it, or whether the user wants to clarify first).
export const CORRECTION_REPORT_OFFER = "May AskRigor send a bug report about this correction, or would you like to " +
  "clarify something first?";

export const MOBILE_NOTICE = "Mobile responses may be shorter and less intelligent than desktop web/app, even with " +
  "the same model and thinking level selected.";

export type RedditThreadCheck =
  | { state: "found"; subreddit: string; title: string }
  | { state: "not_found" }
  | { state: "unavailable" };

const TERMINAL_VIDEO_STATES = new Set([
  "api_visible_complete",
  "completed_with_access_boundary"
]);

interface VideoAudit {
  state: string;
  lock: string;
  // Comments and replies retrieved; zero when comments were disabled or
  // inaccessible, so there is nothing to report.
  records: number;
}

export function finalizeResearch(
  rawInput: unknown,
  options: FinalizeResearchOptions
): FinalizeResearchOutput {
  const parsed = parseFinalizeResearchInput(rawInput);
  if (!parsed.success) return invalidFinalizeResearchInput(parsed.error, options);
  const input = parsed.data;
  if (options.secret === undefined) {
    const nextSteps: string[] = [];
    const secondReading = checkSecondReading(input, options.secondReading, nextSteps);
    return {
      contract: FINALIZE_RESEARCH_CONTRACT,
      status: "receipts_unavailable",
      next_steps: nextSteps,
      ...(secondReading === undefined ? {} : { second_reading: secondReading }),
      limits: [
        "This AskRigor server cannot verify research receipts. The research steps still apply, and the answer says that research completion was not server-verified."
      ],
      caveats: [],
      must_report: input.community_findings === undefined
        ? []
        : [communityLane(input.community_findings, input.community_findings.videos_reviewed.length)],
      receipts_verified: 0,
      receipts_rejected: [],
      community: {
        decision: input.community_evidence,
        surveys: 0,
        discovery_rounds: 0,
        saturated: false,
        depth: input.research_depth,
        first_pass_complete: false,
        open_leads: [],
        audited_videos: [],
        material_videos: [],
        principal_communities: (input.principal_communities ?? []).map(({ name }) => name),
        communities_searched: []
      },
      sources: { validated: [], lead_only: [] },
      answer_checked: false,
      findings_card: options.findings === "private"
        ? privateFindings()
        : input.findings_card === undefined
          ? noFindingsCard()
          : !findingsOpen(options)
            ? closedFindingsLibrary()
            : {
                status: "rejected",
                problems: ["This AskRigor server cannot verify research receipts, so it cannot check or save a findings card."]
              }
    };
  }

  const verified: VerifiedReceipt[] = [];
  const rejected: Array<{ index: number; reason: ResearchReceiptRejection }> = [];
  // The same receipt passed twice is one unit of work, never two rounds.
  const seen = new Set<string>();
  input.receipts.forEach((token, index) => {
    if (seen.has(token)) return;
    seen.add(token);
    const result = verifyResearchReceipt(token, {
      secret: options.secret!,
      ...(options.now === undefined ? {} : { now: options.now })
    });
    if (result.ok) verified.push({ kind: result.kind, claims: result.claims, issuedAt: result.issued_at, index });
    else rejected.push({ index, reason: result.reason });
  });

  const nextSteps: string[] = [];
  let missingDeclaration = false;
  const requireDeclaration = (step: string): void => {
    missingDeclaration = true;
    nextSteps.push(step);
  };
  const limits: string[] = [];
  // Each limit's sentences for the user, written here so the answer carries
  // them as they are: a caveat cannot be dropped, garbled or negated.
  const caveats: string[] = options.mobileClient === true ? [MOBILE_NOTICE] : [];
  const requireLimit = (text: string, ...sentences: string[]): void => {
    limits.push(text);
    caveats.push(...sentences);
  };
  const caveatOnce = (limit: string, caveat: string): void => {
    if (!caveats.includes(caveat)) requireLimit(limit, caveat);
  };
  if (input.answer_draft !== undefined && input.treatment_choice === "compared" &&
      (input.community_searches ?? []).some(({ platform, threads_read }) =>
        platform !== "review_site" && threads_read.length > 0) && input.comparison_claims === undefined) {
    requireDeclaration("Give comparison_claims: each comparison the answer draws from forum reports, with both sides' daily doses as numbers, or an empty list if it draws none.");
  }
  for (const claim of input.comparison_claims ?? []) {
    const a = claim.arms[0]!;
    const b = claim.arms[1]!;
    if (!comparableDoses(a, b)) {
      caveatOnce(
        `The comparison of ${a.exposure} with ${b.exposure} rests on reports whose doses differ or were not given; say it cannot show which works better.`,
        a.dose !== null && b.dose !== null && a.unit !== null && b.unit !== null
          ? `The reports comparing ${a.exposure} with ${b.exposure} changed the dose as well (${a.dose} ${a.unit} against ${b.dose} ${b.unit}), so they cannot show which works better.`
          : `The reports comparing ${a.exposure} with ${b.exposure} did not give both doses, so they cannot show which works better at the same dose.`
      );
    }
    if (!claim.same_people) {
      caveatOnce(
        `The comparison of ${a.exposure} with ${b.exposure} rests on reports from people who did not use both; say so.`,
        `The reports comparing ${a.exposure} with ${b.exposure} did not come from people who used both, so they are not a direct comparison of the two.`
      );
    }
  }
  if (input.answer_draft !== undefined && input.user_observations === undefined) {
    requireDeclaration("user_observations is missing: with answer_draft, it lists each observation the user reported, about themselves or others, that the answer relies on or rules out, marked effect, no_effect, uncertain or withdrawn (an empty list means none).");
  }
  if (input.answer_draft !== undefined && input.proposed_tests === undefined) {
    requireDeclaration("proposed_tests is missing: with answer_draft, it lists each test or self-measurement the answer proposes, whether it repeats an attempt in user_observations, and whether it is blinded (an empty list means none).");
  }
  for (const { observation, response } of input.user_observations ?? []) {
    if (response === "uncertain") caveatOnce(
      `The report of ${observation} is uncertain; say it counts neither for nor against an effect.`,
      `A report its source is no longer sure of counts neither for nor against an effect (${observation}).`);
    if (response === "withdrawn") caveatOnce(
      `The report of ${observation} was withdrawn; say it counts neither for nor against an effect.`,
      `A report its source has taken back counts neither for nor against an effect (${observation}).`);
  }
  for (const [index, test] of (input.proposed_tests ?? []).entries()) {
    if (test.repeats !== undefined) {
      const observation = input.user_observations?.[test.repeats]?.observation;
      if (observation === undefined) nextSteps.push(`proposed_tests[${index}].repeats names user_observations[${test.repeats}], which this call does not give.`);
      else if (test.difference === undefined) nextSteps.push(`proposed_tests[${index}] repeats what the user already tried (${observation}): leave it out of the answer, or give the answer's sentence saying how it differs in a way that could change the result as difference.`);
    }
    if (!test.blinded) caveatOnce(
      "A test the answer proposes is not blinded; say it can show how the person did, not what caused a change.",
      "A test done without blinding can show how the person did, not what caused a change, because expectation, effort and practice can move it too.");
  }
  const { carried, invalid: carriedInvalid } = checkCarriedState(input, options.secret, nextSteps);
  // The correction-report question rests on the model's declaration of who pointed the error out.
  for (const [index, { by_user, report }] of (input.corrections ?? []).entries()) {
    if (by_user === true && report === undefined) {
      requireDeclaration(`Give corrections[${index}].report: the bug report the answer shows the user, copied from answer_draft.`);
    }
    if (by_user === undefined) {
      requireDeclaration(`Give corrections[${index}].by_user: true when the user pointed out the error and a recheck ` +
        "showed the user was right, false when the research found it.");
    }
  }
  if ((input.corrections ?? []).some(({ by_user }) => by_user === true)) {
    requireLimit("The user's correction was right: ask, as the caveat does, whether AskRigor may send a bug report " +
      "about it or the user wants to clarify first, and show the report it would send.", CORRECTION_REPORT_OFFER);
  }
  // What the communities outside YouTube showed, reported after the YouTube lane.
  const communityLanes: string[] = [];
  let communitiesSearched: string[] = [];
  let communitiesRead: CommunityRead[] = [];
  let communitiesUnverified = 0;
  for (const { index, reason } of rejected) nextSteps.push(rejectedReceiptStep(index, reason));

  // Each status needs its own field; the other one, if given, is not used.
  const fullTextSearch = input.full_text_search;
  const fullTextQueries = fullTextSearch?.status === "run" ? fullTextSearch.queries : undefined;
  if (fullTextSearch === undefined ? input.key_sources.length > 0
    : fullTextSearch.status === "run" ? fullTextQueries === undefined : fullTextSearch.reason === undefined) {
    requireDeclaration("Give full_text_search: status run with queries searched in Europe PMC article sections, " +
      "or status not_needed with reason.");
  } else if (fullTextQueries !== undefined) {
    for (const query of fullTextQueries) {
      const matches = verified.filter(({ kind, claims }) => kind === "literature_search" &&
        claims.src === "europepmc" && claims.q === discoveryQueryDigest([query]));
      if (!matches.some(({ claims }) => Array.isArray(claims.ft) && claims.ft.length > 0)) {
        nextSteps.push(`full_text_search query ${JSON.stringify(query)} has no verified Europe PMC section-search receipt` +
          (matches.length === 0 ? ". " : " (the matching receipt has no section fields). ") +
          "Search that query with section fields using search_europe_pmc and pass its research_receipt in receipts.");
      }
    }
  }

  const lab = input.lab_preparation;
  if (lab === undefined ? input.key_sources.length > 0
    : lab.status === "covered" ? lab.answer_quotes === undefined : lab.reason === undefined) {
    requireDeclaration("Give lab_preparation: status covered with answer_quotes from answer_draft giving collection " +
      "conditions or preparation advice, or status not_applicable with reason.");
  }

  // Community evidence. Discovery receipts (surveys, one-call community audits,
  // the Gemini scout, YouTube searches) list the videos they found; a material
  // video must come from one passed in the same call, which binds the audits to
  // this research's discovery rather than to any valid receipt.
  let surveys = 0;
  let partialSurveys = 0;
  const discovered = new Set<string>();
  const audited = new Map<string, VideoAudit>();
  const communityAudited = new Set<string>();
  // Videos a one-call audit read comments from; its other selected videos
  // had comments disabled or inaccessible.
  const communityRead = new Set<string>();
  const rounds: VerifiedReceipt[] = [];
  // Discovery for another target (an earlier question, say) is set aside, so
  // its rounds and videos cannot stand in for this research.
  const targetDigest = researchTargetDigest(input.research_target);
  const offTarget: FinalizeResearchOutput["receipts_rejected"] = [];
  const offTargetVideos = new Set<string>();
  for (const receipt of verified) {
    const { kind, claims } = receipt;
    if (DISCOVERY_KINDS.has(kind) && text(claims.target) !== targetDigest) {
      offTarget.push({
        index: receipt.index,
        reason: text(claims.target) === "" ? "no_research_target" : "other_research_target"
      });
      for (const video of [...list(claims.videos), ...list(claims.alt)]) offTargetVideos.add(video);
      continue;
    }
    if (kind === "youtube_survey") {
      surveys += 1;
      if (text(claims.access) !== "complete") partialSurveys += 1;
    }
    if (DISCOVERY_KINDS.has(kind)) {
      rounds.push(receipt);
      // A scout round also signs the IDs it left to the model's judgment (`alt`):
      // candidates whose YouTube title differs from the scout's, and YouTube's
      // closest results for a title it could not find. Auditing one is that
      // judgment, so they count as found by the round.
      for (const video of [...list(claims.videos), ...list(claims.alt)]) discovered.add(video);
    }
    if (kind === "youtube_video_claims") {
      // A video the person gave, which Gemini read, counts as found: auditing
      // its comments needs no discovery round to have turned it up. It is no
      // round itself, so community discovery still runs as before.
      discovered.add(text(claims.video));
    }
    if (kind === "youtube_video_audit") {
      // Comments the audit's final view returned; receipts from before `shown`
      // existed count every record retrieved.
      recordVideoAudit(audited, text(claims.video), text(claims.state), text(claims.lock),
        Number(text(claims.shown) || text(claims.records)));
    }
    if (kind === "youtube_community_audit") {
      // One call samples comments across its videos, so it counts as a
      // survey; each material video still needs its own video audit.
      surveys += 1;
      for (const video of list(claims.videos)) communityAudited.add(video);
      // Receipts from before `read` existed count every selected video.
      for (const video of list(claims.read ?? claims.videos)) communityRead.add(video);
    }
  }
  const auditedVideos = [...audited.keys()].sort();
  let materialVideos: string[] = [];
  let saturated = false;
  let firstPassComplete = false;
  // A first pass that stopped at its cap before discovery saturated, and the
  // searches a rate limit stopped in it; or discovery that must go on first.
  let unsaturatedFirstPass = false;
  let firstPassRateLimited = 0;
  let discoveryContinues = false;
  const openLeads = (input.open_leads ?? []).map(({ topic }) => topic);
  if (input.community_evidence === "not_relevant") {
    // HRP ForumSignalNonTrigger: nonactivation is an affirmative decision, for
    // one of its listed reasons; a topic with no user-experience corpus is
    // known only by searching, so it is researched with its boundary.
    if (input.not_relevant_basis === undefined || input.not_relevant_reason === undefined) {
      requireDeclaration(
        "Community evidence is not_relevant only for a definition, calculation, or chemical or mechanistic question " +
          "with no real-world outcome (not_relevant_basis no_real_world_outcome) or an emergency before triage " +
          "(emergency_before_triage), with not_relevant_reason. Otherwise research it: name where people discussing " +
          "this talk in principal_communities and search the dominant one and an independent one (YouTube with " +
          "scout_gemini_youtube_candidates and audit_youtube_video_community, the others with your web search); a " +
          "topic nobody discusses is searched and its access boundary recorded."
      );
    }
    if (input.not_relevant_basis === "no_real_world_outcome") {
      const triggers = [
        ...(input.treatment_choice === "compared" ? ["treatment_choice is compared"] : []),
        ...(input.commercial_review_applicability?.status === "required"
          ? ["commercial_review_applicability is required"] : []),
        ...(input.shopping?.status === "buy_options" || input.shopping?.status === "no_live_option_found"
          ? [`shopping is ${input.shopping.status}`] : [])
      ];
      if (triggers.length > 0) {
        nextSteps.push(
          `community_evidence cannot be not_relevant with no_real_world_outcome when ${triggers.join("; ")}: ` +
            "comparing options' real-world usefulness or a product people buy needs the community and buyer-review " +
            "layer. Research that layer with community_evidence researched, principal_communities and " +
            "community_searches, or complete it with an access_boundary."
        );
      }
      if (input.key_sources.length > 0) commercialReviewCoverage(input, { nextSteps, requireDeclaration });
      // The skip shows in the answer, with the reason this call declares (owner question 125). The reason reaches the
      // reader, so it shows no internal labels; whether it is a good reason stays the model's declaration.
      if (input.not_relevant_reason !== undefined) {
        const labels = internalLabels(input.not_relevant_reason, options.protocolNames ?? new Set());
        if (labels.length > 0) {
          nextSteps.push(`not_relevant_reason shows internal labels (${labels.slice(0, 8).join(", ")}` +
            `${labels.length > 8 ? ", and more" : ""}): the answer states this reason in its caveat, so give it in ` +
            "plain words.");
        }
        requireLimit(COMMUNITY_SKIP_LIMIT, communitySkipCaveat(input.not_relevant_reason));
      }
    }
  } else {
    const communities = input.principal_communities;
    const youtubeResearched = rounds.length > 0 || audited.size > 0 || communityAudited.size > 0;
    // YouTube is one of the places people talk, not the whole community lane:
    // its checks run when it is the dominant community, when it was researched
    // anyway, when the user named it, or when there is no map yet. Otherwise it is optional, like any
    // other community beyond the dominant one and an independent one.
    if (communities === undefined || youtubeResearched || communities[0]!.platform === "youtube" ||
        communities.some(({ platform, named_by_user }) => platform === "youtube" && named_by_user === true)) {
      // Any discovery round counts: the Gemini scout is the primary route, and
      // YouTube's own search is capped at 100 calls a day per project.
      if (rounds.length === 0) {
        nextSteps.push(
          "Find community videos with scout_gemini_youtube_candidates (survey_youtube_community only if the scout is " +
            "unavailable), audit each material video, and pass the remedies its comments name back to the scout as " +
            "rediscovery_leads (a video or creator as video:<id>)." +
            (offTarget.length === 0
              ? ""
              : ` ${offTarget.length} discovery receipt(s) passed here were made for another research target or none; ` +
                "give every tool the same research_target (research_question for surveys and community audits).")
        );
      }
      if (partialSurveys > 0) {
        requireLimit(
          `${partialSurveys} community survey(s) were only partly completed (some searches failed or hit limits); ` +
            "say the community picture may be incomplete.",
          "Some YouTube searches failed or hit limits, so the community picture may be incomplete."
        );
      }
      materialVideos = [...new Set(input.material_video_ids ?? auditedVideos)].sort();
      const saturation = discoverySaturation(rounds, new Set(materialVideos), input.research_depth);
      saturated = saturation.saturated;
      // A first pass is a broad sweep with a cap: it may stop before saturation
      // once enough is audited or searched, and then hands back its open leads.
      // Its rounds come from new angles, so a repeated query does not count.
      const auditedMaterial = materialVideos.filter((video) => audited.has(video)).length;
      // A round whose searches failed has read nothing, so it does not count toward
      // the round cap; a rate limit ends a first pass on its own below.
      const angles = new Set(rounds.filter((round) => signedCount([round], "inc") === 0)
        .map((round) => text(round.claims.q) || `${round.kind}#${round.index}`)).size;
      // A search YouTube's rate limit or daily quota stopped cannot rerun until
      // it resets, so it ends a first pass as an open lead; deep research waits.
      firstPassComplete = input.research_depth === "first_pass" &&
        (saturated || auditedMaterial >= FIRST_PASS_AUDITED_VIDEOS || angles >= FIRST_PASS_ROUNDS ||
          saturation.rateLimited > 0);
      if (!saturated && firstPassComplete) {
        // Its unsaturated topics become community focuses of the offer that
        // ends every first pass (below), with any searches a limit stopped.
        unsaturatedFirstPass = true;
        firstPassRateLimited = saturation.rateLimited;
      } else if (!saturated) {
        discoveryContinues = true;
        nextSteps.push(...saturation.nextSteps);
      }
      if (materialVideos.length === 0 && (saturated || firstPassComplete)) {
        if (discovered.size === 0) {
          if (saturation.rateLimited > 0) {
            requireLimit(
              "No video turned up before YouTube's rate limit or daily quota stopped discovery; say that YouTube " +
                "evidence could not be checked yet, not that it is thin.",
              "YouTube's search limit stopped discovery before any video turned up, so YouTube evidence could not be " +
                "checked yet."
            );
          } else {
            requireLimit(
              `No video turned up in ${rounds.length} discovery rounds; say that YouTube evidence on this is thin.`,
              `No relevant video turned up in ${rounds.length === 1 ? "1 round" : `${rounds.length} rounds`} of ` +
                "searching, so YouTube evidence on this is thin."
            );
          }
        } else if (input.no_material_video_reason === undefined) {
          requireDeclaration(
            `Discovery found ${discovered.size} video(s) but none is in material_video_ids: audit each one that adds an approach ` +
              "or substantial firsthand experience, or give no_material_video_reason."
          );
        } else {
          requireLimit(
            `None of the ${discovered.size} video(s) found in ${rounds.length} discovery rounds was worth auditing; ` +
              "say that YouTube evidence on this is thin.",
            discovered.size === 1
              ? "The only video found was not worth a close look, so YouTube evidence on this is thin."
              : `None of the ${discovered.size} videos found was worth a close look, so YouTube evidence on this is thin.`
          );
        }
      }
      const partlyRead: string[] = [];
      const unfinished: string[] = [];
      for (const video of materialVideos) {
        if (!discovered.has(video)) {
          nextSteps.push(offTargetVideos.has(video)
            ? `Video ${video} was found only by discovery for another research target; rerun discovery with this ` +
              "research_target, or drop it from material_video_ids."
            : `Video ${video} is not among the videos found by the surveys, scouts or searches whose receipts were passed; ` +
              "pass the receipt of the discovery call that found it, or drop it from material_video_ids.");
        }
        const audit = audited.get(video);
        if (audit === undefined) {
          nextSteps.push(
            (communityAudited.has(video) ? `Video ${video} has only a one-call community audit. ` : "") +
              `Audit video ${video} with audit_youtube_video_community and continue until the audit completes.`
          );
          continue;
        }
        if (audit.state === "completed_with_access_boundary") {
          requireLimit(`Comments on video ${video} were only partly accessible; treat its community signal as bounded.`);
          partlyRead.push(video);
        } else if (audit.lock === "block") {
          requireLimit(
            `The comment audit of video ${video} ended with blockers; its community signal cannot carry a conclusion on its own.`
          );
          unfinished.push(video);
        }
      }
      if (partlyRead.length > 0) {
        caveats.push(partlyRead.length === 1
          ? `Some comments on ${videoLink(partlyRead[0]!, "this video")} could not be read, so its comment evidence is incomplete.`
          : "Some comments could not be read on these videos, so their comment evidence is incomplete: " +
            `${partlyRead.map((video, index) => videoLink(video, `video ${index + 1}`)).join(", ")}.`);
      }
      if (unfinished.length > 0) {
        caveats.push(unfinished.length === 1
          ? `The comment review of ${videoLink(unfinished[0]!, "this video")} ended with problems, so its comments cannot ` +
            "support a conclusion on their own."
          : "The comment reviews of these videos ended with problems, so their comments cannot support a conclusion on " +
            `their own: ${unfinished.map((video, index) => videoLink(video, `video ${index + 1}`)).join(", ")}.`);
      }
    }
    ({ searched: communitiesSearched, read: communitiesRead, unverified: communitiesUnverified } =
      communityCoverage(input, youtubeResearched, { nextSteps, requireDeclaration, requireLimit, lanes: communityLanes }, options.redditThreads));
    commercialReviewCoverage(input, { nextSteps, requireDeclaration });
  }

  // Comments that were read must reach the answer, even when their signal is
  // weak: a lane that ran early can otherwise vanish behind later sources.
  const mustReport: string[] = [];
  // Findings must cover every video whose comments were read; a video whose
  // comments were disabled or inaccessible may be listed but need not be.
  const commentVideos = new Set([
    ...[...audited].filter(([, audit]) => audit.records > 0).map(([video]) => video),
    ...communityRead
  ]);
  const auditedAtAll = new Set([...audited.keys(), ...communityAudited]);
  const findings = input.community_findings;
  if (commentVideos.size > 0 && findings === undefined) {
    requireDeclaration(
      "Say what the comments you read showed: give community_findings (benefit, no-effect and adverse reports, " +
        "creators versus independent commenters, and the effect on the answer), even if the signal is weak or neutral."
    );
  } else if (findings !== undefined) {
    const reviewed = new Set(findings.videos_reviewed);
    const unlisted = [...commentVideos].filter((video) => !reviewed.has(video)).sort();
    const unaudited = [...reviewed].filter((video) => !auditedAtAll.has(video)).sort();
    if (unlisted.length > 0) {
      nextSteps.push(
        `Add ${unlisted.join(", ")} to community_findings.videos_reviewed: their comments were read, so the ` +
          "findings must account for them."
      );
    }
    if (unaudited.length > 0) {
      nextSteps.push(
        `community_findings.videos_reviewed lists ${unaudited.join(", ")}, but no comment-audit receipt passed here ` +
          "covers them; pass the receipt or drop them."
      );
    }
    if (unlisted.length === 0 && unaudited.length === 0) {
      mustReport.push(communityLane(findings, findings.videos_reviewed.filter((video) => commentVideos.has(video)).length));
    }
  }

  productIdentityDeclarations(input, rounds, verified, { nextSteps, requireDeclaration, requireLimit, mustReport });
  mustReport.push(...communityLanes);

  // Treatment coverage. A first pass does not run the coverage lock, so its
  // comparison is provisional, with no final ranking (HRP 20.6.6). In deep
  // research the latest assess_treatment_landscape_coverage result for this
  // research target binds the answer, and a treatment comparison needs one; a
  // check made for another target does not count.
  let coverageBoundary: string | undefined;
  if (input.research_depth === "first_pass") {
    if (input.treatment_choice === "compared") {
      requireLimit(
        "The treatment comparison rests on a first pass: present it as provisional, with no final ranking.",
        "This comparison rests on a first pass through the evidence, so treat it as provisional; it does not rank the " +
          "options."
      );
    }
  } else {
    const coverageChecks = verified.filter(({ kind }) => kind === "treatment_coverage");
    const forTarget = coverageChecks.filter(({ claims }) => text(claims.target) === targetDigest);
    const latest = Math.max(...forTarget.map(receiptOrder));
    // Checks the signed order cannot separate are all the latest; the most
    // restrictive of them binds, whatever order they came in.
    const coverage = forTarget.filter((receipt) => receiptOrder(receipt) === latest)
      .sort((left, right) => coverageRestriction(right) - coverageRestriction(left))
      .at(0);
    if (coverageChecks.length > 0 && coverage === undefined) {
      nextSteps.push(
        "No assess_treatment_landscape_coverage receipt passed here was made for this research_target; pass the one " +
          "for this question, give research_target exactly as the check received it, or run the check again."
      );
    }
    coverageBoundary = coverage === undefined ? undefined : text(coverage.claims.boundary);
    // Like a material video, each video the check judged must come from this
    // research's discovery, so a check made for another question cannot pass.
    const foreignCoverageVideos = list(coverage?.claims.videos).filter((video) => !discovered.has(video));
    if (foreignCoverageVideos.length > 0) {
      nextSteps.push(
        `The treatment-coverage check judged video(s) ${foreignCoverageVideos.join(", ")} that no discovery receipt ` +
          "passed here found; pass the receipts of the discovery calls that found them, or rerun the check."
      );
    }
    if (coverage !== undefined && input.treatment_choice === "compared" && text(coverage.claims.broad) !== "true") {
      nextSteps.push(
        "A treatment comparison needs the coverage check run as a broad treatment choice: call " +
          "assess_treatment_landscape_coverage again with broad_treatment_choice true."
      );
    }
    if (coverageBoundary === undefined) {
      if (input.treatment_choice === "compared" && coverageChecks.length === 0) {
        nextSteps.push(
          "The answer compares treatment options: call assess_treatment_landscape_coverage with the treatment ledger " +
            "and pass its research_receipt."
        );
      }
    } else if (coverageBoundary === "bounded_nonranking_only") {
      requireLimit(
        "The treatment-coverage check allows only a bounded answer: do not rank or recommend among the treatment options.",
        "The evidence check allows only a limited comparison here, so this answer does not rank or recommend among the " +
          "options."
      );
    } else if (coverageBoundary !== "ledger_consistent_for_synthesis") {
      nextSteps.push(
        `The latest assess_treatment_landscape_coverage result was ${coverageBoundary}: fix its selection and depth ` +
          "blockers and call it again until it allows the answer (deep research needs ledger_consistent_for_synthesis)."
      );
    }
  }

  // Key studies.
  const validatedIds = new Set<string>();
  const leadIds = new Set<string>();
  const leadStates = new Map<string, string>();
  // DOI -> observed service failures, retaining the named PMCID and signed issue time together.
  const routeFailures = new Map<string, Array<{ pmcid: string; issued: number }>>();
  // PMID -> DOI ("" when the PubMed record has none), from fetch_pubmed_record receipts.
  const pubmedDois = new Map<string, string>();
  // PMID -> PMCID when PubMed lists an open copy in PubMed Central.
  const pubmedPmcids = new Map<string, string>();
  // DOI -> the PMCIDs its full_text_lead receipts tried ("" when none was).
  const leadAttempts = new Map<string, Set<string>>();
  const readIds = new Set<string>();
  const searchCopyCaveats = new Set<string>();
  // Identifier -> the figures check its latest study audit signed (owner questions 87 and 89). Receipts
  // signed before audits checked figures carry none; every newer audit signs one, "not_declared" included.
  const studyFigures = new Map<string, { status: string; values: number[]; impossible: string[]; order: number }>();
  // One paper's identifiers and pages, as AskRigor's own receipts tie them: a PubMed record names its PMID, DOI and
  // PMC copy; a full-text reading or audit names the copy's identifiers and, when AskRigor fetched it, its URL; and
  // resolve_doi names the page a DOI is registered to. A link to any of them links the paper (#336's publisher and
  // Europe PMC pages). A lead receipt's PMCID is left out: no copy confirmed it.
  const papers = new PaperLinks();
  for (const { kind, claims, issuedAt } of verified) {
    if (PAPER_TIE_KINDS.has(kind)) papers.tie(claims);
    if (kind === "pubmed_record" && typeof claims.pmid === "string") {
      pubmedDois.set(normalizeIdentifier(claims.pmid), typeof claims.doi === "string" ? normalizeIdentifier(claims.doi) : "");
      if (typeof claims.pmcid === "string" && claims.pmcid !== "") {
        pubmedPmcids.set(normalizeIdentifier(claims.pmid), claims.pmcid.toUpperCase());
      }
    }
    if (kind === "full_text_read") {
      for (const key of ["doi", "pmid", "pmcid"]) {
        const value = claims[key];
        if (typeof value === "string" && value.length > 0) readIds.add(normalizeIdentifier(value));
      }
    }
    if (kind === "study_audit" || kind === "review_audit") {
      if (claims.retrieval_provider === "client_search_index" && typeof claims.host === "string") {
        const study = typeof claims.doi === "string" ? claims.doi : text(claims.id);
        searchCopyCaveats.add(`The full text of ${study} came from the AI's search-index copy of ${claims.host}; AskRigor did not fetch it.`);
      }
      for (const key of ["id", "doi", "pmid", "pmcid"]) {
        const value = claims[key];
        if (typeof value === "string" && value.length > 0) validatedIds.add(normalizeIdentifier(value));
      }
    }
    if (kind === "study_audit" && typeof claims.fig === "string") {
      const figures = {
        status: claims.fig,
        values: Array.isArray(claims.figv) ? claims.figv.map(Number).filter(Number.isFinite) : [],
        impossible: Array.isArray(claims.imp) ? [...claims.imp] : [],
        order: typeof claims.t === "number" ? claims.t : 0
      };
      for (const key of ["id", "doi", "pmid", "pmcid"]) {
        const value = claims[key];
        if (typeof value !== "string" || value.length === 0) continue;
        const id = normalizeIdentifier(value);
        const earlier = studyFigures.get(id);
        if (earlier === undefined || earlier.order <= figures.order) studyFigures.set(id, figures);
      }
    }
    if (kind === "full_text_route_failure" && typeof claims.doi === "string" && claims.doi !== "") {
      const doi = normalizeIdentifier(claims.doi);
      const pmcid = typeof claims.pmcid === "string" ? claims.pmcid.toUpperCase() : "";
      const failures = routeFailures.get(doi) ?? [];
      failures.push({ pmcid, issued: Date.parse(issuedAt) });
      routeFailures.set(doi, failures);
    }
    if (kind === "full_text_lead") {
      for (const key of ["doi", "pmcid"]) {
        const value = claims[key];
        if (typeof value === "string" && value.length > 0) {
          const id = normalizeIdentifier(value);
          leadIds.add(id);
          if (typeof claims.state === "string") leadStates.set(id, claims.state);
        }
      }
      if (typeof claims.doi === "string" && claims.doi !== "") {
        const doi = normalizeIdentifier(claims.doi);
        const tried = leadAttempts.get(doi) ?? new Set<string>();
        tried.add(typeof claims.pmcid === "string" ? claims.pmcid.toUpperCase() : "");
        leadAttempts.set(doi, tried);
      }
    }
  }
  for (const caveat of searchCopyCaveats) requireLimit(caveat, caveat);
  // The PubMed Central copy PubMed links to a study, by PMID or by DOI.
  const pmcidFor = (id: string): string | undefined => {
    if (isPmid(id)) return pubmedPmcids.get(id);
    const pmid = isDoi(id) ? [...pubmedDois].find(([candidate, doi]) => doi === id && pubmedPmcids.has(candidate))?.[0] : undefined;
    return pmid === undefined ? undefined : pubmedPmcids.get(pmid);
  };
  const needsPubmedCopyAttempt = (
    sourceId: string, id: string, pubmedDoi: string | undefined, attempts: ReadonlyMap<string, ReadonlySet<string>>
  ): boolean => {
    const doi = isDoi(id) ? id : pubmedDoi !== undefined && pubmedDoi !== "" ? pubmedDoi : undefined;
    const openCopy = pmcidFor(id);
    if (doi === undefined || openCopy === undefined || attempts.get(doi)?.has(openCopy)) return false;
    nextSteps.push(
      `PubMed lists an open copy of ${sourceId} in PubMed Central (${openCopy}) that the full-text attempt did not ` +
        `try: call acquire_open_full_text with DOI ${doi} and pmcid ${openCopy}, then audit it, or pass the new ` +
        `research_receipt if it still finds no full text. ${LEAD_RECEIPT_SEARCH}`
    );
    return true;
  };
  const validatedSources: string[] = [];
  const leadSources: string[] = [];
  // DOI paths may contain parentheses; displayedProse already resolves a
  // Markdown link's delimiters, so its complete target survives extraction.
  const linksFor = (block: string): string[] =>
    [...linkTargets(block).matchAll(/https?:\/\/[^\s<>]+/giu)].map(([target]) => target);
  const studyLines = input.answer_draft === undefined ? [] : displayedProse(input.answer_draft, true)
    .flatMap((block) => block.split("\n"));
  const studyLinks = studyLines.flatMap(linksFor);
  // Studies read only as leads: one limit each, and one caveat per reason that
  // stopped the reading, from the state each full-text lead receipt signed.
  const unreadStudies = new Map<string, string | undefined>();
  // Every identifier and page the receipts tie to a key study links it (a PubMed record's page since the
  // 2026-10-15 owner regressions; its other copies and its publisher page since 16 October's).
  const keyLinks = input.key_sources.map((source) => {
    const id = normalizeIdentifier(source.id);
    // A PMID's DOI (from its PubMed record receipt) also identifies the study.
    const pubmedDoi = isPmid(id) ? pubmedDois.get(id) : undefined;
    const ids = pubmedDoi === undefined || pubmedDoi === "" ? [id] : [id, pubmedDoi];
    const linkIds = [...new Set([...ids, ...ids.flatMap((candidate) => papers.identifiers(candidate))])];
    return { id, pubmedDoi, ids, linkIds, linkPages: papers.pages(linkIds) };
  });
  for (const [index, source] of input.key_sources.entries()) {
    const { id, pubmedDoi, ids, linkIds, linkPages } = keyLinks[index]!;
    const linked = (link: string): boolean => keyStudyLinked(link, linkIds, linkPages);
    const audited = ids.some((candidate) => validatedIds.has(candidate));
    const read = audited || ids.some((candidate) => readIds.has(candidate));
    if (source.read_depth === undefined) {
      requireDeclaration(`Give key_sources.read_depth for ${source.id}: ${READ_DEPTH_VALUES.join(", ")}.`);
    } else if ((source.read_depth === "full_text_audited" && !audited) ||
               (source.read_depth === "full_text_read" && !read)) {
      nextSteps.push(`Key source ${source.id} cannot support read_depth ${source.read_depth} with these receipts; ` +
        `give read_depth ${read ? "full_text_read" : "partial_text or another lower value reflecting what was read"}, ` +
        `or pass its matching research_receipt.`);
    }
    if (input.answer_draft !== undefined) {
      const identified = isPmid(id) || isDoi(id) || isPmcid(id);
      const marker = source.answer_marker === undefined ? "" : caveatText(source.answer_marker);
      const markerLinks = marker === "" ? [] : studyLines
        .filter((line) => caveatText(visibleText(line)).includes(marker)).map(linksFor);
      // The label's line links a page no receipt ties to this study, and no line has both: one step names that link,
      // instead of saying there is none (#336's fourth turn kept its publisher links through four such steps). A link
      // naming a DOI, or tied to another key study, is another paper's.
      const untied = identified && !markerLinks.some((links) => links.some(linked))
        ? markerLinks.flat().find((link) => !linkNamesDoi(link) && !keyLinks.some((other, otherIndex) =>
            otherIndex !== index && keyStudyLinked(link, other.linkIds, other.linkPages)))
            ?.replace(/[.,;:!?)\]]+$/u, "")
        : undefined;
      const pages = keyStudyPages(id, linkIds, linkPages);
      if (source.answer_marker === undefined) {
        requireDeclaration(`Give key_sources.answer_marker for ${source.id}: the visible label, 3 to 80 characters, on the same line as its link in answer_draft.`);
      } else if (untied !== undefined) {
        nextSteps.push(`Key study ${source.id} is linked by ${untied}, which no receipt passed here ties to it: ` +
          `link ${listOf(pages, "or")} instead` + (isDoi(id)
            ? `, or pass the research_receipt that ties that page: resolve_doi with ${id} ties the page the DOI is ` +
              "registered to, and fetch_pubmed_record ties the study's PubMed page."
            : "."));
      } else if (!markerLinks.some((links) => links.some(linked))) {
        nextSteps.push(`Key source ${source.id} has no answer_marker on the same line as its link in answer_draft; put its answer_marker there.`);
      }
      if (identified && untied === undefined && !studyLinks.some(linked)) {
        nextSteps.push(`Key study ${source.id} has no link in the answer; link it to the page AskRigor's tools returned, such as ${listOf(pages, "or")}.`);
      }
    }
    if (ids.some((candidate) => validatedIds.has(candidate))) {
      validatedSources.push(source.id);
      continue;
    }
    if (ids.some((candidate) => leadIds.has(candidate))) {
      if (needsPubmedCopyAttempt(source.id, id, pubmedDoi, leadAttempts)) continue;
      leadSources.push(source.id);
      const limits: Record<string, string> = {
        NO_COPY_FOUND_AFTER_EXPANDED_SEARCH: "no public full text was found after an exact search",
        PAYWALL_OR_LOGIN_REQUIRED: "its full text needs a login or a subscription",
        CANDIDATE_FOUND_FETCH_BLOCKED: "a possible public copy was found, but AskRigor could not fetch it to check it",
        ABSTRACT_ONLY: "only its abstract was readable",
        PARTIAL_TEXT_READABLE: "only part of its text was readable",
        IDENTITY_MISMATCH: "no copy found could be verified as the same paper"
      };
      const state = ids.map((candidate) => leadStates.get(candidate)).find((state) => state !== undefined);
      const limit = state === undefined ? "no open full text was available" : limits[state] ?? "no open full text was available";
      requireLimit(`Cite ${source.id} as a lead: ${limit}, so its methods were not audited.`);
      unreadStudies.set(id, state);
      continue;
    }
    const failedForSource = [...routeFailures].flatMap(([doi, failures]) =>
      ids.includes(doi) ? failures : failures.filter(({ pmcid }) => pmcid !== "" && ids.includes(normalizeIdentifier(pmcid))));
    if (source.status === "lead_only" && failedForSource.length > 0) {
      const times = failedForSource.map(({ issued }) => issued);
      if (Math.max(...times) - Math.min(...times) < 60_000) {
        nextSteps.push(`A full-text service failed for ${source.id}: call acquire_open_full_text again at least a minute ` +
          "after the first attempt; if it fails again, pass the research_receipt from each attempt and cite it as a lead.");
        continue;
      }
      const failedAttempts = new Map([...routeFailures].map(([doi, failures]) =>
        [doi, new Set(failures.map(({ pmcid }) => pmcid))]));
      if (needsPubmedCopyAttempt(source.id, id, pubmedDoi, failedAttempts)) continue;
      leadSources.push(source.id);
      requireLimit(`Cite ${source.id} as a lead: a full-text service kept failing when AskRigor tried to fetch it, ` +
        "so its methods were not audited.");
      unreadStudies.set(id, "ROUTE_FAILED");
      continue;
    }
    if (!isDoi(id) && !isPmid(id) && !isPmcid(id)) {
      nextSteps.push(
        `Identify ${source.id} by DOI, PMID or PMCID, or leave it out of key_sources and label it unverified in the answer.`
      );
      continue;
    }
    if (isPmid(id) && pubmedDoi === undefined) {
      nextSteps.push(
        `Fetch PMID ${id} with fetch_pubmed_record and pass its research_receipt; if it has a DOI, try acquire_open_full_text.`
      );
      continue;
    }
    const pubmedPmcid = isPmid(id) ? pubmedPmcids.get(id) : undefined;
    if (isPmid(id) && pubmedDoi === "" && pubmedPmcid !== undefined) {
      // An open copy exists in PMC, so this is not a lead; the full-text chain
      // needs a DOI, so find one or keep the study out of the key sources.
      nextSteps.push(
        `PubMed lists an open full text in PubMed Central (${pubmedPmcid}) for PMID ${id} but no DOI. Find its DOI ` +
          `(search_europe_pmc for ${pubmedPmcid}) and read it with acquire_open_full_text and that pmcid, or leave it out of ` +
          "key_sources and label its claims unverified."
      );
      continue;
    }
    if (isPmid(id) && pubmedDoi === "") {
      // PubMed lists no DOI and no PMC copy, so the open full-text chain cannot run; the lead is proven.
      leadSources.push(source.id);
      requireLimit(
        `Cite ${source.id} as a lead: PubMed lists no DOI, so no open full text could be acquired and its methods were not audited.`
      );
      unreadStudies.set(id, "NO_DOI");
      continue;
    }
    const target = pubmedDoi ?? source.id;
    nextSteps.push(source.status === "validated"
      ? `For ${source.id}: acquire_open_full_text${target === source.id ? "" : ` (DOI ${target})`}, continue_open_full_text until exhausted, ` +
          "then validate_study_method_audit (or validate_review_method_audit) and pass its research_receipt. If no open full text exists, " +
          `the acquisition receipt lets you list it as lead_only. ${LEAD_RECEIPT_SEARCH}`
      : `Try acquire_open_full_text for ${source.id}${target === source.id ? "" : ` (DOI ${target})`}${isPmcid(id) ? " with its DOI and this pmcid" : ""} ` +
          `before treating it as lead_only; pass the research_receipt it returns. ${LEAD_RECEIPT_SEARCH}`);
  }
  if (unreadStudies.size > 0) caveats.push(...unreadStudiesCaveats(unreadStudies));
  // A key study's headline figures, as its audit recomputed them (owner
  // questions 87 and 89, issues #329 and #331): a study whose own data
  // contradict its figures, a value impossible as printed, and two studies
  // sharing identical results each reach the answer as the server's caveat.
  // Which study is right, and why, stay the model's to say.
  const keyFigures = input.key_sources.flatMap((source) => {
    const own = normalizeIdentifier(source.id);
    const doi = isPmid(own) ? pubmedDois.get(own) : undefined;
    const figures = [own, ...(doi === undefined || doi === "" ? [] : [doi])]
      .map((id) => studyFigures.get(id)).find((entry) => entry !== undefined);
    return figures === undefined ? [] : [{ source, figures, marker: source.answer_marker ?? source.id }];
  });
  for (const { source, figures, marker } of keyFigures) {
    if (figures.status === "not_declared") {
      requireDeclaration(`The study audit of ${source.id} lists no reported_figures: validate it again with ` +
        "reported_figures, each headline result (not a dose or group size) as the paper prints it with its source " +
        "block, recomputed from the paper's own tables or with why that isn't possible, or with an empty list and " +
        "reported_figures_none_reason when it reports no numeric result; pass the research_receipt it returns.");
      continue;
    }
    if (figures.status === "internally_inconsistent") {
      caveatOnce("A key study's figures don't match its own data: say so, as the caveat does.",
        `The reported figures in ${marker} don't match the study's own data, so its results stay unreliable until ` +
          "they are reconciled.");
    }
    for (const value of figures.impossible) {
      caveatOnce("A key study reports a value that is impossible as printed: say so, as the caveat does.",
        `The value ${value} in ${marker} is physically impossible as printed, so it is not used.`);
    }
  }
  for (const [index, first] of keyFigures.entries()) {
    for (const second of keyFigures.slice(index + 1)) {
      const shared = new Set(first.figures.values.filter((value) => second.figures.values.includes(value)));
      if (shared.size >= 2) {
        // Two studies the answer labels alike are named by their identifiers instead.
        const [a, b] = first.marker === second.marker
          ? [first.source.id, second.source.id] : [first.marker, second.marker];
        caveatOnce("Two key studies report identical results: count them once, as the caveat does.",
          `${a} and ${b} report identical results, so they are counted once, not as independent replication.`);
      }
    }
  }
  if (input.key_sources.length === 0) {
    requireLimit(
      "No study was declared decision-critical; say that no study's methods were checked in full text.",
      "No study's methods were checked in full text for this answer."
    );
  }

  // After a first pass of research the answer offers the two ways to go
  // deeper, a deeper study review and deeper community research, with two or
  // three focuses each, and asks which the user wants (HRP LimitsNote); an
  // answer that researched neither studies nor communities has none to offer.
  // Discovery that must go on comes first.
  const researched = input.community_evidence === "researched" || input.key_sources.length > 0;
  if (input.research_depth === "first_pass" && researched && !discoveryContinues) {
    const directions = FOCUS_DIRECTIONS.filter(({ direction }) =>
      direction === "studies" || input.community_evidence === "researched");
    const focuses = directions.map(({ direction }) =>
      (input.open_leads ?? []).filter((lead) => lead.direction === direction));
    const twoOrThree = (leads: readonly unknown[]) => leads.length >= 2 && leads.length <= 3;
    directions.forEach(({ direction, what }, index) => {
      const count = focuses[index]!.length;
      if (count > 3) {
        nextSteps.push(`open_leads lists ${count} focuses with direction ${direction}; keep the two or three most promising.`);
        return;
      }
      if (count >= 2) return;
      requireDeclaration(
        `List two or three open_leads with direction ${direction}: ${what}, each with what it could change in this ` +
          "answer (the conclusion, a ranking, the confidence, or only detail) and why it looks promising." +
          (direction === "community" && unsaturatedFirstPass
            ? " Discovery has not saturated, so include the topics where more community signal is likely" +
              (firstPassRateLimited > 0 ? " and the searches YouTube's rate limit or daily quota stopped." : ".")
            : "")
      );
    });
    const estimate = input.another_pass_estimate === undefined ? undefined : withoutEndPunctuation(input.another_pass_estimate);
    if (estimate === undefined || !PASS_COST_NUMBER.test(estimate)) {
      (estimate === undefined ? requireDeclaration : (step: string) => nextSteps.push(step))(
        "Give another_pass_estimate: roughly what another pass over the open leads would take, with a number in " +
          "digits and a unit (for example, \"about 20 minutes and 15 YouTube searches\")."
      );
    } else if (focuses.every(twoOrThree)) {
      requireLimit(
        `First pass only${unsaturatedFirstPass ? "; discovery had not saturated" : ""}. End the answer with the ` +
          `${directions.length === 2 ? "two ways" : "way"} to go deeper, a sentence or two each, in plain language for ` +
          "the user (no video IDs or internal codes): " +
          directions.map(({ label }, index) => `${label} (${focuses[index]!.map(({ topic }) => topic.trim()).join("; ")})`)
            .join(" and ") +
          ". Say what each focus could change in this answer and why it looks promising, give roughly what another " +
          "pass would take, and ask which the user " +
          "wants and which focus.",
        ...directions.flatMap(({ caption }, index) =>
          focuses[index]!.map(({ topic, why }) => `${caption}: ${topic.trim()}. ${asSentence(why)}`)),
        directions.length === 2
          ? `Another pass would take ${estimate}; would you like to go deeper into the studies or the communities, ` +
            "and which focus matters most to you?"
          : `Another pass would take ${estimate}; would you like to go deeper into the studies, and which focus ` +
            "matters most to you?"
      );
    }
    if (firstPassRateLimited > 0) {
      requireLimit(
        `YouTube's rate limit or daily quota stopped ${firstPassRateLimited} search(es) in the latest discovery ` +
          "rounds; say so, and that another pass can rerun them once the limit resets.",
        `YouTube's daily search limit stopped ${firstPassRateLimited === 1 ? "1 search" : `${firstPassRateLimited} searches`} ` +
          `in this first pass; another pass can rerun ${firstPassRateLimited === 1 ? "it" : "them"} after the limit resets.`
      );
    }
  }

  // Absence claims. Where the answer says something was not found, not
  // studied, or has no evidence or no effect, or calls an intervention's
  // evidence unconvincing or not demonstrated, it says which it means: not
  // located by the searches made here, studies that do not establish the
  // effect, a direct null result, or a bounded exclusion (HRP
  // NonexistenceVersusNotFound, NoWeaselSafetySubstitution,
  // HistoricalVocabularyAndCitationBackchain, UserNamedInterventionSweep).
  // The model names each such sentence, in whatever language it wrote it;
  // the gate checks that the answer shows it, that a verdict resting on
  // studies names studies whose methods were audited (a null result or an
  // exclusion also gives its numbers), and that what the searches did not
  // find is bounded to the searches made (owner reports, 2026-09-30: "I
  // found no evidence that smelling humic acid treats neuroinflammation";
  // 2026-10-12: an answer judged a remedy to have "no convincing benefit"
  // before searching its exact route).
  const absenceClaims = input.absence_claims ?? [];
  if (input.answer_draft !== undefined && input.absence_claims === undefined) {
    requireDeclaration(
      "absence_claims is missing: it lists each sentence saying something was not found, not studied, has no " +
        "evidence or has no effect, or calling an intervention's evidence unconvincing, weak, not demonstrated or " +
        "showing no benefit (an empty list means none). Evidence-strength sentences are absence claims, declared " +
        "with not_established and their key sources when studies were found, or support_not_located with search " +
        "coverage when none were."
    );
  }
  if (input.answer_draft !== undefined && input.scale_results === undefined) {
    requireDeclaration(
      "scale_results is missing: with answer_draft, the declaration lists each scale or questionnaire result " +
        "reported in the answer (an empty list means none)."
    );
  }
  // Harm and safety sentences, the terms a conclusion depends on, and
  // mechanism claims (owner questions 86, 88 and 89). HRP and Universal
  // already require rates against a comparator, scoped hazards, plain-language
  // terms and route-matched mechanisms; these declarations are where the final
  // check enforces them. The model names each sentence, in whatever language it
  // wrote it, and the gate checks exactly what it declares: the quote is shown,
  // a rate has its numbers, the studies are key sources, a term is explained at
  // its first use, and each basis or route mismatch carries its caveat.
  // Undeclared sentences are invisible to it, as with absence_claims.
  if (input.answer_draft !== undefined && input.safety_claims === undefined) {
    requireDeclaration(
      "safety_claims is missing: with answer_draft, it lists each sentence warning that something can cause harm, " +
        "is unsafe, toxic or risky, or should be avoided, and each sentence calling something safe or harmless, " +
        "with its exposure, basis, what the evidence measured and its studies (an empty list means none)."
    );
  }
  if (input.answer_draft !== undefined && input.key_terms === undefined) {
    requireDeclaration(
      "key_terms is missing: with answer_draft, it lists each specialized term the answer's conclusions depend on, " +
        "with the sentence that first explains it in plain words (an empty list means none)."
    );
  }
  if (input.answer_draft !== undefined && input.mechanism_claims === undefined) {
    requireDeclaration(
      "mechanism_claims is missing: with answer_draft, it lists each sentence saying how an intervention works or " +
        "that it does not act through a mechanism, with the route of the use it describes, the route of the " +
        "experiment it rests on and its studies (an empty list means none)."
    );
  }
  if (input.answer_draft !== undefined && input.recommendations === undefined) {
    requireDeclaration(
      "recommendations is missing: with answer_draft, it lists each intervention the answer recommends or puts " +
        "forward for this person, with the sentence that does so, whether this person's safety conflicts and inputs " +
        "are resolved, and for long-term use its longest follow-up and whether stopping is covered (an empty list " +
        "means none)."
    );
  }
  // The key source a declared study names, by its own identifier or its PubMed record's DOI.
  const keySourceFor = (id: string): FinalizeResearchInput["key_sources"][number] | undefined => {
    const wanted = normalizeIdentifier(id);
    return input.key_sources.find((source) => {
      const own = normalizeIdentifier(source.id);
      const doi = isPmid(own) ? pubmedDois.get(own) : undefined;
      return own === wanted || (doi !== undefined && doi !== "" && doi === wanted);
    });
  };
  const markerFor = (id: string): string => {
    const source = keySourceFor(id);
    return source?.answer_marker ?? source?.id ?? id;
  };
  const undeclaredStudies = (at: string, studies: readonly string[]): void => {
    const missing = studies.filter((id) => keySourceFor(id) === undefined);
    if (missing.length > 0) {
      nextSteps.push(`${at} rests on ${missing.join(", ")}, which key_sources does not list: add each to key_sources ` +
        "with its read depth and link, so its reading is checked like any key study.");
    }
  };
  const plainPhrase = (text: string): string => text.trim().replace(/[\s.;:!?]+$/u, "");
  for (const [index, claim] of (input.safety_claims ?? []).entries()) {
    const at = `safety_claims[${index}]`;
    const exposure = plainPhrase(claim.exposure);
    if (claim.basis !== "not_quantified") {
      // A share of selected reports may come from posts rather than a study.
      const studiesNeeded = claim.basis !== "share_of_reports";
      if (claim.measured_exposure === undefined || (studiesNeeded && (claim.studies ?? []).length === 0)) {
        requireDeclaration(`${at} has basis ${claim.basis} without ${claim.measured_exposure === undefined
          ? "measured_exposure" : "studies"}: give what the cited evidence measured and the key sources it rests on, ` +
          "or declare basis not_quantified.");
      }
      undeclaredStudies(at, claim.studies ?? []);
    }
    const numbers = extractUnsignedNumbers(claim.quote);
    if (claim.basis === "comparative_rates" && numbers.length < 2) {
      nextSteps.push(`${at} rests on rates against a comparator, but its sentence gives fewer than two numbers: ` +
        "give the rate in each group in that sentence.");
    }
    if (claim.basis === "observed_rates" && numbers.length < 1) {
      nextSteps.push(`${at} rests on an observed rate, but its sentence gives no number: give the rate in that sentence.`);
    }
    if (claim.basis === "share_of_reports" && numbers.length < 1) {
      nextSteps.push(`${at} rests on a share of selected reports, but its sentence gives no number: give the share ` +
        "in that sentence.");
    }
    const measured = claim.measured_exposure === undefined ? undefined : plainPhrase(claim.measured_exposure);
    if (claim.basis === "share_of_reports") {
      // A share of selected reports, posts or passages is not a share of people
      // (HRP QA3 and QA6; lesson #25 by owner question 92).
      caveatOnce("A figure is a share of selected reports, not of people: say so, as the caveat does.",
        claim.direction === "harm"
          ? "That figure is a share of selected reports, not of people, so how often this happens isn't known."
          : `That figure is a share of selected reports, not of people, so it doesn't show how safe ${exposure} is.`);
    } else if (claim.direction === "harm") {
      if (claim.basis === "case_reports") {
        caveatOnce("A harm warning rests on case reports: say what they show, as the caveat does.",
          "Case reports show that this harm can happen, not how often it happens.");
      } else if (claim.basis === "hazard_measurement" && measured !== undefined) {
        caveatOnce("A harm warning rests on a measurement, not on harm observed in people: say so, as the caveat does.",
          `This warning rests on measurements of ${measured}, not on harm observed in people using ${exposure}, so ` +
            "how often it would cause harm wasn't measured.");
      } else if (claim.basis === "not_quantified") {
        caveatOnce("A harm warning has no rate: say so, as the caveat does.",
          "How often this happens wasn't quantified in the sources found here.");
      }
    } else if (claim.basis === "hazard_measurement" && measured !== undefined) {
      caveatOnce("A safety claim rests on a measurement or an animal test, not on observed safety in people: say so, " +
        "as the caveat does.",
        `This rests on ${measured}, not on observed safety in people using ${exposure}, so long-term or rare harms ` +
          "are unmeasured.");
    } else if (claim.basis === "case_reports") {
      caveatOnce("A safety claim rests on case reports: say what they cannot show, as the caveat does.",
        `Case reports can show that a harm happens, but not that ${exposure} is safe.`);
    } else if (claim.basis === "not_quantified") {
      caveatOnce("A safety claim has no rate of harms behind it: say so, as the caveat does.",
        `How often harms occur with ${exposure} wasn't quantified in the sources found here.`);
    }
  }
  // The serious harms a safety answer screened by name (owner answer "128b", 2026-10-20, from lesson #44: comparing
  // the safety of a prescribed growth hormone with peptides that raise it, an answer searched blood sugar, swelling,
  // joints, the heart and cancer, but never severe allergic reactions after injections tolerated before, and nothing
  // showed the gap). The model lists each serious harm and what its screen found, and each state's own field is
  // checked exactly: a label warning or a reported signal is shown in the answer by its sentence, a harm not found
  // was searched with the query of a literature-search receipt passed here, and a harm not checked reaches the answer
  // in the server's sentence. Which harms are plausible, and so whether the list is complete, stays the model's
  // declaration: no word list reads the harms or the answer. The rule itself is the protocols' serious-harm screen.
  const harmScreen = input.harm_screen ?? [];
  const harmScreenTrigger = (input.safety_claims ?? []).length > 0
    ? "the answer makes safety statements (safety_claims)"
    : input.safety_question === true ? "the question is about safety (safety_question)" : undefined;
  if (input.answer_draft !== undefined && harmScreenTrigger !== undefined && harmScreen.length === 0) {
    (input.harm_screen === undefined ? requireDeclaration : (step: string) => { nextSteps.push(step); })(
      `harm_screen ${input.harm_screen === undefined ? "is missing" : "lists no harm"}: ${harmScreenTrigger}, so ` +
        "harm_screen lists the serious harms plausible for this exposure, apart from its common side effects, each " +
        "searched by name, with what the search found: label_warning or reported_signal with the answer's sentence " +
        "as answer_quote, not_found with the exact search_query of a literature search passed here, or not_checked " +
        "(at least one entry)."
    );
  }
  // Each entry's own field, as its state needs it; another state's field, if given, is not used.
  const screenedHarms = new Map<string, number>();
  for (const [index, entry] of harmScreen.entries()) {
    const at = `harm_screen[${index}]`;
    const harm = plainPhrase(entry.harm).replace(/\s+/gu, " ");
    // One harm, one entry: names compared as caveats are, so a repeat adds no second caveat.
    const first = screenedHarms.get(caveatText(harm));
    if (first === undefined) screenedHarms.set(caveatText(harm), index);
    else nextSteps.push(`${at} names the same harm as harm_screen[${first}]: give each harm one entry.`);
    const sources = new Set(entry.sources_searched ?? []);
    if (entry.state !== "not_checked" && sources.size === 0) {
      nextSteps.push(`${at} is ${entry.state} without sources_searched: give the kinds of source searched for ${harm}.`);
    }
    if (entry.state === "label_warning" && sources.size > 0 && !sources.has("label") && !sources.has("regulator_warning")) {
      nextSteps.push(`${at} is label_warning, but sources_searched lists neither label nor regulator_warning: add the ` +
        `one whose warning names ${harm}, or declare it reported_signal.`);
    }
    if ((entry.state === "label_warning" || entry.state === "reported_signal") && entry.answer_quote === undefined) {
      nextSteps.push(`${at} is ${entry.state} without answer_quote: report ${harm} in the answer, and copy that ` +
        "sentence from answer_draft.");
    }
    if (entry.state === "not_found") {
      // A harm not found was searched with a query a literature-search receipt in this call signed, compared by its
      // digest as full_text_search queries are; nothing else shows that the search ran.
      const query = entry.search_query === undefined ? undefined : discoveryQueryDigest([entry.search_query]);
      if (query === undefined) {
        nextSteps.push(`${at} is not_found without search_query: give the exact query ${harm} was searched with, and ` +
          "pass that search's research_receipt, or declare it not_checked.");
      } else if (!verified.some(({ kind, claims }) => kind === "literature_search" && text(claims.q) === query)) {
        nextSteps.push(`${at}.search_query is not the query of any literature search passed here: search ${harm} by ` +
          "name with search_pubmed, search_europe_pmc or search_clinical_trials, give that exact query, and pass its " +
          "research_receipt, or declare it not_checked.");
      }
    }
    if (entry.state === "not_checked") {
      // The harm reaches the reader in the caveat, so it shows no internal labels, as not_relevant_reason does.
      const labels = internalLabels(entry.harm, options.protocolNames ?? new Set());
      if (labels.length > 0) {
        nextSteps.push(`${at}.harm shows internal labels (${labels.slice(0, 8).join(", ")}` +
          `${labels.length > 8 ? ", and more" : ""}): the answer names this harm in its caveat, so give it in plain ` +
          "words.");
      }
      if (first === undefined) {
        caveatOnce(`A serious harm, ${harm}, was not checked: say so in the answer, as the caveat does.`,
          harmNotCheckedCaveat(entry.harm));
      }
    }
  }
  // A mechanism rests on evidence from its route, species and tissue, or the
  // answer says where the evidence came from (FS229; owner questions 88 and
  // 92). Whom an experiment was done in and where it measured stay the
  // model's declarations; the caveats are checked exactly.
  for (const [index, claim] of (input.mechanism_claims ?? []).entries()) {
    const at = `mechanism_claims[${index}]`;
    undeclaredStudies(at, claim.studies);
    const marker = markerFor(claim.studies[0]!);
    const inAnimals = claim.evidence_in === "animals" && claim.evidence_route !== "in_vitro";
    if (claim.use_route !== claim.evidence_route) {
      caveatOnce("A mechanism claim rests on evidence from another route: say which, as the caveat does.",
        inAnimals
          ? `This finding comes from ${EVIDENCE_ROUTE_WORDS[claim.evidence_route]} in animals in ${marker}; ` +
            `${USE_ROUTE_WORDS[claim.use_route]} in people was not tested for it.`
          : `This finding comes from ${EVIDENCE_ROUTE_WORDS[claim.evidence_route]} in ${marker}; ` +
            `${USE_ROUTE_WORDS[claim.use_route]} was not tested for it.`);
    } else if (inAnimals) {
      caveatOnce("A mechanism claim rests on animal experiments: say so, as the caveat does.",
        `This finding comes from animal experiments in ${marker}; it was not tested in people.`);
    }
    if (claim.tissue !== undefined) {
      caveatOnce("A mechanism claim applies a finding to another tissue: say where it was measured, as the caveat does.",
        `This finding was measured in ${plainPhrase(claim.tissue.measured)} in ${marker}, not in ` +
          `${plainPhrase(claim.tissue.claimed)}.`);
    }
  }
  // Question 90 (lesson #23): what the answer puts forward for this person
  // carries its safety check, and a medicine taken long term its follow-up and
  // stopping. Whether a sentence recommends something and whether an input is
  // open stay the model's declarations; the checks and caveats are exact.
  const sentenceStart = (text: string): string => {
    const phrase = plainPhrase(text);
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  };
  for (const [index, recommendation] of (input.recommendations ?? []).entries()) {
    const at = `recommendations[${index}]`;
    const intervention = sentenceStart(recommendation.intervention);
    if (recommendation.safety_check !== "resolved") {
      if (recommendation.open_inputs === undefined) {
        nextSteps.push(`${at} is ${recommendation.safety_check} without open_inputs: name the conflicts or safety ` +
          "inputs still open, in a few words.");
      } else {
        const open = plainPhrase(recommendation.open_inputs);
        caveatOnce(recommendation.safety_check === "unresolved"
          ? "A recommendation's safety check is unresolved: say it needs a clinician's review first, as the caveat does."
          : "A recommendation depends on a condition a clinician should confirm: say so, as the caveat does.",
        recommendation.safety_check === "unresolved"
          ? `${intervention} needs a clinician's review of ${open} before it could be recommended for you.`
          : `${intervention} depends on ${open}, which a clinician should confirm first.`);
      }
    }
    if (!recommendation.long_term_use) continue;
    const missing = [
      ...(recommendation.longest_follow_up === undefined ? ["longest_follow_up"] : []),
      ...(recommendation.follow_up_matches_use === undefined ? ["follow_up_matches_use"] : []),
      ...(recommendation.stopping_covered === undefined ? ["stopping_covered"] : [])
    ];
    if (missing.length > 0) {
      nextSteps.push(`${at} is for long-term use without ${missing.join(", ")}: give the longest follow-up in its ` +
        "evidence, whether it matches how long it would be taken, and whether the answer covers stopping.");
      continue;
    }
    if (recommendation.stopping_covered === false) {
      nextSteps.push(`${at} puts ${plainPhrase(recommendation.intervention)} forward for long-term use without ` +
        "covering stopping: say what is known about stopping, withdrawal and lasting harms, or that they are " +
        "unknown, and mark stopping_covered.");
    }
    if (recommendation.follow_up_matches_use === false) {
      caveatOnce("A medicine for long-term use rests on shorter evidence: say so, as the caveat does.",
        `The evidence on ${plainPhrase(recommendation.intervention)} followed people for ` +
          `${plainPhrase(recommendation.longest_follow_up!)}, so its benefits and harms over years of use, and how ` +
          "easily people stop it, aren't established.");
    }
  }
  // A study is audited when a study or review audit receipt names it, or the DOI its PubMed record gives.
  const auditedStudy = (id: string): boolean => {
    const normalized = normalizeIdentifier(id);
    const doi = isPmid(normalized) ? pubmedDois.get(normalized) : undefined;
    return validatedIds.has(normalized) || (doi !== undefined && doi !== "" && validatedIds.has(doi));
  };
  for (const [index, claim] of absenceClaims.entries()) {
    if (claim.state === "support_not_located") continue;
    const verdict = claim.state === "not_established";
    const stated = `absence_claims[${index}] states ` + (claim.state === "direct_null_evidence"
      ? "a direct null result"
      : verdict ? "that studies do not establish the effect" : "a bounded exclusion");
    const studies = claim.studies ?? [];
    const unaudited = studies.filter((id) => !auditedStudy(id));
    if (studies.length === 0) {
      requireDeclaration(`${stated} without the studies it rests on: ` + (verdict
        ? "studies lists its key sources (DOI, PMID or PMCID), each covered by a full-text method audit."
        : "name them in studies, each read with a full-text method audit, or state it as support_not_located."));
    } else if (unaudited.length > 0) {
      nextSteps.push(`${stated} on ${unaudited.join(", ")}, which no full-text method audit here covers: ` + (verdict
        ? "an abstract or a lead cannot establish this evidence-strength verdict. Each listed study needs a " +
          "full-text method audit."
        : "an abstract or a lead cannot show a null result. Audit each, or state it as support_not_located."));
    }
    // A verdict that studies do not establish an effect states no estimate.
    if (!verdict && !/\p{Nd}/u.test(claim.quote)) {
      nextSteps.push(
        `${stated}: give the estimate and its interval in that sentence, so a reader sees how large an effect the ` +
          "studies could have missed."
      );
    }
  }
  // A serious harm the screen did not find is a claim that something was not found too, so the same caveats bound it
  // to the searches made here; its own step above names a search receipt it lacks.
  const notLocated = absenceClaims.some(({ state }) => state === "support_not_located");
  if (notLocated || harmScreen.some(({ state }) => state === "not_found")) {
    if (fullTextQueries !== undefined) {
      requireLimit(
        "The answer says something was not found after full-text searches: bound that to their coverage, as the caveat does.",
        "Where it says something was not found, the full-text searches covered Europe PMC's full texts only, " +
          "about 30% of PubMed records."
      );
    }
    const searched = new Set(verified.filter(({ kind }) => kind === "literature_search")
      .map(({ claims }) => text(claims.src)));
    const names = LITERATURE_SOURCES.filter(({ id }) => searched.has(id)).map(({ name }) => name);
    if (names.length === 0) {
      if (notLocated) {
        nextSteps.push(
          "The answer says something was not found, but no literature search receipt was passed: search with " +
            "search_pubmed or search_europe_pmc (and search_clinical_trials for trials) and pass their research receipts."
        );
      }
    } else {
      const covered = new Set(input.search_coverage ?? []);
      const uncovered = SEARCH_COVERAGE.filter(({ id }) => !covered.has(id)).map(({ phrase }) => phrase);
      requireLimit(
        "The answer says something was not found: bound that to the searches made here, as the caveat does.",
        `Where this answer says something was not found, it means the searches made here (${joinNames(names)}) did ` +
          `not find it${uncovered.length === 0 ? "" : `, and they did not cover ${joinNames(uncovered)}`}; that is ` +
          "not evidence that it does not exist."
      );
    }
  }

  // The answer itself, read for this call only. HRP keeps internal states out
  // of the answer and links audited videos by title (ReaderFacingAnswer,
  // FS190), offers a long deeper-research prompt rather than pasting it
  // (LimitsNote), and the comments that were read must reach it (must_report).
  // Whether the answer ranks the options, which a first pass and a bounded
  // coverage result forbid, is not read from its words: no word list decides
  // that in every language, so the caveat saying it does not rank them is
  // what the gate enforces.
  const draft = input.answer_draft;
  // A findings card (owner decisions Q9 to Q11, 2026-09-30) is checked with
  // the answer, which needs one for any research account. A free contributor's
  // checked card is saved by the agreement the user accepted, with nothing
  // offered; a paid private answer offers its checked card's save, which waits
  // for the user's yes. A rejected card is reported, not saved or offered, and
  // never holds back the answer, whose research may have nothing a card can cite.
  let findingsCard: FindingsCardCheck = options.findings === "private"
    ? privateFindings()
    : input.findings_card === undefined
      ? noFindingsCard()
      : !findingsOpen(options)
        ? closedFindingsLibrary()
        : {
            status: "rejected",
            problems: ["A findings card is checked against the answer: pass answer_draft with it."]
          };
  if (draft === undefined) {
    requireDeclaration(
      "Pass the answer you are about to give as answer_draft, exactly as the user will see it; the final check reads it."
    );
  } else {
    // A card's findings each cite a study audited or read as a lead here, or a
    // video audited here, so an answer resting on none of them (a handoff, a
    // correction, a question about given figures) has nothing a card can hold
    // and is not asked for one (the 2026-10-15 owner regressions).
    const citable = validatedIds.size > 0 || leadSources.length > 0 || auditedAtAll.size > 0 ||
      materialVideos.length > 0;
    if (findingsOpen(options) && input.findings_card === undefined && citable) {
      requireDeclaration(
        (options.findings === "save"
          ? "Give findings_card with answer_draft: this account's research is saved to AskRigor's findings library for " +
            "the owner's review."
          : "Give findings_card with answer_draft: the answer offers to save its findings to AskRigor's findings " +
            "library, and they are saved only if the user says yes.") +
          " Put in the answer's best findings, none the user corrected, and no personal details."
      );
    }
    if (input.findings_card !== undefined && findingsOpen(options)) {
      const showing = quoteLocator(displayedProse(draft));
      // What a card may cite: studies validated or read as leads here (by
      // either of a PMID's identifiers), and videos audited or material here.
      const cardStudies = new Set<string>();
      for (const id of [...validatedSources, ...leadSources]) {
        const normalized = normalizeIdentifier(id);
        cardStudies.add(normalized);
        const doi = isPmid(normalized) ? pubmedDois.get(normalized) : undefined;
        if (doi !== undefined && doi !== "") cardStudies.add(doi);
      }
      // Video IDs are case-sensitive, so they are compared as given.
      const videoAudited = (id: string) => auditedAtAll.has(id);
      findingsCard = findingsCardCheck(input.findings_card, {
        shown: (quote) => showing(quote).length > 0,
        studyAudited: auditedStudy,
        verified: (id) => auditedStudy(id) || cardStudies.has(normalizeIdentifier(id)) || videoAudited(id) ||
          materialVideos.includes(id),
        videoAudited
      });
      if (findingsCard.status === "checked" && options.findings === "offer") caveats.push(FINDINGS_SAVE_OFFER);
    }
    const lanes: AnswerLane[] = [
      ...(findings === undefined || commentVideos.size === 0 ? [] : [{
        name: "the YouTube comments",
        field: "community_findings",
        findings: YOUTUBE_LANE_FINDINGS,
        quotes: findings.answer_quotes === undefined ? [] : [findings.answer_quotes]
      }]),
      ...communitiesRead.map((community): AnswerLane => ({
        name: community.name,
        field: "its community_searches entry",
        findings: COMMUNITY_FINDINGS,
        quotes: community.quotes,
        urls: community.urls
      }))
    ];
    nextSteps.push(...answerDraftProblems(draft, {
      videoIds: [...new Set([...discovered, ...auditedAtAll])],
      protocolNames: options.protocolNames ?? new Set(),
      caveats,
      lanes,
      absenceQuotes: absenceClaims.map(({ quote }) => quote),
      scaleResults: input.scale_results ?? [],
      declaredQuotes: [
        ...(input.reader_dismissed ?? []).map(({ quote }, index) => ({ at: `reader_dismissed[${index}]`, quote })),
        ...(input.comparison_claims ?? []).map(({ quote }, index) => ({ at: `comparison_claims[${index}]`, quote })),
        ...(input.safety_claims ?? []).map(({ quote }, index) => ({ at: `safety_claims[${index}]`, quote })),
        // A harm the screen found is shown in the answer by the sentence the entry copies.
        ...harmScreen.flatMap(({ state, answer_quote: quote }, index) =>
          (state === "label_warning" || state === "reported_signal") && quote !== undefined
            ? [{ at: `harm_screen[${index}].answer_quote`, quote }] : []),
        ...(input.mechanism_claims ?? []).map(({ quote }, index) => ({ at: `mechanism_claims[${index}]`, quote })),
        ...(input.recommendations ?? []).map(({ quote }, index) => ({ at: `recommendations[${index}]`, quote })),
        ...(input.proposed_tests ?? []).flatMap(({ quote, difference }, index) => [
          { at: `proposed_tests[${index}]`, quote },
          ...(difference === undefined ? [] : [{ at: `proposed_tests[${index}].difference`, quote: difference }])
        ]),
        ...(input.corrections ?? []).flatMap(({ report }, index) => report === undefined ? [] :
          [{ at: `corrections[${index}].report`, quote: report }]),
        ...(input.corrections ?? []).map(({ change }, index) => ({ at: `corrections[${index}].change`, quote: change }))
      ],
      corrections: input.corrections ?? [],
      communityNames: [...(input.community_searches ?? []).map(({ community }) => community),
        ...(input.principal_communities ?? []).map(({ name }) => name)],
      keyTerms: input.key_terms ?? [],
      labPreparationQuotes: input.lab_preparation?.status === "covered" ? input.lab_preparation.answer_quotes ?? [] : [],
      missingDeclaration: () => { missingDeclaration = true; },
      ...(input.answer_language === undefined ? {} : { answerLanguage: input.answer_language }),
      renderings: input.caveat_renderings ?? []
    }));
  }

  if (missingDeclaration) nextSteps.push(TOOL_LIST_REFRESH_HINT);

  const secondReading = checkSecondReading(input, options.secondReading, nextSteps);

  const status = nextSteps.length > 0
    ? "not_ready"
    : limits.length > 0
      ? "ready_with_limits"
      : "ready";
  const output: FinalizeResearchOutput = {
    contract: FINALIZE_RESEARCH_CONTRACT,
    status,
    next_steps: nextSteps,
    limits,
    caveats,
    must_report: mustReport,
    receipts_verified: verified.length,
    receipts_rejected: [...rejected, ...offTarget].sort((left, right) => left.index - right.index),
    community: {
      decision: input.community_evidence,
      surveys,
      discovery_rounds: rounds.length,
      saturated,
      depth: input.research_depth,
      first_pass_complete: firstPassComplete,
      open_leads: openLeads,
      audited_videos: auditedVideos,
      material_videos: materialVideos,
      principal_communities: (input.principal_communities ?? []).map(({ name }) => name),
      communities_searched: communitiesSearched
    },
    sources: { validated: validatedSources, lead_only: leadSources },
    answer_checked: draft !== undefined,
    ...(secondReading === undefined ? {} : { second_reading: secondReading }),
    findings_card: findingsCard
  };
  if (status === "ready") output.check_line = "Checked with AskRigor's final check.";
  else if (status === "ready_with_limits") {
    output.check_line = "Checked with AskRigor's final check, with the limits above.";
  }
  if (status !== "not_ready") {
    output.finalization_receipt = issueResearchReceipt("finalization", {
      status,
      community: input.community_evidence,
      receipts: verified.length,
      videos: materialVideos.length,
      depth: input.research_depth,
      target: targetDigest,
      coverage: coverageBoundary ?? "none",
      open_leads: openLeads.length,
      validated: validatedSources.length,
      leads: leadSources.length,
      limits: limits.length,
      unverified: communitiesUnverified,
      // The findings library saves only the card whose digest this signs.
      ...(findingsCard.status === "checked" && input.findings_card !== undefined
        ? { findings: findingsCardDigest(input.findings_card) }
        : {})
    }, {
      secret: options.secret,
      ...(options.now === undefined ? {} : { now: options.now })
    });
  }
  // A carried state that does not verify gets no replacement: the model passes the last good one again.
  const carry = carriedInvalid ? undefined : buildCarriedState(input, carried, options);
  if (carry === "too_large") output.carry_forward_note = CARRIED_STATE_TOO_LARGE;
  else if (carry !== undefined) Object.assign(output, carry);
  return finalizeResearchOutputSchema.parse(output);
}

/**
 * The compound rule, module, case and section names in protocol texts, such as
 * DeepForumAuditActivationPrompt or NNTAndNNH: at least two capitals and a
 * lowercase letter, so single words (Rule, Purpose) and codes (FS190) are not
 * names an answer could leak.
 */
export function protocolNamesFrom(texts: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const text of texts) {
    for (const [, name] of [
      ...text.matchAll(/(?:name|id)="([A-Z][A-Za-z0-9]*)"/gu),
      ...text.matchAll(/<([A-Z][A-Za-z0-9]*)[\s>/]/gu)
    ]) {
      if (/[A-Z][^A-Z]*[A-Z]/u.test(name!) && /[a-z]/u.test(name!)) names.add(name!);
    }
  }
  return names;
}

// Retrieval and error codes, tool names and the internal action map's labels
// (REQUIRED_NOW, api_visible_complete, finalize_research) are snake case, which
// ordinary prose never uses; receipt and lock names can also appear as words.
const SNAKE_CASE_LABEL = /(?<![\w.-])[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+(?![\w-])/gu;
const INTERNAL_PHRASE = /\b(?:synthesis[ -]lock|research[ -]receipts?)\b|\brr1~/giu;
const CAPITALIZED_TOKEN = /(?<![A-Za-z0-9_-])[A-Z][A-Za-z0-9]*(?![A-Za-z0-9_-])/gu;
const ELEVEN_CHARACTERS = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{11}(?![A-Za-z0-9_-])/gu;
// YouTube IDs are random: mixed case with a digit or underscore, which words
// (even hyphenated ones such as Self-Report) are not.
const looksLikeVideoId = (token: string) =>
  /^[A-Za-z0-9_-]{11}$/u.test(token) && /[A-Z]/u.test(token) && /[a-z]/u.test(token) && /[0-9_]/u.test(token);
// A sentence only the full deep forum-audit template contains.
const PASTED_FORUM_TEMPLATE = /strict-core cohort and separately labeled adjacent cohorts/iu;
const URL = /https?:\/\/\S+/gu;

/**
 * The internal labels a text would show a reader: snake-case tokens outside links (not a Reddit name after r/ or u/,
 * not a video ID, nor one `exempt` accepts), protocol names, and internal phrases. Exact token checks, the same in any
 * language; what the text means is not read.
 */
function internalLabels(text: string, protocolNames: ReadonlySet<string>,
  exempt: (token: string) => boolean = () => false): string[] {
  // Links may carry IDs and underscores legitimately; the words around them may not.
  const prose = text.replace(URL, " ");
  return [...new Set([
    ...[...prose.matchAll(SNAKE_CASE_LABEL)].filter((match) => {
      const prefix = prose.slice(Math.max(0, match.index - 2), match.index);
      return prefix !== "r/" && prefix !== "u/" && !looksLikeVideoId(match[0]) && !exempt(match[0]);
    }).map(([label]) => label),
    ...[...prose.matchAll(CAPITALIZED_TOKEN)].map(([name]) => name).filter((name) => protocolNames.has(name)),
    ...[...prose.matchAll(INTERNAL_PHRASE)].map(([label]) => label.toLowerCase())
  ])];
}

/** A lane the answer must report, with the answer's sentences the model says report each finding. */
interface AnswerLane {
  // As next steps name it: "the YouTube comments", or the community.
  name: string;
  // Where its quotes go.
  field: string;
  findings: readonly string[];
  // One set per entry that gave them: a community searched twice may quote in either.
  quotes: ReadonlyArray<Readonly<Record<string, string>>>;
  // Threads read there, one of which the answer links where it reports them.
  urls?: readonly string[];
}

// Every finding the YouTube comments lane reports, as community_findings names them.
const YOUTUBE_LANE_FINDINGS = [
  "benefit_reports", "no_effect_reports", "adverse_reports", "creators_versus_commenters", "effect_on_answer"
] as const;

function answerDraftProblems(
  draft: string,
  context: {
    videoIds: string[];
    protocolNames: ReadonlySet<string>;
    caveats: readonly string[];
    lanes: readonly AnswerLane[];
    absenceQuotes: readonly string[];
    scaleResults: NonNullable<FinalizeResearchInput["scale_results"]>;
    declaredQuotes: ReadonlyArray<{ at: string; quote: string }>;
    corrections: NonNullable<FinalizeResearchInput["corrections"]>;
    communityNames: readonly string[];
    keyTerms: NonNullable<FinalizeResearchInput["key_terms"]>;
    labPreparationQuotes: readonly string[];
    missingDeclaration: () => void;
    answerLanguage?: string;
    renderings: ReadonlyArray<{ caveat: string; text: string }>;
  }
): string[] {
  const problems: string[] = [];
  // Links may carry IDs and underscores legitimately; the words around them may not.
  const prose = draft.replace(URL, " ");
  // What the answer must say is read from the prose a reader sees; what it must not show, from the whole draft.
  const shownBlocks = displayedProse(draft);
  const labels = internalLabels(draft, context.protocolNames, (token) =>
    [...context.caveats, ...context.communityNames].some((text) =>
      [...text.matchAll(SNAKE_CASE_LABEL)].some(([caveatToken]) => caveatToken === token)));
  if (labels.length > 0) {
    problems.push(
      `The answer shows internal labels (${labels.slice(0, 8).join(", ")}${labels.length > 8 ? ", and more" : ""}): ` +
        "say what each means in plain words, or leave it out."
    );
  }
  // Video IDs are letters, digits, "-" and "_", none of them special here.
  const bareIds = [...new Set([
    ...context.videoIds.filter((id) =>
      /^[A-Za-z0-9_-]{11}$/u.test(id) && new RegExp(`(?<![A-Za-z0-9_-])${id}(?![A-Za-z0-9_-])`, "u").test(prose)),
    ...[...prose.matchAll(ELEVEN_CHARACTERS)].map(([token]) => token).filter(looksLikeVideoId)
  ])].sort();
  if (bareIds.length > 0) {
    problems.push(
      `The answer names video(s) by bare ID (${bareIds.slice(0, 10).join(", ")}` +
        `${bareIds.length > 10 ? `, and ${bareIds.length - 10} more` : ""}): give each its linked title instead.`
    );
  }
  if (PASTED_FORUM_TEMPLATE.test(draft)) {
    problems.push(
      "The answer pastes the full deep forum-audit prompt. Say what the deeper research would focus on and how to " +
        "start it, and offer the full prompt instead (\"Show me the full deeper-research prompt and help me fine-tune it\")."
    );
  }
  // Each lane researched reaches the answer, even when later sources dominate:
  // for each finding the model copies the answer's sentence(s) that report
  // it, and the gate checks that the answer shows them. Whether a sentence
  // reports its finding is left to the model that wrote both, in whatever
  // language it wrote them; no word list can judge that. A community beyond
  // YouTube is also linked, to a thread that was read, in a paragraph that
  // reports it, so a reader can check it.
  const showing = quoteLocator(shownBlocks);
  for (const lane of context.lanes) {
    if (lane.quotes.length === 0) {
      context.missingDeclaration();
      problems.push(
        `Give answer_quotes for ${lane.name} in ${lane.field}: for each finding, the sentence(s) of the answer that ` +
          `report it, copied from answer_draft. The answer must report what ${lane.name} showed, even if the signal ` +
          "is weak."
      );
      continue;
    }
    const laneBlocks = new Set<number>();
    const unshown = new Set<string>();
    for (const quotes of lane.quotes) {
      for (const finding of lane.findings) {
        const blocks = showing(quotes[finding] ?? "");
        if (blocks.length === 0) unshown.add(finding);
        for (const index of blocks) laneBlocks.add(index);
      }
    }
    if (unshown.size > 0) {
      problems.push(
        `For ${lane.name}, answer_quotes gives text the answer does not show (${[...unshown].join(", ")}): report ` +
          "each finding in the answer, and copy the sentence(s) that report it exactly, from one paragraph or list item."
      );
    }
    if (lane.urls !== undefined && laneBlocks.size > 0) {
      const laneLinks = new Set([...laneBlocks].flatMap((index) =>
        [...linkTargets(shownBlocks[index]!).matchAll(LINKED_URL)].map(([url]) => comparableUrl(url))));
      if (!lane.urls.some((url) => laneLinks.has(comparableUrl(url)))) {
        problems.push(`Link a thread you read from ${lane.name} in a paragraph that reports it, so a reader can check it.`);
      }
    }
  }
  const unshownAbsence = context.absenceQuotes.flatMap((quote, index) => showing(quote).length === 0 ? [index] : []);
  if (unshownAbsence.length > 0) {
    problems.push(
      `${unshownAbsence.map((index) => `absence_claims[${index}]`).join(", ")} ${unshownAbsence.length === 1 ? "gives" : "give"} ` +
        "text the answer does not show: copy each sentence exactly from answer_draft."
    );
  }
  for (const [index, quote] of context.labPreparationQuotes.entries()) {
    if (showing(quote).length === 0) {
      problems.push(`lab_preparation.answer_quotes[${index}] gives text the answer does not show: ` +
        "the quote does not occur in answer_draft.");
    }
  }
  // As with absence_claims, undeclared results are invisible to this gate.
  // Meaning, direction and magnitude wording remain the model's declarations;
  // only the quote, scale name and declared numbers are checked here.
  for (const [index, result] of context.scaleResults.entries()) {
    const at = `scale_results[${index}]`;
    if (showing(result.quote).length === 0) {
      problems.push(`${at} gives text the answer does not show: the quote does not occur in answer_draft.`);
    }
    if (!result.quote.includes(result.scale)) {
      problems.push(`${at} quotes no scale name: the quote does not contain the declared scale name.`);
    }
    const numbers = extractUnsignedNumbers(result.quote);
    const missing = (values: readonly number[]) => values.filter((value) => !includesAbsoluteNumber(numbers, value));
    const missingRange = missing([result.range.min, result.range.max]);
    if (missingRange.length > 0) {
      problems.push(`${at} quotes no range: the quote does not contain ${missingRange.join(" and ")}.`);
    }
    const missingValues = missing(result.values);
    if (missingValues.length > 0) {
      problems.push(`${at} quotes no declared values: the quote does not contain ${missingValues.join(" and ")}.`);
    }
    if (result.benchmark !== "none_established" && !includesAbsoluteNumber(numbers, result.benchmark.value)) {
      problems.push(`${at} quotes no benchmark: the quote does not contain ${result.benchmark.value}.`);
    }
  }
  const unshownDeclared = context.declaredQuotes.filter(({ quote }) => showing(quote).length === 0).map(({ at }) => at);
  if (unshownDeclared.length > 0) {
    problems.push(
      `${unshownDeclared.join(", ")} ${unshownDeclared.length === 1 ? "gives" : "give"} text the answer does not show: ` +
        "copy each sentence exactly from answer_draft."
    );
  }
  // A corrected statement is gone from the whole answer, its headings, tables
  // and summaries included, except inside the sentence saying what changed
  // (HRP CorrectionPropagationIsMandatory; lesson #29 by owner question 92).
  // Which statement was wrong stays the model's declaration; this is exact.
  if (context.corrections.length > 0) {
    for (const [index, { retracted, change }] of context.corrections.entries()) {
      if (retractedStatementShown(draft, retracted, [change])) {
        problems.push(`corrections[${index}]'s wrong statement still appears in the answer outside its change ` +
          "sentence: correct it everywhere, including headings, tables and summaries.");
      }
    }
  }
  // A term is explained where a reader first meets it (HRP
  // AudienceAccessibleTerminologyGate, FS227). Which terms count and whether
  // the explanation is good stay the model's judgment; the gate checks that
  // the declared explanation is shown, contains the term, and holds its first
  // use, compared as quotes are. A term written in capitals only, such as OR
  // for odds ratio or NO for nitric oxide, keeps its case, so the everyday
  // words its letters spell are not uses of it.
  if (context.keyTerms.length > 0) {
    const shownIn = (fold: (text: string) => string) =>
      shownBlocks.map((block) => fold(visibleText(block))).join("\n");
    const shown = { folded: shownIn(caveatText), cased: shownIn(casedCaveatText) };
    for (const [index, { term, explanation }] of context.keyTerms.entries()) {
      const at = `key_terms[${index}]`;
      const capitals = /\p{Lu}/u.test(term) && !/\p{Ll}/u.test(term);
      const fold = capitals ? casedCaveatText : caveatText;
      const shownText = capitals ? shown.cased : shown.folded;
      const termForm = fold(term);
      const explanationForm = quoteForm(explanation.replace(MARKDOWN_LINK_TEXT, "$1"), fold);
      const start = explanationForm === "" ? -1 : shownText.indexOf(explanationForm);
      if (start < 0) {
        problems.push(`${at} gives an explanation the answer does not show: copy the sentence exactly from answer_draft.`);
      } else if (termOccurrences(explanationForm, termForm).length === 0) {
        problems.push(`${at}'s explanation does not contain its term "${term}": give the sentence that explains it ` +
          "where the answer uses it.");
      } else {
        const first = termOccurrences(shownText, termForm)[0]!;
        if (first < start || first >= start + explanationForm.length) {
          problems.push(`The answer uses "${term}" before ${at}'s explanation: explain it in plain words where the ` +
            "answer first uses it.");
        }
      }
    }
  }
  // Each caveat the server wrote must reach the answer as a sentence of its
  // own. Only prose a reader sees counts: not code, comments, quotations or
  // image descriptions. An answer in another language states each in that
  // language, with the caveat's links, and gives the sentence in
  // caveat_renderings: the gate cannot judge a translation, so it checks that
  // sentence's place and links, and the wording is the model's declaration.
  const blocks = shownBlocks.map((block) => caveatText(linkTargets(block)));
  const translated = context.answerLanguage !== undefined && !/^eng?(?:-|$)/iu.test(context.answerLanguage);
  if (context.renderings.length > 0 && !translated) {
    if (context.answerLanguage === undefined) context.missingDeclaration();
    problems.push(
      "caveat_renderings counts only for an answer not in English: give answer_language (such as fr or es), or " +
        "state each caveat as written."
    );
  }
  const renderingOf = new Map(translated
    ? context.renderings.map(({ caveat, text }) => [caveatForm(caveat), text] as const)
    : []);
  const unlinked: string[] = [];
  const missingCaveats = context.caveats.filter((caveat) => {
    if (statesCaveat(blocks, caveat)) return false;
    const rendering = renderingOf.get(caveatForm(caveat));
    if (rendering === undefined) return true;
    const links = linksIn(rendering);
    if ([...linksIn(caveat)].some((link) => !links.has(link))) {
      unlinked.push(caveat);
      return false;
    }
    return !statesCaveat(blocks, rendering);
  });
  if (unlinked.length > 0) {
    problems.push(
      `caveat_renderings drops the link(s) of ${unlinked.length === 1 ? "this caveat" : "these caveats"}; keep each ` +
        `link: ${unlinked.map((caveat) => `"${caveat}"`).join(" ")}`
    );
  }
  if (missingCaveats.length > 0) {
    problems.push(
      `The answer leaves out ${missingCaveats.length === 1 ? "this caveat" : "these caveats"}; include each as its ` +
        "own sentence, as written (a link's text may change), or, in an answer not in English, in the answer's " +
        "language with the same links, given in caveat_renderings: " +
        missingCaveats.map((caveat) => `"${caveat}"`).join(" ")
    );
  }
  return problems;
}

/**
 * Where a term occurs in normalized text. In scripts with letter case, which
 * separate words with spaces, an occurrence is a whole word, so "alt" is not
 * found inside "although"; elsewhere, an exact match anywhere counts.
 */
function termOccurrences(text: string, term: string): number[] {
  const characters = Array.from(term);
  const cased = (character: string | undefined): boolean =>
    character !== undefined && character.toLowerCase() !== character.toUpperCase();
  const wordCharacter = /[\p{L}\p{N}\p{M}]/u;
  const boundedStart = cased(characters[0]);
  const boundedEnd = cased(characters.at(-1));
  const found: number[] = [];
  if (term === "") return found;
  for (let index = text.indexOf(term); index >= 0; index = text.indexOf(term, index + 1)) {
    const before = /.$/su.exec(text.slice(Math.max(0, index - 2), index))?.[0];
    const after = /^./su.exec(text.slice(index + term.length, index + term.length + 2))?.[0];
    if (boundedStart && before !== undefined && wordCharacter.test(before)) continue;
    if (boundedEnd && after !== undefined && wordCharacter.test(after)) continue;
    found.push(index);
  }
  return found;
}

/**
 * Where the answer shows a quote: the displayed blocks (paragraphs, list
 * items, headings) that contain it, compared as caveats are, with a link
 * matched by its target or by its text. Exact and the same in any language.
 */
function quoteLocator(shownBlocks: readonly string[]): (quote: string) => number[] {
  const quoteBlocks = shownBlocks.map((block) => ({
    targets: caveatText(linkTargets(block)),
    text: caveatText(visibleText(block))
  }));
  return (quote: string): number[] => {
    const byTarget = quoteForm(quote.replace(MARKDOWN_LINK, "$1"));
    const byText = quoteForm(quote.replace(MARKDOWN_LINK_TEXT, "$1"));
    if (!/[\p{L}\p{N}]/u.test(byTarget)) return [];
    return quoteBlocks.flatMap(({ targets, text }, index) =>
      targets.includes(byTarget) || text.includes(byText) ? [index] : []);
  };
}

/** Meaning belongs to the reader; this gate compares only shown and declared text. */
function checkSecondReading(input: FinalizeResearchInput | undefined, reading: FinalizeResearchOptions["secondReading"],
  nextSteps: string[]): FinalizeResearchOutput["second_reading"] {
  if (reading === undefined) return undefined;
  if (reading.status === "skipped") return { status: "skipped", reason: reading.reason, findings: 0, open: 0, dismissed: 0 };
  const labels = {
    safety_claims: "a harm or safety statement",
    key_terms: "a specialized term the answer relies on",
    scale_results: "a scale or questionnaire result"
  };
  const showing = quoteLocator(displayedProse(input?.answer_draft ?? ""));
  const findings = reading.findings.filter(({ kind, quote }) => Object.hasOwn(labels, kind) && showing(quote).length > 0);
  const forms = (quote: string) => [quoteForm(quote.replace(MARKDOWN_LINK, "$1")),
    quoteForm(quote.replace(MARKDOWN_LINK_TEXT, "$1"))];
  const dismissedQuotes = (input?.reader_dismissed ?? []).map(({ quote }) => forms(quote));
  let open = 0;
  let dismissed = 0;
  for (const { kind, quote } of findings) {
    const normalized = forms(quote);
    if (dismissedQuotes.some((other) => normalized.some((text, i) => text === other[i]))) {
      dismissed += 1;
      continue;
    }
    const covered = kind === "key_terms"
      ? (input?.key_terms ?? []).some(({ term }) => normalized.some((text, i) =>
        termOccurrences(text, forms(term)[i]!).length > 0))
      : (input?.[kind] ?? []).some((declared) => forms(declared.quote).some((text, i) =>
        text.length > 0 && (text.includes(normalized[i]!) || normalized[i]!.includes(text))));
    if (covered) continue;
    open += 1;
    nextSteps.push(`A second reading found a sentence that looks like ${labels[kind]} not in the declarations: ${JSON.stringify(quote)}. Declare it in ${kind}, or list it in reader_dismissed with a one-line reason.`);
  }
  return { status: "ran", findings: findings.length, open, dismissed };
}

type FindingsCardCheck = FinalizeResearchOutput["findings_card"];

const noFindingsCard = (): FindingsCardCheck => ({ status: "absent", problems: [] });

const closedFindingsLibrary = (): FindingsCardCheck => ({
  status: "closed",
  problems: ["AskRigor's findings library is not open yet, so the card was not checked or saved."]
});

const privateFindings = (): FindingsCardCheck => ({ status: "private", problems: [] });

/** Whether this call's research account has the findings library open: saved (free) or offered (paid private). */
const findingsOpen = (options: FinalizeResearchOptions): boolean =>
  options.findings === "save" || options.findings === "offer";

// What a privacy problem is, as the card's problem names it.
const FINDINGS_PRIVACY_PROBLEMS: Readonly<Record<FindingsPrivacyReason, string>> = {
  secret_like_data: "something shaped like a key or token",
  direct_identifier: "contact details, an address or a number shaped like a phone number",
  personal_narrative: "a first-person health story, or a personal age or date",
  raw_conversation: "lines of a chat transcript",
  unsafe_url: "a link to a page other than a study's or a video's",
  quoted_material: "a long quotation",
  control_or_markup: "markup, a link to a page other than a study's or a video's, or a line break",
  prompt_injection_like_text: "wording that reads like instructions to a tool",
  not_a_source_identifier: "something other than a DOI, PMID, PMCID, NCT id or YouTube video id"
};

/**
 * Checks a findings card against this call. Each finding's sentence must be
 * shown in the answer (the answer_quotes check, exact and the same in any
 * language); each source must be one this call verified; a full_text_read or
 * community_checked tag must rest on a source of that kind; and the card must
 * pass the privacy screen its save runs. Whether a sentence states its
 * finding, and the other tags, are the model's declarations, which the owner
 * reviews before accepting a card.
 */
function findingsCardCheck(
  card: FindingsCard,
  context: {
    shown: (quote: string) => boolean;
    verified: (source: string) => boolean;
    studyAudited: (source: string) => boolean;
    videoAudited: (source: string) => boolean;
  }
): FindingsCardCheck {
  const problems: string[] = [];
  card.findings.forEach((finding, index) => {
    const at = `findings_card.findings[${index}]`;
    if (!context.shown(finding.answer_quote)) {
      problems.push(
        `${at}.answer_quote gives text the answer does not show: copy the sentence that states this finding exactly ` +
          "from answer_draft, from one paragraph or list item."
      );
    }
    const unverified = finding.sources.filter((source) => !context.verified(source));
    if (unverified.length > 0) {
      problems.push(
        `${at}.sources lists ${unverified.join(", ")}, which this call did not verify: cite key sources validated or ` +
          "read as leads here, by DOI, PMID or PMCID, and videos audited here, by video ID."
      );
    }
    if (finding.tags.includes("full_text_read") && !finding.sources.some(context.studyAudited)) {
      problems.push(`${at} is tagged full_text_read, but none of its sources was read with a full-text method audit here.`);
    }
    if (finding.tags.includes("community_checked") && !finding.sources.some(context.videoAudited)) {
      problems.push(`${at} is tagged community_checked, but none of its sources is a video whose comments were audited here.`);
    }
    if (new Set(finding.tags).size < finding.tags.length) problems.push(`${at}.tags lists a tag more than once.`);
  });
  // A source that is not an identifier is already unverified above.
  for (const { field, reasonCode } of screenFindingsCard(card)) {
    if (reasonCode === "not_a_source_identifier") continue;
    problems.push(
      `findings_card.${field} looks like it holds ${FINDINGS_PRIVACY_PROBLEMS[reasonCode]}: rewrite it in general ` +
        "terms. The check is automatic and reads English, so if a numeral or an abbreviation tripped it, word that " +
        "differently (for answer_quote, in the answer too)."
    );
  }
  return problems.length === 0 ? { status: "checked", problems: [] } : { status: "rejected", problems };
}

// Bounded and closed to brackets and parentheses, so a long draft is read in linear time.
const MARKDOWN_LINK = /\[[^[\]\n]{0,500}\]\(([^\s()[\]]{1,2048})\)/gu;
// The same link, by its text.
const MARKDOWN_LINK_TEXT = /\[([^[\]\n]{0,500})\]\([^\s()[\]]{1,2048}\)/gu;

/** A caveat as the check compares it: a link by its target, so its text may change. */
const caveatForm = (caveat: string): string => caveatText(caveat.replace(MARKDOWN_LINK, "$1"));

// Quotation marks a quote may come wrapped in, in any script's style.
const QUOTE_MARK = /["'\p{Pi}\p{Pf}]/u;
const SENTENCE_MARK = /\p{STerm}/u;

/**
 * A quote as the answer check compares it: as a caveat is, without the
 * quotation marks around it or its closing sentence mark. It is read from
 * each end, so its length bounds the work.
 */
function quoteForm(quote: string, fold: (text: string) => string = caveatText): string {
  const text = fold(quote);
  let start = 0;
  let end = text.length;
  while (start < end && QUOTE_MARK.test(text.charAt(start))) start += 1;
  while (end > start && (QUOTE_MARK.test(text.charAt(end - 1)) || SENTENCE_MARK.test(text.charAt(end - 1)) ||
    text.charAt(end - 1) === " ")) end -= 1;
  return text.slice(start, end).trim();
}

/** The pages a text links to, compared as two links to one page are. */
const linksIn = (text: string): Set<string> =>
  new Set([...text.replace(MARKDOWN_LINK, " $1 ").matchAll(LINKED_URL)].map(([url]) => comparableUrl(url)));

/** Text as the caveat check compares it: Unicode composition, quotes, dashes, emphasis, spacing and case ignored. */
function caveatText(text: string): string {
  return casedCaveatText(text).toLowerCase();
}

/** caveatText with case kept, for a term written in capitals. */
function casedCaveatText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u2018\u2019\u02BC]/gu, "'")
    .replace(/[\u201C\u201D]/gu, "\"")
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/[*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Whether a caveat stands as a sentence of its own: it begins a block or
 * follows a sentence's end, and ends its sentence. Embedded ("It is false
 * that …"), quoted or continued, it is not stated. A sentence ends with
 * Unicode's sentence-ending punctuation, so "。", "؟" and "।" end one too, with
 * or without a space after it; in a script that ends sentences without
 * punctuation, a caveat stands alone only as its own paragraph or list item.
 */
function statesCaveat(blocks: readonly string[], caveat: string): boolean {
  const core = caveatForm(caveat).replace(/\p{STerm}$/u, "");
  // A rendering of marks alone states nothing, and an empty one would match everywhere.
  if (!/[\p{L}\p{N}]/u.test(core)) return false;
  return blocks.some((block) => {
    for (let at = block.indexOf(core); at >= 0; at = block.indexOf(core, at + 1)) {
      const before = block.slice(Math.max(0, at - 2), at);
      const after = block.charAt(at + core.length);
      if ((at === 0 || /\p{STerm} ?$/u.test(before)) && (after === "" || /\p{STerm}/u.test(after))) return true;
    }
    return false;
  });
}

const videoLink = (video: string, text: string): string => `[${text}](https://www.youtube.com/watch?v=${video})`;

/**
 * The one caveat for the key studies read only as leads, each linked by its
 * identifier, so several leads read as one sentence rather than a run of
 * identical ones.
 */
function unreadStudiesCaveats(studies: ReadonlyMap<string, string | undefined>): string[] {
  // A DOI may contain parentheses, which would end a Markdown link.
  const link = (id: string) => `[this study](${isDoi(id)
    ? `https://doi.org/${id.replace(/\(/gu, "%28").replace(/\)/gu, "%29")}`
    : isPmid(id) ? `https://pubmed.ncbi.nlm.nih.gov/${id}/` : `https://www.ncbi.nlm.nih.gov/pmc/articles/${id}/`})`;
  // Studies whose lead receipt signed the same reason share one sentence, which
  // says what stopped the reading: a public copy read only in part is not one
  // that was unavailable (the 2026-10-15 owner regressions).
  const groups = new Map<string, string[]>();
  for (const [id, state] of studies) {
    const reason = state !== undefined && Object.hasOwn(UNREAD_STUDY_REASONS, state) ? state : "UNAVAILABLE";
    groups.set(reason, [...groups.get(reason) ?? [], link(id)]);
  }
  return [...groups].map(([reason, links]) => {
    const [one, several] = UNREAD_STUDY_REASONS[reason]!;
    const listed = links.length === 1 ? links[0]! : `${links.slice(0, -1).join(", ")} and ${links.at(-1)}`;
    return links.length === 1
      ? `${one.replace("{links}", () => listed)}, so its methods were not checked.`
      : `${several.replace("{links}", () => listed)}, so their methods were not checked.`;
  });
}

// What stopped a key study's full text from being read, as its lead receipt
// signed it, for one study and for several.
const UNREAD_STUDY_REASONS: Readonly<Record<string, readonly [string, string]>> = {
  ROUTE_FAILED: [
    "AskRigor could not fetch the full text of {links} because a full-text service kept failing",
    "AskRigor could not fetch the full texts of {links} because full-text services kept failing"
  ],
  UNAVAILABLE: ["The full text of {links} was not openly available", "The full texts of {links} were not openly available"],
  NO_DOI: [
    "AskRigor could not fetch the full text of {links}, which PubMed lists without a DOI",
    "AskRigor could not fetch the full texts of {links}, which PubMed lists without DOIs"
  ],
  ABSTRACT_ONLY: ["Only the abstract of {links} was readable", "Only the abstracts of {links} were readable"],
  PARTIAL_TEXT_READABLE: ["AskRigor could read only part of {links}", "AskRigor could read only part of {links}"],
  CANDIDATE_FOUND_FETCH_BLOCKED: [
    "A public copy of {links} was found, but AskRigor could not fetch it",
    "Public copies of {links} were found, but AskRigor could not fetch them"
  ],
  IDENTITY_MISMATCH: [
    "No copy of {links} could be verified as the same paper",
    "No copies of {links} could be verified as the same papers"
  ]
};

/** Text without surrounding spaces or a closing sentence mark or semicolon, spaces made single. */
function withoutEndPunctuation(text: string): string {
  let result = text.replace(/\s+/gu, " ").trim();
  for (let shorter = result.replace(/[\p{STerm};]$/u, "").trimEnd(); shorter !== result;
    shorter = result.replace(/[\p{STerm};]$/u, "").trimEnd()) {
    result = shorter;
  }
  return result;
}

const asSentence = (text: string): string => {
  const trimmed = text.trim();
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /\p{STerm}$/u.test(capitalized) ? capitalized : `${capitalized}.`;
};

// What another pass would take carries a number in digits, of any script; its
// unit, in the answer's language, is the model's to give.
const PASS_COST_NUMBER = /\p{Nd}/u;

// Links as the answer shows them: a link's destination or a bare URL.
const LINKED_URL = /https?:\/\/[^\s<>()]+/giu;

/**
 * Structural check of one displayed link: its path contains the study's DOI or has its PMID or PMCID as a segment,
 * or it is a page AskRigor's receipts tied to the study, compared as thread links are.
 */
function keyStudyLinked(link: string, identifiers: readonly string[], pages: ReadonlyMap<string, string>): boolean {
  if (pages.has(comparableUrl(link))) return true;
  let path: string;
  try { path = decodeURIComponent(new globalThis.URL(link).pathname).toLowerCase(); }
  catch { return false; }
  return identifiers.some((id) => isDoi(id)
    ? path.includes(id.toLowerCase())
    : path.split("/").some((part) => part.replace(/[.,;:!?]+$/u, "") === id.toLowerCase()));
}

/** Whether a link's path or query names a DOI, so names its own paper. */
function linkNamesDoi(link: string): boolean {
  try {
    const url = new globalThis.URL(link);
    return /10\.\d{4,9}\//u.test(decodeURIComponent(`${url.pathname}${url.search}`));
  } catch {
    return false;
  }
}

// Receipts that tie one paper's identifiers, and sometimes a page, together (see PaperLinks).
const PAPER_TIE_KINDS: ReadonlySet<string> = new Set([
  "pubmed_record", "doi_resolution", "full_text_read", "study_audit", "review_audit"
]);

/** One paper's identifiers and pages across receipts: each receipt joins the identifiers it names. */
class PaperLinks {
  private readonly parent = new Map<string, string>();
  // Identifier -> the pages a receipt naming it signed, by their comparable form.
  private readonly signedPages = new Map<string, Map<string, string>>();

  tie(claims: Readonly<Record<string, string | string[]>>): void {
    const ids = ["id", "doi", "pmid", "pmcid"].flatMap((key) => {
      const value = claims[key];
      if (typeof value !== "string" || value === "") return [];
      const id = normalizeIdentifier(value);
      return isDoi(id) || isPmid(id) || isPmcid(id) ? [id] : [];
    });
    if (ids.length === 0) return;
    for (const id of ids.slice(1)) this.parent.set(this.root(id), this.root(ids[0]!));
    const url = claims.url;
    if (typeof url === "string" && /^https?:\/\//iu.test(url)) {
      const pages = this.signedPages.get(ids[0]!) ?? new Map<string, string>();
      pages.set(comparableUrl(url), url);
      this.signedPages.set(ids[0]!, pages);
    }
  }

  /** Every identifier tied to this one, itself included. */
  identifiers(id: string): string[] {
    const root = this.root(id);
    return [id, ...[...this.parent.keys()].filter((other) => other !== id && this.root(other) === root)];
  }

  /** The pages receipts signed for any of these identifiers. */
  pages(ids: readonly string[]): Map<string, string> {
    return new Map(ids.flatMap((id) => [...(this.signedPages.get(id) ?? [])]));
  }

  private root(id: string): string {
    let root = id;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    if (!this.parent.has(id)) this.parent.set(id, id);
    return root;
  }
}

/**
 * The pages a next step offers for a key study: its own identifier's page, then the pages receipts tied to it,
 * then its tied PMC and PubMed pages; at most three.
 */
function keyStudyPages(id: string, identifiers: readonly string[], pages: ReadonlyMap<string, string>): string[] {
  const page = (identifier: string) => isPmid(identifier) ? `https://pubmed.ncbi.nlm.nih.gov/${identifier}/`
    : isPmcid(identifier) ? `https://pmc.ncbi.nlm.nih.gov/articles/${identifier}/`
    : `https://doi.org/${identifier}`;
  const candidates = [
    page(id),
    ...pages.values(),
    ...identifiers.filter((other) => other !== id && isPmcid(other)).map(page),
    ...identifiers.filter((other) => other !== id && isPmid(other)).map(page)
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = comparableUrl(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

/** "a", "a or b", "a, b or c". */
function listOf(items: readonly string[], conjunction: "and" | "or"): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

const REDDIT_HOST = /(?:^|\.)(?:reddit\.com|redd\.it)$/u;
// A thread, not a subreddit's front page, wiki, search or share link:
// /r/<name>/comments/<post id>, a comment permalink within it included.
const REDDIT_THREAD_PATH = /^\/r\/([A-Za-z0-9_]{2,21})\/comments\/([a-z0-9]+)(?:\/|$)/iu;
// A Reddit post by its id alone, as reddit.com/comments/<id> or redd.it/<id> link it.
const REDDIT_POST_PATH = /^\/(?:r\/[A-Za-z0-9_]{2,21}\/)?comments\/([a-z0-9]+)(?:\/|$)/iu;
const REDD_IT_POST_PATH = /^\/([a-z0-9]+)\/?$/iu;
// Query parameters that track a click or share, or pick a page, a sort order
// or a session of a discussion (phpBB's start, sid and sort keys; vBulletin's
// page and s), rather than name the discussion itself.
const NON_THREAD_PARAMETER = new RegExp("^(?:utm_\\w+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|ref|ref_src|" +
  "share_id|si|_ga|start|page|pg|offset|sid|s|phpsessid|sessionid|jsessionid|sort|order|sk|sd|st|highlight|hilit)$", "iu");
// With a thread id (phpBB's and vBulletin's t, a topic or Discuz tid), a post
// id or the forum id only locates a post in the thread or repeats where it is.
const THREAD_ID_PARAMETER = /^(?:t|topic|topicid|threadid|tid)$/iu;
const WITHIN_THREAD_PARAMETER = /^(?:p|pid|post|postid|f|fid|forum|forumid)$/iu;
// A page or post within a thread, at the end of its path: XenForo's /page-2
// and /post-123, vBulletin's /page2, a blog's /page/2.
const THREAD_PAGE_SUFFIX = /\/(?:page[-/]?\d+|post-\d+)\/?$/iu;
// A post number after a Discourse topic: /t/<slug>/<topic id>/<post number>.
const DISCOURSE_POST = /^(\/t\/[^/]+\/\d+)\/\d+\/?$/iu;

/**
 * A URL as two links to one thread compare: no scheme, subdomain prefix,
 * fragment, session, trailing slash or trailing punctuation, and no parameter
 * or path suffix that only tracks a click or picks a page, post or sort order.
 * A Reddit post is its id, which Reddit never reuses, whatever its subreddit,
 * title slug or comment permalink. Other query parameters stay: they may be
 * what names a forum's thread.
 */
function comparableUrl(url: string): string {
  const trimmed = url.trim().replace(/[.,;:!?"'*`\]]+$/u, "");
  try {
    const link = new globalThis.URL(trimmed);
    const host = link.hostname.toLowerCase().replace(/^(?:www|old|new|m|np|amp)\./u, "");
    const post = host === "redd.it"
      ? REDD_IT_POST_PATH.exec(link.pathname)?.[1]
      : /(?:^|\.)reddit\.com$/u.test(host) ? REDDIT_POST_PATH.exec(link.pathname)?.[1] : undefined;
    if (post !== undefined) return `reddit.com/comments/${post.toLowerCase()}`;
    const threadId = [...link.searchParams.keys()].some((key) => THREAD_ID_PARAMETER.test(key));
    const query = [...link.searchParams]
      .filter(([key]) => !NON_THREAD_PARAMETER.test(key) && !(threadId && WITHIN_THREAD_PARAMETER.test(key)))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const path = link.pathname.replace(/;jsessionid=[^/]*/iu, "").replace(THREAD_PAGE_SUFFIX, "")
      .replace(DISCOURSE_POST, "$1").replace(/\/+$/u, "").toLowerCase();
    return `${host}${path}${query === "" ? "" : `?${query}`}`;
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//u, "").replace(/#.*$/u, "").replace(/\/+$/u, "");
  }
}

// What the answer does with a community lane; must_report ends with it.
const YOUTUBE_LANE_INSTRUCTION = "Report this lane in the answer even if later sources dominate; if its signal is " +
  "weak, say so. Then copy the sentences that report it into community_findings.answer_quotes.";
const forumLaneInstruction = (community: string): string => `Report this lane in the answer, naming ${community} ` +
  "and linking a thread you read, even if its signal is weak. Then copy the sentences that report it into the " +
  "entry's answer_quotes.";

function communityLane(
  findings: NonNullable<FinalizeResearchInput["community_findings"]>,
  videosRead: number
): string {
  return `YouTube comments (${videosRead} video(s) read): Benefits: ${findings.benefit_reports} ` +
    `No effect: ${findings.no_effect_reports} Adverse: ${findings.adverse_reports} Creators versus commenters: ` +
    `${findings.creators_versus_commenters} Effect on the answer: ${findings.effect_on_answer} ${YOUTUBE_LANE_INSTRUCTION}`;
}

const COMMUNITY_FINDINGS = ["benefit_reports", "no_effect_reports", "adverse_reports", "effect_on_answer"] as const;
const YOUTUBE_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be)$/u;
// Community platforms whose pages live on known hosts.
const PLATFORM_HOSTS: Readonly<Record<string, { host: RegExp; label: string }>> = {
  reddit: { host: REDDIT_HOST, label: "Reddit" },
  facebook: { host: /(?:^|\.)(?:facebook\.com|fb\.com)$/u, label: "Facebook" },
  telegram: { host: /(?:^|\.)(?:t\.me|telegram\.me|telegram\.org|telegram\.dog)$/u, label: "Telegram" },
  discord: { host: /(?:^|\.)(?:discord\.com|discord\.gg|discordapp\.com)$/u, label: "Discord" }
};
// On Facebook, Telegram and Discord a community is a group, a public channel or
// a server, and this is the step when a link names none.
const COMMUNITY_LINK_STEPS: Readonly<Record<string, string>> = {
  facebook: "gives Facebook links outside a group: give the group's link (facebook.com/groups/…) and the posts " +
    "in it you read.",
  telegram: "gives Telegram links that name no channel or group: give a public channel's t.me link and the posts in " +
    "it you read, or a private group's invite (t.me/+…) as url, with the access boundary you hit.",
  discord: "gives Discord links other than a server invite: Discord servers can be read only by joining, so record " +
    "the server's invite (discord.gg/…) as url, with the access boundary you hit."
};
// Facebook's own pages under /groups/, which name no group.
const FACEBOOK_GROUP_ROUTES = new Set([
  "feed", "discover", "create", "joins", "join", "joined", "search", "category", "categories", "notifications",
  "requests", "invites", "invite", "membership", "memberships", "your_groups", "yourgroups", "saved", "manage",
  "browse", "learn", "explore", "for_sale", "buy_and_sell", "buy_sell", "sell", "games", "pending", "admin", "admins",
  "tab", "home", "suggestions", "suggested", "settings", "about", "help", "groups", "you", "all"
]);
const TELEGRAM_RESERVED_PATHS = new Set([
  "addstickers", "addemoji", "addtheme", "addlist", "share", "proxy", "socks", "setlanguage", "login", "confirmphone",
  "invoice", "boost", "giftcode", "contact", "joinchat"
]);

/**
 * The community a Facebook, Telegram or Discord link belongs to: a Facebook
 * group, a public Telegram channel, or, as the entry's own url only, a private
 * Telegram group's or a Discord server's invite, which members alone can open.
 * Undefined for the platform's other pages (help, login, a profile, a message
 * only members can open) and for other platforms.
 */
function communityOf(platform: string, url: string, thread: boolean): string | undefined {
  try {
    const link = new globalThis.URL(url);
    const host = link.hostname.toLowerCase();
    if (platform === "facebook") {
      const group = /^\/groups\/([A-Za-z0-9._-]+)(?:\/|$)/u.exec(link.pathname)?.[1]?.toLowerCase();
      return group === undefined || FACEBOOK_GROUP_ROUTES.has(group) ? undefined : `facebook.com/groups/${group}`;
    }
    if (platform === "telegram" && /(?:^|\.)(?:t\.me|telegram\.me|telegram\.dog)$/u.test(host)) {
      const invite = /^\/(?:\+|joinchat\/)([A-Za-z0-9_-]+)\/?$/u.exec(link.pathname)?.[1];
      if (invite !== undefined) return thread ? undefined : `t.me/+${invite}`;
      const channel = /^\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{4,31})(?:\/\d+)?\/?$/u.exec(link.pathname)?.[1]?.toLowerCase();
      return channel === undefined || TELEGRAM_RESERVED_PATHS.has(channel) ? undefined : `t.me/${channel}`;
    }
    if (platform === "discord" && !thread) {
      const invite = (/(?:^|\.)discord\.gg$/u.test(host) ? /^\/([A-Za-z0-9-]+)\/?$/u : /^\/invite\/([A-Za-z0-9-]+)\/?$/u)
        .exec(link.pathname)?.[1];
      return invite === undefined ? undefined : `discord.gg/${invite}`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
const SUBREDDIT_NAME = /^\/?r\/([A-Za-z0-9_]{2,21})$/u;

/** The post id of a full reddit.com thread link; undefined for short links and other pages. */
function redditPostOf(url: string): string | undefined {
  try {
    const link = new globalThis.URL(url);
    if (!/(?:^|\.)reddit\.com$/u.test(link.hostname.toLowerCase())) return undefined;
    return REDDIT_THREAD_PATH.exec(link.pathname)?.[2]?.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Whether a thread title as the model gave it is Reddit's: equal once case,
 * spacing, punctuation and a subreddit or "Reddit" tag are set aside. It
 * compares characters, so it works alike in every language; a title worded
 * differently, cut short or translated gets Reddit's own title back to use.
 */
function sameTitle(given: string, actual: string): boolean {
  const compact = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\br\/[\w-]+/gu, " ")
    .replace(/\breddit\b/gu, " ").replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
  const left = compact(given);
  const right = compact(actual);
  // Reddit gives no title, or one without letters, for some posts: nothing to compare.
  return left.length === 0 || right.length === 0 || left === right;
}

/**
 * A title from Reddit as next steps quote it: third-party text, so one line
 * without control characters or quotation marks, and at most 150 characters.
 */
function quotedTitle(title: string): string {
  const line = title.replace(/[\p{Cc}\p{Cf}"\u201C\u201D]+/gu, " ").replace(/\s+/gu, " ").trim();
  const characters = [...line];
  return characters.length > 150 ? `${characters.slice(0, 149).join("")}\u2026` : line;
}

/** The subreddit a reddit.com link is in, its front page or any page under it; undefined elsewhere. */
function subredditHomeOf(url: string): string | undefined {
  try {
    const link = new globalThis.URL(url);
    if (!/(?:^|\.)reddit\.com$/u.test(link.hostname.toLowerCase())) return undefined;
    return /^\/r\/([A-Za-z0-9_]{2,21})(?:\/|$)/u.exec(link.pathname)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

/** The subreddit a full reddit.com thread link is in; undefined for short links and other pages. */
function subredditOf(url: string): string | undefined {
  try {
    const link = new globalThis.URL(url);
    if (!/(?:^|\.)reddit\.com$/u.test(link.hostname.toLowerCase())) return undefined;
    return REDDIT_THREAD_PATH.exec(link.pathname)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

type CommunitySearch = NonNullable<FinalizeResearchInput["community_searches"]>[number];

/**
 * How one community matches across fields: its platform and its name's letters
 * and digits, lowercased, so a forum search cannot stand for the subreddit of
 * the same name. YouTube is one community however many entries name it, so two
 * YouTube entries cannot stand for independent communities.
 */
function communityKey(name: string, platform: string): string {
  return platform === "youtube"
    ? "youtube"
    : `${platform}:${name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "")}`;
}

/** The declared buyer-review lane cannot be omitted behind forum or YouTube coverage. */
interface DeclarationSteps {
  nextSteps: string[];
  requireDeclaration: (step: string) => void;
}

function commercialReviewCoverage(input: FinalizeResearchInput, out: DeclarationSteps): void {
  const applicability = input.commercial_review_applicability;
  if (applicability === undefined) {
    out.requireDeclaration(
      "State in commercial_review_applicability whether the question concerns a product or service people buy " +
        "(a supplement, consumer health product, device, app, formulation, or health service). If it does, map " +
        "where its buyers review it and read those reviews as a community lane of their own (HRP PrincipalPlatformMapping)."
    );
    return;
  }
  const sites = (input.principal_communities ?? []).filter(({ platform }) => platform === "review_site");
  const searches = (input.community_searches ?? []).filter(({ platform }) => platform === "review_site");
  if (applicability.status === "not_applicable") {
    if (applicability.reason === undefined) {
      out.requireDeclaration(
        "Give reason in commercial_review_applicability when status is not_applicable: why no product or service " +
          "people buy is involved."
      );
    }
    if (sites.length > 0 || searches.length > 0) {
      out.nextSteps.push(
        "commercial_review_applicability is not_applicable, but principal_communities or community_searches lists " +
          "platform review_site: change the declaration or the review-site entry so they agree."
      );
    }
    return;
  }
  if (applicability.products === undefined) {
    out.requireDeclaration(
      "Give products in commercial_review_applicability when status is required: the products or services " +
        "concerned, each exact product and variant when the user named one; for an ingredient, the product forms " +
        "people buy."
    );
    return;
  }
  if (sites.length === 0) {
    out.requireDeclaration(
      `Map where buyers review ${applicability.products.join(", ")} in principal_communities as platform ` +
        "review_site, the main one in the user's country and language first; no single retailer is required. " +
        "A forum, Reddit or YouTube does not stand in for buyer reviews (HRP PrincipalPlatformMapping)."
    );
    return;
  }
  const searched = new Set(searches.map(({ community, platform }) => communityKey(community, platform)));
  const mapped = new Map(sites.map(({ name, platform }) => [communityKey(name, platform), name]));
  // A buyer-review search must belong to a mapped site; the existing coverage
  // rules still determine which other mapped communities must be searched.
  if ([...mapped.keys()].some((key) => searched.has(key))) return;
  for (const name of mapped.values()) {
    out.requireDeclaration(
      `Search ${name} and record it in community_searches under platform review_site: the reviews read, with ` +
        "review_corpora (each product, the reviews shown and read, and how they were chosen), or the access_boundary " +
        "that stopped the search."
    );
  }
  // communityCoverage checks matching searches' threads, corpora and access boundaries,
  // and requires the existing boundary and partial-selection limits, including for review_site.
}

/** Exact consistency checks of declarations; no web or semantic inference occurs here. */
function productIdentityDeclarations(
  input: FinalizeResearchInput,
  rounds: readonly VerifiedReceipt[],
  verified: readonly VerifiedReceipt[],
  out: DeclarationSteps & { requireLimit: (limit: string, ...caveats: string[]) => void; mustReport: string[] }
): void {
  const applicability = input.commercial_review_applicability;
  if (applicability?.status === "required" && input.community_findings !== undefined) {
    const corpora = input.community_findings.product_corpora;
    if (corpora === undefined) {
      out.requireDeclaration("Give community_findings.product_corpora: one entry per listed product, its admitted video_ids and exact_product_signal, with variant_unresolved_signal when present.");
    } else {
      const products = applicability.products ?? [];
      const labels = corpora.map(({ product }) => normalizeProductName(product));
      if (labels.length !== products.length || new Set(labels).size !== labels.length ||
          products.some((product) => !labels.includes(normalizeProductName(product)))) {
        out.nextSteps.push("community_findings.product_corpora needs exactly one entry for each commercial_review_applicability product, with the same product label.");
      }
      const receipts = [...rounds.filter(({ kind }) => kind === "youtube_community_audit"),
        ...verified.filter(({ kind }) => kind === "youtube_video_audit")];
      for (const corpus of corpora) {
        const uncovered = corpus.video_ids.filter((video) => !receipts.some(({ claims }) => {
          const product = text(claims.product);
          return product !== "" && (productNameOccurs(product, corpus.product) ||
            ([...product].length === 80 && normalizeProductName(corpus.product).includes(product))) &&
            ["exact", "variant_unresolved", "mixed_variants"].some((productClass) => list(claims[productClass]).includes(video)) &&
            (list(claims.videos).includes(video) || text(claims.video) === video);
        }));
        if (uncovered.length > 0) {
          out.nextSteps.push(`The product corpus for ${corpus.product} lists ${uncovered.join(", ")} without a comment-audit receipt for that product that admitted those videos; rerun audit_youtube_video_community for that product or remove them from the corpus.`);
        }
        const unreviewed = corpus.video_ids.filter((video) => !input.community_findings!.videos_reviewed.includes(video));
        if (unreviewed.length > 0) out.nextSteps.push(`The product corpus for ${corpus.product} lists ${unreviewed.join(", ")} outside community_findings.videos_reviewed; make the declarations agree.`);
        out.mustReport.push(`${corpus.product}: Exact product signal: ${corpus.exact_product_signal}` +
          (corpus.variant_unresolved_signal === undefined ? "" : ` Variant unresolved signal: ${corpus.variant_unresolved_signal}`));
      }
    }
  }
  for (const search of input.community_searches ?? []) {
    for (const corpus of search.review_corpora ?? []) {
      const counts = corpus.item_identity;
      if (counts === undefined) {
        out.requireDeclaration(`Give item_identity for ${corpus.product} in ${search.community}: exact_product, variant_unresolved and other_variant_excluded counts, adding up to reviews_read.`);
      } else if (counts.exact_product + counts.variant_unresolved + counts.other_variant_excluded !== corpus.reviews_read) {
        out.nextSteps.push(`item_identity for ${corpus.product} in ${search.community} does not add up to reviews_read; count every review in exactly one identity class.`);
      } else {
        out.mustReport.push(`${search.community}, ${corpus.product}: ${counts.exact_product} exact-product review(s), ${counts.variant_unresolved} variant-unresolved review(s), ${counts.other_variant_excluded} other-variant review(s) excluded.`);
      }
      const outcomeSearch = corpus.outcome_search;
      const boundary = corpus.outcome_search_boundary;
      if (outcomeSearch === undefined && boundary === undefined) {
        out.requireDeclaration(`Give outcome_search or outcome_search_boundary for ${corpus.product} in ${search.community}: the searches run within the review text for the outcome and their directions, or why that search could not run.`);
      } else if (outcomeSearch !== undefined && boundary !== undefined) {
        out.nextSteps.push(`Give exactly one of outcome_search or outcome_search_boundary for ${corpus.product} in ${search.community}, so the declarations agree.`);
      }
      if (outcomeSearch !== undefined) {
        const directions = outcomeSearch.directions;
        const missing = [
          ...(directions.includes("benefit") ? [] : ["benefit"]),
          ...(directions.includes("no_effect") ? [] : ["no_effect"]),
          ...(directions.includes("worse") || directions.includes("adverse") ? [] : ["worse or adverse"])
        ];
        if (missing.length > 0) {
          out.nextSteps.push(`outcome_search.directions for ${corpus.product} in ${search.community} is missing ${missing.join(", ")}; record searches for each missing direction.`);
        }
        // The community's own caveat already says AskRigor could not verify its searches; no second limit here.
      }
      if (boundary !== undefined || (outcomeSearch === undefined && PARTIAL_REVIEW_SELECTIONS.has(corpus.selection))) {
        const preview = `On ${search.community}, the reviews of ${corpus.product} could not be searched for the outcome, so the ${corpus.reviews_read} read are a preview, not a measure of how often it helps or harms.`;
        out.requireLimit(preview, preview);
      }
      out.mustReport.push(`${search.community}, ${corpus.product}: ` +
        (corpus.ratings_shown === undefined ? "" : `${corpus.ratings_shown} star ratings shown; `) +
        (corpus.reviews_shown === undefined ? "written reviews shown: not given; " : `${corpus.reviews_shown} written reviews shown; `) +
        `${corpus.reviews_read} reviews read; selection ${corpus.selection}; ` +
        (outcomeSearch === undefined ? `outcome-search boundary: ${boundary ?? "not given"}.`
          : `outcome-search directions: ${outcomeSearch.directions.join(", ")}.`));
    }
  }
  const intervention = input.intervention_identity;
  // Every answer resting on key studies says what each study actually tested (owner question 47).
  if (input.key_sources.length > 0 && intervention === undefined) {
    out.requireDeclaration("Give intervention_identity for the key studies: not_applicable with a reason, or checked with the coded, branded, combination or multi-ingredient interventions (including co-administered drugs) and their whole-intervention identities.");
  }
  if (intervention?.status === "not_applicable") {
    if (intervention.reason === undefined) out.requireDeclaration("Give a reason for intervention_identity not_applicable.");
    if (intervention.interventions !== undefined) out.nextSteps.push("intervention_identity not_applicable cannot list interventions; make the declaration agree.");
  } else if (intervention?.status === "checked") {
    if (intervention.interventions === undefined) out.requireDeclaration("Give interventions for intervention_identity checked, with study_ids, label and resolved or unresolved status.");
    const sources = new Set(input.key_sources.map(({ id }) => normalizeIdentifier(id)));
    for (const entry of intervention.interventions ?? []) {
      if (entry.study_ids.some((id) => !sources.has(normalizeIdentifier(id)))) {
        out.nextSteps.push(`intervention_identity for ${entry.label} lists study_ids outside key_sources; make the source declarations agree.`);
      }
      if (entry.status === "resolved" && entry.identity === undefined) {
        out.requireDeclaration(`Give the resolved identity for ${entry.label}: registry_code, sponsor_or_maker and current_product.`);
      } else if (entry.status === "unresolved") {
        if (entry.identity !== undefined) out.nextSteps.push(`The unresolved intervention ${entry.label} cannot also declare a resolved identity.`);
        out.requireLimit(`The intervention ${entry.label} has not been traced to a current product.`,
          `The exact product tested in ${entry.label} was not traced to a current product, so this answer does not present it as something to buy.`);
      }
    }
  }
  const shopping = input.shopping;
  if (applicability?.status === "required" && shopping === undefined) {
    out.requireDeclaration("Give shopping: not_requested with no offers, buy_options for a destination, or no_live_option_found after at least three distinct international routes.");
  }
  if (shopping === undefined) return;
  if (shopping.status === "not_requested") {
    if ((shopping.offers?.length ?? 0) > 0) out.nextSteps.push("shopping not_requested cannot list offers.");
    return;
  }
  if (shopping.destination === undefined) out.requireDeclaration("Give the destination for shopping buy_options or no_live_option_found.");
  const offers = shopping.offers ?? [];
  if (shopping.status === "buy_options" && !offers.some(({ role }) => role === "buy_option")) {
    out.requireDeclaration("shopping buy_options needs at least one buy_option offer.");
  }
  const links = new Set(input.answer_draft === undefined ? [] : displayedProse(input.answer_draft)
    .flatMap((block) => [...linkTargets(block).matchAll(LINKED_URL)].map(([url]) => comparableUrl(url))));
  for (const offer of offers) {
    if (offer.role !== "buy_option") continue;
    if (offer.offer_state !== "live_destination_orderable") {
      out.nextSteps.push(`The buy option for ${offer.product} is ${offer.offer_state}; a buy_option for ${shopping.destination ?? "the destination"} must be live_destination_orderable.`);
    }
    if (input.answer_draft !== undefined && !links.has(comparableUrl(offer.url))) {
      out.nextSteps.push(`The buy option for ${offer.product} is missing from answer_draft; include its link ${offer.url}.`);
    }
  }
  if (shopping.status === "no_live_option_found") {
    if (offers.some(({ role }) => role === "buy_option")) out.nextSteps.push("shopping no_live_option_found cannot list buy options.");
    if (new Set(shopping.routes_searched ?? []).size < 3) {
      out.requireDeclaration("shopping no_live_option_found needs at least three distinct routes_searched: international_storefronts, marketplaces, exporters, specialist_sellers or secondary_marketplaces.");
    }
    if (shopping.destination !== undefined) {
      for (const product of applicability?.products ?? []) out.requireLimit(`No live destination offer was found for ${product}.`,
        `No seller with a live offer for ${shopping.destination} was found for ${product}.`);
    }
  }
}

/** A community read beyond YouTube, as the answer check needs it. */
interface CommunityRead {
  name: string;
  platform: string;
  urls: string[];
  // The answer's sentences that report each finding, one set per entry that gave them.
  quotes: Array<Readonly<Record<string, string>>>;
  // Reddit confirmed every thread listed for it: in its subreddit, under its title.
  confirmed: boolean;
}

/**
 * The discussion pool a thread link is in: its host without "www." or a mobile
 * or alternate front end ("m.facebook.com" is facebook.com), and on Facebook
 * the group, by the id in its link.
 */
function siteOf(url: string): string {
  try {
    const link = new globalThis.URL(url);
    let host = link.hostname.toLowerCase().replace(/^(?:(?:www|m|mobile|mbasic|touch|web|amp)\.)+/u, "");
    if (host === "fb.com") host = "facebook.com";
    const group = /^\/groups\/([^/]+)/u.exec(link.pathname)?.[1];
    return host === "facebook.com" && group !== undefined ? `${host}/groups/${group.toLowerCase()}` : host;
  } catch {
    return "";
  }
}

function hostOf(url: string): string {
  try {
    // URL in this module is the link pattern, so the constructor comes from globalThis.
    return new globalThis.URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function boundaryCaveat(name: string, boundary: NonNullable<CommunitySearch["access_boundary"]>): string {
  switch (boundary) {
    case "no_web_search": return `I could not search ${name} from this app, so reports there are not included.`;
    case "login_required": return `${name} needs a login to read, so reports there are not included.`;
    case "blocked": return `${name} blocked access, so reports there are not included.`;
    case "retrieval_failed": return `Pages from ${name} could not be retrieved, so reports there are not included.`;
    case "no_relevant_results": return `A search of ${name} turned up no relevant reports.`;
  }
}

function forumLane(search: CommunitySearch): string {
  const read = search.review_corpora === undefined
    ? `${search.threads_read.length} thread(s) read`
    : search.review_corpora.map(({ product, reviews_read }) => `${reviews_read} review(s) of ${product} read`).join("; ");
  return `${search.community} (${read}): Benefits: ${search.benefit_reports} ` +
    `No effect: ${search.no_effect_reports} Adverse: ${search.adverse_reports} Effect on the answer: ` +
    `${search.effect_on_answer} ${forumLaneInstruction(search.community)}`;
}

function comparableDoses(
  a: { dose: number | null; unit: string | null },
  b: { dose: number | null; unit: string | null }
): boolean {
  if (a.dose === null || b.dose === null || a.unit === null || b.unit === null) return false;
  const unitA = a.unit.trim().toLowerCase();
  const unitB = b.unit.trim().toLowerCase();
  if (unitA === unitB && a.dose === b.dose) return true;
  const milligrams = new Map([["g", 1_000], ["mg", 1], ["mcg", 0.001], ["µg", 0.001], ["μg", 0.001], ["ug", 0.001]]);
  const factorA = milligrams.get(unitA);
  const factorB = milligrams.get(unitB);
  if (factorA === undefined || factorB === undefined) return false;
  // Scale first so conversion to milligrams cannot overflow for a finite dose.
  const scale = Math.max(a.dose, b.dose);
  if (scale === 0) return true;
  const mgA = a.dose / scale * factorA;
  const mgB = b.dose / scale * factorB;
  return Math.abs(mgA - mgB) / Math.max(mgA, mgB) < 1e-9;
}

/**
 * The community lane beyond YouTube (HRP PrincipalPlatformMapping,
 * MultipleIndependentCommunities, ActualSearchRequired). A YouTube receipt
 * covers YouTube only: research that audited YouTube but never searched where
 * people mostly talk, such as Reddit or a specialist forum, is not done (owner
 * report, 2026-09-29). Those searches run on the client's own web search, so
 * the model records them here. Returns the communities counted as searched.
 */
function communityCoverage(
  input: FinalizeResearchInput,
  youtubeResearched: boolean,
  out: DeclarationSteps & { requireLimit: (text: string, ...sentences: string[]) => void; lanes: string[] },
  redditThreads?: ReadonlyMap<string, RedditThreadCheck>
): { searched: string[]; read: CommunityRead[]; unverified: number } {
  const communities = input.principal_communities;
  // Communities read, one entry per community however many searches it had.
  const readByKey = new Map<string, CommunityRead>();
  // Each thread counts for one community only, so one search cannot pass as two.
  const threadOwners = new Map<string, string>();
  if (communities === undefined) {
    out.requireDeclaration(
      "Name where people discussing this actually talk in principal_communities, the dominant first (subreddits, " +
        "specialist forums, Facebook groups, patient organizations, YouTube). Then search the dominant one and at " +
        "least one independent one: YouTube with its tools, the others with your own web search, recorded in " +
        "community_searches."
    );
    return { searched: [], read: [], unverified: 0 };
  }
  // Key -> name as given.
  const searched = new Map<string, string>();
  // One site is one discussion pool, whatever its entries are called: outside
  // Reddit, a community's identity is the site its threads are on (HRP
  // MultipleIndependentCommunities: stable source identifiers, not names).
  const siteOwners = new Map<string, string>();
  if (youtubeResearched) {
    searched.set("youtube", communities.find(({ platform }) => platform === "youtube")?.name ?? "YouTube");
  }
  for (const search of input.community_searches ?? []) {
    const name = search.community;
    if (search.platform === "review_site" && search.report_identity !== undefined) {
      out.nextSteps.push(
        `community_searches for ${name} gives report_identity, which is for threads outside review sites: review sites use review_corpora.`
      );
    }
    // Thread links and the community's own address are checked alike.
    const links = [...search.threads_read.map(({ url }) => url), ...(search.url === undefined ? [] : [search.url])];
    const hosts = links.map(hostOf);
    if (hosts.some((host) => YOUTUBE_HOST.test(host))) {
      out.nextSteps.push(`community_searches for ${name} lists YouTube links; research YouTube with its own tools.`);
      continue;
    }
    // A platform with its own hosts links only there, and its hosts' links belong to it.
    const own = PLATFORM_HOSTS[search.platform];
    if (own !== undefined && hosts.some((host) => !own.host.test(host))) {
      out.nextSteps.push(search.platform === "reddit"
        ? `community_searches for ${name} is on Reddit but lists links elsewhere; list the Reddit threads you read.`
        : `community_searches for ${name} is on ${own.label} but lists links elsewhere; give the ${own.label} links ` +
          "of the community and the posts you read.");
      continue;
    }
    const foreign = Object.entries(PLATFORM_HOSTS)
      .find(([platform, { host }]) => platform !== search.platform && hosts.some((link) => host.test(link)));
    if (foreign !== undefined) {
      const [platform, { label }] = foreign;
      out.nextSteps.push(platform === "reddit"
        ? `community_searches for ${name} lists Reddit links; record them under platform reddit, as the subreddit ` +
          "they are in."
        : `community_searches for ${name} lists ${label} links; record them under platform ${platform}.`);
      continue;
    }
    // There, a community is a group, a channel or a server, not any page of the platform.
    const community = (url: string, thread: boolean) => communityOf(search.platform, url, thread);
    const communityStep = COMMUNITY_LINK_STEPS[search.platform];
    if (communityStep !== undefined && (search.threads_read.some(({ url }) => community(url, true) === undefined) ||
      (search.url !== undefined && community(search.url, false) === undefined))) {
      out.nextSteps.push(`community_searches for ${name} ${communityStep}`);
      continue;
    }
    // A subreddit is one community: its entry names it, and its threads are in it.
    if (search.platform === "reddit") {
      const subreddit = SUBREDDIT_NAME.exec(name)?.[1]?.toLowerCase();
      if (subreddit === undefined) {
        out.nextSteps.push(`Name the Reddit community ${name} by its subreddit, as r/<name>.`);
        continue;
      }
      if (search.url !== undefined && subredditHomeOf(search.url) !== subreddit) {
        out.nextSteps.push(`community_searches for ${name} gives a url outside r/${subreddit}; give the subreddit's own link.`);
        continue;
      }
      if (search.threads_read.some(({ url }) => subredditOf(url) !== subreddit)) {
        out.nextSteps.push(
          `community_searches for ${name} lists links that are not threads in r/${subreddit}: list each thread you ` +
            `read by its full link (reddit.com/r/${subreddit}/comments/…), under its own subreddit's entry.`
        );
        continue;
      }
      // Reddit's embed endpoint says whether each thread exists, in which
      // subreddit and under which title; a lookup that failed proves nothing.
      if (redditThreads !== undefined) {
        const checks = search.threads_read.map(({ url, title }) =>
          ({ url, title, check: redditThreads.get(redditPostOf(url) ?? "") }));
        const absent = checks.filter(({ check }) => check?.state === "not_found").map(({ url }) => url);
        const elsewhere = checks.filter(({ check }) => check?.state === "found" && check.subreddit !== subreddit)
          .map(({ url }) => url);
        const retitled = checks.flatMap(({ url, title, check }) =>
          check?.state === "found" && title !== undefined && !sameTitle(title, check.title)
            ? [`${url} is "${quotedTitle(check.title)}" on Reddit`]
            : []);
        if (absent.length > 0 || elsewhere.length > 0 || retitled.length > 0) {
          if (absent.length > 0) {
            out.nextSteps.push(
              `community_searches for ${name} lists thread(s) Reddit does not have (${absent.join(", ")}): list only ` +
                "threads you read, by the links you read them at."
            );
          }
          if (elsewhere.length > 0) {
            out.nextSteps.push(
              `community_searches for ${name} lists thread(s) that Reddit files under another subreddit ` +
                `(${elsewhere.join(", ")}): list each thread under its own subreddit's entry.`
            );
          }
          if (retitled.length > 0) {
            out.nextSteps.push(
              `community_searches for ${name} gives thread title(s) that differ from Reddit's (${retitled.join("; ")}): ` +
                "check that each link is the thread you read, and give its title exactly as Reddit shows it."
            );
          }
          continue;
        }
      }
    }
    const key = communityKey(name, search.platform);
    const shared = search.threads_read.map(({ url }) => comparableUrl(url))
      .filter((thread) => (threadOwners.get(thread) ?? key) !== key);
    if (shared.length > 0) {
      out.nextSteps.push(
        `community_searches for ${name} lists a thread already listed for another community; list each thread under ` +
          "the one community it belongs to."
      );
      continue;
    }
    for (const { url } of search.threads_read) threadOwners.set(comparableUrl(url), key);
    if (search.threads_read.length === 0 && search.access_boundary === undefined) {
      out.requireDeclaration(
        `community_searches for ${name} lists no thread read: add the threads you read, or the access_boundary ` +
          "that stopped the search."
      );
      continue;
    }
    if (search.access_boundary === "no_relevant_results" && search.threads_read.length > 0) {
      out.nextSteps.push(
        `community_searches for ${name} gives both threads read and access_boundary no_relevant_results; keep one: ` +
          "the threads and what they showed, or the boundary if nothing relevant turned up."
      );
      continue;
    }
    // A review site's reviews need their counts and selection (HRP ReviewCorpusSelectionAndCounts).
    const corpora = search.review_corpora ?? [];
    if (corpora.length > 0 && search.platform !== "review_site") {
      out.nextSteps.push(
        `community_searches for ${name} gives review_corpora, which are for review sites: record the site's product ` +
          "reviews under platform review_site, or leave review_corpora out."
      );
      continue;
    }
    if (search.platform === "review_site" && search.threads_read.length > 0 && corpora.length === 0) {
      out.requireDeclaration(
        `community_searches for ${name} lists reviews read on a review site: give review_corpora, with each ` +
          "product, how many reviews the site shows, how many you read and how you chose them."
      );
      continue;
    }
    const miscounted = corpora.filter(({ reviews_shown: shown, reviews_read: read, selection }) =>
      shown !== undefined && (read > shown || (selection === "all" && read < shown)));
    if (miscounted.length > 0) {
      out.nextSteps.push(
        `community_searches for ${name} gives review counts that do not fit (${miscounted.map(({ product }) => product)
          .join(", ")}): reviews_read cannot exceed reviews_shown, and selection all means every review shown was read.`
      );
      continue;
    }
    // Outside Reddit, whose subreddit names it, a community read nowhere is
    // known by its address, never by its name alone.
    if (search.platform !== "reddit" && search.threads_read.length === 0 && search.url === undefined) {
      out.requireDeclaration(
        `community_searches for ${name} records an access boundary but no url: give the community's address (its ` +
          "forum, group or site link), so it is known by its site rather than its name."
      );
      continue;
    }
    const sites = new Set(search.platform === "reddit"
      ? []
      : [
          ...search.threads_read.map(({ url }) => community(url, true) ?? siteOf(url)),
          ...(search.url === undefined ? [] : [community(search.url, false) ?? siteOf(search.url)])
        ]);
    if (sites.size > 1) {
      out.nextSteps.push(
        `community_searches for ${name} points to more than one site (${[...sites].join(", ")}); give each site its ` +
          "own entry."
      );
      continue;
    }
    const site = [...sites][0];
    const owner = site === undefined ? undefined : siteOwners.get(site);
    if (owner !== undefined && owner !== key) {
      out.nextSteps.push(
        `community_searches for ${name} is on ${site}, as ${searched.get(owner) ?? "another entry"} is: ` +
          "one site is one discussion pool, so list its threads under one entry and search an independent community."
      );
      continue;
    }
    if (site !== undefined) siteOwners.set(site, key);
    searched.set(key, name);
    if (search.access_boundary !== undefined) {
      out.requireLimit(
        search.access_boundary === "no_relevant_results"
          ? `The search of ${name} found no relevant reports; say so.`
          : `The search of ${name} ended at an access boundary (${search.access_boundary}); say so.`,
        boundaryCaveat(name, search.access_boundary)
      );
    }
    if (search.threads_read.length === 0) continue;
    if (search.platform !== "review_site") {
      if (search.report_identity === undefined) {
        out.requireDeclaration(
          `community_searches for ${name} reads threads without report_identity: for each exposure the answer draws on, count the reports you read: firsthand use of exactly it, form not stated, something else, and advice or hearsay, with how many gave a measurement after the change.`
        );
      }
      for (const report of search.report_identity ?? []) {
        const { exposure, reports_read, firsthand_exact, exposure_unclear, other_exposure, not_firsthand, measured_after } = report;
        if (firsthand_exact + exposure_unclear + other_exposure + not_firsthand !== reports_read ||
            measured_after > firsthand_exact) {
          out.nextSteps.push(
            `report_identity for ${exposure} in ${name} does not add up: the four classes must add up to reports_read, and measured_after cannot exceed firsthand_exact.`
          );
          continue;
        }
        out.lanes.push(
          `${name}, ${exposure}: ${reports_read} report(s) read; ${firsthand_exact} firsthand report(s) of exactly this, ${measured_after} with a measurement after the change; ${exposure_unclear} that don't say which form or product, ${other_exposure} about something else and ${not_firsthand} advice or hearsay, not counted.`
        );
        if (firsthand_exact === 0) {
          out.requireLimit(
            `No one in ${name} described their own use of ${exposure}; say so.`,
            `In ${name}, no one described their own use of ${exposure}, so its reports are not evidence about it.`
          );
        }
      }
      const chosen = search.thread_selection === undefined
        ? undefined
        : PARTIAL_THREAD_SELECTIONS.get(search.thread_selection);
      if (search.thread_selection === undefined) {
        out.requireDeclaration(
          `community_searches for ${name} reads threads without thread_selection: say how they were chosen, such as ` +
            "every relevant one the searches found, the ones ranked first, or ones found by searching for outcomes."
        );
      } else if (chosen !== undefined) {
        out.requireLimit(
          `The ${name} threads you read were ${chosen}; say they show which experiences people report, not how ` +
            "common each is.",
          `The ${name} threads that I read were ${chosen}, so they show which experiences people report, not how ` +
            "common each one is."
        );
      }
    }
    for (const { product, reviews_shown: shown, reviews_read: read, selection } of corpora) {
      const chosen = PARTIAL_REVIEW_SELECTIONS.get(selection);
      if (chosen === undefined) continue;
      out.requireLimit(
        `The ${read} ${name} review(s) of ${product} you read${shown === undefined ? "" : ` (of ${shown} shown)`} ` +
          `were ${chosen}; say they show which experiences people report, not how common each is.`,
        `The ${name} reviews of ${product} that I read were ${chosen}, so they show which experiences people report, ` +
          "not how common each one is."
      );
    }
    const missing = COMMUNITY_FINDINGS.filter((field) => search[field] === undefined);
    if (missing.length > 0) {
      out.requireDeclaration(
        `Say what ${name} showed: give ${missing.join(", ")} in its community_searches entry, even if the signal is ` +
          "weak or neutral."
      );
    } else {
      out.lanes.push(forumLane(search));
      const urls = search.threads_read.map(({ url }) => url);
      const quotes = search.answer_quotes === undefined ? [] : [search.answer_quotes];
      const confirmed = search.platform === "reddit" &&
        urls.every((url) => redditThreads?.get(redditPostOf(url) ?? "")?.state === "found");
      const known = readByKey.get(key);
      if (known === undefined) {
        readByKey.set(key, { name, platform: search.platform, urls, quotes: [...quotes], confirmed });
      } else {
        known.urls.push(...urls);
        known.quotes.push(...quotes);
        known.confirmed &&= confirmed;
      }
    }
  }
  const read = [...readByKey.values()];
  // AskRigor cannot see the client's web search, so these reports carry no
  // receipt: the answer says so and links the threads, which readers can check.
  // Reddit can confirm its threads exist as cited, but not what they report.
  const unconfirmed = read.filter(({ confirmed }) => !confirmed);
  if (unconfirmed.length > 0) {
    const names = joinNames(unconfirmed.map(({ name }) => name));
    out.requireLimit(
      `The reports from ${names} come from your own web search, which AskRigor could not verify; say so, and link ` +
        "the threads you read.",
      `The reports from ${names} come from my own web search, which AskRigor could not verify.`
    );
  }
  const confirmedRead = read.filter(({ confirmed }) => confirmed);
  if (confirmedRead.length > 0) {
    const names = joinNames(confirmedRead.map(({ name }) => name));
    out.requireLimit(
      `Reddit confirmed that the ${names} threads you cite exist there as cited, but AskRigor could not check what ` +
        "they report; say so, and link the threads you read.",
      `Reddit confirms that the ${names} threads linked here exist, but what they report is my own reading, which ` +
        "AskRigor could not verify."
    );
  }
  const dominant = communities[0]!;
  const named = new Set<string>();
  for (const { name, platform, named_by_user } of communities) {
    const key = communityKey(name, platform);
    if (named_by_user === true && platform !== "youtube" && !searched.has(key) && !named.has(key)) {
      named.add(key);
      out.requireDeclaration(
        `The user named ${name}: search it with your web search and record it in community_searches, or the access boundary that stops you.`
      );
    }
  }
  if (dominant.platform !== "youtube" && !searched.has(communityKey(dominant.name, dominant.platform))) {
    out.requireDeclaration(
      `Search ${dominant.name}, the community listed first, with your web search and record it in ` +
        "community_searches, or the access boundary that stops you."
    );
  }
  const listed = new Set(communities.map(({ name, platform }) => communityKey(name, platform)));
  // A Facebook group, Telegram channel or Discord server is known by links the
  // server cannot tie to one identity (a group's name or number, a server's
  // many invites), so each of those platforms counts once toward independence.
  const pools = new Set([...searched.keys()].map((key) => {
    const platform = key.split(":")[0]!;
    return COMMUNITY_LINK_STEPS[platform] === undefined ? key : platform;
  }));
  if (listed.size === 1 && pools.size <= 1) {
    if (input.single_community_reason === undefined) {
      out.requireDeclaration(
        "principal_communities lists one community: name an independent one (another platform, forum or discussion " +
          "pool) and search it, or give single_community_reason."
      );
    } else {
      out.requireLimit(
        "Only one community discusses this; say that the community evidence rests on it alone.",
        "Only one community seems to discuss this, so the community evidence rests on a single group."
      );
    }
  } else if (pools.size < 2) {
    const others = [...new Map(communities
      .filter(({ name, platform }) => !searched.has(communityKey(name, platform)))
      .map(({ name, platform }) => [communityKey(name, platform), name])).values()];
    out.nextSteps.push(
      "Search at least one more community, independent of " +
        `${searched.size === 0 ? "the first" : [...searched.values()].join(", ")}` +
        `${others.length === 0 ? "" : ` (${others.join(", ")})`}: YouTube with its tools, the others with your web ` +
        "search recorded in community_searches, or record the access boundary that stops you." +
        (pools.size < searched.size
          ? " Communities on one of Facebook, Telegram or Discord count once together: their links cannot show that " +
            "they are separate discussion pools."
          : "")
    );
  }
  // Every community searched outside YouTube rests on the client's word.
  return { searched: [...searched.values()], read, unverified: [...searched.keys()].filter((key) => key !== "youtube").length };
}

// The literature search tools that sign receipts, by the source each claims.
const LITERATURE_SOURCES = [
  { id: "pubmed", name: "PubMed" },
  { id: "europepmc", name: "Europe PMC" },
  { id: "ctgov", name: "ClinicalTrials.gov" }
] as const;
// What a search can cover beyond the indexed databases, as the caveat names it.
const SEARCH_COVERAGE = [
  { id: "historical_terms", phrase: "older or variant terms" },
  { id: "citation_chains", phrase: "citation chains" },
  { id: "grey_literature", phrase: "grey literature" }
] as const;

/** "a", "a and b", "a, b and c". */
function joinNames(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

interface VerifiedReceipt {
  kind: ResearchReceiptKind;
  claims: Record<string, string | string[]>;
  issuedAt: string;
  index: number;
}

function receiptOrder(receipt: VerifiedReceipt): number {
  return receiptIssueOrder({ claims: receipt.claims, issued_at: receipt.issuedAt });
}

const DISCOVERY_KINDS: ReadonlySet<ResearchReceiptKind> = new Set([
  "youtube_survey",
  "youtube_search",
  "youtube_scout",
  "youtube_community_audit"
]);

/** A first pass stops at saturation or at this many audited material videos or discovery rounds. */
const FIRST_PASS_AUDITED_VIDEOS = 3;
// The two ways a first pass offers to go deeper, and how the answer names each focus.
const FOCUS_DIRECTIONS = [
  {
    direction: "studies",
    label: "a deeper study review",
    caption: "Study focus",
    what: "studies whose methods were not audited in full text, or questions not yet searched"
  },
  {
    direction: "community",
    label: "deeper community research",
    caption: "Community focus",
    what: "communities, options or subgroups not yet reached"
  }
] as const;
const FIRST_PASS_ROUNDS = 2;

const NEW_ANGLE_HINT =
  "patient phrasing such as \"what finally worked\", a method, product or practitioner named in comments, " +
  "or an alternative framing; a scout or a single search_youtube counts as a round";

/**
 * Discovery stops at saturation, not at a count: the last two rounds, from
 * different angles, found no video worth auditing that earlier rounds had not
 * already found. Rounds are ordered by their signed issue order, never by
 * their position in the call. Rounds the order cannot separate from the last
 * two count as recent too, so a tie can only delay saturation.
 */
function discoverySaturation(
  unordered: readonly VerifiedReceipt[],
  material: ReadonlySet<string>,
  depth: "first_pass" | "deep"
): { saturated: boolean; nextSteps: string[]; rateLimited: number } {
  const stop = depth === "first_pass"
    ? ` A first pass may also stop once ${FIRST_PASS_AUDITED_VIDEOS} material videos are audited or ${FIRST_PASS_ROUNDS} rounds are done, then lists open_leads.`
    : "";
  const rounds = [...unordered].sort((left, right) =>
    receiptOrder(left) - receiptOrder(right) || left.index - right.index
  );
  const recentFrom = rounds.length < 2 ? -Infinity : receiptOrder(rounds[rounds.length - 2]!);
  const recent = rounds.filter((round) => receiptOrder(round) >= recentFrom);
  // Searches in the latest rounds that did not complete (a rate limit, the
  // daily quota, an error) left their results unread, like an unread page.
  const incomplete = signedCount(recent, "inc");
  const rateLimited = signedCount(recent, "rl");
  if (incomplete > 0) {
    return {
      saturated: false,
      rateLimited,
      nextSteps: [
        `${incomplete} search(es) in the latest discovery rounds did not complete` +
          (rateLimited > 0
            ? `, ${rateLimited} stopped by YouTube's rate limit or daily quota. Rerun them once it resets`
            : ". Rerun them") +
          " and pass the new research_receipt." + stop
      ]
    };
  }
  if (rounds.length < 2) {
    return {
      saturated: false,
      rateLimited,
      nextSteps: [
        `Run another discovery round from a new angle (${NEW_ANGLE_HINT}) and pass its research_receipt. ` +
          "Discovery is done when two rounds in a row add no new video worth auditing; a niche topic may end with one video or none." + stop
      ]
    };
  }
  // When each video first turned up; the earliest round that found it counts.
  const firstFound = new Map<string, number>();
  for (const round of rounds) {
    const order = receiptOrder(round);
    for (const video of [...list(round.claims.videos), ...list(round.claims.alt)]) {
      const known = firstFound.get(video);
      if (known === undefined || order < known) firstFound.set(video, order);
    }
  }
  const fresh = [...material].filter((video) => (firstFound.get(video) ?? -Infinity) >= recentFrom).sort();
  // A later page's receipt signs the page it read, which settles the page before it.
  const read = readPages(rounds);
  const unchecked = recent.some((round) => roundUnreadPages(round.claims, read) > 0);
  const angles = recent.map((round) => text(round.claims.q));
  const repeated = angles.includes("") || new Set(angles).size < angles.length;
  const nextSteps: string[] = [];
  if (fresh.length > 0) {
    nextSteps.push(
      `Discovery has not saturated: ${fresh.join(", ")} first turned up in the last two rounds. ` +
        `Run another round from a new angle (${NEW_ANGLE_HINT}) and pass its research_receipt.` + stop
    );
  } else if (unchecked) {
    nextSteps.push(
      "A recent round left results unchecked: unread result pages, or scout candidates it could not verify or look up. " +
        "Continue a search with its next cursor, search a promising candidate by its exact title with search_youtube, " +
        `or run another round from a new angle (${NEW_ANGLE_HINT}).` + stop
    );
  } else if (repeated) {
    nextSteps.push(
      `The last two discovery rounds repeated the same searches; run one from a different angle (${NEW_ANGLE_HINT}).` + stop
    );
  }
  return { saturated: nextSteps.length === 0, nextSteps, rateLimited };
}

/** The sum of a signed count claim (`inc`, `rl`) across rounds. */
function signedCount(rounds: readonly VerifiedReceipt[], claim: string): number {
  return rounds.reduce((sum, round) => {
    const count = Number(text(round.claims[claim]) || "0");
    return sum + (Number.isSafeInteger(count) && count > 0 ? count : 0);
  }, 0);
}

function recordVideoAudit(
  audited: Map<string, VideoAudit>,
  video: string,
  state: string,
  lock: string,
  records: number
): void {
  if (video.length === 0 || !TERMINAL_VIDEO_STATES.has(state)) return;
  const previous = audited.get(video);
  // Comments once read stay read, whatever order the audits come in (a later
  // audit can find them deleted); a complete audit supersedes a bounded one.
  const read = Math.max(previous?.records ?? 0, Number.isSafeInteger(records) ? records : 0);
  if (previous === undefined || previous.state !== "api_visible_complete") {
    audited.set(video, { state, lock, records: read });
  } else {
    audited.set(video, { ...previous, records: read });
  }
}

/** Lower-cased DOI without resolver prefix, bare PMID digits, or upper-cased PMCID. */
export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  const doi = trimmed.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/iu, "");
  if (/^10\.\d{4,9}\//u.test(doi)) return doi.toLowerCase();
  const pmcid = /^(?:pmcid:?\s*)?(pmc\d+)$/iu.exec(trimmed);
  if (pmcid !== null) return pmcid[1]!.toUpperCase();
  const pmid = /^(?:pmid:?\s*)?(\d{1,9})$/iu.exec(trimmed);
  if (pmid !== null) return pmid[1]!;
  return trimmed.toLowerCase();
}

function isDoi(normalized: string): boolean {
  return /^10\.\d{4,9}\//u.test(normalized);
}

function isPmid(normalized: string): boolean {
  return /^\d{1,9}$/u.test(normalized);
}

function isPmcid(normalized: string): boolean {
  return /^PMC\d+$/u.test(normalized);
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** Higher is stricter in deep research: a block, then no ranking. */
function coverageRestriction(receipt: VerifiedReceipt): number {
  const boundary = text(receipt.claims.boundary);
  const narrow = text(receipt.claims.broad) !== "true" ? 0.5 : 0;
  if (boundary === "ledger_consistent_for_synthesis") return 1 + narrow;
  if (boundary === "bounded_nonranking_only") return 2 + narrow;
  return 3 + narrow;
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}
