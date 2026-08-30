import {
  communityComposerDetailsSchema,
  communityComposerDraftSchema,
  communityFrontierCardSchema,
  communityFrontierFiltersSchema,
  communityFrontierViewSchema,
  communityOperationalActionSchema,
  communityOperationalQueueItemSchema,
  communityOperationalRoleAssignmentSchema,
  communityOperationalRoleCapabilities,
  type CommunityComposerDetails,
  type CommunityComposerDraft,
  type CommunityFrontierCard,
  type CommunityFrontierView,
  type CommunityOperationalAction,
  type CommunityOperationalQueueItem,
  type CommunityOperationalRoleAssignment,
} from "@askrigor/contracts";

import { sha256, stableJson } from "./hash.js";

const INITIAL_MISSING_FIELDS = [
  "reporter relationship",
  "information origin",
  "condition and diagnostic certainty",
  "intervention combination",
  "outcome direction",
  "timing",
  "persistence",
  "co-interventions",
  "harms",
  "unknowns",
  "publication permissions",
] as const;

type ComposerPermission =
  | "PUBLIC_LEAD"
  | "DIRECT_QUOTATION"
  | "EXACT_REGIMEN_PUBLICATION"
  | "RECONTACT";
type PermissionDecision = "YES" | "NO" | "WITHDRAWN";

interface ComposerPreviewInput {
  publicTitle: string;
  publicParaphrase: string;
  sourceDistanceLabel: string;
  limitations: string[];
}

export class SyntheticCommunityComposerService {
  private readonly drafts = new Map<string, CommunityComposerDraft>();

  startDraft(input: {
    draftId: string;
    reporterAccountId: string;
    sourcePostId: string | null;
    updatedAt: string;
  }): CommunityComposerDraft {
    const draft = communityComposerDraftSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      labOnly: true,
      draftId: input.draftId,
      draftVersion: 1,
      reporterAccountId: input.reporterAccountId,
      entryPoint:
        input.sourcePostId === null ? "DIRECT_STRUCTURED_INTAKE" : "FORUM_POST",
      sourcePostId: input.sourcePostId,
      sourcePostDisposition:
        input.sourcePostId === null
          ? "NOT_APPLICABLE_DIRECT_INTAKE"
          : "ORDINARY_CONVERSATION",
      status: "DRAFT",
      completedSteps: [],
      reporter: null,
      condition: null,
      interventionEpisode: null,
      outcome: null,
      cointerventions: [],
      harms: [],
      unknowns: [],
      permissions: {
        publicLead: "NOT_ASKED",
        directQuotation: "NOT_ASKED",
        exactRegimenPublication: "NOT_ASKED",
        recontact: "NOT_ASKED",
      },
      preview: null,
      missingMaterialFields: [...INITIAL_MISSING_FIELDS],
      updatedAt: input.updatedAt,
    });
    const prior = this.drafts.get(draft.draftId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(draft)) {
        throw new Error("COMMUNITY_COMPOSER_DRAFT_COLLISION");
      }
      return structuredClone(prior);
    }
    this.drafts.set(draft.draftId, draft);
    return structuredClone(draft);
  }

  offerLeadConversion(draftId: string, updatedAt: string): CommunityComposerDraft {
    const current = this.requireDraft(draftId);
    if (current.sourcePostId === null) {
      throw new Error("COMMUNITY_COMPOSER_SOURCE_POST_REQUIRED");
    }
    if (current.sourcePostDisposition === "CONVERSION_OFFERED") return current;
    if (current.sourcePostDisposition !== "ORDINARY_CONVERSATION") {
      throw new Error("COMMUNITY_COMPOSER_CONVERSION_ALREADY_DECIDED");
    }
    return this.advance(current, {
      sourcePostDisposition: "CONVERSION_OFFERED",
      updatedAt,
    });
  }

  respondToLeadConversion(
    draftId: string,
    reporterAccountId: string,
    decision: "ACCEPTED" | "DECLINED",
    updatedAt: string,
  ): CommunityComposerDraft {
    const current = this.requireOwnedDraft(draftId, reporterAccountId);
    if (current.sourcePostDisposition !== "CONVERSION_OFFERED") {
      throw new Error("COMMUNITY_COMPOSER_CONVERSION_OFFER_NOT_ACTIVE");
    }
    return this.advance(current, {
      sourcePostDisposition:
        decision === "ACCEPTED" ? "CONVERSION_ACCEPTED" : "CONVERSION_DECLINED",
      updatedAt,
    });
  }

  recordDetails(
    draftId: string,
    reporterAccountId: string,
    detailsInput: unknown,
    updatedAt: string,
  ): CommunityComposerDraft {
    const current = this.requireAcceptedDraft(draftId, reporterAccountId);
    const details = communityComposerDetailsSchema.parse(detailsInput);
    return this.advance(current, {
      ...details,
      completedSteps: [
        "REPORTER_RELATIONSHIP",
        "INFORMATION_ORIGIN",
        "CONDITION",
        "INTERVENTION_COMBINATION",
        "OUTCOME",
        ...(details.outcome.timing === null || details.outcome.persistence === null
          ? []
          : (["TIMING_AND_PERSISTENCE"] as const)),
        "COINTERVENTIONS",
        "HARMS",
        "UNKNOWNS",
      ],
      missingMaterialFields: this.missingFields(details, current),
      updatedAt,
    });
  }

  preparePreview(
    draftId: string,
    reporterAccountId: string,
    previewInput: ComposerPreviewInput,
    updatedAt: string,
  ): CommunityComposerDraft {
    const current = this.requireAcceptedDraft(draftId, reporterAccountId);
    if (
      current.reporter === null ||
      current.condition === null ||
      current.interventionEpisode === null ||
      current.outcome === null
    ) {
      throw new Error("COMMUNITY_COMPOSER_MINIMUM_PREVIEW_FIELDS_MISSING");
    }
    const previewPayload = {
      publicTitle: previewInput.publicTitle,
      publicParaphrase: previewInput.publicParaphrase,
      sourceDistanceLabel: previewInput.sourceDistanceLabel,
      limitations: previewInput.limitations,
    };
    return this.advance(current, {
      preview: {
        ...previewPayload,
        previewPayloadSha256: sha256(stableJson(previewPayload)),
        preparedAt: updatedAt,
        acknowledgedAt: null,
      },
      completedSteps: this.withStep(current.completedSteps, "PUBLIC_PREVIEW"),
      status: "PREVIEW_READY",
      updatedAt,
    });
  }

  recordPermission(
    draftId: string,
    reporterAccountId: string,
    permission: ComposerPermission,
    decision: PermissionDecision,
    updatedAt: string,
  ): CommunityComposerDraft {
    const current = this.requireAcceptedDraft(draftId, reporterAccountId);
    const permissionKey = {
      PUBLIC_LEAD: "publicLead",
      DIRECT_QUOTATION: "directQuotation",
      EXACT_REGIMEN_PUBLICATION: "exactRegimenPublication",
      RECONTACT: "recontact",
    }[permission];
    return this.advance(current, {
      permissions: { ...current.permissions, [permissionKey]: decision },
      completedSteps: this.withStep(current.completedSteps, "PERMISSIONS"),
      updatedAt,
    });
  }

  acknowledgePreview(
    draftId: string,
    reporterAccountId: string,
    updatedAt: string,
  ): CommunityComposerDraft {
    const current = this.requireAcceptedDraft(draftId, reporterAccountId);
    if (current.preview === null) {
      throw new Error("COMMUNITY_COMPOSER_PREVIEW_REQUIRED");
    }
    return this.advance(current, {
      preview: { ...current.preview, acknowledgedAt: updatedAt },
      updatedAt,
    });
  }

  requestSyntheticPublication(
    draftId: string,
    reporterAccountId: string,
    updatedAt: string,
  ): CommunityComposerDraft {
    const current = this.requireOwnedDraft(draftId, reporterAccountId);
    if (current.permissions.publicLead !== "YES") {
      throw new Error("COMMUNITY_COMPOSER_PUBLIC_LEAD_OPT_IN_REQUIRED");
    }
    if (!this.hasExplicitLeadIntent(current)) {
      throw new Error("COMMUNITY_COMPOSER_CONVERSION_NOT_ACCEPTED");
    }
    if (current.preview?.acknowledgedAt == null) {
      throw new Error("COMMUNITY_COMPOSER_PREVIEW_ACKNOWLEDGEMENT_REQUIRED");
    }
    return this.advance(current, {
      status: "SYNTHETIC_PUBLICATION_REQUESTED",
      updatedAt,
    });
  }

  stopEarly(
    draftId: string,
    reporterAccountId: string,
    updatedAt: string,
  ): CommunityComposerDraft {
    const current = this.requireOwnedDraft(draftId, reporterAccountId);
    if (current.status === "SYNTHETIC_PUBLICATION_REQUESTED") {
      throw new Error("COMMUNITY_COMPOSER_PUBLICATION_ALREADY_REQUESTED");
    }
    return this.advance(current, { status: "STOPPED", updatedAt });
  }

  getDraft(draftId: string): CommunityComposerDraft | null {
    const current = this.drafts.get(draftId);
    return current === undefined ? null : structuredClone(current);
  }

  private missingFields(
    details: CommunityComposerDetails,
    current: CommunityComposerDraft,
  ): string[] {
    const missing: string[] = [];
    if (!details.interventionEpisode.exactCombinationKnown)
      missing.push("exact intervention combination");
    if (details.outcome.timing === null) missing.push("timing");
    if (details.outcome.persistence === null) missing.push("persistence");
    if (details.unknowns.length === 0) missing.push("explicit unknowns");
    if (current.permissions.publicLead !== "YES")
      missing.push("publication permissions");
    return missing;
  }

  private withStep(
    steps: CommunityComposerDraft["completedSteps"],
    step: CommunityComposerDraft["completedSteps"][number],
  ): CommunityComposerDraft["completedSteps"] {
    return [...new Set([...steps, step])];
  }

  private requireAcceptedDraft(
    draftId: string,
    reporterAccountId: string,
  ): CommunityComposerDraft {
    const current = this.requireOwnedDraft(draftId, reporterAccountId);
    if (!this.hasExplicitLeadIntent(current)) {
      throw new Error("COMMUNITY_COMPOSER_CONVERSION_NOT_ACCEPTED");
    }
    return current;
  }

  private hasExplicitLeadIntent(current: CommunityComposerDraft): boolean {
    return ["CONVERSION_ACCEPTED", "NOT_APPLICABLE_DIRECT_INTAKE"].includes(
      current.sourcePostDisposition,
    );
  }

  private requireOwnedDraft(
    draftId: string,
    reporterAccountId: string,
  ): CommunityComposerDraft {
    const current = this.requireDraft(draftId);
    if (current.reporterAccountId !== reporterAccountId) {
      throw new Error("COMMUNITY_COMPOSER_ACCOUNT_MISMATCH");
    }
    return current;
  }

  private requireDraft(draftId: string): CommunityComposerDraft {
    const current = this.drafts.get(draftId);
    if (current === undefined) throw new Error("COMMUNITY_COMPOSER_DRAFT_NOT_FOUND");
    return structuredClone(current);
  }

  private advance(
    current: CommunityComposerDraft,
    patch: Partial<CommunityComposerDraft>,
  ): CommunityComposerDraft {
    const next = communityComposerDraftSchema.parse({
      ...current,
      ...patch,
      draftVersion: current.draftVersion + 1,
    });
    this.drafts.set(next.draftId, next);
    return structuredClone(next);
  }
}

const DIRECTION_ORDER = [
  "NO_CLEAR_CHANGE",
  "WORSENED",
  "IMPROVED",
  "MIXED",
  "UNKNOWN",
] as const;

export type SyntheticCommunityFrontierView = CommunityFrontierView;

export function buildSyntheticCommunityFrontierView(input: {
  cards: unknown[];
  filters?: unknown;
  generatedAt: string;
}): SyntheticCommunityFrontierView {
  const cards = input.cards.map((card) => communityFrontierCardSchema.parse(card));
  const filters = communityFrontierFiltersSchema.parse(input.filters ?? {});
  const visible = cards.filter((card) => {
    if (!filters.includeWithdrawn && card.withdrawn) return false;
    if (
      filters.directions !== undefined &&
      !filters.directions.includes(card.reportedDirection)
    )
      return false;
    if (
      filters.condition !== undefined &&
      card.condition.toLocaleLowerCase() !== filters.condition.toLocaleLowerCase()
    )
      return false;
    if (
      filters.verificationStates !== undefined &&
      !filters.verificationStates.includes(card.verificationState)
    )
      return false;
    if (
      filters.evidenceCapabilities !== undefined &&
      !filters.evidenceCapabilities.includes(card.evidenceCapability)
    )
      return false;
    return true;
  });
  const buckets = new Map(
    DIRECTION_ORDER.map((direction) => [
      direction,
      visible
        .filter((card) => card.reportedDirection === direction)
        .sort((left, right) => left.cardId.localeCompare(right.cardId)),
    ]),
  );
  const ordered: CommunityFrontierCard[] = [];
  for (let index = 0; ordered.length < visible.length; index += 1) {
    for (const direction of DIRECTION_ORDER) {
      const card = buckets.get(direction)?.[index];
      if (card !== undefined) ordered.push(card);
    }
  }
  const count = (direction: CommunityFrontierCard["reportedDirection"]): number =>
    visible.filter((card) => card.reportedDirection === direction).length;
  return communityFrontierViewSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    defaultOrder: "DIRECTION_BALANCED_STABLE",
    cards: structuredClone(ordered),
    directionCounts: {
      improved: count("IMPROVED"),
      worsened: count("WORSENED"),
      noClearChange: count("NO_CLEAR_CHANGE"),
      mixed: count("MIXED"),
      unknown: count("UNKNOWN"),
    },
    reportedLeadCount: visible.length,
    independentSourceCount: new Set(
      visible.map((card) => card.sourceIndependenceKey),
    ).size,
    denominatorAvailable: false,
    effectivenessPercentageDisplayPermitted: false,
    denominatorBoundary:
      "Self-selected synthetic reports are leads, not a treatment-effect denominator.",
    discussionActivityAffectsEvidenceState: false,
    appliedFilters: structuredClone(filters),
    generatedAt: input.generatedAt,
  });
}

export class SyntheticCommunityOperationsService {
  private readonly queueItems = new Map<string, CommunityOperationalQueueItem>();
  private readonly actions = new Map<string, CommunityOperationalAction>();
  private readonly roleAssignments = new Map<
    string,
    CommunityOperationalRoleAssignment
  >();

  assignRole(input: unknown): CommunityOperationalRoleAssignment {
    const assignment = communityOperationalRoleAssignmentSchema.parse(input);
    const key = `${assignment.actorId}:${assignment.role}`;
    const prior = this.roleAssignments.get(key);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(assignment))
        throw new Error("COMMUNITY_OPERATION_ROLE_ASSIGNMENT_COLLISION");
      return structuredClone(prior);
    }
    this.roleAssignments.set(key, assignment);
    return structuredClone(assignment);
  }

  enqueue(input: unknown): CommunityOperationalQueueItem {
    const item = communityOperationalQueueItemSchema.parse(input);
    if (item.status !== "QUEUED") {
      throw new Error("COMMUNITY_OPERATION_NEW_ITEM_MUST_BE_QUEUED");
    }
    const prior = this.queueItems.get(item.queueItemId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(item))
        throw new Error("COMMUNITY_OPERATION_QUEUE_ITEM_COLLISION");
      return structuredClone(prior);
    }
    this.queueItems.set(item.queueItemId, item);
    return structuredClone(item);
  }

  act(input: unknown): CommunityOperationalAction {
    if (
      typeof input === "object" &&
      input !== null &&
      "sourceMeaningSha256Before" in input &&
      "sourceMeaningSha256After" in input &&
      input.sourceMeaningSha256Before !== input.sourceMeaningSha256After
    ) {
      throw new Error("COMMUNITY_OPERATION_CANNOT_REWRITE_SOURCE_MEANING");
    }
    const action = communityOperationalActionSchema.parse(input);
    const item = this.queueItems.get(action.queueItemId);
    if (item === undefined) throw new Error("COMMUNITY_OPERATION_QUEUE_ITEM_NOT_FOUND");
    if (!this.roleAssignments.has(`${action.actorId}:${action.activeRole}`)) {
      throw new Error("COMMUNITY_OPERATION_ACTIVE_ROLE_NOT_ASSIGNED");
    }
    const capabilities = communityOperationalRoleCapabilities[action.activeRole] as readonly string[];
    if (!capabilities.includes(action.capability)) {
      throw new Error("COMMUNITY_OPERATION_ROLE_CAPABILITY_MISMATCH");
    }
    if (item.requiredCapability !== action.capability) {
      throw new Error("COMMUNITY_OPERATION_QUEUE_CAPABILITY_MISMATCH");
    }
    if (
      item.independentReviewRequired &&
      item.originatorActorId === action.actorId
    ) {
      throw new Error("COMMUNITY_OPERATION_INDEPENDENT_REVIEW_COLLISION");
    }
    if (item.sourceMeaningSha256 !== action.sourceMeaningSha256Before) {
      throw new Error("COMMUNITY_OPERATION_STALE_SOURCE_MEANING");
    }
    const prior = this.actions.get(action.actionId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(action))
        throw new Error("COMMUNITY_OPERATION_ACTION_COLLISION");
      return structuredClone(prior);
    }
    this.actions.set(action.actionId, action);
    return structuredClone(action);
  }

  getActions(queueItemId: string): CommunityOperationalAction[] {
    return [...this.actions.values()]
      .filter((action) => action.queueItemId === queueItemId)
      .map((action) => structuredClone(action));
  }
}
