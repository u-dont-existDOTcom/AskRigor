import {
  ATLAS_PUBLICATION_HOLD_REASONS,
  ATLAS_PUBLICATION_SCHEMA,
  ATLAS_VERIFIED_BASES,
  RESEARCH_USE_NOTICE_VERSION,
  atlasPublishedFindingSchema,
  type AtlasDecisionView,
  type AtlasIntentView,
  type AtlasPublicationDraft,
  type AtlasPublicationHoldReason,
  type AtlasPublicationStore,
  type AtlasPublicationView,
  type AtlasPublishedFinding,
} from "@askrigor/evidence-repository";

import { containsCardReference } from "../findings/acceptance-checks.js";
import { isYouTubeVideoId, topicKeyText, type StoredFinding } from "../findings/card.js";
import type {
  FindingsCardPublisher,
  FindingsRecord,
  FindingsSaveAccount,
  SavedFindingsCard,
} from "../findings/service.js";
import { contactDetailKinds, withoutDirectionControls } from "./contact-check.js";

/**
 * Publishing saved findings cards in the Atlas (decision 171, section 4B; owner answers 168a and "171 approved", 24 Oct
 * 2026): which cards and findings are published, what is published of each, and the save path's publisher. Every rule
 * here is an exact check: the account's mode and notice version, the card's set-aside label and its
 * public-value scope, the closed markers of a finding drawn from YouTube comments, and the structural contact-details
 * check (contact-check.ts). What a finding means stays the research AI's declaration and the owner's review.
 */

/** Why a card is not published, each an exact check. */
export const CARD_PUBLICATION_PROBLEMS = [
  /** The card was not saved in free contributor mode (a paid private card waits for the owner's acceptance). */
  "not_free_contributor",
  /** The saving account had not accepted the current free contributor notice. */
  "notice_not_current",
  /** The card carries the set-aside label. */
  "set_aside",
  /** The card does not declare its findings public (owner answer 156a). */
  "not_public",
] as const;
export type CardPublicationProblem = typeof CARD_PUBLICATION_PROBLEMS[number];

/** Why one finding of an eligible card is left out. */
export const FINDING_LEFT_OUT_REASONS = [
  /** Drawn from YouTube comments, by the rule withoutYouTubeData applies (owner answer 170). */
  "youtube_comments",
  /** The owner rejected it, so it is not published (the owner's choice of card only). */
  "rejected",
  /** Its stored fields do not make a publication (a record that does not read as the card schema has it). */
  "not_publishable",
] as const;
export type FindingLeftOutReason = typeof FINDING_LEFT_OUT_REASONS[number];

/**
 * Who asks for a card to be published: the save path, right after a confirmed save, with the saving account; or the
 * owner, naming the card (publish_cards), whose choice is the consent for the owner's own cards, so the notice check
 * does not apply. A card whose marker says it was saved in paid private mode is still refused: its
 * findings are published only after the owner accepts them (the privacy page's wording).
 */
export type CardPublicationRoute =
  | { route: "save"; account: FindingsSaveAccount | undefined }
  | { route: "owner"; paidPrivate: boolean };

/** The card-level checks: an empty list when the card's eligible findings are published. */
export function cardPublicationProblems(
  record: FindingsRecord,
  setAside: boolean,
  route: CardPublicationRoute,
): CardPublicationProblem[] {
  const problems: CardPublicationProblem[] = [];
  if (route.route === "save") problems.push(...accountPublicationProblems(route.account));
  if (route.route === "owner" && route.paidPrivate) problems.push("not_free_contributor");
  if (setAside) problems.push("set_aside");
  // A card saved before cards declared whether their findings help anyone else has no declaration: the owner naming
  // it is that choice (owner answer 182a, the owner's earlier cards). A card declared personal only never publishes.
  const declared = record.card.public_value?.scope;
  if (declared === undefined ? route.route !== "owner" : declared !== "public") problems.push("not_public");
  return problems;
}

/**
 * The saving account's checks: free contributor mode and the current notice (RESEARCH_USE_NOTICE_VERSION, never a
 * literal: the notice that says cards are published as soon as they are saved). A dev account's cards publish like
 * everyone's (owner answer 196a, 29 Oct 2026): a regression run switches its card saving off instead.
 */
export function accountPublicationProblems(account: FindingsSaveAccount | undefined): CardPublicationProblem[] {
  if (account === undefined || account.mode !== "FREE_CONTRIBUTOR") return ["not_free_contributor"];
  return account.noticeVersion === RESEARCH_USE_NOTICE_VERSION ? [] : ["notice_not_current"];
}

/**
 * Whether a stored finding is drawn from YouTube comments, by the rule withoutYouTubeData applies at the save (owner
 * answer 170): a YouTube video among its sources (counted as youtube_videos once its id is left out), the
 * community_checked tag, or a comment audit among its signed bases. It also covers cards saved before that rule.
 */
export function drawnFromYouTubeComments(finding: StoredFinding): boolean {
  return (finding.youtube_videos ?? 0) > 0 || finding.sources.some(isYouTubeVideoId) ||
    finding.tags.includes("community_checked") || (finding.verified_bases ?? []).includes("comment_audit");
}

/**
 * What the Atlas publishes of a card's finding (findingNumber from 1): the card's topic, or the owner's when the card
 * declares none (owner answer 191b); the finding's claim, certainty, applies_to, kind, subject, subject type, direction,
 * numbers block (the raw counts and follow-up; rates, NNT and NNH are worked out when the pages render), searches, source identifiers,
 * why_not_usual and what_would_change_it; its verified bases; the day the card was saved; and the AskRigor version from
 * its stamp. Never the ARF number, the account or contributor, the thread key, the answer quote, the surface, the
 * reported model, a YouTube video id or count. Every text is written without text-direction controls, which could show
 * reversed characters as an address the contact-details check never sees (contact-check.ts). Undefined when the card has
 * no such finding or its fields do not make a publication.
 */
export function publishedFindingOf(record: FindingsRecord, findingNumber: number,
  ownerTopic?: NonNullable<AtlasPublishedFinding["topic"]>): AtlasPublishedFinding | undefined {
  const finding = record.card.findings[findingNumber - 1];
  if (!Number.isSafeInteger(findingNumber) || findingNumber < 1 || finding === undefined) return undefined;
  const topic = record.card.topic ?? ownerTopic;
  const plain = withoutDirectionControls;
  const parsed = atlasPublishedFindingSchema.safeParse({
    schema: ATLAS_PUBLICATION_SCHEMA,
    topic: topic === undefined ? null : { key: topic.key, label: plain(topic.label) },
    claim: plain(finding.claim),
    certainty: finding.certainty,
    applies_to: plain(finding.applies_to),
    kind: finding.kind ?? null,
    subject: finding.subject === undefined ? null : plain(finding.subject),
    subject_type: finding.subject_type ?? null,
    direction: finding.direction ?? null,
    numbers: finding.numbers === undefined ? null : finding.numbers.map((entry) => ({
      outcome: plain(entry.outcome),
      better: entry.better,
      option: plain(entry.option),
      option_events: entry.option_events,
      option_total: entry.option_total,
      comparator: plain(entry.comparator),
      comparator_events: entry.comparator_events,
      comparator_total: entry.comparator_total,
      follow_up: plain(entry.follow_up),
      ...(entry.harms_none_found === undefined ? {} : { harms_none_found: entry.harms_none_found }),
    })),
    searches: finding.searches === undefined ? null : finding.searches.map((search) => ({
      database: search.database,
      query: plain(search.query),
      ...(search.date_range === undefined ? {} : { date_range: { start: search.date_range.start, end: search.date_range.end } }),
    })),
    sources: finding.sources.filter((source) => !isYouTubeVideoId(source)),
    why_not_usual: plain(finding.why_not_usual),
    what_would_change_it: plain(finding.what_would_change_it),
    verified_bases: ATLAS_VERIFIED_BASES.filter((basis) => (finding.verified_bases ?? []).includes(basis)),
    saved_on: record.stamp.saved_at.slice(0, 10),
    askrigor_version: /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u.test(record.stamp.askrigor_version)
      ? record.stamp.askrigor_version
      : "unknown",
  });
  return parsed.success ? parsed.data : undefined;
}

// The Atlas's own guard against a YouTube link in a text it keeps (atlasText in @askrigor/evidence-repository).
const YOUTUBE_REFERENCE = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/iu;

/**
 * Every text a publication shows, by field: the topic (its key read as words, as the card's privacy screen reads it),
 * the claim, whom it applies to, the subject, each figure's labels, each search's query, why it is not the usual answer
 * and what would change it. Source identifiers are identifiers, not text.
 */
export function publishedTexts(published: AtlasPublishedFinding): Array<[string, string]> {
  return [
    ...(published.topic === null ? [] : [
      ["topic.label", published.topic.label] as [string, string],
      ["topic.key", topicKeyText(published.topic.key)] as [string, string],
    ]),
    ["claim", published.claim],
    ["applies_to", published.applies_to],
    ...(published.subject === null ? [] : [["subject", published.subject] as [string, string]]),
    ...(published.numbers ?? []).flatMap((entry, at): Array<[string, string]> => [
      [`numbers[${at}].outcome`, entry.outcome],
      [`numbers[${at}].option`, entry.option],
      [`numbers[${at}].comparator`, entry.comparator],
      [`numbers[${at}].follow_up`, entry.follow_up],
    ]),
    ...(published.searches ?? []).map((search, at): [string, string] => [`searches[${at}].query`, search.query]),
    ["why_not_usual", published.why_not_usual],
    ["what_would_change_it", published.what_would_change_it],
  ];
}

/**
 * Why a publication is held rather than shown, in ATLAS_PUBLICATION_HOLD_REASONS order: the contact-details check's
 * kinds (email address, phone number, messaging handle), a findings card's reference (ARF- and four digits or more), or
 * a YouTube link. Empty when it is shown.
 */
export function publicationHoldReasons(published: AtlasPublishedFinding): AtlasPublicationHoldReason[] {
  const found = new Set<AtlasPublicationHoldReason>();
  for (const [, text] of publishedTexts(published)) {
    for (const kind of contactDetailKinds(text)) found.add(kind);
    if (containsCardReference(text)) found.add("card_reference");
    if (YOUTUBE_REFERENCE.test(text)) found.add("youtube_link");
  }
  return ATLAS_PUBLICATION_HOLD_REASONS.filter((reason) => found.has(reason));
}

/** What a decided finding's publication becomes: accepted or edited with its F number, or rejected. */
export interface DecidedPublicationState {
  state: "accepted" | "edited" | "rejected";
  atlasNumber: string | null;
}

/**
 * The publication state the owner's decision on a card's finding gives it: rejected; edited when the F number's accept
 * took the owner's wording (editedAtAcceptance) or a revision of it is recorded and not refused; accepted otherwise (a
 * re-check takes the F number it re-checks). Undefined for an open lead's decision, which has no publication.
 */
export function decidedPublicationState(
  decision: Pick<AtlasDecisionView, "itemKind" | "decision" | "publicNumber">,
  intents: readonly Pick<AtlasIntentView, "intentKind" | "publicNumber" | "status" | "payload">[],
): DecidedPublicationState | undefined {
  if (decision.itemKind !== "finding") return undefined;
  if (decision.decision === "rejected" || decision.publicNumber === null) return { state: "rejected", atlasNumber: null };
  const number = decision.publicNumber;
  const edited = intents.some((intent) => intent.publicNumber === number && intent.status !== "FAILED" &&
    ((intent.payload.kind === "accept" && intent.payload.editedAtAcceptance) || intent.intentKind === "revise"));
  return { state: edited ? "edited" : "accepted", atlasNumber: number };
}

export interface CardPublicationPlan {
  /** The card-level checks it failed; when any, nothing is published. */
  problems: CardPublicationProblem[];
  /** The findings to publish, each with the state it starts in. */
  drafts: AtlasPublicationDraft[];
  /** The findings left out, with why. */
  leftOut: Array<{ findingNumber: number; reason: FindingLeftOutReason }>;
}

/**
 * The plan for publishing a card: its card-level checks, then, finding by finding, the YouTube rule, the projection and
 * the hold check. A finding the owner has decided (the owner's choice of an older card) starts in its decided state, or
 * is left out when rejected; any other starts unreviewed, or held when its text holds contact details.
 */
export function planCardPublication(input: {
  record: FindingsRecord;
  setAside: boolean;
  route: CardPublicationRoute;
  /** The owner's decisions on the card's findings, by finding number. */
  decided?: ReadonlyMap<number, DecidedPublicationState>;
  /** publish_cards only: a topic for a card that declares none. */
  ownerTopic?: NonNullable<AtlasPublishedFinding["topic"]>;
}): CardPublicationPlan {
  const problems = cardPublicationProblems(input.record, input.setAside, input.route);
  if (problems.length > 0) return { problems, drafts: [], leftOut: [] };
  const drafts: AtlasPublicationDraft[] = [];
  const leftOut: CardPublicationPlan["leftOut"] = [];
  input.record.card.findings.forEach((finding, index) => {
    const findingNumber = index + 1;
    if (drawnFromYouTubeComments(finding)) {
      leftOut.push({ findingNumber, reason: "youtube_comments" });
      return;
    }
    const decided = input.decided?.get(findingNumber);
    if (decided?.state === "rejected") {
      leftOut.push({ findingNumber, reason: "rejected" });
      return;
    }
    const published = publishedFindingOf(input.record, findingNumber, input.ownerTopic);
    if (published === undefined) {
      leftOut.push({ findingNumber, reason: "not_publishable" });
      return;
    }
    const held = publicationHoldReasons(published);
    if (decided !== undefined && (input.ownerTopic === undefined || input.record.card.topic !== undefined || held.length === 0)) {
      drafts.push({ findingNumber, state: decided.state, atlasNumber: decided.atlasNumber, heldBecause: null, published });
      return;
    }
    drafts.push(held.length === 0
      ? { findingNumber, state: "unreviewed", atlasNumber: null, heldBecause: null, published }
      : { findingNumber, state: "held", atlasNumber: null, heldBecause: held, published });
  });
  return { problems, drafts, leftOut };
}

/**
 * The save path's publisher (FindingsSaveService calls it right after a confirmed save, without waiting for it): it
 * withdraws the unreviewed and held publications of the cards the save replaced (a corrected answer's findings, not the
 * replaced ones, are what stays: owner decision Q9), then publishes the card's eligible findings when the save made the
 * card (a later save joining an open card publishes nothing of its own). Publishing is idempotent by the card's digest,
 * so a retried save publishes nothing twice; a failure is the owner's to retry with publish_cards.
 */
export class AtlasCardPublisher implements FindingsCardPublisher {
  private readonly now: () => Date;

  constructor(private readonly options: { store: AtlasPublicationStore; now?: () => Date }) {
    this.now = options.now ?? (() => new Date());
  }

  accountPublishes(account: FindingsSaveAccount | undefined): boolean {
    return accountPublicationProblems(account).length === 0;
  }

  async afterSave(saved: SavedFindingsCard): Promise<void> {
    let failure: unknown;
    if (saved.replacedCards.length > 0) {
      try {
        await this.options.store.withdraw({
          reason: "card_replaced",
          cardNumbers: saved.replacedCards,
          withdrawnAt: this.now().toISOString(),
        });
      } catch (error) {
        failure = error;
      }
    }
    if (saved.kind === "created") {
      const plan = planCardPublication({
        record: saved.record,
        setAside: saved.setAside,
        route: { route: "save", account: saved.account },
      });
      if (plan.problems.length === 0 && plan.drafts.length > 0) {
        await this.options.store.publish({
          cardNumber: saved.issueNumber,
          cardSha256: saved.record.card_sha256,
          findings: plan.drafts,
          publishedAt: this.now().toISOString(),
          revive: false,
        });
      }
    }
    if (failure !== undefined) throw failure;
  }
}

/**
 * The publication an accepted or edited finding gets when its card has none for it (a paid private card, whose
 * findings are published only after the owner accepts them, or one of the owner's own older cards that publish_cards
 * has not published): its decided state and F number, with the card's published fields, which its page does not show
 * (an accepted publication shows its F number's latest version). Undefined for a rejection, for a finding drawn from
 * YouTube comments (owner answers 170 and 173: never published), and for one whose stored fields do not make a
 * publication.
 */
export function decidedPublicationDraft(
  record: FindingsRecord,
  findingNumber: number,
  target: DecidedPublicationState,
): AtlasPublicationDraft | undefined {
  if (target.state === "rejected" || target.atlasNumber === null) return undefined;
  const finding = record.card.findings[findingNumber - 1];
  if (finding === undefined || drawnFromYouTubeComments(finding)) return undefined;
  const published = publishedFindingOf(record, findingNumber);
  return published === undefined ? undefined
    : { findingNumber, state: target.state, atlasNumber: target.atlasNumber, heldBecause: null, published };
}

/**
 * Brings a card's publications in line with the owner's decisions (accept, edit, reject) and erasures: each publication
 * of a decided finding that is not withdrawn takes its decided state, and one whose F number has a recorded erasure has
 * its published fields erased. Given the stored card, an accepted or edited finding of which the card has no
 * publication at all is published in its decided state (decidedPublicationDraft), unless the card is set aside; a
 * finding with a publication in any state, withdrawn or rejected included, gets no other. The review calls it after
 * each decision and on each read of the card, so a state the decision's own call did not move (the store answered with
 * an error) is moved, or a publication it did not make is made, by the next one. Returns what changed.
 */
export async function reconcileCardPublications(input: {
  store: AtlasPublicationStore;
  cardNumber: number;
  decisions: readonly AtlasDecisionView[];
  intentsOf: (publicNumbers: readonly string[]) => Promise<readonly AtlasIntentView[]>;
  at: string;
  /** The stored card, when the caller read it, so a decided finding without a publication gets one. */
  card?: { record: FindingsRecord; setAside: boolean };
}): Promise<AtlasPublicationView[]> {
  const rows = await input.store.inspect({ cardNumbers: [input.cardNumber], limit: 100 });
  const live = rows.filter((row) => row.state !== "withdrawn" && row.cardForgottenAt === null);
  const findingDecisions = input.decisions.filter((decision) => decision.itemKind === "finding");
  const unpublished = findingDecisions.filter((decision) => decision.decision !== "rejected" &&
    !rows.some((row) => row.findingNumber === decision.itemNumber));
  const creates = input.card !== undefined && !input.card.setAside && unpublished.length > 0;
  if ((live.length === 0 && !creates) || findingDecisions.length === 0) return [];
  const numbers = [...new Set(findingDecisions.flatMap(({ publicNumber }) => publicNumber === null ? [] : [publicNumber]))];
  const intents = numbers.length === 0 ? [] : await input.intentsOf(numbers);
  const changed: AtlasPublicationView[] = [];
  if (creates) {
    const drafts = unpublished.flatMap((decision) => {
      const target = decidedPublicationState(decision, intents);
      const draft = target === undefined ? undefined
        : decidedPublicationDraft(input.card!.record, decision.itemNumber, target);
      return draft === undefined ? [] : [draft];
    });
    if (drafts.length > 0) {
      changed.push(...(await input.store.publish({
        cardNumber: input.cardNumber,
        cardSha256: input.card!.record.card_sha256,
        findings: drafts,
        publishedAt: input.at,
        revive: false,
      })).filter(({ outcome }) => outcome === "published"));
    }
  }
  for (const decision of findingDecisions) {
    const target = decidedPublicationState(decision, intents);
    if (target === undefined) continue;
    const behind = live.some((row) => row.findingNumber === decision.itemNumber &&
      (row.state !== target.state || row.atlasNumber !== target.atlasNumber));
    if (behind) {
      changed.push(...await input.store.decide({
        cardNumber: input.cardNumber,
        findingNumber: decision.itemNumber,
        state: target.state,
        atlasNumber: target.atlasNumber,
        decidedAt: input.at,
      }));
    }
  }
  // The rows as they are now, the moves just made included.
  const current = new Map(rows.map((row) => [row.publicationNumber, row]));
  for (const row of changed) current.set(row.publicationNumber, row);
  const erased = new Set(intents.filter((intent) => intent.intentKind === "erase" && intent.status !== "FAILED")
    .map(({ publicNumber }) => publicNumber));
  for (const number of erased) {
    if ([...current.values()].some((row) => row.atlasNumber === number && row.textsErasedAt === null)) {
      changed.push(...await input.store.eraseTexts(number, input.at));
    }
  }
  return changed;
}
