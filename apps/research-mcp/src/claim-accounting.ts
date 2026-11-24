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
 * Every number a value declares, 0 and those past the claims among them, each once and in order. A number written as a
 * text of digits, in any script, is read; a single number is a list of one; anything else is left out.
 */
function declaredNumbers(value: unknown): number[] {
  const given: readonly unknown[] = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const numbers = given.map((entry) => typeof entry === "number" ? entry
    : typeof entry === "string" && /^\s*\p{Nd}{1,2}\s*$/u.test(entry) ? Number(withAsciiDigits(entry)) : Number.NaN);
  return [...new Set(numbers.filter((number) => Number.isInteger(number) && number >= 0 && number <= 99))]
    .sort((left, right) => left - right);
}

/** A task's declared claims, as numbers from 1 to count, each once and in order. */
export function claimNumbers(value: unknown, count: number = CLAIM_ACCOUNTING_LIMITS.claims): number[] {
  return declaredNumbers(value).filter((number) => number >= 1 && number <= count);
}

/**
 * The same for a menu's example that is handed back to be sent again (correctedMenu), a 0 kept: whether it means that the
 * menu counts from 0 is read where the number of claims is known (claimReading).
 */
export function claimNumbersAsGiven(value: unknown): number[] {
  return declaredNumbers(value).filter((number) => number <= CLAIM_ACCOUNTING_LIMITS.claims);
}

/**
 * How a menu counts the plain answer's claims, which register_plain_answer's result lists from 1. A menu that gives a 0
 * anywhere counts from 0, so each of its numbers is read one higher; unless it also gives the last claim's number, which
 * a count from 0 never reaches: then which claims it means can't be told, and none of its numbers is used. given holds
 * each value that declares claims; read gives a value's claims, from 1 to count, each once and in order.
 */
export function claimReading(given: readonly unknown[], count: number):
  { counted: "from_1" | "from_0" | "unclear"; read: (value: unknown) => number[] } {
  const numbers = new Set(given.flatMap(declaredNumbers));
  const counted = !numbers.has(0) ? "from_1" : numbers.has(count) ? "unclear" : "from_0";
  return { counted, read: (value) => counted === "unclear" ? []
    : declaredNumbers(value).map((number) => counted === "from_0" ? number + 1 : number)
      .filter((number) => number >= 1 && number <= count) };
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
 * Whether a menu declares none of the plain answer's claims: no task gives a claim's number, and left_out names no claim.
 * A later call that carries a menu so (its menu_digest names the same tasks) has dropped both, or never had them, and
 * which of the two can't be told: the digest counts neither.
 */
export function declaresNoClaim(tasks: ReadonlyArray<{ claims?: unknown }>, leftOut: unknown): boolean {
  return tasks.every(({ claims }) => declaredNumbers(claims).length === 0) && leftOutEntries(leftOut).length === 0;
}

/** What such a call gets in place of any line on its claims: no line is printed, and the next call is asked for both. */
export const CLAIMS_NOT_SENT = "later_inputs.researchMenu: this call names the menu shown (its menu_digest) but gives no " +
  "task's claims and no left_out, so nothing is said here of the plain answer's claims. With the next call, send both " +
  "as that menu had them.";

/**
 * Where each registered claim stands on a menu: the tasks that declare it, otherwise its left_out entry, otherwise
 * neither. registered holds the claims' digests in the order registered, digestOf gives a claim's digest. A claim both
 * covered and left out counts as covered. A menu whose numbers can't be read (claimReading) gives only the claims it
 * leaves out, since a task of it may cover any other.
 */
export function accountForClaims(
  tasks: ReadonlyArray<{ claims?: unknown }>,
  leftOut: unknown,
  registered: readonly string[],
  digestOf: (claim: string) => string,
): ClaimAccounting {
  const problems: string[] = [];
  const accounts: ClaimAccount[] = registered.map((_, index) => ({ claim: index + 1, tasks: [] }));
  const { counted, read } = claimReading(tasks.map(({ claims }) => claims), registered.length);
  if (counted === "from_0") {
    problems.push("later_inputs.researchMenu.tasks: this menu's claims are counted from 0, so each of their numbers was " +
      "read as one higher. They are numbered from 1, as register_plain_answer's result listed them: send them so from " +
      "now on.");
  } else if (counted === "unclear") {
    problems.push(`later_inputs.researchMenu.tasks: this menu's claims give both 0 and ${registered.length}, so none of ` +
      "their numbers was used. The numbers start at 1, as register_plain_answer's result listed them: send them so with " +
      "the next call.");
  }
  tasks.forEach((task, place) => {
    for (const claim of read(task.claims)) accounts[claim - 1]!.tasks.push(place + 1);
    const past = declaredNumbers(task.claims).filter((claim) => claim > registered.length);
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
  return { accounts: counted === "unclear" ? accounts.filter(({ text }) => text !== undefined) : accounts, problems };
}

/** The claims no task covers, in the order registered. */
export const claimsNotOnPlan = (accounts: readonly ClaimAccount[] | undefined): ClaimAccount[] =>
  (accounts ?? []).filter(({ tasks }) => tasks.length === 0);

/**
 * What a menu says of each claim no task covers, one line each, to be shown in the person's language. A claim whose words
 * the menu did not give stands by its number, as a placeholder: the AI holds the words, AskRigor does not.
 */
export function notOnPlanLines(accounts: readonly ClaimAccount[] | undefined): string[] {
  const missing = claimsNotOnPlan(accounts);
  if (missing.length === 0) return [];
  return [
    ...missing.map(({ claim, text, why }) => `Not on this plan, so not checked: “${text === undefined
      ? `<claim ${claim}, in its own words>` : text}”${why === undefined ? "" : ` (${why})`}`),
    missing.length === 1 ? "You can ask for a task on it." : "You can ask for a task on any of these.",
  ];
}

/** Beside those lines, for the AI: what a placeholder's number stands for. */
export const CLAIM_WORDS_FOR_NUMBER = "where a line gives a claim's number, write that claim's words";

/** Before those lines, where a result gives them to the AI to show. */
export const NOT_ON_PLAN_LEAD = "After the tasks, show the person these lines too, in their language, with each claim " +
  `in its own words (${CLAIM_WORDS_FOR_NUMBER}):`;

/** The same where the menu is a task record for the answer and nothing is shown before it (ChatGPT, going on). */
export const NOT_ON_PLAN_IN_ANSWER = "Give these lines in the answer, beside the task record, in the person's language " +
  `(${CLAIM_WORDS_FOR_NUMBER}):`;

/** The same for an app that hands its model only the structured content (researchMenu.claims). */
const NOT_ON_PLAN_EACH = "one line for each of researchMenu.claims that has no tasks, in their language: \"Not on this " +
  "plan, so not checked\", the claim in its own words, and its why when it has one; they can ask for a task on it.";
export const NOT_ON_PLAN_STRUCTURED = `After the tasks, show the person ${NOT_ON_PLAN_EACH}`;
export const NOT_ON_PLAN_STRUCTURED_IN_ANSWER = `In the answer, beside the task record, give the person ${NOT_ON_PLAN_EACH}`;

/** What an ask's rule and a go-ahead say of a later call, so that it carries the claims as the menu had them. */
export const SAME_MENU_WITH_CLAIMS = "plain_answer_receipt, tasks (each with its claims), left_out and menu_digest";
export const CLAIMS_ON_A_LATER_CALL = "On a later plan_research call, keep each task's claims and left_out as this menu " +
  "has them.";

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

/**
 * On an account whose research AskRigor plans itself: the plan accounts for the claims, so nothing asks the AI for a task
 * or a left_out entry of its own (the review of 24 Nov 2026, F3: the registration said both to change nothing of the plan
 * and to give each claim a task). At inspect the plan is still to come, with the registration's result.
 */
const SENT_AS_PLANNED = "which task covers each claim and which are left out: send both as given. ";
const LOOK_BEYOND = "Look beyond the claims too. ";
export const CLAIMS_PLANNED = `AskRigor's plan already says ${SENT_AS_PLANNED}${LOOK_BEYOND}`;
/** The same for a light plan, whose go-ahead says to do only what its menu lists. */
export const CLAIMS_PLANNED_LIGHT = `AskRigor's plan already says ${SENT_AS_PLANNED}`;
export const CLAIMS_PLANNED_AT_INSPECT = "AskRigor's plan, which comes with that call's result, says " +
  `${SENT_AS_PLANNED}${LOOK_BEYOND}`;

/**
 * What covering several claims with one task takes, for the screen and for AskRigor's planner (the review of 24 Nov 2026,
 * part 2: one broad search declared for every claim was the cheapest way to comply, and nothing then changed).
 */
const COVERS_SEVERAL = "one task may cover several, but only where its own result could show each of them wrong: the task " +
  "that reads the study or source that settles a claim covers it, the search that finds that source does not";

/** R3: the line of the screen's instructions, after the search for what would show a premise wrong. */
export const CLAIMS_AT_THE_SCREEN = "On the menu, account for every claim of the plain answer: a task that could " +
  `confirm or correct it names it in its claims (${COVERS_SEVERAL}), and such a task is never only detail; or ` +
  "the claim stands in left_out with why. Never leave out a verdict on a premise, or a claim whose being wrong could " +
  "harm the person. ";

/** R3: the two fields in the menu's shape. */
export const CLAIMS_TASK_SHAPE = "claims, the numbers of the plain answer's claims this task could confirm or correct, " +
  "as register_plain_answer's result numbered them, only for a task that covers one; ";
export const LEFT_OUT_SHAPE = " And left_out, for each claim no task covers, {claim, that claim word for word; why, in " +
  `the person's language and at most ${CLAIM_ACCOUNTING_LIMITS.why} characters: that checking it could not change what ` +
  "they do or believe, or that the tasks the person asked for and a serious risk's tasks left no room}.";

/**
 * R4: the planner's rule, a paragraph of its own rubric. quick_answer_claims stay as they are in the bundle; a claim's
 * number is its place in that list.
 */
export const CLAIMS_RUBRIC = `Account for every one of quick_answer_claims, numbered from 1 in the order given: a task that could confirm or
correct it lists its number in claims, or the claim goes in left_out with why, written for the person in their
language, at most ${CLAIM_ACCOUNTING_LIMITS.why} characters. Cover claims with the tasks you already plan where one settles them (one task may
cover several, but only where its own result could show each of them wrong: the task that reads the study or source
that settles a claim covers it, the search that finds that source does not); add a task for a claim only when none
does, and such a task is never only detail. Leave a claim out only when checking it could not change what the person
does or believes, or when step 3's limits leave no room after the tasks the person asked for and the tasks a serious
risk needs; say which, concretely. Never leave out a claim on something the question takes for granted, or one whose
being wrong could harm the person, and menu_history is never a reason. In lane light the one task lists the claims it
settles and the rest go in left_out; in lane aside both stay empty.`;
