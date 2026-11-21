import { checkRetractionStatus, type CrossrefConfig } from "@askrigor/sources";

import type { PaperStatusLookup } from "./day.js";

/**
 * Atlas news, stage 1 (design v4, section 3.4 step 5): a paper's retraction and correction status, read on the day
 * through the check_retraction_status tool's own call. A provider that can't be read gives "unknown", which keeps the
 * item back that day.
 */
export function crossrefPaperStatus(config: () => CrossrefConfig): PaperStatusLookup {
  return async (doi) => {
    const envelope = await checkRetractionStatus(doi, config());
    const status = envelope.data?.status;
    return status === "retracted" || status === "expression_of_concern" || status === "corrected_or_updated" ||
      status === "no_retraction_record_found" ? status : "unknown";
  };
}
