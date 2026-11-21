import { createHash } from "node:crypto";

import { AtlasNewsError, type AtlasNewsStagingStore } from "@askrigor/evidence-repository";
import { z } from "zod";

import type { AtlasNewsMode } from "../config.js";
import { verifyResearchReceipt } from "../research-receipts.js";
import type { CheckedNewsCard } from "./card.js";
import { newsClaimsOf } from "./claims.js";

/**
 * Atlas news, stage 1 (design v4, section 3.3): the check stages its own card. When a finalize_research call that carries
 * a news card passes, is marked findings_save "off", comes from one of the owner's dev accounts and gets a receipt that
 * signs the news claims (the card's digest, and one lookup for each of its backing lines) and the draft's digest, the
 * server stores the card, the draft and those claims through the research-access role, idempotent on (item, card
 * digest), and gives the card its news number. A staged card is invisible until a day call commits it; one that no day
 * commits within 24 hours expires. Whatever happens here, the check stands: the result says only whether and why.
 */

/** Staging is bounded like the dossier's save: the call never waits on it longer than this. */
export const NEWS_STAGE_DEADLINE_MS = 5_000;

export const NEWS_NOT_STAGED_REASONS = [
  "news_off", "card_rejected", "check_not_passed", "not_marked_off", "no_research_account", "not_a_dev_account",
  "doi_not_verified", "no_news_claims", "no_draft", "store_unavailable", "day_full", "not_confirmed_in_time",
] as const;
export type NewsNotStagedReason = typeof NEWS_NOT_STAGED_REASONS[number];

/** Runtime only (owner answer 189a): the news card's staging, in finalize_research's result. */
export const newsStagingSchema = z.object({
  status: z.enum(["staged", "not_staged"]),
  number: z.string().regex(/^N-[1-9][0-9]{3,}$/u).optional(),
  card_digest: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  already_staged: z.boolean().optional(),
  reason: z.enum(NEWS_NOT_STAGED_REASONS).optional(),
  problems: z.array(z.string()).max(8).optional(),
}).strict()
  .describe("Only for AskRigor's own news check: whether its news card was staged for the day's call, with its news " +
    "number, or why not.");
export type NewsStaging = z.output<typeof newsStagingSchema>;

export interface NewsStagingInput {
  mode: AtlasNewsMode;
  /** The call's news card as checked; undefined when the call gave none. */
  checked: CheckedNewsCard | undefined;
  passed: boolean;
  receipt: string | undefined;
  savingOff: boolean;
  /** Undefined when the caller has no research account. */
  devAccount: boolean | undefined;
  /** Whether the card's DOI is one the call's verified receipts name (true for a card without a DOI). */
  doiVerified: boolean;
  draft: string | undefined;
  store: AtlasNewsStagingStore | undefined;
  secret: string | undefined;
  now: () => Date;
  deadlineMilliseconds?: number;
}

const notStaged = (reason: NewsNotStagedReason, problems?: string[]): NewsStaging =>
  ({ status: "not_staged", reason, ...(problems === undefined ? {} : { problems: problems.slice(0, 8) }) });

/** Stages the call's news card, or says why not; undefined when the call gave no news card. */
export async function stageNewsCard(input: NewsStagingInput): Promise<NewsStaging | undefined> {
  if (input.checked === undefined) return undefined;
  if (input.mode === "off") return notStaged("news_off");
  if (input.checked.status === "rejected") {
    return notStaged("card_rejected", input.checked.problems.map(({ message }) => message));
  }
  if (!input.passed || input.receipt === undefined) return notStaged("check_not_passed");
  if (!input.savingOff) return notStaged("not_marked_off");
  if (input.devAccount === undefined) return notStaged("no_research_account");
  if (!input.devAccount) return notStaged("not_a_dev_account");
  if (!input.doiVerified) return notStaged("doi_not_verified");
  const draft = input.draft?.trim();
  if (draft === undefined || draft === "") return notStaged("no_draft");
  if (input.secret === undefined) return notStaged("no_news_claims");
  const verified = verifyResearchReceipt(input.receipt, { secret: input.secret, now: input.now });
  const { card, digest } = input.checked;
  const draftSha256 = createHash("sha256").update(draft, "utf8").digest("hex");
  const claims = verified.ok && verified.kind === "finalization" ? newsClaimsOf(verified.claims) : undefined;
  if (!verified.ok || claims === undefined || claims.news !== digest || claims.nl.length !== card.backing.length ||
    verified.claims.answer !== draftSha256 || verified.claims.fs !== "off") {
    return notStaged("no_news_claims");
  }
  if (input.store === undefined) return notStaged("store_unavailable");
  const late = Symbol("late");
  let timer: NodeJS.Timeout | undefined;
  try {
    const staged = await Promise.race([
      input.store.stage({
        itemId: card.item_id, checkId: card.check_id, card: JSON.parse(JSON.stringify(card)) as Record<string, unknown>,
        cardSha256: digest, draft, draftSha256, receiptClaims: claims, receiptIssuedAt: verified.issued_at,
        doi: card.doi ?? null,
      }, input.now().toISOString()),
      new Promise<typeof late>((resolve) => {
        timer = setTimeout(() => resolve(late), input.deadlineMilliseconds ?? NEWS_STAGE_DEADLINE_MS);
      }),
    ]);
    if (staged === late) return notStaged("not_confirmed_in_time");
    return { status: "staged", number: staged.number, card_digest: staged.cardSha256, already_staged: staged.alreadyStaged };
  } catch (error) {
    if (error instanceof AtlasNewsError && error.code === "DAY_FULL") return notStaged("day_full");
    return notStaged("store_unavailable");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
