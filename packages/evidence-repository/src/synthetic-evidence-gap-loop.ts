import {
  communityLeadSchema,
  communityPublicVersionSchema,
  type CommunityComposerDraft,
  type CommunityFrontierCard,
  type CommunityLead,
  type CommunityPublicVersion,
  type CommunityResearchProposal,
  type CommunityResearchQuestion,
  type CommunityQuestionEvidenceCheck,
  type CommunitySignalCluster,
} from "@askrigor/contracts";

import { sha256, stableJson } from "./hash.js";
import {
  buildSyntheticCommunityFrontierView,
  SyntheticCommunityComposerService,
} from "./community-forum-operations.js";
import { SyntheticCommunityResearchPipelineService } from "./community-forum-lifecycle.js";
import {
  computeCommunitySourceIndependenceKeys,
  syntheticPublicLeadProjectionSha256,
  SyntheticCommunityLeadService,
} from "./community-forum-service.js";

export const SYNTHETIC_PROLACTINOMA_GAP_SLUG =
  "prolactinoma-spontaneous-remission";

export const syntheticProlactinomaGap = {
  synthetic: true as const,
  labOnly: true as const,
  slug: SYNTHETIC_PROLACTINOMA_GAP_SLUG,
  title: "What precedes spontaneous prolactinoma remission?",
  researchQuestion:
    "Among synthetic people with reported prolactinomas, which biological, environmental, treatment, or life transitions precede reported treatment-free remission or tumor regression, compared with similar synthetic people whose prolactinomas do not remit?",
  known:
    "Remission and regression have been reported in several treatment contexts, but this local fixture does not establish how often they occur or what causes them.",
  unresolved:
    "The ordering, verification, treatment context, and comparison-case coverage needed to evaluate candidate transitions remain incomplete.",
  comparisonNeed:
    "People with the same suspected transition but no remission are equally useful because they test whether the transition distinguishes outcomes.",
  recruitmentActive: false as const,
  publicDeployment: false as const,
  ethicsState: "NOT_REVIEWED" as const,
};

export type SyntheticGapProvenance =
  | "SELF"
  | "DIRECT_OBSERVER"
  | "SUBJECT_RELAYED"
  | "HEARSAY";

export type SyntheticGapOutcome = "REPORTED_REMISSION" | "NO_REMISSION";

export type SyntheticGapExposure =
  | "PREGNANCY_POSTPARTUM"
  | "MENOPAUSE"
  | "POSSIBLE_APOPLEXY"
  | "DOPAMINE_AGONIST_WITHDRAWAL"
  | "BREAST_IMPLANT_OR_EXPLANT"
  | "OTHER_TRANSITION";

export type SyntheticGapTreatmentContext =
  | "NO_PRIOR_DOPAMINE_AGONIST"
  | "PREVIOUSLY_TREATED"
  | "CURRENTLY_TREATED"
  | "TREATMENT_WITHDRAWN"
  | "UNKNOWN";

export interface SyntheticGapDetailsInput {
  outcome: SyntheticGapOutcome;
  exposure: SyntheticGapExposure;
  timingKnown: boolean;
  persistenceKnown: boolean;
  baselineDocumented: boolean;
  followupDocumented: boolean;
  treatmentContext: SyntheticGapTreatmentContext;
}

interface SyntheticContributionRecord {
  contributionId: string;
  ordinal: number;
  reporterAccountId: string;
  provenance: SyntheticGapProvenance;
  draft: CommunityComposerDraft;
  narrative: string | null;
  narrativeSavedAt: string | null;
  structuredSavedAt: string | null;
  details: SyntheticGapDetailsInput | null;
  lead: CommunityLead | null;
  publicVersionId: string | null;
  publicVersionIds: string[];
  card: CommunityFrontierCard | null;
  challengeCount: number;
  correctionSummary: string | null;
  withdrawn: boolean;
  syntheticSeed: boolean;
}

interface ResearchBoundary {
  cluster: CommunitySignalCluster;
  question: CommunityResearchQuestion;
  evidenceCheck: CommunityQuestionEvidenceCheck;
  proposal: CommunityResearchProposal;
  sourceChangeRequiresReview: boolean;
  latestChangeReason: string;
}

const NOTICE_VERSION = "synthetic-gap-lab-v1";
const NOTICE_SHA256 = sha256(
  "AskRigor local synthetic evidence-gap lab consent notice v1",
);

const provenanceDetails: Record<
  SyntheticGapProvenance,
  {
    role: CommunityLead["reporter"]["role"];
    informationOrigin: CommunityLead["reporter"]["informationOrigin"];
    sourceDistance: CommunityLead["reporter"]["sourceDistance"];
    label: string;
  }
> = {
  SELF: {
    role: "SELF",
    informationOrigin: "SELF_EXPERIENCE",
    sourceDistance: "FIRSTHAND_SUBJECT",
    label: "Firsthand synthetic self-report",
  },
  DIRECT_OBSERVER: {
    role: "CAREGIVER",
    informationOrigin: "DIRECT_OBSERVATION",
    sourceDistance: "FIRSTHAND_OBSERVER",
    label: "Direct synthetic observer report; not the subject's own account",
  },
  SUBJECT_RELAYED: {
    role: "FRIEND",
    informationOrigin: "SUBJECT_RELAYED_TO_REPORTER",
    sourceDistance: "ONE_HOP_SUBJECT_RELAY",
    label: "One-hop synthetic subject relay; not a firsthand subject account",
  },
  HEARSAY: {
    role: "OTHER",
    informationOrigin: "THIRD_PARTY_RELAYED",
    sourceDistance: "MULTI_HOP_HEARSAY",
    label: "Multi-hop synthetic hearsay; lead only",
  },
};

const exposureLabels: Record<SyntheticGapExposure, string> = {
  PREGNANCY_POSTPARTUM: "Pregnancy, delivery, or postpartum transition",
  MENOPAUSE: "Perimenopause or menopause transition",
  POSSIBLE_APOPLEXY: "Possible pituitary apoplexy-like episode",
  DOPAMINE_AGONIST_WITHDRAWAL: "Dopamine-agonist withdrawal",
  BREAST_IMPLANT_OR_EXPLANT: "Breast implant or explant transition",
  OTHER_TRANSITION: "Other biological, environmental, or life transition",
};

const treatmentLabels: Record<SyntheticGapTreatmentContext, string> = {
  NO_PRIOR_DOPAMINE_AGONIST: "No prior dopamine agonist reported",
  PREVIOUSLY_TREATED: "Previously treated",
  CURRENTLY_TREATED: "Currently treated",
  TREATMENT_WITHDRAWN: "Treatment withdrawn",
  UNKNOWN: "Treatment context unknown",
};

function consent(at: string, actorType: "REPORTER" | "SUBJECT") {
  return {
    decision: "YES" as const,
    noticeVersion: NOTICE_VERSION,
    noticeSha256: NOTICE_SHA256,
    decidedAt: at,
    actorType,
  };
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: string,
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(code);
  }
}

function assertBoolean(value: unknown, code: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(code);
}

function validateDetails(input: SyntheticGapDetailsInput): void {
  assertEnum(
    input.outcome,
    ["REPORTED_REMISSION", "NO_REMISSION"],
    "SYNTHETIC_GAP_OUTCOME_INVALID",
  );
  assertEnum(
    input.exposure,
    [
      "PREGNANCY_POSTPARTUM",
      "MENOPAUSE",
      "POSSIBLE_APOPLEXY",
      "DOPAMINE_AGONIST_WITHDRAWAL",
      "BREAST_IMPLANT_OR_EXPLANT",
      "OTHER_TRANSITION",
    ],
    "SYNTHETIC_GAP_EXPOSURE_INVALID",
  );
  assertEnum(
    input.treatmentContext,
    [
      "NO_PRIOR_DOPAMINE_AGONIST",
      "PREVIOUSLY_TREATED",
      "CURRENTLY_TREATED",
      "TREATMENT_WITHDRAWN",
      "UNKNOWN",
    ],
    "SYNTHETIC_GAP_TREATMENT_CONTEXT_INVALID",
  );
  assertBoolean(input.timingKnown, "SYNTHETIC_GAP_TIMING_INVALID");
  assertBoolean(input.persistenceKnown, "SYNTHETIC_GAP_PERSISTENCE_INVALID");
  assertBoolean(
    input.baselineDocumented,
    "SYNTHETIC_GAP_BASELINE_DOCUMENTATION_INVALID",
  );
  assertBoolean(
    input.followupDocumented,
    "SYNTHETIC_GAP_FOLLOWUP_DOCUMENTATION_INVALID",
  );
}

function missingFields(details: SyntheticGapDetailsInput): string[] {
  const missing: string[] = [];
  if (!details.timingKnown) missing.push("transition timing");
  if (!details.persistenceKnown) missing.push("outcome persistence");
  if (!details.baselineDocumented)
    missing.push("baseline prolactin/MRI documentation");
  if (!details.followupDocumented)
    missing.push("follow-up prolactin/MRI documentation");
  if (details.treatmentContext === "UNKNOWN") missing.push("treatment context");
  missing.push("independent clinical verification");
  return missing;
}

function completenessBand(
  missing: string[],
): CommunityLead["completenessBand"] {
  if (missing.length >= 5) return "MINIMAL";
  if (missing.length >= 3) return "PARTIAL";
  return "MODERATE";
}

function reportedDirection(
  outcome: SyntheticGapOutcome,
): CommunityLead["outcome"]["reportedDirection"] {
  return outcome === "REPORTED_REMISSION" ? "IMPROVED" : "NO_CLEAR_CHANGE";
}

function publicTitle(details: SyntheticGapDetailsInput): string {
  return details.outcome === "REPORTED_REMISSION"
    ? `Synthetic reported remission after ${exposureLabels[details.exposure]}`
    : `Synthetic non-remission comparator after ${exposureLabels[details.exposure]}`;
}

function publicParaphrase(
  provenance: SyntheticGapProvenance,
  details: SyntheticGapDetailsInput,
): string {
  const outcome =
    details.outcome === "REPORTED_REMISSION"
      ? "reported treatment-free remission or regression"
      : "reported no remission";
  return `${provenanceDetails[provenance].label} describes ${exposureLabels[
    details.exposure
  ].toLowerCase()} before ${outcome}. ${treatmentLabels[
    details.treatmentContext
  ]}. This is a deidentified synthetic lead, not a causal or treatment claim.`;
}

export class SyntheticProlactinomaGapLoop {
  private readonly composer = new SyntheticCommunityComposerService();
  private readonly leads = new SyntheticCommunityLeadService();
  private readonly research = new SyntheticCommunityResearchPipelineService();
  private readonly contributions = new Map<string, SyntheticContributionRecord>();
  private readonly tombstones: Array<{
    publicVersionId: string;
    contentRetained: false;
    withdrawnAt: string;
  }> = [];
  private sequence = 0;
  private researchVersion = 0;
  private researchBoundary: ResearchBoundary | null = null;
  private dependencyReviewRequired = false;

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {
    this.seedNonRemissionComparator();
    this.refreshResearchBoundary("INITIAL_SYNTHETIC_COMPARATOR");
  }

  startContribution(provenanceInput: unknown): {
    contributionId: string;
    draftVersion: number;
    nextStep: "UNPROMPTED_ACCOUNT";
  } {
    assertEnum(
      provenanceInput,
      ["SELF", "DIRECT_OBSERVER", "SUBJECT_RELAYED", "HEARSAY"],
      "SYNTHETIC_GAP_PROVENANCE_INVALID",
    );
    this.sequence += 1;
    const suffix = String(this.sequence).padStart(4, "0");
    const contributionId = `synthetic-gap-${suffix}`;
    const reporterAccountId = `ARSYN-GAPREPORTER${suffix}`;
    const draft = this.composer.startDraft({
      draftId: `ARDRAFT-GAPLOOP${suffix}`,
      reporterAccountId,
      sourcePostId: null,
      updatedAt: this.clock(),
    });
    this.contributions.set(contributionId, {
      contributionId,
      ordinal: this.sequence,
      reporterAccountId,
      provenance: provenanceInput,
      draft,
      narrative: null,
      narrativeSavedAt: null,
      structuredSavedAt: null,
      details: null,
      lead: null,
      publicVersionId: null,
      publicVersionIds: [],
      card: null,
      challengeCount: 0,
      correctionSummary: null,
      withdrawn: false,
      syntheticSeed: false,
    });
    return {
      contributionId,
      draftVersion: draft.draftVersion,
      nextStep: "UNPROMPTED_ACCOUNT",
    };
  }

  saveUnpromptedAccount(contributionId: string, narrativeInput: unknown): {
    narrativeSaved: true;
    narrativeSha256: string;
    nextStep: "STRUCTURED_DETAILS";
  } {
    const record = this.requireContribution(contributionId);
    if (record.narrative !== null)
      throw new Error("SYNTHETIC_GAP_NARRATIVE_ALREADY_SAVED");
    if (typeof narrativeInput !== "string")
      throw new Error("SYNTHETIC_GAP_NARRATIVE_INVALID");
    const narrative = narrativeInput.trim();
    if (narrative.length < 20 || narrative.length > 4_000)
      throw new Error("SYNTHETIC_GAP_NARRATIVE_LENGTH_INVALID");
    if (!/\bsynthetic\b/iu.test(narrative))
      throw new Error("SYNTHETIC_GAP_NARRATIVE_MARKER_REQUIRED");
    record.narrative = narrative;
    record.narrativeSavedAt = this.clock();
    return {
      narrativeSaved: true,
      narrativeSha256: sha256(narrative),
      nextStep: "STRUCTURED_DETAILS",
    };
  }

  saveStructuredDetails(
    contributionId: string,
    detailsInput: SyntheticGapDetailsInput,
  ): {
    draftVersion: number;
    preview: NonNullable<CommunityComposerDraft["preview"]>;
    missingMaterialFields: string[];
    nextStep: "PREVIEW_AND_CONSENT";
  } {
    const record = this.requireContribution(contributionId);
    if (record.narrative === null || record.narrativeSavedAt === null)
      throw new Error("SYNTHETIC_GAP_UNPROMPTED_ACCOUNT_REQUIRED_FIRST");
    validateDetails(detailsInput);
    const at = this.clock();
    const provenance = provenanceDetails[record.provenance];
    let draft = this.composer.recordDetails(
      record.draft.draftId,
      record.reporterAccountId,
      {
        reporter: {
          role: provenance.role,
          informationOrigin: provenance.informationOrigin,
          sourceDistance: provenance.sourceDistance,
        },
        condition: {
          name: "Synthetic reported prolactinoma",
          diagnosticCertainty: "SELF_IDENTIFIED",
        },
        interventionEpisode: {
          components: [
            exposureLabels[detailsInput.exposure],
            treatmentLabels[detailsInput.treatmentContext],
          ],
          exactCombinationKnown: detailsInput.treatmentContext !== "UNKNOWN",
        },
        outcome: {
          name:
            detailsInput.outcome === "REPORTED_REMISSION"
              ? "Synthetic reported prolactinoma remission or regression"
              : "Synthetic reported prolactinoma non-remission",
          reportedDirection: reportedDirection(detailsInput.outcome),
          timing: detailsInput.timingKnown
            ? "Synthetic approximate transition-to-outcome interval recorded"
            : null,
          persistence: detailsInput.persistenceKnown
            ? "Synthetic follow-up persistence recorded"
            : null,
        },
        cointerventions: [treatmentLabels[detailsInput.treatmentContext]],
        harms: [],
        unknowns: missingFields(detailsInput),
      },
      at,
    );
    draft = this.composer.preparePreview(
      draft.draftId,
      record.reporterAccountId,
      {
        publicTitle: publicTitle(detailsInput),
        publicParaphrase: publicParaphrase(record.provenance, detailsInput),
        sourceDistanceLabel: provenance.label,
        limitations: [
          "Synthetic, self-selected, unverified, incomplete, and noncausal.",
          "Public visibility is independent from evidentiary strength.",
          "No denominator or treatment-effect estimate is available.",
        ],
      },
      at,
    );
    record.draft = draft;
    record.details = structuredClone(detailsInput);
    record.structuredSavedAt = at;
    return {
      draftVersion: draft.draftVersion,
      preview: structuredClone(draft.preview!),
      missingMaterialFields: missingFields(detailsInput),
      nextStep: "PREVIEW_AND_CONSENT",
    };
  }

  consentAndPublish(
    contributionId: string,
    input: { publicLead: unknown; recontact: unknown; syntheticOnly: unknown },
  ): {
    leadId: string;
    leadVersion: number;
    publicVersionId: string;
    verificationState: CommunityLead["verificationState"];
    completenessBand: CommunityLead["completenessBand"];
  } {
    const record = this.requireContribution(contributionId);
    if (record.details === null || record.structuredSavedAt === null)
      throw new Error("SYNTHETIC_GAP_STRUCTURED_DETAILS_REQUIRED");
    if (record.lead !== null)
      throw new Error("SYNTHETIC_GAP_CONTRIBUTION_ALREADY_PUBLISHED");
    if (
      input.publicLead !== true ||
      typeof input.recontact !== "boolean" ||
      input.syntheticOnly !== true
    ) {
      throw new Error("SYNTHETIC_GAP_EXPLICIT_CONSENT_REQUIRED");
    }
    const at = this.clock();
    for (const [permission, decision] of [
      ["PUBLIC_LEAD", "YES"],
      ["DIRECT_QUOTATION", "NO"],
      ["EXACT_REGIMEN_PUBLICATION", "NO"],
      ["RECONTACT", input.recontact ? "YES" : "NO"],
    ] as const) {
      record.draft = this.composer.recordPermission(
        record.draft.draftId,
        record.reporterAccountId,
        permission,
        decision,
        at,
      );
    }
    record.draft = this.composer.acknowledgePreview(
      record.draft.draftId,
      record.reporterAccountId,
      at,
    );
    record.draft = this.composer.requestSyntheticPublication(
      record.draft.draftId,
      record.reporterAccountId,
      at,
    );
    this.publishRecord(record, at);
    this.refreshResearchBoundary("SYNTHETIC_LEAD_ADDED");
    return {
      leadId: record.lead!.leadId,
      leadVersion: record.lead!.leadVersion,
      publicVersionId: record.publicVersionId!,
      verificationState: record.lead!.verificationState,
      completenessBand: record.lead!.completenessBand,
    };
  }

  challengeContribution(contributionId: string): {
    challengeCount: number;
    status: "OPEN";
    dependencyReviewRequired: true;
  } {
    const record = this.requirePublishedContribution(contributionId);
    if (record.withdrawn)
      throw new Error("SYNTHETIC_GAP_CONTRIBUTION_WITHDRAWN");
    record.challengeCount += 1;
    this.leads.challengeLead({
      synthetic: true,
      challengeId: `ARCHAL-GAPLOOP${String(record.ordinal).padStart(4, "0")}C${String(record.challengeCount).padStart(3, "0")}`,
      leadId: record.lead.leadId,
      leadVersion: record.lead.leadVersion,
      challengeType: "SCIENTIFIC_SCOPE",
      summary:
        "Synthetic challenge: clarify treatment context and the temporal relationship before interpreting this lead.",
      status: "OPEN",
      createdAt: this.clock(),
    });
    record.card = { ...record.card!, challengeCount: record.challengeCount };
    this.dependencyReviewRequired = true;
    return {
      challengeCount: record.challengeCount,
      status: "OPEN",
      dependencyReviewRequired: true,
    };
  }

  correctContribution(contributionId: string): {
    leadVersion: number;
    missingMaterialFields: string[];
    latestCorrectionLeadVersion: number;
  } {
    const record = this.requirePublishedContribution(contributionId);
    if (record.withdrawn)
      throw new Error("SYNTHETIC_GAP_CONTRIBUTION_WITHDRAWN");
    const at = this.clock();
    const current = record.lead;
    const updatedMissing = current.missingMaterialFields.filter(
      (field) => field !== "baseline prolactin/MRI documentation",
    );
    const nextLead = communityLeadSchema.parse({
      ...current,
      leadVersion: current.leadVersion + 1,
      completenessBand: completenessBand(updatedMissing),
      missingMaterialFields: updatedMissing,
      status: "APPROVED",
    });
    record.lead = this.leads.correctLead(
      {
        synthetic: true,
        correctionId: `ARCORR-GAPLOOP${String(record.ordinal).padStart(4, "0")}V${nextLead.leadVersion}`,
        leadId: current.leadId,
        fromLeadVersion: current.leadVersion,
        toLeadVersion: nextLead.leadVersion,
        correctionSummary:
          "Synthetic correction adds baseline-documentation metadata; remaining missingness stays explicit.",
        createdAt: at,
      },
      nextLead,
    );
    record.correctionSummary =
      "Baseline documentation metadata added; no verification or causal upgrade.";
    this.projectCurrentRecord(record, at, true);
    this.dependencyReviewRequired = true;
    this.refreshResearchBoundary("SYNTHETIC_LEAD_CORRECTED");
    return {
      leadVersion: record.lead.leadVersion,
      missingMaterialFields: [...record.lead.missingMaterialFields],
      latestCorrectionLeadVersion: record.lead.leadVersion,
    };
  }

  withdrawContribution(contributionId: string): {
    withdrawn: true;
    tombstone: { publicVersionId: string; contentRetained: false };
    withdrawnPublicVersionCount: number;
    dependencyReviewRequired: true;
  } {
    const record = this.requirePublishedContribution(contributionId);
    if (record.syntheticSeed)
      throw new Error("SYNTHETIC_GAP_SEED_COMPARATOR_WITHDRAWAL_BLOCKED");
    if (record.withdrawn)
      throw new Error("SYNTHETIC_GAP_CONTRIBUTION_ALREADY_WITHDRAWN");
    const results = record.publicVersionIds.map((publicVersionId) =>
      this.leads.withdraw(publicVersionId),
    );
    const result = results.at(-1)!;
    record.withdrawn = true;
    record.card = { ...record.card!, withdrawn: true };
    const withdrawnAt = this.clock();
    this.tombstones.push(
      ...results.map(({ tombstone }) => ({ ...tombstone, withdrawnAt })),
    );
    this.dependencyReviewRequired = true;
    this.refreshResearchBoundary("SYNTHETIC_LEAD_WITHDRAWN");
    return {
      ...result,
      withdrawnPublicVersionCount: results.length,
      dependencyReviewRequired: true,
    };
  }

  getContributionAudit(contributionId: string): {
    narrativeSavedBeforeStructuredDetails: boolean;
    narrativeSha256: string | null;
    rawNarrativePubliclyExposed: false;
  } {
    const record = this.requireContribution(contributionId);
    return {
      narrativeSavedBeforeStructuredDetails:
        record.narrativeSavedAt !== null &&
        (record.structuredSavedAt === null ||
          record.narrativeSavedAt <= record.structuredSavedAt),
      narrativeSha256:
        record.narrative === null ? null : sha256(record.narrative),
      rawNarrativePubliclyExposed: false,
    };
  }

  snapshot() {
    const at = this.clock();
    const activeCards = [...this.contributions.values()]
      .filter((record) => !record.withdrawn && record.card !== null)
      .map((record) => record.card!);
    const frontier = buildSyntheticCommunityFrontierView({
      cards: activeCards,
      generatedAt: at,
    });
    return {
      synthetic: true as const,
      labOnly: true as const,
      gap: syntheticProlactinomaGap,
      guardrails: {
        acceptsRealHealthData: false,
        publicDeployment: false,
        recruitmentActive: false,
        efficacyPercentagePermitted: false,
        causalClaimPermitted: false,
        treatmentAdvicePermitted: false,
      },
      contributionFlow: [
        "PROVENANCE",
        "UNPROMPTED_ACCOUNT",
        "STRUCTURED_DETAILS",
        "PREVIEW_AND_CONSENT",
        "BOUNDED_PUBLIC_LEAD",
      ],
      contributions: [...this.contributions.values()].map((record) => ({
        contributionId: record.contributionId,
        provenance: record.provenance,
        syntheticSeed: record.syntheticSeed,
        narrativeSavedPrivately: record.narrative !== null,
        structuredDetailsSaved: record.details !== null,
        preview: record.draft.preview,
        publicationRequested:
          record.draft.status === "SYNTHETIC_PUBLICATION_REQUESTED",
        leadId: record.lead?.leadId ?? null,
        leadVersion: record.lead?.leadVersion ?? null,
        verificationState: record.lead?.verificationState ?? null,
        evidenceCapability: record.lead?.evidenceCapability ?? null,
        completenessBand: record.lead?.completenessBand ?? null,
        missingMaterialFields: record.lead?.missingMaterialFields ?? [],
        publicVersionId: record.publicVersionId,
        publicProjectionVisible: !record.withdrawn && record.card !== null,
        challengeCount: record.challengeCount,
        correctionSummary: record.correctionSummary,
        withdrawn: record.withdrawn,
      })),
      frontier,
      comparatorCoverage: {
        remissionLeads: frontier.directionCounts.improved,
        nonRemissionComparators: frontier.directionCounts.noClearChange,
        comparisonCasesValuable: true,
        recruitmentMessage:
          "Needed equally: synthetic people with the same transition who did not enter remission.",
      },
      tombstones: structuredClone(this.tombstones),
      researchBoundary: {
        ...this.researchBoundary,
        dependencyReviewRequired: this.dependencyReviewRequired,
        recruitmentActive: false as const,
        automaticResearchExecution: false as const,
      },
      generatedAt: at,
    };
  }

  private seedNonRemissionComparator(): void {
    const at = this.clock();
    const reporterAccountId = "ARSYN-GAPCOMPARATOR01";
    let draft = this.composer.startDraft({
      draftId: "ARDRAFT-GAPCOMPARATOR01",
      reporterAccountId,
      sourcePostId: null,
      updatedAt: at,
    });
    const details: SyntheticGapDetailsInput = {
      outcome: "NO_REMISSION",
      exposure: "PREGNANCY_POSTPARTUM",
      timingKnown: true,
      persistenceKnown: true,
      baselineDocumented: false,
      followupDocumented: false,
      treatmentContext: "NO_PRIOR_DOPAMINE_AGONIST",
    };
    draft = this.composer.recordDetails(
      draft.draftId,
      reporterAccountId,
      {
        reporter: {
          role: provenanceDetails.SELF.role,
          informationOrigin: provenanceDetails.SELF.informationOrigin,
          sourceDistance: provenanceDetails.SELF.sourceDistance,
        },
        condition: {
          name: "Synthetic reported prolactinoma",
          diagnosticCertainty: "SELF_IDENTIFIED",
        },
        interventionEpisode: {
          components: [
            exposureLabels[details.exposure],
            treatmentLabels[details.treatmentContext],
          ],
          exactCombinationKnown: true,
        },
        outcome: {
          name: "Synthetic reported prolactinoma non-remission",
          reportedDirection: "NO_CLEAR_CHANGE",
          timing: "Synthetic postpartum interval recorded",
          persistence: "Synthetic non-remission follow-up recorded",
        },
        cointerventions: [treatmentLabels[details.treatmentContext]],
        harms: [],
        unknowns: missingFields(details),
      },
      at,
    );
    draft = this.composer.preparePreview(
      draft.draftId,
      reporterAccountId,
      {
        publicTitle: publicTitle(details),
        publicParaphrase: publicParaphrase("SELF", details),
        sourceDistanceLabel: provenanceDetails.SELF.label,
        limitations: [
          "Synthetic, self-selected, unverified, incomplete, and noncausal.",
          "This comparator is not a denominator or effectiveness estimate.",
        ],
      },
      at,
    );
    for (const [permission, decision] of [
      ["PUBLIC_LEAD", "YES"],
      ["DIRECT_QUOTATION", "NO"],
      ["EXACT_REGIMEN_PUBLICATION", "NO"],
      ["RECONTACT", "NO"],
    ] as const) {
      draft = this.composer.recordPermission(
        draft.draftId,
        reporterAccountId,
        permission,
        decision,
        at,
      );
    }
    draft = this.composer.acknowledgePreview(
      draft.draftId,
      reporterAccountId,
      at,
    );
    draft = this.composer.requestSyntheticPublication(
      draft.draftId,
      reporterAccountId,
      at,
    );
    const record: SyntheticContributionRecord = {
      contributionId: "synthetic-gap-comparator-seed",
      ordinal: 0,
      reporterAccountId,
      provenance: "SELF",
      draft,
      narrative:
        "Synthetic account: pregnancy and delivery occurred, but no remission was reported during the synthetic follow-up interval.",
      narrativeSavedAt: at,
      structuredSavedAt: at,
      details,
      lead: null,
      publicVersionId: null,
      publicVersionIds: [],
      card: null,
      challengeCount: 0,
      correctionSummary: null,
      withdrawn: false,
      syntheticSeed: true,
    };
    this.contributions.set(record.contributionId, record);
    this.publishRecord(record, at);
  }

  private publishRecord(record: SyntheticContributionRecord, at: string): void {
    const details = record.details!;
    const suffix =
      record.syntheticSeed
        ? "GAPCOMPARATOR01"
        : `GAPLOOP${String(record.ordinal).padStart(4, "0")}`;
    const missing = missingFields(details);
    const sourceVersion = 1;
    const lead = communityLeadSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      leadId: `ARLEAD-${suffix}`,
      leadVersion: 1,
      sourceReferences: [
        {
          synthetic: true,
          sourceEventId: `AREVT-${suffix}V1`,
          forumInstanceId: "ASKRIGOR-SYNTHETIC-LAB",
          topicId: `SYNTHETIC-TOPIC-${5100 + record.ordinal}`,
          postId: `SYNTHETIC-POST-${5100 + record.ordinal}`,
          sourceVersion,
          sourceVisibility: "PUBLIC",
          authorAccountId: record.reporterAccountId,
          occurredAt: at,
          contentSha256: sha256(record.narrative!),
          rawForumBodyPersisted: false,
        },
      ],
      reporter: {
        accountId: record.reporterAccountId,
        role: provenanceDetails[record.provenance].role,
        informationOrigin:
          provenanceDetails[record.provenance].informationOrigin,
        sourceDistance: provenanceDetails[record.provenance].sourceDistance,
        verificationState: "UNVERIFIED",
      },
      subjectBoundary: {
        subjectIdentifiableInPublicVersion: false,
        directSubjectQuotePresent: false,
        subjectDocumentsOrMediaPresent: false,
        subjectExactVersionApproval: null,
        minorStatus: "ADULT",
      },
      condition: {
        name: "Synthetic reported prolactinoma",
        diagnosticCertainty: "SELF_IDENTIFIED",
      },
      interventionEpisode: {
        episodeType: "BACKGROUND",
        components: [
          {
            name: exposureLabels[details.exposure],
            doseKnown: false,
            route: null,
          },
          {
            name: treatmentLabels[details.treatmentContext],
            doseKnown: false,
            route: null,
          },
        ],
        sequenceKnown: details.timingKnown,
      },
      outcome: {
        name:
          details.outcome === "REPORTED_REMISSION"
            ? "Synthetic reported prolactinoma remission or regression"
            : "Synthetic reported prolactinoma non-remission",
        reportedDirection: reportedDirection(details.outcome),
        reportedMagnitude:
          details.outcome === "REPORTED_REMISSION" ? "LARGE" : "MINIMAL",
        measurementType: "SUBJECTIVE_GLOBAL",
      },
      verificationState: "UNVERIFIED",
      evidenceCapability:
        record.provenance === "HEARSAY" ? "LEAD_ONLY" : "DESCRIPTIVE_REPORT_ONLY",
      formalEvidenceRelationship: "NOT_CHECKED",
      completenessBand: completenessBand(missing),
      missingMaterialFields: missing,
      duplicateOrLinkedLeadIds: [],
      reporterPublicLeadConsent: consent(at, "REPORTER"),
      status: "APPROVED",
      createdAt: at,
    });
    record.lead = this.leads.createLead(lead);
    this.projectCurrentRecord(record, at, false);
  }

  private projectCurrentRecord(
    record: SyntheticContributionRecord,
    at: string,
    corrected: boolean,
  ): void {
    const lead = record.lead!;
    const preview = record.draft.preview!;
    const publicVersionId = `ARPUB-${
      record.syntheticSeed
        ? "GAPCOMPARATOR01"
        : `GAPLOOP${String(record.ordinal).padStart(4, "0")}`
    }V${lead.leadVersion}`;
    const candidate = communityPublicVersionSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      publicVersionId,
      leadId: lead.leadId,
      leadVersion: lead.leadVersion,
      publicationObjectType: "PUBLIC_RESEARCH_LEAD",
      publicTitle: preview.publicTitle,
      publicParaphrase: corrected
        ? `${preview.publicParaphrase} A synthetic correction added baseline-documentation metadata without upgrading verification.`
        : preview.publicParaphrase,
      sourceDistanceLabel: preview.sourceDistanceLabel,
      limitations: [
        ...preview.limitations,
        ...lead.missingMaterialFields.map((field) => `Missing: ${field}.`),
      ],
      reporterPublicationConsent: consent(at, "REPORTER"),
      subjectExactVersionApproval: null,
      privacyReview: {
        reviewId: `ARPRIV-GAP${String(record.ordinal).padStart(4, "0")}V${lead.leadVersion}`,
        outcome: "PASS",
        riskFlags: [],
        reviewedAt: at,
      },
      abuseReviewState: "PASS",
      jurisdictionPolicyState: "ALLOWED_SYNTHETIC_LAB",
      subjectIdentifiableInPublicVersion: false,
      directSubjectQuotePresent: false,
      documentsOrMediaPresent: false,
      verificationState: lead.verificationState,
      evidenceCapability: lead.evidenceCapability,
      formalEvidenceRelationship: lead.formalEvidenceRelationship,
      status: "SYNTHETIC_LAB_PROJECTION",
      publicPayloadSha256: "0".repeat(64),
    });
    const publicVersion: CommunityPublicVersion = communityPublicVersionSchema.parse({
      ...candidate,
      publicPayloadSha256: syntheticPublicLeadProjectionSha256(candidate),
    });
    this.leads.projectPublicVersion(publicVersion);
    const sourceKey = computeCommunitySourceIndependenceKeys([lead]).get(
      lead.leadId,
    )!;
    record.publicVersionId = publicVersionId;
    if (!record.publicVersionIds.includes(publicVersionId))
      record.publicVersionIds.push(publicVersionId);
    record.card = {
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      cardId: `ARCARD-${
        record.syntheticSeed
          ? "GAPCOMPARATOR01"
          : `GAPLOOP${String(record.ordinal).padStart(4, "0")}`
      }`,
      publicVersionId,
      leadId: lead.leadId,
      leadVersion: lead.leadVersion,
      sourceIndependenceKey: sourceKey,
      publicTitle: publicVersion.publicTitle,
      condition: lead.condition.name,
      diagnosticCertainty: lead.condition.diagnosticCertainty,
      exactInterventionCombination: lead.interventionEpisode.components.map(
        (component) => component.name,
      ),
      reportedDirection: lead.outcome.reportedDirection,
      timingAndPersistence:
        record.details!.timingKnown && record.details!.persistenceKnown
          ? "Synthetic timing and persistence fields recorded."
          : "Synthetic timing or persistence remains incomplete.",
      reporterRole: lead.reporter.role,
      sourceDistance: lead.reporter.sourceDistance,
      sourceDistanceLabel: publicVersion.sourceDistanceLabel,
      verificationState: lead.verificationState,
      completenessBand: lead.completenessBand,
      evidenceCapability: lead.evidenceCapability,
      formalEvidenceRelationship: lead.formalEvidenceRelationship,
      harmsReported: false,
      noEffectReported: lead.outcome.reportedDirection === "NO_CLEAR_CHANGE",
      cointerventionsAndConfounders: [
        treatmentLabels[record.details!.treatmentContext],
        ...lead.missingMaterialFields,
      ],
      clusterIds: ["ARCL-GAPPROLACTINOMA01"],
      challengeCount: record.challengeCount,
      latestCorrectionLeadVersion: corrected ? lead.leadVersion : null,
      withdrawn: false,
      researchStatus: "EVIDENCE_CHECK_PENDING",
      discussionActivity: { views: 0, replies: 0 },
      discussionActivityAffectsEvidenceState: false,
    };
  }

  private refreshResearchBoundary(reason: string): void {
    const active = [...this.contributions.values()].filter(
      (record) => !record.withdrawn && record.lead !== null && record.card !== null,
    );
    this.researchVersion += 1;
    const directions = active.map((record) => record.card!.reportedDirection);
    const cluster: CommunitySignalCluster = {
      schemaVersion: "0.1.0",
      synthetic: true,
      clusterId: "ARCL-GAPPROLACTINOMA01",
      clusterVersion: this.researchVersion,
      scope: {
        condition: "Synthetic reported prolactinoma",
        population: "Synthetic adults with reported prolactinoma",
        interventionOrExposure: "Candidate biological, treatment, or life transition",
        comparator: "Same candidate transition with no reported remission",
        outcome: "Reported remission/regression versus non-remission",
        horizon: "Synthetic longitudinal follow-up",
      },
      programFingerprint: `synthetic-prolactinoma-gap-v${this.researchVersion}`,
      memberLeadIds: active.map((record) => record.lead!.leadId).sort(),
      independentSourceCount: active.length,
      directionCounts: {
        improved: directions.filter((value) => value === "IMPROVED").length,
        worsened: directions.filter((value) => value === "WORSENED").length,
        noClearChange: directions.filter((value) => value === "NO_CLEAR_CHANGE")
          .length,
        mixed: directions.filter((value) => value === "MIXED").length,
        unknown: directions.filter((value) => value === "UNKNOWN").length,
      },
      duplicateHandling:
        "Synthetic records are source-keyed; no duplicate linkage is asserted in this fixture.",
      formalEvidenceRelationship: "NOT_CHECKED",
      denominatorAvailable: false,
      effectivenessPercentageDisplayPermitted: false,
      limitations: [
        "Synthetic, self-selected, partial lead set; not a prevalence or efficacy denominator.",
        "Remission and non-remission reports retain their actual verification and missingness labels.",
      ],
      createdAt: this.clock(),
    };
    this.leads.createCluster(cluster);
    this.research.registerCluster(cluster);
    const question: CommunityResearchQuestion = {
      synthetic: true,
      questionId: "ARQ-GAPPROLACTINOMA01",
      questionVersion: this.researchVersion,
      derivedFromClusterIds: [cluster.clusterId],
      questionText: syntheticProlactinomaGap.researchQuestion,
      evidenceCheckStatus: "NOT_ANSWERED",
      status: "PROPOSAL_LINKED",
      createdAt: this.clock(),
    };
    this.research.createQuestion(question, [
      { clusterId: cluster.clusterId, clusterVersion: cluster.clusterVersion },
    ]);
    const evidenceCheck: CommunityQuestionEvidenceCheck = {
      synthetic: true,
      evidenceCheckId: `AREC-GAPPROLACTINOMA${String(this.researchVersion).padStart(2, "0")}`,
      questionId: question.questionId,
      questionVersion: question.questionVersion,
      matchedEvidenceStatus: "NOT_ANSWERED",
      summary:
        "The synthetic partial lead set preserves remission and non-remission reports, but it cannot answer frequency or causality and requires formal evidence review.",
      evidenceIdentifiers: [
        `SYNTHETIC-CLUSTER-${cluster.clusterId}-V${cluster.clusterVersion}`,
      ],
      checkedAt: this.clock(),
    };
    this.research.recordEvidenceCheck(evidenceCheck);
    const proposal: CommunityResearchProposal = {
      synthetic: true,
      proposalId: "ARPROP-GAPPROLACTINOMA01",
      proposalVersion: this.researchVersion,
      questionId: question.questionId,
      questionVersion: question.questionVersion,
      proposalType: "PROSPECTIVE_COMMUNITY_FOLLOW_UP",
      designSummary:
        "Synthetic draft: collect longitudinal remission and matched non-remission cases with treatment context and document-supported outcome timing. No recruitment is active.",
      ethicsState: "REVIEW_REQUIRED",
      privacyState: "REVIEW_REQUIRED",
      safetyState: "REVIEW_REQUIRED",
      methodsReviewState: "NOT_REVIEWED",
      recruitmentActive: false,
      status: "DRAFT",
      createdAt: this.clock(),
    };
    this.research.createProposal(proposal, evidenceCheck.evidenceCheckId);
    this.researchBoundary = {
      cluster,
      question,
      evidenceCheck,
      proposal,
      sourceChangeRequiresReview: this.dependencyReviewRequired,
      latestChangeReason: reason,
    };
  }

  private requireContribution(
    contributionId: string,
  ): SyntheticContributionRecord {
    const record = this.contributions.get(contributionId);
    if (record === undefined)
      throw new Error("SYNTHETIC_GAP_CONTRIBUTION_NOT_FOUND");
    return record;
  }

  private requirePublishedContribution(
    contributionId: string,
  ): SyntheticContributionRecord & {
    lead: CommunityLead;
    card: CommunityFrontierCard;
  } {
    const record = this.requireContribution(contributionId);
    if (record.lead === null || record.card === null)
      throw new Error("SYNTHETIC_GAP_CONTRIBUTION_NOT_PUBLISHED");
    return record as SyntheticContributionRecord & {
      lead: CommunityLead;
      card: CommunityFrontierCard;
    };
  }
}
