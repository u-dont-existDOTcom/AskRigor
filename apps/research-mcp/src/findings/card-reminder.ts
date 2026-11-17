/**
 * AskRigor#475 (the owner's report, 15 Nov 2026): a serious-adverse-event imbalance from a randomized trial and a forum
 * safety report reached the Atlas only after the owner asked "did you put this in the Atlas?". The save path worked; the
 * card was never sent. The final check asks a free contributor's research for its card only in a note (the "Give
 * findings_card with answer_draft" declaration), and under a passing check the notes' heading says a note asking for an
 * input "is for a later answer and needs no new check in this turn"; a passing check with no card then said nothing
 * more (register-tools.ts gave an absent card no words). So the card was put off to a later answer that never came.
 *
 * This reminder is the contained fix, outside the final check's own rules: when a free contributor's check passes for
 * the first time in the turn, card saving is on, no card came with the call, and the check asked for one,
 * the result says, in its text and in findings_card.problems (which an app reading only the structured content shows
 * too), that the card belongs to this answer, and that harms and safety signals count. It changes nothing a person is
 * asked to agree to: the free notice already says a free contributor's findings cards are saved and published. A paid
 * private answer, a call marked findings_save "off", a dev account with card saving off and a repeat pass get none.
 *
 * Whether the check asked is its own fact (findingsCardRequested), not read from the notes shown (Codex's review of
 * 17 Nov 2026, finding 5): a check that did not pass gave the request, so the turn's first pass left it out of its
 * notes as already given, and a reminder reading the notes said nothing.
 */

/** How the final check's note asking a free contributor's research for its card starts (research-finalization-gate.ts). */
export const FINDINGS_CARD_REQUEST_START = "Give findings_card with answer_draft: this account's research is saved";

export const FINDINGS_CARD_REMINDER = "This check passed with no findings_card, though this account's research is " +
  "saved to AskRigor's findings library: the card belongs to this answer, not a later one. Before giving the answer, " +
  "call finalize_research once more in this turn with the same answer_draft, carried_state and round_token, and " +
  "later_inputs.findings_card holding the answer's findings that a plain web search of the problem wouldn't give. " +
  "Harms and safety signals the research found count, even outside the question asked (an adverse-event imbalance " +
  "in a trial, say), and so does a finding resting on forum reports alone, given in forum_signal with its certainty " +
  "and each person counted once. Send no card only when no finding qualifies, or when the person asked not to save " +
  "their findings.";

export interface FindingsCardReminderInput {
  /** The final check's findings mode for the account: "save" for a free contributor whose library is open. */
  findings: "closed" | "private" | "save" | "offer";
  /** Card saving is on for the account (a dev account can switch it off) and the call didn't mark findings_save off. */
  savingOn: boolean;
  status: string;
  cardStatus: string;
  turnAlreadyPassed: boolean;
  /** The check asked for a card and none came (findingsCardRequested), whether or not its notes show the request. */
  cardRequested: boolean;
}

/** The reminder for a first pass that a free contributor's card should have come with, or undefined. */
export function findingsCardReminder(input: FindingsCardReminderInput): string | undefined {
  const passed = input.status === "ready" || input.status === "ready_with_limits";
  return input.findings === "save" && input.savingOn && passed && !input.turnAlreadyPassed &&
    input.cardStatus === "absent" && input.cardRequested ? FINDINGS_CARD_REMINDER : undefined;
}
