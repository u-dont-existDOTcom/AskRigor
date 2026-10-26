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

export const EXISTING_RULES_RULE = "Every lesson starts with existing_rules: inventory the exact current HRP or " +
  "Universal element names that cover the failure and what happened to each, or none with the missing rule. " +
  "When covering rules exist, propose enforcing or fixing them before any new rule. The server checks the " +
  "declaration's form and exact names, not its diagnosis. Include observed_behavior, expected_behavior and " +
  "part_to_change even when detailed reports are off; show these with the lesson before asking.";

/**
 * The lesson Action's candidate without its incident provenance: the
 * connector has no incident vault, and raw incident text never reaches a
 * connector tool. Only the connector may name a related public AskRigor issue
 * or carry a detailed report. ChatGPT's app does not show the model a field's
 * bounds, so the report's description gives them.
 */
export const connectorLessonInputSchema = connectorLessonCandidateSchema
  .extend({
    existing_rules: connectorLessonCandidateSchema.shape.existing_rules.describe(
      "Required: {rules: [{name: exact current HRP/Universal element tag or selectable name/id, status: " +
        "not_loaded|loaded_not_applied|applied_but_insufficient|not_triggered|unknown, reason: one line ≤300}]} " +
        "(1-12 rules), or {none: one line ≤300 explaining the missing rule}. Load the current protocols first; " +
        "do not invent a name or a cause. Enforce or fix covering rules before proposing a new one.",
    ),
    observed_behavior: connectorLessonCandidateSchema.shape.observed_behavior.describe(
      "What AskRigor actually did, including the first observed failing step; 20-1,200 characters, " +
        "generalized with no real person's details. Required even with detailed reports off.",
    ),
    expected_behavior: lessonCandidateSchema.shape.expected_behavior.describe(
      "What should have happened at that step; 40-1,200 characters. Keep the concrete expected result.",
    ),
    part_to_change: connectorLessonCandidateSchema.shape.part_to_change.describe(
      "The part to inspect or change: kind tool, protocol_rule or final_check (the same kinds as detailed_report); " +
        "name the specific tool, rule or check in ≤120 characters. Required even with detailed reports off.",
    ),
    general_lesson: lessonCandidateSchema.shape.general_lesson.describe(
      '"When [general situation], AskRigor should [correct behavior] because [reason]."',
    ),
    synthetic_regression_example: lessonCandidateSchema.shape.synthetic_regression_example.describe(
      "A made-up reproduction and the expected test result, with no real person's details; 20-1,200 characters.",
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
    "existing_rules_refused",
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
    case "existing_rules_refused":
      return receipt(result.reason_code === "unknown_protocol_element"
        ? "Not saved: an existing_rules name is not an exact current HRP or Universal element. Load the current protocols and use their exact element names."
        : "Not saved: existing_rules must list covering rules with a status and one-line reason, or none with a one-line explanation of the missing rule.", result, true);
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
