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
      "that could redirect the research, and show the menu of next tasks when they would take more than about five " +
      "minutes; autonomous: go on through the passes and check back after the time allowance."),
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
 * go-ahead menus (median 6.7). The menu says it beside the tasks; it isn't part of the five minutes that decide whether
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
  tasks: z.array(planTaskSchema).min(1).max(PLAN_LIMITS.tasks)
    .describe("The next tasks the screen found, in the order you would do them."),
  allocation: z.array(z.object({
    task: z.number().int().min(1).max(PLAN_LIMITS.tasks),
    minutes: minutesSchema,
  }).strict()).max(PLAN_LIMITS.tasks).optional()
    .describe("The person's own allocation, by task number and minutes, once they gave one; leave it out before."),
  done: z.array(z.number().int().min(1).max(PLAN_LIMITS.tasks)).max(PLAN_LIMITS.tasks).optional()
    .describe("Task numbers already done, when you call again after a stop or a change of direction."),
}).strict();
export type ResearchMenuInput = z.output<typeof researchMenuSchema>;

/** The style's wording, as the person would read it. */
const STYLE_WORDS: Readonly<Record<ResearchStyle, string>> = Object.freeze({
  guided: "guided (asks you at the start and before every long task)",
  balanced: "balanced (asks only questions that could redirect the research, and shows the menu of next tasks when " +
    "they would take more than about five minutes)",
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
 * label, a sentence as could_change, invented kinds, no research_target) and learned them from the refusal.
 */
export const RESEARCH_MENU_SHAPE = "later_inputs.researchMenu in exactly this shape: research_target, the research target " +
  "word for word as register_plain_answer's result quoted it; plain_answer_receipt, that call's research_receipt; " +
  "provisional_answer, what the screen suggests, in a few sentences; and tasks, the next tasks the screen found, in " +
  "order, each {task, what it does in the person's language; kind, one of study_search, abstract_screen, full_text, " +
  "method_audit, forum_thread, video_comments, video_claims, trial_registry or other; could_change, one of conclusion, " +
  "confidence or detail; sources, how many searches, abstracts, papers, threads, videos or records it covers; loop, " +
  "people_to_studies or studies_to_people, only for a task between people's reports and studies; and minutes, [low, " +
  "high], only for a task of kind other or one much longer or shorter than its kind's usual time}. Leave out any other " +
  "field: allocation and done come only after the person answers or stops you.";
const SCREEN_FIRST = "Screen first: searches, abstracts, thread titles and the Atlas, with no full-text reading, long " +
  "threads or video audits yet, ending with a provisional short answer. " + PEOPLE_FIRST_WHEN_USED + " " +
  ALL_JOURNALS_AT_THE_SCREEN + " " + WORDS_ARE_NOT_SIZES + " Then call manage_research_access with action " +
  "plan_research and " + RESEARCH_MENU_SHAPE + " AskRigor gives each task a time range and says whether to ask the " +
  "person first.";

/**
 * What register_plain_answer's result says next, by the account's research style and the framing given with it. Whether
 * a question could redirect the research is the model's own judgment, made when it wrote the framing.
 */
export function framingGuidance(steering: ResearchSteering, framing: Framing | undefined): string {
  if (framing === undefined) {
    return URGENT_FIRST + " Give later_inputs.framing with the plain answer next time: likely_question, the question the person most " +
      "likely means; premise_doubts, anything in it that looks inverted or unclear; and redirecting_questions, up to " +
      "three questions whose answers could change what to research. " + FORM_PEOPLE_USE + " " + SCREEN_FIRST;
  }
  const doubts = framing.premise_doubts ?? [];
  const questions = framing.redirecting_questions ?? [];
  const parts: string[] = [URGENT_FIRST, `Framing: the person most likely means ${JSON.stringify(framing.likely_question)}.`];
  if (doubts.length > 0) {
    parts.push(`Say plainly near the start of your reply what looks inverted or unclear (${doubts.map((doubt) =>
      JSON.stringify(doubt)).join("; ")}), and which reading you take.`);
  }
  if (questions.length > 0) {
    const asked = questions.map((question, index) => `${index + 1}. ${question}`).join(" ");
    parts.push(steering.style === "autonomous"
      ? `The person chose autonomous research, so don't stop to ask: say in one line which reading you take, and ` +
        `keep these questions for your first check-back: ${asked} Ask now only if one could reverse the answer.`
      : `Ask the person these questions now, in their language, and wait for the answers before any research call: ` +
        `${asked} If the answers change the question, register the plain answer again for the new research target ` +
        "before researching.");
  } else if (steering.style === "guided") {
    parts.push("The person chose guided research: before researching, confirm in one line the question you will " +
      "research, and wait for their yes.");
  } else {
    parts.push("No question could redirect the research, so go on without asking.");
  }
  parts.push(SCREEN_FIRST);
  return parts.join(" ");
}

const FIVE_MINUTES = 5;

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
  style: ResearchStyle;
  check_back_minutes: number;
  adjustment_detail: AdjustmentDetail;
  minutes_since_plain_answer?: number;
  target_matches_plain_answer?: boolean;
}

const roundEstimate = (minutes: number): number => minutes < 1 ? Math.round(minutes * 2) / 2 : Math.round(minutes);

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
 * The menu: each task with its time range; a recommendation, when the person gave none (tasks that could change the
 * conclusion first, then how sure it is, each given its range's middle, while the total stays within the check-back
 * allowance, or the first such task alone when even it is longer); and whether to ask the person before working.
 */
export function planResearch(
  plan: ResearchMenuInput,
  steering: ResearchSteering,
  plainAnswer?: { matches: boolean; minutesSince: number },
): ResearchPlanResult {
  const done = new Set(plan.done ?? []);
  const tasks: PlannedTask[] = plan.tasks.map((task, index) => ({
    n: index + 1,
    task: task.task,
    kind: task.kind,
    could_change: task.could_change,
    ...(task.loop === undefined ? {} : { loop: task.loop }),
    minutes: taskMinutes(task),
  }));
  const open = tasks.filter(({ n }) => !done.has(n));
  let recommended: { task: number; minutes: number }[];
  if (plan.allocation !== undefined && plan.allocation.length > 0) {
    recommended = plan.allocation.filter(({ task, minutes }) => task <= tasks.length && !done.has(task) && minutes > 0)
      .map(({ task, minutes }) => ({ task, minutes: roundEstimate(minutes) }));
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
  const recommendedMinutes: [number, number] = plan.allocation !== undefined && plan.allocation.length > 0
    ? [recommended.reduce((sum, { minutes }) => sum + minutes, 0), recommended.reduce((sum, { minutes }) => sum + minutes, 0)]
    : [
        roundEstimate(chosen.reduce((sum, task) => sum + (task.minutes?.[0] ?? 1), 0)),
        roundEstimate(chosen.reduce((sum, task) => sum + (task.minutes?.[1] ?? 3), 0)),
      ];
  const answered = plan.allocation !== undefined && plan.allocation.length > 0;
  const next = answered || steering.style === "autonomous"
    ? "go_on"
    : steering.style === "guided" || recommendedMinutes[1] > FIVE_MINUTES
      ? "ask"
      : "go_on";
  return {
    tasks,
    recommended,
    recommended_minutes: recommendedMinutes,
    next,
    style: steering.style,
    check_back_minutes: steering.checkBackMinutes,
    adjustment_detail: steering.adjustmentDetail,
    ...(plainAnswer === undefined ? {} : {
      minutes_since_plain_answer: plainAnswer.minutesSince,
      target_matches_plain_answer: plainAnswer.matches,
    }),
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

/** Whether a task reads people's own reports: a thread, a video's comments, or a look prompted by a study finding. */
const readsPeoplesReports = ({ kind, loop }: PlannedTask): boolean =>
  kind === "forum_thread" || kind === "video_comments" || loop === "studies_to_people";

/**
 * The plan_research result's text: the menu to show, and what to do next by the account's style. allocated is true
 * once the person gave their own allocation, when the menu's numbering must stay as it is.
 */
export function planResearchText(result: ResearchPlanResult, done: ReadonlySet<number>, allocated = false): string {
  const lines = result.tasks.map(({ n, task, could_change, loop, minutes }) =>
    `${n}. ${task}: ${CHANGE_WORDS[could_change]}${loop === undefined ? "" : `, ${LOOP_WORDS[loop]}`}; ` +
    `${minutes === null ? "no estimate" : range(minutes)}${done.has(n) ? " (done)" : ""}.`);
  const recommendation = result.recommended.length === 0
    ? "Nothing more is recommended: the open tasks add detail only."
    : `Recommended: ${result.recommended.map(({ task, minutes }) => `${task}. ${minutes} min`).join(", ")}, ` +
      `${range(result.recommended_minutes)} in all.`;
  const parts = [
    "The menu to show the person, in their language, numbered as here (times are rough planning estimates, and say " +
      "whether a task means a quick look, reading in full or a method audit): " + lines.join(" ") + " " + recommendation +
      ` Then the final check and writing the answer: about ${ANSWER_MINUTES[0]} to ${ANSWER_MINUTES[1]} min.`,
  ];
  if (!allocated && !result.tasks.some(readsPeoplesReports)) parts.push(PEOPLE_TASK_MISSING);
  if (result.target_matches_plain_answer === false) {
    parts.push("This research_target is not the one registered with the plain answer: give plan_research and " +
      "finalize_research the research target word for word as register_plain_answer's result quoted it, or the " +
      "answer ends without the comparison with the quick answer.");
  }
  if (result.minutes_since_plain_answer !== undefined) {
    parts.push(`About ${result.minutes_since_plain_answer} ${result.minutes_since_plain_answer === 1 ? "minute has" :
      "minutes have"} passed since the plain answer was registered.`);
  }
  if (result.next === "ask") {
    parts.push((result.style === "guided" ? "The person chose guided research, so show" :
      "The recommended tasks would take more than about five minutes, so show") + " the menu and ask how to spend " +
      "the time: they may answer with task numbers and minutes, such as \"1. 5 min, 2. 4 min, 7. 1 min\", in their " +
      "own words, or \"you decide\". Wait for the answer before any of these tasks, then call plan_research again " +
      "with their allocation as a list of {task, minutes}; for \"you decide\", the recommended tasks and minutes.");
  } else if (result.style === "autonomous") {
    parts.push("The person chose autonomous research: show the menu as what you are doing and go on with the " +
      `recommended tasks. Check back with them after about ${result.check_back_minutes} minutes of research, or ` +
      "sooner if a new finding could change the conclusion.");
  } else {
    parts.push("Do these tasks now, in this order, each within its minutes; show the menu as what you are doing.");
  }
  parts.push(
    "Before each task, say in one line what you will read, how deep, and why. A task that runs out of its time stops " +
      "and says what it reached and whether more time is worth it; a new finding that could change the conclusion " +
      "comes back to the person unless they chose autonomous research.",
    WORDS_ARE_NOT_SIZES,
    "If the person stops you or changes direction, call plan_research again with done and their new allocation; the " +
      "research target stays word for word the same.",
    "Leads between people's reports and studies are part of the research when the question has both: when the screen " +
      "found something in people's reports that studies could check, or a study finding that people's reports could " +
      "check, and no task covers it, add that task (loop people_to_studies or studies_to_people), and declare each " +
      "lead in finalize_research's later_inputs.community_leads.",
    adjustmentGuidance(result.adjustment_detail),
  );
  return parts.join(" ");
}
