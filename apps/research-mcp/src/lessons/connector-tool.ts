import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  lessonCandidateSchema,
  lessonSubmissionResultSchema,
  type LessonSubmissionResult,
} from "./contracts.js";

/**
 * The lesson Action's candidate without its incident provenance: the
 * connector has no incident vault, and raw incident text never reaches a
 * connector tool.
 */
export const connectorLessonInputSchema = lessonCandidateSchema
  .omit({ incident_provenance: true })
  .extend({
    general_lesson: lessonCandidateSchema.shape.general_lesson.describe(
      '"When [general situation], AskRigor should [correct behavior] because [reason]."',
    ),
    synthetic_regression_example: lessonCandidateSchema.shape.synthetic_regression_example.describe(
      "A made-up case, with no real person's details.",
    ),
    consent_scope: lessonCandidateSchema.shape.consent_scope.describe(
      '"conversation" only after the user said yes for the whole chat.',
    ),
  });

/** The lesson Action's public receipt: no issue number, URL, lesson text or fingerprint. */
export const connectorLessonOutputSchema = z.object({
  status: z.enum([
    "submitted",
    "existing_candidate",
    "privacy_rejected",
    "rate_limited",
    "anonymizer_unavailable",
    "github_unavailable",
  ]),
  retryable: z.boolean(),
  candidate_id: z.string().optional(),
  occurrence_count: z.number().int().optional(),
  retry_after_seconds: z.number().int().optional(),
  reason_code: z.string().optional(),
});

const UNAVAILABLE: LessonSubmissionResult = {
  status: "github_unavailable",
  retryable: false,
  reason_code: "github_service_unavailable",
};

/** What the model and the user see after a connector lesson submission. */
export function connectorLessonToolResult(raw: LessonSubmissionResult): CallToolResult {
  const parsed = lessonSubmissionResultSchema.safeParse(raw);
  const result = parsed.success ? parsed.data : UNAVAILABLE;
  switch (result.status) {
    case "submitted":
      return receipt(`Lesson saved for review as ${result.candidate_id}.`, result, false);
    case "existing_candidate":
      return receipt(
        `This lesson matches ${result.candidate_id}, already in review; it has now been reported ` +
          `${result.occurrence_count} time(s).`,
        result,
        false,
      );
    case "privacy_rejected":
      return receipt(
        "Not saved: the privacy check found personal or identifying details. Rewrite the lesson in " +
          "general terms, show it to the user again and ask before resubmitting.",
        result,
        true,
      );
    case "rate_limited":
      return receipt(
        `Not saved: the lesson queue's limit is reached; try again in about ${result.retry_after_seconds} seconds.`,
        result,
        true,
      );
    default:
      return receipt("Not saved: the lesson queue is unavailable right now.", result, true);
  }
}

function receipt(text: string, result: LessonSubmissionResult, isError: boolean): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...result },
    ...(isError ? { isError: true } : {}),
  };
}
