import { z } from "zod";

import { RESEARCH_RECEIPT_MAX_CHARACTERS } from "../research-receipts.js";
import { findingsCardSchema } from "./card.js";

/**
 * The save a paid-private user accepts for one answer (owner decision Q11,
 * 2026-09-30: paid-private findings are saved when the user accepts saving
 * them for that answer; free contributor findings are saved by
 * finalize_research itself).
 */
export const saveResearchFindingsInputSchema = z.object({
  findings_card: findingsCardSchema.describe("The card exactly as the last finalize_research call checked it."),
  finalization_receipt: z.string().trim().min(1).max(RESEARCH_RECEIPT_MAX_CHARACTERS)
    .describe("The finalization_receipt that call returned."),
  user_consent: z.literal("yes_to_this_save").describe("Only after the user said yes to saving these findings."),
  reported_model: z.string().trim().min(1).max(80).optional()
    .describe("Your model's name as your app reports it; stored as reported, not verified.")
}).strict();

/**
 * What the findings library saves from: finalize_research for a free
 * contributor account, or save_research_findings after a paid-private user's
 * yes, with the caller's account key from its OAuth token.
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
  "research_account_required",
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
