import { z } from "zod";

import { displayedProse, linkTargets, visibleText } from "./displayed-prose.js";
import {
  findingsCardDigest,
  findingsCardSchema,
  screenFindingsCard,
  type FindingsCard,
  type FindingsPrivacyReason
} from "./findings/card.js";
import {
  issueResearchReceipt,
  RESEARCH_RECEIPT_MAX_CHARACTERS,
  readPages,
  receiptIssueOrder,
  researchTargetDigest,
  roundUnreadPages,
  verifyResearchReceipt,
  type ResearchReceiptKind
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
// The answer's own words for a finding, copied from answer_draft: the gate
// checks that the answer shows them, which works in any language, and leaves
// whether they report the finding to the model that wrote both.
const answerQuote = z.string().trim().max(1_000);
const ANSWER_QUOTES_DESCRIPTION = "With answer_draft: the answer's sentence(s) that report each finding, copied from " +
  "it; one may serve several.";

export const finalizeResearchInputSchema = z.object({
  receipts: z.array(z.string().max(RESEARCH_RECEIPT_MAX_CHARACTERS)).max(300)
    .describe("Every research_receipt AskRigor tools returned during this research, copied exactly."),
  community_evidence: z.enum(["researched", "not_relevant"])
    .describe("researched when firsthand community evidence could plausibly matter; not_relevant needs a basis and a reason."),
  not_relevant_basis: z.enum(["no_real_world_outcome", "emergency_before_triage"]).optional()
    .describe("Why firsthand reports cannot matter: no real-world outcome (a definition, calculation, or chemical or " +
      "mechanistic question), or an emergency before triage."),
  not_relevant_reason: z.string().trim().min(1).max(1_000).optional(),
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
  }).strict()).max(12).optional()
    .describe("After a first pass: two or three focuses for each way to go deeper, studies and (when community evidence " +
      "was researched) community, each with why it looks promising. When discovery has not saturated, the community " +
      "focuses include the topics where more community signal is likely. Focuses deepen what the answer covers: a " +
      "first pass still covers every plausible option class and the red flags briefly, never leaving them for later."),
  another_pass_estimate: z.string().trim().min(1).max(200).optional()
    .describe("After a first pass: roughly what another pass would take, with a number in digits and a unit, such " +
      "as \"about 20 minutes and 15 YouTube searches\"."),
  community_findings: z.object({
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
      "how creators differ from independent commenters, and what this changes in the answer. Summarize; do not quote " +
      "or name commenters. Needed whenever a comment audit ran, even if the signal was weak or neutral; the answer " +
      "must report it (must_report)."),
  principal_communities: z.array(z.object({
    name: z.string().trim().min(1).max(120).describe("As its users know it, such as r/trt, MESO-Rx or YouTube."),
    platform: communityPlatformSchema
  }).strict()).min(1).max(8).optional()
    .describe("Where people discussing this actually talk, the dominant first: subreddits, specialist forums, " +
      "Facebook groups, patient organizations, YouTube. Needed when community evidence is researched; search the " +
      "dominant one and at least one independent one."),
  single_community_reason: z.string().trim().min(1).max(500).optional()
    .describe("Why only one community discusses this, when principal_communities lists one."),
  community_searches: z.array(z.object({
    community: z.string().trim().min(1).max(120).describe("The community searched, named as in principal_communities."),
    platform: communityPlatformSchema.exclude(["youtube"]),
    queries: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
    threads_read: z.array(z.object({
      url: z.string().trim().url().max(2_048).describe("The thread's full link; on Reddit, reddit.com/r/<name>/comments/<id>/…"),
      title: z.string().trim().min(1).max(300).optional()
    }).strict()).max(30).default([]),
    access_boundary: z.enum(["no_web_search", "login_required", "blocked", "no_relevant_results"]).optional(),
    url: z.string().trim().url().max(2_048).optional()
      .describe("The community's own address (its forum, group or site link). Needed when no thread was read outside " +
        "Reddit, so the community is known by its site rather than its name."),
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
      "the answer), or the access boundary that stopped the search. Summarize; do not quote or name posters. " +
      "AskRigor cannot see these searches, so the answer links the threads you read and says they were not verified. " +
      "YouTube goes through its own tools."),
  key_sources: z.array(z.object({
    id: z.string().trim().min(1).max(300).describe("DOI, PMID or PMCID."),
    status: z.enum(["validated", "lead_only"]),
    reason: z.string().trim().min(1).max(1_000).optional()
  }).strict()).max(60)
    .describe("Each study your conclusions depend on: validated after a full-text method audit, or lead_only when the acquisition (or, for a PMID without a DOI, the PubMed record) receipt shows no open full text."),
  answer_draft: z.string().trim().min(1).max(60_000).optional()
    .describe("The answer you are about to give, exactly as the user will see it. Needed before the gate reports ready; " +
      "it is checked for internal labels, bare video IDs, a pasted long prompt, the sentences answer_quotes copies " +
      "and the caveats (each as its own sentence, as written or as caveat_renderings gives it), and is not stored."),
  absence_claims: z.array(z.object({
    quote: answerQuote.describe("The sentence(s), copied from answer_draft."),
    state: z.enum(["support_not_located", "direct_null_evidence", "bounded_exclusion"])
      .describe("support_not_located: the searches did not find it; direct_null_evidence: studies found no effect; " +
        "bounded_exclusion: precise studies rule out an effect above a stated size."),
    studies: z.array(z.string().trim().min(1).max(300)).max(20).optional()
      .describe("For direct_null_evidence and bounded_exclusion: the key sources (DOI, PMID or PMCID) it rests on.")
  }).strict()).max(20).optional()
    .describe("With answer_draft: each place the answer says something was not found, not studied, has no evidence or " +
      "has no effect (an empty list if none)."),
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
    .describe("With answer_draft: the answer's best findings for AskRigor's findings library, never claims the user " +
      "corrected and no personal details, checked against the answer and this call's verified sources. In free " +
      "contributor mode a checked card is saved for the owner's review; a rejected one is not saved and does not " +
      "hold back the answer."),
  reported_model: z.string().trim().min(1).max(80).optional()
    .describe("Your model's name as your app reports it; kept, unverified, with a saved findings card.")
}).strict();

export type FinalizeResearchInput = z.output<typeof finalizeResearchInputSchema>;

const finalizationStatusSchema = z.enum([
  "ready",
  "ready_with_limits",
  "not_ready",
  "receipts_unavailable"
]);

export const finalizeResearchOutputSchema = z.object({
  status: finalizationStatusSchema,
  next_steps: z.array(z.string()),
  limits: z.array(z.string()),
  caveats: z.array(z.string())
    .describe("Sentences the answer must contain, each as its own sentence and as written; a link's text may change."),
  must_report: z.array(z.string())
    .describe("What the answer must report from each evidence lane researched, even when weak or neutral."),
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
  findings_card: z.object({
    status: z.enum(["checked", "rejected", "absent", "closed", "private"]),
    problems: z.array(z.string()),
    saved: z.object({
      status: z.enum(["saved", "already_saved", "not_saved", "unconfirmed"]),
      card_id: z.string().regex(/^ARF-[0-9]{4,}$/u).optional(),
      reason: z.string().optional()
    }).strict().optional()
  }).strict().describe("Whether findings_card checked, and for a free contributor account whether it was saved. " +
    "closed: the findings library is not open; private: this account's research is not saved."),
  finalization_receipt: z.string().optional()
}).strict();

export type FinalizeResearchOutput = z.output<typeof finalizeResearchOutputSchema>;

export interface FinalizeResearchOptions {
  secret: string | undefined;
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
  // whose checked card the tool saves; "private" for any other caller, whose
  // card is neither checked nor saved.
  findings?: "closed" | "save" | "private";
}

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
  const input = finalizeResearchInputSchema.parse(rawInput);
  if (options.secret === undefined) {
    return {
      status: "receipts_unavailable",
      next_steps: [],
      limits: [
        "This AskRigor server cannot verify research receipts, so say that research completion was not server-verified."
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
          : options.findings !== "save"
            ? closedFindingsLibrary()
            : {
                status: "rejected",
                problems: ["This AskRigor server cannot verify research receipts, so it cannot check or save a findings card."]
              }
    };
  }

  const verified: VerifiedReceipt[] = [];
  const rejected: FinalizeResearchOutput["receipts_rejected"] = [];
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
  const limits: string[] = [];
  // Each limit's sentences for the user, written here so the answer carries
  // them as they are: a caveat cannot be dropped, garbled or negated.
  const caveats: string[] = [];
  const requireLimit = (text: string, ...sentences: string[]): void => {
    limits.push(text);
    caveats.push(...sentences);
  };
  // What the communities outside YouTube showed, reported after the YouTube lane.
  const communityLanes: string[] = [];
  let communitiesSearched: string[] = [];
  let communitiesRead: CommunityRead[] = [];
  let communitiesUnverified = 0;
  if (rejected.length > 0) {
    nextSteps.push(
      `${rejected.length} receipt(s) failed verification; pass each research_receipt exactly as the tool returned it.`
    );
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
      nextSteps.push(
        "Community evidence is not_relevant only for a definition, calculation, or chemical or mechanistic question " +
          "with no real-world outcome (not_relevant_basis no_real_world_outcome) or an emergency before triage " +
          "(emergency_before_triage), with not_relevant_reason. Otherwise research it: name where people discussing " +
          "this talk in principal_communities and search the dominant one and an independent one (YouTube with " +
          "scout_gemini_youtube_candidates and audit_youtube_video_community, the others with your web search); a " +
          "topic nobody discusses is searched and its access boundary recorded."
      );
    }
  } else {
    const communities = input.principal_communities;
    const youtubeResearched = rounds.length > 0 || audited.size > 0 || communityAudited.size > 0;
    // YouTube is one of the places people talk, not the whole community lane:
    // its checks run when it is the dominant community, when it was researched
    // anyway, or when there is no map yet. Otherwise it is optional, like any
    // other community beyond the dominant one and an independent one.
    if (communities === undefined || youtubeResearched || communities[0]!.platform === "youtube") {
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
              "No video turned up before YouTube's rate limit or daily quota stopped discovery; say that community " +
                "evidence could not be checked yet, not that it is thin.",
              "YouTube's search limit stopped discovery before any video turned up, so community evidence could not be " +
                "checked yet."
            );
          } else {
            requireLimit(
              `No video turned up in ${rounds.length} discovery rounds; say that community evidence on this is thin.`,
              `No relevant video turned up in ${rounds.length === 1 ? "1 round" : `${rounds.length} rounds`} of ` +
                "searching, so community evidence on this is thin."
            );
          }
        } else if (input.no_material_video_reason === undefined) {
          nextSteps.push(
            `Discovery found ${discovered.size} video(s) but none is in material_video_ids: audit each one that adds an approach ` +
              "or substantial firsthand experience, or give no_material_video_reason."
          );
        } else {
          requireLimit(
            `None of the ${discovered.size} video(s) found in ${rounds.length} discovery rounds was worth auditing; ` +
              "say that community evidence on this is thin.",
            discovered.size === 1
              ? "The only video found was not worth a close look, so community evidence on this is thin."
              : `None of the ${discovered.size} videos found was worth a close look, so community evidence on this is thin.`
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
      communityCoverage(input, youtubeResearched, { nextSteps, requireLimit, lanes: communityLanes }, options.redditThreads));
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
    nextSteps.push(
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
  // PMID -> DOI ("" when the PubMed record has none), from fetch_pubmed_record receipts.
  const pubmedDois = new Map<string, string>();
  // PMID -> PMCID when PubMed lists an open copy in PubMed Central.
  const pubmedPmcids = new Map<string, string>();
  // DOI -> the PMCIDs its full_text_lead receipts tried ("" when none was).
  const leadAttempts = new Map<string, Set<string>>();
  for (const { kind, claims } of verified) {
    if (kind === "pubmed_record" && typeof claims.pmid === "string") {
      pubmedDois.set(normalizeIdentifier(claims.pmid), typeof claims.doi === "string" ? normalizeIdentifier(claims.doi) : "");
      if (typeof claims.pmcid === "string" && claims.pmcid !== "") {
        pubmedPmcids.set(normalizeIdentifier(claims.pmid), claims.pmcid.toUpperCase());
      }
    }
    if (kind === "study_audit" || kind === "review_audit") {
      for (const key of ["id", "doi", "pmid", "pmcid"]) {
        const value = claims[key];
        if (typeof value === "string" && value.length > 0) validatedIds.add(normalizeIdentifier(value));
      }
    }
    if (kind === "full_text_lead") {
      for (const key of ["doi", "pmcid"]) {
        const value = claims[key];
        if (typeof value === "string" && value.length > 0) leadIds.add(normalizeIdentifier(value));
      }
      if (typeof claims.doi === "string" && claims.doi !== "") {
        const doi = normalizeIdentifier(claims.doi);
        const tried = leadAttempts.get(doi) ?? new Set<string>();
        tried.add(typeof claims.pmcid === "string" ? claims.pmcid.toUpperCase() : "");
        leadAttempts.set(doi, tried);
      }
    }
  }
  // The PubMed Central copy PubMed links to a study, by PMID or by DOI.
  const pmcidFor = (id: string): string | undefined => {
    if (isPmid(id)) return pubmedPmcids.get(id);
    const pmid = isDoi(id) ? [...pubmedDois].find(([candidate, doi]) => doi === id && pubmedPmcids.has(candidate))?.[0] : undefined;
    return pmid === undefined ? undefined : pubmedPmcids.get(pmid);
  };
  const validatedSources: string[] = [];
  const leadSources: string[] = [];
  // Studies read only as leads: one limit each, one caveat for all of them.
  const unreadStudies = new Set<string>();
  for (const source of input.key_sources) {
    const id = normalizeIdentifier(source.id);
    // A PMID's DOI (from its PubMed record receipt) also identifies the study.
    const pubmedDoi = isPmid(id) ? pubmedDois.get(id) : undefined;
    const ids = pubmedDoi === undefined || pubmedDoi === "" ? [id] : [id, pubmedDoi];
    if (ids.some((candidate) => validatedIds.has(candidate))) {
      validatedSources.push(source.id);
      continue;
    }
    if (ids.some((candidate) => leadIds.has(candidate))) {
      // An open copy PubMed links to the study must be tried before it is a lead.
      const doi = isDoi(id) ? id : pubmedDoi !== undefined && pubmedDoi !== "" ? pubmedDoi : undefined;
      const openCopy = pmcidFor(id);
      if (doi !== undefined && openCopy !== undefined && !(leadAttempts.get(doi)?.has(openCopy) ?? false)) {
        nextSteps.push(
          `PubMed lists an open copy of ${source.id} in PubMed Central (${openCopy}) that the full-text attempt did not ` +
            `try: call acquire_open_full_text with DOI ${doi} and pmcid ${openCopy}, then audit it, or pass the new ` +
            "research_receipt if it still finds no full text."
        );
        continue;
      }
      leadSources.push(source.id);
      requireLimit(`Cite ${source.id} as a lead: no open full text was available, so its methods were not audited.`);
      unreadStudies.add(id);
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
      unreadStudies.add(id);
      continue;
    }
    const target = pubmedDoi ?? source.id;
    nextSteps.push(source.status === "validated"
      ? `For ${source.id}: acquire_open_full_text${target === source.id ? "" : ` (DOI ${target})`}, continue_open_full_text until exhausted, ` +
          "then validate_study_method_audit (or validate_review_method_audit) and pass its research_receipt. If no open full text exists, " +
          "the acquisition receipt lets you list it as lead_only."
      : `Try acquire_open_full_text for ${source.id}${target === source.id ? "" : ` (DOI ${target})`}${isPmcid(id) ? " with its DOI and this pmcid" : ""} ` +
          "before treating it as lead_only; pass the research_receipt it returns.");
  }
  if (unreadStudies.size > 0) caveats.push(unreadStudiesCaveat([...unreadStudies]));
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
      nextSteps.push(
        `List two or three open_leads with direction ${direction}: ${what}, each with why it looks promising.` +
          (direction === "community" && unsaturatedFirstPass
            ? " Discovery has not saturated, so include the topics where more community signal is likely" +
              (firstPassRateLimited > 0 ? " and the searches YouTube's rate limit or daily quota stopped." : ".")
            : "")
      );
    });
    const estimate = input.another_pass_estimate === undefined ? undefined : withoutEndPunctuation(input.another_pass_estimate);
    if (estimate === undefined || !PASS_COST_NUMBER.test(estimate)) {
      nextSteps.push(
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
          ". Say why each focus looks promising and roughly what another pass would take, and ask which the user " +
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
  // studied, or has no evidence or no effect, it says which it means: not
  // located by the searches made here, a direct null result, or a bounded
  // exclusion (HRP NonexistenceVersusNotFound, NoWeaselSafetySubstitution,
  // HistoricalVocabularyAndCitationBackchain). The model names each such
  // sentence, in whatever language it wrote it; the gate checks that the
  // answer shows it, that a null result or an exclusion rests on studies whose
  // methods were audited and gives its numbers, and that what the searches did
  // not find is bounded to the searches made (owner report, 2026-09-30: "I
  // found no evidence that smelling humic acid treats neuroinflammation").
  const absenceClaims = input.absence_claims ?? [];
  if (input.answer_draft !== undefined && input.absence_claims === undefined) {
    nextSteps.push(
      "Say whether the answer states that something was not found, not studied, has no evidence or has no effect: " +
        "give absence_claims, each such sentence with its state (an empty list if the answer states none)."
    );
  }
  // A study is audited when a study or review audit receipt names it, or the DOI its PubMed record gives.
  const auditedStudy = (id: string): boolean => {
    const normalized = normalizeIdentifier(id);
    const doi = isPmid(normalized) ? pubmedDois.get(normalized) : undefined;
    return validatedIds.has(normalized) || (doi !== undefined && doi !== "" && validatedIds.has(doi));
  };
  for (const [index, claim] of absenceClaims.entries()) {
    if (claim.state === "support_not_located") continue;
    const stated = `absence_claims[${index}] states ` +
      (claim.state === "direct_null_evidence" ? "a direct null result" : "a bounded exclusion");
    const studies = claim.studies ?? [];
    const unaudited = studies.filter((id) => !auditedStudy(id));
    if (studies.length === 0) {
      nextSteps.push(
        `${stated} without the studies it rests on: name them in studies, each read with a full-text method audit, ` +
          "or state it as support_not_located."
      );
    } else if (unaudited.length > 0) {
      nextSteps.push(
        `${stated} on ${unaudited.join(", ")}, which no full-text method audit here covers: an abstract or a lead ` +
          "cannot show a null result. Audit each, or state it as support_not_located."
      );
    }
    if (!/\p{Nd}/u.test(claim.quote)) {
      nextSteps.push(
        `${stated}: give the estimate and its interval in that sentence, so a reader sees how large an effect the ` +
          "studies could have missed."
      );
    }
  }
  if (absenceClaims.some(({ state }) => state === "support_not_located")) {
    const searched = new Set(verified.filter(({ kind }) => kind === "literature_search")
      .map(({ claims }) => text(claims.src)));
    const names = LITERATURE_SOURCES.filter(({ id }) => searched.has(id)).map(({ name }) => name);
    if (names.length === 0) {
      nextSteps.push(
        "The answer says something was not found, but no literature search receipt was passed: search with " +
          "search_pubmed or search_europe_pmc (and search_clinical_trials for trials) and pass their research receipts."
      );
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
  // the answer. For a free contributor account the answer needs one, and a
  // checked card is saved; a rejected card is reported and not saved, but it
  // never holds back the answer, whose research may have nothing a card can
  // cite. Nothing is offered to the user: free research is saved by the
  // agreement the user accepted, and paid-private research never is.
  let findingsCard: FindingsCardCheck = options.findings === "private"
    ? privateFindings()
    : input.findings_card === undefined
      ? noFindingsCard()
      : options.findings !== "save"
        ? closedFindingsLibrary()
        : {
            status: "rejected",
            problems: ["A findings card is checked against the answer: pass answer_draft with it."]
          };
  if (draft === undefined) {
    if (nextSteps.length === 0) {
      nextSteps.push(
        "Pass the answer you are about to give as answer_draft, exactly as the user will see it; the final check reads it."
      );
    }
  } else {
    if (options.findings === "save" && input.findings_card === undefined) {
      nextSteps.push(
        "Give findings_card with answer_draft: this account's research is saved to AskRigor's findings library for " +
          "the owner's review. Put in the answer's best findings, none the user corrected, and no personal details."
      );
    }
    if (input.findings_card !== undefined && options.findings === "save") {
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
      ...(input.answer_language === undefined ? {} : { answerLanguage: input.answer_language }),
      renderings: input.caveat_renderings ?? []
    }));
  }

  const status = nextSteps.length > 0
    ? "not_ready"
    : limits.length > 0
      ? "ready_with_limits"
      : "ready";
  const output: FinalizeResearchOutput = {
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
    findings_card: findingsCard
  };
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
    answerLanguage?: string;
    renderings: ReadonlyArray<{ caveat: string; text: string }>;
  }
): string[] {
  const problems: string[] = [];
  // Links may carry IDs and underscores legitimately; the words around them may not.
  const prose = draft.replace(URL, " ");
  // What the answer must say is read from the prose a reader sees; what it must not show, from the whole draft.
  const shownBlocks = displayedProse(draft);
  const labels = [...new Set([
    ...[...prose.matchAll(SNAKE_CASE_LABEL)].map(([label]) => label).filter((label) => !looksLikeVideoId(label)),
    ...[...prose.matchAll(CAPITALIZED_TOKEN)].map(([name]) => name).filter((name) => context.protocolNames.has(name)),
    ...[...prose.matchAll(INTERNAL_PHRASE)].map(([label]) => label.toLowerCase())
  ])];
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
  // Each caveat the server wrote must reach the answer as a sentence of its
  // own. Only prose a reader sees counts: not code, comments, quotations or
  // image descriptions. An answer in another language states each in that
  // language, with the caveat's links, and gives the sentence in
  // caveat_renderings: the gate cannot judge a translation, so it checks that
  // sentence's place and links, and the wording is the model's declaration.
  const blocks = shownBlocks.map((block) => caveatText(linkTargets(block)));
  const translated = context.answerLanguage !== undefined && !/^eng?(?:-|$)/iu.test(context.answerLanguage);
  if (context.renderings.length > 0 && !translated) {
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

type FindingsCardCheck = FinalizeResearchOutput["findings_card"];

const noFindingsCard = (): FindingsCardCheck => ({ status: "absent", problems: [] });

const closedFindingsLibrary = (): FindingsCardCheck => ({
  status: "closed",
  problems: ["AskRigor's findings library is not open yet, so the card was not checked or saved."]
});

const privateFindings = (): FindingsCardCheck => ({ status: "private", problems: [] });

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
function quoteForm(quote: string): string {
  const text = caveatText(quote);
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
  return text
    .normalize("NFC")
    .replace(/[\u2018\u2019\u02BC]/gu, "'")
    .replace(/[\u201C\u201D]/gu, "\"")
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/[*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
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
function unreadStudiesCaveat(ids: readonly string[]): string {
  // A DOI may contain parentheses, which would end a Markdown link.
  const links = ids.map((id) => `[this study](${isDoi(id)
    ? `https://doi.org/${id.replace(/\(/gu, "%28").replace(/\)/gu, "%29")}`
    : isPmid(id) ? `https://pubmed.ncbi.nlm.nih.gov/${id}/` : `https://www.ncbi.nlm.nih.gov/pmc/articles/${id}/`})`);
  return links.length === 1
    ? `The full text of ${links[0]} was not openly available, so its methods were not checked.`
    : `The full texts of ${links.slice(0, -1).join(", ")} and ${links.at(-1)} were not openly available, so their ` +
      "methods were not checked.";
}

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

function communityLane(
  findings: NonNullable<FinalizeResearchInput["community_findings"]>,
  videosRead: number
): string {
  return `YouTube comments (${videosRead} video(s) read): Benefits: ${findings.benefit_reports} ` +
    `No effect: ${findings.no_effect_reports} Adverse: ${findings.adverse_reports} Creators versus commenters: ` +
    `${findings.creators_versus_commenters} Effect on the answer: ${findings.effect_on_answer} Report this lane in ` +
    "the answer even if later sources dominate; if its signal is weak, say so. Then copy the sentences that report " +
    "it into community_findings.answer_quotes.";
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
    case "no_relevant_results": return `A search of ${name} turned up no relevant reports.`;
  }
}

function forumLane(search: CommunitySearch): string {
  return `${search.community} (${search.threads_read.length} thread(s) read): Benefits: ${search.benefit_reports} ` +
    `No effect: ${search.no_effect_reports} Adverse: ${search.adverse_reports} Effect on the answer: ` +
    `${search.effect_on_answer} Report this lane in the answer, naming ${search.community} and linking a thread you ` +
    "read, even if its signal is weak. Then copy the sentences that report it into the entry's answer_quotes.";
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
  out: { nextSteps: string[]; requireLimit: (text: string, ...sentences: string[]) => void; lanes: string[] },
  redditThreads?: ReadonlyMap<string, RedditThreadCheck>
): { searched: string[]; read: CommunityRead[]; unverified: number } {
  const communities = input.principal_communities;
  // Communities read, one entry per community however many searches it had.
  const readByKey = new Map<string, CommunityRead>();
  // Each thread counts for one community only, so one search cannot pass as two.
  const threadOwners = new Map<string, string>();
  if (communities === undefined) {
    out.nextSteps.push(
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
      out.nextSteps.push(
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
    // Outside Reddit, whose subreddit names it, a community read nowhere is
    // known by its address, never by its name alone.
    if (search.platform !== "reddit" && search.threads_read.length === 0 && search.url === undefined) {
      out.nextSteps.push(
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
    const missing = COMMUNITY_FINDINGS.filter((field) => search[field] === undefined);
    if (missing.length > 0) {
      out.nextSteps.push(
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
  if (dominant.platform !== "youtube" && !searched.has(communityKey(dominant.name, dominant.platform))) {
    out.nextSteps.push(
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
      out.nextSteps.push(
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
