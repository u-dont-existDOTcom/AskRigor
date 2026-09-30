import { createHash } from "node:crypto";

import { GitHubApiError } from "../lessons/github-app.js";
import type { LessonAttemptLimiter } from "../lessons/rate-limit.js";
import { verifyResearchReceipt } from "../research-receipts.js";
import {
  findingsCardDigest,
  findingsCardFingerprint,
  isSafeReportedModel,
  screenFindingsCard,
  type FindingsCard
} from "./card.js";
import {
  saveResearchFindingsInputSchema,
  saveResearchFindingsOutputSchema,
  type FindingsSaveReason,
  type FindingsSaveResult
} from "./contracts.js";
import { publicFindingsCardId, type GitHubFindingsQueue } from "./github-findings.js";

/** Where and with what the save was made, known to the server at registration. */
export interface FindingsSaveContext {
  /** The MCP endpoint the tool was listed on (/mcp or /mcp/claude), or "unknown". */
  surface: string;
  /** sha256 of the server's operation names, sorted, one per line. */
  toolCatalogSha256: string;
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
  card: FindingsCard;
  card_sha256: string;
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
}

/**
 * Saves one findings card after the user said yes: only the card whose digest
 * a valid, unexpired finalization receipt signed, only past the privacy
 * screen, within the rate limit, stamped by the server. No model call.
 */
export class FindingsSaveService {
  private readonly now: () => Date;

  constructor(private readonly options: FindingsSaveServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async save(raw: unknown, context: FindingsSaveContext): Promise<FindingsSaveResult> {
    try {
      const parsed = saveResearchFindingsInputSchema.safeParse(raw);
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

      if (screenFindingsCard(input.findings_card).length > 0 ||
        (input.reported_model !== undefined && !isSafeReportedModel(input.reported_model))) {
        return result({ status: "privacy_rejected", retryable: false, reason_code: "unsafe_card" });
      }

      const limit = this.options.limiter.consume();
      if (!limit.allowed) {
        return result({
          status: "rate_limited",
          retryable: true,
          retry_after_seconds: limit.retryAfterSeconds,
          reason_code: this.options.limiter.lastBlockingReason(),
        });
      }

      const record: FindingsRecord = {
        schema: "askrigor.findings-card.v1",
        card: input.findings_card,
        card_sha256: cardSha256,
        stamp: {
          saved_at: now.toISOString(),
          askrigor_version: this.options.version,
          askrigor_build: this.options.build,
          protocols: (await this.options.protocols()).map(({ name, version, sha256 }) => ({ name, version, sha256 })),
          tool_catalog_sha256: context.toolCatalogSha256,
          surface: context.surface,
          ...(input.reported_model === undefined ? {} : { reported_model_unverified: input.reported_model }),
          research: researchStamp(receipt.issued_at, receipt.claims),
        },
      };
      const queued = await this.options.queue.submit({
        record,
        fingerprint: findingsCardFingerprint(input.findings_card),
        receiptSha256: createHash("sha256").update(input.finalization_receipt, "utf8").digest("hex"),
      });
      return result({
        status: queued.kind === "created" ? "saved" : "existing_card",
        retryable: false,
        card_id: publicFindingsCardId(queued.issueNumber),
        occurrence_count: queued.occurrenceCount,
      });
    } catch (error) {
      return queueUnavailable(error);
    }
  }
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
  const parsed = saveResearchFindingsOutputSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : { status: "queue_unavailable", retryable: false, reason_code: "queue_service_unavailable" };
}
