import {
  lockPrediction,
  predictionSubmissionSchema,
  type LockPredictionInput,
  type PublicPredictionRecord,
} from "./public-prediction.js";

/**
 * Public intake wrapper. It deterministically excludes result-seen submissions
 * from primary scoring before the lower-level lock contract validates them.
 */
export function lockPredictionForSubmission(
  input: LockPredictionInput,
): PublicPredictionRecord {
  const submission = predictionSubmissionSchema.parse({
    ...input.submission,
    counts_for_scoring:
      input.submission.result_exposure_declaration ===
      "SEEN_RESULT_INELIGIBLE_FOR_PRIMARY_SCORE"
        ? false
        : input.submission.counts_for_scoring,
  });

  return lockPrediction({
    ...input,
    submission,
  });
}
