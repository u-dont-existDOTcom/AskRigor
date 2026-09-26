import { z } from "zod";

import {
  issueResearchReceipt,
  RESEARCH_RECEIPT_MAX_CHARACTERS,
  verifyResearchReceipt,
  type ResearchReceiptKind
} from "./research-receipts.js";

/**
 * Server-side completion gate for MCP research (finalize_research).
 *
 * The model passes the research receipts it received plus two declarations:
 * whether community evidence was researched, and which studies its answer
 * depends on. The gate verifies the receipts and answers with next steps
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
    .describe("Videos whose comments your answer draws on; defaults to every audited video."),
  key_sources: z.array(z.object({
    id: z.string().trim().min(1).max(300).describe("DOI, PMID or PMCID."),
    status: z.enum(["validated", "lead_only"]),
    reason: z.string().trim().min(1).max(1_000).optional()
  }).strict()).max(60)
    .describe("Each study your conclusions depend on: validated after a full-text method audit, or lead_only when the acquisition (or, for a PMID without a DOI, the PubMed record) receipt shows no open full text.")
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
  receipts_verified: z.number().int().nonnegative(),
  receipts_rejected: z.array(z.object({
    index: z.number().int().nonnegative(),
    reason: z.string()
  }).strict()),
  community: z.object({
    decision: z.enum(["researched", "not_relevant"]),
    surveys: z.number().int().nonnegative(),
    audited_videos: z.array(z.string()),
    material_videos: z.array(z.string())
  }).strict(),
  sources: z.object({
    validated: z.array(z.string()),
    lead_only: z.array(z.string())
  }).strict(),
  finalization_receipt: z.string().optional()
}).strict();

export type FinalizeResearchOutput = z.output<typeof finalizeResearchOutputSchema>;

export interface FinalizeResearchOptions {
  secret: string | undefined;
  now?: () => Date;
}

const TERMINAL_VIDEO_STATES = new Set([
  "api_visible_complete",
  "completed_with_access_boundary"
]);

interface VideoAudit {
  state: string;
  lock: string;
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
      receipts_verified: 0,
      receipts_rejected: [],
      community: {
        decision: input.community_evidence,
        surveys: 0,
        audited_videos: [],
        material_videos: []
      },
      sources: { validated: [], lead_only: [] }
    };
  }

  const verified: Array<{ kind: ResearchReceiptKind; claims: Record<string, string | string[]> }> = [];
  const rejected: FinalizeResearchOutput["receipts_rejected"] = [];
  input.receipts.forEach((token, index) => {
    const result = verifyResearchReceipt(token, {
      secret: options.secret!,
      ...(options.now === undefined ? {} : { now: options.now })
    });
    if (result.ok) verified.push({ kind: result.kind, claims: result.claims });
    else rejected.push({ index, reason: result.reason });
  });

  const nextSteps: string[] = [];
  const limits: string[] = [];
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
  for (const { kind, claims } of verified) {
    if (kind === "youtube_survey") {
      surveys += 1;
      if (text(claims.access) !== "complete") partialSurveys += 1;
    }
    if (kind === "youtube_survey" || kind === "youtube_scout" || kind === "youtube_search" ||
        kind === "youtube_community_audit") {
      for (const video of list(claims.videos)) discovered.add(video);
    }
    if (kind === "youtube_video_audit") {
      recordVideoAudit(audited, text(claims.video), text(claims.state), text(claims.lock));
    }
    if (kind === "youtube_community_audit") {
      surveys += 1;
      for (const video of list(claims.videos)) {
        recordVideoAudit(audited, video, text(claims.state), text(claims.lock));
      }
    }
  }
  const auditedVideos = [...audited.keys()].sort();
  let materialVideos: string[] = [];
  if (input.community_evidence === "not_relevant") {
    if (input.not_relevant_reason === undefined) {
      nextSteps.push(
        "Give not_relevant_reason, or research community evidence: survey_youtube_community, then audit_youtube_video_community for each material video."
      );
    }
  } else {
    if (surveys === 0) {
      nextSteps.push(
        "Survey community evidence with survey_youtube_community (widen the searches while new programs keep appearing), then audit each material video."
      );
    }
    if (partialSurveys > 0) {
      limits.push(
        `${partialSurveys} community survey(s) were only partly completed (some searches failed or hit limits); ` +
          "say the community picture may be incomplete."
      );
    }
    materialVideos = [...new Set(input.material_video_ids ?? auditedVideos)].sort();
    if (materialVideos.length === 0) {
      nextSteps.push(
        "Audit the material videos with audit_youtube_video_community, continuing with its continuation_token until each audit completes."
      );
    }
    for (const video of materialVideos) {
      if (!discovered.has(video)) {
        nextSteps.push(
          `Video ${video} is not among the videos found by the surveys, scouts or searches whose receipts were passed; ` +
            "pass the receipt of the discovery call that found it, or drop it from material_video_ids."
        );
      }
      const audit = audited.get(video);
      if (audit === undefined) {
        nextSteps.push(
          `Audit video ${video} with audit_youtube_video_community and continue until the audit completes.`
        );
        continue;
      }
      if (audit.state === "completed_with_access_boundary") {
        limits.push(
          `Comments on video ${video} were only partly accessible; treat its community signal as bounded.`
        );
      } else if (audit.lock === "block") {
        limits.push(
          `The comment audit of video ${video} ended with blockers; its community signal cannot carry a conclusion on its own.`
        );
      }
    }
  }

  // Key studies.
  const validatedIds = new Set<string>();
  const leadIds = new Set<string>();
  // PMID -> DOI ("" when the PubMed record has none), from fetch_pubmed_record receipts.
  const pubmedDois = new Map<string, string>();
  for (const { kind, claims } of verified) {
    if (kind === "pubmed_record" && typeof claims.pmid === "string") {
      pubmedDois.set(normalizeIdentifier(claims.pmid), typeof claims.doi === "string" ? normalizeIdentifier(claims.doi) : "");
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
      leadSources.push(source.id);
      limits.push(
        `Cite ${source.id} as a lead: no open full text was available, so its methods were not audited.`
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
    if (isPmid(id) && pubmedDoi === "") {
      // PubMed lists no DOI, so the open full-text chain cannot run; the lead is proven.
      leadSources.push(source.id);
      limits.push(
        `Cite ${source.id} as a lead: PubMed lists no DOI, so no open full text could be acquired and its methods were not audited.`
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
    limits.push(
      "No study was declared decision-critical; say that no study's methods were checked in full text."
    );
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
    receipts_verified: verified.length,
    receipts_rejected: rejected,
    community: {
      decision: input.community_evidence,
      surveys,
      audited_videos: auditedVideos,
      material_videos: materialVideos
    },
    sources: { validated: validatedSources, lead_only: leadSources }
  };
  if (status !== "not_ready") {
    output.finalization_receipt = issueResearchReceipt("finalization", {
      status,
      community: input.community_evidence,
      receipts: verified.length,
      videos: materialVideos.length,
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

function recordVideoAudit(
  audited: Map<string, VideoAudit>,
  video: string,
  state: string,
  lock: string
): void {
  if (video.length === 0 || !TERMINAL_VIDEO_STATES.has(state)) return;
  const previous = audited.get(video);
  // A later complete audit of the same video supersedes a bounded one.
  if (previous === undefined || previous.state !== "api_visible_complete") {
    audited.set(video, { state, lock });
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

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}
