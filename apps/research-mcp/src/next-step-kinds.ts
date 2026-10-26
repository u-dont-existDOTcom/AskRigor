/**
 * What kind of gap each of the final check's next steps is (AskRigor#354), so a reader of a not_ready result, the
 * model, a client or a test harness, can tell research still to do from an answer still to fix without reading the
 * steps' prose. The carried state keeps the kinds a check left open, for the conversation's next check.
 *
 * input_invalid: the call's inputs failed, so the check did not run; receipt_rejected: a research receipt passed did
 * not verify, or was made for another research target; research: a search, reading, audit, coverage check or
 * community lane the answer needs is not done; declaration: a declaration is missing, incomplete or inconsistent;
 * answer_draft: the draft does not yet say, show or link what it must; carried_state: the conversation's carried
 * state does not verify, or this call drops what was established earlier in this conversation; second_reading: a second reading found
 * a sentence the declarations leave out; tool_list: the one connector-refresh hint.
 */
export const NEXT_STEP_KINDS = [
  "input_invalid",
  "receipt_rejected",
  "research",
  "declaration",
  "answer_draft",
  "carried_state",
  "second_reading",
  "tool_list"
] as const;

export type NextStepKind = (typeof NEXT_STEP_KINDS)[number];
