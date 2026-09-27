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
      "it is checked for internal labels, bare video IDs, a pasted long prompt, the comment lane and each listed " +
      "limit (in the sentence that names what it qualifies), and is not stored.")
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
  // What each limit needs the answer to say, so the final check can find it
  // in the draft; the limit's own sentence always satisfies its check.
  const limitChecks: LimitCheck[] = [];
  const requireLimit = (text: string, ...checks: LimitCheck[]): void => {
    limits.push(text);
    limitChecks.push(...checks);
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
        LIMIT_CHECKS.incomplete
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
        requireLimit(
          `First pass only; discovery had not saturated. End the answer with the open leads (${openLeads.join("; ")}), ` +
            "in plain language for the user (no video IDs or internal codes), why each looks promising and roughly what " +
            "another pass would cost, and ask whether to continue on all or part.",
          ...openLeadsChecks(input.open_leads ?? [])
        );
        if (saturation.rateLimited > 0) {
          requireLimit(
            `YouTube's rate limit or daily quota stopped ${saturation.rateLimited} search(es) in the latest discovery ` +
              "rounds; say so, and that another pass can rerun them once the limit resets.",
            LIMIT_CHECKS.searchLimit
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
            LIMIT_CHECKS.notChecked
          );
        } else {
          requireLimit(
            `No video turned up in ${rounds.length} discovery rounds; say that community evidence on this is thin.`,
            LIMIT_CHECKS.thin
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
          LIMIT_CHECKS.thin
        );
      }
    }
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
        requireLimit(
          `Comments on video ${video} were only partly accessible; treat its community signal as bounded.`,
          LIMIT_CHECKS.partlyAccessible(video)
        );
      } else if (audit.lock === "block") {
        requireLimit(
          `The comment audit of video ${video} ended with blockers; its community signal cannot carry a conclusion on its own.`,
          LIMIT_CHECKS.notOnItsOwn(video)
        );
      }
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
      LIMIT_CHECKS.noRanking
    );
  } else if (coverageBoundary === "first_pass_with_open_leads" && input.research_depth === "first_pass") {
    requireLimit("The treatment comparison rests on a first pass: present it as provisional.", LIMIT_CHECKS.provisional);
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
    }
  }
  // Every identifier the answer may cite each key study by: its own, and the
  // DOI, PMCID or PMID its PubMed record receipt links to it.
  const citedAs = input.key_sources.map((source) => {
    const id = normalizeIdentifier(source.id);
    const linked = isPmid(id)
      ? [pubmedDois.get(id) ?? "", pubmedPmcids.get(id) ?? ""]
      : [...pubmedDois].filter(([, doi]) => doi === id).map(([pmid]) => pmid);
    return [...new Set([id, ...linked])].filter((identifier) => identifier !== "");
  });
  const leadCheck = (index: number, source: string): LimitCheck =>
    LIMIT_CHECKS.notReadInFull(source, citedAs[index]!, citedAs.filter((_, other) => other !== index));
  const validatedSources: string[] = [];
  const leadSources: string[] = [];
  for (const [index, source] of input.key_sources.entries()) {
    const id = normalizeIdentifier(source.id);
    // A PMID's DOI (from its PubMed record receipt) also identifies the study.
    const pubmedDoi = isPmid(id) ? pubmedDois.get(id) : undefined;
    const ids = pubmedDoi === undefined || pubmedDoi === "" ? [id] : [id, pubmedDoi];
    if (ids.some((candidate) => validatedIds.has(candidate))) {
      validatedSources.push(source.id);
      continue;
    }
    if (ids.some((candidate) => leadIds.has(candidate))) {
      leadSources.push(source.id);
      requireLimit(
        `Cite ${source.id} as a lead: no open full text was available, so its methods were not audited.`,
        leadCheck(index, source.id)
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
        leadCheck(index, source.id)
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
      LIMIT_CHECKS.noStudyChecked
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
      limitChecks,
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
    limitChecks: readonly LimitCheck[];
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
  // Each limit this research carries must reach the answer, next to what it qualifies.
  const sentences = draftSentences(draft);
  const missingLimits = [...new Set(context.limitChecks.filter(({ met }) => !met(sentences)).map(({ label }) => label))];
  if (missingLimits.length > 0) {
    problems.push(
      `The answer leaves out required limits: ${missingLimits.join("; ")}. State each in plain words, in the ` +
        "sentence that names what it qualifies, as the limits list below says."
    );
  }
  return problems;
}

/** One sentence of the answer draft, with its links and without them. */
interface DraftSentence {
  raw: string;
  prose: string;
  words: ReadonlySet<string>;
  // The paragraph or list item it belongs to; a heading joins the block after it.
  block: number;
}

interface LimitCheck {
  label: string;
  met: (sentences: readonly DraftSentence[]) => boolean;
}

// A heading, or a line that is only bold text, introduces the block after it.
const HEADING_LINE = /^(?:#{1,6}\s.*|(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*[^*]+\*\*|__[^_]+__):?)$/u;

function draftSentences(draft: string): DraftSentence[] {
  const blocks: string[] = [];
  let heading = "";
  for (const line of draft.split(/\r?\n/u).map((text) => text.trim()).filter((text) => text !== "")) {
    if (HEADING_LINE.test(line)) {
      heading = heading === "" ? line : `${heading}. ${line}`;
      continue;
    }
    blocks.push(heading === "" ? line : `${heading}. ${line}`);
    heading = "";
  }
  if (heading !== "") blocks.push(heading);
  return blocks.flatMap((block, index) => block.split(/(?<=[.!?])\s+/u).map((raw) => {
    const prose = raw.replace(URL, " ");
    return { raw, prose, words: new Set(prose.toLowerCase().match(/\p{L}{4,}/gu) ?? []), block: index };
  }));
}

/** The sentence at index and its neighbors in the same paragraph or list item. */
function nearby(sentences: readonly DraftSentence[], index: number): DraftSentence[] {
  const block = sentences[index]!.block;
  return sentences.filter((sentence, other) => Math.abs(other - index) <= 1 && sentence.block === block);
}

/**
 * A limit stated next to what it qualifies: in a sentence that names the item,
 * or in the sentence before or after it within the same paragraph or list
 * item, unless that sentence names another item of the same kind.
 */
function statedNear(
  label: string,
  names: (sentence: DraftSentence) => boolean,
  qualifies: (sentence: DraftSentence) => boolean,
  namesOther: (sentence: DraftSentence) => boolean = () => false
): LimitCheck {
  return {
    label,
    met: (sentences) => sentences.some((sentence, index) =>
      names(sentence) &&
      nearby(sentences, index).some((near) => (near === sentence || !namesOther(near)) && qualifies(near)))
  };
}

const matches = (pattern: RegExp) => (sentence: DraftSentence): boolean => pattern.test(sentence.prose);
/** A limit stated in one sentence that matches every pattern. */
const stated = (label: string, ...patterns: RegExp[]): LimitCheck => ({
  label,
  met: (sentences) => sentences.some((sentence) => patterns.every((pattern) => pattern.test(sentence.prose)))
});

const COMMUNITY =
  /\b(?:youtube|videos?|comments?|commenters?|viewers?|community|firsthand|first-hand|forums?|anecdot\w*|experiences?|people (?:who|posting|commenting|online))\b/iu;
const SEARCH_LIMIT = /\b(?:quota|rate[- ]?limit(?:ed|s)?|daily (?:search )?limit|search limit|youtube['’]?s? limit)\b/iu;
const NO_SEARCH_LIMIT = /\b(?:no|never|without) (?:\S+ ){0,2}?(?:quota|rate[- ]?limits?|daily (?:search )?limit|search limit)\b/iu;
const LIMIT_STOPPED =
  /\b(?:stopp(?:ed|ing)|stops?|cut (?:short|off)|blocked|halted|interrupted|prevented|hit|reached|ran out|run out|exhausted|used up|could(?:n['’]t| not) (?:run|finish|complete)|did(?:n['’]t| not) (?:run|finish|complete)|unfinished|incomplete)\b/iu;
const LIMIT_RERUN =
  /\b(?:re-?run|run (?:them |it |those |these )?again|another pass|next pass|second pass|try(?:ing)? (?:them |it )?again|retry|resets?|tomorrow)\b/iu;
const VIDEO_LINK = /(?:youtube\.com\/(?:watch\?(?:[^\s)&]*&)*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gu;
const linkedVideos = (raw: string): string[] => [...raw.matchAll(VIDEO_LINK)].map(([, id]) => id!);
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Whether text cites a study identifier (normalized), bare or inside a link. */
function citesIdentifier(raw: string, identifier: string): boolean {
  const forms = isDoi(identifier) ? [identifier, encodeURIComponent(identifier)] : [identifier];
  return forms.some((form) =>
    new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(form)}(?![A-Za-z0-9])`, "iu").test(raw));
}

// Each pattern takes the answer's own words for the limit. A community limit
// shares a sentence with a mention of the community evidence; a video's or a
// study's sits next to its link or identifier.
const LIMIT_CHECKS = {
  incomplete: stated(
    "that the community picture may be incomplete",
    COMMUNITY,
    /\b(?:incomplete|partial(?:ly)?|not (?:all|every) (?:searches|search|videos?|comments?|results?)|not complete|some searches (?:failed|did(?:n['’]t| not)|were (?:stopped|cut)|stopped|hit)|may be missing|missing some|limited (?:search|coverage|picture))/iu
  ),
  searchLimit: {
    label: "that YouTube's search limit stopped some searches, and that another pass can rerun them once it resets",
    met: (sentences) => sentences.some((sentence, index) => {
      if (!SEARCH_LIMIT.test(sentence.prose) || NO_SEARCH_LIMIT.test(sentence.prose)) return false;
      const around = nearby(sentences, index).map(({ prose }) => prose).join(" ");
      return LIMIT_STOPPED.test(around) && LIMIT_RERUN.test(around);
    })
  } satisfies LimitCheck,
  notChecked: stated(
    "that community evidence could not be checked yet",
    COMMUNITY,
    /\b(?:could(?:n['’]t| not)(?: yet)? (?:be )?(?:check|search|look|read)|not (?:yet )?(?:been )?(?:checked|searched)|unchecked)/iu
  ),
  thin: stated(
    "that community evidence on this is thin",
    COMMUNITY,
    /\b(?:thin|scarce|sparse|not much|hardly any|lack(?:s|ing)?|(?:very )?little (?:evidence|signal|discussion|data|to go on)|limited (?:evidence|signal|discussion|data)|(?<!\ba )few (?:videos?|reports?|people|commenters|sources|posts)|no (?:useful |relevant |firsthand )?(?:videos?|community|evidence|reports?))\b/iu
  ),
  partlyAccessible: (video: string) => statedNear(
    `that some comments on video ${video} could not be read, next to its linked title`,
    (sentence) => linkedVideos(sentence.raw).includes(video),
    matches(/\b(?:partly|partially|partial|not all (?:the |of the )?comments|some comments|could(?:n['’]t| not) (?:be )?(?:read|accessed|retrieved|loaded)|inaccessible|restricted|limited access)/iu),
    (sentence) => linkedVideos(sentence.raw).some((other) => other !== video)
  ),
  notOnItsOwn: (video: string) => statedNear(
    `that the comments on video ${video} cannot carry a conclusion on their own, next to its linked title`,
    (sentence) => linkedVideos(sentence.raw).includes(video),
    matches(/\b(?:on (?:its|their) own|by (?:itself|themselves)|alone)\b|\bcan(?:not|['’]t) (?:carry|support|settle|decide|establish|stand)\b|\b(?:not enough|too (?:limited|few|thin|weak|incomplete)) (?:to|for)\b|\b(?:weak|limited|thin|incomplete|partial) (?:signal|evidence|picture)\b/iu),
    (sentence) => linkedVideos(sentence.raw).some((other) => other !== video)
  ),
  noRanking: stated(
    "that the options are not ranked or one recommended",
    /\b(?:(?:can(?:not|['’]t)|won['’]t|do(?:es)? not|don['’]t|not) (?:(?:yet )?rank|recommend|say which|pick|choose)|no (?:clear )?(?:winner|ranking|best option)|without (?:a )?ranking)/iu
  ),
  provisional: stated(
    "that the treatment comparison is provisional",
    /\b(?:provisional|preliminary|first pass|initial (?:look|pass|scan|search)|tentative|may change|not (?:yet )?(?:final|complete))\b/iu
  ),
  // own: the study's identifiers; others: every other key study's.
  notReadInFull: (source: string, own: readonly string[], others: ReadonlyArray<readonly string[]>) => statedNear(
    `that ${source} was not read in full, next to where the answer cites it by link or identifier`,
    (sentence) => own.some((identifier) => citesIdentifier(sentence.raw, identifier)),
    matches(/\b(?:not (?:been )?(?:read|checked|audited|verified|reviewed)|n['’]t (?:been )?(?:read|checked|audited|verified)|could(?:n['’]t| not) (?:be )?(?:read|checked|obtained|accessed)|unverified|paywall\w*|abstracts? only|only (?:the |its |their |an )?abstracts?|full text (?:was |is )?(?:not|n['’]t|un)available|no (?:open |free )?full text|as a lead|leads? only)/iu),
    (sentence) => others.some((identifiers) => identifiers.some((identifier) => citesIdentifier(sentence.raw, identifier)))
  ),
  noStudyChecked: stated(
    "that no study's methods were checked in full text",
    /\b(?:no stud(?:y|ies)|none of the studies)\b[^.!?]*\b(?:methods?|full[- ]?text|in full)\b|\bnot (?:been )?(?:read|checked|audited|verified) in full\b|\bmethods? (?:were|was) not (?:read|checked|audited)\b/iu
  )
} as const;

const OFFERS_ANOTHER_PASS =
  /\b(?:(?:another|a second|a deeper|a further|the next|one more) (?:pass|round|search|look)|continue|dig deeper|keep (?:going|looking|searching)|want me to|would you like|shall I|should I)\b/iu;
// What another pass would take, in the answer's words.
const PASS_COST_SUBJECT =
  /\b(?:(?:another|a second|a deeper|a further|the next|one more|each) (?:pass|round|search|look)|continu\w*|dig(?:ging)? deeper|follow(?:ing)?[- ]?up|more (?:searches|research|rounds|digging)|would (?:take|cost|need|use|add))\b/iu;
const PASS_COST_AMOUNT =
  /\b(?:(?:\d+|a few|a couple of|several|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty)(?:\s*(?:to|-|–|or)\s*(?:\d+|two|three|four|five|ten|fifteen|twenty|thirty|sixty))?\s+(?:more\s+)?(?:minutes?|mins?|hours?|searches|search calls|tool calls|calls|rounds|passes)|(?:half )?an hour)\b/iu;
// Common words that do not identify a lead or its reason.
const LEAD_STOP_WORDS: ReadonlySet<string> = new Set([
  "about", "after", "also", "been", "because", "both", "could", "does", "each", "from", "have", "into", "just",
  "like", "many", "more", "most", "much", "only", "over", "said", "says", "some", "such", "than", "that", "their",
  "them", "then", "there", "these", "they", "this", "those", "very", "were", "what", "when", "where", "which",
  "while", "will", "with", "would", "your"
]);
const distinctiveWords = (text: string): string[] =>
  [...new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? [])].filter((word) => !LEAD_STOP_WORDS.has(word));

/**
 * A first pass's open leads reach the answer: each named (half its topic's
 * words in one sentence) with its reason next to it (words from its `why`),
 * roughly what another pass would take, and an offer to continue.
 */
function openLeadsChecks(leads: ReadonlyArray<{ topic: string; why: string }>): LimitCheck[] {
  const topicWords = leads.map(({ topic }) => distinctiveWords(topic));
  // A topic of short words only ("tai chi") is named by its whole text.
  const namesLead = (index: number) => (sentence: DraftSentence): boolean => {
    const words = topicWords[index]!;
    return words.length === 0
      ? sentence.prose.toLowerCase().includes(leads[index]!.topic.trim().toLowerCase())
      : words.filter((word) => sentence.words.has(word)).length >= Math.ceil(words.length / 2);
  };
  return [
    ...leads.map(({ topic, why }, index) => {
      const reasonWords = distinctiveWords(why).filter((word) => !topicWords[index]!.includes(word));
      const needed = reasonWords.length >= 3 ? Math.max(2, Math.ceil(reasonWords.length / 3)) : Math.min(1, reasonWords.length);
      return statedNear(
        `why the open lead "${topic}" looks promising, next to it`,
        namesLead(index),
        (sentence) => reasonWords.filter((word) => sentence.words.has(word)).length >= needed,
        (sentence) => leads.some((_, other) => other !== index && namesLead(other)(sentence))
      );
    }),
    {
      label: "roughly what another pass would take, such as the minutes or searches",
      met: (sentences) => sentences.some((sentence) => PASS_COST_SUBJECT.test(sentence.prose) && PASS_COST_AMOUNT.test(sentence.prose))
    },
    stated("an offer to continue on all or part of the open leads", OFFERS_ANOTHER_PASS)
  ];
}

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
