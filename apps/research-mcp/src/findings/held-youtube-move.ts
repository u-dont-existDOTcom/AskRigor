import {
  ATLAS_PUBLICATIONS_PER_INSPECT,
  atlasPublicationOrder,
  type AtlasPublicationStore,
  type AtlasReviewStore,
  type HeldYouTubeFindingsStore,
} from "@askrigor/evidence-repository";

import { heldYouTubeCardTextsOf, heldYouTubeFindingOf, storedCardWithoutYouTubeFindings } from "./card.js";
import { STORED_WITHOUT } from "./contracts.js";
import type { FindingsCardInbox } from "./github-findings-review.js";
import type { FindingsRecord } from "./service.js";

/**
 * move_youtube_findings (owner answer 173, 25 Oct): a card stored before a saved card left out its findings drawn from
 * YouTube comments (owner answer 170) still holds them in the private GitHub inbox. This moves every one of them into
 * the held YouTube findings, each with its own save's time, where they are kept until deleted (the owner's rule, 25
 * Oct: "don't delete the summaries unless YT tells us to do that"), and rewrites the card exactly as a card saved today
 * without them would read: withoutYouTubeData's stored card, whose remaining findings keep their signed bases, the
 * checked card's SHA-256, the same stamp and marker, and stored_without naming youtube_comment_findings, so the review
 * tool still reads it. Later saves (occurrence comments) are rewritten the same way, and a later save left with no
 * finding is deleted, as such a save today would not be filed.
 *
 * Owner answer 179a: when every finding rests on YouTube comments, hold each save with no card number and with its
 * own question and topic, then delete every comment, tombstone and lock the issue as forget_card does. A later save
 * with any finding to keep stops this path. A tombstone records the card number, removal time and this reason, so a
 * retry can finish locking it without holding anything again.
 *
 * Every read and check comes first; nothing is changed for a card that does not read, or where a decision is recorded
 * on a finding that the move would remove or renumber (decisions name findings by their place), or with publications
 * whose card was not forgotten (publications also name findings by their place). Every finding is held before GitHub
 * is changed, and GitHub is not changed unless the store holds each one, so a call that fails part way is called
 * again: a finding held already keeps its save time, and a rewritten save has nothing left to move.
 */

export type YouTubeFindingsMoveStatus =
  | "moved"
  | "moved_without_card"
  | "nothing_to_move"
  | "not_found"
  | "unreadable"
  | "later_save_kept_findings"
  | "decisions_in_the_way"
  | "published_in_the_way"
  | "incomplete";

export interface MovedYouTubeFinding {
  /** Its place on that save's card, from 1. */
  finding: number;
  save: "card" | "later_save";
  /** When its save was made, as the held findings keep it. */
  savedAt: string;
}

export interface YouTubeFindingsMoveReport {
  card: number;
  status: YouTubeFindingsMoveStatus;
  findings: MovedYouTubeFinding[];
  cardRewritten: boolean;
  laterSavesRewritten: number;
  laterSavesDeleted: number;
  /** decisions_in_the_way: the decided findings the move would remove or renumber. */
  decidedFindings: number[];
  /** published_in_the_way: the published findings, including withdrawn rows, unless their card was forgotten. */
  publishedFindings: number[];
  /** later_save_kept_findings: the occurrence comment whose save has findings to keep. */
  laterSave?: number;
}

export interface YouTubeFindingsMoveDependencies {
  inbox: FindingsCardInbox;
  store: Pick<AtlasReviewStore, "inspectCards">;
  held: Pick<HeldYouTubeFindingsStore, "hold">;
  publications?: Pick<AtlasPublicationStore, "inspect">;
  now?: () => Date;
}

// What withoutYouTubeData writes in place of a YouTube link, which a stored text keeps.
const YOUTUBE_PLACEHOLDER = "(YouTube video)";

/**
 * A save's record as one saved today would hold it: its card without its findings drawn from YouTube comments, the
 * checked card's SHA-256 and the save's stamp, and stored_without as such a save sets it. A save today names
 * youtube_video_ids_and_links only when a link in a text it keeps was replaced, which leaves the placeholder, as
 * parseFindingsRecordBody reads it; the IDs of the findings left out go with them, under youtube_comment_findings.
 */
export function recordWithoutYouTubeFindings(
  record: FindingsRecord,
  stored: ReturnType<typeof storedCardWithoutYouTubeFindings>,
): FindingsRecord {
  const linksReplaced = stored.omitted || JSON.stringify(stored.card).includes(YOUTUBE_PLACEHOLDER);
  const without = STORED_WITHOUT.filter((item) =>
    item === "youtube_comment_findings" || (item === "youtube_video_ids_and_links" && linksReplaced));
  return {
    schema: record.schema,
    card: stored.card,
    card_sha256: record.card_sha256,
    stored_without: without,
    stamp: record.stamp,
  };
}

/** Moves one card's findings drawn from YouTube comments into the held findings; it never throws. */
export async function moveYouTubeFindings(
  deps: YouTubeFindingsMoveDependencies,
  cardNumber: number,
): Promise<YouTubeFindingsMoveReport> {
  const report: YouTubeFindingsMoveReport = {
    card: cardNumber, status: "incomplete", findings: [], cardRewritten: false, laterSavesRewritten: 0,
    laterSavesDeleted: 0, decidedFindings: [], publishedFindings: [],
  };
  try {
    const lookup = await deps.inbox.readCard(cardNumber);
    if (lookup.status !== "found") {
      if (lookup.status === "not_found") {
        const issue = (await deps.inbox.repositoryIssues()).find(({ number }) => number === cardNumber);
        if (issue?.forgotten?.reason === "youtube_findings_held_without_card") {
          if (!issue.locked) await deps.inbox.lock(cardNumber);
          return { ...report, status: "moved_without_card" };
        }
      }
      return { ...report, status: lookup.status };
    }
    const card = lookup.card;
    const own = storedCardWithoutYouTubeFindings(card.record.card);
    const withoutCard = own.card.findings.length === 0;
    const entries = !withoutCard && card.occurrences.length === 0 ? [] : await deps.inbox.commentEntries(cardNumber);
    if (entries.some((entry) => entry.unreadableSave === true || (entry.save !== undefined && entry.save.record === undefined))) {
      return { ...report, status: "unreadable" };
    }
    const leftOut = card.record.card.findings.flatMap((_, index) => own.kept.includes(index) ? [] : [index]);
    const later = entries.flatMap((entry) => {
      const record = entry.save?.record;
      if (entry.save === undefined || record === undefined) return [];
      const stored = storedCardWithoutYouTubeFindings(record.card);
      return !withoutCard && stored.findingsLeftOut === 0
        ? [] : [{ commentId: entry.id, metadata: entry.save.metadata, record, stored }];
    });
    if (leftOut.length === 0 && later.length === 0) return { ...report, status: "nothing_to_move" };
    if (withoutCard) {
      // The whole card goes, so any finding decision, in either store, is an obstacle.
      const decided = [...new Set([
        ...await deps.store.inspectCards([cardNumber]), ...card.decisions,
      ].filter(({ itemKind }) => itemKind === "finding").map(({ itemNumber }) => itemNumber))]
        .sort((left, right) => left - right);
      if (decided.length > 0) return { ...report, status: "decisions_in_the_way", decidedFindings: decided };
    }
    if (deps.publications !== undefined) {
      // Any publication binds the card's finding positions, even after withdrawal. Only forgotten cards are exempt.
      const published = new Set<number>();
      let before: number | undefined;
      for (;;) {
        const rows = await deps.publications.inspect({
          cardNumbers: [cardNumber], limit: ATLAS_PUBLICATIONS_PER_INSPECT,
          ...(before === undefined ? {} : { before }),
        });
        for (const row of rows) {
          if (row.cardForgottenAt === null) published.add(row.findingNumber);
        }
        if (rows.length < ATLAS_PUBLICATIONS_PER_INSPECT) break;
        before = atlasPublicationOrder(rows[rows.length - 1]!.publicationNumber);
      }
      if (published.size > 0) return {
        ...report, status: "published_in_the_way", publishedFindings: [...published].sort((left, right) => left - right),
      };
    }
    if (!withoutCard && leftOut.length > 0) {
      // Removing a finding renumbers those after it; a decision names its finding by place, so none may follow.
      const first = Math.min(...leftOut) + 1;
      const decided = (await deps.store.inspectCards([cardNumber]))
        .filter(({ itemKind, itemNumber }) => itemKind === "finding" && itemNumber >= first)
        .map(({ itemNumber }) => itemNumber)
        .sort((left, right) => left - right);
      if (decided.length > 0) return { ...report, status: "decisions_in_the_way", decidedFindings: decided };
    }
    const keptLater = withoutCard ? later.find(({ stored }) => stored.card.findings.length > 0) : undefined;
    if (keptLater !== undefined) {
      return { ...report, status: "later_save_kept_findings", laterSave: keptLater.commentId };
    }

    // 1. The held findings: the card's own, then each later save's, each with that save's time.
    const saves = [
      ...(leftOut.length === 0 ? [] : [{ save: "card" as const, record: card.record, indexes: leftOut }]),
      ...later.map(({ record, stored }) => ({
        save: "later_save" as const,
        record,
        indexes: record.card.findings.flatMap((_, index) => stored.kept.includes(index) ? [] : [index]),
      })),
    ];
    for (const { save, record, indexes } of saves) {
      const held = await deps.held.hold({
        ...(withoutCard ? heldYouTubeCardTextsOf(record.card) : { cardNumber }),
        cardSha256: record.card_sha256,
        savedAt: record.stamp.saved_at,
        findings: indexes.map((index) => {
          const finding = record.card.findings[index]!;
          return heldYouTubeFindingOf(finding, index + 1, finding.verified_bases ?? []);
        }),
      });
      for (const index of indexes) {
        const kept = held.find((row) => row.findingNumber === index + 1 &&
          row.cardSha256 === record.card_sha256 && row.cardNumber === (withoutCard ? null : cardNumber));
        // A finding the store does not report held stays on the card: nothing in GitHub changes.
        if (kept === undefined) throw new Error("HELD_YOUTUBE_FINDING_NOT_HELD");
        report.findings.push({ finding: index + 1, save, savedAt: kept.savedAt });
      }
    }

    // 2. GitHub: the later saves, then the card.
    if (withoutCard) {
      for (const entry of entries) {
        await deps.inbox.deleteComment(entry.id);
        if (entry.save !== undefined) report.laterSavesDeleted += 1;
      }
      await deps.inbox.tombstone(cardNumber, {
        cards: [cardNumber], forgotten_at: (deps.now?.() ?? new Date()).toISOString(),
        reason: "youtube_findings_held_without_card",
      });
      await deps.inbox.lock(cardNumber);
      return { ...report, status: "moved_without_card" };
    }
    for (const { commentId, metadata, record, stored } of later) {
      if (stored.card.findings.length === 0) {
        await deps.inbox.deleteComment(commentId);
        report.laterSavesDeleted += 1;
      } else {
        await deps.inbox.rewriteLaterSave(commentId, recordWithoutYouTubeFindings(record, stored), metadata);
        report.laterSavesRewritten += 1;
      }
    }
    if (leftOut.length > 0) {
      await deps.inbox.rewriteCard(cardNumber, recordWithoutYouTubeFindings(card.record, own));
      report.cardRewritten = true;
    }
    return { ...report, status: "moved" };
  } catch {
    // What was done stays done; calling again finishes the rest.
    return report;
  }
}
