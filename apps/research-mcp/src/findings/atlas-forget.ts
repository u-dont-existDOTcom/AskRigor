import {
  ATLAS_FORGET_CARDS_PER_CALL,
  ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL,
  type AtlasForgottenDecision,
  type AtlasPublicationStore,
  type AtlasPublicationView,
  type AtlasReviewStore,
} from "@askrigor/evidence-repository";

import { GitHubApiError } from "../lessons/github-app.js";
import type {
  FindingsCardInbox,
  FindingsCommentEntry,
  FindingsIssueStatus,
  FindingsRepositoryIssue,
} from "./github-findings-review.js";
import type { OccurrenceMetadata } from "./github-findings.js";
import type { FindingsRecord } from "./service.js";

/**
 * forget_card (owner decision 7; Atlas phase 2 design, section 4): what ties a card to its contributor is removed
 * whenever they ask, with no reason needed. The steps, all exact:
 *
 * 1. Find the person's saves by exact research-thread marker match: every card, open or closed, whose marker holds the
 *    named card's thread key (earlier replaced cards among them), and every later save (occurrence comment) on another
 *    card with that key. A tombstone an earlier call left lists the cards forgotten with it, so a call that resumes
 *    finds them too.
 * 2. Delete those cards' decision rows (forget_atlas_cards), the owner's private reasons with them; the findings
 *    accepted from them stay while they are valid. Their publications in the Atlas (decision 171) lose the card's
 *    digest, and each one not accepted is withdrawn with its published fields erased: the card leaves the Atlas unless
 *    the owner has already accepted its findings (notice version 4).
 * 3. Strip GitHub within the App's issues: write: re-file each other person's later save on those cards as a card of
 *    its own, delete the person's later saves on other cards, then, the named card last, delete each card's comments,
 *    replace its title and body with a tombstone, remove its labels, close it as not planned and lock it.
 *
 * Every read comes first: a later save on the person's cards that cannot be read (so cannot be re-filed) stops the call
 * with nothing changed. So does a named card holding later saves from other research threads, until the owner
 * confirms: their savers were told the card's id too, so the request may be one of theirs, which the id alone cannot
 * tell; the reply then names their re-filed cards.
 *
 * The owner then deletes the stripped issues in GitHub (choice 5a); a later call finds GitHub answering 404 or 410 for
 * each and reports the card forgotten. A call that fails part way is resumed by calling again: the named card keeps its
 * thread marker until it is stripped last, re-filing skips a save already re-filed (by its receipt hash), and deleting
 * what is gone counts as done.
 */

/** The person's card as GitHub now holds it: stripped and waiting for the owner, or gone. */
export type ForgottenCardState = "stripped" | 404 | 410;

export interface CardForgetReport {
  card: number;
  /** Whether the named card's research-thread key was known, so the person's other saves could be looked for. */
  threadKnown: boolean;
  /** The person's cards, ascending. */
  cards: Array<{ number: number; github: ForgottenCardState }>;
  /** The decision rows this call deleted. */
  decisions: AtlasForgottenDecision[];
  /**
   * The publications this call changed (decision 171): those not accepted are now withdrawn with their published fields
   * erased; the accepted ones stay, without the card's digest.
   */
  publications: AtlasPublicationView[];
  /** The cards on which this call deleted a later save of the person's. */
  savesDeleted: number[];
  /** Other people's later saves on the person's cards, re-filed as cards of their own by this call or an earlier one. */
  refiled: Array<{ from: number; card: number }>;
  /** The cards this call stripped. */
  strippedNow: number[];
  forgottenAt: string;
}

export type CardForgetOutcome =
  /** The issue is there but is neither a findings card nor a forgotten one. */
  | { kind: "not_a_card" }
  /** GitHub has no such issue (404), nothing names it, and no decision row did. */
  | { kind: "not_found" }
  /** A later save on the person's cards does not read, so it cannot be re-filed; nothing was changed. */
  | { kind: "unreadable_save"; card: number; commentId: number }
  /**
   * The named card holds later saves from other research threads, whose savers were told its id too, so the request
   * may be theirs: nothing was changed until the owner confirms.
   */
  | { kind: "needs_confirmation"; laterSaves: number }
  | { kind: "done"; report: CardForgetReport }
  /** GitHub failed part way; the report says what was done. The decision rows are deleted already. */
  | { kind: "github_failed"; report: CardForgetReport; error: GitHubApiError };

export interface CardForgetDependencies {
  store: Pick<AtlasReviewStore, "forgetCards">;
  inbox: FindingsCardInbox;
  /** The Atlas publications (decision 171); without them none is changed. */
  publications?: Pick<AtlasPublicationStore, "withdraw">;
}

/** How many cards' comments are read at once while looking for the person's later saves. */
const COMMENT_READS_AT_ONCE = 4;

export async function forgetCard(
  deps: CardForgetDependencies,
  cardNumber: number,
  now: Date,
  options: { confirmed: boolean },
): Promise<CardForgetOutcome> {
  const forgottenAt = now.toISOString();
  const issues = await deps.inbox.repositoryIssues();
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  const named = byNumber.get(cardNumber);
  const statuses = new Map<number, FindingsIssueStatus>();
  if (named === undefined) {
    const status = await deps.inbox.issueStatus(cardNumber);
    if (status === "present") return { kind: "not_a_card" };
    statuses.set(cardNumber, status);
  }

  // 1. The person's cards: the named one, each card a tombstone of theirs lists, and each card with their thread key.
  const cards = new Set([cardNumber]);
  const addListed = () => {
    for (let grown = true; grown;) {
      grown = false;
      for (const issue of issues) {
        if (issue.forgotten === undefined || !issue.forgotten.cards.some((listed) => cards.has(listed))) continue;
        for (const listed of issue.forgotten.cards) {
          if (!cards.has(listed)) {
            cards.add(listed);
            grown = true;
          }
        }
      }
    }
  };
  addListed();
  const thread = named?.card?.thread ??
    [...cards].map((number) => byNumber.get(number)?.card?.thread).find((key) => key !== undefined);
  if (thread !== undefined) {
    for (const issue of issues) if (issue.card?.thread === thread) cards.add(issue.number);
    addListed();
  }
  const ordered = [...cards].sort((left, right) => left - right);
  const live = ordered.filter((number) => byNumber.get(number)?.card !== undefined);
  for (const number of ordered) {
    if (!byNumber.has(number) && !statuses.has(number)) statuses.set(number, await deps.inbox.issueStatus(number));
  }

  // Their comments: on the person's cards every one goes, and other people's later saves are re-filed first; on other
  // cards, with the thread key known, the person's own later saves go.
  const own = (metadata: OccurrenceMetadata) => thread !== undefined && metadata.thread === thread;
  const filed = new Map(issues.flatMap((issue) => issue.card === undefined ? [] : [[issue.card.receipt_sha256, issue.number]]));
  const refiled: CardForgetReport["refiled"] = issues
    .filter((issue) => issue.card?.refiled_from !== undefined && cards.has(issue.card.refiled_from))
    .map((issue) => ({ from: issue.card!.refiled_from!, card: issue.number }));
  const toRefile: Array<{ from: number; record: FindingsRecord; metadata: OccurrenceMetadata }> = [];
  const commentsOf = new Map<number, number[]>();
  const liveEntries = await readComments(deps.inbox, live.map((number) => byNumber.get(number)!));
  for (const { issue, entries } of liveEntries) {
    for (const entry of entries) {
      if (entry.unreadableSave === true) return { kind: "unreadable_save", card: issue.number, commentId: entry.id };
      const save = entry.save;
      if (save === undefined || own(save.metadata) || filed.has(save.metadata.receipt_sha256)) continue;
      if (save.record === undefined) return { kind: "unreadable_save", card: issue.number, commentId: entry.id };
      toRefile.push({ from: issue.number, record: save.record, metadata: save.metadata });
    }
    commentsOf.set(issue.number, entries.map(({ id }) => id));
  }
  const laterSaves = toRefile.filter(({ from }) => from === cardNumber).length;
  if (laterSaves > 0 && !options.confirmed) return { kind: "needs_confirmation", laterSaves };
  const savesElsewhere: Array<{ card: number; commentId: number }> = [];
  if (thread !== undefined) {
    const others = issues.filter((issue) => issue.card !== undefined && !cards.has(issue.number) && issue.comments > 0);
    for (const { issue, entries } of await readComments(deps.inbox, others)) {
      for (const entry of entries) {
        if (entry.save !== undefined && own(entry.save.metadata)) {
          savesElsewhere.push({ card: issue.number, commentId: entry.id });
        }
      }
    }
  }

  // 2. The decision rows, the owner's private reasons with them; then the cards' publications (decision 171).
  const decisions: AtlasForgottenDecision[] = [];
  for (let start = 0; start < ordered.length; start += ATLAS_FORGET_CARDS_PER_CALL) {
    decisions.push(...await deps.store.forgetCards(ordered.slice(start, start + ATLAS_FORGET_CARDS_PER_CALL), forgottenAt));
  }
  const publications: AtlasPublicationView[] = [];
  if (deps.publications !== undefined) {
    for (let start = 0; start < ordered.length; start += ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL) {
      publications.push(...await deps.publications.withdraw({
        reason: "card_forgotten",
        cardNumbers: ordered.slice(start, start + ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL),
        withdrawnAt: forgottenAt,
      }));
    }
  }
  if (live.length === 0 && ordered.length === 1 && statuses.get(cardNumber) === 404 && decisions.length === 0 &&
    publications.length === 0 && refiled.length === 0) {
    return { kind: "not_found" };
  }

  // 3. GitHub, the named card last, so a call that fails part way still finds the thread key on it.
  const report: CardForgetReport = {
    card: cardNumber,
    threadKnown: thread !== undefined,
    cards: [],
    decisions,
    publications,
    savesDeleted: [],
    refiled,
    strippedNow: [],
    forgottenAt,
  };
  const state = (number: number): ForgottenCardState => {
    const status = statuses.get(number);
    return status === 404 || status === 410 ? status : "stripped";
  };
  try {
    for (const save of toRefile) {
      report.refiled.push({ from: save.from, card: await deps.inbox.refile({
        record: save.record, metadata: save.metadata, refiledFrom: save.from,
      }) });
    }
    for (const save of savesElsewhere) {
      await deps.inbox.deleteComment(save.commentId);
      report.savesDeleted.push(save.card);
    }
    const tombstone = { cards: ordered, forgotten_at: forgottenAt };
    for (const number of [...live.filter((card) => card !== cardNumber), ...live.filter((card) => card === cardNumber)]) {
      for (const commentId of commentsOf.get(number) ?? []) await deps.inbox.deleteComment(commentId);
      await deps.inbox.tombstone(number, tombstone);
      await deps.inbox.lock(number);
      report.strippedNow.push(number);
    }
    // A tombstone an earlier call left unlocked.
    for (const number of ordered) {
      const issue = byNumber.get(number);
      if (issue?.forgotten !== undefined && !issue.locked) await deps.inbox.lock(number);
    }
  } catch (error) {
    if (!(error instanceof GitHubApiError)) throw error;
    report.cards = ordered.map((number) => ({ number, github: state(number) }));
    return { kind: "github_failed", report, error };
  }
  report.cards = ordered.map((number) => ({ number, github: state(number) }));
  report.refiled.sort((left, right) => left.card - right.card);
  return { kind: "done", report };
}

/** Each card's comments, read a few cards at a time; a card with no comments is not read. */
async function readComments(
  inbox: FindingsCardInbox,
  cards: readonly FindingsRepositoryIssue[],
): Promise<Array<{ issue: FindingsRepositoryIssue; entries: FindingsCommentEntry[] }>> {
  const results: Array<{ issue: FindingsRepositoryIssue; entries: FindingsCommentEntry[] }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(COMMENT_READS_AT_ONCE, cards.length) }, async () => {
    while (next < cards.length) {
      const index = next;
      next += 1;
      const issue = cards[index]!;
      results[index] = { issue, entries: issue.comments === 0 ? [] : await inbox.commentEntries(issue.number) };
    }
  }));
  return results;
}
