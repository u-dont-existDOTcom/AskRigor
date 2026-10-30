import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  RELATED_PROPOSAL_KEY_KINDS,
  RELATED_RECORDS_SHOWN,
  RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES,
  ResearchContributionReviewError,
  ResearchContributionReviewService,
  type CanonicalIdentityReader,
  type ResearchContributionReviewView,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import {
  ATLAS_REVIEW_ACTIONS,
  ATLAS_REVIEW_ERROR_CODES,
  ATLAS_REVIEW_OUTCOMES,
  atlasCardViewSchema,
  atlasChecksSchema,
  atlasFindingsListSchema,
  atlasForgetSchema,
  atlasHeldWithoutCardSchema,
  atlasRetrySchema,
  atlasReviewInputShape,
  atlasStatusSchema,
  atlasYoutubeFindingsSchema,
  isAtlasReviewAction,
  refineAtlasReviewInput,
  type AtlasProviderConfig,
  type AtlasReview,
  type AtlasReviewRequest,
  type AtlasReviewResult,
} from "./findings/atlas-review.js";
import { atlasParticipationSchema } from "./atlas/participation-review.js";
import { atlasPublicationsSchema } from "./atlas/publication-review.js";
import { laterInputShape } from "./later-inputs.js";
import { CASE_REVIEW_SCOPE } from "./oauth-resource-server.js";
import type { ResearchOperationExtra } from "./research-operation.js";
import type { SharedAnswerVault } from "./shared-answers.js";

const PROPOSAL_ACTIONS = ["inspect", "status", "accept", "reject"] as const;
// Owner answer 200a: the shared questions and answers, runtime-only actions (owner answer 189a).
const SHARED_ANSWER_REVIEW_ACTIONS = ["list_shared_answers", "read_shared_answer", "delete_shared_answer"] as const;
type SharedAnswerReviewAction = typeof SHARED_ANSWER_REVIEW_ACTIONS[number];
function isSharedAnswerReviewAction(action: string): action is SharedAnswerReviewAction {
  return (SHARED_ANSWER_REVIEW_ACTIONS as readonly string[]).includes(action);
}

export const researchContributionReviewInputSchema = z.object({
  action: z.enum([...PROPOSAL_ACTIONS, ...ATLAS_REVIEW_ACTIONS, ...SHARED_ANSWER_REVIEW_ACTIONS])
    .describe("Proposals: inspect, status, accept or reject. Findings for the Atlas: list_findings, inspect_finding, " +
      "accept_finding, edit_finding, reject_finding, withdraw_finding, link_findings or forget_card. Held YouTube " +
      "findings: list_youtube_findings, move_youtube_findings, delete_youtube_findings or delete_all_youtube_findings. " +
      "Publications in the Atlas: " +
      "list_publications, unpublish_finding, publish_cards or set_aside_cards. publish_cards takes topicKey and " +
      "topicLabel for cards that declare no topic; a stored topic's label is reused, and topicless publications " +
      "are withdrawn then published again with their P numbers. Comments and the home page: " +
      "list_comments, hide_comment, show_comment, remove_comment, stop_commenter, restore_commenter or set_picks."),
  proposalId: z.string().uuid().optional().describe("Proposals: the proposal's ID."),
  expectedPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional()
    .describe("Proposals: the payload hash inspect returned."),
  reason: z.string().trim().min(1).max(2_000).optional()
    .describe("The owner's private reason: needed to accept or reject a proposal, to reject a finding, and to " +
      "unpublish one."),
  ...atlasReviewInputShape,
}).strict().superRefine((value, context) => {
  if (isSharedAnswerReviewAction(value.action)) {
    const given = (Object.keys(value) as Array<keyof typeof value>)
      .filter((field) => field !== "action" && field !== ("sharedAnswerId" as keyof typeof value) && value[field] !== undefined);
    for (const field of given) {
      context.addIssue({ code: "custom", path: [field], message: `${value.action} does not take ${String(field)}` });
    }
    const id = (value as { sharedAnswerId?: unknown }).sharedAnswerId;
    if ((value.action === "list_shared_answers") !== (id === undefined)) {
      context.addIssue({ code: "custom", message: value.action === "list_shared_answers"
        ? "list_shared_answers takes no sharedAnswerId" : `${value.action} needs later_inputs.sharedAnswerId` });
    }
    return;
  }
  if (isAtlasReviewAction(value.action)) {
    refineAtlasReviewInput({ ...value, action: value.action }, context);
    return;
  }
  const atlasField = (Object.keys(atlasReviewInputShape) as Array<keyof typeof atlasReviewInputShape>)
    .find((field) => value[field] !== undefined);
  if (atlasField !== undefined) {
    context.addIssue({ code: "custom", path: [atlasField], message: `${value.action} does not take ${atlasField}` });
  }
  if (value.action === "inspect") {
    if (value.expectedPayloadSha256 !== undefined || value.reason !== undefined) {
      context.addIssue({
        code: "custom",
        message: "inspect accepts only an optional proposalId",
      });
    }
    return;
  }
  if (value.proposalId === undefined) {
    context.addIssue({ code: "custom", message: "proposalId is required" });
  }
  if (value.action === "status") {
    if (value.expectedPayloadSha256 !== undefined || value.reason !== undefined) {
      context.addIssue({
        code: "custom",
        message: "status accepts only proposalId",
      });
    }
    return;
  }
  if (value.expectedPayloadSha256 === undefined || value.reason === undefined) {
    context.addIssue({
      code: "custom",
      message: "accept and reject require the reviewed payload hash and reason",
    });
  }
});

const promotionSchema = z.object({
  promotionId: z.string().uuid(),
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  receipt: z.record(z.string(), z.unknown()).nullable(),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  failureCode: z.enum(RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES).nullable(),
  failedAt: z.string().nullable(),
}).strict();

const proposalSchema = z.object({
  proposalId: z.string().uuid(),
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"]),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  payload: z.record(z.string(), z.unknown()),
  privacyBoundary: z.record(z.string(), z.boolean()),
  partial: z.boolean(),
  status: z.enum(["PENDING_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"]),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
  reviewReason: z.string().nullable(),
  promotion: promotionSchema.nullable(),
  supersedesProposalId: z.string().uuid().nullable(),
  supersededByProposalIds: z.array(z.string().uuid()),
  // Owner answer 138b: what shares this proposal's identities, by ID only, and a dry run of the writer's identity checks.
  related: z.object({
    proposals: z.array(z.object({
      proposalId: z.string().uuid(),
      proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"]),
      status: z.enum(["PENDING_REVIEW", "ACCEPTED"]),
      promotionStatus: z.literal("PENDING").nullable(),
      shared: z.array(z.enum(RELATED_PROPOSAL_KEY_KINDS)),
    }).strict()).max(RELATED_RECORDS_SHOWN),
    proposalsNotShown: z.number().int().nonnegative(),
    canonical: z.object({
      records: z.array(z.object({
        record: z.enum(["topic", "question", "frontier", "frontier_candidate", "source_family"]),
        id: z.string().uuid(),
        frontierId: z.string().uuid().optional(),
        shared: z.enum(["topic_key", "question_text_and_dimensions", "question_id", "frontier_id", "identifier"]),
      }).strict()).max(RELATED_RECORDS_SHOWN),
      notShown: z.number().int().nonnegative(),
    }).strict().nullable(),
  }).strict(),
  preflight: z.object({
    status: z.enum(["clear", "conflicts", "replay", "unavailable"]),
    conflicts: z.array(z.object({
      code: z.enum(RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES),
      path: z.string().min(1).max(300),
    }).strict()).optional(),
  }).strict().nullable(),
}).strict();

const reviewErrorSchema = z.object({
  code: z.enum([
    "authorization_required",
    "insufficient_scope",
    "review_service_unavailable",
    "proposal_not_found",
    "payload_mismatch",
    "review_conflict",
    "promotion_intent_missing",
    "invalid_request",
    ...ATLAS_REVIEW_ERROR_CODES,
  ]),
  message: z.string(),
}).strict();

export const researchContributionReviewOutputSchema = z.object({
  ok: z.boolean(),
  outcome: z.enum([
    "pending_review",
    "accepted_pending_promotion",
    "accepted_promoted",
    "accepted_promotion_failed",
    "rejected",
    "withdrawn",
    "no_pending_proposal",
    ...ATLAS_REVIEW_OUTCOMES,
  ]).optional(),
  proposal: proposalSchema.optional(),
  // Atlas phase 2: the findings actions' objects (design section 1).
  findings: atlasFindingsListSchema.optional(),
  card: atlasCardViewSchema.optional(),
  atlas: atlasStatusSchema.optional(),
  checks: atlasChecksSchema.optional(),
  retry: atlasRetrySchema.optional(),
  // forget_card (decision 7): what was removed, and the steps left for the owner.
  forget: atlasForgetSchema.optional(),
  // move_youtube_findings, delete_youtube_findings and delete_all_youtube_findings (owner answer 173): each card's
  // outcome, the owner's steps, and how many delete_all_youtube_findings deleted.
  youtubeFindings: atlasYoutubeFindingsSchema.optional(),
  // list_youtube_findings, and delete_youtube_findings with cardSha256: the held findings with no card.
  heldWithoutCard: atlasHeldWithoutCardSchema.optional(),
  // Decision 171: the publications listed or changed, and what each card named became.
  publications: atlasPublicationsSchema.optional(),
  // Decision 171: the comments listed or moderated, the commenter changed, the home page's picks set.
  participation: atlasParticipationSchema.optional(),
  // No call of this tool writes canonical evidence: an accepted decision is a hash-bound intent a separate writer applies.
  canonicalEvidenceChangedByThisCall: z.literal(false),
  error: reviewErrorSchema.optional(),
}).strict();

type ReviewErrorCode = z.infer<typeof reviewErrorSchema>["code"];

const sharedAnswerSummarySchema = z.object({
  id: z.string(),
  sharedAt: z.string(),
  expiresAt: z.string(),
  build: z.string().optional(),
  hrp: z.string().optional(),
  universal: z.string().optional(),
  characters: z.object({ question: z.number(), answer: z.number(), improve: z.number() }).strict(),
}).strict();

/** The review tool's results as the server checks them: the published fields and the shared answers' (200a). */
export const researchContributionReviewRuntimeOutputSchema = researchContributionReviewOutputSchema.safeExtend({
  sharedAnswers: z.object({
    kept: z.array(sharedAnswerSummarySchema).optional(),
    answer: sharedAnswerSummarySchema.extend({
      question: z.string(), answer: z.string(), improve: z.string().optional(),
    }).strict().optional(),
    deleted: z.boolean().optional(),
  }).strict().optional(),
}).strict();

const researchContributionReviewRuntimeInputSchema = researchContributionReviewInputSchema.safeExtend(
  laterInputShape("review_research_contribution"));

export interface ResearchContributionReviewToolOptions {
  service?: ResearchContributionReviewService;
  resourceMetadataUrl?: URL;
  allowedReviewerSubjects?: ReadonlySet<string>;
  /** The canonical store's read-only identity view, for the related records and the promotion preflight. */
  canonical?: CanonicalIdentityReader;
  /** The owner's findings actions for the Atlas (phase 2). */
  atlas?: {
    /** ASKRIGOR_ATLAS_REVIEW=enabled; while it is off, the findings actions answer atlas_review_closed. */
    enabled: boolean;
    /** The review stores, the canonical reader and the GitHub inbox; undefined when they are not configured. */
    review?: AtlasReview;
    /** The provider settings the source checks use: crossrefConfig() and ncbiConfig(). */
    providers: () => AtlasProviderConfig;
  };
  /** The shared questions and answers (owner answer 200a); undefined when the server keeps none. */
  sharedAnswers?: SharedAnswerVault;
}

export function createResearchContributionReviewHandler(
  options: ResearchContributionReviewToolOptions,
) {
  return async (
    input: Record<string, unknown>,
    extra?: ResearchOperationExtra,
  ): Promise<CallToolResult> => {
    const authError = authorizeOwnerReview(extra, options);
    if (authError !== undefined) return authError;
    const request = researchContributionReviewRuntimeInputSchema.safeParse(input);
    if (!request.success) {
      return reviewError("invalid_request", `The owner-review request is invalid: ${issuesText(request.error)}`);
    }
    const parsed = request.data;
    if (isSharedAnswerReviewAction(parsed.action)) {
      return sharedAnswerReview(options.sharedAnswers, parsed.action, parsed.sharedAnswerId);
    }
    if (isAtlasReviewAction(parsed.action)) {
      if (options.atlas?.enabled !== true) {
        return reviewError("atlas_review_closed", "The owner's findings review for the Atlas is not open yet " +
          "(ASKRIGOR_ATLAS_REVIEW); nothing was recorded.");
      }
      if (options.atlas.review === undefined) {
        return reviewError("review_service_unavailable", "The Atlas review is not configured: it needs the review " +
          "database, the canonical reader and the findings repository. Nothing was recorded.");
      }
      return atlasToolResult(await options.atlas.review.run(
        { ...parsed, action: parsed.action } as AtlasReviewRequest,
        options.atlas.providers(),
      ));
    }
    if (options.service === undefined) {
      return reviewError(
        "review_service_unavailable",
        "The research contribution review service is not configured.",
      );
    }
    try {
      const proposal = parsed.action === "accept" || parsed.action === "reject"
        ? await options.service.decide({
            proposalId: parsed.proposalId!,
            expectedPayloadSha256: parsed.expectedPayloadSha256!,
            decision: parsed.action === "accept" ? "ACCEPT" : "REJECT",
            reason: parsed.reason!,
          })
        : await options.service.inspect(parsed.proposalId, { canonical: options.canonical });
      if (proposal === null) {
        if (parsed.action === "status") {
          return reviewError(
            "proposal_not_found",
            "The research contribution proposal does not exist.",
          );
        }
        return successfulResult(
          "There is no pending research contribution proposal to review.",
          { outcome: "no_pending_proposal" },
        );
      }
      const outcome = proposal.status === "PENDING_REVIEW"
        ? "pending_review"
        : proposal.status === "REJECTED"
          ? "rejected"
          : proposal.status === "WITHDRAWN"
            ? "withdrawn"
            : proposal.promotion?.status === "COMPLETED"
              ? "accepted_promoted"
              : proposal.promotion?.status === "FAILED"
                ? "accepted_promotion_failed"
                : "accepted_pending_promotion";
      const text = outcome === "accepted_pending_promotion"
        ? "The exact reviewed proposal was accepted and queued for the separate canonical promotion runner. This call did not change canonical evidence."
        : outcome === "accepted_promoted"
          ? "The accepted proposal has a completed canonical promotion receipt."
          : outcome === "accepted_promotion_failed"
            ? `The accepted proposal's promotion failed: the canonical writer refused it with ${proposal.promotion!.failureCode}, ` +
              "a conflict with what the append-only canonical store already holds, so nothing from it was written and " +
              "it no longer holds back later accepted proposals. Filing the research again needs a corrected proposal."
            : outcome === "rejected"
              ? "The proposal was rejected and no promotion intent exists."
              : outcome === "withdrawn"
                ? "The contributor withdrew this proposal before review."
                : "Loaded the proposal for owner review; it remains non-authoritative and pending.";
      return successfulResult(`${text}${reviewAidText(proposal)}`, { outcome, proposal });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reviewError("invalid_request", "The owner-review request is invalid.");
      }
      if (error instanceof ResearchContributionReviewError) {
        const code = {
          PROPOSAL_NOT_FOUND: "proposal_not_found",
          PAYLOAD_MISMATCH: "payload_mismatch",
          REVIEW_CONFLICT: "review_conflict",
          PROMOTION_INTENT_MISSING: "promotion_intent_missing",
        }[error.code] as ReviewErrorCode;
        return reviewError(code, error.message);
      }
      return reviewError(
        "review_service_unavailable",
        "The research contribution review operation failed closed.",
      );
    }
  };
}

/** The owner's shared answers (owner answer 200a): listed without their text, read one by one, deleted by ID. */
function sharedAnswerReview(
  vault: SharedAnswerVault | undefined,
  action: SharedAnswerReviewAction,
  id: string | undefined,
): CallToolResult {
  if (vault === undefined) {
    return reviewError("review_service_unavailable", "This AskRigor server keeps no shared answers.");
  }
  const result = (text: string, sharedAnswers: Record<string, unknown>): CallToolResult => ({
    content: [{ type: "text", text }],
    structuredContent: researchContributionReviewRuntimeOutputSchema.parse({
      ok: true, sharedAnswers, canonicalEvidenceChangedByThisCall: false,
    }),
  });
  if (action === "list_shared_answers") {
    const kept = vault.list();
    return result(kept.length === 0 ? "No shared answers are kept." : `${kept.length} shared answer(s) kept, newest ` +
      "first, without their text; read_shared_answer shows one: " + kept.map((item) =>
        `${item.id} (shared ${item.sharedAt}, expires ${item.expiresAt}${item.build === undefined ? "" : `, build ` +
          item.build.slice(0, 12)}; ${item.characters.question} + ${item.characters.answer} characters` +
          `${item.characters.improve > 0 ? ", with what to improve" : ""})`).join("; "), { kept });
  }
  if (action === "delete_shared_answer") {
    const deleted = vault.deleteById(id!);
    return result(deleted ? "The shared answer is deleted." : "No shared answer with that ID is kept.", { deleted });
  }
  const answer = vault.read(id!);
  if (answer === undefined) return result("No shared answer with that ID is kept.", {});
  return result(`Shared answer ${answer.id}, shared ${answer.sharedAt}, expires ${answer.expiresAt}. It is ` +
    "participant-given and unverified, for regression cases and fixes only; never publish it.\n\nQuestion:\n" +
    `${answer.question}\n\nAnswer:\n${answer.answer}` +
    (answer.improve === undefined ? "" : `\n\nWhat to improve:\n${answer.improve}`), { answer });
}

/** What shares the proposal's identities and what promotion would meet, in a sentence or two (IDs only). */
function reviewAidText(proposal: ResearchContributionReviewView): string {
  const parts: string[] = [];
  if (proposal.proposalKind === "TOPIC_LINK" && proposal.status === "PENDING_REVIEW") {
    // Owner answer 138b: whether two wordings name one topic is the model's declaration and the owner's judgment.
    const link = proposal.payload as { relation: string; fromTopic: { canonicalKey: string }; toTopic: { canonicalKey: string } };
    parts.push(`It declares topic ${link.fromTopic.canonicalKey} ${link.relation === "same" ? "the same as" : link.relation === "related" ? "related to" : `${link.relation} than`} ` +
      `topic ${link.toTopic.canonicalKey}; whether that is so is your judgment. Accepting it writes ` +
      (link.relation === "same" ? "each topic's label as the other's alias" : "one topic edge") +
      " and moves, changes or deletes nothing filed under either topic.");
  }
  if (proposal.supersedesProposalId !== null && proposal.status === "PENDING_REVIEW") {
    parts.push(`It replaces this account's draft ${proposal.supersedesProposalId}; accepting it rejects that draft as superseded.`);
  }
  const pending = proposal.related.proposals.length + proposal.related.proposalsNotShown;
  const canonical = proposal.related.canonical === null
    ? 0
    : proposal.related.canonical.records.length + proposal.related.canonical.notShown;
  if (pending > 0 || canonical > 0) {
    parts.push(`Related (proposal.related): ${pending} other pending or queued proposal${pending === 1 ? "" : "s"} and ` +
      `${canonical} canonical record${canonical === 1 ? "" : "s"} share its topic, question, frontier or identifiers.`);
  }
  const preflight = proposal.preflight;
  if (preflight !== null) {
    parts.push(preflight.status === "clear"
      ? "Promotion preflight: the canonical writer's identity checks find no conflict."
      : preflight.status === "replay"
        ? "Promotion preflight: the canonical store already holds this exact payload, so promotion replays it."
        : preflight.status === "unavailable"
          ? "Promotion preflight: the canonical store could not be read just now."
          : `Promotion preflight: promotion would end FAILED with ${preflight.conflicts[0]!.code} at ` +
            `${preflight.conflicts[0]!.path}` +
            (preflight.conflicts.length > 1 ? ` (${preflight.conflicts.length} conflicts in proposal.preflight).` : "."));
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}

function authorizeOwnerReview(
  extra: ResearchOperationExtra | undefined,
  options: ResearchContributionReviewToolOptions,
): CallToolResult | undefined {
  const authInfo = extra?.authInfo;
  if (
    authInfo === undefined || authInfo.expiresAt === undefined ||
    authInfo.expiresAt <= Date.now() / 1_000
  ) {
    return oauthError(
      "authorization_required",
      "Connect the owner reviewer account to inspect research proposals.",
      options.resourceMetadataUrl,
      "invalid_token",
    );
  }
  if (!authInfo.scopes.includes(CASE_REVIEW_SCOPE)) {
    return oauthError(
      "insufficient_scope",
      "The connected account lacks the cases:review permission.",
      options.resourceMetadataUrl,
      "insufficient_scope",
    );
  }
  const subject = authInfo.extra?.subject;
  if (
    typeof subject !== "string" || options.allowedReviewerSubjects === undefined ||
    !options.allowedReviewerSubjects.has(subject)
  ) {
    return oauthError(
      "insufficient_scope",
      "The connected account is not an allowed AskRigor owner reviewer.",
      options.resourceMetadataUrl,
      "insufficient_scope",
    );
  }
  return undefined;
}

function successfulResult(
  text: string,
  content: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: researchContributionReviewOutputSchema.parse({
      ok: true,
      ...content,
      canonicalEvidenceChangedByThisCall: false,
    }),
  };
}

function oauthError(
  code: "authorization_required" | "insufficient_scope",
  message: string,
  resourceMetadataUrl: URL | undefined,
  oauthCode: "invalid_token" | "insufficient_scope",
): CallToolResult {
  const result = reviewError(code, message);
  if (resourceMetadataUrl !== undefined) {
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${resourceMetadataUrl.href}", scope="${CASE_REVIEW_SCOPE}", error="${oauthCode}", error_description="${message}"`,
      ],
    };
  }
  return result;
}

function reviewError(
  code: ReviewErrorCode,
  message: string,
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: researchContributionReviewOutputSchema.parse({
      ok: false,
      error: { code, message },
      canonicalEvidenceChangedByThisCall: false,
    }),
    isError: true,
  };
}

/**
 * A findings action's result. An error is a tool error; an outcome that recorded nothing (needs_confirmation,
 * checks_not_passed, try_again_later) has ok false and is an answer the AI acts on, not an error.
 */
function atlasToolResult(result: AtlasReviewResult): CallToolResult {
  const structuredContent = researchContributionReviewOutputSchema.parse({
    ok: result.ok,
    ...(result.outcome === undefined ? {} : { outcome: result.outcome }),
    ...(result.findings === undefined ? {} : { findings: result.findings }),
    ...(result.card === undefined ? {} : { card: result.card }),
    ...(result.atlas === undefined ? {} : { atlas: result.atlas }),
    ...(result.checks === undefined ? {} : { checks: result.checks }),
    ...(result.retry === undefined ? {} : { retry: result.retry }),
    ...(result.forget === undefined ? {} : { forget: result.forget }),
    ...(result.youtubeFindings === undefined ? {} : { youtubeFindings: result.youtubeFindings }),
    ...(result.heldWithoutCard === undefined ? {} : { heldWithoutCard: result.heldWithoutCard }),
    ...(result.publications === undefined ? {} : { publications: result.publications }),
    ...(result.participation === undefined ? {} : { participation: result.participation }),
    canonicalEvidenceChangedByThisCall: false,
    ...(result.error === undefined ? {} : { error: result.error }),
  });
  return {
    content: [{ type: "text", text: result.text }],
    structuredContent,
    ...(result.error === undefined ? {} : { isError: true }),
  };
}

/** A request's problems by field, for the AI to correct: the schema's messages, which name the field and the rule. */
function issuesText(error: z.ZodError): string {
  const issues = error.issues.slice(0, 8).map((issue) =>
    `${issue.path.length === 0 ? "request" : issue.path.join(".")}: ${issue.message}`);
  return `${issues.join("; ")}${error.issues.length > 8 ? `; and ${error.issues.length - 8} more` : ""}.`;
}
