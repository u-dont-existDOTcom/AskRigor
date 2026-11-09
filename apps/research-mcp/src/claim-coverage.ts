import { z } from "zod";

import { joinRules, rule, type CheckRule } from "./check-rules.js";

/**
 * Claim coverage for a video's fact-check (AskRigor#431). A ChatGPT run fact-checked a video whose 22 claims
 * extract_youtube_video_claims listed, answered a few of them and never called finalize_research. Each listed claim has
 * an id, the video's ID and its place in the list ("<video>#3"), which the extraction's receipt fixes exactly (the
 * video and how many claims it listed). finalize_research takes, in later_inputs.claim_coverage, each id's status as
 * the AI declares it; an exact check of the ids against the receipts adds a note when a claim has no status or is
 * declared not addressed, and the note says the answer must call itself partial. Whether the answer really assesses a
 * claim is meaning, which the check doesn't judge; it never blocks an answer (owner answers 193a, 195a and 217b keep the
 * blocking checks at six).
 */

/** A video claim's id: the video's 11-character ID, "#", and the claim's place in the list, from 1. */
export const VIDEO_CLAIM_ID = /^[A-Za-z0-9_-]{11}#[1-9][0-9]{0,3}$/u;

export function videoClaimId(videoId: string, position: number): string {
  return `${videoId}#${position}`;
}

/** How the answer accounts for one listed claim, as the AI declares it. */
export const CLAIM_COVERAGE_STATUSES = ["assessed", "limited", "unresolved", "not_addressed"] as const;

export const CLAIM_COVERAGE_LIMITS = Object.freeze({ entries: 500, reason: 300 });

export const claimCoverageSchema = z.array(z.object({
  claim_id: z.string().regex(VIDEO_CLAIM_ID),
  status: z.enum(CLAIM_COVERAGE_STATUSES),
  reason: z.string().trim().min(1).max(CLAIM_COVERAGE_LIMITS.reason).optional(),
}).strict()).max(CLAIM_COVERAGE_LIMITS.entries);

export type ClaimCoverage = z.output<typeof claimCoverageSchema>;

/** A verified receipt as the final check holds it: its kind and signed claims. */
interface ClaimsReceipt {
  readonly kind: string;
  readonly claims: Readonly<Record<string, unknown>>;
  readonly issuedAt?: string;
}

/**
 * The ids of every claim the passed extraction receipts list, in order: for each video read in claims mode, the claims
 * its latest reading listed (by the receipt's millisecond sequence, then its issue time). Exact: receipts only.
 */
export function extractedClaimIds(receipts: readonly ClaimsReceipt[]): string[] {
  const latest = new Map<string, { order: number; at: string; n: number }>();
  for (const { kind, claims, issuedAt } of receipts) {
    if (kind !== "youtube_video_claims" || claims.mode !== "claims" || typeof claims.video !== "string") continue;
    const n = Number(claims.n);
    if (!Number.isSafeInteger(n) || n < 0) continue;
    const signed = Number(claims.t);
    const order = Number.isFinite(signed) ? signed : 0;
    const at = issuedAt ?? "";
    const prior = latest.get(claims.video);
    if (prior === undefined || order > prior.order || (order === prior.order && at > prior.at)) {
      latest.set(claims.video, { order, at, n });
    }
  }
  return [...latest].flatMap(([video, { n }]) => Array.from({ length: n }, (_, index) => videoClaimId(video, index + 1)));
}

const SHOWN = 12;

/** Ids as a short list: the first dozen, then how many more. */
function listed(ids: readonly string[]): string {
  return ids.length <= SHOWN ? ids.join(", ") : `${ids.slice(0, SHOWN).join(", ")} and ${ids.length - SHOWN} more`;
}

/**
 * The notes for the declared coverage against the listed claims, as server rules whose ids are inserted values (so a
 * debug report masks them); none when every listed claim has a status other than not_addressed.
 */
export function claimCoverageNotes(expected: readonly string[], declared: ClaimCoverage | undefined): CheckRule[] {
  const notes: CheckRule[] = [];
  const listedIds = new Set(expected);
  const statuses = new Map<string, ClaimCoverage[number]>();
  for (const entry of declared ?? []) statuses.set(entry.claim_id, entry);
  const unknown = [...statuses.keys()].filter((id) => !listedIds.has(id));
  if (unknown.length > 0) {
    notes.push(joinRules(rule`later_inputs.claim_coverage names ${listed(unknown)}, which no `,
      "extract_youtube_video_claims receipt passed here lists: leave them out, or pass the receipt of the reading that ",
      "listed them."));
  }
  const withoutReason = (declared ?? []).flatMap((entry, index) =>
    entry.status === "limited" && entry.reason === undefined ? [`claim_coverage[${index}]`] : []);
  if (withoutReason.length > 0) {
    notes.push(rule`${withoutReason.join(", ")} ${withoutReason.length === 1 ? "is" : "are"} limited without a reason: give each limit's reason in a few words.`);
  }
  if (expected.length === 0) return notes;
  const missing = expected.filter((id) => !statuses.has(id));
  const notAddressed = expected.filter((id) => statuses.get(id)?.status === "not_addressed");
  if (missing.length === 0 && notAddressed.length === 0) return notes;
  const parts = [
    ...(missing.length === 0 ? [] : [rule`${missing.length} have no status in later_inputs.claim_coverage (${listed(missing)})`]),
    ...(notAddressed.length === 0 ? [] : [rule`${notAddressed.length} are declared not_addressed (${listed(notAddressed)})`])
  ];
  notes.push(joinRules(rule`Of the ${expected.length} video claim(s) extract_youtube_video_claims listed, `,
    parts.length === 1 ? parts[0]! : joinRules(parts[0]!, ", and ", parts[1]!),
    ". Account for each claim in the answer, assessed, limited with its reason, or unresolved, and give each id's ",
    "status in later_inputs.claim_coverage; while any claim is not addressed, the answer must call itself partial, at ",
    "its start, and say which claims it did not assess."));
  return notes;
}
