import { createHash } from "node:crypto";

import { z } from "zod";

import {
  boundedProgramSchema,
  formalReaderEvidenceSchema,
  researchBoundedEvidenceStateSchema,
  videoEvidenceFindingIds,
  type ResearchBoundedEvidenceState
} from "./research-bounded-evidence.js";
import {
  researchCandidateDiscoveryStateSchema,
  type ResearchCandidateDiscoveryState
} from "./research-candidate-frontier.js";
import {
  researchFormalEvidenceStateSchema,
  type ResearchFormalEvidenceState
} from "./research-formal-evidence.js";
import {
  researchTreatmentFinalizationStateSchema,
  type ResearchTreatmentFinalizationState
} from "./research-treatment-finalization.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const youtubeVideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

export const reportLimitationSchema = z.object({
  limitation_id: digest,
  plain_language: bounded(4_000)
}).strict();

const formalClaimReferenceSchema = z.object({
  reference_kind: z.literal("formal_capability"),
  source_id: digest,
  capability_id: digest
}).strict();

const creatorClaimReferenceSchema = z.object({
  reference_kind: z.literal("creator_finding"),
  finding_id: digest
}).strict();

const communityClaimReferenceSchema = z.object({
  reference_kind: z.literal("community_finding"),
  finding_id: digest
}).strict();

export const reportClaimReferenceSchema = z.discriminatedUnion("reference_kind", [
  formalClaimReferenceSchema,
  creatorClaimReferenceSchema,
  communityClaimReferenceSchema
]);

const readerReportClaimCoreSchema = z.object({
  claim_kind: z.enum([
    "formal_effect",
    "comparative_effect",
    "creator_attributed",
    "community_attributed",
    "context_or_mechanism",
    "uncertainty"
  ]),
  wording: bounded(2_000),
  inference: z.enum(["direct", "inferred"]),
  population_or_stage: bounded(1_000),
  program: boundedProgramSchema,
  outcome_and_horizon: bounded(1_000),
  uncertainty: bounded(1_000),
  references: z.array(reportClaimReferenceSchema).min(1).max(20)
}).strict();

export const readerReportClaimSchema = readerReportClaimCoreSchema.extend({
  claim_id: digest
}).strict();

const reportApproachSchema = z.object({
  approach_name: bounded(500),
  program: boundedProgramSchema,
  population_or_stage: bounded(1_000),
  outcome_and_horizon: bounded(1_000),
  evidence_summary: bounded(2_000),
  claim_ids: z.array(digest).min(1).max(30)
}).strict();

const reportApproachSubmissionSchema = reportApproachSchema.omit({
  claim_ids: true
}).extend({
  claim_indexes: z.array(z.number().int().nonnegative().max(119)).min(1).max(30)
}).strict();

const reportAuditedVideoSchema = z.object({
  video_id: youtubeVideoId,
  canonical_url: z.string().url().max(2_048),
  title: bounded(500),
  channel_title: bounded(500),
  evidence_status: z.enum(["COMPLETE", "BOUNDED_TERMINAL"]),
  creator_finding_ids: z.array(digest).max(24),
  community_finding_ids: z.array(digest).max(40),
  limitations: z.array(bounded(1_000)).max(30)
}).strict();

const reportWorthWatchingSchema = z.object({
  video_id: youtubeVideoId,
  creator_finding_id: digest,
  timestamp_url: z.string().url().max(2_048),
  why_it_is_useful: bounded(1_000),
  boundary: bounded(1_000)
}).strict();

const readerReportPacketBaseSchema = z.object({
  packet_version: z.literal("askrigor_reader_report_v1"),
  evidence_basis_digest: digest,
  report_scope: z.enum(["comparative_synthesis", "bounded_nonranking_report"]),
  title: bounded(500),
  public_boundary: bounded(2_000),
  bottom_line: z.array(bounded(2_000)).min(1).max(8),
  comparative_conclusion: bounded(2_000).nullable(),
  claims: z.array(readerReportClaimSchema).min(1).max(120),
  approaches: z.array(reportApproachSchema).min(1).max(40),
  alternatives: z.array(bounded(1_000)).max(40),
  harms_and_counter_signals: z.array(bounded(1_000)).max(60),
  uncertainty: z.array(bounded(1_000)).min(1).max(40),
  videos_actually_audited: z.array(reportAuditedVideoSchema).max(76),
  videos_worth_watching: z.array(reportWorthWatchingSchema).max(20),
  provider_and_access_limitations: z.array(reportLimitationSchema).max(4_000),
  clinician_review_questions: z.array(bounded(1_000)).max(30)
}).strict();

export const readerReportPacketSchema = readerReportPacketBaseSchema
  .superRefine((packet, context) => {
  if (
    packet.report_scope === "bounded_nonranking_report" &&
    packet.comparative_conclusion !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "A bounded report cannot contain a comparative conclusion"
    });
  }
  if (
    packet.report_scope === "bounded_nonranking_report" &&
    packet.claims.some(({ claim_kind }) => claim_kind === "comparative_effect")
  ) {
    context.addIssue({
      code: "custom",
      message: "A bounded report cannot contain comparative-effect claims"
    });
  }
  });

const readerReportPacketSubmissionSchema = readerReportPacketBaseSchema.omit({
  claims: true,
  approaches: true
}).extend({
  claims: z.array(readerReportClaimCoreSchema).min(1).max(120),
  approaches: z.array(reportApproachSubmissionSchema).min(1).max(40)
}).strict().superRefine((packet, context) => {
  if (
    packet.report_scope === "bounded_nonranking_report" &&
    packet.comparative_conclusion !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "A bounded report cannot contain a comparative conclusion"
    });
  }
  if (
    packet.report_scope === "bounded_nonranking_report" &&
    packet.claims.some(({ claim_kind }) => claim_kind === "comparative_effect")
  ) {
    context.addIssue({
      code: "custom",
      message: "A bounded report cannot contain comparative-effect claims"
    });
  }
});

export type ReaderReportPacket = z.output<typeof readerReportPacketSchema>;

const reportFormalSourceSchema = z.object({
  source_id: digest,
  canonical_url: z.string().url().max(2_048),
  title: bounded(1_000),
  claim_capability_status: z.enum([
    "CURRENT",
    "EFFECT_CLAIMS_EXCLUDED",
    "BOUNDED_ONLY"
  ]),
  reader_evidence: formalReaderEvidenceSchema,
  report_programs: z.array(boundedProgramSchema).max(100)
}).strict();

const reportVideoEvidenceSchema = z.object({
  video_id: youtubeVideoId,
  canonical_url: z.string().url().max(2_048),
  title: bounded(500),
  channel_title: bounded(500),
  evidence: researchBoundedEvidenceStateSchema.shape.videos.element,
  report_programs: z.array(boundedProgramSchema).max(64),
  treatment_interpretation: z.object({
    stage_or_baseline: bounded(160),
    outcome_and_horizon: bounded(160),
    nonredundant_value: bounded(160),
    what_it_changed: bounded(160)
  }).strict()
}).strict();

export const reportSynthesisWorkPackageSchema = z.object({
  package_version: z.literal("askrigor_report_synthesis_v1"),
  evidence_basis_digest: digest,
  report_scope: z.enum(["comparative_synthesis", "bounded_nonranking_report"]),
  research_target: bounded(1_000),
  selected_video_count: z.number().int().positive().max(76),
  formal_source_count: z.number().int().nonnegative().max(2_000),
  required_limitation_count: z.number().int().nonnegative().max(4_000)
}).strict();

export const reportSynthesisEvidenceContextSchema = z.object({
  videos: z.array(reportVideoEvidenceSchema).min(1).max(76),
  formal_sources: z.array(reportFormalSourceSchema).max(2_000),
  required_limitations: z.array(reportLimitationSchema).max(4_000)
}).strict();

export const reportSynthesisSubmissionSchema = z.object({
  package_version: z.literal("askrigor_report_synthesis_v1"),
  evidence_basis_digest: digest,
  packet: readerReportPacketSubmissionSchema
}).strict();

const reportAttemptSchema = z.object({
  evidence_basis_digest: digest,
  report_digest: digest,
  packet: readerReportPacketSchema
}).strict();

export const researchReportStateSchema = z.object({
  state_version: z.literal("askrigor_report_v1"),
  attempts: z.array(reportAttemptSchema).max(100)
}).strict();

export type ResearchReportState = z.output<typeof researchReportStateSchema>;
export type ReportSynthesisWorkPackage = z.output<
  typeof reportSynthesisWorkPackageSchema
>;
export type ReportSynthesisSubmission = z.output<
  typeof reportSynthesisSubmissionSchema
>;
export type ReportSynthesisEvidenceContext = z.output<
  typeof reportSynthesisEvidenceContextSchema
>;

export interface ResearchReportEvidence {
  researchTarget: string;
  candidates: ResearchCandidateDiscoveryState;
  boundedEvidence: ResearchBoundedEvidenceState;
  formalEvidence: ResearchFormalEvidenceState;
  treatment: ResearchTreatmentFinalizationState;
  limitations: z.output<typeof reportLimitationSchema>[];
}

export function initialResearchReportState(): ResearchReportState {
  return researchReportStateSchema.parse({
    state_version: "askrigor_report_v1",
    attempts: []
  });
}

export function createReportSynthesisWorkPackage(
  rawState: ResearchReportState,
  rawEvidence: ResearchReportEvidence
): ReportSynthesisWorkPackage {
  researchReportStateSchema.parse(rawState);
  const evidence = parseEvidence(rawEvidence);
  const latestTreatment = evidence.treatment.attempts.at(-1);
  if (latestTreatment === undefined) {
    throw new Error("Report synthesis requires a completed treatment landscape");
  }
  const reportScope = reportScopeForBoundary(latestTreatment.assessment.answer_boundary);
  const context = createReportSynthesisEvidenceContext(evidence);
  return reportSynthesisWorkPackageSchema.parse({
    package_version: "askrigor_report_synthesis_v1",
    evidence_basis_digest: reportEvidenceBasisDigest(evidence),
    report_scope: reportScope,
    research_target: evidence.researchTarget,
    selected_video_count: context.videos.length,
    formal_source_count: context.formal_sources.length,
    required_limitation_count: context.required_limitations.length
  });
}

export function createReportSynthesisEvidenceContext(
  rawEvidence: ResearchReportEvidence
): ReportSynthesisEvidenceContext {
  const evidence = parseEvidence(rawEvidence);
  const latestTreatment = evidence.treatment.attempts.at(-1);
  if (latestTreatment === undefined) {
    throw new Error("Report synthesis requires a completed treatment landscape");
  }
  const interpretations = new Map(latestTreatment.selected_video_interpretations.map(
    (item) => [item.video_id, item]
  ));
  const candidates = new Map(evidence.candidates.candidates.map((candidate) => [
    candidate.video_id,
    candidate
  ]));
  const videos = evidence.boundedEvidence.videos.map((video) => {
    const candidate = candidates.get(video.video_id);
    const interpretation = interpretations.get(video.video_id);
    if (candidate === undefined || interpretation === undefined) {
      throw new Error("Report evidence is missing an exact selected-video interpretation");
    }
    return reportVideoEvidenceSchema.parse({
      video_id: video.video_id,
      canonical_url: candidate.canonical_url,
      title: candidate.title,
      channel_title: candidate.channel_title,
      evidence: video,
      report_programs: distinctPrograms([
        ...video.creator_findings.map(({ program }) => program),
        ...video.community_findings.map(({ program }) => program)
      ]),
      treatment_interpretation: {
        stage_or_baseline: interpretation.stage_or_baseline,
        outcome_and_horizon: interpretation.outcome_and_horizon,
        nonredundant_value: interpretation.nonredundant_value,
        what_it_changed: interpretation.what_it_changed
      }
    });
  });
  const formalSources = evidence.formalEvidence.sources.flatMap((source) => {
    if (
      source.decision_importance !== "DECISION_IMPORTANT" ||
      source.method_audit.reader_evidence === undefined ||
      !["CURRENT", "EFFECT_CLAIMS_EXCLUDED", "BOUNDED_ONLY"].includes(
        source.claim_capability.status
      )
    ) return [];
    const canonicalUrl = source.origins.find(({ canonical_url }) =>
      canonical_url !== undefined
    )?.canonical_url;
    if (canonicalUrl === undefined) return [];
    return [reportFormalSourceSchema.parse({
      source_id: source.source_id,
      canonical_url: canonicalUrl,
      title: source.identity.title ?? source.identity.doi ??
        source.identity.pmid ?? source.identity.pmcid ?? "Formal source",
      claim_capability_status: source.claim_capability.status,
      reader_evidence: source.method_audit.reader_evidence,
      report_programs: reportProgramsFromFormalReader(
        source.method_audit.reader_evidence
      )
    })];
  });
  return reportSynthesisEvidenceContextSchema.parse({
    videos,
    formal_sources: formalSources,
    required_limitations: evidence.limitations
  });
}

export function ingestReportSynthesisSubmission(
  rawState: ResearchReportState,
  rawEvidence: ResearchReportEvidence,
  rawSubmission: ReportSynthesisSubmission
): ResearchReportState {
  const state = researchReportStateSchema.parse(rawState);
  const evidence = parseEvidence(rawEvidence);
  const work = createReportSynthesisWorkPackage(state, evidence);
  const submission = reportSynthesisSubmissionSchema.parse(rawSubmission);
  if (
    submission.evidence_basis_digest !== work.evidence_basis_digest ||
    submission.packet.evidence_basis_digest !== work.evidence_basis_digest ||
    submission.packet.report_scope !== work.report_scope
  ) {
    throw new Error("Reader report is stale or bound to another evidence frontier");
  }
  const packet = materializeReaderPacket(submission.packet);
  validateReportPacket(
    packet,
    createReportSynthesisEvidenceContext(evidence),
    evidence
  );
  if (Buffer.byteLength(JSON.stringify(packet), "utf8") > 52_000) {
    throw new Error("Reader report exceeds the bounded Action response budget");
  }
  const reportDigest = readerReportDigest(packet);
  return researchReportStateSchema.parse({
    ...state,
    attempts: [...state.attempts, {
      evidence_basis_digest: work.evidence_basis_digest,
      report_digest: reportDigest,
      packet
    }]
  });
}

export function currentResearchReport(
  rawState: ResearchReportState,
  rawEvidence: ResearchReportEvidence
): { report_digest: string; packet: ReaderReportPacket } | undefined {
  const state = researchReportStateSchema.parse(rawState);
  const evidence = parseEvidence(rawEvidence);
  const latest = state.attempts.at(-1);
  if (
    latest === undefined ||
    latest.evidence_basis_digest !== reportEvidenceBasisDigest(evidence) ||
    latest.report_digest !== readerReportDigest(latest.packet)
  ) return undefined;
  try {
    validateReportPacket(
      latest.packet,
      createReportSynthesisEvidenceContext(evidence),
      evidence
    );
    return { report_digest: latest.report_digest, packet: latest.packet };
  } catch {
    return undefined;
  }
}

export function deriveReportSynthesisStatus(
  rawState: ResearchReportState,
  evidence: ResearchReportEvidence
): "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" {
  const state = researchReportStateSchema.parse(rawState);
  if (state.attempts.length === 0) return "NOT_STARTED";
  return currentResearchReport(state, evidence) === undefined ? "IN_PROGRESS" : "COMPLETE";
}

export function reportEvidenceBasisDigest(rawEvidence: ResearchReportEvidence): string {
  const evidence = parseEvidence(rawEvidence);
  return sha256(canonicalJson({
    research_target: evidence.researchTarget,
    candidates: evidence.candidates,
    bounded_evidence: evidence.boundedEvidence,
    formal_evidence: evidence.formalEvidence,
    treatment: evidence.treatment,
    limitations: evidence.limitations
  }));
}

export function readerReportDigest(packet: ReaderReportPacket): string {
  return sha256(canonicalJson(readerReportPacketSchema.parse(packet)));
}

function materializeReaderPacket(
  submission: z.output<typeof readerReportPacketSubmissionSchema>
): ReaderReportPacket {
  const claims = submission.claims.map((claim) => readerReportClaimSchema.parse({
    ...claim,
    claim_id: sha256(canonicalJson(claim))
  }));
  const approaches = submission.approaches.map((approach) => {
    const claimIds = approach.claim_indexes.map((index) => claims[index]?.claim_id);
    if (claimIds.some((claimId) => claimId === undefined)) {
      throw new Error("Reader-report approach cites a claim index outside the packet");
    }
    const { claim_indexes: _claimIndexes, ...core } = approach;
    return reportApproachSchema.parse({ ...core, claim_ids: claimIds });
  });
  return readerReportPacketSchema.parse({
    ...submission,
    claims,
    approaches
  });
}

function validateReportPacket(
  packet: ReaderReportPacket,
  context: ReportSynthesisEvidenceContext,
  evidence: ResearchReportEvidence
): void {
  const claimIds = new Set(packet.claims.map(({ claim_id }) => claim_id));
  if (claimIds.size !== packet.claims.length) {
    throw new Error("Reader-report claim identities must be unique");
  }
  for (const claim of packet.claims) {
    const expectedId = sha256(canonicalJson({
      claim_kind: claim.claim_kind,
      wording: claim.wording,
      inference: claim.inference,
      population_or_stage: claim.population_or_stage,
      program: claim.program,
      outcome_and_horizon: claim.outcome_and_horizon,
      uncertainty: claim.uncertainty,
      references: claim.references
    }));
    if (claim.claim_id !== expectedId) {
      throw new Error("Reader-report claim identity does not match its exact content");
    }
    validateClaimReferences(claim, evidence);
  }
  if (packet.approaches.some(({ claim_ids }) =>
    claim_ids.some((claimId) => !claimIds.has(claimId))
  )) throw new Error("Reader-report approach cites an unknown claim");
  const claimsById = new Map(packet.claims.map((claim) => [claim.claim_id, claim]));
  for (const approach of packet.approaches) {
    if (approach.claim_ids.some((claimId) =>
      canonicalJson(claimsById.get(claimId)!.program) !==
        canonicalJson(approach.program)
    )) {
      throw new Error("Reader-report approach cannot pool claims from a materially different program");
    }
  }

  assertExactSet(
    packet.provider_and_access_limitations.map(({ limitation_id }) => limitation_id),
    context.required_limitations.map(({ limitation_id }) => limitation_id),
    "Reader report must preserve the exact permit-bound limitation set"
  );
  for (const limitation of packet.provider_and_access_limitations) {
    const expected = context.required_limitations.find(({ limitation_id }) =>
      limitation_id === limitation.limitation_id
    );
    if (expected?.plain_language !== limitation.plain_language) {
      throw new Error("Reader-report limitation wording does not match controller evidence");
    }
  }

  assertExactSet(
    packet.videos_actually_audited.map(({ video_id }) => video_id),
    context.videos.filter(({ evidence }) => evidence.status === "COMPLETE")
      .map(({ video_id }) => video_id),
    "Reader report must list every fully audited selected video and no bounded or unselected video"
  );
  for (const listed of packet.videos_actually_audited) {
    const exact = context.videos.find(({ video_id }) => video_id === listed.video_id);
    if (exact === undefined) throw new Error("Reader report cites an unknown video");
    const expectedCreator = exact.evidence.creator_findings.map(({ finding_id }) => finding_id);
    const expectedCommunity = exact.evidence.community_findings.map(({ finding_id }) => finding_id);
    if (
      listed.canonical_url !== exact.canonical_url ||
      listed.title !== exact.title ||
      listed.channel_title !== exact.channel_title ||
      listed.evidence_status !== exact.evidence.status
    ) throw new Error("Reader-report video metadata is not controller-derived");
    assertExactSet(
      listed.creator_finding_ids,
      expectedCreator,
      "Reader-report creator finding list is incomplete or invented"
    );
    assertExactSet(
      listed.community_finding_ids,
      expectedCommunity,
      "Reader-report community finding list is incomplete or invented"
    );
    if (canonicalJson(listed.limitations) !== canonicalJson(exact.evidence.limitations)) {
      throw new Error("Reader-report video limitations are not controller-derived");
    }
  }

  const findings = videoEvidenceFindingIds(evidence.boundedEvidence);
  for (const item of packet.videos_worth_watching) {
    const found = findings.get(item.creator_finding_id);
    if (found?.kind !== "creator" || found.video_id !== item.video_id) {
      throw new Error("Videos worth watching require a transcript-verified creator finding");
    }
    const video = evidence.boundedEvidence.videos.find(({ video_id }) =>
      video_id === item.video_id
    );
    const creator = video?.creator_findings.find(({ finding_id }) =>
      finding_id === item.creator_finding_id
    );
    if (creator?.timestamp_url !== item.timestamp_url) {
      throw new Error("Video timestamp is not derived from the cited transcript segment");
    }
  }
}

function validateClaimReferences(
  claim: z.output<typeof readerReportClaimSchema>,
  evidence: ResearchReportEvidence
): void {
  const findings = videoEvidenceFindingIds(evidence.boundedEvidence);
  const expectedProgram = canonicalJson(claim.program);
  for (const reference of claim.references) {
    if (reference.reference_kind === "creator_finding") {
      const finding = findings.get(reference.finding_id);
      if (finding?.kind !== "creator") {
        throw new Error("Reader report cites an unknown creator finding");
      }
      if (claim.claim_kind !== "creator_attributed" && claim.claim_kind !== "uncertainty") {
        throw new Error("Creator findings can support only attributed or uncertainty claims");
      }
      if (canonicalJson(finding.program) !== expectedProgram) {
        throw new Error("Reader report cannot pool a creator finding under a materially different program");
      }
      continue;
    }
    if (reference.reference_kind === "community_finding") {
      const finding = findings.get(reference.finding_id);
      if (finding?.kind !== "community") {
        throw new Error("Reader report cites an unknown community finding");
      }
      if (claim.claim_kind !== "community_attributed" && claim.claim_kind !== "uncertainty") {
        throw new Error("Community findings can support only attributed or uncertainty claims");
      }
      if (canonicalJson(finding.program) !== expectedProgram) {
        throw new Error("Reader report cannot pool a community finding under a materially different program");
      }
      continue;
    }
    const source = evidence.formalEvidence.sources.find(({ source_id }) =>
      source_id === reference.source_id
    );
    const reader = source?.method_audit.reader_evidence;
    const capability = reader?.audit_kind === "NOTICE"
      ? undefined
      : reader?.claim_capabilities.find(({ capability_id }) =>
        capability_id === reference.capability_id
      );
    if (source === undefined || reader === undefined || capability === undefined) {
      throw new Error("Reader report cites an unknown formal claim capability");
    }
    if (capability.capability !== "can_support") {
      throw new Error("Reader report cites a formal capability that cannot support the claim");
    }
    if (!reportProgramsFromFormalReader(reader).some((program) =>
      canonicalJson(program) === expectedProgram
    )) {
      throw new Error("Reader report cannot pool a formal claim under a materially different program");
    }
    if (
      claim.claim_kind === "formal_effect" ||
      claim.claim_kind === "comparative_effect"
    ) {
      if (
        source.claim_capability.status !== "CURRENT" ||
        !source.claim_capability.unrestricted_decision_use ||
        source.external_evidence.effect_claims_excluded
      ) {
        throw new Error("An effect-excluded, bounded, or stale source cannot support an effect claim");
      }
    }
  }
  if (
    ["formal_effect", "comparative_effect", "context_or_mechanism"].includes(
      claim.claim_kind
    ) &&
    !claim.references.some(({ reference_kind }) =>
      reference_kind === "formal_capability"
    )
  ) throw new Error("Formal or contextual claims require a capable formal source");
  if (
    claim.claim_kind === "creator_attributed" &&
    !claim.references.some(({ reference_kind }) =>
      reference_kind === "creator_finding"
    )
  ) throw new Error("Creator-attributed claims require a creator finding");
  if (
    claim.claim_kind === "community_attributed" &&
    !claim.references.some(({ reference_kind }) =>
      reference_kind === "community_finding"
    )
  ) throw new Error("Community-attributed claims require a community finding");
}

function reportProgramsFromFormalReader(
  reader: z.output<typeof formalReaderEvidenceSchema>
): Array<z.output<typeof boundedProgramSchema>> {
  if (reader.audit_kind === "STUDY") {
    return [reader.intervention_program, reader.comparator_program];
  }
  if (reader.audit_kind === "REVIEW") {
    return reader.program_fingerprints.map((program) => boundedProgramSchema.parse({
      name: program.label,
      components: program.components,
      dose_or_intensity: program.dose_or_intensity,
      frequency: program.frequency,
      duration: program.duration,
      supervision: program.supervision,
      adherence: "program not described",
      co_interventions: program.co_interventions,
      care_stage: "not_described"
    }));
  }
  return [];
}

function distinctPrograms(
  programs: Array<z.output<typeof boundedProgramSchema>>
): Array<z.output<typeof boundedProgramSchema>> {
  return [...new Map(programs.map((program) => [
    canonicalJson(program),
    program
  ])).values()];
}

function parseEvidence(raw: ResearchReportEvidence): ResearchReportEvidence {
  return {
    researchTarget: bounded(1_000).parse(raw.researchTarget),
    candidates: researchCandidateDiscoveryStateSchema.parse(raw.candidates),
    boundedEvidence: researchBoundedEvidenceStateSchema.parse(raw.boundedEvidence),
    formalEvidence: researchFormalEvidenceStateSchema.parse(raw.formalEvidence),
    treatment: researchTreatmentFinalizationStateSchema.parse(raw.treatment),
    limitations: z.array(reportLimitationSchema).max(4_000).parse(raw.limitations)
  };
}

function reportScopeForBoundary(
  boundary: string
): "comparative_synthesis" | "bounded_nonranking_report" {
  if (boundary === "ledger_consistent_for_synthesis") return "comparative_synthesis";
  if (boundary === "bounded_nonranking_only") return "bounded_nonranking_report";
  throw new Error("Report synthesis requires a terminal treatment answer boundary");
}

function assertExactSet(
  actual: readonly string[],
  expected: readonly string[],
  message: string
): void {
  if (
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((value) => !expected.includes(value))
  ) throw new Error(message);
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
