import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  saveResearchFindingsOutputSchema,
  type FindingsSaveReason,
  type FindingsSaveResult
} from "./contracts.js";

export const SAVE_RESEARCH_FINDINGS_DESCRIPTION =
  "Save the findings card of the final checked answer to AskRigor's private findings library, for the owner's " +
  "review. Use only after the user says yes to this save. Send the card exactly as the last finalize_research call " +
  "checked it, with its finalization_receipt; never include claims the user corrected, and no personal details. " +
  "Returns a receipt, never the stored card.";

const UNAVAILABLE: FindingsSaveResult = {
  status: "queue_unavailable",
  retryable: false,
  reason_code: "queue_service_unavailable",
};

// Why a card was not saved as checked, for the user.
const NOT_CHECKED: Partial<Record<FindingsSaveReason, string>> = {
  receipts_unavailable: "this AskRigor server cannot verify research receipts",
  receipt_invalid: "the finalization receipt is not valid",
  receipt_expired: "the finalization receipt has expired, so run finalize_research again",
  card_not_in_receipt: "that finalize_research call did not check a findings card",
  card_changed: "the card is not the one finalize_research checked",
  invalid_request: "the request is not a findings card with its receipt",
};

/** What the model and the user see after a save. */
export function findingsSaveToolResult(raw: FindingsSaveResult): CallToolResult {
  const parsed = saveResearchFindingsOutputSchema.safeParse(raw);
  const result = parsed.success ? parsed.data : UNAVAILABLE;
  switch (result.status) {
    case "saved":
      return receipt(`Saved for review as ${result.card_id}.`, result, false);
    case "existing_card":
      return receipt(
        `Saved for review as ${result.card_id}, which already holds these findings; they have now been saved ` +
          `${result.occurrence_count} time(s).`,
        result,
        false,
      );
    case "privacy_rejected":
      return receipt(
        "Not saved: the privacy check found personal or identifying details in the card. Rewrite it in general " +
          "terms, check it again with finalize_research and ask the user before saving.",
        result,
        true,
      );
    case "rate_limited":
      return receipt(
        `Not saved: the findings library's limit is reached; try again in about ${result.retry_after_seconds} seconds.`,
        result,
        true,
      );
    case "card_not_checked":
      return receipt(
        `Not saved: ${NOT_CHECKED[result.reason_code ?? "invalid_request"] ?? NOT_CHECKED.invalid_request}. Save the ` +
          "card exactly as the last finalize_research call checked it, with the finalization_receipt it returned.",
        result,
        true,
      );
    default:
      return receipt(
        result.reason_code === "library_closed"
          ? "Not saved: AskRigor's findings library is not open yet."
          : "Not saved: the findings library is unavailable right now.",
        result,
        true,
      );
  }
}

function receipt(text: string, result: FindingsSaveResult, isError: boolean): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...result },
    ...(isError ? { isError: true } : {}),
  };
}
