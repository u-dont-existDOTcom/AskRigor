import { createHash } from "node:crypto";

import type {
  YoutubeComment
} from "@askrigor/sources";
import { youtubeTranscriptSegmentSchema } from "@askrigor/sources";
import { z } from "zod";

import type { ResearchCandidateDiscoveryState } from
  "./research-candidate-frontier.js";
import type { ResearchVideoDepthState } from
  "./research-video-depth-controller.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const youtubeVideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);
const blockId = z.string().regex(/^(?:jats|pdf)_[0-9]{6}_[a-f0-9]{12}$/u);
const directCommunityIdentifier = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\d .()-]{6,}\d)|https?:\/\/|(?:^|\s)@[A-Za-z0-9_.-]{2,})/iu;

export const boundedProgramSchema = z.object({
  name: bounded(500),
  components: z.array(bounded(500)).min(1).max(30),
  dose_or_intensity: bounded(500),
  frequency: bounded(500),
  duration: bounded(500),
  supervision: bounded(500),
  adherence: bounded(500),
  co_interventions: z.array(bounded(500)).max(30),
  care_stage: z.enum([
    "preoperative",
    "postoperative",
    "nonsurgical",
    "preventive",
    "other",
    "not_described"
  ])
}).strict();

export const boundedClaimCapabilitySchema = z.object({
  capability_id: digest,
  claim: bounded(2_000),
  capability: z.enum(["can_support", "cannot_support", "uncertain"]),
  reason: bounded(2_000),
  evidence_block_ids: z.array(blockId).max(100)
}).strict();

export const boundedMethodFindingSchema = z.object({
  finding_id: digest,
  domain: bounded(160),
  status: z.enum([
    "adequate",
    "limitation_identified",
    "unclear",
    "not_applicable"
  ]),
  plain_language_finding: bounded(2_000),
  evidence_block_ids: z.array(blockId).max(100),
  unresolved_fields: z.array(bounded(500)).max(30)
}).strict();

export const formalReaderEvidenceSchema = z.discriminatedUnion("audit_kind", [
  z.object({
    audit_kind: z.literal("STUDY"),
    source_content_sha256: digest,
    audit_sha256: digest,
    design_label: bounded(200),
    design_capability_statement: bounded(2_000),
    population_and_stage: bounded(1_000),
    intervention_program: boundedProgramSchema,
    comparator_program: boundedProgramSchema,
    outcome_and_horizon: bounded(1_000),
    method_findings: z.array(boundedMethodFindingSchema).max(20),
    claim_capabilities: z.array(boundedClaimCapabilitySchema).min(2).max(50)
  }).strict(),
  z.object({
    audit_kind: z.literal("REVIEW"),
    source_content_sha256: digest,
    audit_sha256: digest,
    review_type: z.enum([
      "systematic_review",
      "meta_analysis",
      "guideline",
      "other_review"
    ]),
    search_end_date: z.string().date().or(z.literal("not described")),
    included_source_families: z.array(bounded(500)).min(1).max(50),
    program_fingerprints: z.array(z.object({
      label: bounded(500),
      components: z.array(bounded(500)).min(1).max(30),
      dose_or_intensity: bounded(500),
      frequency: bounded(500),
      duration: bounded(500),
      supervision: bounded(500),
      co_interventions: z.array(bounded(500)).max(30),
      population_or_stage: bounded(500),
      outcome_and_horizon: bounded(500)
    }).strict()).min(1).max(100),
    method_findings: z.array(boundedMethodFindingSchema).max(20),
    claim_capabilities: z.array(boundedClaimCapabilitySchema).min(2).max(50)
  }).strict(),
  z.object({
    audit_kind: z.literal("NOTICE"),
    source_content_sha256: digest,
    audit_sha256: digest,
    notice_type: z.enum([
      "retraction",
      "withdrawal",
      "expression_of_concern",
      "correction",
      "update",
      "reinstatement",
      "other"
    ]),
    affected_source_identity: bounded(2_048),
    plain_language_finding: bounded(2_000),
    evidence_block_ids: z.array(blockId).min(1).max(100),
    possible_decision_impact: z.enum([
      "detail_only",
      "confidence_changing",
      "ranking_changing",
      "potentially_conclusion_changing",
      "unknown"
    ]),
    unresolved_fields: z.array(bounded(500)).max(30)
  }).strict()
]);

export type FormalReaderEvidence = z.output<typeof formalReaderEvidenceSchema>;

export const creatorFindingSubmissionSchema = z.object({
  finding_type: z.enum([
    "program",
    "mechanism_claim",
    "outcome_claim",
    "limitation",
    "other"
  ]),
  plain_language: bounded(1_000),
  transcript_segment_sha256s: z.array(digest).min(1).max(30),
  program: boundedProgramSchema
}).strict();

export const communityFindingSubmissionSchema = z.object({
  direction: z.enum([
    "benefit",
    "no_effect",
    "harm",
    "discontinuation",
    "eventual_standard_treatment",
    "mixed",
    "other"
  ]),
  non_identifying_wording: bounded(1_000),
  regimen_clues: z.array(bounded(500)).max(12),
  reported_outcome: bounded(1_000),
  counter_signals: z.array(bounded(700)).max(12),
  program: boundedProgramSchema,
  comment_record_sha256s: z.array(digest).min(1).max(30)
}).strict();

const creatorFindingSchema = creatorFindingSubmissionSchema.extend({
  finding_id: digest,
  timestamp_url: z.string().url().max(2_048),
  start_ms: z.number().int().nonnegative()
}).strict();

const communityFindingSchema = communityFindingSubmissionSchema.extend({
  finding_id: digest
}).strict();

const videoEvidenceRecordSchema = z.object({
  video_id: youtubeVideoId,
  status: z.enum(["NOT_STARTED", "COMPLETE", "BOUNDED_TERMINAL"]),
  transcript_receipt_sha256: digest.optional(),
  discussion_receipt_sha256: digest.optional(),
  source_material_digest: digest.optional(),
  creator_findings: z.array(creatorFindingSchema).max(24),
  community_findings: z.array(communityFindingSchema).max(40),
  limitations: z.array(bounded(1_000)).max(30)
}).strict().superRefine((record, context) => {
  const completed = record.status === "COMPLETE";
  if (completed !== (
    record.transcript_receipt_sha256 !== undefined &&
    record.discussion_receipt_sha256 !== undefined &&
    record.source_material_digest !== undefined
  )) {
    context.addIssue({
      code: "custom",
      message: "Completed video evidence requires exact transcript, discussion, and material bindings"
    });
  }
  if (
    completed &&
    !record.creator_findings.some(({ finding_type }) => finding_type === "program")
  ) {
    context.addIssue({
      code: "custom",
      message: "Completed transcript evidence requires at least one exact creator program finding"
    });
  }
  if (record.status === "NOT_STARTED" && (
    record.creator_findings.length > 0 || record.community_findings.length > 0 ||
    record.limitations.length > 0
  )) {
    context.addIssue({ code: "custom", message: "Unstarted video evidence cannot contain findings" });
  }
  if (record.status === "BOUNDED_TERMINAL" && record.limitations.length === 0) {
    context.addIssue({ code: "custom", message: "Bounded video evidence requires a plain-language limitation" });
  }
});

export const researchBoundedEvidenceStateSchema = z.object({
  state_version: z.literal("askrigor_bounded_evidence_v1"),
  selection_digest: digest.optional(),
  videos: z.array(videoEvidenceRecordSchema).max(76)
}).strict();

export type ResearchBoundedEvidenceState = z.output<
  typeof researchBoundedEvidenceStateSchema
>;

export const videoEvidenceWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_video_evidence_v1"),
  evidence_basis_digest: digest,
  video_id: youtubeVideoId,
  canonical_url: z.string().url().max(2_048),
  title: bounded(500),
  channel_title: bounded(500),
  transcript_receipt_sha256: digest,
  discussion_receipt_sha256: digest,
  transcript_record_count: z.number().int().positive(),
  discussion_analysis_record_count: z.number().int().nonnegative()
}).strict();

export const videoEvidenceSubmissionSchema = z.object({
  package_version: z.literal("askrigor_video_evidence_v1"),
  evidence_basis_digest: digest,
  video_id: youtubeVideoId,
  creator_findings: z.array(creatorFindingSubmissionSchema).min(1).max(24),
  community_findings: z.array(communityFindingSubmissionSchema).max(40),
  limitations: z.array(bounded(1_000)).max(30)
}).strict();

export type VideoEvidenceWorkPackage = z.output<
  typeof videoEvidenceWorkPackageSchema
>;
export type VideoEvidenceSubmission = z.output<
  typeof videoEvidenceSubmissionSchema
>;

export interface VideoEvidenceMaterial {
  video_id: string;
  transcript_receipt_sha256: string;
  discussion_receipt_sha256: string;
  transcript_segments: Array<z.output<typeof youtubeTranscriptSegmentSchema> & {
    record_sha256: string;
  }>;
  discussion_comments: Array<
    Omit<YoutubeComment, "author_channel_id" | "author_display_name"> & {
      record_sha256: string;
    }
  >;
  source_material_digest: string;
}

export function initialResearchBoundedEvidenceState(): ResearchBoundedEvidenceState {
  return researchBoundedEvidenceStateSchema.parse({
    state_version: "askrigor_bounded_evidence_v1",
    videos: []
  });
}

export function initializeResearchBoundedEvidence(
  selectionDigest: string,
  selectedVideoIds: readonly string[]
): ResearchBoundedEvidenceState {
  return researchBoundedEvidenceStateSchema.parse({
    state_version: "askrigor_bounded_evidence_v1",
    selection_digest: selectionDigest,
    videos: selectedVideoIds.map((video_id) => ({
      video_id,
      status: "NOT_STARTED",
      creator_findings: [],
      community_findings: [],
      limitations: []
    }))
  });
}

export function reconcileVideoEvidenceBoundaries(
  rawEvidence: ResearchBoundedEvidenceState,
  videoDepth: ResearchVideoDepthState
): ResearchBoundedEvidenceState {
  const state = researchBoundedEvidenceStateSchema.parse(rawEvidence);
  const videos = state.videos.map((record) => {
    if (record.status !== "NOT_STARTED") return record;
    const transcript = videoDepth.transcripts.find(({ source }) =>
      source.video_id === record.video_id
    );
    const discussion = videoDepth.discussions.find(({ source }) =>
      source.video_id === record.video_id
    );
    const terminal = transcript?.status === "BLOCKED_TERMINAL" ||
      discussion?.status === "BLOCKED_TERMINAL";
    if (!terminal) return record;
    const limitations = [
      transcript?.status === "BLOCKED_TERMINAL"
        ? "The creator's spoken content could not be fully verified from an accessible transcript."
        : undefined,
      discussion?.status === "BLOCKED_TERMINAL"
        ? "The available public discussion reached a source-specific access boundary."
        : undefined
    ].filter((value): value is string => value !== undefined);
    return {
      ...record,
      status: "BOUNDED_TERMINAL" as const,
      limitations
    };
  });
  return researchBoundedEvidenceStateSchema.parse({ ...state, videos });
}

export function createVideoEvidenceWorkPackage(
  rawEvidence: ResearchBoundedEvidenceState,
  candidates: ResearchCandidateDiscoveryState,
  videoDepth: ResearchVideoDepthState,
  material?: VideoEvidenceMaterial
): VideoEvidenceWorkPackage {
  const evidence = researchBoundedEvidenceStateSchema.parse(rawEvidence);
  const videoId = material?.video_id ?? nextVideoEvidenceId(evidence, videoDepth);
  if (videoId === undefined) {
    throw new Error("Video evidence does not have one exact executable source frontier");
  }
  const record = evidence.videos.find(({ video_id }) => video_id === videoId);
  const candidate = candidates.candidates.find(({ video_id }) =>
    video_id === videoId
  );
  const transcript = videoDepth.transcripts.find(({ source }) =>
    source.video_id === videoId
  );
  const discussion = videoDepth.discussions.find(({ source }) =>
    source.video_id === videoId
  );
  if (
    record?.status !== "NOT_STARTED" || candidate === undefined ||
    transcript?.status !== "COMPLETE" || discussion?.status !== "COMPLETE" ||
    transcript.receipt === undefined || discussion.receipt === undefined
  ) throw new Error("Video evidence does not have one exact executable source frontier");
  const transcriptHash = sha256(canonicalJson(transcript.receipt));
  const discussionHash = sha256(canonicalJson(discussion.receipt));
  if (
    material !== undefined && (
      material.transcript_receipt_sha256 !== transcriptHash ||
      material.discussion_receipt_sha256 !== discussionHash ||
      material.video_id !== candidate.video_id
    )
  ) throw new Error("Video evidence material is bound to another receipt frontier");
  return videoEvidenceWorkPackageSchema.parse({
    package_version: "askrigor_video_evidence_v1",
    evidence_basis_digest: videoEvidenceBasisDigest(
      candidate.video_id,
      transcriptHash,
      discussionHash
    ),
    video_id: candidate.video_id,
    canonical_url: candidate.canonical_url,
    title: candidate.title,
    channel_title: candidate.channel_title,
    transcript_receipt_sha256: transcriptHash,
    discussion_receipt_sha256: discussionHash,
    transcript_record_count: material?.transcript_segments.length ??
      transcript.receipt.pagination.records_returned_cumulative,
    discussion_analysis_record_count: material?.discussion_comments.length ??
      discussion.receipt.records_returned_for_analysis
  });
}

export function ingestVideoEvidenceSubmission(
  rawEvidence: ResearchBoundedEvidenceState,
  candidates: ResearchCandidateDiscoveryState,
  videoDepth: ResearchVideoDepthState,
  material: VideoEvidenceMaterial,
  rawSubmission: VideoEvidenceSubmission
): ResearchBoundedEvidenceState {
  const state = researchBoundedEvidenceStateSchema.parse(rawEvidence);
  const work = createVideoEvidenceWorkPackage(state, candidates, videoDepth, material);
  const submission = videoEvidenceSubmissionSchema.parse(rawSubmission);
  if (
    submission.video_id !== work.video_id ||
    submission.evidence_basis_digest !== work.evidence_basis_digest
  ) throw new Error("Video evidence submission is stale or bound to another source frontier");
  const transcriptByHash = new Map(material.transcript_segments.map((segment) => [
    segment.record_sha256,
    segment
  ]));
  const commentsByHash = new Map(material.discussion_comments.map((comment) => [
    comment.record_sha256,
    comment
  ]));
  const creatorFindings = submission.creator_findings.map((finding) => {
    const segments = finding.transcript_segment_sha256s.map((hash) =>
      transcriptByHash.get(hash)
    );
    if (segments.some((segment) => segment === undefined)) {
      throw new Error("Creator finding cites a transcript segment outside the exact source material");
    }
    const first = segments.filter((segment): segment is NonNullable<typeof segment> =>
      segment !== undefined
    ).sort((left, right) => left.start_ms - right.start_ms)[0]!;
    return creatorFindingSchema.parse({
      ...finding,
      finding_id: sha256(canonicalJson(finding)),
      timestamp_url: first.timestamp_url,
      start_ms: first.start_ms
    });
  });
  const communityFindings = submission.community_findings.map((finding) => {
    const comments = finding.comment_record_sha256s.map((hash) =>
      commentsByHash.get(hash)
    );
    if (comments.some((comment) => comment === undefined)) {
      throw new Error("Community finding cites a comment outside the exact analysis sample");
    }
    assertCommunityFindingIsDeidentified(
      finding,
      comments.filter((comment): comment is NonNullable<typeof comment> =>
        comment !== undefined
      )
    );
    return communityFindingSchema.parse({
      ...finding,
      finding_id: sha256(canonicalJson(finding))
    });
  });
  const index = state.videos.findIndex(({ video_id }) =>
    video_id === submission.video_id
  );
  if (index < 0 || state.videos[index]!.status !== "NOT_STARTED") {
    throw new Error("Video evidence record is missing or already terminal");
  }
  const videos = [...state.videos];
  videos[index] = videoEvidenceRecordSchema.parse({
    video_id: submission.video_id,
    status: "COMPLETE",
    transcript_receipt_sha256: work.transcript_receipt_sha256,
    discussion_receipt_sha256: work.discussion_receipt_sha256,
    source_material_digest: material.source_material_digest,
    creator_findings: creatorFindings,
    community_findings: communityFindings,
    limitations: submission.limitations
  });
  return researchBoundedEvidenceStateSchema.parse({ ...state, videos });
}

function assertCommunityFindingIsDeidentified(
  finding: z.output<typeof communityFindingSubmissionSchema>,
  comments: VideoEvidenceMaterial["discussion_comments"]
): void {
  const outputTexts = [
    finding.non_identifying_wording,
    ...finding.regimen_clues,
    finding.reported_outcome,
    ...finding.counter_signals
  ];
  if (outputTexts.some((value) => directCommunityIdentifier.test(value))) {
    throw new Error("Community finding contains a direct identifier");
  }
  if (outputTexts.some((output) => comments.some(({ text }) =>
    containsSubstantialVerbatimOverlap(text, output)
  ))) {
    throw new Error("Community finding copies substantial verbatim source text");
  }
}

function containsSubstantialVerbatimOverlap(source: string, output: string): boolean {
  const sourceWords = normalizedWords(source);
  const outputWords = normalizedWords(output);
  const minimumWords = 12;
  if (sourceWords.length < minimumWords || outputWords.length < minimumWords) {
    return false;
  }
  const normalizedSource = ` ${sourceWords.join(" ")} `;
  for (let index = 0; index <= outputWords.length - minimumWords; index += 1) {
    const phrase = outputWords.slice(index, index + minimumWords).join(" ");
    if (phrase.length >= 60 && normalizedSource.includes(` ${phrase} `)) {
      return true;
    }
  }
  return false;
}

function normalizedWords(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
}

export function deriveVideoEvidenceStatus(
  rawEvidence: ResearchBoundedEvidenceState,
  videoDepth: ResearchVideoDepthState
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED_TERMINAL" {
  const state = reconcileVideoEvidenceBoundaries(rawEvidence, videoDepth);
  if (state.videos.length === 0 || state.videos.every(({ status }) =>
    status === "NOT_STARTED"
  )) return "NOT_STARTED";
  if (state.videos.some(({ status }) => status === "NOT_STARTED")) return "IN_PROGRESS";
  if (state.videos.every(({ status }) => status === "COMPLETE")) return "COMPLETE";
  return "BLOCKED_TERMINAL";
}

export function nextVideoEvidenceId(
  rawEvidence: ResearchBoundedEvidenceState,
  videoDepth: ResearchVideoDepthState
): string | undefined {
  const state = reconcileVideoEvidenceBoundaries(rawEvidence, videoDepth);
  return state.videos.find((record) => {
    if (record.status !== "NOT_STARTED") return false;
    const transcript = videoDepth.transcripts.find(({ source }) =>
      source.video_id === record.video_id
    );
    const discussion = videoDepth.discussions.find(({ source }) =>
      source.video_id === record.video_id
    );
    return transcript?.status === "COMPLETE" && discussion?.status === "COMPLETE";
  })?.video_id;
}

export function videoEvidenceFindingIds(
  rawEvidence: ResearchBoundedEvidenceState
): Map<string, {
  kind: "creator" | "community";
  video_id: string;
  program: z.output<typeof boundedProgramSchema>;
}> {
  const state = researchBoundedEvidenceStateSchema.parse(rawEvidence);
  const entries: Array<readonly [
    string,
    {
      kind: "creator" | "community";
      video_id: string;
      program: z.output<typeof boundedProgramSchema>;
    }
  ]> = state.videos.flatMap((record) => [
    ...record.creator_findings.map(({ finding_id, program }) => [
      finding_id,
      { kind: "creator" as const, video_id: record.video_id, program }
    ] as const),
    ...record.community_findings.map(({ finding_id, program }) => [
      finding_id,
      { kind: "community" as const, video_id: record.video_id, program }
    ] as const)
  ]);
  return new Map(entries);
}

export function sourceRecordSha256(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function sourceMaterialDigest(input: {
  video_id: string;
  transcript_receipt_sha256: string;
  discussion_receipt_sha256: string;
  transcript_record_sha256s: readonly string[];
  discussion_record_sha256s: readonly string[];
}): string {
  return sha256(canonicalJson(input));
}

function videoEvidenceBasisDigest(
  videoId: string,
  transcriptReceiptHash: string,
  discussionReceiptHash: string
): string {
  return sha256(canonicalJson({
    video_id: videoId,
    transcript_receipt_sha256: transcriptReceiptHash,
    discussion_receipt_sha256: discussionReceiptHash
  }));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
