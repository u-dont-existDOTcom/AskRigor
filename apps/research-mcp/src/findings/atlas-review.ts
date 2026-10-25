import { randomUUID } from "node:crypto";

import {
  ATLAS_CARD_DECISIONS,
  ATLAS_DISAGREEMENTS,
  ATLAS_ERASED_KEY,
  ATLAS_ERASED_TEXT,
  ATLAS_FINDING_DIRECTIONS,
  ATLAS_FINDING_KINDS,
  ATLAS_FINDING_PROMOTION_FAILURE_CODES,
  ATLAS_FINDING_TAGS,
  ATLAS_INTENT_KINDS,
  ATLAS_INTENT_SCHEMA,
  ATLAS_LABELS,
  ATLAS_LINK_RELATIONS,
  ATLAS_PUBLICATION_STATES,
  ATLAS_RETRACTION_STATUSES,
  ATLAS_SEARCH_DATABASES,
  ATLAS_SEARCH_KIND,
  ATLAS_SOURCE_KINDS,
  ATLAS_SOURCE_PROVIDERS,
  ATLAS_SUBJECT_MAX_CHARACTERS,
  ATLAS_SUBJECT_TYPES,
  ATLAS_VERIFIED_BASES,
  AtlasPublicationError,
  AtlasReviewError,
  HELD_YOUTUBE_FINDING_BASES,
  HELD_YOUTUBE_FINDING_TAGS,
  HELD_YOUTUBE_FINDINGS_WITHOUT_CARD_SHOWN,
  atlasLabelOf,
  atlasNumbersSchema,
  atlasQuestionUse,
  atlasSearchWithoutQuery,
  atlasSourceIdentifierSchema,
  prepareAtlasFindingIntent,
  stableJson,
  type AtlasCardDecision,
  type AtlasCardItemKind,
  type AtlasDecisionView,
  type AtlasFindingDirection,
  type AtlasFindingIntent,
  type AtlasFindingKind,
  type AtlasFindingPromotionFailureCode,
  type AtlasIntentKind,
  type AtlasIntentView,
  type AtlasLabel,
  type AtlasLinkRelation,
  type AtlasMadeWith,
  type AtlasNumberEntry,
  type AtlasPublicationState,
  type AtlasPublicationStore,
  type AtlasPublicationView,
  type AtlasQuestionUse,
  type AtlasReviewStore,
  type AtlasSearch,
  type AtlasSource,
  type AtlasSourceIdentifier,
  type AtlasState,
  type AtlasStateFinding,
  type AtlasStateReader,
  type AtlasSubjectType,
  type AtlasVersionContent,
  type HeldYouTubeFinding,
  type HeldYouTubeFindingsStore,
  type PreparedAtlasFindingIntent,
} from "@askrigor/evidence-repository";
import type { CrossrefConfig, PubmedConfig } from "@askrigor/sources";
import { z } from "zod";

import {
  ATLAS_PUBLICATION_ACTIONS,
  ATLAS_PUBLICATION_ERROR_CODES,
  ATLAS_PUBLICATION_OUTCOMES,
  AtlasPublicationReview,
  PUBLISH_CARDS_PER_CALL,
  SET_ASIDE_CARDS_PER_CALL,
  type AtlasPublicationAction,
  type AtlasPublications,
} from "../atlas/publication-review.js";
import { reconcileCardPublications } from "../atlas/publication.js";
import { ATLAS_NUMBERS_PROBLEM_CODES, atlasNumbersProblems, type AtlasNumbersProblem } from "../binary-results.js";
import { GitHubApiError } from "../lessons/github-app.js";
import {
  ATLAS_COMMUNITY_STATES,
  ATLAS_LINK_PROBLEM_CODES,
  atlasBasesOf,
  atlasLinkProblems,
  atlasWordingKey,
  communityState,
  screenAtlasTexts,
  type AtlasBasis,
  type AtlasCommunityCheck,
  type AtlasDisagreement,
  type AtlasLinkProblem,
  type AtlasLinkProblemCode,
  type AtlasLinkState,
} from "./acceptance-checks.js";
import { forgetCard, type CardForgetReport } from "./atlas-forget.js";
import { FINDING_CERTAINTIES, PUBLIC_VALUE_SCOPES, topicKeyText, type StoredFinding } from "./card.js";
import {
  decisionDate,
  findingsCardNumber,
  findingsCardSha256,
  isBeyondQuickAnswer,
  isSetAside,
  reconcileFindingsCard,
  type FindingsCardInbox,
  type FindingsCardRead,
  type FindingsDecisionMarker,
} from "./github-findings-review.js";
import { publicFindingsCardId } from "./github-findings.js";
import { moveYouTubeFindings, type YouTubeFindingsMoveReport } from "./held-youtube-move.js";
import type { FindingsRecord, FindingsStamp, ProtocolIdentity } from "./service.js";
import {
  ATLAS_RETRACTION_SEVERITY,
  checkAtlasSources,
  parseAtlasSource,
  type AtlasCheckedSource,
  type AtlasSourceCheck,
  type AtlasSourceCheckCache,
  type AtlasSourceChecks,
} from "./source-checks.js";

/**
 * The owner's findings actions on review_research_contribution (Atlas phase 2 design, sections 1 to 4 and 9C-D; owner
 * answers 159 and 160b): list_findings, inspect_finding, accept_finding, edit_finding, reject_finding,
 * withdraw_finding, link_findings and forget_card. Each decision on a card item is bound to the card record the owner
 * inspected by its SHA-256, runs every exact check again (part B), and records the decision and a hash-bound intent in
 * one transaction through the review role's functions (part A). The call never writes canonical evidence: the one-shot
 * writer applies the intent within about 5 minutes. Code checks only what is exact; the topic, the numbers and the
 * links are the AI's declarations, and the owner accepts or rejects.
 *
 * Owner decision 7 (part D): forget_card removes what ties a card to its contributor (atlas-forget.ts), and
 * eraseWording, on edit_finding or withdraw_finding, queues an erasure behind the new version or the withdrawal, for a
 * finding whose wording the owner judges could identify a person.
 *
 * Owner answer 173 (25 Oct): the findings drawn from YouTube comments that a saved card leaves out are held for 30 days
 * in the database, apart from the card, and so are those of a card whose findings all rest on them, which is not saved
 * as a card. inspect_finding on a card lists its held findings with the day each is deleted; list_youtube_findings lists
 * those with no card, newest first, with each card's question and topic; delete_youtube_findings deletes a card's, or a
 * card-less save's, now; move_youtube_findings moves those of cards stored before into the hold (held-youtube-move.ts);
 * forget_card deletes a card's with it. They are never items of a card, so no decision takes one: nothing publishes
 * them, accepts them into the Atlas or offers them anywhere else.
 */

export const ATLAS_REVIEW_ACTIONS = [
  "list_findings",
  "inspect_finding",
  "accept_finding",
  "edit_finding",
  "reject_finding",
  "withdraw_finding",
  "link_findings",
  "forget_card",
  // Owner answer 173: the held YouTube findings.
  "list_youtube_findings",
  "move_youtube_findings",
  "delete_youtube_findings",
  // Decision 171 (sections 4B and 4F): the publications.
  ...ATLAS_PUBLICATION_ACTIONS,
] as const;
export type AtlasReviewAction = typeof ATLAS_REVIEW_ACTIONS[number];

export function isAtlasReviewAction(action: string): action is AtlasReviewAction {
  return (ATLAS_REVIEW_ACTIONS as readonly string[]).includes(action);
}

export const ATLAS_REVIEW_OUTCOMES = [
  "findings_listed",
  "finding_inspected",
  "finding_queued",
  "finding_written",
  "finding_write_failed",
  "finding_rejected",
  "needs_confirmation",
  "checks_not_passed",
  "try_again_later",
  // forget_card (decision 7): GitHub answers 404 or 410 for every card forgotten, or still holds the stripped issues.
  "card_forgotten",
  "card_forget_waiting_for_owner",
  // Owner answer 173: list_youtube_findings lists those with no card; move_youtube_findings reports each card's outcome;
  // delete_youtube_findings deleted what was held.
  "youtube_findings_listed",
  "youtube_findings_moved",
  "youtube_findings_deleted",
  ...ATLAS_PUBLICATION_OUTCOMES,
] as const;
export type AtlasReviewOutcome = typeof ATLAS_REVIEW_OUTCOMES[number];

export const ATLAS_REVIEW_ERROR_CODES = [
  "card_not_found",
  "card_changed",
  "item_not_found",
  "finding_not_found",
  "decision_conflict",
  "version_stale",
  // forget_card: a later save on the person's cards does not read, so it cannot be re-filed; nothing is changed.
  "card_unreadable",
  "atlas_review_closed",
  ...ATLAS_PUBLICATION_ERROR_CODES,
] as const;
export type AtlasReviewErrorCode = typeof ATLAS_REVIEW_ERROR_CODES[number] | "invalid_request" |
  "review_service_unavailable";

/** Problems the checks name besides those of numbers, privacy and links, each with what to change. */
export const ATLAS_CHECK_PROBLEM_CODES = [
  "community_only",
  "source_refused",
  "source_not_on_finding",
  "source_conflict",
  "topic_label_missing",
  "open_lead_fields",
  "nothing_changed",
  "stamp_without_protocols",
  "intent_invalid",
  // Atlas phase 3 (design section 5): what an older card does not declare and the call did not either, and the one
  // exact contradiction between the declared fields.
  "topic_missing",
  "numbers_missing",
  "card_fields_missing",
  "card_fields_contradict",
] as const;
type CheckProblemCode = typeof ATLAS_CHECK_PROBLEM_CODES[number];

/** The most cards move_youtube_findings takes in one call (owner answer 173), each read and rewritten in GitHub. */
export const MOVE_YOUTUBE_FINDINGS_CARDS_PER_CALL = 20;

// Input fields --------------------------------------------------------------------------------------------------------

const publicNumberInput = z.string().trim().regex(/^[Ff]-[1-9][0-9]{3,}$/u);
const ownerText = (max: number) => z.string().trim().min(1).max(max);

/** The findings actions' fields, all flat so that ChatGPT's app shows them; per-action rules are in the refinement. */
export const atlasReviewInputShape = {
  card: z.string().trim().regex(/^[Aa][Rr][Ff]-[0-9]{1,9}$/u).optional()
    .describe("Findings actions: a findings card's id, such as ARF-0142, in any case. forget_card: the card its " +
      "contributor asked to delete. delete_youtube_findings: the card whose held YouTube findings go now (or " +
      "cardSha256 for a held save with no card)."),
  // One field for the actions that name several cards: move_youtube_findings (owner answer 173) and the publications'
  // publish_cards and set_aside_cards (decision 171); each action's own limit is in the refinement.
  cards: z.array(z.string().trim().regex(/^[Aa][Rr][Ff]-[0-9]{1,9}$/u)).min(1).max(SET_ASIDE_CARDS_PER_CALL).optional()
    .describe("move_youtube_findings: the stored cards whose findings drawn from YouTube comments move out of the " +
      `card into the 30-day hold, such as ["ARF-0007", "ARF-0012"] (at most ${MOVE_YOUTUBE_FINDINGS_CARDS_PER_CALL}). ` +
      `publish_cards (at most ${PUBLISH_CARDS_PER_CALL}), set_aside_cards: findings cards' ids, such as ARF-0142.`),
  finding: z.number().int().min(1).max(5).optional().describe("Findings actions: the card's finding, from 1."),
  lead: z.number().int().min(1).max(6).optional().describe("Findings actions: the card's open lead, from 1."),
  atlasNumber: publicNumberInput.optional().describe("Findings actions: an accepted finding's number, such as F-1007."),
  cardSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional()
    .describe("accept_finding, edit_finding: the cardSha256 inspect_finding returned for the card. " +
      "delete_youtube_findings: a held save with no card, by the cardSha256 list_youtube_findings shows."),
  version: z.number().int().min(1).optional()
    .describe("edit_finding after acceptance, withdraw_finding: the finding's latest version, as inspect_finding last " +
      "showed it."),
  topicKey: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u).optional()
    .describe("accept_finding, edit_finding before acceptance: the topic the finding is filed under, as the topic key " +
      "format has it (lower case, digits, . _ -), such as velmor-syndrome. By default the card's topic; send it to " +
      "change that, or for an older card without one. The reply names it."),
  topicLabel: ownerText(200).optional()
    .describe("With topicKey, when the topic is new: its label, such as Velmor syndrome."),
  kind: z.enum(ATLAS_FINDING_KINDS).optional()
    .describe("accept_finding, edit_finding: the finding's kind: effect, harm, overlooked_option, correction, " +
      "nothing_found (a search that found nothing) or tested_vs_sold. By default the card's; an older card's you " +
      "declare, with subject, subjectType and direction."),
  subject: ownerText(ATLAS_SUBJECT_MAX_CHARACTERS).optional()
    .describe("accept_finding, edit_finding: what the finding is about, as people know it, such as zentarine. By " +
      "default the card's."),
  subjectType: z.enum(ATLAS_SUBJECT_TYPES).optional()
    .describe("accept_finding, edit_finding: the subject's type: condition, symptom, test, treatment, supplement, " +
      "product, food or practice. By default the card's."),
  direction: z.enum(ATLAS_FINDING_DIRECTIONS).optional()
    .describe("accept_finding, edit_finding: benefit, harm, no_effect, mixed or descriptive; a search that found " +
      "nothing is descriptive. By default the card's."),
  wording: ownerText(500).optional().describe("edit_finding: the finding's wording as the owner wants it."),
  appliesTo: ownerText(300).optional().describe("edit_finding: whom or what the finding holds for."),
  whyNotUsual: ownerText(300).optional().describe("edit_finding: why the usual answer misses it."),
  whatWouldChangeIt: ownerText(300).optional().describe("edit_finding: what would change it."),
  question: ownerText(300).optional().describe("edit_finding before acceptance only: the question it answers."),
  sources: z.array(z.string().trim().min(1).max(300)).min(1).max(10).optional()
    .describe("edit_finding: the sources to keep, only some of the finding's own identifiers."),
  numbers: atlasNumbersSchema.optional(),
  note: ownerText(600).optional()
    .describe("edit_finding after acceptance (a correction), withdraw_finding, and an unlink: the public note; the " +
      "server dates it."),
  correction: z.boolean().optional()
    .describe("edit_finding after acceptance: true (the default) for a correction with a dated note, false for a " +
      "wording fix."),
  eraseWording: z.boolean().optional()
    .describe("edit_finding after acceptance, withdraw_finding: true only when the owner judges that the finding's " +
      "wording could identify a person (decision 7). edit_finding with new general wording makes it the new version " +
      "and erases the earlier versions' wording; with no new text it erases the earlier versions' wording and keeps " +
      "the latest. withdraw_finding erases every version's wording, its note included, leaving \"withdrawn, wording " +
      "removed\" with the date; on a finding already withdrawn it needs no note. Either also erases its links' " +
      "rationale, and its question when no other finding uses it."),
  confirm: z.boolean().optional()
    .describe("accept_finding, edit_finding: true only after the owner said to accept anyway what the checks flagged. " +
      "forget_card: true only after the owner read why the call asked for it."),
  relation: z.enum([...ATLAS_LINK_RELATIONS, "unlink"]).optional()
    .describe("link_findings: atlasNumber same_as, narrows, contradicts or replaces the finding named by to; unlink " +
      "withdraws their link."),
  to: publicNumberInput.optional().describe("link_findings: the other finding, such as F-1001."),
  disagreement: z.enum(ATLAS_DISAGREEMENTS).optional()
    .describe("link_findings with contradicts: what the two disagree on."),
  rationale: ownerText(500).optional().describe("link_findings: why the link holds, public."),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,400}$/u).optional()
    .describe("list_findings, list_publications: the nextCursor it returned."),
  // Decision 171 (sections 4B and 4F): the publications.
  includeSetAside: z.boolean().optional()
    .describe("list_findings: true to list the set-aside cards too, which it leaves out by default."),
  publicationState: z.enum(ATLAS_PUBLICATION_STATES).optional()
    .describe("list_publications: only the publications in this state: unreviewed, accepted, edited, rejected, " +
      "withdrawn or held."),
  publication: z.string().trim().regex(/^[Pp]-[1-9][0-9]{3,}$/u).optional()
    .describe("unpublish_finding: the publication's number, such as P-1003."),
  cardsFrom: z.string().trim().regex(/^[Aa][Rr][Ff]-[0-9]{1,9}$/u).optional()
    .describe("set_aside_cards: the first card of a range, such as ARF-0116, with cardsTo."),
  cardsTo: z.string().trim().regex(/^[Aa][Rr][Ff]-[0-9]{1,9}$/u).optional()
    .describe("set_aside_cards: the last card of the range, such as ARF-0239, with cardsFrom."),
};

type AtlasFieldName = keyof typeof atlasReviewInputShape | "reason" | "proposalId" | "expectedPayloadSha256";
const ATLAS_FIELD_NAMES = Object.keys(atlasReviewInputShape) as Array<keyof typeof atlasReviewInputShape>;

export interface AtlasReviewRequest {
  action: AtlasReviewAction;
  card?: string;
  cards?: string[];
  finding?: number;
  lead?: number;
  atlasNumber?: string;
  cardSha256?: string;
  version?: number;
  topicKey?: string;
  topicLabel?: string;
  kind?: AtlasFindingKind;
  subject?: string;
  subjectType?: AtlasSubjectType;
  direction?: AtlasFindingDirection;
  wording?: string;
  appliesTo?: string;
  whyNotUsual?: string;
  whatWouldChangeIt?: string;
  question?: string;
  sources?: string[];
  numbers?: AtlasNumberEntry[];
  note?: string;
  reason?: string;
  correction?: boolean;
  eraseWording?: boolean;
  confirm?: boolean;
  relation?: AtlasLinkRelation | "unlink";
  to?: string;
  disagreement?: AtlasDisagreement;
  rationale?: string;
  cursor?: string;
  includeSetAside?: boolean;
  publicationState?: AtlasPublicationState;
  publication?: string;
  cardsFrom?: string;
  cardsTo?: string;
}

const EDIT_TEXTS = ["wording", "appliesTo", "whyNotUsual", "whatWouldChangeIt"] as const;
/** The fields a card declares for each finding (Atlas phase 3), which the owner may change at any decision. */
const CARD_FIELDS = ["kind", "subject", "subjectType", "direction"] as const;
/**
 * What makes an edit after acceptance a new version: a text, the sources, the numbers or a declared field. The input
 * rules and the service read this one list, so an edit the input takes as a new version is never applied as an
 * erasure alone (review finding 1).
 */
const CHANGE_FIELDS = [...EDIT_TEXTS, "sources", "numbers", ...CARD_FIELDS] as const;
const CARD_ITEM_DECISION_FIELDS: AtlasFieldName[] = [
  "card", "finding", "lead", "cardSha256", "topicKey", "topicLabel", "numbers", ...CARD_FIELDS, "confirm", "reason",
];
const FIELDS_BY_ACTION: Record<AtlasReviewAction | "edit_after", readonly AtlasFieldName[]> = {
  list_findings: ["cursor", "includeSetAside"],
  inspect_finding: ["card", "finding", "lead", "atlasNumber"],
  accept_finding: CARD_ITEM_DECISION_FIELDS,
  edit_finding: [...CARD_ITEM_DECISION_FIELDS, ...EDIT_TEXTS, "question", "sources"],
  edit_after: ["atlasNumber", "card", "finding", "lead", "version", ...EDIT_TEXTS, "sources", "numbers", ...CARD_FIELDS,
    "note", "correction", "eraseWording", "confirm", "reason"],
  reject_finding: ["card", "finding", "lead", "cardSha256", "reason"],
  withdraw_finding: ["atlasNumber", "card", "finding", "lead", "version", "note", "eraseWording", "reason"],
  link_findings: ["atlasNumber", "relation", "to", "disagreement", "rationale", "note", "reason"],
  // Decision 7: no reason is asked for or kept; the card's decision rows go, the owner's private reasons with them.
  forget_card: ["card", "confirm"],
  // Owner answer 173.
  list_youtube_findings: [],
  move_youtube_findings: ["cards"],
  delete_youtube_findings: ["card", "cardSha256"],
  // Decision 171: the publications.
  list_publications: ["publicationState", "cursor"],
  unpublish_finding: ["publication", "reason"],
  publish_cards: ["cards"],
  set_aside_cards: ["cards", "cardsFrom", "cardsTo"],
};

/**
 * The per-action rules of the findings actions' flat input. An edit_finding call with version is an edit after
 * acceptance; without it, an acceptance with the owner's wording.
 */
export function refineAtlasReviewInput(
  value: Partial<Record<AtlasFieldName, unknown>> & { action: AtlasReviewAction },
  context: z.RefinementCtx,
): void {
  const issue = (message: string, field?: string) =>
    context.addIssue({ code: "custom", message, ...(field === undefined ? {} : { path: [field] }) });
  const has = (field: AtlasFieldName) => value[field] !== undefined;
  const action = value.action;
  const after = action === "edit_finding" && has("version");
  const allowed = new Set<AtlasFieldName>(FIELDS_BY_ACTION[after ? "edit_after" : action]);
  for (const field of [...ATLAS_FIELD_NAMES, "reason", "proposalId", "expectedPayloadSha256"] as AtlasFieldName[]) {
    if (has(field) && !allowed.has(field)) {
      issue(`${action}${after ? " after acceptance" : ""} does not take ${field}`, field);
    }
  }
  const oneItem = () => {
    if (!has("card")) issue(`${action} needs card, such as ARF-0142`, "card");
    if (has("finding") === has("lead")) issue(`${action} names either finding or lead`, "finding");
  };
  const findingOrCard = () => {
    if (has("atlasNumber") === has("card")) {
      issue(`${action} names the finding by atlasNumber, or by card with finding or lead`, "atlasNumber");
    } else if (has("card") && has("finding") === has("lead")) {
      issue(`${action} names either finding or lead with card`, "finding");
    }
  };
  switch (action) {
    case "list_findings":
      return;
    case "inspect_finding":
      if (has("atlasNumber") === has("card")) issue("inspect_finding names a card or an atlasNumber", "card");
      if (has("finding") && has("lead")) issue("inspect_finding names finding or lead, not both", "finding");
      if (has("atlasNumber") && (has("finding") || has("lead"))) {
        issue("inspect_finding takes finding or lead only with card", "finding");
      }
      return;
    case "accept_finding":
    case "edit_finding":
      if (after) {
        findingOrCard();
        const newText = CHANGE_FIELDS.some((field) => has(field));
        if (!newText && value.eraseWording === true) {
          // Decision 7 alone: the earlier versions' wording is erased and the latest stays as it is.
          for (const field of ["note", "correction", "confirm"] as const) {
            if (has(field)) {
              issue(`edit_finding with eraseWording and no new text erases the earlier versions' wording only; it ` +
                `does not take ${field}`, field);
            }
          }
          return;
        }
        if (!newText) {
          issue("edit_finding after acceptance needs a new wording, appliesTo, whyNotUsual, whatWouldChangeIt, " +
            "sources, numbers, kind, subject, subjectType or direction, or eraseWording", "wording");
        }
        if (value.correction !== false && !has("note")) {
          issue("a correction needs its public note; set correction to false for a wording fix", "note");
        }
        return;
      }
      oneItem();
      if (!has("cardSha256")) issue(`${action} needs cardSha256, from inspect_finding`, "cardSha256");
      // Atlas phase 3: the topic and the numbers come from the card by default, so the call names them only to change
      // them or for an older card; the checks say when one is missing (topic_missing, numbers_missing).
      if (has("topicLabel") && !has("topicKey")) {
        issue("topicLabel goes with topicKey: send the topic's key with its label", "topicLabel");
      }
      if (action === "edit_finding" && ![...EDIT_TEXTS, "question", "sources"].some((field) =>
        has(field as AtlasFieldName))) {
        issue("edit_finding needs a new wording, appliesTo, whyNotUsual, whatWouldChangeIt, question or sources; " +
          "to accept the item as it stands, use accept_finding", "wording");
      }
      return;
    case "reject_finding":
      oneItem();
      if (!has("reason")) issue("reject_finding needs the owner's reason, which stays private", "reason");
      return;
    case "withdraw_finding":
      findingOrCard();
      if (!has("version")) issue("withdraw_finding needs version, the finding's latest", "version");
      // With eraseWording, a finding already withdrawn needs no note; the call says so for one that is not.
      if (!has("note") && value.eraseWording !== true) issue("withdraw_finding needs its public note", "note");
      return;
    case "forget_card":
      if (!has("card")) issue("forget_card needs card, such as ARF-0142", "card");
      return;
    case "list_youtube_findings":
      return;
    case "move_youtube_findings":
      if (!has("cards")) issue("move_youtube_findings needs cards, such as [\"ARF-0007\"]", "cards");
      else if ((value.cards as unknown[]).length > MOVE_YOUTUBE_FINDINGS_CARDS_PER_CALL) {
        issue(`move_youtube_findings takes at most ${MOVE_YOUTUBE_FINDINGS_CARDS_PER_CALL} cards in one call`, "cards");
      }
      return;
    case "delete_youtube_findings":
      if (has("card") === has("cardSha256")) {
        issue("delete_youtube_findings names a card, such as ARF-0007, or a held save with no card by the cardSha256 " +
          "list_youtube_findings shows", "card");
      }
      return;
    case "list_publications":
      return;
    case "unpublish_finding":
      if (!has("publication")) issue("unpublish_finding needs publication, such as P-1003", "publication");
      if (!has("reason")) issue("unpublish_finding needs the owner's reason, which stays private", "reason");
      return;
    case "publish_cards":
      if (!has("cards")) issue("publish_cards needs cards, such as [\"ARF-0142\"]", "cards");
      else if ((value.cards as unknown[]).length > PUBLISH_CARDS_PER_CALL) {
        issue(`publish_cards takes at most ${PUBLISH_CARDS_PER_CALL} cards in one call`, "cards");
      }
      return;
    case "set_aside_cards": {
      const range = has("cardsFrom") || has("cardsTo");
      if (has("cards") === range) {
        issue("set_aside_cards names the cards, or a range with cardsFrom and cardsTo", "cards");
      } else if (range) {
        const from = typeof value.cardsFrom === "string" ? findingsCardNumber(value.cardsFrom) : undefined;
        const to = typeof value.cardsTo === "string" ? findingsCardNumber(value.cardsTo) : undefined;
        if (from === undefined || to === undefined) {
          issue("a range names both cardsFrom and cardsTo, such as ARF-0116 and ARF-0239", "cardsFrom");
        } else if (from > to) {
          issue("cardsFrom comes before cardsTo", "cardsFrom");
        } else if (to - from + 1 > SET_ASIDE_CARDS_PER_CALL) {
          issue(`a range holds at most ${SET_ASIDE_CARDS_PER_CALL} cards`, "cardsTo");
        }
      }
      return;
    }
    case "link_findings":
      if (!has("atlasNumber")) issue("link_findings needs atlasNumber", "atlasNumber");
      if (!has("relation")) issue("link_findings needs relation", "relation");
      if (!has("to")) issue("link_findings needs to, the other finding", "to");
      if (value.relation === "unlink") {
        if (!has("note") && !has("rationale")) issue("an unlink needs its public note", "note");
      } else {
        if (!has("rationale")) issue("link_findings needs rationale", "rationale");
        if (has("note")) issue("note goes only with relation unlink", "note");
      }
      return;
  }
}

// Output objects --------------------------------------------------------------------------------------------------------

const publicNumberSchema = z.string().regex(/^F-[1-9][0-9]{3,}$/u);
const cardIdSchema = z.string().regex(/^ARF-[0-9]{4,}$/u);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const wouldBecomeSchema = z.enum(["checked", "lead", "recheck", "community_only"]);
const failureCodeSchema = z.enum(ATLAS_FINDING_PROMOTION_FAILURE_CODES);
const intentStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);
const topicViewSchema = z.object({ key: z.string(), label: z.string(), isNew: z.boolean() }).strict();
const kindViewSchema = z.enum(ATLAS_FINDING_KINDS).nullable();
/** A finding's declared fields (Atlas phase 3), each null where the card or the version has none. */
const cardFieldsView = {
  kind: kindViewSchema,
  subject: z.string().nullable(),
  subjectType: z.enum(ATLAS_SUBJECT_TYPES).nullable(),
  direction: z.enum(ATLAS_FINDING_DIRECTIONS).nullable(),
};

const intentViewSchema = z.object({
  intentId: z.string().uuid(),
  kind: z.enum(ATLAS_INTENT_KINDS),
  atlasNumber: publicNumberSchema,
  status: intentStatusSchema,
  createdAt: z.string(),
  failureCode: failureCodeSchema.nullable(),
  explanation: z.string().nullable(),
}).strict();

/** list_findings: what waits, compactly enough for a phone. */
export const atlasFindingsListSchema = z.object({
  refused: z.array(intentViewSchema).max(200),
  waitingForWriter: z.number().int().nonnegative(),
  cards: z.array(z.object({
    card: cardIdSchema,
    question: z.string(),
    savedOn: daySchema,
    beyondQuickAnswer: z.boolean(),
    publicValue: z.enum(["public", "personal_only", "missing"]),
    items: z.array(z.object({
      item: z.enum(["finding", "lead"]),
      number: z.number().int().min(1).max(6),
      text: z.string(),
      certainty: z.enum(FINDING_CERTAINTIES).nullable(),
      kind: kindViewSchema,
      wouldBecome: wouldBecomeSchema,
      recheckOf: publicNumberSchema.nullable(),
    }).strict()).max(11),
  }).strict()).max(10),
  nextCursor: z.string().nullable(),
  unreadableCards: z.array(cardIdSchema).max(1_000),
  /** Decision 171: the set-aside cards left out of the list (none when includeSetAside lists them). */
  setAsideLeftOut: z.number().int().nonnegative(),
}).strict();
export type AtlasFindingsList = z.infer<typeof atlasFindingsListSchema>;

/**
 * One held YouTube finding as the card view lists it (owner answer 173): AskRigor's texts and fixed values, its place
 * on the card as checked, the day its save was made and the day it is deleted, 30 days later.
 */
const heldYoutubeFindingViewSchema = z.object({
  finding: z.number().int().min(1).max(5),
  claim: z.string(),
  certainty: z.enum(FINDING_CERTAINTIES),
  appliesTo: z.string(),
  whyNotUsual: z.string(),
  whatWouldChangeIt: z.string(),
  kind: kindViewSchema,
  subject: z.string().nullable(),
  direction: z.enum(ATLAS_FINDING_DIRECTIONS).nullable(),
  tags: z.array(z.enum(HELD_YOUTUBE_FINDING_TAGS)),
  bases: z.array(z.enum(HELD_YOUTUBE_FINDING_BASES)),
  savedOn: daySchema,
  deletedOn: daySchema,
}).strict();

/** inspect_finding on a card: its texts, and each item with what it would become and its decision. */
export const atlasCardViewSchema = z.object({
  card: cardIdSchema,
  state: z.enum(["open", "closed"]),
  cardSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  question: z.string(),
  usualAnswer: z.string(),
  publicValue: z.object({
    scope: z.enum(PUBLIC_VALUE_SCOPES),
    whoElse: z.string().nullable(),
    whatItChanges: z.string().nullable(),
  }).strict().nullable(),
  savedOn: daySchema,
  saves: z.number().int().min(1),
  beyondQuickAnswer: z.boolean(),
  /** The topic the card declares (Atlas phase 3); null on an older card. */
  topic: z.object({ key: z.string(), label: z.string() }).strict().nullable(),
  items: z.array(z.object({
    item: z.enum(["finding", "lead"]),
    number: z.number().int().min(1).max(6),
    text: z.string(),
    certainty: z.enum(FINDING_CERTAINTIES).nullable(),
    appliesTo: z.string().nullable(),
    ...cardFieldsView,
    /** How many two-group figures its numbers block holds; null when the card declares none. */
    numbers: z.number().int().nonnegative().nullable(),
    /** A search that found nothing: the searches it made, as the final check bound them. */
    searches: z.array(z.object({
      database: z.enum(ATLAS_SEARCH_DATABASES),
      query: z.string(),
      /** The publication dates the search was restricted to, when it was (review finding 8). */
      dateRange: z.object({ start: z.string(), end: z.string() }).strict().optional(),
    }).strict()).max(10),
    sources: z.array(z.string()).max(10),
    youtubeVideos: z.number().int().nonnegative(),
    save: z.enum(["card", "occurrence"]),
    bases: z.array(z.enum(ATLAS_VERIFIED_BASES)),
    wouldBecome: wouldBecomeSchema,
    recheckOf: publicNumberSchema.nullable(),
    decision: z.object({
      decision: z.enum(ATLAS_CARD_DECISIONS),
      atlasNumber: publicNumberSchema.nullable(),
      decidedAt: z.string(),
      intentStatus: intentStatusSchema.nullable(),
      failureCode: failureCodeSchema.nullable(),
    }).strict().nullable(),
  }).strict()).max(11),
  githubSynced: z.boolean(),
  /**
   * The card's held YouTube findings (owner answer 173), apart from its items: never decided, accepted or published,
   * and deleted 30 days after their save. Null when they cannot be read here.
   */
  heldYoutubeFindings: z.array(heldYoutubeFindingViewSchema).max(1_000).nullable(),
}).strict();
export type AtlasCardView = z.infer<typeof atlasCardViewSchema>;

/** An accepted finding: its number, kind, label and version, and the intents that write it. */
export const atlasStatusSchema = z.object({
  atlasNumber: publicNumberSchema,
  entryKind: z.enum(["finding", "lead"]).nullable(),
  label: z.enum(ATLAS_LABELS).nullable(),
  labelAfter: z.enum(ATLAS_LABELS).nullable(),
  version: z.number().int().min(1).nullable(),
  topic: topicViewSchema.nullable(),
  wording: z.string().nullable(),
  ...cardFieldsView,
  /** The versions whose wording is erased (decision 7): it reads as the fixed marker. */
  wordingRemoved: z.array(z.number().int().min(1)).max(1_000),
  researchCheckedOn: daySchema.nullable(),
  links: z.array(z.object({
    relation: z.enum(ATLAS_LINK_RELATIONS),
    direction: z.enum(["from", "to"]),
    other: publicNumberSchema.nullable(),
    disagreement: z.enum(ATLAS_DISAGREEMENTS).nullable(),
    withdrawn: z.boolean(),
  }).strict()).max(200),
  intent: intentViewSchema.nullable(),
  intents: z.array(intentViewSchema).max(200),
}).strict();
export type AtlasStatus = z.infer<typeof atlasStatusSchema>;

const sourceCheckViewSchema = z.object({
  source: z.string(),
  outcome: z.enum(["checked", "not_found", "unavailable", "invalid_identifier"]),
  identifier: z.string().nullable(),
  provider: z.enum(ATLAS_SOURCE_PROVIDERS).nullable(),
  title: z.string().nullable(),
  year: z.string().nullable(),
  retraction: z.enum(ATLAS_RETRACTION_STATUSES).nullable(),
  notices: z.number().int().nonnegative(),
  needsConfirmation: z.boolean(),
  binding: z.enum(["supports", "context_only"]).nullable(),
  sameAs: z.string().nullable(),
  errorCode: z.string().nullable(),
}).strict();
type SourceCheckView = z.infer<typeof sourceCheckViewSchema>;

/** Every exact check, as a dry run (inspect) or as what refused or flags a decision. */
export const atlasChecksSchema = z.object({
  item: z.string(),
  wouldBecome: wouldBecomeSchema.nullable(),
  save: z.enum(["card", "occurrence"]).nullable(),
  bases: z.array(z.enum(ATLAS_VERIFIED_BASES)),
  recheckOf: publicNumberSchema.nullable(),
  community: z.enum(ATLAS_COMMUNITY_STATES).nullable(),
  sourceStatus: z.enum(["passed", "needs_confirmation", "refused", "try_again_later"]).nullable(),
  sources: z.array(sourceCheckViewSchema).max(10),
  numbers: z.array(z.object({
    at: z.string(),
    code: z.enum(ATLAS_NUMBERS_PROBLEM_CODES),
    message: z.string(),
  }).strict()).max(200),
  privacy: z.array(z.object({ field: z.string(), reasonCode: z.string() }).strict()).max(200),
  links: z.array(z.object({
    code: z.enum(ATLAS_LINK_PROBLEM_CODES),
    writerCode: failureCodeSchema.nullable(),
    message: z.string(),
  }).strict()).max(20),
  problems: z.array(z.object({ code: z.enum(ATLAS_CHECK_PROBLEM_CODES), message: z.string() }).strict()).max(50),
  needsConfirmation: z.array(z.string()).max(20),
  topic: topicViewSchema.nullable(),
  relatedTopics: z.array(z.object({ key: z.string(), label: z.string() }).strict()).max(50),
}).strict();
export type AtlasChecks = z.infer<typeof atlasChecksSchema>;

export const atlasRetrySchema = z.object({
  reason: z.enum(["provider_unavailable", "github_unavailable", "writer_pending"]),
  message: z.string(),
}).strict();

/** forget_card (decision 7): what was removed, and the steps left for the owner. */
export const atlasForgetSchema = z.object({
  card: cardIdSchema,
  /** forgotten: GitHub answers 404 or 410 for every card; waiting_for_owner: the owner deletes the stripped issues. */
  status: z.enum(["forgotten", "waiting_for_owner", "incomplete"]),
  /** Whether the card's research-thread key was known, so the person's other saves could be looked for. */
  threadKnown: z.boolean(),
  cards: z.array(z.object({
    card: cardIdSchema,
    url: z.string(),
    github: z.enum(["stripped", "deleted", "not_found"]),
  }).strict()).max(1_000),
  decisionsRemoved: z.number().int().nonnegative(),
  /** Accepted findings no other card's decision names: they stay while they are valid. */
  findingsOnlyFromThese: z.array(publicNumberSchema).max(1_000),
  findingsAlsoElsewhere: z.array(publicNumberSchema).max(1_000),
  /** Cards on which the person's later save was deleted. */
  laterSavesDeletedOn: z.array(cardIdSchema).max(1_000),
  /** Other people's later saves on the person's cards, re-filed as cards of their own. */
  refiled: z.array(z.object({ from: cardIdSchema, card: cardIdSchema }).strict()).max(1_000),
  /** Decision 171: the cards' publications this call withdrew, their published fields erased. */
  publicationsWithdrawn: z.array(z.string().regex(/^P-[1-9][0-9]{3,}$/u)).max(5_000),
  /** Decision 171: the cards' accepted publications, which stay (notice version 4). */
  publicationsKept: z.array(z.string().regex(/^P-[1-9][0-9]{3,}$/u)).max(5_000),
  ownerSteps: z.array(z.string()).max(10),
  /** The held YouTube findings of the person's cards, deleted with them (owner answer 173); where they are held. */
  youtubeFindingsDeleted: z.number().int().nonnegative().optional(),
}).strict();
export type AtlasForget = z.infer<typeof atlasForgetSchema>;

/**
 * move_youtube_findings and delete_youtube_findings (owner answer 173): each card's outcome, and what the owner does
 * next.
 */
export const atlasYoutubeFindingsSchema = z.object({
  cards: z.array(z.object({
    card: cardIdSchema,
    status: z.enum(["moved", "nothing_to_move", "not_found", "unreadable", "every_finding_youtube",
      "decisions_in_the_way", "published_in_the_way", "incomplete", "deleted"]),
    /** The findings now held, each with the day it is deleted. */
    held: z.array(z.object({
      finding: z.number().int().min(1).max(5),
      save: z.enum(["card", "later_save"]),
      deletedOn: daySchema,
    }).strict()).max(500),
    /** Findings deleted: past their 30 days when moved, or held ones deleted now. */
    deleted: z.number().int().nonnegative(),
    cardRewritten: z.boolean(),
    laterSavesRewritten: z.number().int().nonnegative(),
    laterSavesDeleted: z.number().int().nonnegative(),
    /** decisions_in_the_way: the decided findings the move would remove or renumber. */
    decidedFindings: z.array(z.number().int().min(1).max(5)).max(5),
    /** published_in_the_way: the published findings, unless their card was forgotten. */
    publishedFindings: z.array(z.number().int().min(1).max(5)).max(5),
  }).strict()).max(MOVE_YOUTUBE_FINDINGS_CARDS_PER_CALL),
  ownerSteps: z.array(z.string()).max(10),
}).strict();
export type AtlasYoutubeFindings = z.infer<typeof atlasYoutubeFindingsSchema>;

/**
 * list_youtube_findings, and delete_youtube_findings with cardSha256 (owner answer 173): the held findings of cards
 * whose findings all rest on YouTube comments, which are not saved as cards, by save, newest first, each with the
 * card's own question and topic and the day it is deleted.
 */
export const atlasHeldWithoutCardSchema = z.object({
  saves: z.array(z.object({
    /** The checked card's SHA-256, which names the save for delete_youtube_findings. */
    cardSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    question: z.string(),
    topic: z.object({ key: z.string(), label: z.string() }).strict().nullable(),
    savedOn: daySchema,
    deletedOn: daySchema,
    findings: z.array(heldYoutubeFindingViewSchema).max(5),
  }).strict()).max(500),
  /** Whether more are held than the newest shown. */
  moreNotShown: z.boolean(),
  /** delete_youtube_findings with cardSha256: how many held findings it deleted; null when listing. */
  deleted: z.number().int().nonnegative().nullable(),
}).strict();
export type AtlasHeldWithoutCard = z.infer<typeof atlasHeldWithoutCardSchema>;

export interface AtlasReviewResult {
  ok: boolean;
  text: string;
  outcome?: AtlasReviewOutcome;
  error?: { code: AtlasReviewErrorCode; message: string };
  findings?: AtlasFindingsList;
  card?: AtlasCardView;
  atlas?: AtlasStatus;
  checks?: AtlasChecks;
  retry?: z.infer<typeof atlasRetrySchema>;
  forget?: AtlasForget;
  youtubeFindings?: AtlasYoutubeFindings;
  heldWithoutCard?: AtlasHeldWithoutCard;
  /** Decision 171: the publications listed or changed. */
  publications?: AtlasPublications;
}

// Dependencies ----------------------------------------------------------------------------------------------------------

export interface AtlasProviderConfig {
  crossref: CrossrefConfig;
  pubmed: PubmedConfig;
}

export interface AtlasReviewDependencies {
  /** The review role's five functions (decisions and intents); it never writes canonical evidence. */
  store: AtlasReviewStore;
  /** The canonical Atlas, read-only. */
  reader: AtlasStateReader;
  /** The private GitHub inbox of findings cards. */
  inbox: FindingsCardInbox;
  /** Which AskRigor records a decision that makes no research: a withdrawal or a link. */
  version: string;
  build: string;
  protocols: () => Promise<readonly ProtocolIdentity[]>;
  now?: () => Date;
  newIntentId?: () => string;
  /** The source checks' reuse between inspect and accept; the process's own by default. */
  sourceCheckCache?: AtlasSourceCheckCache;
  /** The held YouTube findings, through the review role (owner answer 173); without it they are not shown or changed. */
  held?: HeldYouTubeFindingsStore;
  /**
   * The Atlas publications (decision 171, section 4B), through the review role's functions: the owner's publication
   * actions need them, and accepting, editing, rejecting, erasing and forgetting move them. Without them those actions
   * answer that the publications are not configured, and the others work as before.
   */
  publications?: AtlasPublicationStore;
}

// Plain words for the writer's failure codes --------------------------------------------------------------------------

/** What each failure code the Atlas writer may record means, for the owner. */
export const ATLAS_FAILURE_EXPLANATIONS: Record<AtlasFindingPromotionFailureCode, string> = {
  ATLAS_INTENT_APPLICATION_MISMATCH: "the writer already applied a different intent under this intent's ID",
  ATLAS_FINDING_ALREADY_WRITTEN: "a finding with this number is already stored",
  ATLAS_FINDING_MISSING: "the finding is not in the Atlas",
  ATLAS_FINDING_WITHDRAWN: "the finding is withdrawn, so it takes no further change",
  ATLAS_VERSION_STALE: "the version sent was not the finding's latest; inspect it again and send its latest version",
  ATLAS_TOPIC_MISSING: "the topic key is not in the Atlas and no topic label came with it",
  ATLAS_RECHECK_KEY_MISMATCH: "the re-check's question and claim match no version of the finding",
  ATLAS_LINK_TARGET_MISSING: "the other finding is not in the Atlas",
  ATLAS_LINK_TARGET_WITHDRAWN: "the other finding is withdrawn",
  ATLAS_LINK_LEAD: "a lead takes no part in same_as, narrows or contradicts, and may only be the older side of replaces",
  ATLAS_LINK_PAIR_TAKEN: "the two findings already carry a relation; unlink it first to record another",
  ATLAS_LINK_ALREADY_RECORDED: "this link was recorded before and withdrawn, and the same link is not recorded again",
  ATLAS_LINK_CYCLE: "the replaces link would make a cycle of findings replacing each other",
  ATLAS_LINK_MISSING: "the two findings have no standing link of that relation to withdraw",
  ATLAS_ERASE_NOT_WITHDRAWN: "erasing every version's wording needs the finding withdrawn first",
  SOURCE_IDENTIFIER_CONFLICT: "a source's identifiers name another study record in the Atlas, or one of another kind",
  ATLAS_VERSION_LINEAGE_MISMATCH: "the finding's version chain did not line up",
  CLAIM_DEPENDENCY_CYCLE: "the link would make the findings' claims depend on each other in a cycle",
  CANONICAL_UNIQUE_CONFLICT: "a stored record already holds one of its unique values",
  CANONICAL_REFERENCE_MISSING: "a record it refers to is missing",
  CANONICAL_CHECK_VIOLATION: "a rule of the canonical store refused one of its values",
  CANONICAL_VALUE_INVALID: "one of its values was not valid for the canonical store",
};

/** The writer's failure code a link problem foretells, so a refused link names the code the writer would record. */
const LINK_PROBLEM_WRITER_CODES: Partial<Record<AtlasLinkProblemCode, AtlasFindingPromotionFailureCode>> = {
  finding_missing: "ATLAS_FINDING_MISSING",
  finding_withdrawn: "ATLAS_FINDING_WITHDRAWN",
  lead_in_link: "ATLAS_LINK_LEAD",
  pair_already_linked: "ATLAS_LINK_PAIR_TAKEN",
  link_stored_before: "ATLAS_LINK_ALREADY_RECORDED",
  replaces_cycle: "ATLAS_LINK_CYCLE",
  link_missing: "ATLAS_LINK_MISSING",
};

const WRITER_SENTENCE = "The Atlas writer stores it within about 5 minutes; nothing is public until the Atlas pages exist.";

// The service ---------------------------------------------------------------------------------------------------------

interface ItemRef {
  itemKind: AtlasCardItemKind;
  itemNumber: number;
}

/** A card item, as the save that counts holds it (design section 2). */
interface CardItem {
  ref: ItemRef;
  name: string;
  text: string;
  question: string;
  certainty: StoredFinding["certainty"] | null;
  appliesTo: string | null;
  sources: string[];
  youtubeVideos: number;
  save: "card" | "occurrence";
  /** The save that counts: its stamp dates the research and names the AskRigor that made it. */
  record: FindingsRecord;
  finding: StoredFinding | null;
  bases: AtlasBasis[];
  entryKind: "finding" | "lead";
  leadOrigin: "unverified_finding" | "open_lead" | null;
  cardWordingKey: string;
}

interface LoadedCard {
  card: FindingsCardRead;
  decisions: AtlasDecisionView[];
  cardSha256: string;
  synced: boolean;
}

interface SourcePlan {
  status: AtlasSourceChecks["status"];
  views: SourceCheckView[];
  sources: AtlasSource[];
  confirmations: string[];
  problems: Array<{ code: CheckProblemCode; message: string }>;
}

type Failure = { failed: AtlasReviewResult };
const failed = (result: AtlasReviewResult): Failure => ({ failed: result });
const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && "failed" in value;

export class AtlasReview {
  private readonly now: () => Date;
  private readonly newIntentId: () => string;

  constructor(private readonly deps: AtlasReviewDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.newIntentId = deps.newIntentId ?? (() => randomUUID());
  }

  /** Runs one findings action; it never throws, and never writes canonical evidence. */
  async run(request: AtlasReviewRequest, providers: AtlasProviderConfig): Promise<AtlasReviewResult> {
    try {
      switch (request.action) {
        case "list_findings": return await this.list(request);
        case "inspect_finding":
          return request.atlasNumber !== undefined
            ? await this.inspectFinding(normalizedNumber(request.atlasNumber))
            : await this.inspectCard(request, providers);
        case "accept_finding": return await this.decideItem(request, providers, "accept");
        case "edit_finding":
          return request.version === undefined
            ? await this.decideItem(request, providers, "edit")
            : await this.editAccepted(request, providers);
        case "reject_finding": return await this.reject(request);
        case "withdraw_finding": return await this.withdraw(request);
        case "link_findings": return await this.link(request);
        case "forget_card": return await this.forget(request);
        case "list_youtube_findings": return await this.listYouTube();
        case "move_youtube_findings": return await this.moveYouTube(request);
        case "delete_youtube_findings": return await this.deleteYouTube(request);
        case "list_publications":
        case "unpublish_finding":
        case "publish_cards":
        case "set_aside_cards":
          return await this.publicationAction(request.action, request);
      }
    } catch (error) {
      return errorResult(error);
    }
  }

  // The publications (decision 171) -------------------------------------------------------------------------------------

  private async publicationAction(action: AtlasPublicationAction, request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const publications = this.deps.publications;
    if (publications === undefined) {
      return errorOf("review_service_unavailable", "The Atlas publications are not configured: they need the review " +
        "database. Nothing was changed.");
    }
    const result = await new AtlasPublicationReview({
      publications,
      store: this.deps.store,
      inbox: this.deps.inbox,
      now: this.now,
    }).run({
      action,
      ...(request.publicationState === undefined ? {} : { publicationState: request.publicationState }),
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      ...(request.publication === undefined ? {} : { publication: request.publication }),
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      ...(request.cards === undefined ? {} : { cards: request.cards }),
      ...(request.cardsFrom === undefined ? {} : { cardsFrom: request.cardsFrom }),
      ...(request.cardsTo === undefined ? {} : { cardsTo: request.cardsTo }),
    });
    return {
      ok: result.ok,
      text: result.text,
      ...(result.outcome === undefined ? {} : { outcome: result.outcome }),
      ...(result.error === undefined ? {} : { error: result.error }),
      ...(result.publications === undefined ? {} : { publications: result.publications }),
    };
  }

  /**
   * Brings a card's publications in line with the decisions on it (accept, edit, reject) and the erasures of its F
   * numbers. It never holds back the review: a store error leaves them for the next call, and the card's decisions
   * stand either way.
   */
  private async syncPublications(cardNumber: number, decisions: readonly AtlasDecisionView[]): Promise<AtlasPublicationView[]> {
    const publications = this.deps.publications;
    if (publications === undefined) return [];
    try {
      return await reconcileCardPublications({
        store: publications,
        cardNumber,
        decisions,
        intentsOf: (numbers) => this.deps.store.inspectIntents(numbers),
        at: this.now().toISOString(),
      });
    } catch {
      return [];
    }
  }

  /**
   * An edit of an accepted finding moves its accepted publications to edited, as a sentence for the reply; with an
   * erasure, their published fields are erased too.
   */
  private async publicationsAfterEdit(publicNumber: string, erased: boolean): Promise<string> {
    const publications = this.deps.publications;
    if (publications === undefined) return "";
    let moved: AtlasPublicationView[] = [];
    try {
      moved = await publications.markEdited(publicNumber, this.now().toISOString());
    } catch {
      // The next read of the card's decisions moves them.
    }
    return publicationSentence(moved) +
      (erased ? publicationSentence(await this.eraseErasedPublications(publicNumber), "erased") : "");
  }

  /** Decision 7: the published fields of the publications naming an F number whose wording is being erased. */
  private async eraseErasedPublications(publicNumber: string): Promise<AtlasPublicationView[]> {
    const publications = this.deps.publications;
    if (publications === undefined) return [];
    try {
      return await publications.eraseTexts(publicNumber, this.now().toISOString());
    } catch {
      return [];
    }
  }

  // list_findings -----------------------------------------------------------------------------------------------------

  private async list(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const after = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    if (after === null) return errorOf("invalid_request", "The cursor is not one list_findings returned.");
    const [listed, intents] = await Promise.all([this.deps.inbox.openCards(), this.deps.store.inspectIntents(null)]);
    // Decision 171 (section 4F): a set-aside card waits for no decision, so it is left out unless asked for.
    const open = request.includeSetAside === true ? listed : listed.filter((card) => !isSetAside(card.labels));
    const setAsideLeftOut = listed.length - open.length;
    const readable = open.filter((card): card is typeof card & { record: FindingsRecord } => card.record !== undefined);
    const decisions = readable.length === 0 ? [] : await this.deps.store.inspectCards(readable.map(({ number }) => number));
    const decisionsOf = (cardNumber: number) => decisions.filter((decision) => decision.cardNumber === cardNumber);
    const waiting: Array<typeof readable[number] & { key: CursorKey }> = [];
    let unsynced = 0;
    for (const card of readable) {
      const own = decisionsOf(card.number);
      const decided = new Set(own.filter(({ itemKind }) => itemKind === "finding").map(({ itemNumber }) => itemNumber));
      if (card.record.card.findings.every((_, index) => decided.has(index + 1))) {
        // Every finding has a decision: GitHub catches up now, and the card leaves the list.
        const comments = await this.deps.inbox.readComments(card.number);
        if (comments.status === "read") {
          const sync = await reconcileFindingsCard(this.deps.inbox, {
            number: card.number, state: "open", labels: card.labels, decisions: comments.decisions,
            findings: card.record.card.findings.length,
          }, own);
          if (!sync.synced) unsynced += 1;
        }
        continue;
      }
      waiting.push({ ...card, key: cursorKeyOf(card.labels, card.record, card.number) });
    }
    waiting.sort((left, right) => compareCursorKeys(left.key, right.key));
    const remaining = after === undefined ? waiting : waiting.filter(({ key }) => compareCursorKeys(key, after) > 0);
    const shown = remaining.slice(0, LIST_PAGE);
    const nextCursor = remaining.length > LIST_PAGE ? encodeCursor(shown.at(-1)!.key) : null;

    const loaded = await Promise.all(shown.map(async (card) => {
      const comments = card.comments === 0
        ? { status: "read" as const, occurrences: [], decisions: [] }
        : await this.deps.inbox.readComments(card.number);
      return { card, comments };
    }));
    const keys = loaded.flatMap(({ card, comments }) => comments.status === "unreadable" ? [] :
      card.record.card.findings.flatMap((_, index) => {
        const item = cardItem({ record: card.record, occurrences: comments.occurrences }, publicFindingsCardId(card.number),
          { itemKind: "finding", itemNumber: index + 1 });
        return item === undefined ? [] : [item.cardWordingKey];
      }));
    const state = keys.length === 0 ? undefined : await this.deps.reader.readAtlasState({ wordingKeys: [...new Set(keys)] });
    const recheck = (key: string) => state === undefined ? undefined : recheckTarget(state, key);

    const cards: AtlasFindingsList["cards"] = [];
    const unreadable = open.filter(({ record }) => record === undefined).map(({ number }) => publicFindingsCardId(number));
    for (const { card, comments } of loaded) {
      if (comments.status === "unreadable") {
        unreadable.push(publicFindingsCardId(card.number));
        continue;
      }
      const own = decisionsOf(card.number);
      if (own.length > 0) {
        const sync = await reconcileFindingsCard(this.deps.inbox, {
          number: card.number, state: "open", labels: card.labels, decisions: comments.decisions,
          findings: card.record.card.findings.length,
        }, own);
        if (!sync.synced) unsynced += 1;
      }
      const id = publicFindingsCardId(card.number);
      const items: AtlasFindingsList["cards"][number]["items"] = [];
      const refs: ItemRef[] = [
        ...card.record.card.findings.map((_, index) => ({ itemKind: "finding" as const, itemNumber: index + 1 })),
        ...card.record.card.open_leads.map((_, index) => ({ itemKind: "open_lead" as const, itemNumber: index + 1 })),
      ];
      for (const ref of refs) {
        if (decisionFor(own, ref) !== undefined) continue;
        const item = cardItem({ record: card.record, occurrences: comments.occurrences }, id, ref)!;
        const recheckOf = item.ref.itemKind === "finding" ? recheck(item.cardWordingKey) : undefined;
        items.push({
          item: ref.itemKind === "finding" ? "finding" : "lead",
          number: ref.itemNumber,
          text: clip(item.text, 160),
          certainty: item.certainty,
          kind: cardFieldsOf(item).kind ?? null,
          wouldBecome: wouldBecome(item, recheckOf),
          recheckOf: recheckOf ?? null,
        });
      }
      const value = card.record.card.public_value;
      cards.push({
        card: id,
        question: clip(card.record.card.question, 120),
        savedOn: card.record.stamp.saved_at.slice(0, 10),
        beyondQuickAnswer: isBeyondQuickAnswer(card.labels),
        publicValue: value === undefined ? "missing" : value.scope,
        items,
      });
    }
    const refused = intents.filter(({ status }) => status === "FAILED").map(intentView);
    const waitingForWriter = intents.filter(({ status }) => status === "PENDING").length;
    const findings: AtlasFindingsList = {
      refused, waitingForWriter, cards, nextCursor, unreadableCards: unreadable, setAsideLeftOut,
    };
    const lines = [
      ...refused.map((intent) => `The Atlas writer refused ${intent.atlasNumber}'s ${intent.kind} with ` +
        `${intent.failureCode}: ${intent.explanation}.`),
      ...(waitingForWriter === 0 ? [] : [`${waitingForWriter} decision${waitingForWriter === 1 ? " waits" : "s wait"} ` +
        "for the Atlas writer (about 5 minutes)."]),
      ...(cards.length === 0 ? ["No findings card waits for a decision."] : cards.map((card) =>
        `${card.card}${card.beyondQuickAnswer ? " (beyond a quick answer)" : ""}, saved ${card.savedOn}: ` +
        `${card.question}${card.publicValue === "public" ? "" : ` [public value ${card.publicValue}]`}\n` +
        card.items.map((item) => `  ${item.item === "finding" ? "Finding" : "Open lead"} ${item.number}: ${item.text}` +
          `${item.certainty === null ? "" : ` (${item.certainty}${item.kind === null ? "" : `, ${item.kind}`})`} -> ` +
          wouldBecomeWords(item.wouldBecome, item.recheckOf))
          .join("\n"))),
      ...(nextCursor === null ? [] : ["More cards wait: call list_findings with the nextCursor."]),
      ...(unreadable.length === 0 ? [] : [`${unreadable.join(", ")} cannot be read as the library saved ` +
        `${unreadable.length === 1 ? "it" : "them"}, so ${unreadable.length === 1 ? "it is" : "they are"} left out.`]),
      ...(unsynced === 0 ? [] : ["Some decisions are not on GitHub yet; the next list or inspect posts them."]),
      ...(setAsideLeftOut === 0 ? [] : [`${setAsideLeftOut} set-aside card${setAsideLeftOut === 1 ? " is" : "s are"} ` +
        "left out; list_findings with includeSetAside lists them."]),
    ];
    return { ok: true, outcome: "findings_listed", text: lines.join("\n"), findings };
  }

  // inspect_finding ---------------------------------------------------------------------------------------------------

  private async inspectCard(request: AtlasReviewRequest, providers: AtlasProviderConfig): Promise<AtlasReviewResult> {
    const cardNumber = findingsCardNumber(request.card!)!;
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded.failed;
    const id = publicFindingsCardId(cardNumber);
    const findingItems = loaded.card.record.card.findings.map((_, index) =>
      cardItem(loaded.card, id, { itemKind: "finding", itemNumber: index + 1 })!);
    const ref = itemRefOf(request);
    const focus = ref === undefined ? undefined : cardItem(loaded.card, id, ref);
    if (ref !== undefined && focus === undefined) return itemNotFound(id, ref);
    const decision = focus === undefined ? undefined : decisionFor(loaded.decisions, focus.ref);

    // A dry run of every exact check on an undecided item; the card alone needs no provider.
    const kept = focus?.sources ?? [];
    const sourceChecks = focus === undefined || decision !== undefined || kept.length === 0
      ? undefined
      : await this.checkSources(kept, providers);
    const [state, held] = await Promise.all([
      this.deps.reader.readAtlasState({
        wordingKeys: findingItems.map(({ cardWordingKey }) => cardWordingKey),
        identifiers: sourceChecks === undefined ? [] : checkedIdentifiers(sourceChecks),
      }),
      this.heldOf(cardNumber),
    ]);
    const card = cardView(loaded, findingItems, state, held);
    if (focus === undefined) {
      return {
        ok: true,
        outcome: "finding_inspected",
        card,
        text: `${id} (cardSha256 ${loaded.cardSha256}), saved ${card.savedOn}: ${card.question}\n` +
          card.items.map((item) => `${item.item === "finding" ? "Finding" : "Open lead"} ${item.number}: ` +
            `${clip(item.text, 160)} -> ${item.decision === null
              ? wouldBecomeWords(item.wouldBecome, item.recheckOf)
              : `decided: ${decisionWords(item.decision.decision, item.decision.atlasNumber)}`}`).join("\n") +
          heldLines(held) +
          (loaded.synced ? "" : "\nGitHub is not up to date with the decisions yet; the next inspect posts them."),
      };
    }
    if (decision !== undefined) {
      const status = decision.publicNumber === null ? undefined : await this.statusOf(decision.publicNumber, decision);
      return {
        ok: true,
        outcome: "finding_inspected",
        card,
        ...(status === undefined ? {} : { atlas: status }),
        text: `${focus.name} is decided: ${decisionWords(decision.decision, decision.publicNumber)}, ` +
          `${decisionDate(decision.decidedAt)}.${status === undefined ? "" : ` ${statusSentence(status)}`}`,
      };
    }
    const recheckOf = focus.ref.itemKind === "finding" ? recheckTarget(state, focus.cardWordingKey) : undefined;
    const community = focus.finding === null ? undefined : communityState({ ...focus.finding, sources: kept });
    const plan = sourceChecks === undefined ? emptySourcePlan() : planSources(sourceChecks, state, false);
    const accepted = acceptedTexts(focus, {});
    const declared = cardFieldsOf(focus);
    const privacy = screenTexts(itemTexts(focus, accepted, focus.finding?.numbers ?? [], declared));
    const problems = [...plan.problems];
    if (community?.refused === true) problems.push(communityOnlyProblem(focus.name));
    if (madeWithOf(focus.record.stamp).protocols.length === 0) problems.push(stampProblem());
    const checks = checksOf({
      item: focus.name, wouldBecome: wouldBecome(focus, recheckOf, community), focus, recheckOf, community, plan,
      sourceChecks, privacy, problems, relatedTopics: state.topics,
    });
    const flagged = [...(community?.needsConfirmation === true ? [communityConfirmation()] : []), ...plan.confirmations];
    // Atlas phase 3: what accept_finding takes from the card, and what an older card leaves for the call to declare.
    const cardTopic = focus.record.card.topic;
    const asks = [
      ...(cardTopic === undefined ? ["a topicKey (and topicLabel for a new topic)"] : []),
      ...(focus.finding !== null && declared.kind === undefined
        ? ["the numbers the wording gives (an empty list if none)", "the kind, subject, subjectType and direction you " +
          "declare"]
        : []),
    ];
    const takes = [
      ...(cardTopic === undefined ? [] : [`the card's topic (${cardTopic.label})`]),
      ...(focus.finding !== null && declared.kind !== undefined ? ["its numbers block, kind, subject, subject type " +
        "and direction"] : []),
    ];
    const next = recheckOf !== undefined
      ? `accept_finding records it as a re-check of ${recheckOf}`
      : `accept_finding needs this cardSha256${asks.length === 0 ? "" : `, ${listed(asks)}`}` +
        `${takes.length === 0 ? "" : `; it takes ${listed(takes)} unless you send others`}`;
    return {
      ok: true,
      outcome: "finding_inspected",
      card,
      checks,
      text: `${focus.name} (cardSha256 ${loaded.cardSha256}) would be ${wouldBecomeWords(checks.wouldBecome!, recheckOf ?? null)}` +
        ` (${focus.save === "card" ? "the card's own save" : "a later save"}; bases: ` +
        `${focus.bases.length === 0 ? "none" : focus.bases.join(", ")}).` +
        (focus.finding === null ? "" : declared.kind === undefined
          ? "\nDeclared: nothing, as a card saved before the Atlas fields."
          : `\nDeclared: ${fieldsWords(declared)}; numbers: ${focus.finding.numbers?.length ?? 0} two-group ` +
            `${(focus.finding.numbers?.length ?? 0) === 1 ? "figure" : "figures"}` +
            `${declared.searchScope === undefined ? "" : `; searches: ${declared.searchScope.map(({ database, query,
              dateRange }) => `${database} "${query}"${dateRange === undefined ? ""
              : ` (${dateRange.start} to ${dateRange.end})`}`).join(", ")}`}.`) +
        `\n${sourcesSentence(plan)}` +
        (privacy.length === 0 ? "" : `\nPrivacy: ${privacy.map(({ field, reasonCode }) => `${field} (${reasonCode})`).join(", ")}.`) +
        (problems.length === 0 ? "" : `\n${problems.map(({ message }) => message).join("\n")}`) +
        (flagged.length === 0 ? "" : `\nNeeds the owner's confirmation: ${flagged.join("; ")}.`) +
        `\nNext: ${next}.`,
    };
  }

  private async inspectFinding(publicNumber: string): Promise<AtlasReviewResult> {
    const status = await this.statusOf(publicNumber);
    if (status === undefined) {
      return errorOf("finding_not_found", `No finding has the number ${publicNumber}.`);
    }
    // An erased finding's original wording may still be on the cards it was decided from (decision 7).
    const holding = status.wordingRemoved.length === 0 ? [] :
      holdingSentences(await this.cardsHoldingWording(publicNumber, new Set()));
    return { ok: true, outcome: "finding_inspected", atlas: status, text: [statusSentence(status), ...holding].join(" ") };
  }

  /** A finding's stored state, or what its intents say while it is not stored yet; undefined when there is none. */
  private async statusOf(publicNumber: string, decision?: AtlasDecisionView): Promise<AtlasStatus | undefined> {
    const [intents, state] = await Promise.all([
      this.deps.store.inspectIntents([publicNumber]),
      this.deps.reader.readAtlasState({ publicNumbers: [publicNumber] }),
    ]);
    const own = intents.filter((intent) => intent.publicNumber === publicNumber ||
      ("toPublicNumber" in intent.payload && intent.payload.toPublicNumber === publicNumber));
    const views = own.map(intentView);
    const decided = decision?.intentId === null || decision === undefined
      ? undefined
      : views.find(({ intentId }) => intentId === decision.intentId);
    const finding = state.findings.find((candidate) => candidate.publicNumber === publicNumber);
    if (finding === undefined) {
      const accept = [...own].reverse().find((intent) => intent.intentKind === "accept" &&
        intent.publicNumber === publicNumber);
      if (accept === undefined || accept.payload.kind !== "accept") return undefined;
      const payload = accept.payload;
      return {
        atlasNumber: publicNumber,
        entryKind: payload.entryKind,
        label: null,
        labelAfter: accept.status === "FAILED" ? null : payload.entryKind === "finding" ? "checked" : "lead",
        version: null,
        topic: payload.topic.label === null ? null : { key: payload.topic.key, label: payload.topic.label, isNew: true },
        wording: payload.content.wording,
        ...fieldsView(definedFields(payload.content)),
        wordingRemoved: [],
        researchCheckedOn: payload.researchCheckedOn,
        links: [],
        intent: decided ?? intentView(accept),
        intents: views,
      };
    }
    const latest = finding.versions.at(-1)!;
    const topic = state.topics.find(({ topicId }) => topicId === finding.topicId);
    const numberOf = (findingId: string) =>
      state.findings.find((candidate) => candidate.findingId === findingId)?.publicNumber ?? null;
    return {
      atlasNumber: publicNumber,
      entryKind: finding.entryKind,
      label: labelsWith(state, [finding.findingId]).get(finding.findingId) ?? null,
      labelAfter: null,
      version: latest.versionNumber,
      topic: topic === undefined ? null : { key: topic.canonicalKey, label: topic.label, isNew: false },
      wording: latest.content.wording,
      ...fieldsView(definedFields(latest.content)),
      wordingRemoved: finding.versions.filter(({ erased }) => erased).map(({ versionNumber }) => versionNumber),
      researchCheckedOn: latest.researchCheckedOn,
      links: state.links
        .filter((link) => link.fromFindingId === finding.findingId || link.toFindingId === finding.findingId)
        .map((link) => ({
          relation: link.relation,
          direction: link.fromFindingId === finding.findingId ? "from" as const : "to" as const,
          other: numberOf(link.fromFindingId === finding.findingId ? link.toFindingId : link.fromFindingId),
          disagreement: (link.disagreement as AtlasDisagreement | null) ?? null,
          withdrawn: link.withdrawn,
        })),
      intent: decided ?? null,
      intents: views,
    };
  }

  // accept_finding, and edit_finding before acceptance ----------------------------------------------------------------

  private async decideItem(
    request: AtlasReviewRequest,
    providers: AtlasProviderConfig,
    mode: "accept" | "edit",
  ): Promise<AtlasReviewResult> {
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded.failed;
    if (request.cardSha256 !== loaded.cardSha256) return cardChanged(id, loaded.cardSha256);
    const ref = itemRefOf(request)!;
    const item = cardItem(loaded.card, id, ref);
    if (item === undefined) return itemNotFound(id, ref);
    const existing = decisionFor(loaded.decisions, ref);
    if (existing !== undefined && existing.intent?.status !== "FAILED") {
      if (existing.decision === "rejected" || mode === "edit") {
        return errorOf("decision_conflict", `${item.name} is already decided: ` +
          `${decisionWords(existing.decision, existing.publicNumber)}, ${decisionDate(existing.decidedAt)}.` +
          (existing.decision === "rejected" ? " A decision on a card item is final." : ` To change its wording, use ` +
            `edit_finding with atlasNumber ${existing.publicNumber} and its version once it is stored.`));
      }
      return this.decisionReplay(item, existing);
    }

    // The texts, as the card holds them or as the owner edits them before acceptance.
    const edits: Partial<AtlasReviewRequest> = mode === "edit" ? request : {};
    const accepted = acceptedTexts(item, edits);
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    let kept = item.sources;
    if (request.sources !== undefined) {
      const own = new Map(item.sources.map((source) => [sourceKey(source), source]));
      kept = [];
      for (const source of request.sources) {
        const matched = own.get(sourceKey(source));
        if (matched === undefined) {
          problems.push({ code: "source_not_on_finding", message: `${source} is not one of ${item.name}'s own sources: ` +
            "keep only some of its own identifiers." });
        } else if (!kept.includes(matched)) {
          kept.push(matched);
        }
      }
    }
    if (item.leadOrigin === "open_lead") {
      for (const field of ["whyNotUsual", "whatWouldChangeIt", "sources"] as const) {
        if (edits[field] !== undefined) {
          problems.push({ code: "open_lead_fields", message: `An open lead holds only its wording and whom it applies ` +
            `to: leave ${field} out.` });
        }
      }
      for (const field of CARD_FIELDS) {
        if (request[field] !== undefined) {
          problems.push({ code: "open_lead_fields", message: `An open lead holds only its wording and whom it applies ` +
            `to: leave ${field} out.` });
        }
      }
      if ((request.numbers ?? []).length > 0) {
        problems.push({ code: "open_lead_fields", message: "An open lead has no numbers: send numbers as an empty list." });
      }
    }
    // Atlas phase 3: the topic is the card's unless the owner sends another; an older card declares none.
    const cardTopic = item.record.card.topic;
    const topicKey = request.topicKey ?? cardTopic?.key;
    const community = item.finding === null ? undefined : communityState({ ...item.finding, sources: kept });
    if (community?.refused === true) problems.push(communityOnlyProblem(item.name));
    const sourceChecks = item.leadOrigin === "open_lead" || kept.length === 0
      ? undefined
      : await this.checkSources(kept, providers);
    const [state, intents] = await Promise.all([
      this.deps.reader.readAtlasState({
        wordingKeys: [item.cardWordingKey],
        identifiers: sourceChecks === undefined ? [] : checkedIdentifiers(sourceChecks),
        topicKeys: topicKey === undefined ? [] : [topicKey],
      }),
      this.deps.store.inspectIntents(null),
    ]);
    // A finding with the same question and claim that waits for the writer makes this item its re-check.
    const waitingFor = intents.find((intent) => intent.status === "PENDING" && intent.payload.kind === "accept" &&
      (intent.payload.wordingKeys.card === item.cardWordingKey ||
        intent.payload.wordingKeys.accepted === item.cardWordingKey));
    if (item.ref.itemKind === "finding" && waitingFor !== undefined) {
      return tryAgainLater("writer_pending", `${waitingFor.publicNumber}, with the same question and claim, waits for ` +
        `the Atlas writer; once it is stored (about 5 minutes), ${item.name} is its re-check. Nothing was recorded.`);
    }
    const recheckOf = item.ref.itemKind === "finding" ? recheckTarget(state, item.cardWordingKey) : undefined;
    if (recheckOf !== undefined && mode === "edit") {
      return errorOf("decision_conflict", `${item.name} has the question and claim of ${recheckOf}, so it is a ` +
        `re-check of it: accept it with accept_finding, or change ${recheckOf} itself with edit_finding and its ` +
        "atlasNumber.");
    }
    const plan = sourceChecks === undefined ? emptySourcePlan() : planSources(sourceChecks, state, request.confirm === true);
    problems.push(...plan.problems);
    const madeWith = madeWithOf(item.record.stamp);
    if (madeWith.protocols.length === 0) problems.push(stampProblem());

    // What is filed: a re-check of a stored finding, or a new finding or lead under the topic, the card's unless the
    // owner sent another (Atlas phase 3).
    let topic: AtlasChecks["topic"] = null;
    let topicLabel: string | null = null;
    const topicFromCard = request.topicKey === undefined && cardTopic !== undefined;
    if (recheckOf === undefined && topicKey === undefined) {
      problems.push({ code: "topic_missing", message: `${id} declares no topic, as a card saved before the Atlas ` +
        "fields: give topicKey, such as velmor-syndrome, and topicLabel for a new topic." });
    } else if (recheckOf === undefined && topicKey !== undefined) {
      const stored = state.topics.find(({ canonicalKey }) => canonicalKey === topicKey);
      const queued = intents.find((intent) => intent.status === "PENDING" && intent.payload.kind === "accept" &&
        intent.payload.topic.key === topicKey && intent.payload.topic.label !== null);
      const queuedLabel = queued?.payload.kind === "accept" ? queued.payload.topic.label : null;
      // The card's label goes with the card's key only; another key takes the owner's label.
      const label = request.topicLabel ?? (topicKey === cardTopic?.key ? cardTopic.label : undefined);
      if (stored !== undefined) {
        topic = { key: stored.canonicalKey, label: stored.label, isNew: false };
      } else if (queuedLabel !== null && queuedLabel !== undefined) {
        topicLabel = queuedLabel;
        topic = { key: topicKey, label: queuedLabel, isNew: false };
      } else if (label !== undefined) {
        topicLabel = label;
        topic = { key: topicKey, label, isNew: true };
      } else {
        problems.push({ code: "topic_label_missing", message: `${topicKey} is not an Atlas topic yet: give ` +
          "topicLabel to create it, or the key of an existing topic." });
      }
    }
    // The numbers block and the finding's fields: the card's unless the owner sent others (design section 5). A card
    // finding from an older card declares neither, so the call does; an open lead has none; a re-check changes none.
    const declared = cardFieldsOf(item);
    const olderCard = item.finding !== null && declared.kind === undefined;
    let numbers: AtlasNumberEntry[] = [];
    if (recheckOf === undefined) {
      if (request.numbers !== undefined || item.finding === null) {
        numbers = request.numbers ?? [];
      } else if (!olderCard) {
        numbers = item.finding.numbers ?? [];
      } else {
        problems.push({ code: "numbers_missing", message: `${item.name} is from a card saved before the Atlas ` +
          "fields, which declares no numbers: give numbers, each two-group yes-or-no figure the wording gives, or " +
          "an empty list if it gives none." });
      }
    }
    const fields = recheckOf !== undefined || item.finding === null ? {} : decidedFields(request, declared);
    if (recheckOf === undefined && item.finding !== null) {
      problems.push(...cardFieldProblems(item.name, fields, { required: true, olderCard }));
    }
    const numberProblems = recheckOf === undefined ? atlasNumbersProblems(numbers, accepted.wording) : [];
    const keptSet = new Set(kept);
    const editedAtAcceptance = mode === "edit" && (accepted.question !== item.question || accepted.wording !== item.text ||
      accepted.appliesTo !== item.appliesTo || accepted.whyNotUsual !== (item.finding?.why_not_usual ?? null) ||
      accepted.whatWouldChangeIt !== (item.finding?.what_would_change_it ?? null) ||
      item.sources.some((source) => !keptSet.has(source)));
    const payload: unknown = recheckOf !== undefined
      ? {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "recheck",
          publicNumber: recheckOf,
          cardWordingKey: item.cardWordingKey,
          verifiedBases: item.bases,
          sources: plan.sources,
          researchCheckedOn: researchDayOf(item.record.stamp),
          madeWith,
        }
      : {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "accept",
          entryKind: item.entryKind,
          leadOrigin: item.leadOrigin,
          editedAtAcceptance,
          topic: { key: topicKey!, label: topicLabel },
          question: accepted.question,
          content: contentOf(item, accepted, numbers, fields),
          sources: plan.sources,
          wordingKeys: { card: item.cardWordingKey, accepted: atlasWordingKey(accepted.question, accepted.wording) },
          researchCheckedOn: researchDayOf(item.record.stamp),
          madeWith,
        };
    const privacy = screenTexts(intentTexts(payload));
    const decision: AtlasCardDecision = recheckOf !== undefined
      ? "rechecked"
      : item.entryKind === "finding" ? "accepted" : "accepted_as_lead";
    const checksNow = () => checksOf({
      item: item.name,
      wouldBecome: wouldBecome(item, recheckOf, community),
      focus: item,
      recheckOf,
      community,
      plan,
      sourceChecks,
      privacy,
      numberProblems,
      problems,
      topic,
      relatedTopics: state.topics,
    });
    if (problems.length > 0 || numberProblems.length > 0 || privacy.length > 0 || plan.status === "refused") {
      return checksNotPassed(item.name, checksNow());
    }
    if (plan.status === "try_again_later") {
      return {
        ...tryAgainLater("provider_unavailable", `A source of ${item.name} could not be checked just now ` +
          `(${unavailableSources(plan)}). Try again in a few minutes; nothing was recorded.`),
        checks: checksNow(),
      };
    }
    const confirmations = [...(community?.needsConfirmation === true ? [communityConfirmation()] : []),
      ...plan.confirmations];
    if (confirmations.length > 0 && request.confirm !== true) {
      return {
        ok: false,
        outcome: "needs_confirmation",
        checks: checksNow(),
        text: `Not recorded yet: ${item.name} needs the owner's confirmation: ${confirmations.join("; ")}. If the owner ` +
          "says to accept it anyway, send the same call with confirm: true.",
      };
    }
    // Last, the intent as the review store keeps it: it holds only what an intent may.
    const prepared = prepareOrProblems(payload, problems);
    const checks = checksNow();
    if (prepared === undefined) return checksNotPassed(item.name, checks);

    const stored = await this.deps.store.decide({
      cardNumber,
      itemKind: ref.itemKind,
      itemNumber: ref.itemNumber,
      decision,
      cardSha256: loaded.cardSha256,
      ownerReason: request.reason ?? null,
      decidedAt: this.now().toISOString(),
      intent: { intentId: this.newIntentId(), payload: prepared.payload, payloadSha256: prepared.payloadSha256 },
      recheckedPublicNumber: recheckOf ?? null,
    });
    const sync = await this.syncCard(loaded, stored);
    const moved = await this.syncPublications(cardNumber, withDecision(loaded.decisions, stored));
    const publicNumber = stored.publicNumber!;
    const status: AtlasStatus = {
      atlasNumber: publicNumber,
      entryKind: recheckOf === undefined ? item.entryKind : null,
      label: null,
      labelAfter: recheckOf === undefined
        ? item.entryKind === "finding" ? "checked" : "lead"
        : null,
      version: null,
      topic,
      wording: recheckOf === undefined ? accepted.wording : null,
      ...fieldsView(fields),
      wordingRemoved: [],
      researchCheckedOn: researchDayOf(item.record.stamp),
      links: [],
      intent: stored.intentId === null || stored.intent === null ? null : {
        intentId: stored.intentId,
        kind: stored.intent.intentKind,
        atlasNumber: publicNumber,
        status: stored.intent.status,
        createdAt: stored.intent.createdAt,
        failureCode: stored.intent.failureCode,
        explanation: stored.intent.failureCode === null ? null : ATLAS_FAILURE_EXPLANATIONS[stored.intent.failureCode],
      },
      intents: [],
    };
    const confirmed = request.confirm === true && confirmations.length > 0
      ? ` Confirmed by the owner: ${confirmations.join("; ")}.`
      : "";
    const retried = existing !== undefined ? " (a retry under the same number, after the writer refused the first)" : "";
    const filed = `filed under ${topic?.label}${topic?.isNew === true ? " (new topic)" : ""}` +
      `${topicFromCard ? ", the card's topic" : ""}`;
    // A re-check keeps the stored finding's fields (design section 5): any sent are named as not taken.
    const notTaken = recheckOf !== undefined && CARD_FIELDS.some((field) => request[field] !== undefined)
      ? ` ${publicNumber} keeps its own kind, subject, subject type and direction; change them with edit_finding.`
      : "";
    const declaredWords = fieldsWords(fields);
    const withFields = declaredWords === "" ? "" : `, ${declaredWords}`;
    const text = recheckOf !== undefined
      ? `Recorded ${item.name} as a re-check of ${publicNumber}${retried}, with the research of ` +
        `${researchDayOf(item.record.stamp)}${item.bases.length > 0 ? `, which brings a verified basis (${item.bases.join(", ")})` : ""}. ` +
        `The Atlas writer stores it within about 5 minutes.${notTaken}`
      : item.entryKind === "finding"
        ? `Accepted ${item.name} as ${publicNumber}${retried}, a checked finding` +
          `${editedAtAcceptance ? " with your wording" : ""}${withFields}, ${filed}. ${WRITER_SENTENCE}`
        : `Accepted ${item.name} as a lead, ${publicNumber}${retried}${withFields}: ` +
          `${item.leadOrigin === "open_lead" ? "an open lead of the card" : "it has no verified basis"}` +
          `${editedAtAcceptance ? ", with your wording" : ""}. ${filed.charAt(0).toUpperCase()}${filed.slice(1)}. ` +
          WRITER_SENTENCE;
    return {
      ok: true,
      outcome: outcomeOf(stored.intent?.status ?? "PENDING"),
      atlas: status,
      checks,
      text: `${text}${confirmed}${syncSentence(sync)}${publicationSentence(moved)}`,
    };
  }

  /** The same decision again: what the card item already became, with nothing new recorded. */
  private async decisionReplay(item: CardItem, existing: AtlasDecisionView): Promise<AtlasReviewResult> {
    const status = await this.statusOf(existing.publicNumber!, existing);
    return {
      ok: true,
      outcome: outcomeOf(existing.intent?.status ?? "PENDING"),
      ...(status === undefined ? {} : { atlas: status }),
      text: `${item.name} was already ${decisionWords(existing.decision, existing.publicNumber)}, on ` +
        `${decisionDate(existing.decidedAt)}; nothing new was recorded.${status === undefined ? "" : ` ${statusSentence(status)}`}`,
    };
  }

  // edit_finding after acceptance ---------------------------------------------------------------------------------------

  private async editAccepted(request: AtlasReviewRequest, providers: AtlasProviderConfig): Promise<AtlasReviewResult> {
    const erase = request.eraseWording === true;
    const resolved = await this.resolveAccepted(request);
    if (isFailure(resolved)) return resolved.failed;
    const context = await this.findingContext(resolved, [resolved], { questionUses: erase });
    if (isFailure(context)) return context.failed;
    const { finding, state, intents } = context;
    const latest = finding.versions.at(-1)!;
    if (latest.status === "invalidated") {
      return withdrawnConflict(resolved, erase ? " To erase its wording, use withdraw_finding with eraseWording." : "");
    }
    if (request.version !== latest.versionNumber) return versionStale(resolved, latest.versionNumber);
    if (erase && !CHANGE_FIELDS.some((field) => request[field] !== undefined)) {
      return this.eraseOnly(resolved, context, "earlier_versions", request);
    }
    const accept = intents.find((intent) => intent.intentKind === "accept" && intent.publicNumber === resolved &&
      intent.status === "COMPLETED");
    if (accept === undefined || accept.payload.kind !== "accept") {
      return errorOf("review_service_unavailable", `The accepted intent of ${resolved} could not be read; nothing was ` +
        "recorded.");
    }
    const question = accept.payload.question;
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    const openLead = finding.leadOrigin === "open_lead";
    if (openLead) {
      for (const field of ["whyNotUsual", "whatWouldChangeIt", "sources", ...CARD_FIELDS] as const) {
        if (request[field] !== undefined) {
          problems.push({ code: "open_lead_fields", message: `An open lead holds only its wording and whom it applies ` +
            `to: leave ${field} out.` });
        }
      }
    }
    // Atlas phase 3: the latest version's fields unless the owner sends others, all four or none; the searches stay
    // only while the kind stays nothing_found.
    const had = definedFields(latest.content);
    const fields = openLead ? had : decidedFields(request, had);
    problems.push(...cardFieldProblems(resolved, fields, { required: false, olderCard: false }));
    // Decision 7 (review finding 2): the general version an erasure follows keeps its searches' databases, and each
    // query becomes the erasure marker, as in an erased version, since a query can identify a person as a wording can.
    const queriesErased = erase && fields.searchScope !== undefined;
    const storedFields = queriesErased
      ? { ...fields, searchScope: fields.searchScope!.map(atlasSearchWithoutQuery) }
      : fields;
    // The sources: the families its latest version binds, or the ones the owner keeps of them.
    const bound = [...new Map(latest.bindings.map((binding) => [binding.familyId, binding])).values()]
      .sort((left, right) => left.locator.localeCompare(right.locator));
    const families = bound.map(({ familyId }) => state.sourceFamilies.find((family) => family.familyId === familyId))
      .filter((family): family is AtlasState["sourceFamilies"][number] => family !== undefined);
    let keptFamilies = families;
    if (request.sources !== undefined && !openLead) {
      keptFamilies = [];
      for (const source of request.sources) {
        const parsed = parseAtlasSource(source);
        const family = parsed === undefined ? undefined : families.find(({ identifiers }) =>
          identifiers.some(({ scheme, value }) => scheme === parsed.kind && value === parsed.id));
        if (family === undefined) {
          problems.push({ code: "source_not_on_finding", message: `${source} is not one of ${resolved}'s sources: keep ` +
            "only some of the identifiers its latest version binds." });
        } else if (!keptFamilies.includes(family)) {
          keptFamilies.push(family);
        }
      }
    }
    const checkStrings = keptFamilies.map(checkStringOf);
    const sourceChecks = checkStrings.length === 0 || checkStrings.some((value) => value === undefined)
      ? undefined
      : await this.checkSources(checkStrings as string[], providers);
    if (checkStrings.some((value) => value === undefined)) {
      problems.push({ code: "source_conflict", message: `A source of ${resolved} has no DOI, PMID, PMCID or NCT ` +
        "number to check again." });
    }
    const plan = sourceChecks === undefined
      ? emptySourcePlan()
      : planFamilySources(sourceChecks, keptFamilies, request.confirm === true);
    problems.push(...plan.problems);
    const content: AtlasVersionContent = {
      ...withoutDeclaredFields(latest.content),
      wording: request.wording ?? latest.content.wording,
      appliesTo: request.appliesTo ?? latest.content.appliesTo,
      whyNotUsual: request.whyNotUsual ?? latest.content.whyNotUsual,
      whatWouldChangeIt: request.whatWouldChangeIt ?? latest.content.whatWouldChangeIt,
      numbers: request.numbers ?? latest.content.numbers,
      ...storedFields,
    };
    const unchanged = stableJson(content) === stableJson(latest.content) &&
      keptFamilies.length === families.length;
    if (unchanged) {
      problems.push({ code: "nothing_changed", message: `The edit leaves ${resolved}'s version ${latest.versionNumber} ` +
        "as it is: send a new text, sources or numbers, or a new kind, subject, subjectType or direction." });
    }
    const numberProblems = atlasNumbersProblems(content.numbers, content.wording);
    const payload = {
      schema: ATLAS_INTENT_SCHEMA,
      kind: "revise",
      publicNumber: resolved,
      version: latest.versionNumber,
      changeKind: request.correction === false ? "edited" : "corrected",
      note: request.note ?? null,
      content,
      sources: plan.sources,
      acceptedWordingKey: atlasWordingKey(question, content.wording),
      researchCheckedOn: latest.researchCheckedOn,
      madeWith: latest.madeWith,
    };
    const privacy = screenTexts(intentTexts(payload));
    const checksNow = () => checksOf({
      item: resolved, wouldBecome: null, recheckOf: undefined, plan, sourceChecks, privacy, numberProblems, problems,
      relatedTopics: [],
    });
    if (problems.length > 0 || numberProblems.length > 0 || privacy.length > 0 || plan.status === "refused") {
      return checksNotPassed(resolved, checksNow());
    }
    if (plan.status === "try_again_later") {
      return {
        ...tryAgainLater("provider_unavailable", `A source of ${resolved} could not be checked just now ` +
          `(${unavailableSources(plan)}). Try again in a few minutes; nothing was recorded.`),
        checks: checksNow(),
      };
    }
    if (plan.confirmations.length > 0 && request.confirm !== true) {
      return this.pendingGuard(intents, [], resolved) ?? {
        ok: false,
        outcome: "needs_confirmation",
        checks: checksNow(),
        text: `Not recorded yet: the new version of ${resolved} needs the owner's confirmation: ` +
          `${plan.confirmations.join("; ")}. If the owner says to go ahead, send the same call with confirm: true.`,
      };
    }
    // Last, the intent as the review store keeps it: it holds only what an intent may.
    const prepared = prepareOrProblems(payload, problems);
    const checks = checksNow();
    if (prepared === undefined) return checksNotPassed(resolved, checks);
    // Decision 7: behind the new general version, an erasure of every version before it.
    const erasure = erase ? await this.erasePayload(resolved, latest.versionNumber + 1, "earlier_versions") : undefined;
    const pending = this.pendingGuard(intents, erasure === undefined ? [prepared] : [prepared, erasure], resolved);
    if (pending !== undefined) return pending;
    const recorded = await this.recordIntents(
      [{ kind: "revise", prepared }, ...(erasure === undefined ? [] : [{ kind: "erase" as const, prepared: erasure }])],
      resolved, request.reason, intents,
    );
    // Decision 171: its accepted publications now show the owner's version, and an erasure takes their fields too.
    const moved = await this.publicationsAfterEdit(resolved, erasure !== undefined);
    const kind = request.correction === false ? "wording fix" : "correction";
    const fieldsChanged = stableJson(fields) !== stableJson(had);
    const queued = `Queued a ${kind} of ${resolved}: version ${latest.versionNumber + 1}` +
      `${request.note === undefined ? "" : ", with your note, which the Atlas dates"}` +
      `${fieldsChanged && fields.kind !== undefined ? `, ${fieldsWords(fields)}` : ""}`;
    const atlas: AtlasStatus = {
      ...(await this.statusOf(resolved))!,
      labelAfter: labelsWith(state, [finding.findingId], { bases: { [finding.findingId]: content.verifiedBases } })
        .get(finding.findingId) ?? null,
      intent: intentView(recorded.at(-1)!),
    };
    if (erasure !== undefined) {
      return await this.erasureQueued({
        publicNumber: resolved, finding, state, recorded, checks, atlas,
        erased: finding.versions.filter(({ erased }) => !erased).map(({ versionNumber }) => versionNumber),
        lead: (versions) => `${queued}; then the wording of ${versions} is erased (decision 7)`,
        tail: (queriesErased ? ` Version ${latest.versionNumber + 1} keeps its searches' databases, and their queries ` +
          `read as "${ATLAS_ERASED_TEXT}" as an erased version's do: a query can identify a person as a wording can.` : "") +
          moved,
      });
    }
    return {
      ok: true,
      outcome: outcomeOf(recorded[0]!.status),
      checks,
      atlas,
      text: `${queued}. The Atlas writer stores it within about 5 minutes.${moved}`,
    };
  }

  // Erasing wording that could identify a person (decision 7) ---------------------------------------------------------

  /**
   * An erasure on its own: with edit_finding, of every version before the latest, which stays; with withdraw_finding on
   * a finding already withdrawn, of every version.
   */
  private async eraseOnly(
    publicNumber: string,
    context: { finding: AtlasStateFinding; state: AtlasState; intents: AtlasIntentView[] },
    scope: "earlier_versions" | "all_versions",
    request: AtlasReviewRequest,
  ): Promise<AtlasReviewResult> {
    const { finding, state, intents } = context;
    const latest = finding.versions.at(-1)!;
    const erasing = finding.versions.filter(({ erased, versionNumber }) => !erased &&
      (scope === "all_versions" || versionNumber < latest.versionNumber));
    if (erasing.length === 0) {
      return checksNotPassed(publicNumber, checksOf({
        item: publicNumber, wouldBecome: null, recheckOf: undefined, privacy: [], relatedTopics: [],
        problems: [{ code: "nothing_changed", message: scope === "all_versions"
          ? `${publicNumber} is withdrawn and the wording of every version is removed already.`
          : `${publicNumber} has no earlier version whose wording is still there: send new general wording with ` +
            "eraseWording to make it a new version and erase this one's." }],
      }));
    }
    const erasure = await this.erasePayload(publicNumber, latest.versionNumber, scope);
    const pending = this.pendingGuard(intents, [erasure], publicNumber);
    if (pending !== undefined) return pending;
    const recorded = await this.recordIntents([{ kind: "erase", prepared: erasure }], publicNumber, request.reason,
      intents);
    const erasedPublications = await this.eraseErasedPublications(publicNumber);
    const checks = checksOf({ item: publicNumber, wouldBecome: null, recheckOf: undefined, privacy: [], problems: [],
      relatedTopics: [] });
    const status = (await this.statusOf(publicNumber))!;
    return await this.erasureQueued({
      publicNumber, finding, state, recorded, checks,
      atlas: { ...status, labelAfter: status.label, intent: intentView(recorded[0]!) },
      erased: erasing.map(({ versionNumber }) => versionNumber),
      lead: (versions) => `Queued the erasure of the wording of ${publicNumber}'s ${versions} (decision 7)` +
        (scope === "all_versions" ? `, which leaves it "withdrawn, wording removed" with the date` : ""),
      tail: (request.note === undefined ? "" : " The note you sent is not stored: the withdrawal keeps its own, which " +
        "is erased with the rest.") + publicationSentence(erasedPublications, "erased"),
    });
  }

  /** An erase intent for the finding at the version it will have when the erasure applies. */
  private async erasePayload(
    publicNumber: string,
    version: number,
    scope: "earlier_versions" | "all_versions",
  ): Promise<PreparedAtlasFindingIntent> {
    return prepareAtlasFindingIntent({
      schema: ATLAS_INTENT_SCHEMA,
      kind: "erase",
      publicNumber,
      version,
      scope,
      reasonCode: "could_identify_a_person",
      decidedWith: await this.decidedWith(),
    });
  }

  /**
   * The reply to a queued erasure: which versions' wording goes, whether the question goes with it or who else still
   * uses it, the links whose rationale goes, and the cards in the findings inbox that still hold the original wording,
   * with forget_card for each (decision 7).
   */
  private async erasureQueued(input: {
    publicNumber: string;
    finding: AtlasStateFinding;
    state: AtlasState;
    recorded: AtlasIntentView[];
    checks: AtlasChecks;
    atlas: AtlasStatus;
    erased: number[];
    lead: (versions: string) => string;
    tail?: string;
  }): Promise<AtlasReviewResult> {
    const { publicNumber, finding, state } = input;
    const question = atlasQuestionUse(state, finding.findingId);
    const links = state.links.filter((link) => link.fromFindingId === finding.findingId ||
      link.toFindingId === finding.findingId).length;
    const keys = new Set(finding.versions
      .filter(({ versionNumber }) => input.erased.includes(versionNumber))
      .flatMap(({ cardWordingKey, acceptedWordingKey }) => [cardWordingKey, acceptedWordingKey])
      .filter((key): key is string => key !== null && key !== ATLAS_ERASED_KEY));
    const holding = await this.cardsHoldingWording(publicNumber, keys);
    const versions = `${input.erased.length === 1 ? "version" : "versions"} ${listed(input.erased.map(String))}`;
    const counted = finding.versions.some(({ versionNumber, content }) => input.erased.includes(versionNumber) &&
      content.numbers.length > 0);
    const sentences = [
      `${input.lead(versions)}: the Atlas shows "${ATLAS_ERASED_TEXT}" in place of every text` +
        `${counted ? ", the numbers keep their counts," : ""} and the same texts are cleared from the records of your ` +
        "earlier decisions on it.",
      questionSentence(question),
      ...(links === 0 ? [] : [`The rationale of its ${links === 1 ? "link" : `${links} links`} is erased too.`]),
      ...holdingSentences(holding),
      `The Atlas writer stores ${input.recorded.length === 1 ? "it within about 5 minutes"
        : "them within about 10 minutes, one per run"}.${input.tail ?? ""}`,
    ];
    return {
      ok: true,
      outcome: outcomeOf(input.recorded.at(-1)!.status),
      checks: input.checks,
      atlas: input.atlas,
      text: sentences.join(" "),
    };
  }

  /**
   * The cards in the findings inbox that still hold a finding's original wording (decision 7): those whose decisions
   * name it, and open cards whose undecided findings carry one of the wording keys erased. Undefined when the inbox or
   * the decisions cannot be read just now; the erasure is queued either way.
   */
  private async cardsHoldingWording(publicNumber: string, keys: ReadonlySet<string>): Promise<{
    decided: number[];
    undecided: Array<{ card: number; finding: number }>;
  } | undefined> {
    try {
      const cards = (await this.deps.inbox.repositoryIssues()).filter((issue) => issue.card !== undefined);
      const decisions = cards.length === 0 ? [] : await this.deps.store.inspectCards(cards.map(({ number }) => number));
      const decided = [...new Set(decisions.filter((decision) => decision.publicNumber === publicNumber)
        .map(({ cardNumber }) => cardNumber))].sort((left, right) => left - right);
      const undecided: Array<{ card: number; finding: number }> = [];
      for (const issue of cards) {
        if (issue.state !== "open" || issue.record === undefined) continue;
        const record = issue.record;
        record.card.findings.forEach((stored, index) => {
          const decidedItem = decisions.some((decision) => decision.cardNumber === issue.number &&
            decision.itemKind === "finding" && decision.itemNumber === index + 1);
          if (!decidedItem && keys.has(atlasWordingKey(record.card.question, stored.claim))) {
            undecided.push({ card: issue.number, finding: index + 1 });
          }
        });
      }
      return { decided, undecided };
    } catch {
      return undefined;
    }
  }

  // reject_finding ------------------------------------------------------------------------------------------------------

  private async reject(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded.failed;
    if (request.cardSha256 !== undefined && request.cardSha256 !== loaded.cardSha256) {
      return cardChanged(id, loaded.cardSha256);
    }
    const ref = itemRefOf(request)!;
    const item = cardItem(loaded.card, id, ref);
    if (item === undefined) return itemNotFound(id, ref);
    const existing = decisionFor(loaded.decisions, ref);
    if (existing?.decision === "rejected") {
      return {
        ok: true,
        outcome: "finding_rejected",
        text: `${item.name} was already rejected on ${decisionDate(existing.decidedAt)}; nothing new was recorded.`,
      };
    }
    if (existing !== undefined) {
      return errorOf("decision_conflict", `${item.name} is already decided: ` +
        `${decisionWords(existing.decision, existing.publicNumber)}, ${decisionDate(existing.decidedAt)}. A decision on ` +
        `a card item is final; ${existing.publicNumber} can be withdrawn with withdraw_finding.`);
    }
    const stored = await this.deps.store.decide({
      cardNumber,
      itemKind: ref.itemKind,
      itemNumber: ref.itemNumber,
      decision: "rejected",
      cardSha256: loaded.cardSha256,
      ownerReason: request.reason!,
      decidedAt: this.now().toISOString(),
      intent: null,
      recheckedPublicNumber: null,
    });
    const sync = await this.syncCard(loaded, stored);
    const moved = await this.syncPublications(cardNumber, withDecision(loaded.decisions, stored));
    return {
      ok: true,
      outcome: "finding_rejected",
      text: `Rejected ${item.name}; nothing from it is written to the Atlas, and your reason stays private, on the ` +
        `decision.${syncSentence(sync)}${publicationSentence(moved)}`,
    };
  }

  // withdraw_finding ----------------------------------------------------------------------------------------------------

  private async withdraw(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const erase = request.eraseWording === true;
    const resolved = await this.resolveAccepted(request);
    if (isFailure(resolved)) return resolved.failed;
    const context = await this.findingContext(resolved, [resolved], { questionUses: erase });
    if (isFailure(context)) return context.failed;
    const { finding, state, intents } = context;
    const latest = finding.versions.at(-1)!;
    if (latest.status === "invalidated") {
      if (!erase) return withdrawnConflict(resolved);
      // Withdrawn before: decision 7 erases the wording of every version now.
      if (request.version !== latest.versionNumber) return versionStale(resolved, latest.versionNumber);
      return this.eraseOnly(resolved, context, "all_versions", request);
    }
    if (request.version !== latest.versionNumber) return versionStale(resolved, latest.versionNumber);
    if (request.note === undefined) {
      return errorOf("invalid_request", `${resolved} is not withdrawn yet: withdraw_finding needs its public note, ` +
        "which the erasure then removes with the rest of its wording. Nothing was recorded.");
    }
    const payload = {
      schema: ATLAS_INTENT_SCHEMA,
      kind: "withdraw",
      publicNumber: resolved,
      version: latest.versionNumber,
      note: request.note,
      decidedWith: await this.decidedWith(),
    };
    const privacy = screenTexts(intentTexts(payload));
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    const prepared = privacy.length > 0 ? undefined : prepareOrProblems(payload, problems);
    const checks = checksOf({ item: resolved, wouldBecome: null, recheckOf: undefined, privacy, problems, relatedTopics: [] });
    if (prepared === undefined) return checksNotPassed(resolved, checks);
    // Decision 7: behind the withdrawal, an erasure of every version's wording, the withdrawn one included.
    const erasure = erase ? await this.erasePayload(resolved, latest.versionNumber + 1, "all_versions") : undefined;
    const pending = this.pendingGuard(intents, erasure === undefined ? [prepared] : [prepared, erasure], resolved);
    if (pending !== undefined) return pending;
    const recorded = await this.recordIntents(
      [{ kind: "withdraw", prepared }, ...(erasure === undefined ? [] : [{ kind: "erase" as const, prepared: erasure }])],
      resolved, request.reason, intents,
    );
    const erasedPublications = erasure === undefined ? [] : await this.eraseErasedPublications(resolved);
    const after = labelsWith(state, partnersOf(state, finding.findingId), { invalidate: finding.findingId });
    const released = partnersOf(state, finding.findingId)
      .filter((id) => id !== finding.findingId && labelsWith(state, [id]).get(id) === "contested" && after.get(id) !== "contested")
      .map((id) => `${numberIn(state, id)} returns to ${after.get(id)}`);
    const atlas: AtlasStatus = {
      ...(await this.statusOf(resolved))!, labelAfter: "withdrawn", intent: intentView(recorded.at(-1)!),
    };
    const queued = `Queued the withdrawal of ${resolved}: version ${latest.versionNumber + 1} marks it withdrawn, ` +
      `with your note, which the Atlas dates.${released.length === 0 ? "" : ` Then ${released.join(", ")}.`}`;
    if (erasure !== undefined) {
      return await this.erasureQueued({
        publicNumber: resolved, finding, state, recorded, checks, atlas,
        erased: [...finding.versions.filter(({ erased }) => !erased).map(({ versionNumber }) => versionNumber),
          latest.versionNumber + 1],
        lead: (versions) => `${queued} After it, the wording of ${versions} is erased (decision 7), your note ` +
          `included, which leaves it "withdrawn, wording removed" with the date`,
        tail: publicationSentence(erasedPublications, "erased"),
      });
    }
    return {
      ok: true,
      outcome: outcomeOf(recorded[0]!.status),
      atlas,
      text: `${queued} The Atlas writer stores it within about 5 minutes.`,
    };
  }

  // link_findings -------------------------------------------------------------------------------------------------------

  private async link(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const from = normalizedNumber(request.atlasNumber!);
    const to = normalizedNumber(request.to!);
    const relation = request.relation!;
    const [intents, state] = await Promise.all([
      this.deps.store.inspectIntents([from, to]),
      this.deps.reader.readAtlasState({ publicNumbers: [from, to], replacesGraph: relation === "replaces" }),
    ]);
    for (const number of [from, to]) {
      const waiting = intents.find((intent) => intent.intentKind === "accept" && intent.publicNumber === number &&
        intent.status === "PENDING");
      if (waiting !== undefined && !state.findings.some(({ publicNumber }) => publicNumber === number)) {
        return tryAgainLater("writer_pending", `${number} waits for the Atlas writer (about 5 minutes); link it once ` +
          "it is stored. Nothing was recorded.");
      }
    }
    const linkProblems = atlasLinkProblems({
      from, relation, to, ...(request.disagreement === undefined ? {} : { disagreement: request.disagreement }),
    }, linkStateOf(state));
    let payload: Record<string, unknown> | undefined;
    if (linkProblems.length === 0) {
      if (relation === "unlink") {
        const standing = standingLink(state, from, to)!;
        payload = {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "unlink",
          publicNumber: numberIn(state, standing.fromFindingId),
          relation: standing.relation,
          toPublicNumber: numberIn(state, standing.toFindingId),
          note: request.note ?? request.rationale!,
          decidedWith: await this.decidedWith(),
        };
      } else {
        payload = {
          schema: ATLAS_INTENT_SCHEMA,
          kind: "link",
          publicNumber: from,
          relation,
          toPublicNumber: to,
          disagreement: request.disagreement ?? null,
          rationale: request.rationale!,
          decidedWith: await this.decidedWith(),
        };
      }
    }
    const privacy = screenTexts(payload === undefined
      ? { rationale: request.rationale, note: request.note }
      : intentTexts(payload));
    const problems: Array<{ code: CheckProblemCode; message: string }> = [];
    const prepared = payload === undefined || privacy.length > 0 ? undefined : prepareOrProblems(payload, problems);
    const checks = checksOf({
      item: `${from} ${relation} ${to}`, wouldBecome: null, recheckOf: undefined, privacy, problems, linkProblems,
      relatedTopics: [],
    });
    if (prepared === undefined) return checksNotPassed(`${from} ${relation} ${to}`, checks);
    const subject = prepared.payload.kind === "link" || prepared.payload.kind === "unlink"
      ? prepared.payload.publicNumber
      : from;
    const pending = this.pendingGuard(intents, [prepared], subject, [from, to]);
    if (pending !== undefined) return pending;
    const kind = prepared.payload.kind as "link" | "unlink";
    const recorded = await this.recordIntent(kind, subject, prepared, request.reason, intents);
    const fromFinding = state.findings.find(({ publicNumber }) => publicNumber === from)!;
    const toFinding = state.findings.find(({ publicNumber }) => publicNumber === to)!;
    const standing = relation === "unlink" ? standingLink(state, from, to) : undefined;
    const after = labelsWith(state, [fromFinding.findingId, toFinding.findingId], relation === "unlink"
      ? { withdrawLink: standing!.linkId }
      : { addLink: { fromFindingId: fromFinding.findingId, toFindingId: toFinding.findingId, relation } });
    const [fromLabel, toLabel] = [after.get(fromFinding.findingId), after.get(toFinding.findingId)];
    const labels = fromLabel === undefined || toLabel === undefined
      ? "it stands"
      : fromLabel === toLabel
        ? `${from} and ${to} both read as ${fromLabel}`
        : `${from} reads as ${fromLabel} and ${to} as ${toLabel}`;
    const described = relation === "unlink"
      ? `the withdrawal of the link ${numberIn(state, standing!.fromFindingId)} ${standing!.relation} ` +
        `${numberIn(state, standing!.toFindingId)}`
      : `the link ${from} ${relation} ${to}${request.disagreement === undefined ? "" : ` (they disagree on ` +
        `${request.disagreement.replace(/_/gu, " ")})`}`;
    return {
      ok: true,
      outcome: outcomeOf(recorded.status),
      checks,
      atlas: {
        ...(await this.statusOf(from))!,
        labelAfter: after.get(fromFinding.findingId) ?? null,
        intent: intentView(recorded),
      },
      text: `Queued ${described}. Once the Atlas writer stores it, within about 5 minutes, ${labels}.`,
    };
  }

  // forget_card ---------------------------------------------------------------------------------------------------------

  /** Decision 7: removes what ties a card to its contributor (atlas-forget.ts), and says what the owner does next. */
  private async forget(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const outcome = await forgetCard({
      store: this.deps.store,
      inbox: this.deps.inbox,
      ...(this.deps.publications === undefined ? {} : { publications: this.deps.publications }),
      ...(this.deps.held === undefined ? {} : { held: this.deps.held }),
    }, cardNumber, this.now(), { confirmed: request.confirm === true });
    switch (outcome.kind) {
      case "not_a_card":
        return errorOf("card_not_found", `${id} is neither a findings card nor a forgotten one; nothing was changed.`);
      case "not_found":
        return errorOf("card_not_found", `GitHub has no issue ${id} (404), no forgotten card lists it and no ` +
          "decision row names it, so there is nothing to forget.");
      case "unreadable_save":
        return errorOf("card_unreadable", `${publicFindingsCardId(outcome.card)} holds a later save (comment ` +
          `${outcome.commentId}) that does not read as the library saved it (it may have been edited in GitHub), so ` +
          "it cannot be re-filed as a card of its own. Nothing was changed: restore that comment, or delete it in " +
          `GitHub if it holds nothing to keep, then call forget_card ${id} again.`);
      case "needs_confirmation": {
        const one = outcome.laterSaves === 1;
        return {
          ok: false,
          outcome: "needs_confirmation",
          text: `Not changed yet: ${id} also holds ${one ? "a later save" : `${outcome.laterSaves} later saves`} of ` +
            `the same question and claims from other research threads, and ${one ? "the person" : "the people"} who ` +
            `saved ${one ? "it was" : "them were"} told ${id} too, so the request may be ${one ? "theirs" : "one of " +
            "theirs"}; the id alone cannot tell. forget_card forgets the saves of the card's first saver and re-files ` +
            `${one ? "that later save as a card" : "those later saves as cards"} of ${one ? "its" : "their"} own, ` +
            "which the reply names. If the request comes from the first saver, send the same call with confirm: " +
            "true. If it may come from a later saver, do the same, then forget_card their re-filed card too.",
        };
      }
      case "github_failed": {
        const forget = this.forgetView(outcome.report, "incomplete");
        const message = `GitHub failed part way through forgetting ${id}. ${forgetSentences(forget, outcome.report)
          .join(" ")} Call forget_card ${id} again${outcome.error.retryable ? " in a few minutes" : ""} to finish; ` +
          "what is done is not redone.";
        return outcome.error.retryable
          ? { ...tryAgainLater("github_unavailable", message), forget }
          : { ...errorOf("review_service_unavailable", message), forget };
      }
      case "done": {
        const report = outcome.report;
        const stripped = report.cards.filter(({ github }) => github === "stripped").length;
        const forget = this.forgetView(report, stripped > 0 ? "waiting_for_owner" : "forgotten");
        // A call that changed nothing finds the stripped issues still waiting for the owner.
        const lead = report.strippedNow.length > 0 || report.decisions.length > 0 || report.savesDeleted.length > 0 ||
            (report.heldDeleted ?? 0) > 0
          ? `Forgot ${id} at its contributor's request (decision 7).`
          : `GitHub still has ${stripped === 1 ? "the stripped issue" : `${stripped} stripped issues`} of ${id} ` +
            "(decision 7).";
        return {
          ok: true,
          outcome: stripped > 0 ? "card_forget_waiting_for_owner" : "card_forgotten",
          forget,
          text: stripped > 0
            ? [lead, ...forgetSentences(forget, report), ...forget.ownerSteps].join(" ")
            : [`${id} is forgotten (decision 7): GitHub answers ${goneWords(report)}, and no decision row ` +
              `names ${report.cards.length === 1 ? "it" : "them"}; findings accepted from ` +
              `${report.cards.length === 1 ? "it" : "them"} stay in the Atlas while they are valid.`,
              ...forgetSentences(forget, report)].join(" "),
        };
      }
    }
  }

  /** The forget object: what was removed, and what the owner does next. */
  private forgetView(report: CardForgetReport, status: AtlasForget["status"]): AtlasForget {
    const numbers = (namedElsewhere: boolean) => [...new Set(report.decisions
      .filter((decision) => decision.publicNumber !== null && decision.publicNumberNamedElsewhere === namedElsewhere)
      .map(({ publicNumber }) => publicNumber!))].sort(comparePublicNumbers);
    const stripped = report.cards.filter(({ github }) => github === "stripped").map(({ number }) => number);
    const id = publicFindingsCardId(report.card);
    return {
      card: id,
      status,
      threadKnown: report.threadKnown,
      cards: report.cards.map(({ number, github }) => ({
        card: publicFindingsCardId(number),
        url: this.deps.inbox.issueUrl(number),
        github: github === "stripped" ? "stripped" as const : github === 410 ? "deleted" as const : "not_found" as const,
      })),
      decisionsRemoved: report.decisions.length,
      findingsOnlyFromThese: numbers(false),
      findingsAlsoElsewhere: numbers(true),
      laterSavesDeletedOn: [...new Set(report.savesDeleted)].sort((left, right) => left - right)
        .map(publicFindingsCardId),
      refiled: report.refiled.map(({ from, card }) => ({ from: publicFindingsCardId(from), card: publicFindingsCardId(card) })),
      publicationsWithdrawn: report.publications.filter(({ state }) => state === "withdrawn")
        .map(({ publicationNumber }) => publicationNumber),
      publicationsKept: report.publications.filter(({ state }) => state === "accepted")
        .map(({ publicationNumber }) => publicationNumber),
      ...(report.heldDeleted === undefined ? {} : { youtubeFindingsDeleted: report.heldDeleted }),
      ownerSteps: status !== "waiting_for_owner" || stripped.length === 0 ? [] : [
        `Now delete ${stripped.length === 1 ? "this issue" : "these issues"} in GitHub (Delete issue, at the foot of ` +
          `${stripped.length === 1 ? "the" : "each"} issue's page), which also removes the edit history: ` +
          `${stripped.map((number) => this.deps.inbox.issueUrl(number)).join(", ")}.`,
        `Then call forget_card ${id} again to check that GitHub no longer has ${stripped.length === 1 ? "it" : "them"}.`,
      ],
    };
  }

  // move_youtube_findings and delete_youtube_findings (owner answer 173) ------------------------------------------------

  private async moveYouTube(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const held = this.deps.held;
    if (held === undefined) return heldNotConfigured("Nothing was changed");
    const numbers = [...new Set(request.cards!.map((card) => findingsCardNumber(card)!))];
    const now = this.now();
    const reports: YouTubeFindingsMoveReport[] = [];
    for (const cardNumber of numbers) {
      reports.push(await moveYouTubeFindings({
        inbox: this.deps.inbox, store: this.deps.store, held,
        ...(this.deps.publications === undefined ? {} : { publications: this.deps.publications }),
      }, cardNumber, now));
    }
    const rewritten = reports.filter((report) => report.cardRewritten || report.laterSavesRewritten > 0);
    const youtubeFindings: AtlasYoutubeFindings = {
      cards: reports.map((report) => ({
        card: publicFindingsCardId(report.card),
        status: report.status,
        held: report.findings.flatMap(({ finding, save, expiresAt }) =>
          expiresAt === null ? [] : [{ finding, save, deletedOn: expiresAt.slice(0, 10) }]),
        deleted: report.findings.filter(({ expiresAt }) => expiresAt === null).length,
        cardRewritten: report.cardRewritten,
        laterSavesRewritten: report.laterSavesRewritten,
        laterSavesDeleted: report.laterSavesDeleted,
        decidedFindings: report.decidedFindings,
        publishedFindings: report.publishedFindings,
      })),
      ownerSteps: rewritten.length === 0 ? [] : [
        "GitHub keeps each rewritten card's earlier text in its edit history. On each card below, open the edited " +
          "menu at the top of the description (and of each rewritten later save), and delete every earlier revision " +
          `from the history: ${rewritten.map(({ card }) => this.deps.inbox.issueUrl(card)).join(", ")}.`,
      ],
    };
    return {
      ok: true,
      outcome: "youtube_findings_moved",
      youtubeFindings,
      text: [...reports.map(moveSentence), ...youtubeFindings.ownerSteps].join("\n"),
    };
  }

  private async listYouTube(): Promise<AtlasReviewResult> {
    const held = this.deps.held;
    if (held === undefined) return heldNotConfigured("Nothing was read");
    const rows = await held.inspectWithoutCard();
    const saves: AtlasHeldWithoutCard["saves"] = [];
    for (const row of rows) {
      const save = saves.find(({ cardSha256 }) => cardSha256 === row.cardSha256);
      if (save !== undefined) {
        save.findings.push(heldView(row));
        continue;
      }
      saves.push({
        cardSha256: row.cardSha256,
        question: row.question ?? "",
        topic: row.topic === undefined ? null : { key: row.topic.key, label: row.topic.label },
        savedOn: row.savedAt.slice(0, 10),
        deletedOn: row.expiresAt.slice(0, 10),
        findings: [heldView(row)],
      });
    }
    const moreNotShown = rows.length >= HELD_YOUTUBE_FINDINGS_WITHOUT_CARD_SHOWN;
    const lines = saves.length === 0
      ? ["No YouTube findings are held without a card."]
      : [
        "Held YouTube findings with no card: each card's findings all rested on YouTube comments, so it was not saved " +
          "as a card. Newest first; never decided, accepted or published, and deleted 30 days after their save.",
        ...saves.map((save) => `${save.cardSha256}, saved ${decisionDate(`${save.savedOn}T00:00:00.000Z`)}, deleted on ` +
          `${decisionDate(`${save.deletedOn}T00:00:00.000Z`)}: ${clip(save.question, 160)}` +
          `${save.topic === null ? "" : ` [${save.topic.label} (${save.topic.key})]`}\n` +
          save.findings.map((finding) => `  Finding ${finding.finding}: ${clip(finding.claim, 160)} ` +
            `(${finding.certainty})`).join("\n")),
        "delete_youtube_findings with a save's cardSha256 deletes its held findings now.",
        ...(moreNotShown ? [`Only the newest ${HELD_YOUTUBE_FINDINGS_WITHOUT_CARD_SHOWN} are shown.`] : []),
      ];
    return {
      ok: true,
      outcome: "youtube_findings_listed",
      heldWithoutCard: { saves, moreNotShown, deleted: null },
      text: lines.join("\n"),
    };
  }

  private async deleteYouTube(request: AtlasReviewRequest): Promise<AtlasReviewResult> {
    const held = this.deps.held;
    if (held === undefined) return heldNotConfigured("Nothing was deleted");
    if (request.cardSha256 !== undefined) {
      // A held save with no card, by its checked card's SHA-256.
      const deleted = await held.deleteWithoutCard([request.cardSha256]);
      return {
        ok: true,
        outcome: "youtube_findings_deleted",
        heldWithoutCard: { saves: [], moreNotShown: false, deleted },
        text: deleted === 0
          ? `No YouTube findings are held without a card under ${request.cardSha256}: none were held, or their 30 days ` +
            "ended, or they were deleted already. Nothing was deleted."
          : `Deleted the ${deleted === 1 ? "held YouTube finding" : `${deleted} held YouTube findings`} with no card ` +
            `under ${request.cardSha256} now, before ${deleted === 1 ? "its" : "their"} 30 days ended.`,
      };
    }
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const deleted = await held.deleteForCards([cardNumber]);
    return {
      ok: true,
      outcome: "youtube_findings_deleted",
      youtubeFindings: {
        cards: [{
          card: id, status: "deleted", held: [], deleted, cardRewritten: false, laterSavesRewritten: 0,
          laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [],
        }],
        ownerSteps: [],
      },
      text: deleted === 0
        ? `${id} has no held YouTube findings: none were held, or their 30 days ended, or they were deleted already. ` +
          "Nothing was deleted."
        : `Deleted ${id}'s ${deleted === 1 ? "held YouTube finding" : `${deleted} held YouTube findings`} now, before ` +
          `${deleted === 1 ? "its" : "their"} 30 days ended.`,
    };
  }

  /** A card's held YouTube findings whose 30 days have not ended, or why they cannot be shown. */
  private async heldOf(cardNumber: number): Promise<HeldRead> {
    if (this.deps.held === undefined) return { status: "not_configured" };
    try {
      return { status: "read", findings: await this.deps.held.inspect([cardNumber]) };
    } catch {
      return { status: "unavailable" };
    }
  }

  // Shared steps --------------------------------------------------------------------------------------------------------

  /** Reads a card, its decisions and its hash, and brings GitHub up to date with the decisions. */
  private async loadCard(cardNumber: number): Promise<LoadedCard | Failure> {
    const id = publicFindingsCardId(cardNumber);
    const lookup = await this.deps.inbox.readCard(cardNumber);
    if (lookup.status === "not_found") {
      return failed(errorOf("card_not_found", `${id} is not a findings card in the library.`));
    }
    if (lookup.status === "unreadable") {
      return failed(errorOf("card_not_found", `${id}'s stored record, or a later save's, does not read as the library ` +
        "saved it (it may have been edited in GitHub), so it cannot be reviewed."));
    }
    const card = lookup.card;
    const decisions = await this.deps.store.inspectCards([cardNumber]);
    const sync = await reconcileFindingsCard(this.deps.inbox, { ...card, findings: card.record.card.findings.length },
      decisions);
    // Decision 171: the card's publications follow its decisions; one a decision's own call did not move moves now.
    await this.syncPublications(cardNumber, decisions);
    const reconciled: FindingsCardRead = sync.synced
      ? {
          ...card,
          decisions: decisions.map(markerOf),
          ...(sync.reviewed ? { state: "closed" as const, labels: reviewedLabels(card.labels) } : {}),
        }
      : card;
    return {
      card: reconciled,
      decisions,
      cardSha256: findingsCardSha256(cardNumber, card.record, card.occurrences),
      synced: sync.synced,
    };
  }

  /** Posts a new decision to the card, and labels and closes it once every finding has one. */
  private async syncCard(loaded: LoadedCard, decision: AtlasDecisionView) {
    const decisions = [...loaded.decisions.filter((stored) => stored.itemKind !== decision.itemKind ||
      stored.itemNumber !== decision.itemNumber), decision];
    return reconcileFindingsCard(this.deps.inbox, {
      ...loaded.card, findings: loaded.card.record.card.findings.length,
    }, decisions);
  }

  /** The F number an edit or withdrawal names: atlasNumber, or the number its card item's decision took. */
  private async resolveAccepted(request: AtlasReviewRequest): Promise<string | Failure> {
    if (request.atlasNumber !== undefined) return normalizedNumber(request.atlasNumber);
    const cardNumber = findingsCardNumber(request.card!)!;
    const id = publicFindingsCardId(cardNumber);
    const ref = itemRefOf(request)!;
    const loaded = await this.loadCard(cardNumber);
    if (isFailure(loaded)) return loaded;
    if (cardItem(loaded.card, id, ref) === undefined) return failed(itemNotFound(id, ref));
    const decision = decisionFor(loaded.decisions, ref);
    if (decision === undefined) {
      return failed(errorOf("item_not_found", `${itemName(id, ref)} has no decision yet: to accept it with the ` +
        "owner's wording, send edit_finding without version, with its cardSha256, topicKey and numbers."));
    }
    if (decision.publicNumber === null) {
      return failed(errorOf("decision_conflict", `${itemName(id, ref)} was rejected on ` +
        `${decisionDate(decision.decidedAt)}; it has no finding to change.`));
    }
    return decision.publicNumber;
  }

  /**
   * A stored finding with its canonical state and its intents, or why there is none to change yet. With questionUses,
   * the state also holds who else uses its question, for an erasure (decision 7).
   */
  private async findingContext(publicNumber: string, numbers: string[], options: { questionUses?: boolean } = {}): Promise<{
    finding: AtlasStateFinding;
    state: AtlasState;
    intents: AtlasIntentView[];
  } | Failure> {
    const [intents, state] = await Promise.all([
      this.deps.store.inspectIntents(numbers),
      this.deps.reader.readAtlasState({
        publicNumbers: numbers,
        ...(options.questionUses === true ? { questionUsesOf: [publicNumber] } : {}),
      }),
    ]);
    const finding = state.findings.find((candidate) => candidate.publicNumber === publicNumber);
    if (finding !== undefined) return { finding, state, intents };
    const accept = [...intents].reverse().find((intent) => intent.intentKind === "accept" &&
      intent.publicNumber === publicNumber);
    if (accept?.status === "PENDING") {
      return failed(tryAgainLater("writer_pending", `${publicNumber} waits for the Atlas writer (about 5 minutes); ` +
        "change it once it is stored. Nothing was recorded."));
    }
    return failed(errorOf("finding_not_found", accept?.status === "FAILED"
      ? `${publicNumber} was never stored: the Atlas writer refused its accept with ${accept.failureCode} ` +
        `(${ATLAS_FAILURE_EXPLANATIONS[accept.failureCode!]}). Accept its card item again to retry under the same number.`
      : `No finding has the number ${publicNumber}.`));
  }

  /**
   * A change waits for the writer on these findings: the same intents again are those (nothing new is recorded), and
   * the first of them waiting alone is recorded again with the rest behind it; any other change waits until it is
   * stored, since it may change the version or the links the new one depends on.
   */
  private pendingGuard(
    intents: readonly AtlasIntentView[],
    prepared: readonly PreparedAtlasFindingIntent[],
    subject: string,
    numbers: readonly string[] = [subject],
  ): AtlasReviewResult | undefined {
    const pending = intents.filter((intent) => intent.status === "PENDING" && (numbers.includes(intent.publicNumber) ||
      ("toPublicNumber" in intent.payload && numbers.includes(intent.payload.toPublicNumber))));
    if (pending.length === 0) return undefined;
    const waits = (candidate: PreparedAtlasFindingIntent) => pending.some((intent) =>
      intent.intentKind === candidate.payload.kind && intent.publicNumber === subject &&
      intent.payloadSha256 === candidate.payloadSha256);
    if (prepared.length > 0 && prepared.every(waits)) {
      const kinds = listed(prepared.map(({ payload }) => payload.kind));
      return {
        ok: true,
        outcome: "finding_queued",
        text: `This ${kinds} of ${subject} already ${prepared.length === 1 ? "waits" : "wait"} for the Atlas writer; ` +
          "nothing new was recorded.",
      };
    }
    // An erasure asked for behind the same change already waiting (decision 7) is recorded behind it.
    if (prepared.length > 1 && waits(prepared[0]!) && pending.every((intent) => prepared.some((candidate) =>
      intent.intentKind === candidate.payload.kind && intent.payloadSha256 === candidate.payloadSha256))) {
      return undefined;
    }
    return tryAgainLater("writer_pending", `${pending.map((intent) => `${intent.publicNumber}'s ${intent.intentKind}`)
      .join(", ")} ${pending.length === 1 ? "waits" : "wait"} for the Atlas writer (about 5 minutes), and this change ` +
      "depends on what it stores. Inspect the finding again once it is stored. Nothing was recorded.");
  }

  /** Records an intent on an accepted finding, as the retry of the same kind's last refused intent if there is one. */
  private async recordIntent(
    kind: "revise" | "withdraw" | "link" | "unlink",
    publicNumber: string,
    prepared: PreparedAtlasFindingIntent,
    reason: string | undefined,
    intents: readonly AtlasIntentView[],
  ): Promise<AtlasIntentView> {
    return (await this.recordIntents([{ kind, prepared }], publicNumber, reason, intents))[0]!;
  }

  /**
   * Records intents on an accepted finding in one transaction, in order (an erasure behind its revision or withdrawal,
   * decision 7), each as the retry of the same kind's last refused intent if there is one.
   */
  private async recordIntents(
    entries: ReadonlyArray<{ kind: "revise" | "withdraw" | "link" | "unlink" | "erase"; prepared: PreparedAtlasFindingIntent }>,
    publicNumber: string,
    reason: string | undefined,
    intents: readonly AtlasIntentView[],
  ): Promise<AtlasIntentView[]> {
    const retried = new Set(intents.map(({ retryOfIntentId }) => retryOfIntentId).filter((id) => id !== null));
    const createdAt = this.now().toISOString();
    return this.deps.store.recordIntents(entries.map(({ kind, prepared }) => {
      const retryOf = [...intents].reverse().find((intent) => intent.intentKind === kind &&
        intent.publicNumber === publicNumber && intent.status === "FAILED" && !retried.has(intent.intentId));
      return {
        intentId: this.newIntentId(),
        intentKind: kind,
        publicNumber,
        payload: prepared.payload,
        payloadSha256: prepared.payloadSha256,
        ownerReason: reason ?? null,
        createdAt,
        retryOfIntentId: retryOf?.intentId ?? null,
      };
    }));
  }

  private async decidedWith() {
    return {
      askrigorVersion: safeVersion(this.deps.version),
      build: safeBuild(this.deps.build),
      protocols: (await this.deps.protocols()).slice(0, 4).map(({ name, version, sha256 }) => ({ name, version, sha256 })),
    };
  }

  private checkSources(sources: readonly string[], providers: AtlasProviderConfig): Promise<AtlasSourceChecks> {
    return checkAtlasSources(sources, {
      crossref: providers.crossref,
      pubmed: providers.pubmed,
      now: this.now,
      ...(this.deps.sourceCheckCache === undefined ? {} : { cache: this.deps.sourceCheckCache }),
    });
  }
}

// Card items ------------------------------------------------------------------------------------------------------------

function itemRefOf(request: AtlasReviewRequest): ItemRef | undefined {
  if (request.finding !== undefined) return { itemKind: "finding", itemNumber: request.finding };
  if (request.lead !== undefined) return { itemKind: "open_lead", itemNumber: request.lead };
  return undefined;
}

function itemName(cardId: string, ref: ItemRef): string {
  return `${cardId} ${ref.itemKind === "finding" ? "finding" : "open lead"} ${ref.itemNumber}`;
}

/** A card item as the save that counts holds it; undefined when the card has no such item. */
function cardItem(
  card: Pick<FindingsCardRead, "record" | "occurrences">,
  cardId: string,
  ref: ItemRef,
): CardItem | undefined {
  const name = itemName(cardId, ref);
  if (ref.itemKind === "open_lead") {
    const lead = card.record.card.open_leads[ref.itemNumber - 1];
    if (lead === undefined) return undefined;
    return {
      ref, name, text: lead, question: card.record.card.question, certainty: null, appliesTo: null, sources: [],
      youtubeVideos: 0, save: "card", record: card.record, finding: null, bases: [], entryKind: "lead",
      leadOrigin: "open_lead", cardWordingKey: atlasWordingKey(card.record.card.question, lead),
    };
  }
  const save = atlasBasesOf(card.record, card.occurrences, ref.itemNumber);
  if (save === undefined) return undefined;
  return {
    ref,
    name,
    text: save.finding.claim,
    question: save.record.card.question,
    certainty: save.finding.certainty,
    appliesTo: save.finding.applies_to,
    sources: [...save.finding.sources],
    youtubeVideos: save.finding.youtube_videos ?? 0,
    save: save.from,
    record: save.record,
    finding: save.finding,
    bases: save.bases,
    entryKind: save.entryKind,
    leadOrigin: save.entryKind === "finding" ? null : "unverified_finding",
    cardWordingKey: atlasWordingKey(save.record.card.question, save.finding.claim),
  };
}

function decisionFor(decisions: readonly AtlasDecisionView[], ref: ItemRef): AtlasDecisionView | undefined {
  return decisions.find(({ itemKind, itemNumber }) => itemKind === ref.itemKind && itemNumber === ref.itemNumber);
}

type WouldBecome = z.infer<typeof wouldBecomeSchema>;

function wouldBecome(item: CardItem, recheckOf: string | undefined, community?: AtlasCommunityCheck): WouldBecome {
  if (item.finding !== null && (community ?? communityState(item.finding)).refused) return "community_only";
  if (recheckOf !== undefined) return "recheck";
  return item.entryKind === "finding" ? "checked" : "lead";
}

function wouldBecomeWords(value: WouldBecome, recheckOf: string | null | undefined): string {
  switch (value) {
    case "checked": return "a checked finding";
    case "lead": return "a lead only";
    case "recheck": return `a re-check of ${recheckOf}`;
    case "community_only": return "held: community evidence only (4a)";
  }
}

function decisionWords(decision: AtlasCardDecision, publicNumber: string | null): string {
  switch (decision) {
    case "accepted": return `accepted as ${publicNumber}, a checked finding`;
    case "accepted_as_lead": return `accepted as a lead, ${publicNumber}`;
    case "rechecked": return `recorded as a re-check of ${publicNumber}`;
    case "rejected": return "rejected";
  }
}

/** The texts an accept would store: the card's, or the owner's where the owner edited them. */
function acceptedTexts(item: CardItem, edits: Partial<Pick<AtlasReviewRequest, typeof EDIT_TEXTS[number] | "question">>) {
  return {
    question: edits.question ?? item.question,
    wording: edits.wording ?? item.text,
    appliesTo: edits.appliesTo ?? item.appliesTo,
    whyNotUsual: edits.whyNotUsual ?? item.finding?.why_not_usual ?? null,
    whatWouldChangeIt: edits.whatWouldChangeIt ?? item.finding?.what_would_change_it ?? null,
  };
}

/**
 * The version content an accept stores: an open lead holds only its wording and whom it applies to; a card finding
 * also its declared fields (Atlas phase 3), each left out when not declared.
 */
function contentOf(
  item: CardItem,
  texts: ReturnType<typeof acceptedTexts>,
  numbers: AtlasNumberEntry[],
  fields: DeclaredFields,
): AtlasVersionContent {
  const declared = item.record.card.public_value;
  const open = item.leadOrigin === "open_lead";
  return {
    wording: texts.wording,
    appliesTo: texts.appliesTo,
    certainty: open ? null : item.certainty,
    usualAnswer: open ? null : item.record.card.usual_answer,
    whyNotUsual: open ? null : texts.whyNotUsual,
    whatWouldChangeIt: open ? null : texts.whatWouldChangeIt,
    whoElse: open || declared?.scope !== "public" ? null : declared.who_else ?? null,
    whatItChanges: open || declared?.scope !== "public" ? null : declared.what_it_changes ?? null,
    // community_checked is never stored (4a).
    tags: open || item.finding === null ? [] : ATLAS_FINDING_TAGS.filter((tag) => item.finding!.tags.includes(tag)),
    verifiedBases: item.entryKind === "finding" ? item.bases : [],
    numbers,
    ...(open ? {} : definedFields(fields)),
  };
}

/** Every text of an item as an accept would store it, for the dry run's privacy screen. */
function itemTexts(
  item: CardItem,
  texts: ReturnType<typeof acceptedTexts>,
  numbers: AtlasNumberEntry[],
  fields: DeclaredFields,
) {
  return contentTexts(contentOf(item, texts, numbers, fields), { question: texts.question });
}

function contentTexts(content: AtlasVersionContent, extra: Record<string, string | null | undefined> = {}) {
  const texts: Record<string, string | undefined> = {};
  for (const [field, value] of Object.entries(extra)) texts[field] = value ?? undefined;
  texts.wording = content.wording;
  texts.appliesTo = content.appliesTo ?? undefined;
  texts.usualAnswer = content.usualAnswer ?? undefined;
  texts.whyNotUsual = content.whyNotUsual ?? undefined;
  texts.whatWouldChangeIt = content.whatWouldChangeIt ?? undefined;
  texts.whoElse = content.whoElse ?? undefined;
  texts.whatItChanges = content.whatItChanges ?? undefined;
  content.numbers.forEach((entry, index) => {
    texts[`numbers[${index}].outcome`] = entry.outcome;
    texts[`numbers[${index}].option`] = entry.option;
    texts[`numbers[${index}].comparator`] = entry.comparator;
    texts[`numbers[${index}].follow_up`] = entry.follow_up;
  });
  // Atlas phase 3: the subject and each search's query are stored texts too, screened like the rest.
  texts.subject = content.subject;
  content.searchScope?.forEach((search, index) => {
    texts[`searchScope[${index}].query`] = search.query;
  });
  return texts;
}

// The finding's declared fields (Atlas phase 3, design section 5) ---------------------------------------------------

/** A finding's kind, subject, subject type, direction and searches, as a version's content holds them. */
type DeclaredFields = Pick<AtlasVersionContent, "kind" | "subject" | "subjectType" | "direction" | "searchScope">;

const orList = (values: readonly string[]) => `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
/** What each field takes, for a problem that asks for it. */
const FIELD_VALUES: Record<typeof CARD_FIELDS[number], string> = {
  kind: `kind (${orList(ATLAS_FINDING_KINDS)})`,
  subject: "subject (what it is about, as people know it, such as zentarine)",
  subjectType: `subjectType (${orList(ATLAS_SUBJECT_TYPES)})`,
  direction: `direction (${orList(ATLAS_FINDING_DIRECTIONS)})`,
};

/** The fields with each undefined one left out, so a content holds only what was declared. */
function definedFields(fields: DeclaredFields): DeclaredFields {
  const defined: DeclaredFields = {};
  if (fields.kind !== undefined) defined.kind = fields.kind;
  if (fields.subject !== undefined) defined.subject = fields.subject;
  if (fields.subjectType !== undefined) defined.subjectType = fields.subjectType;
  if (fields.direction !== undefined) defined.direction = fields.direction;
  if (fields.searchScope !== undefined) defined.searchScope = fields.searchScope;
  return defined;
}

/** The fields a card item declares: a card finding's own (none on an older card); an open lead has none. */
function cardFieldsOf(item: CardItem): DeclaredFields {
  const finding = item.finding;
  if (finding === null) return {};
  return definedFields({
    kind: finding.kind,
    subject: finding.subject,
    subjectType: finding.subject_type,
    direction: finding.direction,
    searchScope: finding.searches === undefined || finding.searches.length === 0
      ? undefined
      : finding.searches.map(({ database, query, date_range: range }): AtlasSearch =>
        ({ database, query, ...(range === undefined ? {} : { dateRange: range }) })),
  });
}

/** A version's content without its declared fields, to which a correction's are then added. */
function withoutDeclaredFields(content: AtlasVersionContent): AtlasVersionContent {
  const rest = { ...content };
  delete rest.kind;
  delete rest.subject;
  delete rest.subjectType;
  delete rest.direction;
  delete rest.searchScope;
  return rest;
}

/**
 * The fields a decision stores: each one the owner sent, else the one the finding had (its card's, or its latest
 * version's). The searches come only from what it had, bound at the final check, and stay only while the kind stays
 * nothing_found.
 */
function decidedFields(request: Pick<AtlasReviewRequest, typeof CARD_FIELDS[number]>, had: DeclaredFields): DeclaredFields {
  const kind = request.kind ?? had.kind;
  return definedFields({
    kind,
    subject: request.subject ?? had.subject,
    subjectType: request.subjectType ?? had.subjectType,
    direction: request.direction ?? had.direction,
    searchScope: kind === ATLAS_SEARCH_KIND ? had.searchScope : undefined,
  });
}

/**
 * What the declared fields lack, and their one exact contradiction (the final check's check 10). An accept needs all
 * four (choice 2); a correction keeps all four or none, so a version never declares only some.
 */
function cardFieldProblems(
  name: string,
  fields: DeclaredFields,
  options: { required: boolean; olderCard: boolean },
): Array<{ code: CheckProblemCode; message: string }> {
  const problems: Array<{ code: CheckProblemCode; message: string }> = [];
  const missing = CARD_FIELDS.filter((field) => fields[field] === undefined);
  if (missing.length > 0 && (options.required || missing.length < CARD_FIELDS.length)) {
    problems.push({
      code: "card_fields_missing",
      message: `${name} has no ${listed(missing)}${options.olderCard ? ", as its card was saved before the Atlas " +
        "fields" : ""}: declare ${missing.length === 1 ? "it" : "each"}: ${missing.map((field) => FIELD_VALUES[field])
        .join("; ")}.`,
    });
  }
  if (fields.kind === ATLAS_SEARCH_KIND && fields.direction !== undefined && fields.direction !== "descriptive") {
    problems.push({
      code: "card_fields_contradict",
      message: `${name} is of kind nothing_found with direction ${fields.direction}: a search that found nothing has ` +
        "direction descriptive. A study that found no difference is of kind effect or harm, with direction no_effect.",
    });
  }
  return problems;
}

/** The declared fields in words, for a reply; empty when the kind is not declared. */
function fieldsWords(fields: DeclaredFields): string {
  if (fields.kind === undefined) return "";
  const searches = fields.searchScope?.length ?? 0;
  return `of kind ${fields.kind}, direction ${fields.direction}, about ${fields.subject} (${fields.subjectType})` +
    (searches === 0 ? "" : `, with ${searches} ${searches === 1 ? "search" : "searches"} that found nothing`);
}

/** The declared fields for a view, each null when not declared. */
function fieldsView(fields: DeclaredFields) {
  return {
    kind: fields.kind ?? null,
    subject: fields.subject ?? null,
    subjectType: fields.subjectType ?? null,
    direction: fields.direction ?? null,
  };
}

/**
 * Every text an intent would store, by the field that holds it: the topic label, the question, the version's texts
 * and its numbers' outcome, option, comparator and follow-up, and the public notes and rationale. The source titles
 * are the providers' and are screened where they are read (storedTitle).
 */
function intentTexts(payload: unknown): Record<string, string | undefined> {
  const intent = payload as AtlasFindingIntent;
  switch (intent.kind) {
    case "accept":
      // The topic's key is stored for good (topics are never erased), so it is screened too, read as words. The payload
      // is not parsed yet: with no topic, its key is missing, and the checks name that (topic_missing).
      return contentTexts(intent.content, { topicLabel: intent.topic.label, question: intent.question,
        topicKey: typeof intent.topic.key === "string" ? topicKeyText(intent.topic.key) : undefined });
    case "revise":
      return contentTexts(intent.content, { note: intent.note });
    case "withdraw":
    case "unlink":
      return { note: intent.note };
    case "link":
      return { rationale: intent.rationale };
    case "recheck":
    case "erase":
      return {};
  }
}

// The fields contentTexts names for the searches' queries, which the screen reads as search queries (review finding 11).
const SEARCH_QUERY_FIELD = /^searchScope\[\d+\]\.query$/u;

function screenTexts(texts: Readonly<Record<string, string | undefined>>): Array<{ field: string; reasonCode: string }> {
  const searchQueries = new Set(Object.keys(texts).filter((field) => SEARCH_QUERY_FIELD.test(field)));
  return screenAtlasTexts(texts, searchQueries).map(({ field, reasonCode }) => ({ field, reasonCode }));
}

/** The intent as the review store keeps it, or why it cannot be one: each problem names its field. */
function prepareOrProblems(
  payload: unknown,
  problems: Array<{ code: CheckProblemCode; message: string }>,
): PreparedAtlasFindingIntent | undefined {
  try {
    return prepareAtlasFindingIntent(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues.slice(0, 10)) {
        problems.push({ code: "intent_invalid", message: `${issue.path.join(".") || "intent"}: ${issue.message}.` });
      }
      return undefined;
    }
    throw error;
  }
}

function communityOnlyProblem(name: string) {
  return {
    code: "community_only" as const,
    message: `${name} rests on community evidence alone (no DOI, PMID, PMCID or NCT source it keeps), which the ` +
      "Atlas does not hold until the community rule (owner decision 4a); it stays held.",
  };
}

function communityConfirmation(): string {
  return "the finding also rested on audited comments, which the Atlas does not store, so only its study sources are " +
    "kept (4a)";
}

function stampProblem() {
  return {
    code: "stamp_without_protocols" as const,
    message: "The save's version stamp names no protocol, so the Atlas cannot say which AskRigor made the research.",
  };
}

// Sources ---------------------------------------------------------------------------------------------------------------

function emptySourcePlan(): SourcePlan {
  return { status: "passed", views: [], sources: [], confirmations: [], problems: [] };
}

/** A source as one identifier, so two forms of one identifier match: the provider form, or the text itself. */
function sourceKey(source: string): string {
  const parsed = parseAtlasSource(source);
  return parsed === undefined ? `text:${source.trim()}` : `${parsed.kind}:${parsed.id}`;
}

/** The identifiers each checked source and its public record give, for the canonical lookup of their families. */
function checkedIdentifiers(checks: AtlasSourceChecks): Array<{ scheme: string; value: string }> {
  return checks.sources.flatMap((check) => check.outcome === "checked" ? recordIdentifiers(check) : []);
}

/** The identifiers a checked source has, in the intents' canonical forms: the one cited and those its record lists. */
function recordIdentifiers(check: AtlasSourceCheck & AtlasCheckedSource): AtlasSourceIdentifier[] {
  const candidates = [
    { scheme: check.kind, value: check.identifier },
    { scheme: "doi", value: check.record.doi?.toLowerCase() },
    { scheme: "pmid", value: check.record.pmid },
    { scheme: "pmcid", value: check.record.pmcid?.toUpperCase() },
    { scheme: "nct", value: check.record.nctId?.toUpperCase() },
  ];
  const identifiers = new Map<string, AtlasSourceIdentifier>();
  for (const candidate of candidates) {
    if (candidate.value === undefined || identifiers.has(candidate.scheme)) continue;
    const parsed = atlasSourceIdentifierSchema.safeParse(candidate);
    if (parsed.success) identifiers.set(parsed.data.scheme, parsed.data);
  }
  return [...identifiers.values()];
}

/** The kind of a new source family, from the closed vocabularies providers write. */
function sourceKindOf(check: AtlasSourceCheck & AtlasCheckedSource): AtlasSource["kind"] {
  if (check.kind === "nct") return "registry";
  const types = (check.record.publicationTypes ?? []).map((type) => type.trim());
  if (types.some((type) => ["Practice Guideline", "Guideline"].includes(type))) return "guideline";
  if (types.some((type) => ["Review", "Systematic Review", "Meta-Analysis", "Scoping Review"].includes(type))) {
    return "review";
  }
  return "study";
}

/** A provider's title as an intent may store it: one line, at most 500 characters, past the same screen. */
function storedTitle(title: string | undefined): string | null {
  if (title === undefined) return null;
  let text = title.replace(/\s+/gu, " ").trim();
  if (text.length > 500) text = text.slice(0, /[\uD800-\uDBFF]/u.test(text.charAt(499)) ? 499 : 500);
  if (text.length === 0 || /\p{Cc}/u.test(text) || screenAtlasTexts({ title: text }).length > 0 ||
    /(?:youtube(?:-nocookie)?\.com|youtu\.be)/iu.test(text)) {
    return null;
  }
  return text;
}

function storedNotices(notices: readonly { type: string; date: string | null; doi: string | null }[]) {
  return notices.slice(0, 20).map((notice) => ({
    type: notice.type as AtlasSource["check"]["notices"][number]["type"],
    date: notice.date !== null && /^\d{4}-\d{2}-\d{2}$/u.test(notice.date) &&
        new Date(`${notice.date}T00:00:00Z`).toISOString().startsWith(notice.date)
      ? notice.date
      : null,
    doi: notice.doi !== null && /^10\.\d{4,9}\/\S{1,300}$/u.test(notice.doi) ? notice.doi : null,
  }));
}

const severity = (status: string) => ATLAS_RETRACTION_SEVERITY.indexOf(status as typeof ATLAS_RETRACTION_SEVERITY[number]);

/**
 * The intent's sources from the checks (design section 3): each checked source with the identifiers its record gives
 * that name no other source family, joined to the family they name with that family's kind, or, for a new family, the
 * kind PubMed's types or the identifier say. Two card sources of one paper are one source, under the more serious
 * retraction status. A retracted, concerned, corrected or unreadable status needs the owner's confirm.
 */
function planSources(
  checks: AtlasSourceChecks,
  state: Pick<AtlasState, "sourceFamilies">,
  confirm: boolean,
): SourcePlan {
  const views: SourceCheckView[] = [];
  const problems: SourcePlan["problems"] = [];
  const confirmations: string[] = [];
  const planned: Array<{ source: AtlasSource; familyId: string | undefined; first: string; check: AtlasCheckedSource }> = [];
  const familiesNaming = (identifier: { scheme: string; value: string }) => state.sourceFamilies.filter(({ identifiers }) =>
    identifiers.some(({ scheme, value }) => scheme === identifier.scheme && value === identifier.value));
  for (const check of checks.sources) {
    const view = sourceView(check);
    if (check.outcome !== "checked") {
      views.push(view);
      const refused = refusal(check);
      if (refused !== undefined) problems.push(refused);
      continue;
    }
    // The cited identifier decides the family; the record's other identifiers join only where they agree with it.
    const all = recordIdentifiers(check);
    const cited = all.find(({ scheme }) => scheme === check.kind)!;
    let family: AtlasState["sourceFamilies"][number] | undefined = familiesNaming(cited)[0];
    if (family === undefined) {
      family = all.map(familiesNaming).find((named) => named.length > 0)?.[0];
    }
    const identifiers = all.filter((identifier) => {
      const named = familiesNaming(identifier);
      if (named.some((other) => other !== family)) return false;
      if (family === undefined) return true;
      const stored = family.identifiers.filter(({ scheme }) => scheme === identifier.scheme);
      return stored.length === 0 || stored.some(({ value }) => value === identifier.value);
    });
    if (!identifiers.some(({ scheme, value }) => scheme === cited.scheme && value === cited.value)) {
      views.push(view);
      problems.push({ code: "source_conflict", message: `${check.source} names a study record in the Atlas that its ` +
        "other identifiers contradict, so it cannot be bound." });
      continue;
    }
    const kind = family === undefined
      ? sourceKindOf(check)
      : (ATLAS_SOURCE_KINDS as readonly string[]).includes(family.sourceKind)
        ? family.sourceKind as AtlasSource["kind"]
        : undefined;
    if (kind === undefined) {
      views.push(view);
      problems.push({ code: "source_conflict", message: `${check.source}'s study record in the Atlas is of a kind an ` +
        "Atlas finding cannot bind." });
      continue;
    }
    identifiers.sort((left, right) => left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value));
    const same = planned.find((other) => (family !== undefined && other.familyId === family.familyId) ||
      other.source.identifiers.some((identifier) => identifiers.some(({ scheme, value }) =>
        scheme === identifier.scheme && value === identifier.value)));
    if (same !== undefined) {
      // One paper cited twice: one source, with every identifier that agrees, under the more serious status.
      const merged = new Map(same.source.identifiers.map((identifier) => [identifier.scheme, identifier]));
      for (const identifier of identifiers) if (!merged.has(identifier.scheme)) merged.set(identifier.scheme, identifier);
      same.source.identifiers = [...merged.values()]
        .sort((left, right) => left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value));
      if (severity(check.retraction.status) < severity(same.check.retraction.status)) {
        same.check = check;
        same.source.check = checkOf(check, confirm);
      }
      views.push({ ...view, sameAs: same.first });
      continue;
    }
    planned.push({
      source: { kind, identifiers, check: checkOf(check, confirm) },
      familyId: family?.familyId,
      first: check.source,
      check,
    });
    views.push(view);
  }
  for (const { check, first } of planned) {
    if (check.needsConfirmation) confirmations.push(confirmationOf(first, check));
  }
  return {
    status: checks.status,
    views,
    sources: planned.map(({ source }) => source).slice(0, 10),
    confirmations,
    problems,
  };
}

/** What the owner sees of a source's check. */
function sourceView(check: AtlasSourceCheck): SourceCheckView {
  const base: SourceCheckView = {
    source: check.source,
    outcome: check.outcome,
    identifier: check.outcome === "invalid_identifier" ? null : `${check.kind}:${check.identifier}`,
    provider: check.outcome === "invalid_identifier" ? null : check.provider,
    title: null,
    year: null,
    retraction: null,
    notices: 0,
    needsConfirmation: false,
    binding: null,
    sameAs: null,
    errorCode: check.outcome === "unavailable" ? check.errorCode : null,
  };
  return check.outcome !== "checked" ? base : {
    ...base,
    title: check.record.title ?? null,
    year: check.record.year ?? null,
    retraction: check.retraction.status,
    notices: check.retraction.notices.length,
    needsConfirmation: check.needsConfirmation,
    binding: check.binding,
  };
}

/** Why a source that is not checked cannot be bound; undefined while it only waits for its provider. */
function refusal(check: AtlasSourceCheck): { code: CheckProblemCode; message: string } | undefined {
  if (check.outcome === "invalid_identifier") {
    return { code: "source_refused", message: `${check.source} is not a DOI, PMID, PMCID or NCT number the checks can ` +
      "take: leave it out." };
  }
  if (check.outcome === "not_found") {
    return { code: "source_refused", message: `${check.source}: ${check.provider} has no public record of ` +
      `${check.identifier}, so it is refused.` };
  }
  return undefined;
}

/** What a flagged source asks of the owner before it is bound. */
function confirmationOf(source: string, check: AtlasCheckedSource): string {
  const status = check.retraction.status;
  const notices = check.retraction.notices.length;
  return status === "retracted"
    ? `${source} is retracted, so it would be bound as context only, never as support`
    : status === "unknown"
      ? `no provider could read ${source}'s retraction status`
      : `${source} has ${status === "expression_of_concern" ? "an expression of concern" : "a correction or update"} ` +
        `(${notices} notice${notices === 1 ? "" : "s"}), which the owner's confirm records as cleared`;
}

/**
 * The sources of an edit after acceptance: each source family its latest version binds and the owner keeps, checked
 * again by its own DOI, PMID, PMCID or NCT number and bound by its own identifiers, so it joins that family.
 */
function planFamilySources(
  checks: AtlasSourceChecks,
  families: ReadonlyArray<AtlasState["sourceFamilies"][number]>,
  confirm: boolean,
): SourcePlan {
  const plan: SourcePlan = { status: checks.status, views: [], sources: [], confirmations: [], problems: [] };
  checks.sources.forEach((check, index) => {
    const family = families[index]!;
    plan.views.push(sourceView(check));
    const refused = refusal(check);
    if (refused !== undefined) plan.problems.push(refused);
    if (check.outcome !== "checked") return;
    const identifiers = family.identifiers.flatMap((identifier) => {
      const parsed = atlasSourceIdentifierSchema.safeParse(identifier);
      return parsed.success ? [parsed.data] : [];
    }).sort((left, right) => left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value));
    if (!(ATLAS_SOURCE_KINDS as readonly string[]).includes(family.sourceKind) || identifiers.length === 0) {
      plan.problems.push({ code: "source_conflict", message: `${check.source}'s study record in the Atlas cannot be ` +
        "bound again by an Atlas finding." });
      return;
    }
    plan.sources.push({ kind: family.sourceKind as AtlasSource["kind"], identifiers, check: checkOf(check, confirm) });
    if (check.needsConfirmation) plan.confirmations.push(confirmationOf(check.source, check));
  });
  return plan;
}

function checkOf(check: AtlasCheckedSource, confirm: boolean): AtlasSource["check"] {
  const year = check.record.year === undefined ? NaN : Number(check.record.year);
  return {
    provider: check.provider,
    title: storedTitle(check.record.title),
    publishedYear: Number.isInteger(year) && year >= 1500 && year <= 2200 ? year : null,
    retractionStatus: check.retraction.status,
    notices: storedNotices(check.retraction.notices),
    ownerConfirmed: check.needsConfirmation && confirm,
    envelopeSha256: check.envelopeSha256,
    checkedAt: check.checkedAt,
  };
}

/** The identifier a stored source family is checked by again: its DOI first, then its PMID, PMCID or NCT number. */
function checkStringOf(family: AtlasState["sourceFamilies"][number]): string | undefined {
  for (const scheme of ["doi", "pmid", "pmcid", "nct"]) {
    const identifier = family.identifiers.find((candidate) => candidate.scheme === scheme);
    if (identifier !== undefined) return scheme === "pmid" ? `PMID:${identifier.value}` : identifier.value;
  }
  return undefined;
}

function sourcesSentence(plan: SourcePlan): string {
  if (plan.views.length === 0) return "Sources: none to check.";
  return `Sources: ${plan.views.map((view) => view.outcome === "checked"
    ? `${view.source} ${view.sameAs === null ? "" : `(the same paper as ${view.sameAs}) `}checked (${view.provider}` +
      `${view.year === null ? "" : `, ${view.year}`}, retraction status ${view.retraction})`
    : `${view.source} ${view.outcome.replace(/_/gu, " ")}${view.errorCode === null ? "" : ` (${view.errorCode})`}`)
    .join("; ")}.`;
}

function unavailableSources(plan: SourcePlan): string {
  return plan.views.filter(({ outcome }) => outcome === "unavailable")
    .map((view) => `${view.source}: ${view.provider} ${view.errorCode}`).join("; ") || "a provider";
}

// Canonical state -------------------------------------------------------------------------------------------------------

/** The current finding a card wording key re-checks: one with a version of that card or accepted key, not withdrawn. */
function recheckTarget(state: AtlasState, wordingKey: string): string | undefined {
  return state.findings.find((finding) => finding.versions.at(-1)?.status !== "invalidated" &&
    finding.versions.some((version) => version.cardWordingKey === wordingKey || version.acceptedWordingKey === wordingKey))
    ?.publicNumber;
}

function numberIn(state: AtlasState, findingId: string): string {
  return state.findings.find((finding) => finding.findingId === findingId)?.publicNumber ?? findingId;
}

function standingLink(state: AtlasState, from: string, to: string) {
  const ids = [from, to].map((number) => state.findings.find(({ publicNumber }) => publicNumber === number)?.findingId);
  return state.links.find((link) => !link.withdrawn && ids.includes(link.fromFindingId) && ids.includes(link.toFindingId) &&
    link.fromFindingId !== link.toFindingId);
}

function partnersOf(state: AtlasState, findingId: string): string[] {
  return [findingId, ...state.links.filter((link) => !link.withdrawn && link.relation === "contradicts" &&
    (link.fromFindingId === findingId || link.toFindingId === findingId))
    .map((link) => link.fromFindingId === findingId ? link.toFindingId : link.fromFindingId)];
}

/**
 * The labels the pure atlasLabelOf() gives these findings in the state, or in the state after one change: a link
 * added or withdrawn, a finding withdrawn, or a finding's bases changed.
 */
function labelsWith(
  state: AtlasState,
  findingIds: readonly string[],
  change: {
    addLink?: { fromFindingId: string; toFindingId: string; relation: AtlasLinkRelation };
    withdrawLink?: string;
    invalidate?: string;
    bases?: Record<string, readonly string[]>;
  } = {},
): Map<string, AtlasLabel> {
  const context = {
    findings: state.findings.map((finding) => ({
      findingId: finding.findingId,
      latestStatus: change.invalidate === finding.findingId ? "invalidated" : finding.versions.at(-1)!.status,
      verifiedBases: [...(change.bases?.[finding.findingId] ?? finding.versions.at(-1)!.content.verifiedBases)],
    })),
    links: [
      ...state.links.map((link) => ({
        fromFindingId: link.fromFindingId,
        toFindingId: link.toFindingId,
        relation: link.relation,
        withdrawn: link.withdrawn || link.linkId === change.withdrawLink,
      })),
      ...(change.addLink === undefined ? [] : [{ ...change.addLink, withdrawn: false }]),
    ],
  };
  const labels = new Map<string, AtlasLabel>();
  for (const id of findingIds) {
    try {
      labels.set(id, atlasLabelOf(id, context));
    } catch {
      // A finding whose label context the state does not hold in full has no label here.
    }
  }
  return labels;
}

/**
 * The Atlas as the link checks read it: each finding by its number, a lead when its latest version has no verified
 * basis (as the writer and the label rules read it), withdrawn when its latest version is invalidated; and the stored
 * links, with every standing replaces link (findings outside the state by their ID) for the cycle check.
 */
function linkStateOf(state: AtlasState): AtlasLinkState {
  const name = (findingId: string) => {
    const number = state.findings.find((finding) => finding.findingId === findingId)?.publicNumber;
    return number ?? `id:${findingId}`;
  };
  return {
    findings: state.findings.map((finding) => {
      const latest = finding.versions.at(-1)!;
      return {
        number: finding.publicNumber,
        entryKind: latest.content.verifiedBases.length === 0 ? "lead" as const : "finding" as const,
        withdrawn: latest.status === "invalidated",
      };
    }),
    links: [
      ...state.links.map((link) => ({
        from: name(link.fromFindingId), relation: link.relation, to: name(link.toFindingId), withdrawn: link.withdrawn,
      })),
      ...(state.replacesLinks ?? []).map((link) => ({
        from: name(link.fromFindingId), relation: "replaces" as const, to: name(link.toFindingId), withdrawn: false,
      })),
    ],
  };
}

// Views ---------------------------------------------------------------------------------------------------------------

function intentView(intent: AtlasIntentView): z.infer<typeof intentViewSchema> {
  return {
    intentId: intent.intentId,
    kind: intent.intentKind,
    atlasNumber: intent.publicNumber,
    status: intent.status,
    createdAt: intent.createdAt,
    failureCode: intent.failureCode,
    explanation: intent.failureCode === null ? null : ATLAS_FAILURE_EXPLANATIONS[intent.failureCode],
  };
}

function outcomeOf(status: "PENDING" | "COMPLETED" | "FAILED"): AtlasReviewOutcome {
  return status === "COMPLETED" ? "finding_written" : status === "FAILED" ? "finding_write_failed" : "finding_queued";
}

function statusSentence(status: AtlasStatus): string {
  if (status.version === null) {
    return status.intent?.status === "FAILED"
      ? `The Atlas writer refused ${status.atlasNumber}'s accept with ${status.intent.failureCode}: ` +
        `${status.intent.explanation}. Accept its card item again to retry under the same number.`
      : `${status.atlasNumber} waits for the Atlas writer (about 5 minutes)` +
        `${status.wording === null ? "" : `: "${clip(status.wording, 160)}"`}.`;
  }
  const links = status.links.filter(({ withdrawn }) => !withdrawn);
  const refused = status.intents.filter(({ status: state }) => state === "FAILED");
  const waiting = status.intents.filter(({ status: state }) => state === "PENDING");
  const removed = status.wordingRemoved;
  return `${status.atlasNumber}: ${status.entryKind === "lead" ? "a lead" : "a finding"}, labeled ${status.label}, ` +
    `version ${status.version}${status.topic === null ? "" : `, filed under ${status.topic.label}`}` +
    `${status.researchCheckedOn === null ? "" : `, research of ${status.researchCheckedOn}`}: "${clip(status.wording ?? "", 200)}"` +
    `${status.kind === null ? "" : `. It is of kind ${status.kind}, direction ${status.direction}, about ` +
      `${status.subject} (${status.subjectType})`}` +
    `${removed.length === 0 ? "" : `. Wording removed (decision 7) from ${removed.length === 1 ? "version" : "versions"} ` +
      `${listed(removed.map(String))}`}` +
    `${links.length === 0 ? "" : `. Links: ${links.map((link) => link.direction === "from"
      ? `${link.relation} ${link.other}` : `${link.other} ${link.relation} it`).join(", ")}`}` +
    `${waiting.length === 0 ? "" : `. Waiting for the writer: ${waiting.map(({ kind }) => kind).join(", ")}`}` +
    `${refused.length === 0 ? "" : `. Refused by the writer: ${refused.map((intent) =>
      `${intent.kind} (${intent.failureCode}: ${intent.explanation})`).join("; ")}`}.`;
}

/** Whether an erasure takes the question too, or who else still uses it (decision 7). */
function questionSentence(question: AtlasQuestionUse): string {
  if (question.erased) return "Its question was erased before.";
  if (question.erasable) return "Its question is erased too: no other finding or research uses it.";
  const users = [
    ...(question.sharedWith.length === 0 ? [] : [`${listed(question.sharedWith)} ` +
      `${question.sharedWith.length === 1 ? "answers" : "answer"} it too`]),
    ...(question.nonAtlasUses === 0 ? [] : ["research the Atlas did not write uses it"]),
  ];
  return `Its question stays, because ${users.join(" and ")}` +
    (question.sharedWith.length === 0 ? "." : `: erasing the wording of ${question.sharedWith.length === 1
      ? "that finding" : "those findings"} too takes the question with the last of them, if it could identify someone.`);
}

/** The cards in the findings inbox that still hold an erased finding's original wording, and what removes it. */
function holdingSentences(holding: { decided: number[]; undecided: Array<{ card: number; finding: number }> } | undefined):
  string[] {
  if (holding === undefined) {
    return ["The findings inbox could not be read just now to name the cards that still hold the original wording; " +
      "inspect the finding again later to see them."];
  }
  const sentences: string[] = [];
  if (holding.decided.length > 0) {
    const cards = holding.decided.map(publicFindingsCardId);
    const one = cards.length === 1;
    sentences.push(`${listed(cards)} still ${one ? "holds" : "hold"} the original wording in the findings inbox: ` +
      `forget_card ${one ? cards[0] : "on each"} removes it, with what ties ${one ? "the card" : "each card"} to its ` +
      "contributor.");
  }
  if (holding.undecided.length > 0) {
    const items = holding.undecided.map(({ card, finding }) => `${publicFindingsCardId(card)} finding ${finding}`);
    const one = items.length === 1;
    sentences.push(`${listed(items)} ${one ? "has" : "have"} the same question and claim and ${one ? "waits" : "wait"} ` +
      `for a decision: accepting ${one ? "it" : "them"} would bring the wording back, so reject ${one ? "it" : "them"}, ` +
      "or forget the card.");
  }
  return sentences;
}

/** What a forget_card call removed and found, in sentences. */
function forgetSentences(forget: AtlasForget, report: CardForgetReport): string[] {
  const sentences: string[] = [];
  const others = forget.cards.map(({ card }) => card).filter((card) => card !== forget.card);
  if (!forget.threadKnown && report.strippedNow.includes(report.card)) {
    sentences.push(`${forget.card} has no research-thread key (it was saved before keys were kept), so the person's ` +
      "other saves cannot be found from it: they name each card.");
  } else if (others.length > 0) {
    sentences.push(`Its research thread also saved ${listed(others)}, forgotten with it.`);
  }
  if (forget.laterSavesDeletedOn.length > 0) {
    const one = forget.laterSavesDeletedOn.length === 1;
    sentences.push(`The person's later ${one ? "save" : "saves"} on ${listed(forget.laterSavesDeletedOn)} ` +
      `${one ? "is" : "are"} deleted.`);
  }
  if (forget.decisionsRemoved > 0) {
    sentences.push(forget.decisionsRemoved === 1
      ? "1 decision row is removed, with any private reason you gave on it."
      : `${forget.decisionsRemoved} decision rows are removed, with any private reasons you gave on them.`);
  }
  if ((forget.youtubeFindingsDeleted ?? 0) > 0) {
    sentences.push(forget.youtubeFindingsDeleted === 1
      ? "Its 1 held YouTube finding is deleted too."
      : `Its ${forget.youtubeFindingsDeleted} held YouTube findings are deleted too.`);
  }
  if (forget.findingsOnlyFromThese.length > 0) {
    const one = forget.findingsOnlyFromThese.length === 1;
    sentences.push(`${listed(forget.findingsOnlyFromThese)} came only from ${others.length === 0 ? "this card" :
      "these cards"} and ${one ? "stays" : "stay"} in the Atlas while ${one ? "it is" : "they are"} valid.`);
  }
  if (forget.findingsAlsoElsewhere.length > 0) {
    sentences.push(`${listed(forget.findingsAlsoElsewhere)} ${forget.findingsAlsoElsewhere.length === 1 ? "is" : "are"} ` +
      "also named by another card's decision.");
  }
  // Decision 171 (notice version 4): the card leaves the Atlas unless the owner has already accepted its findings.
  if (forget.publicationsWithdrawn.length > 0) {
    const one = forget.publicationsWithdrawn.length === 1;
    sentences.push(`${one ? "Its publication" : "Its publications"} ${listed(forget.publicationsWithdrawn)} ` +
      `${one ? "leaves" : "leave"} the Atlas pages, ${one ? "its" : "their"} published fields erased.`);
  }
  if (forget.publicationsKept.length > 0) {
    const one = forget.publicationsKept.length === 1;
    sentences.push(`${listed(forget.publicationsKept)}, which you accepted, ${one ? "stays" : "stay"} published, ` +
      "without anything that ties it to the card.");
  }
  if (forget.refiled.length > 0) {
    sentences.push(`Other people's later saves were re-filed as cards of their own: ${forget.refiled.map(({ from, card }) =>
      `${card} (from ${from})`).join(", ")}; they were told the card they joined, so a request from one of them ` +
      "names that card.");
  }
  if (report.strippedNow.length > 0) {
    const one = report.strippedNow.length === 1;
    sentences.push(`On GitHub ${one ? "the card's" : "each card's"} comments are deleted, its title and body replaced ` +
      "by a tombstone, its labels removed, and it is closed as not planned and locked.");
  }
  if (forget.findingsOnlyFromThese.length + forget.findingsAlsoElsewhere.length > 0) {
    sentences.push("If the request also says a finding is wrong, review it as a correction (edit_finding or " +
      "withdraw_finding); if one could identify the person, use eraseWording.");
  }
  return sentences;
}

/** How GitHub answers for forgotten cards: 410 for one deleted, 404 for one it has no record of. */
function goneWords(report: CardForgetReport): string {
  const of = (status: 404 | 410) => report.cards.filter(({ github }) => github === status)
    .map(({ number }) => publicFindingsCardId(number));
  return [
    ...(of(410).length === 0 ? [] : [`410 (deleted) for ${listed(of(410))}`]),
    ...(of(404).length === 0 ? [] : [`404 (not found) for ${listed(of(404))}`]),
  ].join(" and ");
}

function comparePublicNumbers(left: string, right: string): number {
  return Number(left.slice(2)) - Number(right.slice(2));
}

/** A list in words: "A", "A and B", "A, B and C". */
function listed(items: readonly string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function cardView(loaded: LoadedCard, findings: CardItem[], state: AtlasState, held: HeldRead): AtlasCardView {
  const { card } = loaded;
  const id = publicFindingsCardId(card.number);
  const leads = card.record.card.open_leads.map((_, index) =>
    cardItem(card, id, { itemKind: "open_lead", itemNumber: index + 1 })!);
  const declared = card.record.card.public_value;
  return {
    card: id,
    state: card.state,
    cardSha256: loaded.cardSha256,
    question: card.record.card.question,
    usualAnswer: card.record.card.usual_answer,
    publicValue: declared === undefined ? null : {
      scope: declared.scope,
      whoElse: declared.who_else ?? null,
      whatItChanges: declared.what_it_changes ?? null,
    },
    savedOn: card.record.stamp.saved_at.slice(0, 10),
    saves: 1 + card.occurrences.length,
    beyondQuickAnswer: isBeyondQuickAnswer(card.labels),
    topic: card.record.card.topic === undefined ? null
      : { key: card.record.card.topic.key, label: card.record.card.topic.label },
    items: [...findings, ...leads].map((item) => {
      const recheckOf = item.ref.itemKind === "finding" ? recheckTarget(state, item.cardWordingKey) : undefined;
      const decision = decisionFor(loaded.decisions, item.ref);
      const declared = cardFieldsOf(item);
      return {
        item: item.ref.itemKind === "finding" ? "finding" as const : "lead" as const,
        number: item.ref.itemNumber,
        text: item.text,
        certainty: item.certainty,
        appliesTo: item.appliesTo,
        ...fieldsView(declared),
        numbers: declared.kind === undefined ? null : item.finding?.numbers?.length ?? 0,
        searches: declared.searchScope ?? [],
        sources: item.sources,
        youtubeVideos: item.youtubeVideos,
        save: item.save,
        bases: item.bases,
        wouldBecome: wouldBecome(item, recheckOf),
        recheckOf: recheckOf ?? null,
        decision: decision === undefined ? null : {
          decision: decision.decision,
          atlasNumber: decision.publicNumber,
          decidedAt: decision.decidedAt,
          intentStatus: decision.intent?.status ?? null,
          failureCode: decision.intent?.failureCode ?? null,
        },
      };
    }),
    githubSynced: loaded.synced,
    heldYoutubeFindings: held.status === "read" ? held.findings.slice(0, 1_000).map(heldView) : null,
  };
}

/** A card's held YouTube findings as its view reads them, or why they cannot be shown (owner answer 173). */
type HeldRead =
  | { status: "read"; findings: HeldYouTubeFinding[] }
  | { status: "unavailable" }
  | { status: "not_configured" };

function heldView(finding: HeldYouTubeFinding): NonNullable<AtlasCardView["heldYoutubeFindings"]>[number] {
  return {
    finding: finding.findingNumber,
    claim: finding.claim,
    certainty: finding.certainty,
    appliesTo: finding.appliesTo,
    whyNotUsual: finding.whyNotUsual,
    whatWouldChangeIt: finding.whatWouldChangeIt,
    kind: finding.kind ?? null,
    subject: finding.subject ?? null,
    direction: finding.direction ?? null,
    tags: finding.tags,
    bases: finding.verifiedBases,
    savedOn: finding.savedAt.slice(0, 10),
    deletedOn: finding.expiresAt.slice(0, 10),
  };
}

/** The card view's lines on its held YouTube findings: each with the day it is deleted. */
function heldLines(held: HeldRead): string {
  if (held.status === "unavailable") return "\nIts held YouTube findings could not be read just now.";
  if (held.status === "not_configured" || held.findings.length === 0) return "";
  return "\nHeld YouTube findings, kept apart from the card for your review: never decided, accepted or published, " +
    "and deleted 30 days after their save.\n" + held.findings.map((finding) => `  Finding ${finding.findingNumber} ` +
      `of the card as checked, saved ${decisionDate(finding.savedAt)}: ${clip(finding.claim, 160)} (${finding.certainty}) ` +
      `-> deleted on ${decisionDate(finding.expiresAt)}.`).join("\n");
}

/** What move_youtube_findings did with one card, in a sentence or two. */
function moveSentence(report: YouTubeFindingsMoveReport): string {
  const id = publicFindingsCardId(report.card);
  const kept = report.findings.filter(({ expiresAt }) => expiresAt !== null);
  const gone = report.findings.length - kept.length;
  const counted = (count: number, one: string) => count === 1 ? `1 ${one}` : `${count} ${one}s`;
  const days = [...new Set(kept.map(({ expiresAt }) => decisionDate(expiresAt!)))];
  const done = [
    ...(kept.length === 0 ? [] : [`moved ${counted(kept.length, "finding")} drawn from YouTube comments into the ` +
      `30-day hold (deleted on ${listed(days)})`]),
    ...(gone === 0 ? [] : [`deleted ${counted(gone, "finding")} whose 30 days had ended`]),
  ];
  const rewritten = [
    ...(report.cardRewritten ? ["the card"] : []),
    ...(report.laterSavesRewritten === 0 ? [] : [counted(report.laterSavesRewritten, "later save")]),
  ];
  const which = listed(rewritten);
  const one = rewritten.length === 1 && (report.cardRewritten || report.laterSavesRewritten === 1);
  switch (report.status) {
    case "moved":
      return [
        `${id}: ${done.join(" and ")}.`,
        ...(rewritten.length === 0 ? [] : [`${which.charAt(0).toUpperCase()}${which.slice(1)} now ` +
          `${one ? "reads" : "read"} as saved today without them.`]),
        ...(report.laterSavesDeleted === 0 ? [] : [`${counted(report.laterSavesDeleted, "later save")} that rested ` +
          `only on YouTube comments ${report.laterSavesDeleted === 1 ? "was" : "were"} deleted.`]),
      ].join(" ");
    case "nothing_to_move":
      return `${id} holds no finding drawn from YouTube comments; nothing was changed.`;
    case "not_found":
      return `${id} is not a findings card in the library; nothing was changed.`;
    case "unreadable":
      return `${id}'s record, or a later save's, does not read as the library saved it (it may have been edited in ` +
        "GitHub); nothing was changed.";
    case "every_finding_youtube":
      return `Every finding on ${id} rests on YouTube comments, so a card saved today would not be saved as a card; ` +
        "nothing was changed. forget_card removes the card, or delete its issue in GitHub.";
    case "decisions_in_the_way":
      return `${id} has decisions on ${report.decidedFindings.length === 1 ? "finding" : "findings"} ` +
        `${listed(report.decidedFindings.map(String))}, which moving its findings drawn from YouTube comments would ` +
        "remove or renumber; nothing was changed.";
    case "published_in_the_way":
      return `${id} has publications for ${report.publishedFindings.length === 1 ? "finding" : "findings"} ` +
        `${listed(report.publishedFindings.map(String))}, which name findings by their place on the card, even ` +
        "after withdrawal; nothing was changed.";
    case "incomplete":
      return `${id}: the database or GitHub failed part way${done.length === 0 ? "" : ` after it ${done.join(" and ")}`}` +
        `${rewritten.length === 0 ? "" : `, and rewrote ${listed(rewritten)}`}. Call move_youtube_findings for it ` +
        "again; what is done is not redone.";
  }
}

function heldNotConfigured(nothing: string): AtlasReviewResult {
  return errorOf("review_service_unavailable", "The held YouTube findings are not configured: they need the review " +
    `database's functions of migration 0019. ${nothing}.`);
}

function checksOf(input: {
  item: string;
  wouldBecome: WouldBecome | null;
  focus?: CardItem;
  recheckOf: string | undefined;
  community?: AtlasCommunityCheck;
  plan?: SourcePlan;
  sourceChecks?: AtlasSourceChecks;
  privacy: Array<{ field: string; reasonCode: string }>;
  numberProblems?: AtlasNumbersProblem[];
  linkProblems?: AtlasLinkProblem[];
  problems: Array<{ code: CheckProblemCode; message: string }>;
  topic?: AtlasChecks["topic"];
  relatedTopics: AtlasState["topics"];
}): AtlasChecks {
  return {
    item: input.item,
    wouldBecome: input.wouldBecome,
    save: input.focus?.save ?? null,
    bases: input.focus?.bases ?? [],
    recheckOf: input.recheckOf ?? null,
    community: input.community?.state ?? null,
    sourceStatus: input.sourceChecks?.status ?? (input.plan === undefined ? null : "passed"),
    sources: (input.plan?.views ?? []).slice(0, 10),
    numbers: (input.numberProblems ?? []).map(({ at, code, message }) => ({ at, code, message })),
    privacy: input.privacy,
    links: (input.linkProblems ?? []).map(({ code, message }) => ({
      code, writerCode: LINK_PROBLEM_WRITER_CODES[code] ?? null, message,
    })),
    problems: input.problems,
    needsConfirmation: [
      ...(input.community?.needsConfirmation === true ? [communityConfirmation()] : []),
      ...(input.plan?.confirmations ?? []),
    ],
    topic: input.topic ?? null,
    relatedTopics: input.relatedTopics.slice(0, 50).map(({ canonicalKey, label }) => ({ key: canonicalKey, label })),
  };
}

function checksNotPassed(item: string, checks: AtlasChecks): AtlasReviewResult {
  const lines = [
    ...checks.problems.map(({ message }) => message),
    ...checks.numbers.map(({ message }) => message),
    ...checks.privacy.map(({ field, reasonCode }) => `${field} does not pass the privacy screen (${reasonCode}): ` +
      "reword it in general terms, with no card id, link or personal detail."),
    ...checks.links.map(({ message, writerCode }) => `${message}${writerCode === null ? "" : ` (the writer would ` +
      `record ${writerCode})`}`),
  ];
  return {
    ok: false,
    outcome: "checks_not_passed",
    checks,
    text: `Not recorded: ${item} did not pass the checks.\n${lines.join("\n")}`,
  };
}

function tryAgainLater(reason: z.infer<typeof atlasRetrySchema>["reason"], message: string): AtlasReviewResult {
  return { ok: false, outcome: "try_again_later", retry: { reason, message }, text: message };
}

function syncSentence(sync: { synced: boolean }): string {
  return sync.synced ? "" : " GitHub was not updated yet; the next list or inspect posts the decision to the card.";
}

function markerOf(decision: AtlasDecisionView): FindingsDecisionMarker {
  return {
    itemKind: decision.itemKind,
    itemNumber: decision.itemNumber,
    decision: decision.decision,
    publicNumber: decision.publicNumber,
    decidedAt: decision.decidedAt,
  };
}

function reviewedLabels(labels: readonly string[]): string[] {
  return [...new Set([...labels.filter((label) => label !== "pending-review"), "reviewed"])];
}

// Publications (decision 171) -------------------------------------------------------------------------------------------

/** The card's decisions with a new one in place of the same item's. */
function withDecision(decisions: readonly AtlasDecisionView[], decision: AtlasDecisionView): AtlasDecisionView[] {
  return [...decisions.filter((stored) => stored.itemKind !== decision.itemKind || stored.itemNumber !== decision.itemNumber),
    decision];
}

/**
 * What a call changed of the Atlas's publications, in a sentence: the state each moved to, or, for an erasure, that its
 * published fields are erased. Empty when it changed none.
 */
function publicationSentence(changed: readonly AtlasPublicationView[], kind: "moved" | "erased" = "moved"): string {
  if (changed.length === 0) return "";
  const words = (row: AtlasPublicationView) => kind === "erased"
    ? "has its published fields erased"
    : row.state === "accepted" ? `is accepted as ${row.atlasNumber}, without the label`
      : row.state === "edited" ? `is edited: the pages show ${row.atlasNumber} in its latest version`
        : row.state === "rejected" ? "is rejected: it leaves the Atlas pages"
          : row.state === "withdrawn" ? "is withdrawn from the Atlas pages" : `is ${row.state}`;
  const unique = [...new Map(changed.map((row) => [row.publicationNumber, row])).values()];
  return ` In the Atlas, ${unique.map((row) => `publication ${row.publicationNumber} ` +
    `(${publicFindingsCardId(row.cardNumber)} finding ${row.findingNumber}) ${words(row)}`).join("; ")}.`;
}

// Errors ----------------------------------------------------------------------------------------------------------------

function errorOf(code: AtlasReviewErrorCode, message: string): AtlasReviewResult {
  return { ok: false, error: { code, message }, text: message };
}

function cardChanged(cardId: string, current: string): AtlasReviewResult {
  return errorOf("card_changed", `${cardId} changed since it was inspected (a later save, or an edit in GitHub): ` +
    `inspect it again; its cardSha256 is now ${current}. Nothing was recorded.`);
}

function itemNotFound(cardId: string, ref: ItemRef): AtlasReviewResult {
  return errorOf("item_not_found", `${cardId} has no ${ref.itemKind === "finding" ? "finding" : "open lead"} ` +
    `${ref.itemNumber}.`);
}

function versionStale(publicNumber: string, latest: number): AtlasReviewResult {
  return errorOf("version_stale", `${publicNumber}'s latest version is ${latest}: inspect it and send that version. ` +
    "Nothing was recorded.");
}

function withdrawnConflict(publicNumber: string, hint = ""): AtlasReviewResult {
  return errorOf("decision_conflict", `${publicNumber} is withdrawn, so it takes no further change.${hint}`);
}

function errorResult(error: unknown): AtlasReviewResult {
  if (error instanceof AtlasPublicationError) {
    return errorOf("invalid_request", "The publication store refused the request as not valid; nothing was changed.");
  }
  if (error instanceof AtlasReviewError) {
    switch (error.code) {
      case "DECISION_CONFLICT":
      case "INTENT_CONFLICT":
        return errorOf("decision_conflict", "The card item or finding already has a different decision; inspect it " +
          "again. Nothing was recorded.");
      case "FINDING_NOT_FOUND":
        return errorOf("finding_not_found", "No accepted finding has that number; nothing was recorded.");
      case "INPUT_INVALID":
        return errorOf("invalid_request", "The review store refused the decision as not valid; nothing was recorded.");
    }
  }
  if (error instanceof GitHubApiError) {
    return error.retryable
      ? tryAgainLater("github_unavailable", "The findings repository could not be reached just now; try again in a " +
        "few minutes. Nothing was recorded.")
      : errorOf("review_service_unavailable", "The findings repository could not be reached with the App's token; " +
        "nothing was recorded.");
  }
  return errorOf("review_service_unavailable", "The Atlas review failed closed; nothing was recorded.");
}

// Text and paging -------------------------------------------------------------------------------------------------------

function normalizedNumber(value: string): string {
  return value.trim().toUpperCase();
}

/** A text on one line, cut to at most `max` characters (code points), with an ellipsis when cut. */
function clip(text: string, max: number): string {
  const points = [...text.replace(/\s+/gu, " ").trim()];
  return points.length <= max ? points.join("") : `${points.slice(0, max - 1).join("")}…`;
}

/** The research day of a save: the day its research was finalized, in UTC. */
function researchDayOf(stamp: FindingsStamp): string {
  const finalized = Date.parse(stamp.research.finalized_at);
  return new Date(Number.isFinite(finalized) ? finalized : Date.parse(stamp.saved_at)).toISOString().slice(0, 10);
}

const safeVersion = (value: string) => /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u.test(value) ? value : "unknown";
const safeBuild = (value: string) => /^(?:[0-9a-f]{7,40}|unknown)$/u.test(value) ? value : "unknown";

/** Which AskRigor made the research, from the save's stamp (without its save time, surface, model or catalog hash). */
function madeWithOf(stamp: FindingsStamp): AtlasMadeWith {
  const word = (value: string | undefined) => value !== undefined && /^[a-z_]{1,40}$/u.test(value) ? value : null;
  return {
    askrigorVersion: safeVersion(stamp.askrigor_version),
    build: safeBuild(stamp.askrigor_build),
    protocols: stamp.protocols.slice(0, 4).map(({ name, version, sha256 }) => ({ name, version, sha256 })),
    depth: word(stamp.research.depth),
    status: word(stamp.research.status),
  };
}

const LIST_PAGE = 10;

/** A card's place in the list: beyond-quick-answer first, then the oldest save, then the issue number. */
interface CursorKey {
  b: 0 | 1;
  s: string;
  n: number;
}

function cursorKeyOf(labels: readonly string[], record: FindingsRecord, number: number): CursorKey {
  return { b: isBeyondQuickAnswer(labels) ? 0 : 1, s: record.stamp.saved_at, n: number };
}

function compareCursorKeys(left: CursorKey, right: CursorKey): number {
  return left.b - right.b || Date.parse(left.s) - Date.parse(right.s) || left.n - right.n;
}

function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

/** The key a cursor names; null for a cursor list_findings did not make. */
function decodeCursor(cursor: string): CursorKey | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { b, s, n, ...rest } = value as Record<string, unknown>;
    return Object.keys(rest).length === 0 && (b === 0 || b === 1) && typeof s === "string" &&
        Number.isFinite(Date.parse(s)) && typeof n === "number" && Number.isSafeInteger(n) && n >= 1
      ? { b, s, n }
      : null;
  } catch {
    return null;
  }
}
