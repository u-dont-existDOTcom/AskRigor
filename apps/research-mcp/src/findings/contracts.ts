import { z } from "zod";

import { RESEARCH_RECEIPT_MAX_CHARACTERS } from "../research-receipts.js";
import { findingsCardSchema } from "./card.js";

/**
 * What finalize_research hands the findings library for a free contributor
 * account (owner decision Q11, 2026-09-30); no model calls it directly.
 */
export const findingsSaveInputSchema = z.object({
  findings_card: findingsCardSchema,
  finalization_receipt: z.string().trim().min(1).max(RESEARCH_RECEIPT_MAX_CHARACTERS),
  /** The pseudonymous research-use account key; only a keyed hash of it with the research target is stored. */
  contributor: z.string().regex(/^[a-f0-9]{64}$/u),
  reported_model: z.string().trim().min(1).max(80).optional()
}).strict();

export type FindingsSaveInput = z.output<typeof findingsSaveInputSchema>;

export const FINDINGS_SAVE_STATUSES = [
  "saved",
  "existing_card",
  "privacy_rejected",
  "rate_limited",
  "card_not_checked",
  "queue_unavailable"
] as const;

export const FINDINGS_SAVE_REASONS = [
  "invalid_request",
  "receipts_unavailable",
  "receipt_invalid",
  "receipt_expired",
  "card_not_in_receipt",
  "card_changed",
  "unsafe_card",
  "hourly_limit",
  "daily_limit",
  "library_closed",
  "queue_not_configured",
  "queue_auth_unavailable",
  "queue_service_unavailable"
] as const;

/** A receipt: no issue number, link, card text or fingerprint. */
export const findingsSaveResultSchema = z.object({
  status: z.enum(FINDINGS_SAVE_STATUSES),
  retryable: z.boolean(),
  card_id: z.string().regex(/^ARF-[0-9]{4,}$/u).optional(),
  occurrence_count: z.number().int().positive().optional(),
  /** Earlier open cards of the same research thread that this card replaced. */
  replaced_count: z.number().int().positive().optional(),
  retry_after_seconds: z.number().int().positive().optional(),
  reason_code: z.enum(FINDINGS_SAVE_REASONS).optional()
}).strict();

export type FindingsSaveResult = z.output<typeof findingsSaveResultSchema>;
export type FindingsSaveReason = typeof FINDINGS_SAVE_REASONS[number];
