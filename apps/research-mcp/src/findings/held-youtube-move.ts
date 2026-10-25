import {
  HELD_YOUTUBE_FINDINGS_MILLISECONDS,
  type AtlasReviewStore,
  type HeldYouTubeFindingsStore,
} from "@askrigor/evidence-repository";

import { heldYouTubeFindingOf, storedCardWithoutYouTubeFindings } from "./card.js";
import { STORED_WITHOUT } from "./contracts.js";
import type { FindingsCardInbox } from "./github-findings-review.js";
import type { FindingsRecord } from "./service.js";

/**
 * move_youtube_findings (owner answer 173, 25 Oct): a card stored before a saved card left out its findings drawn from
 * YouTube comments (owner answer 170) still holds them in the private GitHub inbox. This moves them into the held
 * YouTube findings, each counted from its own save's time (a card saved on 7 Oct is deleted on 6 Nov), and rewrites
 * the card exactly as a card saved today without them would read: withoutYouTubeData's stored card, whose remaining
 * findings keep their signed bases, the checked card's SHA-256, the same stamp and marker, and stored_without naming
 * youtube_comment_findings, so the review tool still reads it. Later saves (occurrence comments) are rewritten the
 * same way, and a later save left with no finding is deleted, as such a save today would not be filed. A finding whose
 * 30 days have already ended is deleted, not moved.
 *
 * Every read and check comes first; nothing is changed for a card that does not read, whose findings all rest on
 * YouTube comments (a card saved today would not be saved), or where a decision is recorded on a finding that the move
 * would remove or renumber (decisions name findings by their place). The findings are held before GitHub is changed, so
 * a call that fails part way is called again: a finding held already keeps its expiry, and a rewritten save has nothing
 * left to move.
 */

export type YouTubeFindingsMoveStatus =
  | "moved"
  | "nothing_to_move"
  | "not_found"
  | "unreadable"
  | "every_finding_youtube"
  | "decisions_in_the_way"
  | "incomplete";

export interface MovedYouTubeFinding {
  /** Its place on that save's card, from 1. */
  finding: number;
  save: "card" | "later_save";
  savedAt: string;
  /** When it is deleted; null when its 30 days had ended, so it was deleted rather than moved. */
  expiresAt: string | null;
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
}

export interface YouTubeFindingsMoveDependencies {
  inbox: FindingsCardInbox;
  store: Pick<AtlasReviewStore, "inspectCards">;
  held: Pick<HeldYouTubeFindingsStore, "hold">;
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
  now: Date,
): Promise<YouTubeFindingsMoveReport> {
  const report: YouTubeFindingsMoveReport = {
    card: cardNumber, status: "incomplete", findings: [], cardRewritten: false, laterSavesRewritten: 0,
    laterSavesDeleted: 0, decidedFindings: [],
  };
  try {
    const lookup = await deps.inbox.readCard(cardNumber);
    if (lookup.status !== "found") return { ...report, status: lookup.status };
    const card = lookup.card;
    const entries = card.occurrences.length === 0 ? [] : await deps.inbox.commentEntries(cardNumber);
    if (entries.some((entry) => entry.unreadableSave === true || (entry.save !== undefined && entry.save.record === undefined))) {
      return { ...report, status: "unreadable" };
    }
    const own = storedCardWithoutYouTubeFindings(card.record.card);
    if (own.card.findings.length === 0) return { ...report, status: "every_finding_youtube" };
    const leftOut = card.record.card.findings.flatMap((_, index) => own.kept.includes(index) ? [] : [index]);
    const later = entries.flatMap((entry) => {
      const record = entry.save?.record;
      if (entry.save === undefined || record === undefined) return [];
      const stored = storedCardWithoutYouTubeFindings(record.card);
      return stored.findingsLeftOut === 0 ? [] : [{ commentId: entry.id, metadata: entry.save.metadata, record, stored }];
    });
    if (leftOut.length === 0 && later.length === 0) return { ...report, status: "nothing_to_move" };
    if (leftOut.length > 0) {
      // Removing a finding renumbers those after it; a decision names its finding by place, so none may follow.
      const first = Math.min(...leftOut) + 1;
      const decided = (await deps.store.inspectCards([cardNumber]))
        .filter(({ itemKind, itemNumber }) => itemKind === "finding" && itemNumber >= first)
        .map(({ itemNumber }) => itemNumber)
        .sort((left, right) => left - right);
      if (decided.length > 0) return { ...report, status: "decisions_in_the_way", decidedFindings: decided };
    }

    // 1. The held findings: the card's own, then each later save's, each counted from that save's time.
    const saves = [
      ...(leftOut.length === 0 ? [] : [{ save: "card" as const, record: card.record, indexes: leftOut }]),
      ...later.map(({ record, stored }) => ({
        save: "later_save" as const,
        record,
        indexes: record.card.findings.flatMap((_, index) => stored.kept.includes(index) ? [] : [index]),
      })),
    ];
    for (const { save, record, indexes } of saves) {
      const savedAt = record.stamp.saved_at;
      const live = Date.parse(savedAt) + HELD_YOUTUBE_FINDINGS_MILLISECONDS > now.getTime();
      const held = !live ? [] : await deps.held.hold({
        cardNumber,
        cardSha256: record.card_sha256,
        savedAt,
        findings: indexes.map((index) => {
          const finding = record.card.findings[index]!;
          return heldYouTubeFindingOf(finding, index + 1, finding.verified_bases ?? []);
        }),
      });
      for (const index of indexes) {
        const kept = held.find(({ findingNumber }) => findingNumber === index + 1);
        report.findings.push({ finding: index + 1, save, savedAt, expiresAt: kept?.expiresAt ?? null });
      }
    }

    // 2. GitHub: the later saves, then the card.
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
