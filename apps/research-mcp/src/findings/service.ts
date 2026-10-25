import { createHash, createHmac } from "node:crypto";

import type { HeldYouTubeFindingsStore } from "@askrigor/evidence-repository";

import { GitHubApiError } from "../lessons/github-app.js";
import type { LessonAttemptLimiter } from "../lessons/rate-limit.js";
import { verifyResearchReceipt } from "../research-receipts.js";
import {
  findingBasesFromReceipt,
  findingsCardDigest,
  findingsCardFingerprint,
  heldYouTubeCardTextsOf,
  heldYouTubeFindingOf,
  isSafeReportedModel,
  isYouTubeVideoId,
  screenFindingsCard,
  withoutYouTubeData,
  type FindingsCard,
  type StoredFindingsCard,
  type VerifiedBasis
} from "./card.js";
import {
  findingsSaveInputSchema,
  findingsSaveResultSchema,
  type FindingsSaveReason,
  type FindingsSaveResult,
  type StoredWithout
} from "./contracts.js";
import { publicFindingsCardId, type GitHubFindingsQueue } from "./github-findings.js";

/** Where and with what the save was made, known to the server at registration. */
export interface FindingsSaveContext {
  /** The MCP endpoint finalize_research was called on (/mcp or /mcp/claude), or "unknown". */
  surface: string;
  /** sha256 of the server's operation names, sorted, one per line. */
  toolCatalogSha256: string;
  /**
   * The saving account, for the Atlas (decision 171, section 4B): a free contributor's card is published as soon as it
   * is saved when the account accepted the current notice and is not a dev account. Never stored with the card.
   */
  account?: FindingsSaveAccount;
}

/** What the Atlas reads of the saving account, all exact: its mode, the notice it accepted, and its dev listing. */
export interface FindingsSaveAccount {
  mode: "FREE_CONTRIBUTOR" | "PAID_PRIVATE";
  /** The free contributor notice the account accepted; null for a paid private account. */
  noticeVersion: string | null;
  /** Whether the account is listed in ASKRIGOR_DEV_ACCOUNT_KEYS. */
  devAccount: boolean;
}

/** A confirmed save, as the Atlas publisher reads it. */
export interface SavedFindingsCard {
  record: FindingsRecord;
  issueNumber: number;
  /** created: the save is the card's own record (a retry of it included); existing: a later save on an open card. */
  kind: "created" | "existing";
  /** Whether the card the save landed on carries the set-aside label. */
  setAside: boolean;
  /** The cards of the same research thread this save replaced. */
  replacedCards: number[];
  account: FindingsSaveAccount | undefined;
}

/** Publishes a saved card's findings in the Atlas (decision 171, section 4B); the save never waits for it. */
export interface FindingsCardPublisher {
  /** Whether a card this account saves is published as soon as it is saved: the account checks alone. */
  accountPublishes(account: FindingsSaveAccount | undefined): boolean;
  /** After a confirmed save: publishes what is eligible. It may throw; the save has already been answered. */
  afterSave(saved: SavedFindingsCard): Promise<void>;
}

export interface ProtocolIdentity {
  name: string;
  version: string;
  sha256: string;
}

/** Which AskRigor made the findings, so old cards can be evaluated again. */
export interface FindingsStamp {
  saved_at: string;
  askrigor_version: string;
  /** The deployed build's commit (ASKRIGOR_BUILD_COMMIT), or "unknown". */
  askrigor_build: string;
  protocols: ProtocolIdentity[];
  tool_catalog_sha256: string;
  surface: string;
  /** The model name the app reported; nothing verifies it. */
  reported_model_unverified?: string;
  /** From the finalization receipt's signed claims. */
  research: {
    finalized_at: string;
    depth?: string;
    status?: string;
    receipts_verified?: number;
    validated_sources?: number;
    lead_sources?: number;
    material_videos?: number;
  };
}

export interface FindingsRecord {
  schema: "askrigor.findings-card.v1";
  /** The card as stored: without YouTube video IDs or links (see withoutYouTubeData). */
  card: StoredFindingsCard;
  /** The digest finalize_research signed, of the card as it was checked. */
  card_sha256: string;
  /** What the stored card leaves out of the checked card. */
  stored_without?: StoredWithout[];
  stamp: FindingsStamp;
}

export interface FindingsSaveServiceOptions {
  /** The research receipt signing secret, read when a save arrives. */
  receiptSecret: () => string | undefined;
  limiter: LessonAttemptLimiter;
  queue: Pick<GitHubFindingsQueue, "submit">;
  protocols: () => Promise<readonly ProtocolIdentity[]>;
  version: string;
  build: string;
  now?: () => Date;
  /** The Atlas publisher (decision 171); without it nothing is published at the save. */
  publisher?: FindingsCardPublisher;
  /**
   * Where the findings a saved card leaves out are held for the owner's review (owner answer 173): the database,
   * through the research-access role. Without it they are not kept.
   */
  held?: Pick<HeldYouTubeFindingsStore, "hold">;
}

/**
 * Saves the findings card of a free contributor's finalized answer (owner
 * decision Q11, 2026-09-30): only the card whose digest a valid, unexpired
 * finalization receipt signed, only when it declares that its findings would
 * help other people (owner answer 156a, 2026-10-22), only past the privacy
 * screen, within the rate limit, stamped by the server. No model call. The
 * card replaces the open cards of its research thread: the same account and
 * research target, which the queue knows only as a keyed hash.
 */
export class FindingsSaveService {
  private readonly now: () => Date;
  /** Publications started after a save and not finished yet. */
  private readonly publishing = new Set<Promise<void>>();
  private readonly holds = new Set<Promise<void>>();

  constructor(private readonly options: FindingsSaveServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Resolves once every publication started so far has finished, whatever its outcome: for tests and shutdown. */
  async publicationsSettled(): Promise<void> {
    await Promise.allSettled([...this.publishing]);
  }

  /** Resolves once every hold this service started has ended, held or not; for tests. */
  async heldSettled(): Promise<void> {
    await Promise.all([...this.holds]);
  }

  async save(raw: unknown, context: FindingsSaveContext): Promise<FindingsSaveResult> {
    try {
      const parsed = findingsSaveInputSchema.safeParse(raw);
      if (!parsed.success) return notChecked("invalid_request");
      const input = parsed.data;

      const secret = this.options.receiptSecret();
      if (secret === undefined) return notChecked("receipts_unavailable");
      const now = this.now();
      const receipt = verifyResearchReceipt(input.finalization_receipt, { secret, now: () => now });
      if (!receipt.ok) return notChecked(receipt.reason === "expired" ? "receipt_expired" : "receipt_invalid");
      if (receipt.kind !== "finalization") return notChecked("receipt_invalid");
      const signed = receipt.claims.findings;
      if (typeof signed !== "string" || signed === "") return notChecked("card_not_in_receipt");
      const cardSha256 = findingsCardDigest(input.findings_card);
      if (signed !== cardSha256) return notChecked("card_changed");
      const target = receipt.claims.target;
      if (typeof target !== "string" || target === "") return notChecked("receipt_invalid");
      // Owner answer 156a (2026-10-22): the library keeps only findings that would help other people. The declaration
      // read here is the one the final check signed with the card; the final check rejects a card without one, so a
      // card that makes none comes from a check before it was asked for, and is checked again first.
      const scope = input.findings_card.public_value?.scope;
      if (scope === "personal_only") return result({ status: "personal_only", retryable: false });
      if (scope !== "public") return notChecked("public_value_missing");

      if (screenFindingsCard(input.findings_card).length > 0) {
        return result({ status: "privacy_rejected", retryable: false, reason_code: "unsafe_card" });
      }
      // A model name that does not read as one is left out; the card is still saved.
      const reportedModel = input.reported_model !== undefined && isSafeReportedModel(input.reported_model)
        ? input.reported_model
        : undefined;

      const limit = this.options.limiter.consume();
      if (!limit.allowed) {
        return result({
          status: "rate_limited",
          retryable: true,
          retry_after_seconds: limit.retryAfterSeconds,
          reason_code: this.options.limiter.lastBlockingReason(),
        });
      }

      // Each finding's work beyond a quick answer, as the receipt signed it (owner answer 139c), by the finding's place
      // in the checked card; a receipt from before bases were signed stamps none.
      const bases = findingBasesFromReceipt(receipt.claims.bases, input.findings_card.findings.length);
      const drawnFromComments = new Set((bases ?? []).flatMap((signed, index) =>
        signed.includes("comment_audit") ? [index] : []));
      const stored = withoutYouTubeData(input.findings_card, drawnFromComments);
      // A card whose findings all rest on YouTube comments is not saved as a card (owner answer 170); its findings are
      // held, with its question and topic, for the owner's review (owner answer 173).
      if (stored.card.findings.length === 0) {
        this.holdLeftOut(undefined, cardSha256, now, input.findings_card, stored.kept, bases);
        return result({ status: "youtube_findings_only", retryable: false });
      }
      const card: StoredFindingsCard = bases === undefined ? stored.card : {
        ...stored.card,
        findings: stored.card.findings.map((finding, index) => {
          const signed = bases[stored.kept[index]!]!;
          return signed.length === 0 ? finding : { ...finding, verified_bases: signed };
        }),
      };
      const without: StoredWithout[] = [
        ...(stored.omitted ? ["youtube_video_ids_and_links" as const] : []),
        ...(stored.findingsLeftOut > 0 ? ["youtube_comment_findings" as const] : []),
      ];
      const record: FindingsRecord = {
        schema: "askrigor.findings-card.v1",
        card,
        card_sha256: cardSha256,
        ...(without.length === 0 ? {} : { stored_without: without }),
        stamp: {
          saved_at: now.toISOString(),
          askrigor_version: this.options.version,
          askrigor_build: this.options.build,
          protocols: (await this.options.protocols()).map(({ name, version, sha256 }) => ({ name, version, sha256 })),
          tool_catalog_sha256: context.toolCatalogSha256,
          surface: context.surface,
          ...(reportedModel === undefined ? {} : { reported_model_unverified: reportedModel }),
          research: researchStamp(receipt.issued_at, receipt.claims),
        },
      };
      const publisher = this.options.publisher;
      const queued = await this.options.queue.submit({
        record,
        fingerprint: findingsCardFingerprint(input.findings_card),
        receiptSha256: createHash("sha256").update(input.finalization_receipt, "utf8").digest("hex"),
        thread: findingsThreadKey(secret, input.contributor, target),
        ...(publisher?.accountPublishes(context.account) === true ? { atlasPublish: true } : {}),
        ...(context.account?.mode === "PAID_PRIVATE" ? { paidPrivate: true } : {}),
      });
      // Owner answer 173: the findings the stored card leaves out are held apart from it, in the background.
      if (stored.findingsLeftOut > 0) {
        this.holdLeftOut(queued.issueNumber, cardSha256, now, input.findings_card, stored.kept, bases);
      }
      // Decision 171, section 4B: the card's findings are published right after the confirmed save. The answer never
      // waits for it, and a failure never changes the save's result: the owner retries it with publish_cards. The
      // publisher reads the stored card, so a finding held above is never among them.
      if (publisher !== undefined) {
        this.publishAfterSave(publisher, {
          record,
          issueNumber: queued.issueNumber,
          kind: queued.kind,
          setAside: queued.setAside,
          replacedCards: queued.replacedCards,
          account: context.account,
        });
      }
      return result({
        status: queued.kind === "created" ? "saved" : "existing_card",
        retryable: false,
        card_id: publicFindingsCardId(queued.issueNumber),
        occurrence_count: queued.occurrenceCount,
        ...(queued.replaced === 0 ? {} : { replaced_count: queued.replaced }),
      });
    } catch (error) {
      return queueUnavailable(error);
    }
  }

  /** Starts the publisher on a confirmed save, without waiting for it; its failure is caught and changes nothing. */
  private publishAfterSave(publisher: FindingsCardPublisher, saved: SavedFindingsCard): void {
    const started = Promise.resolve()
      .then(() => publisher.afterSave(saved))
      .catch(() => undefined)
      .finally(() => this.publishing.delete(started));
    this.publishing.add(started);
  }

  /**
   * Owner answer 173 (25 Oct): each finding withoutYouTubeData left out of the saved card is held in the database,
   * apart from the card, for the owner's review, until deleted: its texts and fixed values only (heldYouTubeFindingOf), under
   * the card's issue number, the checked card's digest and its place on that card, from the save time. A card none of
   * whose findings is kept is not saved as a card, so its findings are held with no issue number, with the card's own
   * general wording of the research question and its topic (heldYouTubeCardTextsOf). In the background: the save's
   * result never waits for it, so a held store that fails or is slow never fails or delays the save, and then the
   * findings are simply not kept.
   */
  private holdLeftOut(
    issueNumber: number | undefined,
    cardSha256: string,
    savedAt: Date,
    card: FindingsCard,
    kept: readonly number[],
    bases: VerifiedBasis[][] | undefined,
  ): void {
    const held = this.options.held;
    if (held === undefined) return;
    let work: Promise<unknown>;
    try {
      const keptIndexes = new Set(kept);
      const videoIds = [...new Set(card.findings.flatMap(({ sources }) => sources.filter(isYouTubeVideoId)))];
      work = held.hold({
        ...(issueNumber === undefined ? heldYouTubeCardTextsOf(card, videoIds) : { cardNumber: issueNumber }),
        cardSha256,
        savedAt: savedAt.toISOString(),
        findings: card.findings.flatMap((finding, index) => keptIndexes.has(index)
          ? []
          : [heldYouTubeFindingOf(finding, index + 1, bases?.[index] ?? [], videoIds)]),
      });
    } catch {
      return;
    }
    const settled = Promise.resolve(work).then(() => undefined, () => undefined);
    this.holds.add(settled);
    void settled.then(() => this.holds.delete(settled));
  }
}

/**
 * One research thread: one account's research on one research target. The
 * key is an HMAC under the receipt secret, so the library cannot tell whose
 * thread it is, and one account's threads on different targets do not match.
 */
export function findingsThreadKey(secret: string, contributor: string, targetDigest: string): string {
  return createHmac("sha256", secret)
    .update("askrigor:findings-thread:v1\0", "utf8")
    .update(contributor, "utf8")
    .update("\0", "utf8")
    .update(targetDigest, "utf8")
    .digest("hex");
}

/** The research behind the card, from the receipt's signed claims; the research target's digest stays out. */
function researchStamp(issuedAt: string, claims: Readonly<Record<string, string | string[]>>): FindingsStamp["research"] {
  const word = (key: string) => {
    const value = claims[key];
    return typeof value === "string" && /^[a-z_]{1,40}$/u.test(value) ? value : undefined;
  };
  const count = (key: string) => {
    const value = claims[key];
    return typeof value === "string" && /^\d{1,9}$/u.test(value) ? Number(value) : undefined;
  };
  const fields = {
    depth: word("depth"),
    status: word("status"),
    receipts_verified: count("receipts"),
    validated_sources: count("validated"),
    lead_sources: count("leads"),
    material_videos: count("videos"),
  };
  return {
    finalized_at: issuedAt,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  };
}

function notChecked(reason: FindingsSaveReason): FindingsSaveResult {
  return result({ status: "card_not_checked", retryable: false, reason_code: reason });
}

function queueUnavailable(error: unknown): FindingsSaveResult {
  if (error instanceof GitHubApiError && error.code === "github_service_unavailable") {
    return result({ status: "queue_unavailable", retryable: error.retryable, reason_code: "queue_service_unavailable" });
  }
  if (error instanceof GitHubApiError) {
    return result({ status: "queue_unavailable", retryable: false, reason_code: "queue_auth_unavailable" });
  }
  return result({ status: "queue_unavailable", retryable: false, reason_code: "queue_service_unavailable" });
}

function result(value: FindingsSaveResult): FindingsSaveResult {
  const parsed = findingsSaveResultSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : { status: "queue_unavailable", retryable: false, reason_code: "queue_service_unavailable" };
}
