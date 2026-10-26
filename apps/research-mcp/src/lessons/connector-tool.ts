import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  connectorLessonCandidateSchema,
  connectorLessonSubmissionResultSchema,
  lessonCandidateSchema,
  PUBLIC_ASKRIGOR_REPOSITORY,
  type ConnectorLessonSubmissionResult,
} from "./contracts.js";

/**
 * What submit_lesson_candidate's description says of a detailed report (owner question 154): it goes with a lesson
 * only from an account that turned detailed lesson reports on, and the user sees it before saying yes.
 */
export const DETAILED_REPORT_RULE = "Include detailed_report, shown to the user with the lesson before asking, only " +
  "when manage_research_access shows this account's detailed lesson reports on.";

/**
 * The lesson Action's candidate without its incident provenance: the
 * connector has no incident vault, and raw incident text never reaches a
 * connector tool. Only the connector may name a related public AskRigor issue
 * or carry a detailed report. ChatGPT's app does not show the model a field's
 * bounds, so the report's description gives them.
 */
export const connectorLessonInputSchema = connectorLessonCandidateSchema
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
    related_issue: connectorLessonCandidateSchema.shape.related_issue.describe(
      `The number of an issue in ${PUBLIC_ASKRIGOR_REPOSITORY} that reports this failure in detail, when the user filed one.`,
    ),
    detailed_report: connectorLessonCandidateSchema.shape.detailed_report.describe(
      "Only when manage_research_access shows this account's detailed lesson reports on, and shown to the user with " +
        "the lesson before asking: the failure in detail, with no real person's details, ≤10,000 characters in all. " +
        "steps: 1-12, ≤300 each; observed, expected: what happened and what should have, ≤1,000 each; causes: 1-5 " +
        "{cause ≤300, confidence: low|medium|high}; parts_to_change: 1-8 parts of AskRigor (a tool, a protocol rule, " +
        "the final check), ≤120 each; proposed_change ≤1,500; test_cases: 0-5 invented {case ≤1,200, " +
        "negative_control: boolean}; uncertain: what stays uncertain, ≤1,000.",
    ),
    check_report_token: connectorLessonCandidateSchema.shape.check_report_token.describe(
      "For a stopped final check's bug report: the exact check_report_token returned by finalize_research, after the user agrees to send the shown report. The server verifies it and attaches its masked report verbatim; no detailed-reports setting is needed.",
    ),
    preventing_rule: connectorLessonCandidateSchema.shape.preventing_rule.describe(
      "For a user's correction: the exact HRP or Universal XML element name declared in corrections[].preventing_rule, or no_rule with missing_rule, shown with the report before asking.",
    ),
    missing_rule: connectorLessonCandidateSchema.shape.missing_rule.describe(
      "With preventing_rule no_rule: the same one-line missing-rule declaration shown to the user; no personal details.",
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
    "detailed_report_refused",
    "check_report_refused",
    "correction_rule_refused",
  ]),
  retryable: z.boolean(),
  candidate_id: z.string().optional(),
  occurrence_count: z.number().int().optional(),
  retry_after_seconds: z.number().int().optional(),
  reason_code: z.string().optional(),
});

const UNAVAILABLE: ConnectorLessonSubmissionResult = {
  status: "github_unavailable",
  retryable: false,
  reason_code: "github_service_unavailable",
};

/** What the model and the user see after a connector lesson submission. */
export function connectorLessonToolResult(raw: ConnectorLessonSubmissionResult): CallToolResult {
  const parsed = connectorLessonSubmissionResultSchema.safeParse(raw);
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
    case "check_report_refused":
      return receipt("Not saved: the final check report token did not verify. Pass the exact check_report_token AskRigor returned.", result, true);
    case "correction_rule_refused":
      return receipt("Not saved: the correction needs an exact current HRP or Universal element name, or no_rule with a one-line missing_rule.", result, true);
    case "detailed_report_refused":
      return receipt(
        "Not saved: detailed lesson reports are off for this account, so nothing was stored. Send the same lesson " +
          "again without detailed_report.",
        result,
        true,
      );
    default:
      return receipt("Not saved: the lesson queue is unavailable right now.", result, true);
  }
}

function receipt(text: string, result: ConnectorLessonSubmissionResult, isError: boolean): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...result },
    ...(isError ? { isError: true } : {}),
  };
}
