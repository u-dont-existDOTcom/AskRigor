import { createHmac } from "node:crypto";

import { z } from "zod";

import {
  ADJUSTMENT_DETAILS,
  CHECK_BACK_MINUTES,
  RESEARCH_STYLES,
  type AdjustmentDetail,
  type ResearchSteering,
  type ResearchStyle,
} from "@askrigor/evidence-repository";

import { RESEARCH_RECEIPT_MAX_CHARACTERS } from "./research-receipts.js";

/**
 * Research the person can steer (owner answer 279a, 9 November 2026, from the owner's report AskRigor#434): a
 * sodium-to-potassium question took about 52 minutes with AskRigor against about a minute without, stayed on the
 * literal question, and never asked whether the question's premise was the one the person meant. HRP's
 * Pre-Research Optimization and Approval Gate already asks for framing, a first pass that stops early and steering, and
 * none of it visibly ran: the protocol's words don't move the model at the point of use, AskRigor's results do. So the
 * steps go through calls AskRigor sees, with no new blocking check:
 *
 * 1. Framing, with the plain answer: register_plain_answer takes later_inputs.framing (the question the person most
 *    likely means, premises that look inverted or unclear, questions that could redirect the research), and its result
 *    says, by the account's research style, whether to ask the person before researching.
 * 2. A cheap screen, then a menu: plan_research takes the next tasks the screen found, gives each a time range, picks
 *    a recommendation, and says whether to show the menu and wait, by the account's research style.
 * 3. The loop between people's reports and studies (the owner, 9 Nov: "make sure we have the forum to study feedback
 *    loop in place when warranted"): a task may be marked as a study search for what people reported, or a look at
 *    people's reports for what a study found, so the loop is a numbered task the person sees and can choose.
 *
 * What a task could change, what people's reports raised and whether a question could redirect the research stay the
 * model's judgment, in any language; this module only counts, adds and words what the model declares.
 */

export const FRAMING_LIMITS = Object.freeze({ question: 500, item: 300, items: 3 });

export const framingSchema = z.object({
  likely_question: z.string().trim().min(1).max(FRAMING_LIMITS.question)
    .describe("The question the person most likely means, as one sentence in their language."),
  premise_doubts: z.array(z.string().trim().min(1).max(FRAMING_LIMITS.item)).max(FRAMING_LIMITS.items).optional()
    .describe("Up to three things in the question that look inverted, unclear or mistaken, such as a ratio asked " +
      "the wrong way round; none when nothing does."),
  redirecting_questions: z.array(z.string().trim().min(1).max(FRAMING_LIMITS.item)).max(FRAMING_LIMITS.items)
    .optional()
    .describe("Up to three questions for the person whose answers could change what to research; none when the " +
      "question is clear."),
}).strict();
export type Framing = z.output<typeof framingSchema>;

export const researchSteeringInputSchema = z.object({
  style: z.enum(RESEARCH_STYLES).optional()
    .describe("guided: ask at the framing and before every long task; balanced (the default): ask only questions " +
      "that could redirect the research, and show the menu of next tasks and wait when they could take more than " +
      "about 10 minutes or the person's choices could steer the research, as they usually can unless the question is " +
      "precise; autonomous: go on through the passes and check back after the time allowance."),
  checkBackMinutes: z.number().int().min(CHECK_BACK_MINUTES.min).max(CHECK_BACK_MINUTES.max).optional()
    .describe("Minutes of research before checking back with the person, 1 to 120; 10 by default."),
  adjustmentDetail: z.enum(ADJUSTMENT_DETAILS).optional()
    .describe("What the answer says about the variables each key observational study adjusted for: flagged (the " +
      "default), only those that look doubtful on a quick check; all, each one with its likely role."),
}).strict();
export type ResearchSteeringInput = z.output<typeof researchSteeringInputSchema>;

/**
 * The kinds of task a menu holds, each with a planning estimate in minutes per source (a search, an abstract, a paper,
 * a thread, a video or a registry record), low and high. Calibrated on 9 Nov 2026 from 14 of the owner's regression
 * questions run through Codex's AskRigor app on the live build (13 go-ahead menus): the research after each go-ahead
 * menu, split by kind of task and divided by the sources its tasks declared; low and high hold about the middle half of
 * what was measured (docs/superpowers/plans/2026-11-09-research-steering.md, "The time estimates"). The starting values
 * (a paper 3 to 6 minutes, a thread 2 to 6, an audit 8 to 15, a video's comments 5 to 15) were two to five times too
 * long. One model at a high effort, fitted on the runs it is checked against: later runs confirm or correct it. A kind
 * no measured task declared keeps its starting value (abstract_screen).
 */
export const PLAN_TASK_MINUTES = Object.freeze({
  study_search: [0.5, 2.5],
  abstract_screen: [0.2, 0.5],
  full_text: [1, 2.5],
  method_audit: [2, 4],
  forum_thread: [0.5, 1.5],
  video_comments: [1, 4],
  video_claims: [1, 3],
  trial_registry: [0.3, 1],
} as const satisfies Record<string, readonly [number, number]>);
/**
 * After the tasks, the final check and writing the answer: 4.0 to 8.7 minutes in the middle half of the 13 measured
 * go-ahead menus (median 6.7). The menu says it beside the tasks; it isn't part of the 10 minutes that decide whether
 * to ask first.
 */
export const ANSWER_MINUTES = Object.freeze([4, 10] as const);
export const PLAN_TASK_KINDS = ["study_search", "abstract_screen", "full_text", "method_audit", "forum_thread",
  "video_comments", "video_claims", "trial_registry", "other"] as const;
export type PlanTaskKind = (typeof PLAN_TASK_KINDS)[number];
export const COULD_CHANGE = ["conclusion", "confidence", "detail"] as const;
export const RESEARCH_LOOPS = ["people_to_studies", "studies_to_people"] as const;
export const PLAN_LIMITS = Object.freeze({ tasks: 12, task: 200, sources: 50, minutes: 240, provisional: 1_500 });

const minutesSchema = z.number().min(0).max(PLAN_LIMITS.minutes);

export const planTaskSchema = z.object({
  task: z.string().trim().min(3).max(PLAN_LIMITS.task)
    .describe("What the task does, as the person will read it, in their language."),
  kind: z.enum(PLAN_TASK_KINDS)
    .describe("study_search, abstract_screen, full_text (read a paper in full), method_audit (a study's methods " +
      "audited), forum_thread, video_comments, video_claims, trial_registry, or other."),
  sources: z.number().int().min(1).max(PLAN_LIMITS.sources).optional()
    .describe("How many searches, abstracts, papers, threads, videos or records it covers; 1 by default."),
  could_change: z.enum(COULD_CHANGE)
    .describe("What it could change: the conclusion, how sure the answer can be, or only detail."),
  loop: z.enum(RESEARCH_LOOPS).optional()
    .describe("people_to_studies: a study search for something people's reports raised; studies_to_people: a look " +
      "at people's reports for something a study found."),
  minutes: z.tuple([minutesSchema, minutesSchema]).optional()
    .describe("Your own estimate, low and high, for a task of kind other, or when the task is much longer or shorter " +
      "than its kind's usual time."),
}).strict();
export type PlanTask = z.output<typeof planTaskSchema>;

export const researchMenuSchema = z.object({
  research_target: z.string().trim().min(1).max(5_000)
    .describe("The research target, word for word as registered with the plain answer."),
  plain_answer_receipt: z.string().trim().min(1).max(RESEARCH_RECEIPT_MAX_CHARACTERS).optional()
    .describe("The plain answer's research_receipt, so AskRigor can check the research target and the time since."),
  provisional_answer: z.string().trim().min(1).max(PLAN_LIMITS.provisional).optional()
    .describe("What the screen suggests so far, in a few sentences."),
  steering_could_help: z.boolean().optional()
    .describe("From the screen: true when the person's own choices, such as which tasks, how deep, or which reading " +
      "or form they mean, could make the research more useful to them, as they usually can; false only when the " +
      "question is precise enough that they could not. Left out, it counts as true."),
  tasks: z.array(planTaskSchema).min(1).max(PLAN_LIMITS.tasks)
    .describe("The next tasks the screen found, in the order you would do them."),
  allocation: z.array(z.object({
    task: z.number().int().min(1).max(PLAN_LIMITS.tasks),
    minutes: minutesSchema,
  }).strict()).max(PLAN_LIMITS.tasks).optional()
    .describe("The person's own allocation, by task number and minutes, once they gave one; leave it out before."),
  done: z.array(z.number().int().min(1).max(PLAN_LIMITS.tasks)).max(PLAN_LIMITS.tasks).optional()
    .describe("Task numbers already done, when you call again after a stop or a change of direction."),
  menu_digest: z.string().trim().min(1).max(100).optional()
    .describe("On every call after the first: researchMenu.menu_digest from the last plan_research result, as it is; " +
      "when the tasks differ from the menu it names, AskRigor shows the person the changed menu first."),
}).strict();
export type ResearchMenuInput = z.output<typeof researchMenuSchema>;

/**
 * The menu the person saw (the review of 12 Nov 2026): a re-plan before any task was done, with a new task added, could
 * go on without the person's choice, since only a done list marked a re-plan. Each plan_research result carries a digest
 * of its task list, keyed with the server's signing secret, and the next call passes it back: when the call's tasks
 * differ from it and the call carries no allocation that counts as the person's answer, the AI changed the menu on its
 * own, and research that may ask shows the person the changed menu. A call with the person's allocation goes on with
 * it, as they may have changed the menu themselves. A call without a digest is planned as before. Exact, never meaning: what the person chose among is compared, the number
 * of tasks and, in order, each one's kind, what it could change and its loop. A task's wording, sources and minutes are
 * not: a model that retypes the menu when it sends the person's answer, or estimates a task's time again, would
 * otherwise ask the person a second time about the menu they just answered, and the allocation the call carries already
 * says how long each task may take.
 */
export function menuDigest(tasks: readonly PlanTask[], secret: string): string {
  const canonical = JSON.stringify(tasks.map(({ kind, could_change, loop }) => [kind, could_change, loop ?? null]));
  const key = createHmac("sha256", secret).update("askrigor research menu digest v1").digest();
  return `md1~${createHmac("sha256", key).update(canonical).digest().subarray(0, 16).toString("base64url")}`;
}

/**
 * The menu as plan_research reads it (12 Nov 2026, the owner's ChatGPT at Extra High): every run's plan_research call
 * was refused three to five times before one passed, as the model guessed the menu's names, types and places: the
 * research target in camelCase, tasks as titles, a number for a task's minutes, null for one left out, the allocation
 * as user_allocation or beside the menu, and keys that are no part of it, such as a focus or the person's reply. Each
 * of those is structural: a key is read in the menu's own name when its snake_case form is one (researchTarget,
 * couldChange), a task's title or name is its text when it gives none, one number n is the range [n, n], a null
 * optional field is left out, user_allocation and allocations are the allocation, and an allocation or done list
 * beside the menu goes inside it when it has none. Anything else is left out and named in the result. Nothing here
 * reads meaning: kind and could_change must still be one of their values, and each task must still be an object.
 */
export interface MenuReading {
  /** The call's later_inputs as plan_research reads them: the menu alone, in its own names. */
  later: Record<string, unknown>;
  /** The menu so read, when the call gave one in later_inputs. */
  menu?: unknown;
  /** With no menu: the menu's fields given in later_inputs itself, for the refusal's example. */
  flat?: Record<string, unknown>;
  /** Keys left out, by their path in the call. */
  ignored: string[];
  /** Keys read inside the menu from beside it: their path, and the menu field. */
  moved: Array<[string, string]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
/** A key's snake_case form: researchTarget, ResearchTarget and research-target all give research_target. */
const snakeKey = (key: string): string =>
  key.trim().replace(/([a-z0-9])([A-Z])/gu, "$1_$2").replace(/[\s-]+/gu, "_").toLowerCase();
const fieldsOf = (shape: z.ZodRawShape) => new Set(Object.keys(shape));
const optionalFieldsOf = (shape: z.ZodRawShape) =>
  new Set(Object.keys(shape).filter((key) => z.safeParse(shape[key]!, undefined).success));
const MENU_FIELDS = fieldsOf(researchMenuSchema.shape);
const OPTIONAL_MENU_FIELDS = optionalFieldsOf(researchMenuSchema.shape);
const TASK_FIELDS = fieldsOf(planTaskSchema.shape);
const OPTIONAL_TASK_FIELDS = optionalFieldsOf(planTaskSchema.shape);
const ALLOCATION_FIELDS: ReadonlySet<string> = new Set(["task", "minutes"]);
const MENU_ALIASES: Readonly<Record<string, string>> = Object.freeze({ user_allocation: "allocation",
  allocations: "allocation" });
const TASK_ALIASES: Readonly<Record<string, string>> = Object.freeze({ title: "task", name: "task" });

/** An object read in its own field names: exact names first, then other case forms and aliases; the rest left out. */
function inOwnNames(value: Record<string, unknown>, fields: ReadonlySet<string>, aliases: Readonly<Record<string, string>>,
  path: string, ignored: string[], optional: ReadonlySet<string> = new Set()): Record<string, unknown> {
  const read: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) if (fields.has(key)) read[key] = entry;
  for (const [key, entry] of Object.entries(value)) {
    if (fields.has(key)) continue;
    const name = snakeKey(key);
    const field = fields.has(name) ? name : aliases[name];
    if (field !== undefined && !Object.hasOwn(read, field)) read[field] = entry;
    else ignored.push(`${path}.${key}`);
  }
  for (const field of optional) if (read[field] === null) delete read[field];
  return read;
}

function readTask(task: unknown, path: string, ignored: string[]): unknown {
  if (!isRecord(task)) return task;
  const read = inOwnNames(task, TASK_FIELDS, TASK_ALIASES, path, ignored, OPTIONAL_TASK_FIELDS);
  if (typeof read.minutes === "number") read.minutes = [read.minutes, read.minutes];
  return read;
}

const readAllocation = (allocation: unknown, path: string, ignored: string[]): unknown => Array.isArray(allocation)
  ? allocation.map((entry, index) => isRecord(entry)
    ? inOwnNames(entry, ALLOCATION_FIELDS, {}, `${path}[${index}]`, ignored) : entry)
  : allocation;

function readMenu(menu: Record<string, unknown>, path: string, ignored: string[]): Record<string, unknown> {
  const read = inOwnNames(menu, MENU_FIELDS, MENU_ALIASES, path, ignored, OPTIONAL_MENU_FIELDS);
  if (Array.isArray(read.tasks)) read.tasks = read.tasks.map((task, index) => readTask(task, `${path}.tasks[${index}]`, ignored));
  if (read.allocation !== undefined) read.allocation = readAllocation(read.allocation, `${path}.allocation`, ignored);
  return read;
}

/** A plan_research call's later_inputs, read as the menu (above). */
export function readResearchMenu(later: Record<string, unknown>): MenuReading {
  const ignored: string[] = [];
  const moved: Array<[string, string]> = [];
  const menuKey = Object.hasOwn(later, "researchMenu") ? "researchMenu"
    : Object.keys(later).find((key) => snakeKey(key) === "research_menu");
  if (menuKey === undefined) {
    const flat = inOwnNames(later, MENU_FIELDS, MENU_ALIASES, "later_inputs", ignored, OPTIONAL_MENU_FIELDS);
    return { later: {}, flat: readMenu(flat, "later_inputs", []), ignored, moved };
  }
  const given = later[menuKey];
  const menu = isRecord(given) ? readMenu(given, `later_inputs.${menuKey}`, ignored) : given;
  for (const [key, value] of Object.entries(later)) {
    if (key === menuKey) continue;
    const name = snakeKey(key);
    const field = name === "allocation" || name === "done" || name === "menu_digest" ? name : MENU_ALIASES[name];
    if (field !== undefined && value === null) continue;
    if (field !== undefined && isRecord(menu) && menu[field] === undefined) {
      menu[field] = field === "allocation" ? readAllocation(value, `later_inputs.${key}`, ignored) : value;
      moved.push([`later_inputs.${key}`, `researchMenu.${field}`]);
    } else ignored.push(`later_inputs.${key}`);
  }
  return { later: { researchMenu: menu }, menu, ignored, moved };
}

/** What the result says about a menu read so (one sentence), or nothing when it was read as given. */
export function menuReadingSentence({ ignored, moved }: Pick<MenuReading, "ignored" | "moved">): string | undefined {
  const named = (paths: readonly string[]) => paths.length <= 8 ? paths.join(", ")
    : `${paths.slice(0, 8).join(", ")} and ${paths.length - 8} more`;
  const parts = [
    ...(moved.length === 0 ? [] : [`read ${named(moved.map(([from, to]) => `${from} as ${to}`))}: the allocation and ` +
      "done list go inside researchMenu"]),
    ...(ignored.length === 0 ? [] : [`ignored ${named(ignored)}, ${ignored.length === 1 ? "which is" : "which are"} ` +
      "not part of plan_research's menu"]),
  ];
  return parts.length === 0 ? undefined : `AskRigor ${parts.join(", and ")}.`;
}

/** A menu's refusal example's placeholders, each to be replaced by a value it lists. */
export const MENU_PLACEHOLDERS = Object.freeze({
  research_target: "<the research target, word for word as register_plain_answer's result quoted it>",
  task: "<what the task does, in the person's language>",
  kind: `<${PLAN_TASK_KINDS.join("|")}>`,
  could_change: `<${COULD_CHANGE.join("|")}>`,
});

/** The refusal's example, as structuredContent carries it: placeholders stand where a value is missing or not one. */
export const correctedMenuSchema = z.object({
  researchMenu: z.object({
    research_target: z.string(),
    plain_answer_receipt: z.string().optional(),
    provisional_answer: z.string().optional(),
    steering_could_help: z.boolean().optional(),
    tasks: z.array(z.object({
      task: z.string(),
      kind: z.string(),
      sources: z.number().int().optional(),
      could_change: z.string(),
      loop: z.enum(RESEARCH_LOOPS).optional(),
      minutes: z.tuple([z.number(), z.number()]).optional(),
    }).strict()).min(1),
    allocation: z.array(z.object({ task: z.number().int(), minutes: z.number() }).strict()).optional(),
    done: z.array(z.number().int()).optional(),
    menu_digest: z.string().optional(),
  }).strict(),
}).strict();
export type CorrectedMenu = z.output<typeof correctedMenuSchema>;

/**
 * A refused menu's example, built from the call's own: its research target and task texts (a task given as text is
 * that text), each with its kind and could_change when they are one of their values and a placeholder listing them
 * when not, and every other field the call gave that is valid as given.
 */
export function correctedMenu(source: unknown): CorrectedMenu {
  const menu = isRecord(source) ? source : {};
  const valid = (shape: z.ZodRawShape, field: string, value: unknown) =>
    value !== undefined && z.safeParse(shape[field]!, value).success;
  const target = menu.research_target;
  const tasks = Array.isArray(menu.tasks) && menu.tasks.length > 0 ? menu.tasks.slice(0, PLAN_LIMITS.tasks) : [undefined];
  const example: CorrectedMenu["researchMenu"] = {
    research_target: valid(researchMenuSchema.shape, "research_target", target) ? (target as string).trim()
      : MENU_PLACEHOLDERS.research_target,
    ...Object.fromEntries((["plain_answer_receipt", "provisional_answer", "steering_could_help"] as const)
      .filter((field) => valid(researchMenuSchema.shape, field, menu[field]))
      .map((field) => [field, typeof menu[field] === "string" ? (menu[field] as string).trim() : menu[field]])),
    tasks: tasks.map((task) => {
      const given = isRecord(task) ? task : {};
      const text = typeof task === "string" ? task : given.task;
      const words = typeof text === "string" ? text.trim().slice(0, PLAN_LIMITS.task) : "";
      return {
        task: words.length >= 3 ? words : MENU_PLACEHOLDERS.task,
        kind: valid(planTaskSchema.shape, "kind", given.kind) ? given.kind as string : MENU_PLACEHOLDERS.kind,
        ...(valid(planTaskSchema.shape, "sources", given.sources) ? { sources: given.sources as number } : {}),
        could_change: valid(planTaskSchema.shape, "could_change", given.could_change) ? given.could_change as string
          : MENU_PLACEHOLDERS.could_change,
        ...(valid(planTaskSchema.shape, "loop", given.loop)
          ? { loop: given.loop as (typeof RESEARCH_LOOPS)[number] } : {}),
        ...(valid(planTaskSchema.shape, "minutes", given.minutes)
          ? { minutes: given.minutes as [number, number] } : {}),
      };
    }),
    ...(valid(researchMenuSchema.shape, "allocation", menu.allocation)
      ? { allocation: menu.allocation as Array<{ task: number; minutes: number }> } : {}),
    ...(valid(researchMenuSchema.shape, "done", menu.done) ? { done: menu.done as number[] } : {}),
    ...(valid(researchMenuSchema.shape, "menu_digest", menu.menu_digest)
      ? { menu_digest: (menu.menu_digest as string).trim() } : {}),
  };
  return correctedMenuSchema.parse({ researchMenu: example });
}

/** A refused menu's problems, one per issue, by its path in the call. */
export function menuProblems(issues: readonly z.core.$ZodIssue[], path = "later_inputs.researchMenu"): string[] {
  return issues.map((issue) => `${issue.path.reduce<string>((text, part) => typeof part === "number"
    ? `${text}[${part}]` : `${text}.${String(part)}`, path)}: ${issue.message}`);
}

/** The refusal's text: what could not be read, the example to call with, and what was read or left out. */
export function menuRefusalText(problems: readonly string[], example: CorrectedMenu, reading?: string): string {
  return [
    `AskRigor could not read this plan_research call's menu, so it planned nothing: ${problems.join("; ")}.`,
    "Call manage_research_access with action plan_research again with these later_inputs, built from yours, after " +
      "replacing each <...> with one of the values it lists (a task's kind, and could_change: whether the task could " +
      "change the conclusion, how sure the answer is, or only detail); the allocation, once the person gives one, goes " +
      `inside researchMenu: ${JSON.stringify(example)}`,
    ...(reading === undefined ? [] : [reading]),
  ].join("\n");
}

/** The style's wording, as the person would read it. */
const STYLE_WORDS: Readonly<Record<ResearchStyle, string>> = Object.freeze({
  guided: "guided (asks you at the start and before every long task)",
  balanced: "balanced (asks only questions that could redirect the research, and shows the menu of next tasks when " +
    "they could take more than about 10 minutes or when your choices could steer the research, as they usually can " +
    "unless the question is precise)",
  autonomous: "autonomous (goes on through the research and reports as it goes)",
});

const ADJUSTMENT_WORDS: Readonly<Record<AdjustmentDetail, string>> = Object.freeze({
  flagged: "only adjustments that look doubtful on a quick check",
  all: "each adjusted variable with its likely role",
});

/** One sentence naming an account's research style, for inspect and set_research_steering. */
export function steeringSentence(steering: ResearchSteering): string {
  return `Research style: ${STYLE_WORDS[steering.style]}, checking back after ${steering.checkBackMinutes} ` +
    `${steering.checkBackMinutes === 1 ? "minute" : "minutes"}; for what key observational studies adjusted for, ` +
    `${ADJUSTMENT_WORDS[steering.adjustmentDetail]}.`;
}

/** What inspect adds for an active account: its style, and how the person changes it. */
export function steeringInspectText(steering: ResearchSteering): string {
  return `${steeringSentence(steering)} When the person asks to change any of these, call action ` +
    "set_research_steering with later_inputs.researchSteering (style guided, balanced or autonomous; " +
    `checkBackMinutes ${CHECK_BACK_MINUTES.min} to ${CHECK_BACK_MINUTES.max}; adjustmentDetail flagged or all). It ` +
    "applies to this account's research until changed, and never overrides a safety, privacy or truthfulness rule.";
}

/** What a quick look at a key observational study's adjustments should show, by the account's choice. */
export function adjustmentGuidance(detail: AdjustmentDetail): string {
  const look = "When you read a key observational study's main model, look at what it adjusted for: whether each " +
    "variable is a shared cause, a step on the path from cause to effect, something both affect, something that " +
    "changes the effect, or there for precision only, and whether an obvious shared cause is missing.";
  return detail === "all"
    ? `${look} The person asked to see all of it: list each key study's adjusted variables with each one's likely ` +
      "role, and say which roles are doubtful and what they could change."
    : `${look} In the answer, mention only adjustments that look doubtful or disputed, such as adjusting for a step ` +
      "on the path or for something both affect, or leaving out an obvious shared cause, with what each could change " +
      "and an offer to look deeper; say nothing about the rest unless the person asks.";
}

/**
 * The owner, 9 November 2026, after a Syrian rue oil comparison: answers without AskRigor called an oil "potentially
 * strong" from an abstract that called it rich in the active alkaloids and gave no amount ("significant is a weasel word
 * in science"). The paper's full text had the amounts, about 0.9% of the oil, and none of the answers read it: the word
 * is a reason to find the number, not to accept or dismiss the claim. This applies HRP's effect_magnitude ("A bare
 * significant or nonsignificant label is not a magnitude") and NumericExposureOverridesAmbiguousLabels at the moment
 * sources are read. Which sense a word carries is the model's judgment, in any language; nothing here matches words.
 */
export const WORDS_ARE_NOT_SIZES = "A source's significant, rich, high, substantial or strong, in any language, is not a " +
  "size: find which sense it has (statistically significant, a large amount, or only detected) and the number behind " +
  "it, and compare that number with what the question needs, such as the amount in a usual dose; when the source gives " +
  "no number, say so beside the claim and don't let the word carry the conclusion. Write significant in the answer " +
  "only with its sense and its number.";

/**
 * The owner, same day: the quick screen of a widely used old remedy should first have asked what people who use it
 * report, not only what studies measured. This applies HRP's ForumSignalDefaultTrigger and
 * NoFixedStudiesThenCommunitySequence to the screen; whether they apply is the model's judgment.
 */
const FORUM_TRIGGER_APPLIES = "When the question is about something people take or do, and HRP's " +
  "ForumSignalDefaultTrigger applies (for example a traditional or widely used remedy, or studies that are few or depend " +
  "on the preparation or route),";
export const PEOPLE_FIRST_WHEN_USED = `${FORUM_TRIGGER_APPLIES} screen what people who used it report from the start, ` +
  "beside the studies, not after them.";
export const PEOPLE_TASK_MISSING = `No task on this menu reads people's own reports. ${FORUM_TRIGGER_APPLIES} add a ` +
  "task near the top for what people who used it report about this effect, and call plan_research again before " +
  "showing the menu.";

/**
 * Owner answer 283a (9 Nov 2026): the paper that decided the owner's Syrian rue question sat in a journal PubMed and
 * Europe PMC don't index. Which questions reach such journals is the model's judgment.
 */
export const ALL_JOURNALS_AT_THE_SCREEN = "For a plant, food, farming or traditional remedy, or a question PubMed's " +
  "journals cover thinly, also search all journals once (search_europe_pmc with later_inputs.index \"all_journals\", " +
  "OpenAlex): many of their journals are outside PubMed and Europe PMC.";
/**
 * The timing runs of 9 Nov 2026: in the made-up antivenom emergency, the run framed, screened, showed a menu and
 * researched for 17 minutes, first saying plainly not to delay the antivenom at minute 9.6. HRP already forbids it
 * (ParallelEmergencyAndAdjunctQuestions, NoEmergencyWarningOvercorrection); whether a question is urgent is the model's
 * judgment.
 */
export const URGENT_FIRST = "If the question is about an emergency happening now, or a decision that can't wait, give " +
  "the person the urgent action from your plain answer in your first lines, before any research call, menu or question " +
  "about how to spend the time; research only after that, and only what could still change the action " +
  "(HRP ParallelEmergencyAndAdjunctQuestions and NoEmergencyWarningOvercorrection).";

/**
 * The owner, 9 Nov 2026 (a reply in the Inbox on the Syrian rue oil check): the oil that held the alkaloids was extracted
 * with hexane, which nobody sells, so a person asking about the oil most likely means seeds steeped in a household oil,
 * and the AI should confirm that with them. It applies HRP's WholeInterventionIdentityTrace (the tested against the sold
 * version) and UserReportedUseFidelity (the form actually used); which forms matter is the model's judgment.
 */
export const FORM_PEOPLE_USE = "When the answer turns on a form or preparation, such as an extract, an oil, a tea or a " +
  "dose form, the likely question is about the form people can actually buy or make: check what is sold or commonly " +
  "made, and when the forms differ much in strength, ask which form the person has as a redirecting question and, " +
  "until they say, answer for each form (HRP WholeInterventionIdentityTrace and UserReportedUseFidelity).";

/**
 * The menu's exact shape, field by field. The timing runs of 9 Nov 2026 (Codex's AskRigor app on the live build): every
 * case's first plan_research call was refused, 12 of 22 in all, because the model guessed the fields (what_it_could_change,
 * label, a sentence as could_change, invented kinds, no research_target) and learned them from the refusal. The runs of
 * 10 Nov on the released 284 rule: every first call accepted, but steering_could_help false on all 14 questions, open
 * ones included (a person's own three symptoms, an oil whose form changes its strength), against the owner's "usually
 * can unless the prompt is quite precise"; so the field now carries HRP's own test for when approval is required.
 */
export const RESEARCH_MENU_SHAPE = "later_inputs.researchMenu in exactly this shape: research_target, the research target " +
  "word for word as register_plain_answer's result quoted it; plain_answer_receipt, that call's research_receipt; " +
  "provisional_answer, what the screen suggests, in a few sentences; steering_could_help, true when a choice the " +
  "person could make, or something only they know, could materially change what the research checks (HRP " +
  "StructuredUserSteeringAndApproval): such as their own situation or what they have tried, the form, dose or route " +
  "they use, what to compare it with, which outcome matters most to them, people's reports or studies, or how deep; " +
  "as it usually can, even when the question is clearly worded; false only when the question already fixes all of " +
  "that, such as one result of one named study; and tasks, the next tasks the screen found, in " +
  "order, each {task, what it does in the person's language; kind, one of study_search, abstract_screen, full_text, " +
  "method_audit, forum_thread, video_comments, video_claims, trial_registry or other; could_change, one of conclusion, " +
  "confidence or detail; sources, how many searches, abstracts, papers, threads, videos or records it covers; loop, " +
  "people_to_studies or studies_to_people, only for a task between people's reports and studies; and minutes, [low, " +
  "high], only for a task of kind other or one much longer or shorter than its kind's usual time}. Leave out any other " +
  "field: allocation and done come only after the person answers or stops you, and menu_digest, as the last " +
  "plan_research result gave it, on every call after the first.";
/**
 * The screen, then the menu. The timing runs of 10 Nov 2026 (Codex, the 284 rule on the live build): the screens took 4
 * to 9 calls, and none of the 21 turns ended with the question AskRigor said to ask, so the screen says how short it is
 * and that an ask ends the turn, before the model starts it.
 */
const SCREEN_FIRST = "Screen first: a few calls (about eight) of searches, abstracts, thread titles and the Atlas, " +
  "with no full-text reading, long threads or video audits yet, ending with a provisional short answer. For each " +
  "claim on a premise of the person's question, include one search for what would show it wrong. " +
  PEOPLE_FIRST_WHEN_USED + " " + ALL_JOURNALS_AT_THE_SCREEN + " " + WORDS_ARE_NOT_SIZES + " Then call " +
  "manage_research_access with action plan_research and " + RESEARCH_MENU_SHAPE + " AskRigor gives each task a time " +
  "range and says whether to ask the person first; when it says to ask, your reply is the message it gives, and the " +
  "turn ends there.";

/**
 * A doubt about the question becomes a claim of the plain answer only when it could be false, not when it is only
 * unclear or inverted, which is the person's to settle (11 Nov 2026). Which doubts could be false is the model's
 * judgment.
 */
const PREMISE_NOT_YET_A_CLAIM = "a doubt that could be false, not only unclear, is not yet a claim of the plain answer";
const PREMISE_VERDICT = "with a sentence giving your quick verdict on it among the claims, so the final check " +
  "compares it";
const FRAMING_ANSWERED = "leaving later_inputs.framing out now that the person has answered (its result's request " +
  "for a framing is for the next question)";

/**
 * What register_plain_answer's result says next, by the account's research style and the framing given with it. Whether
 * a question could redirect the research is the model's own judgment, made when it wrote the framing.
 *
 * The owner, 11 Nov 2026 ("it's still not asking me any steering questions"): an ask followed by the screen's
 * instructions in the same string reads as leave to go on, so the ask says the whole reply is the questions and the turn
 * ends there, as HRP's preflight-only response allows when steering is required.
 */
export function framingGuidance(steering: ResearchSteering, framing: Framing | undefined): string {
  if (framing === undefined) {
    return URGENT_FIRST + " Give later_inputs.framing with the plain answer next time: likely_question, the question the person most " +
      "likely means; premise_doubts, anything in it that looks inverted, unclear or possibly false; and " +
      "redirecting_questions, up to three questions whose answers could change what to research. " + FORM_PEOPLE_USE +
      " " + SCREEN_FIRST;
  }
  const doubts = framing.premise_doubts ?? [];
  const questions = framing.redirecting_questions ?? [];
  const parts: string[] = [URGENT_FIRST, `Framing: the person most likely means ${JSON.stringify(framing.likely_question)}.`];
  const doubted = doubts.map((doubt) => JSON.stringify(doubt)).join("; ");
  const asked = questions.map((question, index) => `${index + 1}. ${question}`).join(" ");
  if (questions.length > 0 && steering.style !== "autonomous") {
    // An ask: the doubts go in its one line, and any new registration waits for the answers. The framing isn't stored,
    // so a registration made now without it would say to screen and cancel the ask; made after the answers with it, it
    // would ask the answered questions again, so it leaves the framing out.
    parts.push(`Ask the person these questions now, before any research call: ${asked} Your whole reply this turn is ` +
      "these questions, in the person's language, after the urgent action if the question is urgent, with at most one " +
      "line before them on what your plain answer suggests, marked not yet checked" + (doubts.length === 0 ? ""
        : `, and on what looks inverted, unclear or possibly false in the question (${doubted})`) +
      "; then end your turn, with no research call. When they answer: " + (doubts.length === 0
        ? "if the answers change the question, register the plain answer again for the new research target"
        : "register the plain answer again if the answers change the question (for the new research target) or if " +
          `${PREMISE_NOT_YET_A_CLAIM} (${PREMISE_VERDICT})`) +
      `, ${FRAMING_ANSWERED}; then screen and plan as follows.`);
  } else if (questions.length === 0 && steering.style === "guided") {
    parts.push("The person chose guided research: your whole reply this turn is one line confirming the question you " +
      "will research and asking for their yes" +
      (doubts.length === 0 ? "" : `, saying in it what looks inverted, unclear or possibly false (${doubted})`) +
      "; then end your turn. After their yes, " + (doubts.length === 0 ? "" : `if ${PREMISE_NOT_YET_A_CLAIM}, ` +
        `register the plain answer again ${PREMISE_VERDICT}, ${FRAMING_ANSWERED}; then `) +
      "screen and plan as follows.");
  } else {
    // Going on: the doubts are said with the reading taken, and a registration made now keeps the same framing, which
    // asks nothing.
    if (doubts.length > 0) {
      parts.push("Say plainly near the start of your reply what looks inverted, unclear or possibly false " +
        `(${doubted}), and which reading you take. If ${PREMISE_NOT_YET_A_CLAIM}, register the plain answer ` +
        "again now, before any research call, with the same later_inputs.framing and a sentence giving your quick " +
        "verdict on it among the claims, so the final check compares it.");
    }
    parts.push(questions.length > 0
      ? "The person chose autonomous research, so don't stop to ask: say in one line which reading you take, and " +
        `keep these questions for your first check-back: ${asked} Ask now only if one could reverse the answer.`
      : "No question could redirect the research, so go on without asking.");
  }
  parts.push(SCREEN_FIRST);
  return parts.join(" ");
}

/**
 * register_plain_answer's next step as a runtime field (owner answer 189a keeps the published shape): Claude Code hands
 * its model a result's structured content and leaves out its text (docs/claude-connector.md, "What the model sees"), so
 * the stop goes there too. It follows framingGuidance's branches.
 */
export function framingNextStep(steering: ResearchSteering, framing: Framing | undefined): string {
  const asks = (framing?.redirecting_questions ?? []).length > 0;
  const doubts = (framing?.premise_doubts ?? []).length > 0;
  if (framing !== undefined && asks && steering.style !== "autonomous") {
    return "Ask the person your framing's redirecting_questions now and end your turn: no research call until they " +
      "answer. Then register the plain answer again if their answers change the question" +
      (doubts ? " or a doubt that could be false is not yet a claim" : "") + ", leaving later_inputs.framing out (its " +
      "result's request for a framing is for the next question); then screen and call action plan_research.";
  }
  if (framing !== undefined && !asks && steering.style === "guided") {
    return "Confirm the question you will research in one line, ask for the person's yes and end your turn; after " +
      "their yes, " + (doubts ? "register the plain answer again, leaving later_inputs.framing out (its result's " +
        "request for a framing is for the next question), if a doubt that could be false is not yet a claim; then "
        : "") + "screen and call action plan_research.";
  }
  return (doubts ? "If a doubt that could be false is not yet a claim of the plain answer, register the plain answer " +
    "again first, with the same later_inputs.framing. " : "") + "Screen in a few calls (searches, abstracts, thread " +
    "titles, the Atlas), then call action plan_research with later_inputs.researchMenu; its result says whether to ask " +
    "the person first.";
}

/**
 * Owner answer 284 (10 November 2026), in the owner's words: balanced "should ask if the research could take longer
 * than 10 mins OR if there is reason to believe from the initial analysis that steering could direct the research more
 * usefully, which i'd say it usually can unless the prompt is quite precise". So balanced asks when the recommended
 * tasks' high estimate is past 10 minutes, and whenever the menu doesn't declare steering_could_help false: whether the
 * person's choices could steer the research is the model's judgment from the screen, in any language, as HRP's
 * StructuredUserSteeringAndApproval asks (approval_required against clear_scope_no_pause); this module only compares.
 * It was five minutes: with the measured times, all 14 of the timing runs' first menus came to more than five.
 */
export const ASK_ABOVE_MINUTES = 10;

export interface PlannedTask {
  n: number;
  task: string;
  kind: PlanTaskKind;
  could_change: (typeof COULD_CHANGE)[number];
  loop?: (typeof RESEARCH_LOOPS)[number];
  minutes: [number, number] | null;
}

export interface ResearchPlanResult {
  tasks: PlannedTask[];
  recommended: { task: number; minutes: number }[];
  recommended_minutes: [number, number];
  next: "ask" | "go_on";
  /** The menu's own steering_could_help, when it gave one. */
  steering_could_help?: boolean;
  style: ResearchStyle;
  check_back_minutes: number;
  adjustment_detail: AdjustmentDetail;
  minutes_since_plain_answer?: number;
  target_matches_plain_answer?: boolean;
  /** The digest of this menu's tasks (menuDigest), for the next call. */
  menu_digest?: string;
  /** The tasks differ from the menu the call's menu_digest names: the person hasn't seen this menu. */
  menu_changed?: true;
}

// AskRigor's own estimates are rounded for the menu; the person's minutes never are (below).
const roundEstimate = (minutes: number): number => minutes < 1 ? Math.round(minutes * 2) / 2 : Math.round(minutes);
/** A sum of the person's minutes, free of floating-point dust (0.1 + 0.2 is 0.3), never rounded to whole minutes. */
const minutesSum = (minutes: readonly number[]): number =>
  Math.round(minutes.reduce((sum, value) => sum + value, 0) * 1_000) / 1_000;

/** A task's time range: its own estimate when given, otherwise its kind's per-source range times its sources. */
export function taskMinutes(task: PlanTask): [number, number] | null {
  if (task.minutes !== undefined) {
    const [low, high] = task.minutes;
    return [roundEstimate(Math.min(low, high)), roundEstimate(Math.max(low, high))];
  }
  if (task.kind === "other") return null;
  const [low, high] = PLAN_TASK_MINUTES[task.kind as Exclude<PlanTaskKind, "other">];
  const sources = task.sources ?? 1;
  return [roundEstimate(Math.max(low * sources, 0.5)), roundEstimate(Math.max(high * sources, 1))];
}

const CHANGE_ORDER: Readonly<Record<(typeof COULD_CHANGE)[number], number>> = { conclusion: 0, confidence: 1, detail: 2 };

/**
 * Whether the menu carries the person's answer: an allocation naming at least one task on the menu that is not done.
 * One naming only tasks past the list or already done is not an answer (11 Nov 2026: it went on with nothing
 * recommended), so the menu then recommends and decides as if none had come.
 */
export function allocationAnswered(plan: Pick<ResearchMenuInput, "tasks" | "allocation" | "done">): boolean {
  const done = new Set(plan.done ?? []);
  return (plan.allocation ?? []).some(({ task }) => task <= plan.tasks.length && !done.has(task));
}

/**
 * The menu: each task with its time range; a recommendation, when the person gave none (tasks that could change the
 * conclusion first, then how sure it is, each given its range's middle, while the total stays within the check-back
 * allowance, or the first such task alone when even it is longer); and whether to ask the person before working.
 */
export function planResearch(
  plan: ResearchMenuInput,
  steering: ResearchSteering,
  plainAnswer?: { matches: boolean; minutesSince: number },
  menu?: { digest: string; changed: boolean },
): ResearchPlanResult {
  const done = new Set(plan.done ?? []);
  // A menu that changed after the person saw it is theirs to see first: an allocation given for the one they saw is
  // not an answer to this one.
  const changed = menu?.changed === true;
  const tasks: PlannedTask[] = plan.tasks.map((task, index) => ({
    n: index + 1,
    task: task.task,
    kind: task.kind,
    could_change: task.could_change,
    ...(task.loop === undefined ? {} : { loop: task.loop }),
    minutes: taskMinutes(task),
  }));
  const open = tasks.filter(({ n }) => !done.has(n));
  // An allocation that counts is the person's answer, whether or not the menu changed: they may have added the task
  // themselves when they redirected the research (Greptile's review of 12 Nov 2026: with a changed menu, the person's new
  // allocation was dropped, and autonomous research went on with the default tasks instead). A changed menu with no such
  // answer is the AI's own re-plan, which the person is shown first (below).
  const answered = allocationAnswered(plan);
  let recommended: { task: number; minutes: number }[];
  if (answered) {
    // The person's own minutes, as they gave them (the review of 12 Nov 2026: 1.5 minutes became 2).
    recommended = plan.allocation!.filter(({ task, minutes }) => task <= tasks.length && !done.has(task) && minutes > 0)
      .map(({ task, minutes }) => ({ task, minutes }));
  } else {
    recommended = [];
    let total = 0;
    const candidates = open.filter(({ could_change }) => could_change !== "detail")
      .sort((left, right) => CHANGE_ORDER[left.could_change] - CHANGE_ORDER[right.could_change] || left.n - right.n);
    for (const task of candidates) {
      const minutes = task.minutes === null ? 2 : roundEstimate((task.minutes[0] + task.minutes[1]) / 2);
      if (recommended.length > 0 && total + minutes > steering.checkBackMinutes) continue;
      recommended.push({ task: task.n, minutes });
      total += minutes;
    }
  }
  const chosen = recommended.map(({ task }) => tasks[task - 1]!);
  const recommendedMinutes: [number, number] = answered
    ? [minutesSum(recommended.map(({ minutes }) => minutes)), minutesSum(recommended.map(({ minutes }) => minutes))]
    : [
        roundEstimate(chosen.reduce((sum, task) => sum + (task.minutes?.[0] ?? 1), 0)),
        roundEstimate(chosen.reduce((sum, task) => sum + (task.minutes?.[1] ?? 3), 0)),
      ];
  // A re-plan (tasks done, and no allocation that counts as the person's answer) with something to do asks, unless the
  // person chose autonomous research: the new-fork sentence sends a new task back to the person, and owner answer 279a
  // has a new fork come back to them (the review of 12 Nov 2026: a precise menu re-planned after the person skipped a
  // task went on, did the task they skipped and never asked about the new one).
  const replanned = tasks.some(({ n }) => done.has(n)) && !answered;
  const next = steering.style === "autonomous" ? "go_on"
    : answered ? "go_on"
    : changed ? "ask"
    : steering.style === "guided" || recommendedMinutes[1] > ASK_ABOVE_MINUTES || plan.steering_could_help !== false ||
        (replanned && recommended.length > 0)
      ? "ask"
      : "go_on";
  return {
    tasks,
    recommended,
    recommended_minutes: recommendedMinutes,
    next,
    ...(plan.steering_could_help === undefined ? {} : { steering_could_help: plan.steering_could_help }),
    style: steering.style,
    check_back_minutes: steering.checkBackMinutes,
    adjustment_detail: steering.adjustmentDetail,
    ...(plainAnswer === undefined ? {} : {
      minutes_since_plain_answer: plainAnswer.minutesSince,
      target_matches_plain_answer: plainAnswer.matches,
    }),
    ...(menu === undefined ? {} : { menu_digest: menu.digest }),
    ...(changed ? { menu_changed: true as const } : {}),
  };
}

const CHANGE_WORDS: Readonly<Record<(typeof COULD_CHANGE)[number], string>> = {
  conclusion: "could change the conclusion",
  confidence: "could change how sure the answer is",
  detail: "adds detail only",
};
const LOOP_WORDS: Readonly<Record<(typeof RESEARCH_LOOPS)[number], string>> = {
  people_to_studies: "studies checked for what people reported",
  studies_to_people: "people's reports checked for what a study found",
};

const range = ([low, high]: [number, number]): string => low === high ? `about ${low} min` : `about ${low} to ${high} min`;

/**
 * Why the menu waits for the person (owner answer 284), worded as the person's own setting: guided research; or, for
 * balanced, recommended tasks that could take more than about 10 minutes, the person's choices that could steer the
 * research (the menu's steering_could_help, true when left out), a plan changed once the research began (a menu with
 * tasks done that asks, which only a re-plan does), or more than one of these. No final period: the ask follows.
 */
function askReason(result: ResearchPlanResult, done: ReadonlySet<number>): string {
  if (result.style === "guided") return "This person chose guided research, which asks before every long task";
  const reasons = [
    ...(result.recommended_minutes[1] > ASK_ABOVE_MINUTES
      ? [`the recommended tasks could take more than about ${ASK_ABOVE_MINUTES} minutes, as these could`] : []),
    ...(result.steering_could_help === false ? [] : [result.steering_could_help === true
      ? "their choices could steer the research, as they could here"
      : "their choices could steer the research, as they usually can (steering_could_help was left out)"]),
    ...(result.tasks.some(({ n }) => done.has(n)) ? ["the plan changes once the research has begun, as it has here"] : []),
    ...(result.menu_changed === true ? ["the menu changes after they saw it, as it has here"] : []),
  ];
  return `This person's research style asks first when ${reasons.join(", and when ")}`;
}

/** Whether a task reads people's own reports: a thread, a video's comments, or a look prompted by a study finding. */
const readsPeoplesReports = ({ kind, loop }: PlannedTask): boolean =>
  kind === "forum_thread" || kind === "video_comments" || loop === "studies_to_people";

const NOTHING_RECOMMENDED = "Nothing more is recommended: the open tasks add detail only.";

/**
 * The ask (the owner, 11 Nov 2026: "it's still not asking me any steering questions"). In the 10 Nov timing runs the
 * rule asked on 9 of 15 first menus and the AI stopped on 2: the ask came fifth, after the menu, and five paragraphs on
 * doing the tasks followed it. So the stop comes first, the reply is handed over ready to send, and nothing follows the
 * rule for the person's answer. HRP allows a reply that only asks when steering is required (its preflight-only exit,
 * and StructuredUserSteeringAndApproval's "begin no substantive source collection in the same response"), so the ask
 * gets no final check.
 */
const ASK_NOW = ". Ask now, before any of these tasks: your whole reply this turn is the message below, in the " +
  "person's language, after the urgent action if the question is urgent; then end your turn. Make no research call " +
  "and don't call finalize_research for this reply: it is a question, not an answer (HRP " +
  "StructuredUserSteeringAndApproval: when approval is required, begin no substantive source collection in the same " +
  "response).";
const HOW_TO_SPEND = "How should I spend the time? Reply with task numbers and minutes, such as \"1. 5 min, 2. 4 min\", " +
  "in your own words, or \"you decide\".";

/**
 * How the tasks are done once the research goes on (the 279a plan: a task that runs out of time stops and says what it
 * reached; a new fork that could change the conclusion comes back to the person, now through the menu).
 */
const TASK_PROGRESS = "Before each task, say in one line what you will read, how deep, and why. A task that runs out " +
  "of its time stops and says in one line what it reached; the next one begins.";
/**
 * A new fork, for the styles that can ask. It leaves the allocation out: a menu that still carries the person's
 * allocation with an open task goes on, and the new task would be neither recommended nor asked about. Autonomous research
 * checks what it has and answers instead, as its own sentence says, so it gets none.
 */
const NEW_FORK = "A new fork that could change the conclusion comes back to the person through the menu: call " +
  "plan_research again with done, the new task and this result's menu_digest, leaving allocation out, and its result " +
  "says whether to ask now.";

/** Whether an ask hands over the "you decide" call: it recommends something, for the registered research target. */
export function offersYouDecide(result: ResearchPlanResult): boolean {
  return result.next === "ask" && result.recommended.length > 0 && result.target_matches_plain_answer !== false;
}

export interface YouDecideLaterInputs { researchMenu: ResearchMenuInput }

/**
 * The "you decide" call's later_inputs, ready to copy (12 Nov 2026: in the owner's ChatGPT run, the reply "you decide"
 * took seven calls, as the allocation went beside the menu, into a setting or nowhere, and the one that went through
 * had none, so the same menu asked again): the same menu, with the recommended allocation inside it. A research target
 * that is not the registered one gets none, since the call must name the registered one, which AskRigor only checks.
 */
export function youDecideLaterInputs(plan: ResearchMenuInput, result: ResearchPlanResult):
  YouDecideLaterInputs | undefined {
  if (!offersYouDecide(result)) return undefined;
  return { researchMenu: {
    research_target: plan.research_target,
    ...(plan.plain_answer_receipt === undefined ? {} : { plain_answer_receipt: plan.plain_answer_receipt }),
    tasks: plan.tasks,
    allocation: result.recommended.map(({ task, minutes }) => ({ task, minutes })),
    ...((plan.done ?? []).length === 0 ? {} : { done: plan.done }),
    ...(result.menu_digest === undefined ? {} : { menu_digest: result.menu_digest }),
  } };
}

/** The line after the rule for the person's answer: the "you decide" call, as it is to be sent. */
export function youDecideLine(youDecide: YouDecideLaterInputs): string {
  return "Only once the person has replied \"you decide\", in a later message, never in this turn: call " +
    "manage_research_access with action plan_research and exactly these later_inputs; " +
    "the recommended allocation is inside researchMenu, where every allocation goes, never beside it: " +
    JSON.stringify(youDecide);
}

/**
 * The plan_research result's text, by the account's style: the ask, or the menu to show while going on. numbered is
 * true once an allocation or a done list refers to the menu's task numbers, which must then stay as they are, so the
 * menu asks for no task near the top. researchTarget, the menu's own, goes word for word into the rule for the person's
 * answer, which a later turn reads, unless the plain answer's receipt shows it is not the registered one.
 */
export function planResearchText(result: ResearchPlanResult, done: ReadonlySet<number>, numbered = false,
  researchTarget?: string, youDecide?: YouDecideLaterInputs): string {
  const lines = result.tasks.map(({ n, task, could_change, loop, minutes }) =>
    `${n}. ${task}: ${CHANGE_WORDS[could_change]}${loop === undefined ? "" : `, ${LOOP_WORDS[loop]}`}; ` +
    `${minutes === null ? "no estimate" : range(minutes)}${done.has(n) ? " (done)" : ""}.`);
  const chosen = result.recommended.map(({ task, minutes }) => `${task}. ${minutes} min`).join(", ");
  const before: string[] = [];
  if (!numbered && !result.tasks.some(readsPeoplesReports)) before.push(PEOPLE_TASK_MISSING);
  if (result.target_matches_plain_answer === false) {
    before.push("This research_target is not the one registered with the plain answer: give plan_research and " +
      "finalize_research the research target word for word as register_plain_answer's result quoted it, or the " +
      "answer ends without the comparison with the quick answer.");
  }
  const since = result.minutes_since_plain_answer === undefined ? [] : [`About ${result.minutes_since_plain_answer} ` +
    `${result.minutes_since_plain_answer === 1 ? "minute has" : "minutes have"} passed since the plain answer was ` +
    "registered."];
  if (result.next === "ask") {
    const reply = [
      "Your reply: at most two sentences on what the first look suggests, saying it is not yet checked" +
        (result.style !== "guided" && result.steering_could_help !== false
          ? ", and one on what their choices could change, such as their own situation, the form or dose they use, " +
            "or the outcome that matters most to them" : "") +
        "; then this menu, numbered as here, saying for each task whether it means a quick look, reading in full or a " +
        "method audit (the times are rough planning estimates):",
      ...lines,
      result.recommended.length === 0 ? NOTHING_RECOMMENDED
        : `Recommended: ${chosen}, ${range(result.recommended_minutes)} in all; then about ${ANSWER_MINUTES[0]} to ` +
          `${ANSWER_MINUTES[1]} min to check and write the answer.`,
      HOW_TO_SPEND,
    ];
    // A menu whose research target is not the registered one gets the registered one named instead, as the first line
    // says; without the plain answer's receipt AskRigor can't tell, so the menu's own is quoted.
    const target = result.target_matches_plain_answer === false ? " as register_plain_answer's result quoted it"
      : researchTarget === undefined ? "" : ` ${JSON.stringify(researchTarget)}`;
    const rule = "When the person replies: call manage_research_access action plan_research again with the same " +
      `plain_answer_receipt, tasks and menu_digest (researchMenu.menu_digest in this result), research_target word for ` +
      `word${target}, and their allocation inside ` +
      "researchMenu, as a list of {task, minutes}; for \"you decide\", or a reply that leaves the choice to you such " +
      "as \"continue\", " + (result.recommended.length === 0
        ? "no more research: check the answer with finalize_research and give it"
        : youDecide === undefined ? "the recommended allocation" : "the call on the next line") + ". If the reply " +
      "changes the question, register the plain answer again for the new research target first, with " +
      "later_inputs.framing for it. Never send an allocation the person did not give or leave to you.";
    return [
      ...(before.length === 0 ? [] : [before.join(" ")]),
      [askReason(result, done) + ASK_NOW, ...since].join(" "),
      reply.join("\n"),
      rule,
      ...(youDecide === undefined ? [] : [youDecideLine(youDecide)]),
    ].join("\n");
  }
  const recommendation = result.recommended.length === 0 ? NOTHING_RECOMMENDED
    : `Recommended: ${chosen}, ${range(result.recommended_minutes)} in all.`;
  return [
    "The menu to show the person, in their language, numbered as here (times are rough planning estimates, and say " +
      "whether a task means a quick look, reading in full or a method audit): " + lines.join(" ") + " " + recommendation +
      ` Then the final check and writing the answer: about ${ANSWER_MINUTES[0]} to ${ANSWER_MINUTES[1]} min.`,
    ...before,
    ...since,
    result.style === "autonomous"
      ? "The person chose autonomous research: show the menu as what you are doing and go on with the recommended " +
        `tasks now. After about ${result.check_back_minutes} minutes of research, or sooner if a new finding could ` +
        "change the conclusion, check what you have with finalize_research and give that answer, ending it with the " +
        "open tasks as a numbered menu and the question whether to spend more time on them."
      : "Go on now: do these tasks in this order, each within its minutes, showing the menu as what you are doing; " +
        "then check the answer with finalize_research and give it in this turn.",
    result.style === "autonomous" ? TASK_PROGRESS : `${TASK_PROGRESS} ${NEW_FORK}`,
    WORDS_ARE_NOT_SIZES,
    "If the person stops you or changes direction, call plan_research again with done, their new allocation and the " +
      "last result's menu_digest; the research target stays word for word the same.",
    "Leads between people's reports and studies are part of the research when the question has both: when the screen " +
      "found something in people's reports that studies could check, or a study finding that people's reports could " +
      "check, and no task covers it, add that task (loop people_to_studies or studies_to_people), and declare each " +
      "lead in finalize_research's later_inputs.community_leads.",
    adjustmentGuidance(result.adjustment_detail),
  ].join(" ");
}

/**
 * plan_research's next step as a runtime field, for an app that hands its model only the structured content (Claude
 * Code): whether to ask and end the turn, or go on, as the text says.
 */
export function planNextStep(result: ResearchPlanResult): string {
  if (result.next === "ask") {
    // A menu with nothing recommended (detail only) gives "you decide" the text's own exit: an empty recommended
    // allocation counts as no answer, so the same menu would ask again (the review of 12 Nov 2026).
    return "Ask the person now and end your turn: show researchMenu.tasks as a numbered list with their times, the " +
      "recommendation and how to answer (task numbers and minutes, or \"you decide\"). Make no research call and " +
      "don't call finalize_research until they answer; then call action plan_research again with their allocation " +
      "inside later_inputs.researchMenu " + (result.recommended.length === 0
        ? "or, for \"you decide\", do no more research: check the answer with finalize_research and give it."
        : offersYouDecide(result) ? "(for \"you decide\", with you_decide_later_inputs as later_inputs, as they are)."
          : "(for \"you decide\", the recommended one).");
  }
  return result.style === "autonomous"
    ? `Do the recommended tasks now; after about ${result.check_back_minutes} minutes of research, check what you ` +
      "have with finalize_research and give that answer, ending it with the open tasks as a numbered menu and the " +
      "question whether to spend more time on them."
    : "Do the recommended tasks now, in order, each within its minutes; then check the answer with finalize_research " +
      "and give it in this turn.";
}
