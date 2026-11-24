/**
 * The plain answer's claims on the research menu (owner answer 413a, its research half; 24 November 2026). The owner,
 * 23 Nov: "the 'askrigor checks' field was so useless, it said 'the plain answer would ahve said X, but askrigor didn't
 * check that' like over and over and over". The note said so because the research was never planned around those
 * claims. So the AI registers only the points a person would act on, and each one gets a research task or is said to
 * be left out on the menu.
 *
 * What is exact goes here, and nothing else. A task declares, in claims, the numbers of the claims it could confirm or
 * correct; the menu lists in left_out, in its own words, each claim no task covers, and why. AskRigor holds no text of
 * the plain answer: its receipt signs a digest of each claim, so a left_out claim is matched by its digest, in any
 * language, and a number is checked against how many were signed. Every registered claim then stands in one place:
 * covered by the tasks that declare it, left out with the reason the AI gave, or in neither, which is said as it is.
 * Whether a task really covers a claim, and whether a reason is a good one, are the model's declarations: nothing here
 * reads a word's meaning, and nothing here ever refuses a menu.
 *
 * Off unless the account has it (ASKRIGOR_CLAIM_ACCOUNTING, config.ts and research-trial.ts): with it off every text and
 * result is as before.
 */

import { withAsciiDigits } from "./unicode-numbers.js";

/** The plain answer's own limits (PLAIN_ANSWER_LIMITS: a test keeps them the same), and a reason's length on the menu. */
export const CLAIM_ACCOUNTING_LIMITS = Object.freeze({ claims: 5, claimCharacters: 250, why: 120 });

/** One registered claim's place on the menu. */
export interface ClaimAccount {
  /** The claim's number, from 1, as register_plain_answer's result lists it. */
  claim: number;
  /** The numbers of the tasks that declare it; none when no task covers it. */
  tasks: number[];
  /** With no task: the claim's own words, when left_out gave them and they are the registered ones. */
  text?: string;
  /** With no task: why it is left out, in the AI's words for the person. */
  why?: string;
}

export interface ClaimAccounting {
  accounts: ClaimAccount[];
  /** What the menu gave that could not be used, for the result's problems. Never a reason to refuse it. */
  problems: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** One line of plain text, cut at whole characters; undefined when it is no text or empty. */
export function oneLine(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (text === "") return undefined;
  const characters = Array.from(text);
  return characters.length <= limit ? text : `${characters.slice(0, limit - 1).join("").trimEnd()}…`;
}

/**
 * A task's declared claims, as numbers from 1 to count, each once and in order. A number written as a text of digits, in
 * any script, is read; a single number is a list of one; anything else is left out.
 */
export function claimNumbers(value: unknown, count: number = CLAIM_ACCOUNTING_LIMITS.claims): number[] {
  const given: readonly unknown[] = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const numbers = given.map((entry) => typeof entry === "number" ? entry
    : typeof entry === "string" && /^\s*\p{Nd}{1,2}\s*$/u.test(entry) ? Number(withAsciiDigits(entry)) : Number.NaN);
  return [...new Set(numbers.filter((number) => Number.isInteger(number) && number >= 1 && number <= count))]
    .sort((left, right) => left - right);
}

/** A claim the menu leaves out, as it gave it. */
export interface LeftOutClaim {
  claim: string;
  why?: string;
}

/** The menu's left_out entries that have a claim's words (an entry given as text alone is the claim), each with its place. */
function leftOutEntries(value: unknown): Array<LeftOutClaim & { place: number }> {
  const given: readonly unknown[] = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return given.flatMap((entry, place) => {
    const claim = (typeof entry === "string" ? entry : isRecord(entry) && typeof entry.claim === "string" ? entry.claim : "").trim();
    if (claim === "" || Array.from(claim).length > CLAIM_ACCOUNTING_LIMITS.claimCharacters) return [];
    const why = isRecord(entry) ? oneLine(entry.why, CLAIM_ACCOUNTING_LIMITS.why) : undefined;
    return [{ claim, ...(why === undefined ? {} : { why }), place }];
  }).slice(0, CLAIM_ACCOUNTING_LIMITS.claims);
}

/** The menu's left_out claims as a result gives them back: their words and why, at most the limit. */
export function leftOutClaims(value: unknown): LeftOutClaim[] {
  return leftOutEntries(value).map(({ claim, why }) => ({ claim, ...(why === undefined ? {} : { why }) }));
}

/**
 * Where each registered claim stands on a menu: the tasks that declare it, otherwise its left_out entry, otherwise
 * neither. registered holds the claims' digests in the order registered, digestOf gives a claim's digest. A claim both
 * covered and left out counts as covered.
 */
export function accountForClaims(
  tasks: ReadonlyArray<{ claims?: unknown }>,
  leftOut: unknown,
  registered: readonly string[],
  digestOf: (claim: string) => string,
): ClaimAccounting {
  const problems: string[] = [];
  const accounts: ClaimAccount[] = registered.map((_, index) => ({ claim: index + 1, tasks: [] }));
  tasks.forEach((task, place) => {
    const declared = claimNumbers(task.claims, registered.length);
    for (const claim of declared) accounts[claim - 1]!.tasks.push(place + 1);
    const past = claimNumbers(task.claims, 99).filter((claim) => claim > registered.length);
    if (past.length > 0) {
      problems.push(`later_inputs.researchMenu.tasks[${place}].claims: ${past.join(", ")} ` +
        `${past.length === 1 ? "is" : "are"} past the ${registered.length} of the plain answer; left out.`);
    }
  });
  for (const { claim, why, place } of leftOutEntries(leftOut)) {
    const number = registered.indexOf(digestOf(claim));
    if (number < 0) {
      problems.push(`later_inputs.researchMenu.left_out[${place}].claim is not one of the plain answer's claims: copy ` +
        "it word for word as register_plain_answer's result listed it.");
      continue;
    }
    const account = accounts[number]!;
    if (account.tasks.length > 0 || account.text !== undefined) continue;
    account.text = claim.replace(/\s+/gu, " ");
    if (why !== undefined) account.why = why;
  }
  return { accounts, problems };
}

/** The claims no task covers, in the order registered. */
export const claimsNotOnPlan = (accounts: readonly ClaimAccount[] | undefined): ClaimAccount[] =>
  (accounts ?? []).filter(({ tasks }) => tasks.length === 0);

/** What a menu says of each claim no task covers, one line each, to be shown in the person's language. */
export function notOnPlanLines(accounts: readonly ClaimAccount[] | undefined): string[] {
  const missing = claimsNotOnPlan(accounts);
  if (missing.length === 0) return [];
  return [
    ...missing.map(({ claim, text, why }) => "Not on this plan, so not checked: " + (text === undefined
      ? `claim ${claim} of your plain answer (show the claim's own words, as registered).`
      : `“${text}”${why === undefined ? "" : ` (${why})`}`)),
    missing.length === 1 ? "You can ask for a task on it." : "You can ask for a task on any of these.",
  ];
}

/** Before those lines, where a result gives them to the AI to show. */
export const NOT_ON_PLAN_LEAD = "After the tasks, show the person these lines too, in their language, with each claim " +
  "in its own words:";

/** The same for an app that hands its model only the structured content (researchMenu.claims). */
export const NOT_ON_PLAN_STRUCTURED = "After the tasks, show the person one line for each of researchMenu.claims that " +
  "has no tasks, in their language: \"Not on this plan, so not checked\", the claim in its own words, and its why when " +
  "it has one; they can ask for a task on it.";

/**
 * The claims inspect asks for (413a, R1), in place of "its main claims". What a person would act on is the model's
 * judgment; "2 or 3" is guidance, since the tool list's limit of five stands.
 */
export function claimsWanted(claims: number, claimCharacters: number): string {
  return "plainAnswer.claims, the points of it the person would act on, decide by or repeat as fact: usually 2 or 3, " +
    `one when the answer is one point, at most ${claims}, each one or more whole sentences copied exactly from it (at ` +
    `most ${claimCharacters} characters each). Take the most specific sentence for each point, one that research could ` +
    "show wrong; no two claims make the same point; background, definitions and cautions that would fit any question " +
    "are not claims; and ";
}

/** After the request to put premise verdicts first. */
export const PREMISE_CLAIMS_COUNT = "Those verdicts are claims whatever else is; the sentence that answers what the " +
  "person asked is always one too, and several premises are a reason to go past 3. ";

/** R1's closing line, in inspect's request. */
export const CLAIMS_ON_THE_MENU = "Then, on the research menu, each claim gets a task that could confirm or correct it " +
  "(one task may cover several), or stands in left_out with the reason; a premise verdict always gets a task. Look " +
  "beyond the claims too. ";

/** R2: the same in register_plain_answer's result. */
export const CLAIMS_ON_THE_MENU_REGISTERED = "On the research menu, each claim gets a task that could confirm or " +
  "correct it (one task may cover several), or stands in left_out with the reason; a claim left out is not " +
  "researched, and the note says so. A premise verdict always gets a task. Look beyond the claims too. ";

/** R3: the line of the screen's instructions, after the search for what would show a premise wrong. */
export const CLAIMS_AT_THE_SCREEN = "On the menu, account for every claim of the plain answer: a task that could " +
  "confirm or correct it names it in its claims (one task may cover several, and such a task is never only detail), or " +
  "the claim stands in left_out with why. Never leave out a verdict on a premise, or a claim whose being wrong could " +
  "harm the person. ";

/** R3: the two fields in the menu's shape. */
export const CLAIMS_TASK_SHAPE = "claims, the numbers of the plain answer's claims this task could confirm or correct, " +
  "as register_plain_answer's result numbered them, only for a task that covers one; ";
export const LEFT_OUT_SHAPE = " And left_out, for each claim no task covers, {claim, that claim word for word; why, in " +
  `the person's language and at most ${CLAIM_ACCOUNTING_LIMITS.why} characters: that checking it could not change what ` +
  "they do or believe, or what stood in the way}.";

/**
 * R4: the planner's rule, a paragraph of its own rubric. quick_answer_claims stay as they are in the bundle; a claim's
 * number is its place in that list.
 */
export const CLAIMS_RUBRIC = `Account for every one of quick_answer_claims, numbered from 1 in the order given: a task that could confirm or
correct it lists its number in claims, or the claim goes in left_out with why, written for the person in their
language, at most ${CLAIM_ACCOUNTING_LIMITS.why} characters. Cover claims with the tasks you already plan where one settles them (one task may
cover several); add a task for a claim only when none does, and such a task is never only detail. Leave a claim out
only when checking it could not change what the person does or believes, or when step 3's limits leave no room after
the tasks the person asked for and the tasks a serious risk needs; say which, concretely. Never leave out a claim on
something the question takes for granted, or one whose being wrong could harm the person, and menu_history is never a
reason. In lane light the one task lists the claims it settles and the rest go in left_out; in lane aside both stay
empty.`;
