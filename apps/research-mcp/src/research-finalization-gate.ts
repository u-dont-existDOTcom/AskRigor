import { z } from "zod";

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

export const finalizeResearchInputSchema = z.object({
  receipts: z.array(z.string().max(RESEARCH_RECEIPT_MAX_CHARACTERS)).max(300)
    .describe("Every research_receipt AskRigor tools returned during this research, copied exactly."),
  community_evidence: z.enum(["researched", "not_relevant"])
    .describe("researched when firsthand community evidence could plausibly matter; not_relevant needs a reason."),
  not_relevant_reason: z.string().trim().min(1).max(1_000).optional(),
  material_video_ids: z.array(youtubeVideoIdSchema).max(60).optional()
    .describe("Videos worth auditing: each adds an approach or substantial firsthand experience. Defaults to every audited video."),
  no_material_video_reason: z.string().trim().min(1).max(1_000).optional()
    .describe("Why none of the videos found was worth auditing; needed only when discovery found videos but material_video_ids is empty."),
  treatment_choice: z.enum(["compared", "not_compared"])
    .describe("compared when the answer compares, ranks or recommends treatment options; it then needs an assess_treatment_landscape_coverage result."),
  research_target: z.string().trim().min(1).max(5_000)
    .describe("The research target, copied exactly as given to the scout, search_youtube and " +
      "assess_treatment_landscape_coverage, and as research_question to surveys and community audits. Discovery " +
      "and coverage receipts made for any other target do not count."),
  research_depth: z.enum(["first_pass", "deep"]).default("first_pass")
    .describe("first_pass unless the user or an automated research brief asked for deep research."),
  open_leads: z.array(z.object({
    topic: z.string().trim().min(1).max(200),
    why: z.string().trim().min(1).max(500)
  }).strict()).max(12).optional()
    .describe("When a first pass stops before discovery saturates: each topic or subtopic where more community signal is likely, and why."),
  another_pass_estimate: z.string().trim().min(1).max(200).optional()
    .describe("With open_leads: roughly what another pass would take, with a number and unit, such as \"about 20 minutes and 15 YouTube searches\"."),
  community_findings: z.object({
    videos_reviewed: z.array(youtubeVideoIdSchema).min(1).max(60)
      .describe("Every video whose comments you read."),
    benefit_reports: z.string().trim().min(1).max(800),
    no_effect_reports: z.string().trim().min(1).max(800),
    adverse_reports: z.string().trim().min(1).max(800),
    creators_versus_commenters: z.string().trim().min(1).max(500),
    effect_on_answer: z.string().trim().min(1).max(800)
  }).strict().optional()
    .describe("What the YouTube comments you read showed: benefit, no-effect and adverse reports with rough counts, " +
      "how creators differ from independent commenters, and what this changes in the answer. Summarize; do not quote " +
      "or name commenters. Needed whenever a comment audit ran, even if the signal was weak or neutral; the answer " +
      "must report it (must_report)."),
  key_sources: z.array(z.object({
    id: z.string().trim().min(1).max(300).describe("DOI, PMID or PMCID."),
    status: z.enum(["validated", "lead_only"]),
    reason: z.string().trim().min(1).max(1_000).optional()
  }).strict()).max(60)
    .describe("Each study your conclusions depend on: validated after a full-text method audit, or lead_only when the acquisition (or, for a PMID without a DOI, the PubMed record) receipt shows no open full text."),
  answer_draft: z.string().trim().min(1).max(60_000).optional()
    .describe("The answer you are about to give, exactly as the user will see it. Needed before the gate reports ready; " +
      "it is checked for internal labels, bare video IDs, a pasted long prompt, the comment lane and the caveats " +
      "(each as its own sentence, as written), and is not stored.")
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
    material_videos: z.array(z.string())
  }).strict(),
  sources: z.object({
    validated: z.array(z.string()),
    lead_only: z.array(z.string())
  }).strict(),
  answer_checked: z.boolean().describe("Whether answer_draft was read in this call."),
  finalization_receipt: z.string().optional()
}).strict();

export type FinalizeResearchOutput = z.output<typeof finalizeResearchOutputSchema>;

export interface FinalizeResearchOptions {
  secret: string | undefined;
  now?: () => Date;
  // Rule, module and case names from the canonical protocols, which the answer
  // must not show (the rerun's answer headed its prompt with one).
  protocolNames?: ReadonlySet<string>;
}

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
        material_videos: []
      },
      sources: { validated: [], lead_only: [] },
      answer_checked: false
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
      for (const video of list(claims.videos)) offTargetVideos.add(video);
      continue;
    }
    if (kind === "youtube_survey") {
      surveys += 1;
      if (text(claims.access) !== "complete") partialSurveys += 1;
    }
    if (DISCOVERY_KINDS.has(kind)) {
      rounds.push(receipt);
      for (const video of list(claims.videos)) discovered.add(video);
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
  const openLeads = (input.open_leads ?? []).map(({ topic }) => topic);
  if (input.community_evidence === "not_relevant") {
    if (input.not_relevant_reason === undefined) {
      nextSteps.push(
        "Give not_relevant_reason, or research community evidence: scout_gemini_youtube_candidates " +
          "(survey_youtube_community only if the scout is unavailable), then audit_youtube_video_community for each " +
          "material video."
      );
    }
  } else {
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
    const angles = new Set(rounds.map((round) => text(round.claims.q) || `${round.kind}#${round.index}`)).size;
    // A search YouTube's rate limit or daily quota stopped cannot rerun until
    // it resets, so it ends a first pass as an open lead; deep research waits.
    firstPassComplete = input.research_depth === "first_pass" &&
      (saturated || auditedMaterial >= FIRST_PASS_AUDITED_VIDEOS || angles >= FIRST_PASS_ROUNDS ||
        saturation.rateLimited > 0);
    if (!saturated && firstPassComplete) {
      if (openLeads.length === 0) {
        nextSteps.push(
          "The first pass is done but discovery has not saturated: list open_leads (each topic or subtopic where more " +
            "community signal is likely, and why) so the answer can offer another pass." +
            (saturation.rateLimited > 0 ? " Include the searches YouTube's rate limit or daily quota stopped." : "")
        );
      } else {
        const estimate = input.another_pass_estimate === undefined ? undefined : withoutEndPunctuation(input.another_pass_estimate);
        if (estimate === undefined || !PASS_COST_AMOUNT.test(estimate)) {
          nextSteps.push(
            "Give another_pass_estimate: roughly what another pass over the open leads would take, with a number and " +
              "unit (for example, \"about 20 minutes and 15 YouTube searches\")."
          );
        } else {
          requireLimit(
            `First pass only; discovery had not saturated. End the answer with the open leads (${openLeads.join("; ")}), ` +
              "in plain language for the user (no video IDs or internal codes), why each looks promising and roughly what " +
              "another pass would cost, and ask whether to continue on all or part.",
            ...(input.open_leads ?? []).map(({ topic, why }) => `Open lead: ${topic.trim()}. ${asSentence(why)}`),
            `Another pass would take ${estimate}; want me to continue with all or some of these leads?`
          );
        }
        if (saturation.rateLimited > 0) {
          const stopped = saturation.rateLimited;
          requireLimit(
            `YouTube's rate limit or daily quota stopped ${stopped} search(es) in the latest discovery ` +
              "rounds; say so, and that another pass can rerun them once the limit resets.",
            `YouTube's daily search limit stopped ${stopped === 1 ? "1 search" : `${stopped} searches`} in this first ` +
              `pass; another pass can rerun ${stopped === 1 ? "it" : "them"} after the limit resets.`
          );
        }
      }
    } else {
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

  // Treatment coverage. The latest assess_treatment_landscape_coverage result
  // for this research target binds the answer, and a treatment comparison
  // needs one; a check made for another target does not count.
  const coverageChecks = verified.filter(({ kind }) => kind === "treatment_coverage");
  const forTarget = coverageChecks.filter(({ claims }) => text(claims.target) === targetDigest);
  const latest = Math.max(...forTarget.map(receiptOrder));
  // Checks the signed order cannot separate are all the latest; the most
  // restrictive of them binds, whatever order they came in.
  const coverage = forTarget.filter((receipt) => receiptOrder(receipt) === latest)
    .sort((left, right) =>
      coverageRestriction(right, input.research_depth) - coverageRestriction(left, input.research_depth))
    .at(0);
  if (coverageChecks.length > 0 && coverage === undefined) {
    nextSteps.push(
      "No assess_treatment_landscape_coverage receipt passed here was made for this research_target; pass the one " +
        "for this question, give research_target exactly as the check received it, or run the check again."
    );
  }
  const coverageBoundary = coverage === undefined ? undefined : text(coverage.claims.boundary);
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
  } else if (coverageBoundary === "first_pass_with_open_leads" && input.research_depth === "first_pass") {
    requireLimit(
      "The treatment comparison rests on a first pass: present it as provisional.",
      "This comparison rests on a first pass through the evidence, so treat it as provisional."
    );
  } else if (coverageBoundary !== "ledger_consistent_for_synthesis") {
    nextSteps.push(
      `The latest assess_treatment_landscape_coverage result was ${coverageBoundary}: fix its selection and depth ` +
        "blockers and call it again until it allows the answer" +
        (input.research_depth === "deep" ? " (deep research needs ledger_consistent_for_synthesis)." : ".")
    );
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
      requireLimit(
        `Cite ${source.id} as a lead: no open full text was available, so its methods were not audited.`,
        unreadStudyCaveat(id)
      );
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
        `Cite ${source.id} as a lead: PubMed lists no DOI, so no open full text could be acquired and its methods were not audited.`,
        unreadStudyCaveat(id)
      );
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
  if (input.key_sources.length === 0) {
    requireLimit(
      "No study was declared decision-critical; say that no study's methods were checked in full text.",
      "No study's methods were checked in full text for this answer."
    );
  }

  // The answer itself, read for this call only. HRP keeps internal states out
  // of the answer and links audited videos by title (ReaderFacingAnswer,
  // FS190), offers a long deeper-research prompt rather than pasting it
  // (LimitsNote), and the comments that were read must reach it (must_report).
  const draft = input.answer_draft;
  if (draft === undefined) {
    if (nextSteps.length === 0) {
      nextSteps.push(
        "Pass the answer you are about to give as answer_draft, exactly as the user will see it; the final check reads it."
      );
    }
  } else {
    nextSteps.push(...answerDraftProblems(draft, {
      commentsRead: commentVideos.size > 0,
      videoIds: [...new Set([...discovered, ...auditedAtAll])],
      protocolNames: options.protocolNames ?? new Set(),
      caveats,
      ...(input.community_findings === undefined ? {} : { effectOnAnswer: input.community_findings.effect_on_answer })
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
      material_videos: materialVideos
    },
    sources: { validated: validatedSources, lead_only: leadSources },
    answer_checked: draft !== undefined
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
      limits: limits.length
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

function answerDraftProblems(
  draft: string,
  context: {
    commentsRead: boolean;
    videoIds: string[];
    protocolNames: ReadonlySet<string>;
    caveats: readonly string[];
    effectOnAnswer?: string;
  }
): string[] {
  const problems: string[] = [];
  // Links may carry IDs and underscores legitimately; the words around them may not.
  const prose = draft.replace(URL, " ");
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
  if (context.commentsRead && !/youtube/iu.test(prose)) {
    problems.push(
      "The answer does not report the YouTube comments that were read. Add that lane from must_report, even if its " +
        "signal is weak."
    );
  } else if (context.commentsRead) {
    // The lane is the text after each mention of YouTube or comments; it must
    // carry what must_report lists, not just the word.
    const lane = [...prose.matchAll(/youtube|comment/giu)]
      .map(({ index }) => prose.slice(index, index + LANE_WINDOW_CHARACTERS)).join("\n");
    const missing: string[] = LANE_FINDINGS.filter(({ pattern }) => !pattern.test(lane)).map(({ label }) => label);
    if (!reportsEffectOnAnswer(lane, context.effectOnAnswer)) missing.push("what the comments mean for the answer");
    if (missing.length > 0) {
      problems.push(
        `The answer's YouTube comments section does not report ${missing.join(", ")}. Add each from must_report, ` +
          "and say none were reported where there were none."
      );
    }
  }
  // Each caveat the server wrote must reach the answer as a sentence of its own.
  const blocks = draftBlocks(draft);
  const missingCaveats = context.caveats.filter((caveat) => !statesCaveat(blocks, caveat));
  if (missingCaveats.length > 0) {
    problems.push(
      `The answer leaves out ${missingCaveats.length === 1 ? "this caveat" : "these caveats"}; include each as its ` +
        `own sentence, as written (a link's text may change): ${missingCaveats.map((caveat) => `"${caveat}"`).join(" ")}`
    );
  }
  return problems;
}

// Bounded and closed to brackets and parentheses, so a long draft is read in linear time.
const MARKDOWN_LINK = /\[[^[\]\n]{0,500}\]\(([^\s()[\]]{1,2048})\)/gu;

/**
 * Text as the caveat check compares it: a link by its target (so its text may
 * change), with quotes, dashes, emphasis, spacing and case ignored.
 */
function caveatForm(text: string): string {
  return text
    .replace(MARKDOWN_LINK, "$1")
    .replace(/[\u2018\u2019\u02BC]/gu, "'")
    .replace(/[\u201C\u201D]/gu, "\"")
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/[*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

// A list item, heading or quotation starts a block of its own.
const BLOCK_START = /^(?:[-*+]|\d{1,3}[.)])\s|^#{1,6}\s|^>/u;
const LIST_OR_HEADING_MARKER = /^(?:[-*+]|\d{1,3}[.)]|#{1,6})\s+/u;

const LIST_ITEM = /^(?:[-*+]|\d{1,3}[.)])\s/u;
const FENCE = /^(`{3,}|~{3,})/u;
const BACKTICK = 96;

/**
 * Text without inline code: as in CommonMark, a run of backticks opens a span
 * that the next run of the same length closes, and a run with no match is
 * literal. Runs are paired in one pass, so a long draft is read in linear time.
 */
function withoutCodeSpans(text: string): string {
  const runs: Array<{ start: number; end: number }> = [];
  for (let at = text.indexOf("`"); at >= 0; at = text.indexOf("`", at)) {
    const start = at;
    while (at < text.length && text.charCodeAt(at) === BACKTICK) at += 1;
    runs.push({ start, end: at });
  }
  // For each run, the next run of the same length.
  const closer = new Array<number>(runs.length).fill(-1);
  const laterByLength = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const length = runs[index]!.end - runs[index]!.start;
    closer[index] = laterByLength.get(length) ?? -1;
    laterByLength.set(length, index);
  }
  let result = "";
  let from = 0;
  for (let index = 0; index < runs.length; index += 1) {
    const close = closer[index]!;
    if (close < 0) continue;
    result += text.slice(from, runs[index]!.start);
    from = runs[close]!.end;
    index = close;
  }
  return result + text.slice(from);
}

/**
 * A code fence's marker, or undefined: a backtick fence's info string has no
 * backticks (otherwise the line starts with inline code), per CommonMark.
 */
function fenceMarker(line: string): string | undefined {
  const marker = FENCE.exec(line)?.[1];
  return marker !== undefined && marker.startsWith("`") && line.slice(marker.length).includes("`")
    ? undefined
    : marker;
}
const INDENTED = /^(?: {4}|\t)/u;

/** The draft without HTML comments, which are not displayed; their line breaks stay. */
function withoutHtmlComments(draft: string): string {
  let result = "";
  let from = 0;
  for (let open = draft.indexOf("<!--"); open >= 0; open = draft.indexOf("<!--", from)) {
    const close = draft.indexOf("-->", open + 4);
    const hidden = draft.slice(open, close < 0 ? draft.length : close + 3);
    result += draft.slice(from, open) + "\n".repeat(hidden.split("\n").length - 1);
    if (close < 0) return result;
    from = close + 3;
  }
  return result + draft.slice(from);
}

/**
 * The draft's paragraphs, list items and headings in caveat form, without
 * their list or heading markers; a wrapped line joins its paragraph. Text an
 * answer shows without stating is left out: code (fenced, indented or
 * inline) and HTML comments. A quotation keeps its marker, so a quoted caveat
 * is not stated either.
 */
function draftBlocks(draft: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | undefined;
  let indentedCode = false;
  // An indented paragraph after a list item continues it; elsewhere it is code.
  let inList = false;
  const flush = (): void => {
    if (current.length > 0) {
      blocks.push(caveatForm(withoutCodeSpans(current.join(" ")).replace(LIST_OR_HEADING_MARKER, "")));
    }
    current = [];
  };
  for (const line of withoutHtmlComments(draft).split(/\r?\n/u)) {
    const trimmed = line.trim();
    const marker = fenceMarker(trimmed);
    if (fence !== undefined) {
      // A closing fence repeats the opening character, at least as many times, and nothing else.
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length &&
        trimmed.slice(marker.length).trim() === "") fence = undefined;
      continue;
    }
    if (marker !== undefined) {
      flush();
      fence = marker;
      continue;
    }
    if (indentedCode) {
      if (trimmed === "" || INDENTED.test(line)) continue;
      indentedCode = false;
    }
    if (trimmed === "") {
      flush();
      continue;
    }
    if (BLOCK_START.test(trimmed)) {
      flush();
      inList = LIST_ITEM.test(trimmed);
    } else if (current.length === 0) {
      if (INDENTED.test(line) && !inList) {
        indentedCode = true;
        continue;
      }
      inList = inList && INDENTED.test(line);
    }
    current.push(trimmed);
  }
  flush();
  return blocks;
}

/**
 * Whether a caveat stands as a sentence of its own: it begins a block or
 * follows a sentence's end, and ends its sentence. Embedded ("It is false
 * that …"), quoted or continued, it is not stated.
 */
function statesCaveat(blocks: readonly string[], caveat: string): boolean {
  const core = caveatForm(caveat).replace(/[.!?]$/u, "");
  return blocks.some((block) => {
    for (let at = block.indexOf(core); at >= 0; at = block.indexOf(core, at + 1)) {
      const before = block.slice(Math.max(0, at - 2), at);
      const after = block.charAt(at + core.length);
      if ((at === 0 || /^[.!?] $/u.test(before)) && (after === "" || ".!?".includes(after))) return true;
    }
    return false;
  });
}

const videoLink = (video: string, text: string): string => `[${text}](https://www.youtube.com/watch?v=${video})`;

/** The caveat for a key study read only as a lead, linked by its identifier. */
function unreadStudyCaveat(id: string): string {
  // A DOI may contain parentheses, which would end a Markdown link.
  const url = isDoi(id)
    ? `https://doi.org/${id.replace(/\(/gu, "%28").replace(/\)/gu, "%29")}`
    : isPmid(id) ? `https://pubmed.ncbi.nlm.nih.gov/${id}/` : `https://www.ncbi.nlm.nih.gov/pmc/articles/${id}/`;
  return `The full text of [this study](${url}) was not openly available, so its methods were not checked.`;
}

/** Text without surrounding spaces or a closing period or semicolon, spaces made single. */
function withoutEndPunctuation(text: string): string {
  let result = text.replace(/\s+/gu, " ").trim();
  while (result.endsWith(".") || result.endsWith(";")) result = result.slice(0, -1).trimEnd();
  return result;
}

const asSentence = (text: string): string => {
  const trimmed = text.trim();
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized}.`;
};

// What another pass would take: a number or amount with a unit of time or work.
const PASS_COST_AMOUNT =
  /\b(?:(?:\d+|a few|a couple of|several|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty)(?: ?(?:to|-|\u2013|or) ?(?:\d+|two|three|four|five|ten|fifteen|twenty|thirty|sixty))? (?:more )?(?:minutes?|mins?|hours?|searches|search calls|tool calls|calls|rounds|passes|youtube searches)|(?:half )?an hour)\b/iu;

// How far after a mention of YouTube or comments the lane's findings are read.
const LANE_WINDOW_CHARACTERS = 1_200;
// What commenters reported, in the words an answer uses for each finding.
const LANE_FINDINGS = [
  {
    label: "benefit reports",
    pattern: /\b(?:help(?:s|ed)?|better|improv\w*|relie[fv]\w*|benefit\w*|work(?:s|ed)|eased|less pain|reduc\w*)\b/iu
  },
  {
    label: "no-effect reports",
    pattern: /\bno[ -](?:effect|change|difference|benefit|improvement|relief)\b|\b(?:did ?n[o']t|didn't|does ?n[o']t|doesn't) (?:help|work|change)\b|\bnothing changed\b|\bunchanged\b/iu
  },
  {
    label: "adverse reports",
    pattern: /\bside[ -]effects?\b|\badverse\b|\bharm\w*|\bworse\b|\breactions?\b|\binjur\w*|\bflare\w*/iu
  },
  {
    label: "how creators differ from commenters",
    pattern: /\b(?:creators?|channels?|hosts?|sellers?|sponsor\w*|affiliate\w*|presenters?|youtubers?|video makers?)\b/iu
  }
] as const;

// What the comments mean for the answer, in the words answers use for it.
const EFFECT_ON_ANSWER = new RegExp([
  "\\b(?:support(?:s|ed|ing)?|backs? up|backed up|consistent with|in line with|agrees? with|at odds with",
  "contradict\\w*|confirm\\w*|corroborat\\w*|strengthen\\w*|weaken\\w*|reinforc\\w*|undercut\\w*",
  "(?:does|do|did)(?: not|n['\u2019]t) (?:change|alter|affect|shift)",
  "(?:changes?|changed|alters?|shifts?) (?:the|this|our|my) (?:answer|conclusion|recommendation|advice|picture)",
  "adds? (?:little|nothing|weight|confidence)|no bearing on)\\b"
].join("|"), "iu");
// Common words that say nothing about what the comments mean.
const EFFECT_STOP_WORDS: ReadonlySet<string> = new Set([
  "about", "above", "after", "again", "against", "before", "because", "being", "below", "could", "every", "other",
  "their", "there", "these", "those", "through", "under", "until", "where", "which", "while", "would", "should",
  "answer", "comment", "comments", "commenters", "effect", "evidence", "people", "report", "reported", "reports",
  "signal", "video", "videos", "youtube"
]);

/**
 * The lane says what the comments mean for the answer: in words answers use
 * for it, or in at least two of the distinctive words of the model's own
 * effect_on_answer, so a paraphrase passes.
 */
function reportsEffectOnAnswer(lane: string, effect: string | undefined): boolean {
  if (EFFECT_ON_ANSWER.test(lane)) return true;
  const words = [...new Set(effect?.toLowerCase().match(/\p{L}{5,}/gu) ?? [])]
    .filter((word) => !EFFECT_STOP_WORDS.has(word));
  const laneWords = new Set(lane.toLowerCase().match(/\p{L}{5,}/gu) ?? []);
  return words.length > 0 && words.filter((word) => laneWords.has(word)).length >= Math.min(2, words.length);
}

function communityLane(
  findings: NonNullable<FinalizeResearchInput["community_findings"]>,
  videosRead: number
): string {
  return `YouTube comments (${videosRead} video(s) read): Benefits: ${findings.benefit_reports} ` +
    `No effect: ${findings.no_effect_reports} Adverse: ${findings.adverse_reports} Creators versus commenters: ` +
    `${findings.creators_versus_commenters} Effect on the answer: ${findings.effect_on_answer} Report this lane in ` +
    "the answer even if later sources dominate; if its signal is weak, say so.";
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
const FIRST_PASS_AUDITED_VIDEOS = 6;
const FIRST_PASS_ROUNDS = 4;

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
    for (const video of list(round.claims.videos)) {
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

/** Higher is stricter: a block, then no ranking, then a provisional first pass. */
function coverageRestriction(receipt: VerifiedReceipt, depth: "first_pass" | "deep"): number {
  const boundary = text(receipt.claims.boundary);
  const narrow = text(receipt.claims.broad) !== "true" ? 0.5 : 0;
  if (boundary === "ledger_consistent_for_synthesis") return 1 + narrow;
  if (boundary === "first_pass_with_open_leads" && depth === "first_pass") return 2 + narrow;
  if (boundary === "bounded_nonranking_only") return 3 + narrow;
  return 4 + narrow;
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}
