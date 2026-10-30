import {
  ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL,
  ATLAS_PUBLICATION_HOLD_REASONS,
  ATLAS_PUBLICATION_STATES,
  ATLAS_PUBLICATION_WITHDRAWN_REASONS,
  atlasPublicationOrder,
  type AtlasDecisionView,
  type AtlasIntentView,
  type AtlasPublicationState,
  type AtlasPublicationStore,
  type AtlasPublicationView,
  type AtlasReviewStore,
  type AtlasStateReader,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import {
  findingsCardNumber,
  isSetAside,
  type FindingsCardInbox,
} from "../findings/github-findings-review.js";
import { publicFindingsCardId } from "../findings/github-findings.js";
import {
  CARD_PUBLICATION_PROBLEMS,
  FINDING_LEFT_OUT_REASONS,
  decidedPublicationState,
  planCardPublication,
  type CardPublicationProblem,
  type DecidedPublicationState,
} from "./publication.js";

/**
 * The owner's publication actions on review_research_contribution (decision 171, sections 4B and 4F; the connector
 * stays at 33 tools): list_publications lists the Atlas's publications by state, with the cards whose publishing at
 * their save did not complete; unpublish_finding takes one down by its P number, with the owner's private reason;
 * publish_cards publishes chosen cards (the owner's own research saved before publishing began, or a card whose
 * publishing failed), the owner's choice being the consent, so the account checks do not apply; set_aside_cards labels
 * cards set-aside and withdraws their publications. They share the findings actions' switch and owner authorization.
 */

export const ATLAS_PUBLICATION_ACTIONS = ["list_publications", "unpublish_finding", "publish_cards", "set_aside_cards"] as const;
export type AtlasPublicationAction = typeof ATLAS_PUBLICATION_ACTIONS[number];
export const ATLAS_PUBLICATION_OUTCOMES = [
  "publications_listed", "publication_withdrawn", "cards_published", "cards_set_aside",
] as const;
export type AtlasPublicationOutcome = typeof ATLAS_PUBLICATION_OUTCOMES[number];
export const ATLAS_PUBLICATION_ERROR_CODES = ["publication_not_found"] as const;

/** The most cards publish_cards takes in one call, each read from GitHub. */
export const PUBLISH_CARDS_PER_CALL = 20;
/** The most cards set_aside_cards names in one call, and the most it labels in one call (it resumes on the next). */
export const SET_ASIDE_CARDS_PER_CALL = 1_000;
export const SET_ASIDE_LABELS_PER_CALL = 50;
const LIST_PAGE = 20;

const publicationNumberSchema = z.string().regex(/^P-[1-9][0-9]{3,}$/u);
const atlasNumberSchema = z.string().regex(/^F-[1-9][0-9]{3,}$/u);
const cardIdSchema = z.string().regex(/^ARF-[0-9]{4,}$/u);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

/** One publication as the owner's actions show it: its numbers, its state and why, and its claim, clipped. */
export const atlasPublicationItemSchema = z.object({
  publication: publicationNumberSchema,
  card: cardIdSchema,
  finding: z.number().int().min(1).max(5),
  state: z.enum(ATLAS_PUBLICATION_STATES),
  atlasNumber: atlasNumberSchema.nullable(),
  /** The published claim, clipped; null once its published fields are erased (decision 7). */
  claim: z.string().nullable(),
  heldBecause: z.array(z.enum(ATLAS_PUBLICATION_HOLD_REASONS)).nullable(),
  withdrawnBecause: z.enum(ATLAS_PUBLICATION_WITHDRAWN_REASONS).nullable(),
  publishedOn: daySchema,
  changedOn: daySchema,
}).strict();
export type AtlasPublicationItem = z.infer<typeof atlasPublicationItemSchema>;

export const atlasPublicationsSchema = z.object({
  /** The publications listed, or changed by the call. */
  items: z.array(atlasPublicationItemSchema).max(1_000),
  /** publish_cards and set_aside_cards: what each card named became. */
  cards: z.array(z.object({
    card: cardIdSchema,
    outcome: z.enum([
      "published", "already_published", "not_published", "set_aside", "already_set_aside", "not_a_card", "unreadable",
      "waiting",
    ]),
    // Five, the frozen tool lists' bound (owner answer 189a), though owner answer 196a left four problems.
    problems: z.array(z.enum(CARD_PUBLICATION_PROBLEMS)).max(5),
    leftOut: z.array(z.object({
      finding: z.number().int().min(1).max(5),
      reason: z.enum(FINDING_LEFT_OUT_REASONS),
    }).strict()).max(5),
    publications: z.array(publicationNumberSchema).max(5),
  }).strict()).max(SET_ASIDE_CARDS_PER_CALL),
  /** list_publications: the next page's cursor. */
  nextCursor: z.string().nullable(),
  /**
   * list_publications, first page: open cards saved for publishing at their save that have no publication (their
   * publishing failed), for publish_cards; null when GitHub could not be read just now.
   */
  waitingToPublish: z.array(cardIdSchema).max(1_000).nullable(),
}).strict();
export type AtlasPublications = z.infer<typeof atlasPublicationsSchema>;

export interface AtlasPublicationRequest {
  action: AtlasPublicationAction;
  publicationState?: AtlasPublicationState;
  cursor?: string;
  publication?: string;
  reason?: string;
  cards?: string[];
  cardsFrom?: string;
  cardsTo?: string;
  topicKey?: string;
  topicLabel?: string;
}

export interface AtlasPublicationResult {
  ok: boolean;
  text: string;
  outcome?: AtlasPublicationOutcome;
  error?: { code: typeof ATLAS_PUBLICATION_ERROR_CODES[number] | "invalid_request"; message: string };
  publications?: AtlasPublications;
}

export interface AtlasPublicationReviewDependencies {
  publications: AtlasPublicationStore;
  store: Pick<AtlasReviewStore, "inspectCards" | "inspectIntents">;
  reader: AtlasStateReader;
  inbox: Pick<FindingsCardInbox, "readCard" | "openCards" | "repositoryIssues" | "setAside">;
  now: () => Date;
}

const STATE_WORDS: Record<AtlasPublicationState, string> = {
  unreviewed: "published, not checked by supervisors yet",
  accepted: "accepted",
  edited: "accepted with the owner's wording",
  rejected: "rejected",
  withdrawn: "withdrawn",
  held: "held for the owner",
};
const HELD_WORDS: Record<typeof ATLAS_PUBLICATION_HOLD_REASONS[number], string> = {
  email_address: "an email address",
  phone_number: "a phone number",
  messaging_handle: "a messaging handle",
  card_reference: "a findings card's number",
  youtube_link: "a YouTube link",
};
const WITHDRAWN_WORDS: Record<typeof ATLAS_PUBLICATION_WITHDRAWN_REASONS[number], string> = {
  card_forgotten: "its card was deleted",
  card_set_aside: "its card was set aside",
  owner_unpublished: "you unpublished it",
  card_replaced: "a later save of the same research replaced its card",
};
const PROBLEM_WORDS: Record<CardPublicationProblem, string> = {
  not_free_contributor: "it was saved in paid private mode, so its findings wait for your acceptance",
  notice_not_current: "its account had not accepted the current notice",
  set_aside: "it is set aside",
  not_public: "it does not declare its findings public",
};
const LEFT_OUT_WORDS: Record<typeof FINDING_LEFT_OUT_REASONS[number], string> = {
  youtube_comments: "drawn from YouTube comments",
  rejected: "rejected",
  not_publishable: "its stored fields do not make a publication",
};

export class AtlasPublicationReview {
  constructor(private readonly deps: AtlasPublicationReviewDependencies) {}

  async run(request: AtlasPublicationRequest): Promise<AtlasPublicationResult> {
    switch (request.action) {
      case "list_publications": return await this.list(request);
      case "unpublish_finding": return await this.unpublish(request);
      case "publish_cards": return await this.publishCards(request);
      case "set_aside_cards": return await this.setAsideCards(request);
    }
  }

  // list_publications -------------------------------------------------------------------------------------------------

  private async list(request: AtlasPublicationRequest): Promise<AtlasPublicationResult> {
    const before = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    if (before === null) return invalid("The cursor is not one list_publications returned.");
    const rows = await this.deps.publications.inspect({
      ...(request.publicationState === undefined ? {} : { states: [request.publicationState] }),
      ...(before === undefined ? {} : { before }),
      limit: LIST_PAGE + 1,
    });
    const shown = rows.slice(0, LIST_PAGE);
    const nextCursor = rows.length > LIST_PAGE ? encodeCursor(atlasPublicationOrder(shown.at(-1)!.publicationNumber)) : null;
    const waitingToPublish = before === undefined ? await this.waitingToPublish() : [];
    const publications: AtlasPublications = {
      items: shown.map(itemOf),
      cards: [],
      nextCursor,
      waitingToPublish,
    };
    const scope = request.publicationState === undefined ? "" : ` ${request.publicationState}`;
    const lines = [
      ...(shown.length === 0 ? [`No${scope} publication${before === undefined ? "" : " on this page"}.`]
        : shown.map((row) => publicationLine(row))),
      ...(nextCursor === null ? [] : ["More publications: call list_publications with the nextCursor."]),
      ...(waitingToPublish === null
        ? ["The findings repository could not be read just now, so the cards whose publishing did not complete are " +
          "not listed."]
        : waitingToPublish.length === 0 ? [] : [`Saved for publishing but not published (its publishing did not ` +
          `complete): ${waitingToPublish.join(", ")}. publish_cards publishes ${waitingToPublish.length === 1 ? "it" : "them"}.`]),
    ];
    return { ok: true, outcome: "publications_listed", publications, text: lines.join("\n") };
  }

  /** Open cards whose marker says their account's card is published at its save, with no publication yet. */
  private async waitingToPublish(): Promise<string[] | null> {
    let open: Awaited<ReturnType<FindingsCardInbox["openCards"]>>;
    try {
      open = await this.deps.inbox.openCards();
    } catch {
      return null;
    }
    const marked = open.filter((card) => card.marks?.atlasPublish === true && !isSetAside(card.labels))
      .map(({ number }) => number);
    if (marked.length === 0) return [];
    const published = new Set<number>();
    for (let start = 0; start < marked.length; start += 100) {
      const rows = await this.deps.publications.inspect({ cardNumbers: marked.slice(start, start + 100), limit: 500 });
      for (const row of rows) published.add(row.cardNumber);
    }
    return marked.filter((number) => !published.has(number)).sort((left, right) => left - right)
      .map(publicFindingsCardId);
  }

  // unpublish_finding -------------------------------------------------------------------------------------------------

  private async unpublish(request: AtlasPublicationRequest): Promise<AtlasPublicationResult> {
    const number = request.publication!.trim().toUpperCase();
    const [row] = await this.deps.publications.inspect({ publicationNumbers: [number], limit: 1 });
    if (row === undefined) {
      return { ok: false, error: { code: "publication_not_found", message: `No publication has the number ${number}.` },
        text: `No publication has the number ${number}.` };
    }
    const name = `${number} (${publicFindingsCardId(row.cardNumber)} finding ${row.findingNumber})`;
    if (row.state === "withdrawn" || row.state === "rejected") {
      return {
        ok: true,
        outcome: "publication_withdrawn",
        publications: { items: [itemOf(row)], cards: [], nextCursor: null, waitingToPublish: null },
        text: `${name} is already off the Atlas pages: ${row.state === "rejected" ? "you rejected it"
          : WITHDRAWN_WORDS[row.withdrawnBecause!]}. Nothing was changed.`,
      };
    }
    const [withdrawn] = await this.deps.publications.withdraw({
      reason: "owner_unpublished",
      publicationNumbers: [number],
      ownerReason: request.reason!,
      withdrawnAt: this.deps.now().toISOString(),
    });
    const changed = withdrawn ?? row;
    const staying = row.atlasNumber !== null && (row.state === "accepted" || row.state === "edited")
      ? ` ${row.atlasNumber} stays in the Atlas; withdraw_finding takes it down.`
      : "";
    return {
      ok: true,
      outcome: "publication_withdrawn",
      publications: { items: [itemOf(changed)], cards: [], nextCursor: null, waitingToPublish: null },
      text: `Unpublished ${name}: it leaves the Atlas pages, and your reason stays private.${staying}`,
    };
  }

  // publish_cards -----------------------------------------------------------------------------------------------------

  private async publishCards(request: AtlasPublicationRequest): Promise<AtlasPublicationResult> {
    let ownerTopic: { key: string; label: string } | undefined;
    if (request.topicKey !== undefined) {
      const state = await this.deps.reader.readAtlasState({ topicKeys: [request.topicKey] });
      const stored = state.topics.find(({ canonicalKey }) => canonicalKey === request.topicKey);
      const queued = (await this.deps.store.inspectIntents(null)).find((intent) => intent.status === "PENDING" &&
        intent.payload.kind === "accept" && intent.payload.topic.key === request.topicKey && intent.payload.topic.label !== null);
      const label = stored?.label ?? (queued?.payload.kind === "accept" ? queued.payload.topic.label : null) ?? request.topicLabel;
      if (label === undefined) return invalid(`${request.topicKey} is not an Atlas topic or a stored research frontier's ` +
        "topic yet: give topicLabel with topicKey.");
      ownerTopic = { key: request.topicKey, label };
    }
    const numbers = [...new Set(request.cards!.map((card) => findingsCardNumber(card)!))];
    const cards: AtlasPublications["cards"] = [];
    const items: AtlasPublicationItem[] = [];
    const lines: string[] = [];
    for (const number of numbers) {
      const id = publicFindingsCardId(number);
      const lookup = await this.deps.inbox.readCard(number);
      if (lookup.status !== "found") {
        const outcome = lookup.status === "not_found" ? "not_a_card" as const : "unreadable" as const;
        cards.push({ card: id, outcome, problems: [], leftOut: [], publications: [] });
        lines.push(outcome === "not_a_card"
          ? `${id} is not a findings card in the library.`
          : `${id}'s record, or a later save's, does not read as the library saved it, so it is not published.`);
        continue;
      }
      const card = lookup.card;
      const decided = await this.decidedStates(number);
      const plan = planCardPublication({
        record: card.record,
        setAside: isSetAside(card.labels),
        route: { route: "owner", paidPrivate: card.marks.paidPrivate },
        decided,
        ...(ownerTopic === undefined ? {} : { ownerTopic }),
      });
      const leftOut = plan.leftOut.map(({ findingNumber, reason }) => ({ finding: findingNumber, reason }));
      if (plan.problems.length > 0 || plan.drafts.length === 0) {
        cards.push({ card: id, outcome: "not_published", problems: plan.problems, leftOut, publications: [] });
        lines.push(`${id} is not published: ${plan.problems.length > 0
          ? listed(plan.problems.map((problem) => PROBLEM_WORDS[problem]))
          : `every finding is left out (${leftOutWords(leftOut)})`}.`);
        continue;
      }
      if (ownerTopic !== undefined && card.record.card.topic === undefined) {
        const live = (await this.deps.publications.inspect({ cardNumbers: [number], limit: 500 })).filter((row) =>
          row.cardSha256 === card.record.card_sha256 && row.published?.topic === null &&
          row.state !== "withdrawn" && row.state !== "rejected" &&
          plan.drafts.some(({ findingNumber }) => findingNumber === row.findingNumber));
        if (live.length > 0) {
          const withdrawn = await this.deps.publications.withdraw({
            reason: "owner_unpublished",
            publicationNumbers: live.map(({ publicationNumber }) => publicationNumber),
            ownerReason: `filed under ${ownerTopic.key} (owner answer 191b)`,
            withdrawnAt: this.deps.now().toISOString(),
          });
          lines.push(`${id}: ${withdrawn.map(({ publicationNumber }) => publicationNumber).join(", ")} withdrawn as ` +
            "owner_unpublished to file under the topic; publishing again follows.");
        }
      }
      const rows = await this.deps.publications.publish({
        cardNumber: number,
        cardSha256: card.record.card_sha256,
        findings: plan.drafts,
        publishedAt: this.deps.now().toISOString(),
        revive: true,
      });
      const fresh = rows.filter(({ outcome }) => outcome !== "existing");
      cards.push({
        card: id,
        outcome: fresh.length > 0 ? "published" : "already_published",
        problems: [],
        leftOut,
        publications: rows.map(({ publicationNumber }) => publicationNumber),
      });
      items.push(...rows.map(itemOf));
      if (ownerTopic !== undefined) {
        const declared = card.record.card.topic;
        lines.push(declared === undefined
          ? `${id}: topic label used: ${ownerTopic.label} (${ownerTopic.key}).`
          : `${id} keeps its declared topic: ${declared.label} (${declared.key}).`);
      }
      lines.push(`${id}: ${rows.map((row) => `finding ${row.findingNumber} ${row.outcome === "existing"
        ? `was already ${row.publicationNumber} (${STATE_WORDS[row.state]})`
        : `${row.outcome === "revived" ? "published again" : "published"} as ${row.publicationNumber} ` +
          `(${STATE_WORDS[row.state]}${row.heldBecause === null || row.state !== "held" ? ""
            : `: it holds ${listed(row.heldBecause.map((reason) => HELD_WORDS[reason]))}`})`}`).join("; ")}` +
        `${leftOut.length === 0 ? "" : `; left out: ${leftOutWords(leftOut)}`}.`);
    }
    return {
      ok: true,
      outcome: "cards_published",
      publications: { items, cards, nextCursor: null, waitingToPublish: null },
      text: lines.join("\n"),
    };
  }

  /** The publication state each decided finding of a card takes, from its decision and its F number's intents. */
  private async decidedStates(cardNumber: number): Promise<Map<number, DecidedPublicationState>> {
    const decisions = (await this.deps.store.inspectCards([cardNumber]))
      .filter((decision: AtlasDecisionView) => decision.itemKind === "finding");
    const numbers = [...new Set(decisions.flatMap(({ publicNumber }) => publicNumber === null ? [] : [publicNumber]))];
    const intents: readonly AtlasIntentView[] = numbers.length === 0 ? [] : await this.deps.store.inspectIntents(numbers);
    const decided = new Map<number, DecidedPublicationState>();
    for (const decision of decisions) {
      const state = decidedPublicationState(decision, intents);
      if (state !== undefined) decided.set(decision.itemNumber, state);
    }
    return decided;
  }

  // set_aside_cards ---------------------------------------------------------------------------------------------------

  private async setAsideCards(request: AtlasPublicationRequest): Promise<AtlasPublicationResult> {
    const numbers = request.cards !== undefined
      ? [...new Set(request.cards.map((card) => findingsCardNumber(card)!))].sort((left, right) => left - right)
      : rangeOf(findingsCardNumber(request.cardsFrom!)!, findingsCardNumber(request.cardsTo!)!);
    const issues = new Map((await this.deps.inbox.repositoryIssues())
      .filter((issue) => issue.card !== undefined)
      .map((issue) => [issue.number, issue]));
    const cards: AtlasPublications["cards"] = [];
    const labeled: number[] = [];
    const remaining: number[] = [];
    let labelsWritten = 0;
    for (const number of numbers) {
      const id = publicFindingsCardId(number);
      const issue = issues.get(number);
      if (issue === undefined) {
        cards.push({ card: id, outcome: "not_a_card", problems: [], leftOut: [], publications: [] });
        continue;
      }
      if (isSetAside(issue.labels)) {
        labeled.push(number);
        cards.push({ card: id, outcome: "already_set_aside", problems: [], leftOut: [], publications: [] });
        continue;
      }
      if (labelsWritten >= SET_ASIDE_LABELS_PER_CALL) {
        remaining.push(number);
        cards.push({ card: id, outcome: "waiting", problems: [], leftOut: [], publications: [] });
        continue;
      }
      await this.deps.inbox.setAside(number);
      labelsWritten += 1;
      labeled.push(number);
      cards.push({ card: id, outcome: "set_aside", problems: [], leftOut: [], publications: [] });
    }
    // Every set-aside card's publications leave the pages, those of cards labeled before included.
    const withdrawn: AtlasPublicationView[] = [];
    for (let start = 0; start < labeled.length; start += ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL) {
      withdrawn.push(...await this.deps.publications.withdraw({
        reason: "card_set_aside",
        cardNumbers: labeled.slice(start, start + ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL),
        withdrawnAt: this.deps.now().toISOString(),
      }));
    }
    for (const entry of cards) {
      entry.publications = withdrawn.filter((row) => publicFindingsCardId(row.cardNumber) === entry.card)
        .map(({ publicationNumber }) => publicationNumber);
    }
    const count = (outcome: string) => cards.filter((card) => card.outcome === outcome).map(({ card }) => card);
    const lines = [
      ...(count("set_aside").length === 0 ? [] : [`Set aside ${listed(count("set_aside"))}.`]),
      ...(count("already_set_aside").length === 0 ? [] : [`Already set aside: ${listed(count("already_set_aside"))}.`]),
      ...(count("not_a_card").length === 0 ? [] : [`Not findings cards (or forgotten): ${listed(count("not_a_card"))}.`]),
      withdrawn.length === 0
        ? "No publication of theirs was on the Atlas pages."
        : `Withdrawn from the Atlas pages: ${listed(withdrawn.map((row) => `${row.publicationNumber} ` +
          `(${publicFindingsCardId(row.cardNumber)} finding ${row.findingNumber})`))}.`,
      ...(remaining.length === 0 ? [] : [`${remaining.length} more card${remaining.length === 1 ? " waits" : "s wait"}: ` +
        `this call labels at most ${SET_ASIDE_LABELS_PER_CALL}, so send the same call again to set aside the rest.`]),
    ];
    return {
      ok: true,
      outcome: "cards_set_aside",
      publications: { items: withdrawn.map(itemOf), cards, nextCursor: null, waitingToPublish: null },
      text: lines.join("\n"),
    };
  }
}

// Helpers -------------------------------------------------------------------------------------------------------------

function itemOf(row: AtlasPublicationView): AtlasPublicationItem {
  return {
    publication: row.publicationNumber,
    card: publicFindingsCardId(row.cardNumber),
    finding: row.findingNumber,
    state: row.state,
    atlasNumber: row.atlasNumber,
    claim: row.published === null ? null : clip(row.published.claim, 160),
    heldBecause: row.state === "held" ? row.heldBecause : null,
    withdrawnBecause: row.withdrawnBecause,
    publishedOn: row.publishedAt.slice(0, 10),
    changedOn: row.stateChangedAt.slice(0, 10),
  };
}

function publicationLine(row: AtlasPublicationView): string {
  const why = row.state === "held" && row.heldBecause !== null
    ? `: it holds ${listed(row.heldBecause.map((reason) => HELD_WORDS[reason]))}`
    : row.state === "withdrawn" && row.withdrawnBecause !== null ? `: ${WITHDRAWN_WORDS[row.withdrawnBecause]}` : "";
  return `${row.publicationNumber} (${publicFindingsCardId(row.cardNumber)} finding ${row.findingNumber}` +
    `${row.atlasNumber === null ? "" : `, ${row.atlasNumber}`}), ${STATE_WORDS[row.state]}${why}` +
    `${row.published === null ? " (its published fields are erased)" : `: ${clip(row.published.claim, 120)}`}`;
}

function leftOutWords(leftOut: ReadonlyArray<{ finding: number; reason: typeof FINDING_LEFT_OUT_REASONS[number] }>): string {
  return listed(leftOut.map(({ finding, reason }) => `finding ${finding}, ${LEFT_OUT_WORDS[reason]}`));
}

function rangeOf(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function invalid(message: string): AtlasPublicationResult {
  return { ok: false, error: { code: "invalid_request", message }, text: message };
}

/** A list in words: "A", "A and B", "A, B and C". */
function listed(items: readonly string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** A text on one line, cut to at most `max` characters (code points), with an ellipsis when cut. */
function clip(text: string, max: number): string {
  const points = [...text.replace(/\s+/gu, " ").trim()];
  return points.length <= max ? points.join("") : `${points.slice(0, max - 1).join("")}…`;
}

/** list_publications' cursor: the last number shown, as p1003. */
function encodeCursor(order: number): string {
  return `p${order}`;
}

function decodeCursor(cursor: string): number | null {
  const match = /^p([1-9][0-9]{3,15})$/u.exec(cursor);
  return match === null ? null : Number(match[1]);
}
