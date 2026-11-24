// Owner answer 413a, its research half (24 November 2026): the plain answer's claims are the points a person would act
// on, and the research menu accounts for each: a task that declares it, or left out with why, or in neither, which is
// said. Behind ASKRIGOR_CLAIM_ACCOUNTING (off by default). What is checked is exact, in any language: numbers, digests
// and places, never a word's meaning. Invented fixtures: no test question, no private data.
import { createHash } from "node:crypto";

import type Anthropic from "@anthropic-ai/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  DEFAULT_RESEARCH_STEERING,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  type ResearchSteering,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLAIM_ACCOUNTING_LIMITS,
  CLAIM_WORDS_FOR_NUMBER,
  CLAIMS_AT_THE_SCREEN,
  CLAIMS_NOT_SENT,
  CLAIMS_ON_A_LATER_CALL,
  CLAIMS_ON_THE_MENU,
  CLAIMS_ON_THE_MENU_REGISTERED,
  CLAIMS_PLANNED,
  CLAIMS_PLANNED_AT_INSPECT,
  CLAIMS_PLANNED_LIGHT,
  CLAIMS_RUBRIC,
  CLAIMS_TASK_SHAPE,
  LEFT_OUT_SHAPE,
  NOT_ON_PLAN_IN_ANSWER,
  NOT_ON_PLAN_LEAD,
  NOT_ON_PLAN_STRUCTURED,
  NOT_ON_PLAN_STRUCTURED_IN_ANSWER,
  PREMISE_CLAIMS_COUNT,
  accountForClaims,
  claimNumbers,
  claimReading,
  claimsNotOnPlan,
  claimsWanted,
  declaresNoClaim,
  leftOutClaims,
  notOnPlanLines,
  type ClaimAccount,
} from "../apps/research-mcp/src/claim-accounting.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { plainAnswerRequest, waitForPendingMenuChoices } from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { PLAIN_ANSWER_LIMITS, finalizeResearch, plainAnswerClaimDigest, type FinalizeResearchInput }
  from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  RESEARCH_PLANNER_CLAIMS_OUTPUT_SCHEMA,
  RESEARCH_PLANNER_CLAIMS_RUBRIC,
  RESEARCH_PLANNER_CLAIMS_RUBRIC_VERSION,
  RESEARCH_PLANNER_OUTPUT_SCHEMA,
  RESEARCH_PLANNER_RUBRIC,
  RESEARCH_PLANNER_RUBRIC_VERSION,
  createResearchPlanner,
  plannedClaimKey,
  researchPlanOf,
  researchPlannerBundle,
  type ResearchPlan,
  type ResearchPlanner,
  type ResearchPlannerSource,
} from "../apps/research-mcp/src/research-planner.js";
import { issueResearchReceipt, plainAnswerAccountBinding, researchTargetDigest, verifyResearchReceipt }
  from "../apps/research-mcp/src/research-receipts.js";
import {
  MENU_PLACEHOLDERS,
  RESEARCH_MENU_SHAPE,
  claimsResearchMenuSchema,
  correctedMenu,
  framingGuidance,
  framingNextStep,
  goOnMark,
  menuChoiceOf,
  menuDigest,
  planNextStep,
  planResearch,
  planResearchText,
  planTaskSchema,
  readResearchMenu,
  researchMenuSchema,
  researchMenuShape,
  steeringChoiceLeftOut,
  steeringChoiceUnclearDecides,
  youDecideLaterInputs,
  type PlanTask,
  type ResearchMenuInput,
} from "../apps/research-mcp/src/research-steering.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { withSourceReading } from "./helpers/source-reading.js";

const SECRET = "claim-accounting-test-secret-0123456789abcdef";
const TARGET = "Whether a walnut-leaf rinse lowers foot sweating in adults";
const CLAIMS = [
  "A walnut-leaf rinse has never been tested for foot sweating.",
  "Most adults would see less sweating within two weeks.",
  "It is safe to use every day with diabetes medicines.",
];
const TEXT = `${CLAIMS.join(" ")} Cotton socks help too.`;
const digests = CLAIMS.map(plainAnswerClaimDigest);

afterEach(() => {
  vi.unstubAllEnvs();
});

const account = (claims: ClaimAccount[]): ClaimAccount[] => claims;

describe("claims accounted for exactly (owner answer 413a)", () => {
  it("has the plain answer's own limits", () => {
    expect(CLAIM_ACCOUNTING_LIMITS.claims).toBe(PLAIN_ANSWER_LIMITS.claims);
    expect(CLAIM_ACCOUNTING_LIMITS.claimCharacters).toBe(PLAIN_ANSWER_LIMITS.claimCharacters);
  });

  it("reads a task's claims as numbers from 1 to the count, each once and in order, and nothing else", () => {
    expect(claimNumbers([3, 1, 2])).toEqual([1, 2, 3]);
    expect(claimNumbers([2, 2, "2", 1])).toEqual([1, 2]);
    // A number written as a text of digits, in any script; a word or a label is no number.
    expect(claimNumbers(["1", " 3 ", "٢", "५"])).toEqual([1, 2, 3, 5]);
    expect(claimNumbers(["claim 1", "one", "1.", "1,2", "", "-1", "1e0", "+2"])).toEqual([]);
    expect(claimNumbers([0, 6, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])).toEqual([]);
    expect(claimNumbers([4, 3, 2], 2)).toEqual([2]);
    expect(claimNumbers(2)).toEqual([2]);
    expect(claimNumbers("2")).toEqual([2]);
    for (const nothing of [undefined, null, [], {}, true, [null, true, {}, [1]]]) expect(claimNumbers(nothing)).toEqual([]);
  });

  it("gives each registered claim one place: the tasks that declare it, left out with why, or neither", () => {
    expect(accountForClaims([{ claims: [1] }, {}, { claims: ["2", 1] }],
      [{ claim: CLAIMS[2]!, why: "It changes nothing you would do." }], digests, plainAnswerClaimDigest)).toEqual({
      accounts: account([
        { claim: 1, tasks: [1, 3] },
        { claim: 2, tasks: [3] },
        { claim: 3, tasks: [], text: CLAIMS[2]!, why: "It changes nothing you would do." },
      ]), problems: [] });
    // Nothing declared: every claim is in neither place.
    expect(accountForClaims([{}, { claims: [] }], undefined, digests, plainAnswerClaimDigest)).toEqual({
      accounts: account(CLAIMS.map((_, index) => ({ claim: index + 1, tasks: [] }))), problems: [] });
    // A claim both covered and left out is covered; one left out twice keeps the first.
    expect(accountForClaims([{ claims: 2 }], [{ claim: CLAIMS[1]!, why: "No room." }, { claim: CLAIMS[0]!, why: "First." },
      { claim: CLAIMS[0]!, why: "Second." }], digests, plainAnswerClaimDigest)).toEqual({ accounts: account([
      { claim: 1, tasks: [], text: CLAIMS[0]!, why: "First." }, { claim: 2, tasks: [1] }, { claim: 3, tasks: [] },
    ]), problems: [] });
  });

  it("names what it could not use, by its place in the call, and uses the rest", () => {
    const found = accountForClaims([{ claims: [1, 4] }, { claims: [7, 9] }], [{ why: "No claim here." },
      { claim: "A sentence nobody registered.", why: "Unknown." }, { claim: CLAIMS[1]! }], digests, plainAnswerClaimDigest);
    expect(found.accounts).toEqual(account([{ claim: 1, tasks: [1] }, { claim: 2, tasks: [], text: CLAIMS[1]! },
      { claim: 3, tasks: [] }]));
    expect(found.problems).toEqual([
      "later_inputs.researchMenu.tasks[0].claims: 4 is past the 3 of the plain answer; left out.",
      "later_inputs.researchMenu.tasks[1].claims: 7, 9 are past the 3 of the plain answer; left out.",
      "later_inputs.researchMenu.left_out[1].claim is not one of the plain answer's claims: copy it word for word as " +
        "register_plain_answer's result listed it.",
    ]);
  });

  it("reads a menu that gives a 0 as counted from 0, in every task, unless it gives the last claim's number too", () => {
    // Each number one higher, and said; what a left_out entry names by its words is as it was.
    const shifted = accountForClaims([{ claims: [0] }, { claims: ["1", 0] }, {}], [{ claim: CLAIMS[2]!, why: "No room." }],
      digests, plainAnswerClaimDigest);
    expect(shifted.accounts).toEqual(account([{ claim: 1, tasks: [1, 2] }, { claim: 2, tasks: [2] },
      { claim: 3, tasks: [], text: CLAIMS[2]!, why: "No room." }]));
    expect(shifted.problems).toEqual(["later_inputs.researchMenu.tasks: this menu's claims are counted from 0, so each of " +
      "their numbers was read as one higher. They are numbered from 1, as register_plain_answer's result listed them: " +
      "send them so from now on."]);
    // The 0 in one task alone says how the whole menu counts; a number past the claims is still named as it was given.
    const past = accountForClaims([{ claims: [1, 4] }, { claims: 0 }], undefined, digests, plainAnswerClaimDigest);
    expect(past.accounts).toEqual(account([{ claim: 1, tasks: [2] }, { claim: 2, tasks: [1] }, { claim: 3, tasks: [] }]));
    expect(past.problems).toEqual([expect.stringContaining("counted from 0"),
      "later_inputs.researchMenu.tasks[0].claims: 4 is past the 3 of the plain answer; left out."]);
    // A 0 in another script; and all of them, counted from 0.
    expect(accountForClaims([{ claims: ["٠", "١", "٢"] }], undefined, digests, plainAnswerClaimDigest).accounts)
      .toEqual(account([1, 2, 3].map((claim) => ({ claim, tasks: [1] }))));
    // Both a 0 and the last claim's number: which claims are meant can't be told, so none of the numbers is used, and only
    // a claim the menu leaves out, by its words, has a place.
    const unclear = accountForClaims([{ claims: [0, 1] }, { claims: [3] }], [{ claim: CLAIMS[1]!, why: "No room." }], digests,
      plainAnswerClaimDigest);
    expect(unclear.accounts).toEqual(account([{ claim: 2, tasks: [], text: CLAIMS[1]!, why: "No room." }]));
    expect(unclear.problems).toEqual(["later_inputs.researchMenu.tasks: this menu's claims give both 0 and 3, so none of " +
      "their numbers was used. The numbers start at 1, as register_plain_answer's result listed them: send them so with " +
      "the next call."]);
    expect(notOnPlanLines(unclear.accounts)).toEqual([`Not on this plan, so not checked: “${CLAIMS[1]}” (No room.)`,
      "You can ask for a task on it."]);
    // The last claim of a plain answer with one claim is claim 1, so 0 alone is it and 0 with 1 is unclear.
    expect(accountForClaims([{ claims: [0] }], undefined, [digests[0]!], plainAnswerClaimDigest).accounts)
      .toEqual(account([{ claim: 1, tasks: [1] }]));
    expect(accountForClaims([{ claims: [0, 1] }], undefined, [digests[0]!], plainAnswerClaimDigest).accounts).toEqual([]);
    // Without a 0 nothing is read higher, and a value that is no number never says how a menu counts.
    expect(claimReading([[1, 2], "x", null, -1, 1.5, "00x"], 3).counted).toBe("from_1");
    expect(claimReading(["0"], 3).counted).toBe("from_0");
    expect(claimReading([[0], [3]], 3).read([1, 2, 3])).toEqual([]);
  });

  it("knows a menu that declares no claim at all, by its numbers and its left_out alone", () => {
    for (const [tasks, leftOut] of [[[{}, {}], undefined], [[{ claims: [] }, { claims: "x" }], []], [[{ claims: [100, -1] }], [{}, 4]]] as const) {
      expect(declaresNoClaim(tasks, leftOut), JSON.stringify([tasks, leftOut])).toBe(true);
    }
    for (const [tasks, leftOut] of [[[{}, { claims: [2] }], undefined], [[{ claims: "0" }], undefined], [[{ claims: 9 }], []],
      [[{}], [{ claim: CLAIMS[0]! }]], [[{}], CLAIMS[0]!]] as const) {
      expect(declaresNoClaim(tasks, leftOut), JSON.stringify([tasks, leftOut])).toBe(false);
    }
  });

  it("finds a claim by its digest in any script, whatever its quotation marks, case or spacing", () => {
    const written = ["足の汗は二週間で減る。", "لا توجد دراسة على هذا الغسول.", "It is “safe” every day."];
    const registered = written.map(plainAnswerClaimDigest);
    expect(accountForClaims([], [{ claim: " 足の汗は二週間で減る。 ", why: "医師の助言は変わらない。" },
      "لا توجد دراسة على هذا الغسول.", { claim: "It is \"SAFE\"  every day." }], registered, plainAnswerClaimDigest).accounts)
      .toEqual(account([
        { claim: 1, tasks: [], text: "足の汗は二週間で減る。", why: "医師の助言は変わらない。" },
        { claim: 2, tasks: [], text: "لا توجد دراسة على هذا الغسول." },
        { claim: 3, tasks: [], text: "It is \"SAFE\" every day." },
      ]));
  });

  it("cuts a reason at whole characters, on one line, and gives none for one that is empty or no text", () => {
    const long = "\u{1F9E6}".repeat(CLAIM_ACCOUNTING_LIMITS.why + 1);
    const [cut] = leftOutClaims([{ claim: CLAIMS[0]!, why: long }]);
    expect(Array.from(cut!.why!)).toHaveLength(CLAIM_ACCOUNTING_LIMITS.why);
    expect(cut!.why!.isWellFormed()).toBe(true);
    expect(cut!.why!.endsWith("…")).toBe(true);
    expect(leftOutClaims([{ claim: CLAIMS[0]!, why: "\u{1F9E6}".repeat(CLAIM_ACCOUNTING_LIMITS.why) }])[0]!.why)
      .toBe("\u{1F9E6}".repeat(CLAIM_ACCOUNTING_LIMITS.why));
    expect(leftOutClaims([{ claim: CLAIMS[0]!, why: "one\n\u0007 line​ here " }])).toEqual([
      { claim: CLAIMS[0]!, why: "one line here" }]);
    for (const why of ["", " \n", 3, null, undefined, {}]) {
      expect(leftOutClaims([{ claim: CLAIMS[0]!, why }])).toEqual([{ claim: CLAIMS[0]! }]);
    }
  });

  it("takes an entry's claim as text, alone or in an object, and no other value, at most as many as may be registered", () => {
    expect(leftOutClaims(CLAIMS[0]!)).toEqual([{ claim: CLAIMS[0]! }]);
    expect(leftOutClaims({ claim: ` ${CLAIMS[0]!} ` })).toEqual([{ claim: CLAIMS[0]! }]);
    for (const nothing of [undefined, null, [], [null, 1, {}, { claim: 2 }, { claim: " " }, ["x"]],
      [{ claim: "x".repeat(CLAIM_ACCOUNTING_LIMITS.claimCharacters + 1) }]]) expect(leftOutClaims(nothing)).toEqual([]);
    expect(leftOutClaims([{}, ...Array.from({ length: 7 }, (_, index) => `Claim ${index}.`)]))
      .toEqual(Array.from({ length: 5 }, (_, index) => ({ claim: `Claim ${index}.` })));
  });

  it("says of each claim no task covers that it is not on the plan, and whose words to show", () => {
    expect(notOnPlanLines(undefined)).toEqual([]);
    expect(notOnPlanLines([{ claim: 1, tasks: [2] }])).toEqual([]);
    expect(claimsNotOnPlan([{ claim: 1, tasks: [2] }, { claim: 2, tasks: [] }])).toEqual([{ claim: 2, tasks: [] }]);
    // AskRigor holds no text of the plain answer: a claim whose words the menu did not give stands by its number, and what
    // the number stands for is said to the AI beside the lines, never in a line the person reads.
    expect(notOnPlanLines([{ claim: 1, tasks: [] }])).toEqual([
      "Not on this plan, so not checked: “<claim 1, in its own words>”", "You can ask for a task on it."]);
    for (const lead of [NOT_ON_PLAN_LEAD, NOT_ON_PLAN_IN_ANSWER]) expect(lead).toContain(CLAIM_WORDS_FOR_NUMBER);
    expect(NOT_ON_PLAN_IN_ANSWER.startsWith("Give these lines in the answer, beside the task record")).toBe(true);
    expect(notOnPlanLines([{ claim: 1, tasks: [], text: CLAIMS[0]!, why: "No room." }, { claim: 2, tasks: [1] },
      { claim: 3, tasks: [], text: CLAIMS[2]! }])).toEqual([
      `Not on this plan, so not checked: “${CLAIMS[0]}” (No room.)`,
      `Not on this plan, so not checked: “${CLAIMS[2]}”`,
      "You can ask for a task on any of these."]);
  });
});

const task = (overrides: Partial<PlanTask> = {}): PlanTask => ({ task: "Search trials of the rinse", kind: "study_search",
  could_change: "conclusion", ...overrides });
const MENU: ResearchMenuInput = { research_target: TARGET, steering_choice: "none", tasks: [
  task({ claims: [1, 2] }),
  task({ task: "Read what people who used it report", kind: "forum_thread", could_change: "confidence" }),
  task({ task: "Look up how the leaves are dried", kind: "study_search", could_change: "detail", claims: [3] }),
] };
const accountsOf = (menu: ResearchMenuInput): ClaimAccount[] =>
  accountForClaims(menu.tasks, menu.left_out, digests, plainAnswerClaimDigest).accounts;
const BALANCED: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "balanced" };

describe("the menu an account with accounting gets (owner answer 413a)", () => {
  it("keeps the menu's fields, shape and texts of every other account as they were", () => {
    expect(Object.keys(researchMenuSchema.shape)).not.toContain("left_out");
    expect(Object.keys(planTaskSchema.shape)).not.toContain("claims");
    expect(RESEARCH_MENU_SHAPE).toBe(researchMenuShape(false));
    for (const added of [CLAIMS_TASK_SHAPE, LEFT_OUT_SHAPE, "left_out"]) expect(RESEARCH_MENU_SHAPE).not.toContain(added);
    // The shape with the two fields is the same shape, with each in its place.
    expect(researchMenuShape(true).replace(CLAIMS_TASK_SHAPE, "").replace(LEFT_OUT_SHAPE, "")).toBe(RESEARCH_MENU_SHAPE);
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      for (const framing of [undefined, { likely_question: "Does the rinse work?" },
        { likely_question: "Does the rinse work?", redirecting_questions: ["Which leaves?"], premise_doubts: ["d"] }]) {
        const steering = { ...BALANCED, style };
        expect(framingGuidance(steering, framing)).toBe(framingGuidance(steering, framing, false));
        expect(framingGuidance(steering, framing)).not.toContain(CLAIMS_AT_THE_SCREEN);
        expect(framingGuidance(steering, framing, true).replace(CLAIMS_AT_THE_SCREEN, "").replace(CLAIMS_TASK_SHAPE, "")
          .replace(LEFT_OUT_SHAPE, "")).toBe(framingGuidance(steering, framing));
        expect(framingNextStep(steering, framing)).not.toContain("left_out");
        expect(framingNextStep(steering, framing, true))
          .toBe(`${framingNextStep(steering, framing)} ${CLAIMS_AT_THE_SCREEN.trimEnd()}`);
      }
    }
    const menu = { ...MENU, tasks: MENU.tasks.map(({ claims: _claims, ...rest }) => rest) };
    const result = planResearch(menu, BALANCED);
    expect(result).not.toHaveProperty("claims");
    expect(planResearchText(result, new Set())).not.toContain("Not on this plan");
    expect(planNextStep(result)).not.toContain("Not on this plan");
    // claims and left_out are no part of that account's menu: left out of it, and named, as before.
    const given = { researchMenu: { ...MENU, left_out: [{ claim: CLAIMS[0] }] } };
    const reading = readResearchMenu(given);
    expect(reading.menu).toEqual(menu);
    expect(reading.ignored).toEqual(["later_inputs.researchMenu.left_out", "later_inputs.researchMenu.tasks[0].claims",
      "later_inputs.researchMenu.tasks[2].claims"]);
    expect(readResearchMenu(given, true)).toMatchObject({ ignored: [], menu: given.researchMenu });
  });

  it("reads a placeholder sent back unchanged as not given, and refuses nothing for either field", () => {
    const read = (fields: { claims?: unknown; left_out?: unknown }) => {
      const reading = readResearchMenu({ researchMenu: { research_target: TARGET, steering_choice: "none",
        tasks: [{ ...task(), ...(Object.hasOwn(fields, "claims") ? { claims: fields.claims } : {}) }],
        ...(Object.hasOwn(fields, "left_out") ? { left_out: fields.left_out } : {}) } }, true);
      expect(reading.ignored).toEqual([]);
      expect(claimsResearchMenuSchema.safeParse(reading.menu).success).toBe(true);
      const menu = reading.menu as { tasks: Array<{ claims?: unknown }>; left_out?: unknown };
      return { claims: menu.tasks[0]!.claims, left_out: menu.left_out };
    };
    for (const claims of [[MENU_PLACEHOLDERS.claims], MENU_PLACEHOLDERS.claims, ` ${MENU_PLACEHOLDERS.claims} `, null]) {
      expect(read({ claims }).claims).toBeUndefined();
    }
    expect(read({ claims: [MENU_PLACEHOLDERS.claims, 2] }).claims).toEqual([2]);
    // Near it is not it: what is not the placeholder stays as given, and names no claim.
    expect(read({ claims: [MENU_PLACEHOLDERS.claims.toUpperCase()] }).claims).toEqual([MENU_PLACEHOLDERS.claims.toUpperCase()]);
    const given = { claim: MENU_PLACEHOLDERS.left_out_claim, why: MENU_PLACEHOLDERS.left_out_why };
    for (const left_out of [[given], given, [MENU_PLACEHOLDERS.left_out_claim], MENU_PLACEHOLDERS.left_out_claim,
      [{ claim: MENU_PLACEHOLDERS.left_out_claim, why: "A reason." }], null]) {
      expect(read({ left_out }).left_out).toBeUndefined();
    }
    expect(read({ left_out: [given, { claim: CLAIMS[0], why: MENU_PLACEHOLDERS.left_out_why },
      { claim: CLAIMS[1], why: "No room." }] }).left_out).toEqual([{ claim: CLAIMS[0] }, { claim: CLAIMS[1], why: "No room." }]);
    for (const odd of [7, "x", true, {}, [[]], [{ claim: 4 }]]) {
      expect(read({ claims: odd }).claims).toEqual(odd);
      expect(read({ left_out: odd }).left_out).toEqual(odd);
    }
  });

  it("recommends a detail task that covers a claim, with the digest, the mark and the you-decide call as given", () => {
    const menu: ResearchMenuInput = { ...MENU, plain_answer_receipt: "rr1~plain", steering_could_help: true,
      steering_choice: "Which leaves do you have?" };
    const plain = planResearch(menu, BALANCED);
    expect(plain.recommended.map(({ task: number }) => number)).toEqual([1, 2]);
    expect(plain.tasks[2]!.could_change).toBe("detail");
    const claims = accountsOf(menu);
    const lifted = planResearch(menu, BALANCED, undefined, { digest: "md1~x", changed: false }, claims);
    expect(lifted.recommended.map(({ task: number }) => number)).toEqual([1, 2, 3]);
    expect(lifted.tasks[2]!.could_change).toBe("confidence");
    expect(lifted.claims).toEqual(claims);
    // The digest and the mark are the tasks' as given, whatever claims and left_out say.
    const bare = menu.tasks.map(({ claims: _claims, ...rest }) => rest);
    expect(menuDigest(menu.tasks, SECRET)).toBe(menuDigest(bare, SECRET));
    expect(goOnMark(menu.tasks, "rr1~plain", SECRET)).toBe(goOnMark(bare, "rr1~plain", SECRET));
    const left = { ...menu, left_out: [{ claim: CLAIMS[2]!, why: "No room.", more: "x" }] };
    expect(menuDigest(left.tasks, SECRET)).toBe(menuDigest(bare, SECRET));
    const youDecide = youDecideLaterInputs(left, planResearch(left, BALANCED, undefined, undefined, accountsOf(left)))!;
    expect(youDecide.researchMenu.tasks).toEqual(menu.tasks);
    expect(youDecide.researchMenu.left_out).toEqual([{ claim: CLAIMS[2]!, why: "No room." }]);
    expect(youDecideLaterInputs(menu, plain)!.researchMenu).not.toHaveProperty("left_out");
  });

  it("gives every decision made from the menu the same lifted tasks", () => {
    // A re-plan whose one open task is detail: with nothing recommended it goes on; the claim it covers makes it ask.
    const open: ResearchMenuInput = { research_target: TARGET, steering_could_help: false, done: [1], tasks: [
      task({ claims: [1] }), task({ task: "Look up how the leaves are dried", could_change: "detail", claims: [2] })] };
    const claims = accountsOf(open);
    expect(planResearch(open, BALANCED).next).toBe("go_on");
    expect(planResearch(open, BALANCED, undefined, undefined, claims).next).toBe("ask");
    const { steering_could_help: _help, ...noJudgment } = open;
    expect(steeringChoiceLeftOut(noJudgment, BALANCED)).toBe(true);
    expect(steeringChoiceLeftOut(noJudgment, BALANCED, undefined, claims)).toBe(false);
    const unclear = { ...noJudgment, steering_choice: "none_needed" };
    expect(steeringChoiceUnclearDecides(unclear, BALANCED)).toBe(true);
    expect(steeringChoiceUnclearDecides(unclear, BALANCED, undefined, claims)).toBe(false);
    // Learn mode: "you decide" is the recommendation the person was offered, the lifted task among it.
    const answered: ResearchMenuInput = { ...MENU, person_answered: true,
      allocation: planResearch(MENU, BALANCED, undefined, undefined, accountsOf(MENU)).recommended };
    expect(menuChoiceOf(answered, BALANCED, null, accountsOf(MENU))).toMatchObject({ youDecide: true, tasks: [
      { recommended: true }, { recommended: true }, { could_change: "detail", recommended: true }] });
    expect(menuChoiceOf(answered, BALANCED, null)).toMatchObject({ youDecide: false, tasks: [
      { recommended: true }, { recommended: true }, { recommended: false }] });
  });

  it("lists the claims no task covers after the tasks, in the ask and in the go-ahead, for either kind of app", () => {
    const menu: ResearchMenuInput = { ...MENU, left_out: [{ claim: CLAIMS[1]!, why: "It changes nothing you would do." }],
      tasks: [task({ claims: [1] }), MENU.tasks[1]!] };
    const claims = accountsOf(menu);
    const lines = [
      `Not on this plan, so not checked: “${CLAIMS[1]}” (It changes nothing you would do.)`,
      "Not on this plan, so not checked: “<claim 3, in its own words>”",
      "You can ask for a task on any of these."];
    const ask = planResearch({ ...menu, steering_choice: "Which leaves do you have?" }, BALANCED, undefined, undefined, claims);
    expect(ask.next).toBe("ask");
    for (const chatGpt of [false, true]) {
      const text = planResearchText(ask, new Set(), false, TARGET, undefined, [], undefined, chatGpt);
      const at = text.indexOf(lines.join("\n"));
      expect(at).toBeGreaterThan(text.indexOf("Recommended: "));
      expect(at).toBeLessThan(text.indexOf("How should I spend the time?"));
      // What a number stands for is said to the AI where the reply is described, before the menu's lines.
      expect(text.indexOf(`(the times are rough planning estimates; ${CLAIM_WORDS_FOR_NUMBER}):`)).toBeLessThan(at);
      expect(text).toContain(`(the times are rough planning estimates; ${CLAIM_WORDS_FOR_NUMBER}):`);
      expect(planNextStep(ask, undefined, chatGpt)).toContain(` ${NOT_ON_PLAN_STRUCTURED} Make no research call`);
      const goOn = planResearch(menu, BALANCED, undefined, undefined, claims);
      expect(goOn.next).toBe("go_on");
      const going = planResearchText(goOn, new Set(), false, TARGET, undefined, [], undefined, chatGpt);
      // ChatGPT's tasks are a record for the answer, so the lines go in the answer; every other app shows them.
      const told = going.indexOf(`${chatGpt ? NOT_ON_PLAN_IN_ANSWER : NOT_ON_PLAN_LEAD} ${lines.join(" ")}`);
      expect(told).toBeGreaterThan(going.indexOf("Recommended: "));
      expect(told).toBeLessThan(going.indexOf("Go on now"));
      expect(going).not.toContain(chatGpt ? NOT_ON_PLAN_LEAD : NOT_ON_PLAN_IN_ANSWER);
      expect(going).toContain(` ${CLAIMS_ON_A_LATER_CALL} `);
      expect(planNextStep(goOn, undefined, chatGpt).endsWith(
        ` ${chatGpt ? NOT_ON_PLAN_STRUCTURED_IN_ANSWER : NOT_ON_PLAN_STRUCTURED} ${CLAIMS_ON_A_LATER_CALL}`)).toBe(true);
      // A light look-up's menu is shown to the person in every app, and so are its lines; it asks for no later call.
      const light = { ...menu, lane: "light" as const, tasks: [task({ kind: "full_text", claims: [1] })] };
      const lit = planResearch(light, BALANCED, undefined, undefined, accountsOf(light));
      expect(lit.lane).toBe("light");
      expect(planResearchText(lit, new Set(), false, TARGET, undefined, [], undefined, chatGpt)).toContain(NOT_ON_PLAN_LEAD);
      expect(planNextStep(lit, undefined, chatGpt).endsWith(` ${NOT_ON_PLAN_STRUCTURED}`)).toBe(true);
    }
    // Every claim on the plan: neither app is told of one that is not.
    const covered = planResearch(MENU, BALANCED, undefined, undefined, accountsOf(MENU));
    expect(covered.claims).toEqual([{ claim: 1, tasks: [1] }, { claim: 2, tasks: [1] }, { claim: 3, tasks: [3] }]);
    expect(planResearchText(covered, new Set())).not.toContain("Not on this plan");
    expect(planNextStep(covered)).not.toContain("Not on this plan");
  });

  it("gives both fields back with a refused menu's example, as they can be used", () => {
    const example = correctedMenu({ research_target: TARGET, tasks: [{ task: "Search trials", kind: "reading",
      claims: ["1", 9, 2] }, { task: "Read threads", claims: ["x"] }], left_out: [{ claim: CLAIMS[2], why: "No room.",
      note: "dropped" }, { why: "nothing" }] });
    expect(example.researchMenu.tasks[0]).toEqual({ task: "Search trials", kind: MENU_PLACEHOLDERS.kind,
      could_change: MENU_PLACEHOLDERS.could_change, claims: [1, 2] });
    expect(example.researchMenu.tasks[1]).not.toHaveProperty("claims");
    expect(example.researchMenu.left_out).toEqual([{ claim: CLAIMS[2], why: "No room." }]);
    expect(correctedMenu({ research_target: TARGET, tasks: [task()] }).researchMenu).not.toHaveProperty("left_out");
    // A 0 goes back with the rest, so the corrected call is read as counted from 0 too, not as one claim fewer.
    expect(correctedMenu({ research_target: TARGET, tasks: [{ ...task(), claims: [1, 0] }] }).researchMenu.tasks[0]!.claims)
      .toEqual([0, 1]);
  });
});

describe("inspect's request for the claims (owner answer 413a)", () => {
  it("asks for the points a person would act on, in place of the main claims, and changes nothing else", () => {
    const { claims, claimCharacters } = PLAIN_ANSWER_LIMITS;
    for (const note of [true, false]) {
      const asked = plainAnswerRequest(note, true);
      expect(plainAnswerRequest(note, false)).toBe(plainAnswerRequest(note));
      expect(asked).toContain(claimsWanted(claims, claimCharacters));
      expect(asked).toContain(`rule 2). ${PREMISE_CLAIMS_COUNT}AskRigor signs it with the time. ${CLAIMS_ON_THE_MENU}`);
      expect(asked
        .replace(claimsWanted(claims, claimCharacters), `plainAnswer.claims, its main claims, 1 to ${claims} whole ` +
          `sentences each copied exactly from it (at most ${claimCharacters} characters each); and `)
        .replace(PREMISE_CLAIMS_COUNT, "")
        .replace(CLAIMS_ON_THE_MENU, "Then treat each claim as something to check, confirm or correct, and look beyond " +
          "the claims too. ")).toBe(plainAnswerRequest(note));
    }
    expect(claimsWanted(claims, claimCharacters)).toContain("act on, decide by or repeat as fact: usually 2 or 3");
  });
});

// The planner --------------------------------------------------------------------------------------------------------

const KEY = "sk-ant-api03-synthetic-key-for-tests-only-0123456789";
const SOURCE: ResearchPlannerSource = { asked: "does the leaf rinse stop my feet sweating?", researchTarget: TARGET,
  quickAnswer: TEXT, claims: CLAIMS };
const REPLY = { about: "A rinse made from walnut leaves, used on the feet.", steering_choice: "none", lane: "research",
  person_said_go_on: false, tasks: [
    { task: "Find trials of the rinse for sweating", kind: "study_search", could_change: "conclusion", sources: 1, claims: [1, 2] },
    { task: "Read what people report of the rinse", kind: "forum_thread", could_change: "confidence", sources: 1, claims: [] },
  ], left_out: [{ claim: 3, why: "Step 3's five tasks are full." }] };
type Body = Anthropic.Beta.MessageCreateParamsNonStreaming;
const reply = (value: unknown = REPLY) => ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5",
  stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(value), citations: null }],
  usage: { input_tokens: 300, output_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } }) as unknown as Anthropic.Beta.BetaMessage;

function apiPlanner(options: { now?: () => number; reply?: () => unknown } = {}) {
  const bodies: Body[] = [];
  const made = createResearchPlanner({
    env: { ASKRIGOR_RESEARCH_PLANNER: "on", ASKRIGOR_RESEARCH_PLANNER_KEY_FILE: "/run/secret/key" } as NodeJS.ProcessEnv,
    readFile: () => `${KEY}\n`, log: () => undefined,
    client: () => ({ beta: { messages: { create: async (body: Body) => {
      bodies.push(body);
      return reply(options.reply?.() ?? REPLY);
    } } } }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return { planner: made, bodies };
}
const planOf = (planning: { status: string }): ResearchPlan => (planning as { plan: ResearchPlan }).plan;

describe("AskRigor's own planning call with the claims' rule (owner answer 413a)", () => {
  it("is the same rubric with one paragraph at the end of step 3, under a version of its own", () => {
    expect(RESEARCH_PLANNER_RUBRIC).not.toContain("quick_answer_claims, numbered");
    expect(RESEARCH_PLANNER_CLAIMS_RUBRIC.split(CLAIMS_RUBRIC)).toHaveLength(2);
    expect(RESEARCH_PLANNER_CLAIMS_RUBRIC.replace(`\n${CLAIMS_RUBRIC}`, "")).toBe(RESEARCH_PLANNER_RUBRIC);
    // After step 3's last line and before step 4, beside the line on what the question takes for granted.
    expect(RESEARCH_PLANNER_CLAIMS_RUBRIC).toContain(
      `result of one named study, reading that study in full comes first.\n${CLAIMS_RUBRIC}\n\n4. `);
    expect(RESEARCH_PLANNER_CLAIMS_RUBRIC).toContain("When the question takes something for granted");
    expect(RESEARCH_PLANNER_CLAIMS_RUBRIC_VERSION).toBe(`${RESEARCH_PLANNER_RUBRIC_VERSION}+claims.2`);
    // What covering several claims takes is the same in the screen's words and in the rubric's (line breaks apart).
    const several = "one task may cover several, but only where its own result could show each of them wrong: the task that " +
      "reads the study or source that settles a claim covers it, the search that finds that source does not";
    for (const said of [CLAIMS_RUBRIC, CLAIMS_AT_THE_SCREEN]) expect(said.replaceAll("\n", " ")).toContain(several);
    expect(Math.max(...CLAIMS_RUBRIC.split("\n").map((line) => line.length))).toBeLessThanOrEqual(118);
  });

  it("is the same output schema with the claims each task covers and those left out, both required", () => {
    const { left_out, tasks, ...rest } = RESEARCH_PLANNER_CLAIMS_OUTPUT_SCHEMA.properties;
    const { tasks: plainTasks, ...plainRest } = RESEARCH_PLANNER_OUTPUT_SCHEMA.properties;
    expect(rest).toEqual(plainRest);
    const { claims, ...fields } = tasks.items.properties;
    expect(fields).toEqual(plainTasks.items.properties);
    expect(tasks.items.required).toEqual([...plainTasks.items.required, "claims"]);
    expect(claims).toMatchObject({ type: "array", items: { type: "integer" } });
    expect(left_out).toMatchObject({ type: "array", items: { required: ["claim", "why"], additionalProperties: false } });
    expect(RESEARCH_PLANNER_CLAIMS_OUTPUT_SCHEMA.required).toEqual([...RESEARCH_PLANNER_OUTPUT_SCHEMA.required, "left_out"]);
    expect(RESEARCH_PLANNER_CLAIMS_OUTPUT_SCHEMA.additionalProperties).toBe(false);
    expect(tasks.items.additionalProperties).toBe(false);
  });

  it("sends them only with accounting, and the same bundle either way", async () => {
    const made = apiPlanner();
    await made.planner.plan(SOURCE, "account-a");
    await made.planner.plan({ ...SOURCE, accounting: true }, "account-a");
    const system = (body: Body) => (body.system as Array<{ text: string }>)[0]!.text;
    const schema = (body: Body) => (body.output_config as { format: { schema: unknown } }).format.schema;
    expect(made.bodies.map(system)).toEqual([RESEARCH_PLANNER_RUBRIC, RESEARCH_PLANNER_CLAIMS_RUBRIC]);
    expect(made.bodies.map(schema)).toEqual([RESEARCH_PLANNER_OUTPUT_SCHEMA, RESEARCH_PLANNER_CLAIMS_OUTPUT_SCHEMA]);
    expect(made.bodies[0]!.messages).toEqual(made.bodies[1]!.messages);
    expect(researchPlannerBundle({ ...SOURCE, accounting: true }, "2026-11-24")).toEqual(researchPlannerBundle(SOURCE, "2026-11-24"));
  });

  it("reads the claims each task covers and gives every other claim's place, whatever the reply left out", () => {
    const read = (value: unknown) => researchPlanOf(value, 1, KEY, false, true, CLAIMS)!;
    expect(read(REPLY).tasks.map(({ claims }) => claims)).toEqual([[1, 2], undefined]);
    expect(read(REPLY).claims).toEqual({ of: CLAIMS.map(plannedClaimKey),
      leftOut: [{ claim: 3, why: "Step 3's five tasks are full." }] });
    // Without accounting, nothing of it is read.
    expect(researchPlanOf(REPLY, 1, KEY)).not.toHaveProperty("claims");
    expect(researchPlanOf(REPLY, 1, KEY)!.tasks.every((entry) => !("claims" in entry))).toBe(true);
    // A claim named nowhere, or only in a task that was cut, is left out all the same; a covered one never is.
    const many = { ...REPLY, left_out: "none", tasks: [...Array.from({ length: 8 }, (_, index) => ({
      ...REPLY.tasks[1]!, task: `Read thread ${index}` })), { ...REPLY.tasks[0]!, claims: [1, 2, 3] }] };
    expect(read(many).claims!.leftOut).toEqual([{ claim: 1 }, { claim: 2 }, { claim: 3 }]);
    const both = { ...REPLY, left_out: [{ claim: 1, why: "Also covered." }, { claim: 3, why: " two\nlines " },
      { claim: 3, why: "Later." }, { claim: 9, why: "Unknown." }, { why: "No claim." }, null] };
    expect(read(both).claims!.leftOut).toEqual([{ claim: 3, why: "two lines" }]);
    // A reason that holds the key is none; a long one is cut at whole characters.
    expect(read({ ...REPLY, left_out: [{ claim: 3, why: `Because ${KEY}.` }] }).claims!.leftOut).toEqual([{ claim: 3 }]);
    const cut = read({ ...REPLY, left_out: [{ claim: 3, why: `${"\u{1F9E6}".repeat(300)}` }] }).claims!.leftOut[0]!.why!;
    expect(Array.from(cut)).toHaveLength(CLAIM_ACCOUNTING_LIMITS.why);
    expect(cut.isWellFormed()).toBe(true);
    // A reply that counts the claims from 0 is read as a menu is (claimReading): each number one higher, left_out's too.
    const zero = { ...REPLY, tasks: [{ ...REPLY.tasks[0]!, claims: [0, 1] }, REPLY.tasks[1]!], left_out: [{ claim: 2, why: "No room." }] };
    expect(read(zero).tasks.map(({ claims }) => claims)).toEqual([[1, 2], undefined]);
    expect(read(zero).claims!.leftOut).toEqual([{ claim: 3, why: "No room." }]);
    const unclear = { ...zero, left_out: [{ claim: 3, why: "No room." }] };
    expect(read(unclear).tasks.every((entry) => !("claims" in entry))).toBe(true);
    expect(read(unclear).claims!.leftOut).toEqual([{ claim: 1 }, { claim: 2 }, { claim: 3 }]);
    // Aside has no tasks and no claims; light accounts for them as research does.
    expect(read({ ...REPLY, lane: "aside" })).not.toHaveProperty("claims");
    expect(read({ ...REPLY, lane: "light", tasks: [REPLY.tasks[0]!] })).toMatchObject({ lane: "light",
      claims: { leftOut: [{ claim: 3 }] } });
    expect(plannedClaimKey(` ${CLAIMS[0]!} `)).toBe(createHash("sha256").update(CLAIMS[0]!, "utf8").digest("hex"));
  });

  it("never serves a plan of the one rubric as a plan of the other, and keeps each for its hour", async () => {
    let at = Date.parse("2026-11-24T10:00:00Z");
    const made = apiPlanner({ now: () => at });
    const plain = await made.planner.plan(SOURCE, "account-a");
    expect(planOf(plain.planning)).not.toHaveProperty("claims");
    const claims = await made.planner.plan({ ...SOURCE, accounting: true }, "account-a");
    expect(claims.cached).toBe(false);
    expect(planOf(claims.planning).claims!.leftOut).toEqual([{ claim: 3, why: "Step 3's five tasks are full." }]);
    expect(made.bodies).toHaveLength(2);
    // Each is served again for its own mode, also with other claims.
    for (const accounting of [false, true]) {
      const again = await made.planner.plan({ ...SOURCE, claims: [CLAIMS[0]!], ...(accounting ? { accounting } : {}) }, "account-a");
      expect(again).toMatchObject({ cached: true, planning: accounting ? claims.planning : plain.planning });
    }
    expect(made.bodies).toHaveLength(2);
    at += 61 * 60 * 1_000;
    expect((await made.planner.plan({ ...SOURCE, accounting: true }, "account-a")).cached).toBe(false);
  });

  it("finds the lane of the plan kept for these words under either rubric, the newest one", async () => {
    let at = Date.parse("2026-11-24T10:00:00Z");
    let lane = "light";
    const made = apiPlanner({ now: () => at, reply: () => ({ ...REPLY, lane,
      tasks: lane === "light" ? [{ ...REPLY.tasks[0]!, kind: "full_text" }] : REPLY.tasks }) });
    await made.planner.plan({ ...SOURCE, accounting: true }, "account-a");
    expect(await made.planner.lane(SOURCE.asked, "account-a")).toBe("light");
    // The same words planned under the other rubric, in the same millisecond: the newer registration's lane.
    lane = "research";
    await made.planner.plan(SOURCE, "account-a");
    expect(await made.planner.lane(SOURCE.asked, "account-a")).toBe("research");
    expect(await made.planner.lane(SOURCE.asked, "account-a", TARGET)).toBe("research");
    // When the newer plan's hour is over and the older one's too, no lane.
    at += 61 * 60 * 1_000;
    expect(await made.planner.lane(SOURCE.asked, "account-a")).toBeUndefined();
    expect(made.bodies).toHaveLength(2);
  });
});

// The tool -----------------------------------------------------------------------------------------------------------

const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};
type Result = CallToolResult & { structuredContent?: Record<string, unknown> };
const words = (result: Result): string => result.content.map((block) => block.type === "text" ? block.text : "").join("\n");

async function tool(options: { accounting?: boolean; planner?: ResearchPlanner } = {}) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
    identitySecret: new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes") });
  for (const subject of ["auth0|dev", "auth0|person"]) await service.acceptFreeContributor(subject, AGREEMENT);
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", service.accountKeyForSubject("auth0|dev"));
  vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", options.accounting === undefined ? "" : options.accounting ? "on" : "off");
  let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
  registerTools({
    registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
      if (registered === "manage_research_access") handler = execute;
    },
  } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp", researchContributorAccessService: service,
    ...(options.planner === undefined ? {} : { researchPlanner: options.planner }) } satisfies RegisterToolsOptions);
  const call = async (input: Record<string, unknown>, subject = "auth0|person"): Promise<Result> =>
    await handler!(input, { authInfo: { token: "t", clientId: "c", scopes: ["research:use"],
      expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } }) as Result;
  const register = async (claims: readonly string[] = CLAIMS, subject = "auth0|person", later?: Record<string, unknown>) =>
    await call({ action: "register_plain_answer", plainAnswer: { researchTarget: TARGET, text: TEXT, claims },
      ...(later === undefined ? {} : { later_inputs: later }) }, subject);
  return { call, register, service };
}
const receiptOf = (result: Result): string => (result.structuredContent as { research_receipt: string }).research_receipt;
const receiptClaims = (receipt: string) => {
  const verified = verifyResearchReceipt(receipt, { secret: SECRET });
  return verified.ok ? verified.claims : undefined;
};

describe("the account tool with the claims accounted for (owner answer 413a)", () => {
  it("asks for the claims so at inspect only on an account that has it", async () => {
    const on = await tool({ accounting: true });
    expect(words(await on.call({ action: "inspect" }))).toContain(plainAnswerRequest(true, true));
    for (const accounting of [false, undefined]) {
      const off = await tool(accounting === undefined ? {} : { accounting });
      expect(words(await off.call({ action: "inspect" }))).toContain(plainAnswerRequest(true));
      expect(words(await off.call({ action: "inspect" }))).not.toContain(CLAIMS_ON_THE_MENU);
    }
  });

  it("lists the claims from 1, says so in the receipt, and gives the menu's rule, shape and outline", async () => {
    const { register } = await tool({ accounting: true });
    const result = await register();
    expect(result.isError, words(result)).not.toBe(true);
    const text = words(result);
    expect(text).toContain(`Claims: 1 ${JSON.stringify(CLAIMS[0])}; 2 ${JSON.stringify(CLAIMS[1])}; ` +
      `3 ${JSON.stringify(CLAIMS[2])}. `);
    expect(text).toContain(`pass that receipt too. ${CLAIMS_ON_THE_MENU_REGISTERED}Pass this research_receipt`);
    expect(text).not.toContain("Treat each claim as something to check");
    expect((result.content[0] as { text: string }).text).toContain(researchMenuShape(true));
    expect((result.content[0] as { text: string }).text).toContain(CLAIMS_AT_THE_SCREEN);
    expect(receiptClaims(receiptOf(result))).toMatchObject({ first: "1", claims: digests });
    const data = result.structuredContent as { next_step: string; menu_outline: { researchMenu: Record<string, unknown> } };
    expect(data.next_step).toContain(CLAIMS_AT_THE_SCREEN.trimEnd());
    expect(data.menu_outline.researchMenu).toMatchObject({ tasks: [{ claims: [MENU_PLACEHOLDERS.claims] }],
      left_out: [{ claim: MENU_PLACEHOLDERS.left_out_claim, why: MENU_PLACEHOLDERS.left_out_why }] });
  });

  it("registers as before without it: claims from 0, no word of accounting, no claim of the receipt's for it", async () => {
    for (const accounting of [false, undefined]) {
      const { register } = await tool(accounting === undefined ? {} : { accounting });
      const result = await register();
      const text = words(result);
      expect(text).toContain(`Claims: 0 ${JSON.stringify(CLAIMS[0])}; 1 ${JSON.stringify(CLAIMS[1])}`);
      expect(text).toContain("Treat each claim as something to check, confirm or correct, and look beyond the claims too. Pass ");
      for (const added of ["left_out", CLAIMS_AT_THE_SCREEN.trimEnd(), CLAIMS_ON_THE_MENU_REGISTERED]) {
        expect(text).not.toContain(added);
        expect(JSON.stringify(result.structuredContent)).not.toContain(added);
      }
      expect(receiptClaims(receiptOf(result))).not.toHaveProperty("first");
      const menu = (result.structuredContent as { menu_outline: { researchMenu: { tasks: object[] } } }).menu_outline.researchMenu;
      expect(menu).not.toHaveProperty("left_out");
      expect(menu.tasks[0]).not.toHaveProperty("claims");
    }
  });

  const menuWith = (receipt: string, overrides: Record<string, unknown> = {}) => ({ research_target: TARGET,
    plain_answer_receipt: receipt, steering_choice: "none", tasks: [
      { task: "Find trials of the rinse", kind: "study_search", could_change: "conclusion", claims: [1] },
      { task: "Look up how the leaves are dried", kind: "abstract_screen", could_change: "detail", claims: [2] },
    ], left_out: [{ claim: CLAIMS[2], why: "It changes nothing you would do." }], ...overrides });

  it("says where each claim stands on the menu it is sent, and recommends the detail task that covers one", async () => {
    const { call, register } = await tool({ accounting: true });
    const receipt = receiptOf(await register());
    const planned = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(receipt) } });
    expect(planned.isError, words(planned)).not.toBe(true);
    expect(planned.structuredContent).not.toHaveProperty("problems");
    const menu = planned.structuredContent!.researchMenu as { claims: ClaimAccount[]; next: string; menu_digest: string;
      recommended: Array<{ task: number }>; tasks: Array<{ could_change: string }> };
    expect(menu.next).toBe("go_on");
    expect(menu.claims).toEqual([{ claim: 1, tasks: [1] }, { claim: 2, tasks: [2] },
      { claim: 3, tasks: [], text: CLAIMS[2], why: "It changes nothing you would do." }]);
    expect(menu.recommended.map(({ task: number }) => number)).toEqual([1, 2]);
    expect(menu.tasks[1]!.could_change).toBe("confidence");
    expect(words(planned)).toContain(`${NOT_ON_PLAN_LEAD} Not on this plan, so not checked: “${CLAIMS[2]}” ` +
      "(It changes nothing you would do.) You can ask for a task on it.");
    expect(planned.structuredContent!.next_step).toContain(NOT_ON_PLAN_STRUCTURED);
    // The digest names the tasks as given: the same menu with other claims and no left_out is the same menu.
    const { left_out: _left, ...rest } = menuWith(receipt, { menu_digest: menu.menu_digest });
    const again = await call({ action: "plan_research", later_inputs: { researchMenu: { ...rest,
      tasks: rest.tasks.map((entry, index) => ({ ...entry, claims: index === 0 ? [2] : [] })) } } });
    const other = again.structuredContent!.researchMenu as { menu_changed?: true; claims: ClaimAccount[]; menu_digest: string };
    expect(other).not.toHaveProperty("menu_changed");
    expect(other.menu_digest).toBe(menu.menu_digest);
    // In neither place: said for both, by number, as AskRigor holds no text of the plain answer.
    expect(other.claims).toEqual([{ claim: 1, tasks: [] }, { claim: 2, tasks: [1] }, { claim: 3, tasks: [] }]);
    expect(words(again)).toContain(`${NOT_ON_PLAN_LEAD} Not on this plan, so not checked: “<claim 1, in its own words>” ` +
      "Not on this plan, so not checked: “<claim 3, in its own words>” You can ask for a task on any of these.");
  });

  it("reads a first menu that declares no claim as one whose claims are in neither place", async () => {
    const { call, register } = await tool({ accounting: true });
    const { left_out: _left, ...rest } = menuWith(receiptOf(await register()));
    const planned = await call({ action: "plan_research", later_inputs: { researchMenu: { ...rest,
      tasks: rest.tasks.map(({ claims: _claims, ...entry }) => entry) } } });
    expect(planned.structuredContent).not.toHaveProperty("problems");
    expect((planned.structuredContent!.researchMenu as { claims: ClaimAccount[] }).claims)
      .toEqual([1, 2, 3].map((claim) => ({ claim, tasks: [] })));
    expect(words(planned)).toContain("Not on this plan, so not checked: “<claim 2, in its own words>”");
  });

  /** An ask, and the tasks of its menu retyped without what they and the menu said of the claims. */
  async function askedMenu(later: Record<string, unknown> = {}) {
    const made = await tool({ accounting: true });
    const receipt = receiptOf(await made.register());
    const given = menuWith(receipt, { steering_choice: "Which leaves do you have?", ...later });
    const asked = await made.call({ action: "plan_research", later_inputs: { researchMenu: given } });
    const { left_out: _left, ...rest } = given;
    const retyped = { ...rest, tasks: given.tasks.map(({ claims: _claims, ...entry }: { claims?: unknown }) => entry),
      menu_digest: (asked.structuredContent!.researchMenu as { menu_digest: string }).menu_digest };
    const plan = (researchMenu: unknown) => made.call({ action: "plan_research", later_inputs: { researchMenu } });
    return { ...made, asked, given, retyped, plan };
  }
  type Menu = { next: string; claims: ClaimAccount[]; menu_changed?: true; recommended: Array<{ task: number }> };
  const menuResult = (result: Result) => result.structuredContent!.researchMenu as Menu;

  it("names the tasks' claims and left_out in the ask's rule for the person's reply, in its text and next_step", async () => {
    const { asked } = await askedMenu();
    expect(menuResult(asked).next).toBe("ask");
    expect(words(asked)).toContain("When the person replies: call manage_research_access action plan_research again with " +
      "the same plain_answer_receipt, tasks (each with its claims), left_out and menu_digest (researchMenu.menu_digest in " +
      "this result), research_target word for word");
    expect(asked.structuredContent!.next_step).toContain("then call action plan_research again with the same " +
      "plain_answer_receipt, tasks (each with its claims), left_out and menu_digest, and with their allocation and " +
      "person_answered true inside later_inputs.researchMenu");
    // On an account without it, as before: the rule names neither.
    const off = await tool({ accounting: false });
    const plain = await off.call({ action: "plan_research", later_inputs: { researchMenu: { research_target: TARGET,
      steering_choice: "Which leaves do you have?", tasks: [task()] } } });
    expect(words(plain)).toContain("again with the same plain_answer_receipt, tasks and menu_digest (researchMenu.menu_digest");
    expect(plain.structuredContent!.next_step).toContain("then call action plan_research again with their allocation and");
    for (const said of [words(plain), String(plain.structuredContent!.next_step)]) expect(said).not.toContain("left_out");
  });

  it("says nothing of a claim when the person's answer comes with the menu retyped without them, and asks for both back", async () => {
    const { asked, retyped, plan } = await askedMenu();
    const handed = (asked.structuredContent!.you_decide_later_inputs as { researchMenu: ResearchMenuInput }).researchMenu;
    const { left_out: _left, ...handedRest } = handed;
    const dropped = {
      // "you decide", the call handed over but for the two fields.
      youDecide: { ...handedRest, tasks: handed.tasks.map(({ claims: _claims, ...entry }) => entry), person_answered: true },
      // The person's own minutes, by the numbers they saw.
      allocation: { ...retyped, allocation: [{ task: 2, minutes: 4 }], person_answered: true },
      // A re-plan with a task done, which asks again.
      replan: { ...retyped, done: [1] },
    };
    for (const [name, menu] of Object.entries(dropped)) {
      const result = await plan(menu);
      expect(result.isError, words(result)).not.toBe(true);
      const read = menuResult(result);
      expect(read.next, name).toBe(name === "replan" ? "ask" : "go_on");
      expect(read, name).not.toHaveProperty("menu_changed");
      expect(read.claims, name).toEqual([]);
      expect(result.structuredContent!.problems, name).toEqual([CLAIMS_NOT_SENT]);
      expect(words(result), name).toContain(CLAIMS_NOT_SENT);
      for (const said of [words(result), JSON.stringify(result.structuredContent)]) expect(said, name).not.toContain("Not on this plan");
      // The next call is told to carry them.
      expect(words(result), name).toContain(name === "replan" ? "tasks (each with its claims), left_out and menu_digest"
        : CLAIMS_ON_A_LATER_CALL);
    }
    // The person's own minutes stand; a menu that is not the one shown, or one that declares any claim, is read as it is.
    expect(menuResult(await plan(dropped.allocation)).recommended).toEqual([{ task: 2, minutes: 4 }]);
    const changed = await plan({ ...retyped, tasks: [...retyped.tasks, { task: "Read a label", kind: "other", could_change: "conclusion" }] });
    expect(menuResult(changed)).toMatchObject({ menu_changed: true, claims: [1, 2, 3].map((claim) => ({ claim, tasks: [] })) });
    const one = await plan({ ...retyped, left_out: [{ claim: CLAIMS[2], why: "No room." }] });
    expect(menuResult(one).claims).toEqual([{ claim: 1, tasks: [] }, { claim: 2, tasks: [] },
      { claim: 3, tasks: [], text: CLAIMS[2], why: "No room." }]);
    for (const read of [changed, one]) expect(read.structuredContent).not.toHaveProperty("problems");
  });

  it("is told of the claims as before by the call the ask hands over, and by an answer that keeps them", async () => {
    const { asked, given, plan } = await askedMenu();
    const digest = (asked.structuredContent!.researchMenu as { menu_digest: string }).menu_digest;
    const handed = (asked.structuredContent!.you_decide_later_inputs as { researchMenu: ResearchMenuInput }).researchMenu;
    for (const menu of [{ ...handed, person_answered: true }, { ...given, menu_digest: digest, person_answered: true,
      allocation: [{ task: 2, minutes: 4 }] }, { ...given, menu_digest: digest, done: [1] }]) {
      const result = await plan(menu);
      expect(result.structuredContent).not.toHaveProperty("problems");
      expect(menuResult(result).claims).toEqual([{ claim: 1, tasks: [1] }, { claim: 2, tasks: [2] },
        { claim: 3, tasks: [], text: CLAIMS[2], why: "It changes nothing you would do." }]);
      expect(words(result)).toContain(`Not on this plan, so not checked: “${CLAIMS[2]}”`);
    }
  });

  it("keeps no menu choice for learn mode when what was recommended can't be told: a detail task, the claims dropped", async () => {
    const memory = memoryPlanner((source) => researchPlanOf(REPLY, 1, KEY, false, true,
      source.accounting === true ? source.claims : undefined)!);
    const { call, register, service } = await tool({ accounting: true, planner: memory.planner });
    const key = service.accountKeyForSubject("auth0|dev");
    await call({ action: "set_research_steering", later_inputs: { researchSteering: { learnMenuChoices: true } } }, "auth0|dev");
    const receipt = receiptOf(await register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! }));
    const answer = async (tasks: Array<Record<string, unknown>>, claims: boolean) => {
      const menu = { research_target: TARGET, plain_answer_receipt: receipt, steering_choice: "Which leaves do you have?",
        tasks: tasks.map((entry, index) => ({ ...entry, claims: [index + 1] })) };
      const shown = await call({ action: "plan_research", later_inputs: { researchMenu: menu } }, "auth0|dev");
      const { menu_digest } = shown.structuredContent!.researchMenu as { menu_digest: string };
      await call({ action: "plan_research", later_inputs: { researchMenu: { ...menu, ...(claims ? {} : { tasks }), menu_digest,
        allocation: [{ task: 1, minutes: 5 }], person_answered: true } } }, "auth0|dev");
      await waitForPendingMenuChoices(service);
      return (await service.menuChoices(key)).length;
    };
    const search = { task: "Find trials of the rinse", kind: "study_search", could_change: "conclusion" };
    const detail = { task: "Look up how the leaves are dried", kind: "abstract_screen", could_change: "detail" };
    expect(await answer([search, detail], true)).toBe(1);
    expect(await answer([search, detail], false)).toBe(1);
    // Without a detail task the recommendation is the same with the claims and without them, so the choice is kept.
    expect(await answer([search, { ...detail, could_change: "confidence" }], false)).toBe(2);
  });

  it("asks with the same lines, and hands the you-decide call over with both fields", async () => {
    const { call, register } = await tool({ accounting: true });
    const receipt = receiptOf(await register());
    const asked = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(receipt, {
      steering_choice: "Which leaves do you have?" }) } });
    expect((asked.structuredContent!.researchMenu as { next: string }).next).toBe("ask");
    expect(words(asked)).toContain(`\nNot on this plan, so not checked: “${CLAIMS[2]}” (It changes nothing you would do.)\n` +
      "You can ask for a task on it.\n");
    const handed = asked.structuredContent!.you_decide_later_inputs as { researchMenu: ResearchMenuInput };
    expect(handed.researchMenu.left_out).toEqual([{ claim: CLAIMS[2], why: "It changes nothing you would do." }]);
    expect(handed.researchMenu.tasks.map(({ claims, could_change }) => [claims, could_change]))
      .toEqual([[[1], "conclusion"], [[2], "detail"]]);
    const answered = await call({ action: "plan_research", later_inputs: { researchMenu: { ...handed.researchMenu,
      person_answered: true } } });
    expect((answered.structuredContent!.researchMenu as { next: string; claims: ClaimAccount[] })).toMatchObject({
      next: "go_on", claims: [{ tasks: [1] }, { tasks: [2] }, { tasks: [], text: CLAIMS[2] }] });
  });

  it("names what it could not use and refuses nothing for it; without a readable receipt it accounts for nothing", async () => {
    const { call, register } = await tool({ accounting: true });
    const receipt = receiptOf(await register());
    const odd = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(receipt, {
      left_out: [{ claim: "A sentence nobody registered.", why: "x" }, 4], tasks: [
        { task: "Find trials of the rinse", kind: "study_search", could_change: "conclusion", claims: [1, 8] }] }) } });
    expect(odd.isError, words(odd)).not.toBe(true);
    expect(odd.structuredContent!.problems).toEqual([
      "later_inputs.researchMenu.tasks[0].claims: 8 is past the 3 of the plain answer; left out.",
      "later_inputs.researchMenu.left_out[0].claim is not one of the plain answer's claims: copy it word for word as " +
        "register_plain_answer's result listed it."]);
    expect(words(odd)).toContain("8 is past the 3 of the plain answer; left out.");
    for (const without of [undefined, "rr1~plain_answer~x~1~y"]) {
      const menu = menuWith(receipt, { plain_answer_receipt: without });
      const planned = await call({ action: "plan_research", later_inputs: { researchMenu: menu } });
      expect(planned.isError, words(planned)).not.toBe(true);
      expect(planned.structuredContent!.researchMenu).not.toHaveProperty("claims");
      expect(words(planned)).not.toContain("Not on this plan");
    }
  });

  it("accounts only for a plain answer registered to be accounted for: one from before a window opened is planned as before", async () => {
    const { call, register } = await tool({ accounting: false });
    const receipt = receiptOf(await register());
    vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", "on");
    const planned = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(receipt) } });
    expect(planned.isError, words(planned)).not.toBe(true);
    expect(planned.structuredContent).not.toHaveProperty("problems");
    expect(planned.structuredContent!.researchMenu).not.toHaveProperty("claims");
    expect(words(planned)).not.toContain("Not on this plan");
    // And one registered with it, planned after the window ended, is planned as on any account without it.
    const after = receiptOf(await register());
    vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", "off");
    const ended = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(after) } });
    expect(ended.isError, words(ended)).not.toBe(true);
    expect(ended.structuredContent!.researchMenu).not.toHaveProperty("claims");
    expect(ended.structuredContent!.problems).toEqual([expect.stringContaining("AskRigor ignored later_inputs.researchMenu.left_out")]);
  });

  it("reads the outline's placeholders sent back as not given, with no problem named", async () => {
    const { call, register } = await tool({ accounting: true });
    const registered = await register();
    const outline = (registered.structuredContent as { menu_outline: { researchMenu: { tasks: object[];
      left_out: unknown } } }).menu_outline.researchMenu;
    const planned = await call({ action: "plan_research", later_inputs: { researchMenu: { ...outline,
      steering_could_help: false, tasks: [{ ...outline.tasks[0], task: "Find trials of the rinse", kind: "study_search",
        could_change: "conclusion" }] } } });
    expect(planned.isError, words(planned)).not.toBe(true);
    expect(planned.structuredContent).not.toHaveProperty("problems");
    expect((planned.structuredContent!.researchMenu as { claims: ClaimAccount[] }).claims)
      .toEqual([1, 2, 3].map((claim) => ({ claim, tasks: [] })));
  });

  it("hands both fields back with a menu it refuses", async () => {
    const { call, register } = await tool({ accounting: true });
    const receipt = receiptOf(await register());
    const refused = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(receipt, { tasks: [
      { task: "Find trials of the rinse", kind: "reading", could_change: "conclusion", claims: [1] }] }) } });
    expect(refused.isError).toBe(true);
    const example = (refused.structuredContent!.corrected_later_inputs as { researchMenu: Record<string, unknown> }).researchMenu;
    expect(example).toMatchObject({ tasks: [{ claims: [1], kind: MENU_PLACEHOLDERS.kind }],
      left_out: [{ claim: CLAIMS[2], why: "It changes nothing you would do." }] });
  });

  it("reads a menu's claims and left_out as before on an account without it: no part of the menu, named, unused", async () => {
    const { call, register } = await tool({ accounting: false });
    const receipt = receiptOf(await register());
    const planned = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(receipt) } });
    expect(planned.isError, words(planned)).not.toBe(true);
    expect(planned.structuredContent!.problems).toEqual([
      "AskRigor ignored later_inputs.researchMenu.left_out, later_inputs.researchMenu.tasks[0].claims, " +
        "later_inputs.researchMenu.tasks[1].claims, which are not part of plan_research's menu."]);
    const menu = planned.structuredContent!.researchMenu as { recommended: Array<{ task: number }> };
    expect(menu).not.toHaveProperty("claims");
    expect(menu.recommended.map(({ task: number }) => number)).toEqual([1]);
    expect(words(planned)).not.toContain("Not on this plan");
    const refused = await call({ action: "plan_research", later_inputs: { researchMenu: menuWith(receipt, { tasks: [
      { task: "Find trials of the rinse", kind: "reading", could_change: "conclusion", claims: [1] }] }) } });
    const example = (refused.structuredContent!.corrected_later_inputs as { researchMenu: { tasks: object[] } }).researchMenu;
    expect(example).not.toHaveProperty("left_out");
    expect(example.tasks[0]).not.toHaveProperty("claims");
  });

  function memoryPlanner(plan: (source: ResearchPlannerSource) => ResearchPlan) {
    const sources: ResearchPlannerSource[] = [];
    const planner: ResearchPlanner = { enabled: true, dailyCapUsd: 3, accountDailyCalls: 10, lane: async () => undefined,
      plan: async (source) => {
        sources.push(source);
        return { planning: { status: "planned", plan: plan(source) }, cached: false, costUsd: 0, milliseconds: 1 };
      } };
    return { planner, sources };
  }
  const menuOf = (result: Result) => (result.structuredContent as { planned_later_inputs: { researchMenu: ResearchMenuInput } })
    .planned_later_inputs.researchMenu;

  it("hands AskRigor's own plan over with the claims it covers and the words of those it leaves out", async () => {
    const memory = memoryPlanner((source) => researchPlanOf(REPLY, 1, KEY, false, true,
      source.accounting === true ? source.claims : undefined)!);
    const { call, register } = await tool({ accounting: true, planner: memory.planner });
    const registered = await register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! });
    expect(memory.sources[0]).toMatchObject({ accounting: true, claims: CLAIMS });
    const menu = menuOf(registered);
    expect(menu.tasks.map(({ claims }) => claims)).toEqual([[1, 2], undefined]);
    expect(menu.left_out).toEqual([{ claim: CLAIMS[2], why: "Step 3's five tasks are full." }]);
    expect((registered.content[0] as { text: string }).text).toContain(JSON.stringify({ researchMenu: menu }));
    const planned = await call({ action: "plan_research", later_inputs: { researchMenu: menu } }, "auth0|dev");
    expect((planned.structuredContent!.researchMenu as { claims: ClaimAccount[] }).claims).toEqual([
      { claim: 1, tasks: [1] }, { claim: 2, tasks: [1] },
      { claim: 3, tasks: [], text: CLAIMS[2], why: "Step 3's five tasks are full." }]);
    expect(words(planned)).toContain(`“${CLAIMS[2]}” (Step 3's five tasks are full.)`);
    // Off: the planner is asked as before, and the menu has neither field.
    const off = await tool({ accounting: false, planner: memory.planner });
    const plain = await off.register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! });
    expect(memory.sources[1]).not.toHaveProperty("accounting");
    expect(menuOf(plain)).not.toHaveProperty("left_out");
    expect(menuOf(plain).tasks.every((entry) => !("claims" in entry))).toBe(true);
  });

  it("asks the AI for no task and no left_out entry where AskRigor planned the research: its plan says both already", async () => {
    const memory = memoryPlanner((source) => researchPlanOf(REPLY, 1, KEY, false, true,
      source.accounting === true ? source.claims : undefined)!);
    const { call, register } = await tool({ accounting: true, planner: memory.planner });
    const inspected = words(await call({ action: "inspect" }, "auth0|dev"));
    expect(inspected).toContain(plainAnswerRequest(true, true, true));
    expect(inspected).toContain(`AskRigor signs it with the time. ${CLAIMS_PLANNED_AT_INSPECT}`);
    const registered = await register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! });
    expect(words(registered)).toContain(`pass that receipt too. ${CLAIMS_PLANNED}Pass this research_receipt`);
    for (const said of [inspected, words(registered), JSON.stringify(registered.structuredContent)]) {
      for (const asking of [CLAIMS_ON_THE_MENU, CLAIMS_ON_THE_MENU_REGISTERED, CLAIMS_AT_THE_SCREEN, CLAIMS_TASK_SHAPE,
        LEFT_OUT_SHAPE, "each claim gets a task"]) expect(said).not.toContain(asking.trim());
    }
    for (const planned of [CLAIMS_PLANNED, CLAIMS_PLANNED_AT_INSPECT]) {
      expect(planned).toContain("says which task covers each claim and which are left out: send both as given. Look beyond the " +
        "claims too. ");
    }
    // Another account, and a dev account whose plan was not made, plan themselves, and are asked as before.
    expect(words(await call({ action: "inspect" }))).toContain(plainAnswerRequest(true, true, false));
    const failing: ResearchPlanner = { ...memory.planner, plan: async () => ({ planning: { status: "skipped", reason: "timeout" },
      cached: false, costUsd: 0, milliseconds: 1 }) };
    const own = await (await tool({ accounting: true, planner: failing })).register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! });
    expect(words(own)).toContain(CLAIMS_ON_THE_MENU_REGISTERED);
    expect(words(own)).not.toContain("send both as given");
    // A light plan's go-ahead says to do only what its menu lists, so nothing there says to look beyond the claims.
    const light = memoryPlanner(() => researchPlanOf({ ...REPLY, lane: "light", tasks: [{ ...REPLY.tasks[0]!,
      kind: "full_text", claims: [1] }], left_out: [] }, 1, KEY, false, true, CLAIMS)!);
    const looked = words(await (await tool({ accounting: true, planner: light.planner })).register(CLAIMS, "auth0|dev",
      { asked: SOURCE.asked! }));
    expect(looked).toContain(`pass that receipt too. ${CLAIMS_PLANNED_LIGHT}Pass this research_receipt`);
    expect(looked).not.toContain("ook beyond the claims");
    // Off: as before, planned or not.
    const off = await tool({ accounting: false, planner: memory.planner });
    expect(words(await off.call({ action: "inspect" }, "auth0|dev"))).toContain(plainAnswerRequest(true));
    expect(words(await off.register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! })))
      .toContain("Treat each claim as something to check, confirm or correct, and look beyond the claims too. Pass ");
    expect(plainAnswerRequest(true, false, true)).toBe(plainAnswerRequest(true));
  });

  it("finds a kept plan's claims again when the registration's changed: by their words, never by number", async () => {
    const kept = researchPlanOf({ ...REPLY, left_out: [{ claim: 3, why: "No room." }] }, 1, KEY, false, true, CLAIMS)!;
    const { planner } = memoryPlanner(() => kept);
    const { register } = await tool({ accounting: true, planner });
    // A premise verdict first, the plan's second claim dropped, its third kept.
    const premise = "Cotton socks help too.";
    const menu = menuOf(await register([premise, CLAIMS[2]!, CLAIMS[0]!], "auth0|dev", { asked: SOURCE.asked! }));
    expect(menu.tasks.map(({ claims }) => claims)).toEqual([[3], undefined]);
    // The new claim is left out without a why, the plan's own left-out claim with its own.
    expect(menu.left_out).toEqual([{ claim: premise }, { claim: CLAIMS[2], why: "No room." }]);
    // A plan that knows none of them leaves them all out; its tasks then name no claim.
    const others = menuOf(await register([premise], "auth0|dev", { asked: SOURCE.asked! }));
    expect(others.tasks.every((entry) => !("claims" in entry))).toBe(true);
    expect(others.left_out).toEqual([{ claim: premise }]);
    // A plan with every claim covered hands over no left_out.
    const all = memoryPlanner(() => researchPlanOf({ ...REPLY, left_out: [], tasks: [{ ...REPLY.tasks[0]!,
      claims: [1, 2, 3] }] }, 1, KEY, false, true, CLAIMS)!);
    const full = await tool({ accounting: true, planner: all.planner });
    expect(menuOf(await full.register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! }))).not.toHaveProperty("left_out");
  });

  it("gives a light look-up's menu the same fields, and a step aside none", async () => {
    const light = memoryPlanner(() => researchPlanOf({ ...REPLY, lane: "light", tasks: [{ ...REPLY.tasks[0]!,
      kind: "full_text", claims: [1] }], left_out: [] }, 1, KEY, false, true, CLAIMS)!);
    const { register } = await tool({ accounting: true, planner: light.planner });
    expect(menuOf(await register(CLAIMS, "auth0|dev", { asked: SOURCE.asked! }))).toMatchObject({ lane: "light",
      tasks: [{ claims: [1] }], left_out: [{ claim: CLAIMS[1] }, { claim: CLAIMS[2] }] });
    const aside = memoryPlanner(() => researchPlanOf({ ...REPLY, lane: "aside", tasks: [] }, 1, KEY, false, true, CLAIMS)!);
    const stepped = await (await tool({ accounting: true, planner: aside.planner })).register(CLAIMS, "auth0|dev",
      { asked: SOURCE.asked! });
    expect(stepped.structuredContent).toMatchObject({ research_plan: { lane: "aside" } });
    expect(stepped.structuredContent).not.toHaveProperty("planned_later_inputs");
    expect(words(stepped)).not.toMatch(/left_out|research menu/u);
  });
});

describe("the final check's numbering of the claims (owner answer 413a)", () => {
  const DOI = "10.1000/rinse-trial";
  const ACCOUNT = plainAnswerAccountBinding(SECRET, "a".repeat(64));
  const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the plain answer." };
  const check = (first: "0" | "1" | undefined) => finalizeResearch(withSourceReading(withCommunitySkip({
    receipts: [issueResearchReceipt("plain_answer", { claims: digests, text: "0".repeat(64),
      target: researchTargetDigest(TARGET), acct: ACCOUNT, t: 1_000, ...(first === undefined ? {} : { first }) },
    { secret: SECRET }), issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields", t: 2_000 },
      { secret: SECRET })],
    research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared", community_evidence: "not_relevant",
    not_relevant_basis: "no_real_world_outcome", question_about: "other", not_relevant_reason: "Synthetic fixture.",
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: "Synthetic fixture." },
    key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: `[Trial](https://doi.org/${DOI}) was read in full.`,
    plain_answer_comparison: [{ claim: CLAIMS[0]!, outcome: "not_checked" }],
  } as FinalizeResearchInput)), { secret: SECRET, plainAnswer: { note: true, account: ACCOUNT } });

  it("counts the claims left out as manage_research_access numbered them, from 1 only when the receipt says so", () => {
    const message = (result: ReturnType<typeof check>) => result.next_steps.find((step) => step.includes("leaves out"));
    expect(message(check("1"))).toContain("plain_answer_comparison leaves out claims 2 and 3 of the plain answer");
    for (const before of [undefined, "0"] as const) {
      expect(message(check(before))).toContain("plain_answer_comparison leaves out claims 1 and 2 of the plain answer");
    }
    // Nothing else differs.
    const strip = ({ carried: _issued, ...result }: ReturnType<typeof check>) => JSON.stringify({ ...result,
      round_token: undefined, carry_forward: undefined }).replaceAll("claims 2 and 3", "claims 1 and 2");
    expect(strip(check("1"))).toBe(strip(check(undefined)));
  });
});
