import { ACCESS_STATUSES } from "@askrigor/contracts";
import { z } from "zod";

import {
  accessBoundarySchema,
  assessTreatmentLandscapeCoverage,
  deriveExternalScoutFrontierDigest,
  detailText,
  directionalSearchSchema,
  materialitySchema,
  omissionImpactSchema,
  outputDisplayText,
  PROGRAM_NOT_DESCRIBED,
  programField,
  programFingerprintSchema,
  shortId,
  treatmentClassSchema,
  treatmentLandscapeCoverageOutputSchema,
  youtubeVideoId,
  type DiscussionCoverageReceipt,
  type TreatmentLandscapeCoverageInput
} from "./actions/treatment-landscape-coverage-route.js";
import {
  discoveryQueryDigest,
  RESEARCH_RECEIPT_MAX_CHARACTERS,
  receiptIssueOrder,
  researchTargetDigest,
  verifyResearchReceipt,
  type ResearchReceiptKind
} from "./research-receipts.js";

/**
 * Treatment-landscape coverage from signed research receipts (MCP).
 *
 * The full coverage ledger asks the model to copy what the server already
 * signed: discovery rounds, their videos and pagination, audit results and
 * scout frontiers. Here the model passes its receipts plus only its judgment
 * (treatment classes, program details, which video belongs where, which were
 * selected and why others were not), and the server builds the rest of the
 * ledger from receipts for the same research target, then runs the unchanged
 * checker on it. Server-made records are never material, so they cannot
 * satisfy a material check.
 */

const receiptIndex = z.number().int().min(0).max(299);

export const treatmentCoverageFromReceiptsInputSchema = z.object({
  research_target: detailText.describe(
    "The research target every discovery tool received, copied exactly; only receipts for it count."
  ),
  broad_treatment_choice: z.boolean(),
  research_depth: z.enum(["first_pass", "deep"]).optional()
    .describe("first_pass unless the user or an automated research brief asked for deep research."),
  substantial_youtube_corpus: z.enum(["yes", "no", "unknown"]),
  further_expansion_likely_to_improve_answer: z.enum(["yes", "no", "blocked"]),
  receipts: z.array(z.string().max(RESEARCH_RECEIPT_MAX_CHARACTERS)).min(1).max(300)
    .describe("Every research_receipt from discovery and comment audits so far, copied exactly."),
  treatment_classes: z.array(treatmentClassSchema).min(1).max(80),
  program_fingerprints: z.array(programFingerprintSchema).max(120),
  rounds: z.array(z.object({
    receipt: receiptIndex.describe("Index of the discovery round's receipt in receipts."),
    treatment_class_ids: z.array(shortId).max(30).default([])
      .describe("Classes this round searched for; classes of the videos it found are added."),
    queries: z.array(z.string().trim().min(1).max(5_000)).min(1).max(12).optional()
      .describe("The round's exact executed queries (a scout round: its rediscovery leads); needed for a specific-program search on this round.")
  }).strict()).max(60).default([]),
  selected_videos: z.array(z.object({
    video_id: youtubeVideoId,
    fingerprint_id: shortId,
    stage_or_baseline: outputDisplayText,
    outcome_and_horizon: outputDisplayText,
    nonredundant_value: outputDisplayText,
    what_it_changed: outputDisplayText
  }).strict()).max(15).default([]),
  screened_videos: z.array(z.object({
    video_id: youtubeVideoId,
    fingerprint_id: shortId,
    materiality: materialitySchema,
    omission_impact: omissionImpactSchema,
    omission_rationale: detailText,
    duplicate_of_video_id: youtubeVideoId.optional(),
    access_boundary_id: shortId.optional()
      .describe("Only for a video that could not be opened: its candidate_video access boundary.")
  }).strict()).max(100).default([])
    .describe("Discovered videos not selected for audit that are material, uncertain, or tied to a described program."),
  not_material_videos: z.array(z.object({
    treatment_class_id: shortId,
    video_ids: z.array(youtubeVideoId).min(1).max(100)
  }).strict()).max(80).default([])
    .describe("Discovered videos screened as not material, grouped by treatment class."),
  specific_searches: z.array(z.object({
    round: receiptIndex.describe("Index of the round's receipt in receipts."),
    treatment_class_id: shortId,
    implementation_terms: z.array(programField).min(1).max(8),
    discriminator_terms: z.array(programField).min(1).max(8)
  }).strict()).max(120).default([]),
  directional_searches: z.object({
    benefit: directionalSearchSchema,
    no_effect_or_failure: directionalSearchSchema,
    harm: directionalSearchSchema,
    discontinuation: directionalSearchSchema,
    eventual_standard_treatment: directionalSearchSchema
  }).strict(),
  access_boundaries: z.array(accessBoundarySchema).max(80).default([])
    .describe("Access boundaries for videos, classes and other scopes. The server states a discovery round's own " +
      "boundary when its receipt shows a rate limit, the daily search quota or a refusal; supply one only for a " +
      "round that is partial or failed for another reason.")
}).strict();

export type TreatmentCoverageFromReceiptsInput = z.output<typeof treatmentCoverageFromReceiptsInputSchema>;

export const receiptDerivationSchema = z.object({
  receipts_verified: z.number().int().nonnegative(),
  receipts_rejected: z.array(z.object({ index: z.number().int().nonnegative(), reason: z.string() }).strict()),
  discovery_rounds: z.number().int().nonnegative(),
  rounds_for_other_targets: z.number().int().nonnegative(),
  candidate_videos: z.number().int().nonnegative(),
  unscreened_videos: z.array(z.string()),
  audited_videos: z.array(z.string()),
  scout_frontier_videos: z.number().int().nonnegative(),
  open_scout_titles: z.number().int().nonnegative()
    .describe("Titles scouts named but could not look up; search them by exact title with search_youtube."),
  access_boundaries_derived: z.number().int().nonnegative()
    .describe("Discovery rounds whose access boundary the server stated from the round's receipt."),
  input_problems: z.array(z.string())
}).strict();

export const treatmentCoverageFromReceiptsOutputSchema = treatmentLandscapeCoverageOutputSchema.extend({
  receipt_derivation: receiptDerivationSchema
});

export type TreatmentCoverageFromReceiptsOutput = z.output<typeof treatmentCoverageFromReceiptsOutputSchema>;

export interface TreatmentCoverageFromReceiptsOptions {
  secret: string;
  now?: () => Date;
}

const DISCOVERY_KINDS: ReadonlySet<ResearchReceiptKind> = new Set([
  "youtube_survey", "youtube_search", "youtube_scout", "youtube_community_audit"
]);
const TERMINAL_AUDIT_STATES = new Set(["api_visible_complete", "completed_with_access_boundary"]);
const UNASSIGNED_CLASS = "server:unassigned";
const UNSCREENED_FINGERPRINT = "server:unscreened";

interface Receipt {
  index: number;
  kind: ResearchReceiptKind;
  claims: Record<string, string | string[]>;
  order: number;
}

type Ledger = TreatmentLandscapeCoverageInput;
type Candidate = Ledger["candidate_videos"][number];

export function assessTreatmentCoverageFromReceipts(
  rawInput: unknown,
  options: TreatmentCoverageFromReceiptsOptions
): TreatmentCoverageFromReceiptsOutput {
  const input = treatmentCoverageFromReceiptsInputSchema.parse(rawInput);
  const problems: string[] = [];

  // Verified receipts, each token once.
  const verified: Receipt[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];
  const seen = new Set<string>();
  input.receipts.forEach((token, index) => {
    if (seen.has(token)) return;
    seen.add(token);
    const result = verifyResearchReceipt(token, {
      secret: options.secret,
      ...(options.now === undefined ? {} : { now: options.now })
    });
    if (!result.ok) {
      rejected.push({ index, reason: result.reason });
      return;
    }
    verified.push({
      index,
      kind: result.kind,
      claims: result.claims,
      order: receiptIssueOrder({ claims: result.claims, issued_at: result.issued_at })
    });
  });
  if (rejected.length > 0) {
    problems.push(
      `${rejected.length} receipt(s) failed verification; pass each research_receipt exactly as the tool returned it.`
    );
  }

  // Discovery for this research target, in signed issue order.
  const targetDigest = researchTargetDigest(input.research_target);
  const discovery = verified.filter(({ kind }) => DISCOVERY_KINDS.has(kind));
  const rounds = discovery.filter(({ claims }) => text(claims.target) === targetDigest);
  const roundByIndex = new Map(rounds.map((round) => [round.index, round]));
  if (rounds.length === 0) {
    problems.push(
      "No discovery receipt passed here was made for this research_target; pass the discovery receipts and the " +
        "research target exactly as the discovery tools received it."
    );
  }

  // Latest terminal per-video audit, by signed order.
  const auditByVideo = new Map<string, Receipt>();
  for (const receipt of verified) {
    if (receipt.kind !== "youtube_video_audit") continue;
    const video = text(receipt.claims.video);
    if (video === "" || !TERMINAL_AUDIT_STATES.has(text(receipt.claims.state))) continue;
    const previous = auditByVideo.get(video);
    if (previous === undefined || receipt.order >= previous.order) auditByVideo.set(video, receipt);
  }

  // The model's judgment. IDs starting "server:" are the server's own records.
  for (const id of [
    ...input.treatment_classes.map(({ class_id }) => class_id),
    ...input.program_fingerprints.map(({ fingerprint_id }) => fingerprint_id),
    ...input.access_boundaries.map(({ boundary_id }) => boundary_id)
  ]) {
    if (id.startsWith("server:")) {
      problems.push(`ID ${id} is reserved for server-made records; rename it.`);
    }
  }
  const classById = new Map(input.treatment_classes.map((entry) => [entry.class_id, entry]));
  const fingerprintById = new Map(input.program_fingerprints.map((entry) => [entry.fingerprint_id, entry]));
  const roundMapping = new Map<number, TreatmentCoverageFromReceiptsInput["rounds"][number]>();
  for (const mapping of input.rounds) {
    if (!roundByIndex.has(mapping.receipt)) {
      problems.push(
        `rounds lists receipt ${mapping.receipt}, which is not a verified discovery receipt for this research target.`
      );
      continue;
    }
    if (roundMapping.has(mapping.receipt)) {
      problems.push(`rounds lists receipt ${mapping.receipt} more than once.`);
      continue;
    }
    roundMapping.set(mapping.receipt, mapping);
  }

  // Verified query text per round: the queries must reproduce the signed digest.
  const queryText = new Map<number, string>();
  for (const [index, mapping] of roundMapping) {
    if (mapping.queries === undefined) continue;
    const round = roundByIndex.get(index)!;
    const queries = round.kind === "youtube_scout"
      ? [input.research_target, ...mapping.queries]
      : mapping.queries;
    if (discoveryQueryDigest(queries) !== text(round.claims.q)) {
      problems.push(
        `The queries given for receipt ${index} do not match what that round signed; give its exact executed ` +
          "queries (for a scout round, its rediscovery leads)."
      );
      continue;
    }
    queryText.set(index, queries.join(" | "));
  }

  const classification = new Map<string, {
    selection: "selected" | "screened_not_selected" | "inaccessible";
    classId: string;
    fingerprintId: string;
    materiality: z.output<typeof materialitySchema>;
    omissionImpact: z.output<typeof omissionImpactSchema>;
    omissionRationale: string;
    accessBoundaryId?: string;
    duplicateOf?: string;
  }>();
  const classify = (videoId: string, entry: Parameters<typeof classification.set>[1]): void => {
    if (classification.has(videoId)) {
      problems.push(`Video ${videoId} is listed more than once across selected, screened and not-material videos.`);
      return;
    }
    classification.set(videoId, entry);
  };
  const classOfFingerprint = (fingerprintId: string): string =>
    fingerprintById.get(fingerprintId)?.treatment_class_id ?? UNASSIGNED_CLASS;
  for (const video of input.selected_videos) {
    const fingerprint = fingerprintById.get(video.fingerprint_id);
    classify(video.video_id, {
      selection: "selected",
      classId: classOfFingerprint(video.fingerprint_id),
      fingerprintId: video.fingerprint_id,
      materiality: fingerprint?.materiality === "uncertain" ? "uncertain" : "material",
      omissionImpact: "not_decision_relevant",
      omissionRationale: "Selected for audit."
    });
  }
  for (const video of input.screened_videos) {
    classify(video.video_id, {
      selection: video.access_boundary_id === undefined ? "screened_not_selected" : "inaccessible",
      classId: classOfFingerprint(video.fingerprint_id),
      fingerprintId: video.fingerprint_id,
      materiality: video.materiality,
      omissionImpact: video.omission_impact,
      omissionRationale: video.omission_rationale,
      ...(video.access_boundary_id === undefined ? {} : { accessBoundaryId: video.access_boundary_id }),
      ...(video.duplicate_of_video_id === undefined ? {} : { duplicateOf: video.duplicate_of_video_id })
    });
  }
  const notMaterialFingerprintByClass = new Map<string, string>();
  for (const group of input.not_material_videos) {
    if (!classById.has(group.treatment_class_id)) {
      problems.push(`not_material_videos names unknown treatment class ${group.treatment_class_id}.`);
    }
    const fingerprintId = notMaterialFingerprintByClass.get(group.treatment_class_id) ??
      `server:not_material:${notMaterialFingerprintByClass.size + 1}`;
    notMaterialFingerprintByClass.set(group.treatment_class_id, fingerprintId);
    for (const videoId of group.video_ids) {
      classify(videoId, {
        selection: "screened_not_selected",
        classId: group.treatment_class_id,
        fingerprintId,
        materiality: "not_material",
        omissionImpact: "not_decision_relevant",
        omissionRationale: "Screened as not material to the research target."
      });
    }
  }

  // Candidates: every video this target's discovery found.
  const roundsByVideo = new Map<string, Receipt[]>();
  for (const round of rounds) {
    for (const videoId of unique(list(round.claims.videos))) {
      const found = roundsByVideo.get(videoId) ?? [];
      found.push(round);
      roundsByVideo.set(videoId, found);
    }
  }
  for (const videoId of classification.keys()) {
    if (!roundsByVideo.has(videoId)) {
      problems.push(
        `Video ${videoId} is not among the videos this research target's discovery receipts found; pass the ` +
          "receipt of the round that found it, or leave it out."
      );
    }
  }
  const unscreened: string[] = [];
  const candidates: Candidate[] = [];
  let needsUnassignedClass = false;
  for (const [videoId, found] of roundsByVideo) {
    const entry = classification.get(videoId);
    if (entry === undefined) unscreened.push(videoId);
    if (entry === undefined || entry.classId === UNASSIGNED_CLASS) needsUnassignedClass = true;
    const audit = auditByVideo.get(videoId);
    candidates.push({
      video_id: videoId,
      title: `Video ${videoId}`,
      channel_id: channelOf(audit),
      channel_title: "not_reported",
      published_date: "not_reported",
      treatment_class_id: entry?.classId ?? UNASSIGNED_CLASS,
      fingerprint_id: entry?.fingerprintId ?? UNSCREENED_FINGERPRINT,
      discovery_batch_ids: found.map(({ index }) => batchId(index)),
      materiality: entry?.materiality ?? "uncertain",
      selection_status: entry?.selection ?? "screened_not_selected",
      omission_impact: entry?.omissionImpact ?? "uncertain",
      omission_rationale: entry?.omissionRationale ??
        "Discovered but not screened in this check: list it as selected, screened or not material.",
      ...(entry?.accessBoundaryId === undefined ? {} : { access_boundary_id: entry.accessBoundaryId })
    });
  }
  const candidateById = new Map(candidates.map((candidate) => [candidate.video_id, candidate]));

  const boundaryIdFor = (scopeType: string, scopeId: string): string | undefined =>
    input.access_boundaries.find((boundary) =>
      boundary.scope_type === scopeType && boundary.scope_id === scopeId
    )?.boundary_id;

  // Discovery batches, oldest first. Among rounds the signed order cannot
  // separate, one that found a selected or material video goes last, so a tie
  // can only delay saturation.
  const foundMaterial = (round: Receipt): boolean => list(round.claims.videos).some((videoId) => {
    const candidate = candidateById.get(videoId);
    return candidate !== undefined &&
      (candidate.selection_status === "selected" || candidate.materiality !== "not_material");
  });
  const orderedRounds = [...rounds].sort((left, right) =>
    left.order - right.order ||
    Number(foundMaterial(left)) - Number(foundMaterial(right)) ||
    left.index - right.index
  );
  const firstRoundOfFingerprint = new Map<string, number>();
  for (const round of orderedRounds) {
    for (const videoId of list(round.claims.videos)) {
      const fingerprintId = candidateById.get(videoId)?.fingerprint_id;
      if (fingerprintId !== undefined && fingerprintById.has(fingerprintId) &&
        !firstRoundOfFingerprint.has(fingerprintId)) {
        firstRoundOfFingerprint.set(fingerprintId, round.index);
      }
    }
  }
  // A round's own access boundary comes from its receipt, so the model does
  // not write it; a supplied one for the same round is set aside.
  const derivedBoundaries: Ledger["access_boundaries"] = [];
  const batches: Ledger["discovery_batches"] = orderedRounds.map((round) => {
    const videos = unique(list(round.claims.videos));
    const classIds = unique([
      ...(roundMapping.get(round.index)?.treatment_class_ids ?? []),
      ...videos.map((videoId) => candidateById.get(videoId)!.treatment_class_id)
    ]);
    if (classIds.length === 0) needsUnassignedClass = true;
    // A scout's `open` counts unresolved IDs, which the frontier carries, and
    // named titles it could not look up, which only this count records: those
    // keep the round open, like an unread results page.
    const open = round.kind === "youtube_scout"
      ? openScoutTitles(round) > 0
      : Number(text(round.claims.open) || "0") > 0;
    const access = roundAccess(round);
    const derived = derivedRoundBoundary(batchId(round.index), access);
    if (derived !== undefined) derivedBoundaries.push(derived);
    const boundaryId = derived?.boundary_id ?? boundaryIdFor("discovery_batch", batchId(round.index));
    return {
      batch_id: batchId(round.index),
      query_or_scope: queryText.get(round.index) ??
        `${round.kind.replace("youtube_", "")} round, query digest ${text(round.claims.q) || "not signed"}`,
      treatment_class_ids: classIds.length === 0 ? [UNASSIGNED_CLASS] : classIds,
      access_status: access,
      pagination: { exhausted: !open, next_cursor_present: open },
      candidate_video_ids: videos,
      new_program_fingerprint_ids: [...firstRoundOfFingerprint.entries()]
        .filter(([, index]) => index === round.index)
        .map(([fingerprintId]) => fingerprintId),
      ...(boundaryId === undefined ? {} : { access_boundary_id: boundaryId })
    };
  });
  const batchByRound = new Map(orderedRounds.map((round, position) => [round.index, batches[position]!]));

  // Specific-program searches: the round's videos in the class whose described
  // components name an implementation term.
  const specificSearches: Ledger["specific_implementation_searches"] = [];
  input.specific_searches.forEach((search, position) => {
    const batch = batchByRound.get(search.round);
    if (batch === undefined) {
      problems.push(
        `specific_searches[${position}] names receipt ${search.round}, which is not a verified discovery receipt for this research target.`
      );
      return;
    }
    if (!queryText.has(search.round)) {
      problems.push(
        `specific_searches[${position}] needs the exact queries of receipt ${search.round} in rounds, so its terms can be checked against what ran.`
      );
      return;
    }
    const matches = batch.candidate_video_ids.filter((videoId) => {
      const candidate = candidateById.get(videoId)!;
      const fingerprint = fingerprintById.get(candidate.fingerprint_id);
      return candidate.treatment_class_id === search.treatment_class_id && fingerprint !== undefined &&
        search.implementation_terms.some((term) => normalizedContains(fingerprint.components, term));
    });
    const exhausted = batch.pagination.exhausted && !batch.pagination.next_cursor_present &&
      (batch.access_status === "complete" || batch.access_status === "api_visible_complete");
    if (matches.length === 0 && !exhausted) return;
    specificSearches.push({
      search_id: `s${position}`,
      discovery_batch_id: batch.batch_id,
      treatment_class_id: search.treatment_class_id,
      implementation_terms: search.implementation_terms,
      discriminator_terms: search.discriminator_terms,
      candidate_video_ids: matches,
      result_status: matches.length > 0 ? "specific_candidates_found" : "exhausted_zero_results"
    });
  });

  // Selected videos carry the discussion audit their signed receipt records.
  const communityAudited = new Set(verified
    .filter(({ kind }) => kind === "youtube_community_audit")
    .flatMap(({ claims }) => list(claims.videos)));
  const selected: Ledger["selected_videos"] = [];
  for (const video of input.selected_videos) {
    const audit = auditByVideo.get(video.video_id);
    if (audit === undefined && communityAudited.has(video.video_id)) {
      problems.push(
        `Selected video ${video.video_id} has only a one-call community audit; audit it with ` +
          "audit_youtube_video_community so its depth can be checked."
      );
    }
    if (audit === undefined || !candidateById.has(video.video_id)) continue;
    const discussion = discussionReceipt(video.video_id, audit, boundaryIdFor("video_discussion", video.video_id));
    selected.push({
      video_id: video.video_id,
      fingerprint_id: video.fingerprint_id,
      stage_or_baseline: video.stage_or_baseline,
      outcome_and_horizon: video.outcome_and_horizon,
      nonredundant_value: video.nonredundant_value,
      transcript_unavailable: "transcript_tool_unavailable",
      discussion_receipt: discussion,
      what_it_changed: video.what_it_changed
    });
  }

  // One scout frontier across this target's scout rounds.
  const scoutRounds = rounds.filter(({ kind }) => kind === "youtube_scout");
  const validated = unique(scoutRounds.flatMap(({ claims }) => list(claims.videos)));
  const rejectedIds = unique(scoutRounds.flatMap(({ claims }) => list(claims.rej)))
    .filter((videoId) => !validated.includes(videoId));
  const unresolvedIds = unique(scoutRounds.flatMap(({ claims }) => list(claims.unres)))
    .filter((videoId) => !validated.includes(videoId) && !rejectedIds.includes(videoId));
  const frontiers: Ledger["external_scout_frontiers"] = [];
  const scoutCandidates: Ledger["external_scout_candidates"] = [];
  if (validated.length + rejectedIds.length + unresolvedIds.length > 0) {
    const partition = {
      source_candidate_video_ids: [...validated, ...rejectedIds, ...unresolvedIds],
      validated_candidate_video_ids: validated,
      terminally_rejected_video_ids: rejectedIds,
      unresolved_candidate_video_ids: unresolvedIds
    };
    const frontier = {
      frontier_digest: deriveExternalScoutFrontierDigest({ frontier_digest: "0".repeat(64), source: "gemini_spark", ...partition }),
      source: "gemini_spark" as const,
      ...partition
    };
    frontiers.push(frontier);
    for (const videoId of validated) {
      const candidate = candidateById.get(videoId);
      const entry = classification.get(videoId);
      if (candidate === undefined || entry === undefined) {
        scoutCandidates.push({
          frontier_digest: frontier.frontier_digest, source: "gemini_spark", video_id: videoId,
          materiality: "uncertain", redundancy: "unknown", screening_status: "unscreened",
          omission_impact: "uncertain", omission_rationale: "Not screened yet."
        });
        continue;
      }
      scoutCandidates.push({
        frontier_digest: frontier.frontier_digest,
        source: "gemini_spark",
        video_id: videoId,
        materiality: candidate.materiality,
        redundancy: entry.duplicateOf === undefined ? "distinct" : "duplicate",
        screening_status: entry.selection === "inaccessible" ? "inaccessible" : "screened",
        fingerprint_id: candidate.fingerprint_id,
        ...(entry.duplicateOf === undefined ? {} : { duplicate_of_video_id: entry.duplicateOf }),
        omission_impact: candidate.omission_impact,
        omission_rationale: candidate.omission_rationale,
        ...(entry.accessBoundaryId === undefined ? {} : { access_boundary_id: entry.accessBoundaryId })
      });
    }
  }

  // Server-made records: never material, so they satisfy no material check.
  const classes: Ledger["treatment_classes"] = [...input.treatment_classes];
  if (needsUnassignedClass) {
    classes.push({
      class_id: UNASSIGNED_CLASS,
      plain_language_label: "Discovery results not assigned to a treatment class",
      materiality: "not_material",
      search_status: "searched",
      formal_follow_up: "not_applicable",
      omission_impact: "not_decision_relevant",
      omission_rationale: "Server-made group for rounds and videos the check was not told how to classify.",
      access_boundary_ids: []
    });
  }
  const fingerprints: Ledger["program_fingerprints"] = [...input.program_fingerprints];
  const serverFingerprint = (fingerprintId: string, classId: string, label: string) => ({
    fingerprint_id: fingerprintId,
    treatment_class_id: classId,
    materiality: "not_material" as const,
    availability_status: "available" as const,
    formal_follow_up: "not_applicable" as const,
    omission_impact: "not_decision_relevant" as const,
    omission_rationale: label,
    components: PROGRAM_NOT_DESCRIBED,
    dose_or_intensity: PROGRAM_NOT_DESCRIBED,
    frequency: PROGRAM_NOT_DESCRIBED,
    duration: PROGRAM_NOT_DESCRIBED,
    supervision: PROGRAM_NOT_DESCRIBED,
    adherence_or_fidelity: PROGRAM_NOT_DESCRIBED,
    cointerventions: PROGRAM_NOT_DESCRIBED,
    // Distinct per record, so server-made records never read as one repeated program.
    stage_or_baseline: label,
    outcome: PROGRAM_NOT_DESCRIBED,
    horizon: PROGRAM_NOT_DESCRIBED,
    care_stage: PROGRAM_NOT_DESCRIBED
  });
  if (unscreened.length > 0) {
    fingerprints.push(serverFingerprint(UNSCREENED_FINGERPRINT, UNASSIGNED_CLASS, "Server-made record for videos not screened yet."));
  }
  for (const [classId, fingerprintId] of notMaterialFingerprintByClass) {
    fingerprints.push(serverFingerprint(fingerprintId, classId, `Server-made record for videos screened as not material in ${classId}.`));
  }

  const ledger: Ledger = {
    research_target: input.research_target,
    broad_treatment_choice: input.broad_treatment_choice,
    substantial_youtube_corpus: input.substantial_youtube_corpus,
    discovery_batches: batches,
    specific_implementation_searches: specificSearches,
    treatment_classes: classes,
    program_fingerprints: fingerprints,
    candidate_videos: candidates,
    external_scout_frontiers: frontiers,
    external_scout_candidates: scoutCandidates,
    selected_videos: selected,
    further_expansion_likely_to_improve_answer: input.further_expansion_likely_to_improve_answer,
    ...(input.research_depth === undefined ? {} : { research_depth: input.research_depth }),
    directional_searches: input.directional_searches,
    access_boundaries: [
      ...derivedBoundaries,
      ...input.access_boundaries.filter((boundary) => !(boundary.scope_type === "discovery_batch" &&
        derivedBoundaries.some(({ scope_id }) => scope_id === boundary.scope_id)))
    ]
  };
  const result = assessTreatmentLandscapeCoverage(ledger, { transcriptToolAvailable: false });

  // Problems in the compact input are record problems: they block and come first.
  const derivation = receiptDerivationSchema.parse({
    receipts_verified: verified.length,
    receipts_rejected: rejected,
    discovery_rounds: rounds.length,
    rounds_for_other_targets: discovery.length - rounds.length,
    candidate_videos: candidates.length,
    unscreened_videos: unscreened.sort(),
    audited_videos: [...auditByVideo.keys()].sort(),
    scout_frontier_videos: validated.length,
    access_boundaries_derived: derivedBoundaries.length,
    open_scout_titles: scoutRounds.reduce((total, round) => total + openScoutTitles(round), 0),
    input_problems: problems
  });
  if (problems.length === 0) {
    return treatmentCoverageFromReceiptsOutputSchema.parse({ ...result, receipt_derivation: derivation });
  }
  return treatmentCoverageFromReceiptsOutputSchema.parse({
    ...result,
    selection_blockers: [...problems, ...result.selection_blockers],
    blockers: [...problems, ...result.blockers],
    selection_coverage_lock: "block",
    synthesis_lock: "block",
    answer_boundary: "continue_research",
    receipt_derivation: derivation
  });
}

function discussionReceipt(
  videoId: string,
  audit: Receipt,
  accessBoundaryId: string | undefined
): DiscussionCoverageReceipt {
  const claims = audit.claims;
  const count = (key: string): number | undefined => {
    const value = text(claims[key]);
    return /^\d{1,9}$/u.test(value) ? Number(value) : undefined;
  };
  const flag = (key: string): boolean => text(claims[key]) === "1";
  const access = (key: string) => {
    const value = text(claims[key]);
    return (ACCESS_STATUSES as readonly string[]).includes(value)
      ? value as DiscussionCoverageReceipt["access_status"]
      : "partial";
  };
  const coverage = text(claims.cov);
  const state = text(claims.state);
  const records = count("records");
  const top = count("top");
  const replies = count("rep");
  const returned = count("ret");
  const returnedTop = count("rtop");
  const returnedReplies = count("rrep");
  // An audit receipt from before these claims were signed cannot show its
  // depth, so it reads as work still to do rather than as complete.
  const signed = [records, top, replies, returned, returnedTop, returnedReplies].every((value) => value !== undefined);
  const provider = text(claims.prc);
  return {
    source_video_id: videoId,
    channel_id: text(claims.ch) === "" ? "not_reported" : text(claims.ch),
    metadata_access_status: access("ms"),
    access_status: access("acc"),
    extraction_coverage: coverage === "api_visible_complete" || coverage === "completed_with_access_boundary"
      ? coverage
      : "partial",
    ...(/^(0|[1-9][0-9]*)$/u.test(provider) ? { provider_reported_comments: provider } : {}),
    top_level_comments_retrieved_cumulative: signed ? top! : 0,
    replies_retrieved_cumulative: signed ? replies! : 0,
    records_retrieved_cumulative: signed ? records! : 0,
    records_returned_for_analysis: signed ? Math.min(returned!, 500) : 0,
    top_level_records_returned_for_analysis: signed ? Math.min(returnedTop!, 500) : 0,
    reply_records_returned_for_analysis: signed ? Math.min(returnedReplies!, 500) : 0,
    // The checker only counts these; the audit result itself lists them.
    reply_count_mismatches: Array.from({ length: Math.min(count("mm") ?? 0, 500) }, (_, position) => ({
      parent_comment_id: `listed-in-audit-result-${position + 1}`,
      expected: 1,
      retrieved: 0
    })),
    continuation_recommended: !signed || flag("cr"),
    error_retryable: "not_reported",
    receipt: {
      completion_state: signed && TERMINAL_AUDIT_STATES.has(state)
        ? state as "api_visible_complete" | "completed_with_access_boundary"
        : "incomplete",
      synthesis_lock: text(claims.lock) === "pass" ? "pass" : "block",
      chain_started_at_first_page: flag("f"),
      top_level_pagination_exhausted: flag("tx"),
      replies_reconciled: flag("rr"),
      query_bounded_comments_used_as_corpus: false,
      blockers: Array.from({ length: Math.min(count("bl") ?? 0, 40) }, (_, position) =>
        `Audit blocker ${position + 1}, listed in the audit result.`)
    },
    ...(accessBoundaryId === undefined ? {} : { access_boundary_id: accessBoundaryId })
  };
}

type AccessStatus = typeof ACCESS_STATUSES[number];

function roundAccess(round: Receipt): AccessStatus {
  const access = text(round.claims.access) || text(round.claims.state);
  // Searches that only a rate limit or the daily quota stopped (rl of inc
  // incomplete) can be rerun once it resets.
  const incomplete = Number(text(round.claims.inc) || "0");
  if (access !== "complete" && incomplete > 0 && Number(text(round.claims.rl) || "0") === incomplete) {
    return "rate_limited";
  }
  if ((ACCESS_STATUSES as readonly string[]).includes(access)) return access as AccessStatus;
  // A scout round is complete once its receipt exists; any other round that
  // did not sign its access is treated as partial.
  return round.kind === "youtube_scout" ? "complete" : "partial";
}

/**
 * The access boundary a round's signed state settles: a rate limit or the
 * daily quota is retryable once it resets (an open lead in a first pass), and a
 * refusal or a missing resource is terminal. Other states say too little, so a
 * supplied boundary is used.
 */
function derivedRoundBoundary(
  scopeId: string,
  access: AccessStatus
): Ledger["access_boundaries"][number] | undefined {
  const common = {
    boundary_id: `server:access:${scopeId}`,
    scope_type: "discovery_batch" as const,
    scope_id: scopeId,
    materiality: "uncertain" as const,
    impact: "uncertain" as const
  };
  if (access === "rate_limited") {
    return {
      ...common,
      access_status: access,
      terminal: false,
      retryable: true,
      recovery_attempted: false,
      description: "A YouTube rate limit or the daily search quota stopped this round; rerun it once the limit resets."
    };
  }
  if (access === "inaccessible" || access === "not_found") {
    return {
      ...common,
      access_status: access,
      terminal: true,
      retryable: false,
      recovery_attempted: true,
      description: "YouTube refused this round's searches or did not find what they asked for; retrying cannot change it."
    };
  }
  return undefined;
}

/** Named titles a scout round could not look up: its open count beyond its unresolved IDs. */
function openScoutTitles(round: Receipt): number {
  const open = Number(text(round.claims.open) || "0");
  return Math.max(0, open - list(round.claims.unres).length);
}

function channelOf(audit: Receipt | undefined): string {
  const channel = audit === undefined ? "" : text(audit.claims.ch);
  return /^[A-Za-z0-9_-]{1,80}$/u.test(channel) ? channel : "not_reported";
}

function batchId(index: number): string {
  return `r${index}`;
}

function normalizedContains(haystack: string, needle: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase("en-US").replaceAll(/[_-]+/gu, " ").replaceAll(/\s+/gu, " ").trim();
  return normalize(haystack).includes(normalize(needle));
}

function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined || value === "") return [];
  return typeof value === "string" ? [value] : value;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
