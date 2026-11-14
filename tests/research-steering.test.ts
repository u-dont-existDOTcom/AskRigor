// Owner answer 279a (9 Nov 2026), from the owner's report AskRigor#434: research the person can steer. The framing goes
// with the plain answer, a quick screen ends in a numbered menu of next tasks with times, and each account sets its
// research style once. Nothing here blocks research: AskRigor's results say what to do next.
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  DEFAULT_RESEARCH_STEERING,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  type ResearchSteering,
} from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RESEARCH_USE_SCOPE, createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import {
  ASIDE_OPENING,
  ASK_ABOVE_MINUTES,
  COULD_CHANGE,
  FORM_PEOPLE_USE,
  LIGHT_LANE_PLANNED,
  LIGHT_LOOKUP,
  MENU_PLACEHOLDERS,
  PEOPLE_FIRST_WHEN_USED,
  PEOPLE_TASK_MISSING,
  PERSON_ANSWER_DECLARED,
  PLAN_TASK_KINDS,
  RESEARCH_LOOPS,
  READING_FIRST,
  RESEARCH_MENU_SHAPE,
  STEERING_CHOICE,
  STYLE_REPLY,
  TARGET_NOT_REGISTERED,
  NAMED_ANSWER_STEERS,
  URGENT_FIRST,
  planTaskSchema,
  researchMenuSchema,
  PLAN_TASK_MINUTES,
  WORDS_ARE_NOT_SIZES,
  adjustmentGuidance,
  allocationAnswered,
  allocationNotUsedStop,
  asideGuidance,
  asideNextStep,
  choicePlaceholderWords,
  correctedMenu,
  framingGuidance,
  isLightLane,
  menuDigest,
  menuPreferenceLine,
  framingNextStep,
  planNextStep,
  planResearch,
  planResearchText,
  plannedGuidance,
  plannedNextStep,
  readResearchMenu,
  steeringChoiceLeftOut,
  steeringSentence,
  taskMinutes,
  youDecideLaterInputs,
  youDecideLaterInputsSchema,
  youDecideLine,
  type ResearchMenuInput,
} from "../apps/research-mcp/src/research-steering.js";

const SECRET = "research-steering-test-secret-0123456789abcdef";
const TARGET = "Whether a lower sodium-to-potassium ratio lowers blood pressure in adults";
const primaryResource = new URL("https://mcp.askrigor.example/mcp");
const claudeResource = new URL("https://mcp.askrigor.example/mcp/claude");
const issuerUrl = new URL("https://identity.askrigor.example/");
const clients: Client[] = [];
const servers: HttpServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  vi.unstubAllEnvs();
});

const agreement = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
} as const;

async function start() {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "research-steering-test-key" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 7) });
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    oauthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: primaryResource, issuerUrl, jwks, allowedClientIds: ["chatgpt-client"], reviewerSubjects: [],
    }),
    claudeOAuthResourceServer: createJwtOAuthResourceServer({
      resourceUrl: claudeResource, issuerUrl, jwks, allowedClientIds: ["claude-client"], reviewerSubjects: [],
    }),
    researchContributorAccessService: service,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  const connect = async (surface: "/mcp" | "/mcp/claude", subject: string) => {
    const token = await new SignJWT({
      iss: issuerUrl.href,
      aud: surface === "/mcp" ? primaryResource.href : claudeResource.href,
      exp: Math.floor(Date.now() / 1_000) + 300,
      client_id: surface === "/mcp" ? "chatgpt-client" : "claude-client",
      scope: RESEARCH_USE_SCOPE,
      sub: subject,
    }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
    const client = new Client({ name: "research-steering-test", version: "1.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(surface, base), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }));
    return async (args: Record<string, unknown>) =>
      await client.callTool({ name: "manage_research_access", arguments: args }) as {
        content: Array<{ type: string; text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean;
      };
  };
  return { service, connect };
}

const text = (result: { content: Array<{ text: string }> }) => result.content.map(({ text }) => text).join("\n");
const PLAIN = {
  researchTarget: TARGET,
  text: "A lower sodium-to-potassium ratio is linked to lower blood pressure. Eating more potassium helps most.",
  claims: ["A lower sodium-to-potassium ratio is linked to lower blood pressure."],
};

describe("the research style each account sets once (owner answer 279a)", () => {
  it("defaults to balanced, ten minutes and flagged adjustments, and changes only the parts given", async () => {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 3) });
    await service.acceptFreeContributor("auth0|a", agreement);
    expect((await service.activeAccount("auth0|a")).steering).toEqual(DEFAULT_RESEARCH_STEERING);
    expect(DEFAULT_RESEARCH_STEERING).toEqual({ style: "balanced", checkBackMinutes: 10, adjustmentDetail: "flagged" });
    await expect(service.setResearchSteering("auth0|a", { style: "guided" })).resolves.toEqual(
      { style: "guided", checkBackMinutes: 10, adjustmentDetail: "flagged" });
    await expect(service.setResearchSteering("auth0|a", { checkBackMinutes: 25, adjustmentDetail: "all" })).resolves
      .toEqual({ style: "guided", checkBackMinutes: 25, adjustmentDetail: "all" });
    // Saving the account anew (accepting again) and revoking it keep the style; only its setter changes it.
    await service.acceptFreeContributor("auth0|a", agreement);
    expect((await service.activeAccount("auth0|a")).steering).toEqual(
      { style: "guided", checkBackMinutes: 25, adjustmentDetail: "all" });
    await service.revoke("auth0|a");
    await expect(service.setResearchSteering("auth0|a", { style: "autonomous" })).rejects.toThrow();
    await expect(service.setResearchSteering("auth0|new", { style: "autonomous" })).rejects.toThrow();
    await service.acceptFreeContributor("auth0|b", agreement);
    await expect(service.setResearchSteering("auth0|b", { checkBackMinutes: 0 })).rejects.toThrow();
    await expect(service.setResearchSteering("auth0|b", { checkBackMinutes: 121 })).rejects.toThrow();
  });

  // The review of 12 Nov 2026: two chats each changing one part of the style read the whole style, and the later write
  // put back the part the other had changed. Each change now writes only the parts it names, and the account switches
  // only their own.
  it("keeps both of two interleaved changes, each to its own parts, beside the account's other switches", async () => {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 5) });
    await service.acceptFreeContributor("auth0|two-chats", agreement);
    const [first, second] = await Promise.all([
      service.setResearchSteering("auth0|two-chats", { style: "guided" }),
      service.setResearchSteering("auth0|two-chats", { checkBackMinutes: 25 }),
      service.setResearchSteering("auth0|two-chats", { adjustmentDetail: "all" }),
      service.setPlainAnswerNote("auth0|two-chats", false),
      service.setDetailedLessonReports("auth0|two-chats", true),
      service.setFindingsSave("auth0|two-chats", false),
    ]);
    expect(first.style).toBe("guided");
    expect(second.checkBackMinutes).toBe(25);
    const account = await service.activeAccount("auth0|two-chats");
    expect(account.steering).toEqual({ style: "guided", checkBackMinutes: 25, adjustmentDetail: "all" });
    expect(account).toMatchObject({ plainAnswerNote: false, detailedLessonReports: true, findingsSave: false });
  });

  it("is shown by inspect and changed by set_research_steering, through /mcp and /mcp/claude", async () => {
    const { service, connect } = await start();
    await service.acceptFreeContributor("auth0|person", agreement);
    for (const surface of ["/mcp", "/mcp/claude"] as const) {
      const manage = await connect(surface, "auth0|person");
      const inspected = await manage({ action: "inspect" });
      expect(inspected.structuredContent).toMatchObject({ ok: true, steering: expect.any(Object) });
      expect(text(inspected)).toContain("Research style: ");
      expect(text(inspected)).toContain("set_research_steering with later_inputs.researchSteering");
    }
    const manage = await connect("/mcp", "auth0|person");
    const set = await manage({ action: "set_research_steering", later_inputs: { researchSteering: { style: "autonomous",
      checkBackMinutes: 20 } } });
    expect(set.isError).not.toBe(true);
    expect(set.structuredContent).toEqual({ ok: true, steering: { style: "autonomous", checkBackMinutes: 20,
      adjustmentDetail: "flagged" } });
    expect(text(set)).toContain("Research style: autonomous (goes on through the research and reports as it goes), " +
      "checking back after 20 minutes; for what key observational studies adjusted for, only adjustments that look " +
      "doubtful on a quick check. This applies to this account's research until the person changes it.");
    expect((await manage({ action: "inspect" })).structuredContent).toMatchObject({ steering: { style: "autonomous" } });
    // Nothing to change, the input with another action, or the action without it: refused, nothing changed.
    for (const args of [
      { action: "set_research_steering", later_inputs: { researchSteering: {} } },
      { action: "inspect", later_inputs: { researchSteering: { style: "guided" } } },
      { action: "set_research_steering" },
      { action: "inspect", later_inputs: { framing: { likely_question: "What helps?" } } },
    ]) {
      expect((await manage(args)).structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    }
    expect((await service.activeAccount("auth0|person")).steering.style).toBe("autonomous");
  });
});

describe("the framing given with the plain answer (owner answer 279a)", () => {
  const framing = {
    likely_question: "Does lowering the sodium-to-potassium ratio lower blood pressure?",
    premise_doubts: ["The question asks about raising the ratio; lowering it is what is linked to lower pressure."],
    redirecting_questions: ["Did you mean lowering the ratio?", "Is this about your own blood pressure?"],
  };
  const steering = (style: ResearchSteering["style"]): ResearchSteering => ({ ...DEFAULT_RESEARCH_STEERING, style });

  it("says, by the account's style, whether to ask before researching", () => {
    const balanced = framingGuidance(steering("balanced"), framing);
    expect(balanced).toContain("Ask the person these questions now, before any research call: 1. Did you mean " +
      "lowering the ratio? 2. Is this about your own blood pressure? Your whole reply this turn is these questions");
    // The review of 11 Nov 2026: when asking, the doubt goes in the one line allowed before the questions, with no
    // reading taken; the reading taken is for going on.
    expect(balanced).toContain("with at most one line before them on what your plain answer suggests, marked not yet " +
      "checked, and on what looks inverted, unclear or possibly false in the question (\"The question asks about " +
      "raising the ratio; lowering it is what is linked to lower pressure.\"); then end your turn");
    expect(balanced).not.toContain("which reading you take");
    expect(balanced).not.toContain("Say plainly near the start of your reply");
    // 11 Nov 2026: the ask ends the turn, and says what to do once they answer.
    expect(balanced).toContain("then end your turn, with no research call");
    expect(balanced).toContain("When they answer:");
    expect(framingGuidance(steering("guided"), framing)).toContain("Ask the person these questions now");
    const autonomous = framingGuidance(steering("autonomous"), framing);
    expect(autonomous).toContain("don't stop to ask");
    expect(autonomous).not.toContain("Ask the person these questions now");
    const clear = { likely_question: framing.likely_question };
    expect(framingGuidance(steering("balanced"), clear)).toContain("No question could redirect the research, so go on " +
      "without asking.");
    expect(framingGuidance(steering("autonomous"), clear)).toContain("go on without asking");
    const guided = framingGuidance(steering("guided"), clear);
    expect(guided).toContain("one line confirming the question you will research");
    expect(guided).toContain("then end your turn");
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      expect(framingGuidance(steering(style), clear)).toContain("Screen first:");
      expect(framingGuidance(steering(style), undefined)).toContain("Give later_inputs.framing with the plain answer " +
        "next time");
      // The screen says it is short and that an ask ends the turn, before the model starts it.
      expect(framingGuidance(steering(style), clear)).toContain("when it says to ask, your reply is the message it " +
        "gives, and the turn ends there.");
    }
    // Going on, the doubt is said with the reading taken.
    expect(autonomous).toContain("Say plainly near the start of your reply what looks inverted, unclear or possibly " +
      "false (\"The question asks about raising the ratio; lowering it is what is linked to lower pressure.\"), and " +
      "which reading you take.");
    // The same step as a runtime field, for an app that hands its model only the structured content.
    expect(framingNextStep(steering("balanced"), framing)).toMatch(/^Ask the person your framing's redirecting_questions now and end your turn/u);
    expect(framingNextStep(steering("balanced"), framing)).toContain("leaving later_inputs.framing out");
    expect(framingNextStep(steering("guided"), clear)).toMatch(/^Confirm the question you will research in one line/u);
    for (const [style, given] of [["balanced", clear], ["guided", undefined], ["autonomous", clear]] as const) {
      expect(framingNextStep(steering(style), given)).toMatch(/^Screen in a few calls/u);
    }
    expect(framingNextStep(steering("autonomous"), framing)).toMatch(new RegExp("^If a doubt that could be false is " +
      "not yet a claim of the plain answer, register the plain answer again first, with the same " +
      "later_inputs\\.framing\\. Screen in a few calls", "u"));
  });

  // The review of 11 Nov 2026: the framing isn't stored, so a registration made before the ask, without it, said to
  // screen and cancelled the ask; one made after the answers with it would ask the answered questions again.
  it("moves any new registration after the person's answer when asking, and keeps the framing when going on", () => {
    const doubtful = { likely_question: framing.likely_question, premise_doubts: framing.premise_doubts };
    for (const style of ["balanced", "guided"] as const) {
      const asking = framingGuidance(steering(style), framing);
      expect(asking).not.toContain("register the plain answer again now");
      expect(asking).toContain("When they answer: register the plain answer again if the answers change the question " +
        "(for the new research target) or if a doubt that could be false, not only unclear, is not yet a claim of the " +
        "plain answer (with a sentence giving your quick verdict on it among the claims, so the final check compares " +
        "it), leaving later_inputs.framing out now that the person has answered (its result's request for a framing " +
        "is for the next question); then screen and plan as follows.");
      // Registered again as told, with no framing, the result says to screen: the step after the answers.
      expect(framingNextStep(steering(style), undefined)).toMatch(/^Screen in a few calls/u);
    }
    const noDoubts = framingGuidance(steering("balanced"), { ...framing, premise_doubts: undefined });
    expect(noDoubts).toContain("When they answer: if the answers change the question, register the plain answer " +
      "again for the new research target, leaving later_inputs.framing out now that the person has answered (its " +
      "result's request for a framing is for the next question); then screen and plan as follows.");
    // The review of 12 Nov 2026: that registration's result still asks for a framing "next time", which is for the next
    // question, so a third registration doesn't send the same framing and ask again; next_step says so too.
    for (const style of ["balanced", "guided"] as const) {
      expect(framingNextStep(steering(style), framing)).toContain("leaving later_inputs.framing out (its result's " +
        "request for a framing is for the next question)");
    }
    expect(framingNextStep(steering("guided"), { likely_question: framing.likely_question,
      premise_doubts: framing.premise_doubts })).toContain("leaving later_inputs.framing out (its result's request " +
      "for a framing is for the next question)");
    // Guided with nothing to ask: the doubt goes in the line it confirms, and any new registration follows the yes.
    const confirming = framingGuidance(steering("guided"), doubtful);
    expect(confirming).toContain("your whole reply this turn is one line confirming the question you will research " +
      "and asking for their yes, saying in it what looks inverted, unclear or possibly false");
    expect(confirming).toContain("After their yes, if a doubt that could be false, not only unclear, is not yet a " +
      "claim of the plain answer, register the plain answer again with a sentence giving your quick verdict on it " +
      "among the claims, so the final check compares it, leaving later_inputs.framing out now that the person has " +
      "answered (its result's request for a framing is for the next question); then screen and plan as follows.");
    expect(confirming).not.toContain("register the plain answer again now");
    expect(confirming).not.toContain("which reading you take");
    // Going on, a new registration made now keeps the same framing, whose result asks nothing.
    const going = framingGuidance(steering("balanced"), doubtful);
    expect(going).toContain("register the plain answer again now, before any research call, with the same " +
      "later_inputs.framing and a sentence giving your quick verdict on it among the claims, so the final check " +
      "compares it.");
    expect(framingNextStep(steering("balanced"), doubtful)).toMatch(/^If a doubt that could be false/u);
  });

  it("goes with register_plain_answer through the connector and keeps nothing of it", async () => {
    const { service, connect } = await start();
    await service.acceptFreeContributor("auth0|person", agreement);
    const manage = await connect("/mcp/claude", "auth0|person");
    const registered = await manage({ action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: { framing } });
    expect(registered.isError).not.toBe(true);
    expect(registered.structuredContent).toMatchObject({ ok: true, plainAnswer: { requested: true, claims: 1 } });
    expect(text(registered)).toContain("Ask the person these questions now");
    expect(text(registered)).toContain(`Research target, as signed: ${JSON.stringify(TARGET)}.`);
    // 11 Nov 2026: the next step comes first (after any tool-list notice), and as a runtime field too.
    expect(registered.content[0]!.text.endsWith(framingGuidance(DEFAULT_RESEARCH_STEERING, framing))).toBe(true);
    expect(registered.content[0]!.text).not.toContain("Plain answer registered");
    expect(registered.structuredContent).toMatchObject({
      next_step: framingNextStep(DEFAULT_RESEARCH_STEERING, framing) });
    expect((registered.structuredContent as { next_step: string }).next_step).toEqual(expect.any(String));
    const without = await manage({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(text(without)).toContain("Give later_inputs.framing with the plain answer next time");
    expect((without.structuredContent as { next_step: string }).next_step).toMatch(/^Screen in a few calls/u);
    // The account row holds no framing.
    const stored = JSON.stringify(await (service as unknown as { store: InMemoryResearchContributorAccessStore })
      .store.getAccount(service.accountKeyForSubject("auth0|person")));
    expect(stored).not.toContain("lowering");
  });
});

const TASKS: ResearchMenuInput["tasks"] = [
  { task: "Read the 2018 cohort's full text", kind: "full_text", could_change: "conclusion" },
  { task: "Search trials of potassium-enriched salt", kind: "study_search", sources: 2, could_change: "confidence" },
  { task: "Read the two longest forum threads on salt substitutes", kind: "forum_thread", sources: 2,
    could_change: "detail" },
  { task: "Search studies for the muscle cramps people reported", kind: "study_search", could_change: "confidence",
    loop: "people_to_studies" },
];
const menu = (overrides: Partial<ResearchMenuInput> = {}): ResearchMenuInput =>
  ({ research_target: TARGET, tasks: TASKS, ...overrides });

describe("the menu of next tasks after a quick screen (owner answer 279a)", () => {
  it("estimates each task from its kind and sources, or the model's own range", () => {
    expect(Object.keys(PLAN_TASK_MINUTES).sort()).toEqual(PLAN_TASK_KINDS.filter((kind) => kind !== "other").sort());
    expect(taskMinutes({ task: "x x x", kind: "full_text", could_change: "conclusion" })).toEqual([1, 3]);
    expect(taskMinutes({ task: "x x x", kind: "full_text", sources: 3, could_change: "conclusion" })).toEqual([3, 8]);
    expect(taskMinutes({ task: "x x x", kind: "abstract_screen", sources: 20, could_change: "detail" })).toEqual([4, 10]);
    expect(taskMinutes({ task: "x x x", kind: "abstract_screen", could_change: "detail" })).toEqual([0.5, 1]);
    expect(taskMinutes({ task: "x x x", kind: "other", could_change: "detail" })).toBeNull();
    expect(taskMinutes({ task: "x x x", kind: "other", could_change: "detail", minutes: [9, 4] })).toEqual([4, 9]);
  });

  it("recommends what could change the conclusion first, within the check-back allowance, never detail alone", () => {
    const result = planResearch(menu(), DEFAULT_RESEARCH_STEERING);
    // 1 (conclusion, 1-3: 2 min), then 2 (confidence, 1-5: 3 min) and 4 (0.5-3: 2 min): 7 minutes, within 10.
    expect(result.recommended).toEqual([{ task: 1, minutes: 2 }, { task: 2, minutes: 3 }, { task: 4, minutes: 2 }]);
    expect(result.recommended_minutes).toEqual([3, 11]);
    // Balanced asks when the recommended tasks could take more than about 10 minutes (here 11), or unless the menu says
    // the person's choices could not steer the research (owner answer 284).
    expect(result.next).toBe("ask");
    const short = planResearch(menu({ tasks: [TASKS[3]!], steering_could_help: false }), DEFAULT_RESEARCH_STEERING);
    expect(short).toMatchObject({ recommended: [{ task: 1, minutes: 2 }], recommended_minutes: [0.5, 3], next: "go_on",
      steering_could_help: false });
    // A smaller allowance keeps the first task even when it alone is longer.
    expect(planResearch(menu(), { ...DEFAULT_RESEARCH_STEERING, checkBackMinutes: 1 }).recommended)
      .toEqual([{ task: 1, minutes: 2 }]);
    // Detail only: nothing recommended.
    expect(planResearch(menu({ tasks: [TASKS[2]!] }), DEFAULT_RESEARCH_STEERING).recommended).toEqual([]);
  });

  it("asks or goes on by the account's style, and follows the person's allocation once given", () => {
    expect(planResearch(menu({ tasks: [TASKS[3]!] }), { ...DEFAULT_RESEARCH_STEERING, style: "guided" }).next)
      .toBe("ask");
    const autonomous = planResearch(menu(), { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" });
    expect(autonomous.next).toBe("go_on");
    expect(planResearchText(autonomous, new Set())).toContain("After about 10 minutes of research, or sooner if a new " +
      "finding could change the conclusion, check what you have with finalize_research and give that answer");
    const allocated = planResearch(menu({ allocation: [{ task: 1, minutes: 5 }, { task: 3, minutes: 4 },
      { task: 4, minutes: 1 }], person_answered: true, done: [1] }), DEFAULT_RESEARCH_STEERING);
    expect(allocated).toMatchObject({ next: "go_on", recommended: [{ task: 3, minutes: 4 }, { task: 4, minutes: 1 }],
      recommended_minutes: [5, 5] });
    const words = planResearchText(allocated, new Set([1]));
    expect(words).toContain("1. Read the 2018 cohort's full text: could change the conclusion; about 1 to 3 min (done).");
    expect(words).toContain("4. Search studies for the muscle cramps people reported: could change how sure the " +
      "answer is, studies checked for what people reported; about 0.5 to 3 min.");
    expect(words).toContain("Recommended: 3. 4 min, 4. 1 min, about 5 min in all. Then the final check and writing " +
      "the answer: about 4 to 10 min.");
    expect(words).toContain("Go on now: do these tasks in this order, each within its minutes, showing the menu as " +
      "what you are doing; then check the answer with finalize_research and give it in this turn.");
    const asked = planResearchText(planResearch(menu(), DEFAULT_RESEARCH_STEERING), new Set(), false, TARGET);
    // 11 Nov 2026: the ask ends the turn, gets no final check, and hands over the question.
    expect(asked).toContain("then end your turn");
    expect(asked).toContain("don't call finalize_research for this reply");
    expect(asked).toContain("How should I spend the time? Reply with task numbers and minutes, such as \"1. 5 min, " +
      "2. 4 min\", in your own words, or \"you decide\".");
    // Every menu that goes on carries the progress line, the way back after a stop, the loop between reports and
    // studies, and the adjusted-variables look by the account's choice; the ask carries none of them, so nothing follows
    // the rule for the person's answer.
    for (const words of [planResearchText(allocated, new Set([1])), planResearchText(autonomous, new Set())]) {
      expect(words).toContain("Before each task, say in one line what you will read, how deep, and why.");
      expect(words).toContain("If the person stops you or changes direction, call plan_research again");
      expect(words).toContain("later_inputs.community_leads");
      expect(words).toContain(adjustmentGuidance("flagged"));
    }
    // The review of 11 Nov 2026: a new fork goes back through the menu without the allocation, so the rule decides
    // afresh; autonomous research checks and answers instead, so it gets no such sentence.
    expect(words).toContain("A new fork that could change the conclusion comes back to the person through the menu: " +
      "call plan_research again with done, the new task and this result's menu_digest, leaving allocation out, and its " +
      "result says whether to ask now.");
    expect(planResearchText(autonomous, new Set())).not.toContain("A new fork");
    for (const part of ["Before each task", WORDS_ARE_NOT_SIZES, adjustmentGuidance("flagged"),
      "later_inputs.community_leads"]) {
      expect(asked).not.toContain(part);
    }
  });

  it("ends a menu that asks with the research styles and the person's own (the owner, 13 Nov 2026)", () => {
    for (const style of ["guided", "balanced"] as const) {
      const steering = { ...DEFAULT_RESEARCH_STEERING, style };
      const asked = planResearch(menu(), steering);
      expect(asked.next).toBe("ask");
      const lines = planResearchText(asked, new Set()).split("\n");
      const question = lines.findIndex((line) => line.startsWith("How should I spend the time?"));
      expect(question).toBeGreaterThanOrEqual(0);
      expect(lines[question + 1]).toBe("To change how often I ask you, say \"guided\" (I ask at the start and before " +
        "every long task), \"balanced\" (I ask only when your answer could change the research, or when it could " +
        "take more than about 10 minutes) or \"autonomous\" (I go on and report as I go). Yours is " +
        `${style} now.`);
      const going = planResearch(menu({ allocation: [{ task: 1, minutes: 5 }], person_answered: true }), steering);
      expect(going.next).toBe("go_on");
      expect(planResearchText(going, new Set()).split("\n")
        .filter((line) => line.startsWith("To change how often I ask you"))).toEqual([]);
    }
  });

  // The owner, 11 Nov 2026: "it's still not asking me any steering questions". In the 10 Nov timing runs the rule asked
  // on 9 of 15 first menus and the AI stopped on 2; the ask came after the menu, five paragraphs followed it, and nothing
  // said to end the turn.
  it("puts the stop first, hands over the message with one menu line per task, and ends with the rule for the answer", () => {
    const result = planResearch(menu({ plain_answer_receipt: "rr1~x" }), DEFAULT_RESEARCH_STEERING,
      { matches: true, minutesSince: 2 });
    const asked = planResearchText(result, new Set(), false, TARGET);
    const [decision, ...rest] = asked.split("\n");
    expect(decision).toBe("This person's research style asks first when the recommended tasks could take more than " +
      "about 10 minutes, as these could, and when their choices could steer the research, as they usually can " +
      "(steering_could_help was left out). Ask now, before any of these tasks: your whole reply this turn is the " +
      "message below, in the person's language, after the urgent action if the question is urgent; then end your " +
      "turn. Make no research call and don't call finalize_research for this reply: it is a question, not an answer " +
      "(HRP StructuredUserSteeringAndApproval: when approval is required, begin no substantive source collection in " +
      "the same response). About 2 minutes have passed since the plain answer was registered.");
    expect(rest).toEqual([
      "Your reply: at most two sentences on what the first look suggests, saying it is not yet checked, and one on " +
        "what their choices could change, such as their own situation, the form or dose they use, or the outcome that " +
        "matters most to them; then this menu, numbered as here, saying for each task whether it means a quick look, " +
        "reading in full or a method audit (the times are rough planning estimates):",
      "1. Read the 2018 cohort's full text: could change the conclusion; about 1 to 3 min.",
      "2. Search trials of potassium-enriched salt: could change how sure the answer is; about 1 to 5 min.",
      "3. Read the two longest forum threads on salt substitutes: adds detail only; about 1 to 3 min.",
      "4. Search studies for the muscle cramps people reported: could change how sure the answer is, studies checked " +
        "for what people reported; about 0.5 to 3 min.",
      "Recommended: 1. 2 min, 2. 3 min, 4. 2 min, about 3 to 11 min in all; then about 4 to 10 min to check and " +
        "write the answer.",
      "How should I spend the time? Reply with task numbers and minutes, such as \"1. 5 min, 2. 4 min\", in your own " +
        "words, or \"you decide\".",
      "To change how often I ask you, say \"guided\" (I ask at the start and before every long task), \"balanced\" " +
        "(I ask only when your answer could change the research, or when it could take more than about 10 minutes) " +
        "or \"autonomous\" (I go on and report as I go). Yours is balanced now.",
      "When the person replies: call manage_research_access action plan_research again with the same " +
        "plain_answer_receipt, tasks and menu_digest (researchMenu.menu_digest in this result), research_target word " +
        `for word ${JSON.stringify(TARGET)}, and their ` +
        "allocation inside researchMenu, as a list of {task, minutes}, with person_answered true in researchMenu too " +
        "(send it only once they have answered this menu in a message of their own; an allocation without it is not " +
        "used); for \"you decide\", or a reply that leaves the choice to you such as \"continue\", the recommended " +
        "allocation, with person_answered true too. If the reply changes the question, register the plain answer " +
        "again for the new research target first, with later_inputs.framing for it. Never send an allocation the " +
        "person did not give or leave to you. If the reply asks for another research style, set it first with " +
        "action set_research_steering (later_inputs.researchSteering with style guided, balanced or autonomous), " +
        "then call plan_research again.",
    ]);
    expect(asked.endsWith("Never send an allocation the person did not give or leave to you. If the reply asks " +
      "for another research style, set it first with action set_research_steering (later_inputs.researchSteering " +
      "with style guided, balanced or autonomous), then call plan_research again.")).toBe(true);
    // A first menu with no task reading people's reports, or a research target not the registered one: said first.
    const fixes = planResearchText(planResearch(menu({ tasks: [TASKS[0]!, TASKS[1]!] }), DEFAULT_RESEARCH_STEERING,
      { matches: false, minutesSince: 3 }), new Set(), false, TARGET);
    expect(fixes.split("\n")[0]).toBe(`${PEOPLE_TASK_MISSING} This research_target is not the one registered with ` +
      "the plain answer: give plan_research and finalize_research the research target word for word as " +
      "register_plain_answer's result quoted it, or the answer ends without the comparison with the quick answer.");
    expect(fixes.split("\n")[1]).toMatch(/^This person's research style asks first when /u);
    // The review of 11 Nov 2026: and the rule for the answer names the registered target, not this one, word for word.
    const lastLine = fixes.split("\n").at(-1)!;
    expect(lastLine).toContain("research_target word for word as register_plain_answer's result quoted it, and their " +
      "allocation");
    expect(lastLine).not.toContain(JSON.stringify(TARGET));
    // A menu of detail alone: "you decide" means no more research.
    const detail = planResearchText(planResearch(menu({ tasks: [TASKS[2]!] }), DEFAULT_RESEARCH_STEERING), new Set(),
      false, TARGET);
    expect(detail).toContain("\nNothing more is recommended: the open tasks add detail only.\nHow should I spend");
    expect(detail).toContain("such as \"continue\", no more research: check the answer with finalize_research and " +
      "give it. If the reply");
    // The next step as a runtime field: ask, go on, or autonomous.
    expect(planNextStep(result)).toMatch(/^Ask the person now and end your turn: show researchMenu\.tasks/u);
    expect(planNextStep(planResearch(menu({ allocation: [{ task: 1, minutes: 5 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING))).toBe("Do the recommended tasks now, in order, each within its minutes; then check " +
      "the answer with finalize_research and give it in this turn.");
    expect(planNextStep(planResearch(menu(), { ...DEFAULT_RESEARCH_STEERING, style: "autonomous",
      checkBackMinutes: 15 }))).toMatch(/^Do the recommended tasks now; after about 15 minutes of research, check/u);
  });

  // The review of 11 Nov 2026: a new task found while the person's allocation still has an open task went on, neither
  // recommended nor asked about. Sent as the guidance says, with done and without the allocation, it is decided afresh.
  it("doesn't drop a new task found after a partial allocation, sent as the guidance says", () => {
    const fork = { task: "Read the 2024 trial that reverses the 2018 cohort", kind: "full_text" as const,
      could_change: "conclusion" as const };
    const withAllocation = planResearch(menu({ tasks: [...TASKS, fork], allocation: [{ task: 1, minutes: 5 },
      { task: 3, minutes: 4 }], person_answered: true, done: [1] }), DEFAULT_RESEARCH_STEERING);
    // Kept, the allocation still names an open task, so the menu goes on with it and leaves task 5 out.
    expect(withAllocation).toMatchObject({ next: "go_on", recommended: [{ task: 3, minutes: 4 }] });
    const afresh = planResearch(menu({ tasks: [...TASKS, fork], done: [1] }), DEFAULT_RESEARCH_STEERING);
    expect(afresh.recommended.map(({ task }) => task)).toContain(5);
    expect(afresh.next).toBe("ask");
    // Guided asks too, and so does a precise balanced menu: a re-plan comes back to the person (the review of 12 Nov).
    expect(planResearch(menu({ tasks: [...TASKS, fork], done: [1] }), { ...DEFAULT_RESEARCH_STEERING,
      style: "guided" }).next).toBe("ask");
    const precise = planResearch(menu({ tasks: [TASKS[3]!, fork], done: [1], steering_could_help: false }),
      DEFAULT_RESEARCH_STEERING);
    expect(precise).toMatchObject({ next: "ask", recommended: [{ task: 2, minutes: 2 }] });
  });

  // The review of 12 Nov 2026, reproduced: balanced, steering_could_help false. The first menu asks (12 minutes at the
  // high end); the person answers "1. 4 min, 3. 3 min", skipping task 2; after task 1 the AI finds task 4 and re-plans as
  // the guidance says (done [1], no allocation). The re-plan went on with 3, 4 and 2 (9 minutes): the skipped task was
  // done and nobody was asked about task 4. A re-plan now asks, unless the person chose autonomous research.
  const DECLINED: ResearchMenuInput["tasks"] = [
    { task: "Audit the 2018 cohort's methods", kind: "method_audit", could_change: "conclusion" },
    { task: "Search trials of the oil form", kind: "study_search", could_change: "confidence", sources: 2 },
    { task: "Read the 2021 trial in full", kind: "full_text", could_change: "conclusion" },
  ];
  const DECLINED_FORK = { task: "Read the 2024 trial that reverses the cohort", kind: "abstract_screen" as const,
    could_change: "conclusion" as const };
  it("asks again when the plan changes once the research has begun, so a skipped task isn't done unasked", async () => {
    const first = planResearch(menu({ tasks: DECLINED, steering_could_help: false }), DEFAULT_RESEARCH_STEERING);
    expect(first).toMatchObject({ next: "ask", recommended_minutes: [4, 12] });
    const answer = planResearch(menu({ tasks: DECLINED, steering_could_help: false,
      allocation: [{ task: 1, minutes: 4 }, { task: 3, minutes: 3 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING);
    expect(answer).toMatchObject({ next: "go_on", recommended: [{ task: 1, minutes: 4 }, { task: 3, minutes: 3 }] });
    const replan = menu({ tasks: [...DECLINED, DECLINED_FORK], done: [1], steering_could_help: false });
    const again = planResearch(replan, DEFAULT_RESEARCH_STEERING);
    expect(again).toMatchObject({ next: "ask", recommended_minutes: [3, 9] });
    expect(again.recommended.map(({ task }) => task)).toEqual([3, 4, 2]);
    const asked = planResearchText(again, new Set([1]), true, TARGET);
    expect(asked.split("\n")[0]).toMatch(new RegExp("^This person's research style asks first when the plan changes " +
      "once the research has begun, as it has here\\. Ask now, before any of these tasks:", "u"));
    // Autonomous research goes on; a re-plan with nothing left to recommend checks and answers; the person's own new
    // allocation is followed.
    expect(planResearch(replan, { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" }).next).toBe("go_on");
    expect(planResearch(menu({ tasks: [DECLINED[0]!, TASKS[2]!], done: [1], steering_could_help: false }),
      DEFAULT_RESEARCH_STEERING)).toMatchObject({ next: "go_on", recommended: [] });
    expect(planResearch(menu({ ...replan, allocation: [{ task: 3, minutes: 3 }, { task: 4, minutes: 1 }],
      person_answered: true }), DEFAULT_RESEARCH_STEERING)).toMatchObject({ next: "go_on",
      recommended: [{ task: 3, minutes: 3 }, { task: 4, minutes: 1 }] });
    // Through the connector, the same.
    const { service, connect } = await start();
    await service.acceptFreeContributor("auth0|person", agreement);
    const manage = await connect("/mcp", "auth0|person");
    const result = await manage({ action: "plan_research", later_inputs: { researchMenu: replan } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ researchMenu: { next: "ask", recommended_minutes: [3, 9] } });
    expect((result.structuredContent as { next_step: string }).next_step).toMatch(/^Ask the person now and end your turn/u);
    expect(text(result)).toContain("This person's research style asks first when the plan changes once the research " +
      "has begun, as it has here. Ask now, before any of these tasks:");
    expect(text(result)).toContain("1. Audit the 2018 cohort's methods: could change the conclusion; about 2 to 4 min " +
      "(done).");
  });

  // 11 Nov 2026: an allocation naming no task on the menu that is still open went on with nothing recommended.
  it("counts an allocation as the person's answer only when it names an open task on the menu", () => {
    const fresh = planResearch(menu(), DEFAULT_RESEARCH_STEERING);
    for (const overrides of [{ allocation: [{ task: 9, minutes: 5 }] },
      { allocation: [{ task: 1, minutes: 5 }], done: [1] }]) {
      expect(allocationAnswered(menu(overrides))).toBe(false);
      const result = planResearch(menu(overrides), DEFAULT_RESEARCH_STEERING);
      expect(result.next).toBe("ask");
      expect(result.recommended.length).toBeGreaterThan(0);
      if (overrides.done === undefined) expect(result.recommended).toEqual(fresh.recommended);
    }
    // A named open task with no minutes is still the person's answer: nothing more to research.
    expect(allocationAnswered(menu({ allocation: [{ task: 1, minutes: 0 }] }))).toBe(true);
    expect(planResearch(menu({ allocation: [{ task: 1, minutes: 0 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING)).toMatchObject({ next: "go_on", recommended: [], recommended_minutes: [0, 0] });
  });

  // Owner answer 284 (10 Nov 2026): balanced "should ask if the research could take longer than 10 mins OR if there is
  // reason to believe from the initial analysis that steering could direct the research more usefully, which i'd say it
  // usually can unless the prompt is quite precise".
  it("asks in balanced when the tasks could pass 10 minutes or the person's choices could steer them (owner answer 284)", () => {
    expect(ASK_ABOVE_MINUTES).toBe(10);
    const plan = (overrides: Partial<ResearchMenuInput>, steering: ResearchSteering = DEFAULT_RESEARCH_STEERING) =>
      planResearch(menu(overrides), steering);
    const words = (result: ReturnType<typeof planResearch>) => planResearchText(result, new Set());
    // 11 Nov 2026: the reason is worded as the person's own setting, and the ask follows it.
    const ask = ". Ask now, before any of these tasks:";
    const choices = ", and one on what their choices could change, such as their own situation, the form or dose they " +
      "use, or the outcome that matters most to them; then this menu";
    // A precise question whose tasks fit in 10 minutes goes on, the only case that does.
    const precise = plan({ tasks: [TASKS[3]!], steering_could_help: false });
    expect(precise.next).toBe("go_on");
    expect(words(precise)).toContain("Go on now: do these tasks in this order");
    expect(words(precise)).not.toContain(ask);
    // Exactly 10 minutes at the high end is not more than 10; 11 is.
    const own = (high: number) => ({ task: "Read the trial's table of harms", kind: "other" as const,
      could_change: "conclusion" as const, minutes: [8, high] as [number, number] });
    expect(plan({ tasks: [own(10)], steering_could_help: false })).toMatchObject({ recommended_minutes: [8, 10],
      next: "go_on" });
    const long = plan({ tasks: [own(11)], steering_could_help: false });
    expect(long).toMatchObject({ recommended_minutes: [8, 11], next: "ask" });
    expect(words(long)).toContain("\nThis person's research style asks first when the recommended tasks could take " +
      "more than about 10 minutes, as these could. Ask now, before any of these tasks:");
    expect(words(long)).not.toContain(choices);
    // Choices that could steer it: asked even when the tasks are short, with what the choices could change.
    const steerable = plan({ tasks: [TASKS[3]!], steering_could_help: true });
    expect(steerable).toMatchObject({ next: "ask", steering_could_help: true });
    expect(words(steerable)).toContain("This person's research style asks first when their choices could steer the " +
      `research, as they could here${ask}`);
    expect(words(steerable)).toContain(choices);
    // Left out, it counts as true, and the result says so.
    const unsaid = plan({ tasks: [TASKS[3]!] });
    expect(unsaid.next).toBe("ask");
    expect(unsaid).not.toHaveProperty("steering_could_help");
    expect(words(unsaid)).toContain("This person's research style asks first when their choices could steer the " +
      `research, as they usually can (steering_could_help was left out)${ask}`);
    expect(words(unsaid)).toContain(choices);
    expect(words(plan({}))).toContain("This person's research style asks first when the recommended tasks could take " +
      "more than about 10 minutes, as these could, and when their choices could steer the research, as they usually " +
      `can (steering_could_help was left out)${ask}`);
    // Guided always asks, autonomous never waits, and a person's allocation is followed, whatever the menu says.
    const guided = plan({ tasks: [TASKS[3]!], steering_could_help: false }, { ...DEFAULT_RESEARCH_STEERING,
      style: "guided" });
    expect(guided.next).toBe("ask");
    expect(words(guided)).toContain(`This person chose guided research, which asks before every long task${ask}`);
    expect(words(guided)).not.toContain(choices);
    expect(words(plan({ steering_could_help: true }, { ...DEFAULT_RESEARCH_STEERING, style: "guided" })))
      .not.toContain(choices);
    expect(plan({ steering_could_help: true }, { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" }).next)
      .toBe("go_on");
    expect(plan({ steering_could_help: true, allocation: [{ task: 1, minutes: 5 }], person_answered: true }).next)
      .toBe("go_on");
    // The field is a yes or no, named at the screen; the style's wording says when balanced asks.
    expect(researchMenuSchema.safeParse({ ...menu(), steering_could_help: "yes" }).success).toBe(false);
    expect(RESEARCH_MENU_SHAPE).toContain("steering_could_help, true when a choice the person could make, or " +
      "something only they know, could materially change what the research checks (HRP " +
      "StructuredUserSteeringAndApproval)");
    // 10 Nov: the model said false for all 14 timing questions, open ones included; false is now only for a question
    // that already fixes what to check: a clearly worded question is not yet one whose scope is fixed.
    expect(RESEARCH_MENU_SHAPE).toContain("even when the question is clearly worded; false only when the question " +
      "already fixes all of that, such as one result of one named study");
    expect(steeringSentence(DEFAULT_RESEARCH_STEERING)).toContain("shows the menu of next tasks when they could take " +
      "more than about 10 minutes or when your choices could steer the research, as they usually can unless the " +
      "question is precise");
  });

  it("mentions only doubtful adjustments by default, and all of them when the person chose that", () => {
    expect(adjustmentGuidance("flagged")).toContain("mention only adjustments that look doubtful or disputed");
    expect(adjustmentGuidance("flagged")).toContain("say nothing about the rest unless the person asks");
    expect(adjustmentGuidance("all")).toContain("list each key study's adjusted variables with each one's likely role");
    // The look comes with the menu the research goes on from: here, after the person's allocation.
    const all = planResearch(menu({ allocation: [{ task: 1, minutes: 5 }], person_answered: true }),
      { ...DEFAULT_RESEARCH_STEERING, adjustmentDetail: "all" });
    expect(planResearchText(all, new Set(), true)).toContain(adjustmentGuidance("all"));
  });

  // The owner, 9 Nov 2026, after the Syrian rue oil comparison: a word such as "significant" or "rich" is not a size,
  // and a widely used old remedy's screen should ask first what people who use it report.
  it("says a word is not a size at the screen and at the menu, in every style", () => {
    expect(WORDS_ARE_NOT_SIZES).toContain("is not a size");
    expect(WORDS_ARE_NOT_SIZES).toContain("in any language");
    expect(WORDS_ARE_NOT_SIZES).toContain("compare that number with what the question needs");
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      const steering: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style };
      // At the menu the research goes on from (11 Nov 2026: an ask carries nothing after its rule for the answer).
      for (const words of [
        framingGuidance(steering, undefined),
        framingGuidance(steering, { likely_question: TARGET }),
        planResearchText(planResearch(menu({ allocation: [{ task: 1, minutes: 5 }], person_answered: true }),
          steering), new Set(), true),
      ]) {
        expect(words).toContain(WORDS_ARE_NOT_SIZES);
      }
      expect(framingGuidance(steering, undefined)).toContain(PEOPLE_FIRST_WHEN_USED);
    }
  });

  // The timing runs of 9 Nov 2026: the antivenom emergency got a menu and 17 minutes of research before its answer.
  it("puts an emergency's urgent action before any research call or menu, first in every framing guidance", () => {
    const framings = [undefined, { likely_question: "Should they wait?" },
      { likely_question: "Should they wait?", premise_doubts: ["x"], redirecting_questions: ["Which antivenom?"] }];
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      for (const framing of framings) {
        expect(framingGuidance({ ...DEFAULT_RESEARCH_STEERING, style }, framing).startsWith(URGENT_FIRST)).toBe(true);
      }
    }
    expect(URGENT_FIRST).toContain("ParallelEmergencyAndAdjunctQuestions and NoEmergencyWarningOvercorrection");
  });

  // 11 Nov 2026: the costliest misses were the question's own premises (a PewDiePie run never checked "China has yet to
  // accomplish"). As claims of the plain answer, the sixth blocking check compares each; nothing here decides what counts
  // as a premise, which stays the model's judgment, in any language.
  it("makes the question's checkable premises claims of the plain answer, and searches for what would show them wrong", async () => {
    const { plainAnswerRequest } = await import("../apps/research-mcp/src/research-contributor-access-tool.js");
    const premise = "When the question asserts or assumes something checkable (a fact, a cause, a comparison, or that " +
      "something can't be or hasn't been done), give your quick verdict on each such premise in a sentence of its own, " +
      "and put those sentences first among the claims (Universal premise_integrity_and_truth_priority_gate, rule 2).";
    for (const note of [true, false]) {
      expect(plainAnswerRequest(note)).toContain(premise);
      expect(plainAnswerRequest(note).endsWith(FORM_PEOPLE_USE)).toBe(true);
      expect(plainAnswerRequest(note)).toContain("premise_doubts, anything in it that looks inverted, unclear or " +
        "possibly false;");
    }
    const doubted = framingGuidance(DEFAULT_RESEARCH_STEERING, { likely_question: "Has anyone done it?",
      premise_doubts: ["The question assumes no one has done it."] });
    // The review of 11 Nov 2026: only a doubt that could be false becomes a claim; one only unclear is the person's.
    expect(doubted).toContain("If a doubt that could be false, not only unclear, is not yet a claim of the plain " +
      "answer, register the plain answer again now, before any research call, with the same later_inputs.framing and " +
      "a sentence giving your quick verdict on it among the claims, so the final check compares it.");
    expect(framingGuidance(DEFAULT_RESEARCH_STEERING, { likely_question: "Has anyone done it?" }))
      .not.toContain("register the plain answer again now");
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      for (const framing of [undefined, { likely_question: "Has anyone done it?" }]) {
        expect(framingGuidance({ ...DEFAULT_RESEARCH_STEERING, style }, framing)).toContain("Screen first: a few calls " +
          "(about eight) of searches, abstracts, thread titles and the Atlas, with no full-text reading, long threads or " +
          "video audits yet, ending with a provisional short answer. For each claim on a premise of the person's " +
          "question, include one search for what would show it wrong.");
      }
    }
  });

  // The owner, 9 Nov 2026 (Inbox reply): nobody sells the hexane-extracted seed oil, so ask which form the person has.
  it("asks for the form people actually buy or make, when the answer turns on it, with the plain answer's request", async () => {
    const { plainAnswerRequest } = await import("../apps/research-mcp/src/research-contributor-access-tool.js");
    for (const note of [true, false]) expect(plainAnswerRequest(note).endsWith(FORM_PEOPLE_USE)).toBe(true);
    // 11 Nov 2026: inspect's request opens with the run's shape, the stop at an ask included.
    for (const note of [true, false]) expect(plainAnswerRequest(note).startsWith("A research run goes:")).toBe(true);
    expect(plainAnswerRequest(true)).toContain("when a result says to ask the person and wait, your reply is that " +
      "question and the turn ends there.");
    expect(framingGuidance(DEFAULT_RESEARCH_STEERING, undefined)).toContain(FORM_PEOPLE_USE);
    expect(FORM_PEOPLE_USE).toContain("WholeInterventionIdentityTrace and UserReportedUseFidelity");
  });

  // The timing runs of 9 Nov 2026: every case's first plan_research call was refused, the model guessing the fields.
  it("names the menu's every field and value at the screen, and takes a menu written in that shape", () => {
    // person_answered goes with the allocation, after the person answers, and the ask names it (round 3 of 12 Nov
    // 2026, below). steering_choice is asked for on a dev account alone: by its refusal (owner answer 296b, 13 Nov
    // 2026) and, since owner answer 297c, in the shape it is given at the screen (below). So the screen's words are
    // every other account's as they were.
    // lane is set by AskRigor's own plan alone and is never taught to the AI (owner answer 302, 14 Nov 2026).
    const fields = [...Object.keys(researchMenuSchema.shape).filter((key) => key !== "allocation" && key !== "done" &&
      key !== "person_answered" && key !== "steering_choice" && key !== "lane"), ...Object.keys(planTaskSchema.shape)];
    expect(RESEARCH_MENU_SHAPE).not.toMatch(/\blane\b/u);
    for (const name of [...fields, ...PLAN_TASK_KINDS, ...COULD_CHANGE, ...RESEARCH_LOOPS]) {
      expect(RESEARCH_MENU_SHAPE, name).toMatch(new RegExp(`\\b${name}\\b`, "u"));
    }
    expect(RESEARCH_MENU_SHAPE).not.toContain("person_answered");
    expect(RESEARCH_MENU_SHAPE).not.toContain("steering_choice");
    expect(RESEARCH_MENU_SHAPE).toContain("allocation and done come only after the person answers or stops you");
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      expect(framingGuidance({ ...DEFAULT_RESEARCH_STEERING, style }, undefined)).toContain(RESEARCH_MENU_SHAPE);
    }
    expect(researchMenuSchema.safeParse({ research_target: "Does the oil act like the tea?", plain_answer_receipt: "rr1~x",
      provisional_answer: "Unknown so far.", tasks: [{ task: "Read the oil study's table", kind: "full_text",
        could_change: "conclusion", sources: 1 }, { task: "Read what people who took the oil report", kind: "forum_thread",
        could_change: "confidence", sources: 3, loop: "studies_to_people" }] }).success).toBe(true);
    const asked = planResearchText(planResearch(menu(), DEFAULT_RESEARCH_STEERING), new Set());
    expect(asked).toContain("call manage_research_access action plan_research again with the same plain_answer_receipt, " +
      "tasks and menu_digest (researchMenu.menu_digest in this result), research_target word for word, and their " +
      "allocation inside researchMenu, as a list of {task, minutes}, with person_answered true in researchMenu too " +
      "(send it only once they have answered this menu in a message of their own; an allocation without it is not " +
      "used); for \"you decide\", or a reply that leaves the choice to you such as \"continue\", the recommended " +
      "allocation, with person_answered true too.");
  });

  it("asks for a people's-reports task when a first menu has none, and never renumbers an allocated one", async () => {
    const studiesOnly = menu({ tasks: [TASKS[0]!, TASKS[1]!] });
    expect(planResearchText(planResearch(studiesOnly, DEFAULT_RESEARCH_STEERING), new Set()))
      .toContain(PEOPLE_TASK_MISSING);
    expect(PEOPLE_TASK_MISSING).toContain("add a task near the top for what people who used it report");
    // A forum thread, video comments, or a look at people's reports for a study finding each count.
    for (const task of [TASKS[2]!, { task: "Read comments under the two most-watched videos", kind: "video_comments",
      could_change: "confidence" } as const, { task: "Check people's reports for what the trial found",
      kind: "other", could_change: "confidence", loop: "studies_to_people" } as const]) {
      expect(planResearchText(planResearch(menu({ tasks: [TASKS[0]!, task] }), DEFAULT_RESEARCH_STEERING), new Set()))
        .not.toContain(PEOPLE_TASK_MISSING);
    }
    // A study search prompted by people's reports doesn't read them.
    expect(planResearchText(planResearch(menu({ tasks: [TASKS[3]!] }), DEFAULT_RESEARCH_STEERING), new Set()))
      .toContain(PEOPLE_TASK_MISSING);
    // Once an allocation or a done list refers to the task numbers, the menu isn't changed under them, even when the
    // allocation names no open task and so counts as no answer (the review of 11 Nov 2026), through the real path.
    const { service, connect } = await start();
    await service.acceptFreeContributor("auth0|person", agreement);
    const manage = await connect("/mcp", "auth0|person");
    const studies = [TASKS[0]!, TASKS[1]!];
    const plan = async (overrides: Partial<ResearchMenuInput>) => {
      const result = await manage({ action: "plan_research", later_inputs: { researchMenu: menu({ tasks: studies,
        ...overrides }) } });
      expect(result.isError).not.toBe(true);
      return result;
    };
    expect(text(await plan({}))).toContain(PEOPLE_TASK_MISSING);
    for (const overrides of [{ allocation: [{ task: 1, minutes: 5 }] }, { done: [1] },
      { allocation: [{ task: 1, minutes: 5 }], done: [1] }]) {
      expect(text(await plan(overrides)), JSON.stringify(overrides)).not.toContain(PEOPLE_TASK_MISSING);
    }
    // The allocation of done tasks alone is no answer: the menu asks, with its numbers as they are.
    const spent = await plan({ allocation: [{ task: 1, minutes: 5 }], done: [1] });
    expect(spent.structuredContent).toMatchObject({ researchMenu: { next: "ask" } });
    expect(text(spent)).toContain("1. Read the 2018 cohort's full text: could change the conclusion; about 1 to 3 min (done).");
  });

  it("checks the research target against the plain answer's through the connector (AskRigor#434)", async () => {
    const { service, connect } = await start();
    await service.acceptFreeContributor("auth0|person", agreement);
    const manage = await connect("/mcp", "auth0|person");
    const registered = await manage({ action: "register_plain_answer", plainAnswer: PLAIN });
    const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
    const same = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), research_target: `  ${TARGET.toUpperCase()} `, plain_answer_receipt: receipt } } });
    expect(same.isError).not.toBe(true);
    expect(same.structuredContent).toMatchObject({ ok: true, researchMenu: { target_matches_plain_answer: true,
      minutes_since_plain_answer: 0, next: "ask", style: "balanced" } });
    // 11 Nov 2026: the ask hands over the message and ends with the rule for the answer, with the menu's own words for
    // the research target; next_step carries the stop for an app that reads only the structured content.
    expect(text(same)).toContain("Your reply: at most two sentences on what the first look suggests");
    expect(text(same)).toContain(`research_target word for word ${JSON.stringify(TARGET.toUpperCase())}, and`);
    expect((same.structuredContent as { next_step: string }).next_step)
      .toMatch(/^Ask the person now and end your turn/u);
    // A precise question with short tasks goes on, and the result carries the menu's own steering_could_help.
    const precise = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), tasks: [TASKS[3]!], steering_could_help: false, plain_answer_receipt: receipt } } });
    expect(precise.isError).not.toBe(true);
    expect(precise.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
      steering_could_help: false }, next_step: "Do the recommended tasks now, in order, each within its minutes; then " +
      "check the answer with finalize_research and give it in this turn." });
    expect(text(precise)).toContain("The menu to show the person, in their language, numbered as here");
    // The review of 12 Nov 2026: a menu of detail alone asks with nothing recommended; "you decide" ends the research
    // there, in next_step as in the text, since sending the empty recommendation would make the same menu ask again.
    const detailOnly = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), tasks: [TASKS[2]!], plain_answer_receipt: receipt } } });
    expect(detailOnly.structuredContent).toMatchObject({ researchMenu: { next: "ask", recommended: [] } });
    const detailStep = (detailOnly.structuredContent as { next_step: string }).next_step;
    expect(detailStep).toMatch(/^Ask the person now and end your turn/u);
    expect(detailStep).toContain("then call action plan_research again with their allocation and person_answered " +
      "true inside later_inputs.researchMenu or, for \"you decide\", do no more research: check the answer with " +
      "finalize_research and give it.");
    expect(detailStep).not.toContain("the recommended one");
    expect(text(detailOnly)).toContain("such as \"continue\", no more research: check the answer with " +
      "finalize_research and give it.");
    const emptyAnswer = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), tasks: [TASKS[2]!], allocation: [], plain_answer_receipt: receipt } } });
    expect(emptyAnswer.structuredContent).toMatchObject({ researchMenu: { next: "ask" } });
    await service.setResearchSteering("auth0|person", { style: "autonomous" });
    const autonomous = await manage({ action: "plan_research", later_inputs: { researchMenu: menu() } });
    expect((autonomous.structuredContent as { next_step: string }).next_step)
      .toMatch(/^Do the recommended tasks now; after about 10 minutes of research/u);
    await service.setResearchSteering("auth0|person", { style: "balanced" });
    const reworded = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), research_target: "Sodium potassium ratio and blood pressure", plain_answer_receipt: receipt } } });
    expect(reworded.structuredContent).toMatchObject({ researchMenu: { target_matches_plain_answer: false } });
    expect(text(reworded)).toContain("This research_target is not the one registered with the plain answer");
    // The rule for the answer, its last line, names the registered target and never quotes the reworded one.
    const reworded0 = reworded.content[0]!.text;
    expect(reworded0.split("\n").at(-1)).toContain("research_target word for word as register_plain_answer's result " +
      "quoted it");
    expect(reworded0).not.toContain(JSON.stringify("Sodium potassium ratio and blood pressure"));
    // Another account's receipt, or none that verifies: said so, and the menu still comes.
    const other = await connect("/mcp", "auth0|other");
    await service.acceptFreeContributor("auth0|other", agreement);
    const foreign = await other({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), plain_answer_receipt: receipt } } });
    expect(foreign.structuredContent).toMatchObject({ ok: true, problems: [expect.stringContaining(
      "is not a current plain-answer receipt of this account")] });
    expect(foreign.structuredContent).not.toHaveProperty("researchMenu.target_matches_plain_answer");
    // The problems come before the ask, so its text still ends with the rule for the person's answer, and the
    // "you decide" call after it (12 Nov 2026).
    expect(text(foreign).indexOf("is not a current plain-answer receipt of this account"))
      .toBeLessThan(text(foreign).indexOf("Ask now, before any of these tasks"));
    const foreignLines = foreign.content[0]!.text.split("\n");
    expect(foreignLines.at(-2)!.endsWith("Never send an allocation the person did not give or leave to you. If the " +
      "reply asks for another research style, set it first with action set_research_steering " +
      "(later_inputs.researchSteering with style guided, balanced or autonomous), then call plan_research again."))
      .toBe(true);
    expect(foreignLines.at(-1)).toBe(`Only once the person has replied "you decide", in a later message, never in this turn: call ` +
      `manage_research_access with action plan_research and ` +
      "these later_inputs, after replacing <true|false> in person_answered with whether the person has answered this " +
      "menu in a message of their own since it was shown (true once they have, false before); an allocation sent " +
      "with false, or without person_answered, is not used; the recommended allocation is inside researchMenu, " +
      `where every allocation goes, never beside it: ${JSON.stringify((foreign.structuredContent as {
        you_decide_later_inputs: unknown }).you_decide_later_inputs)}`);
    // Task numbers past the list are left out, with a problem.
    const past = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), allocation: [{ task: 9, minutes: 3 }, { task: 1, minutes: 5 }], person_answered: true } } });
    expect(past.structuredContent).toMatchObject({ researchMenu: { recommended: [{ task: 1, minutes: 5 }] },
      problems: [expect.stringContaining("Task numbers 9 are past the 4 tasks given")] });
    // An account without research access gets the usual refusal.
    const stranger = await connect("/mcp", "auth0|new");
    expect((await stranger({ action: "plan_research", later_inputs: { researchMenu: menu() } })).structuredContent)
      .toMatchObject({ ok: false, error: { code: "research_access_required" } });
  });
});

// 12 Nov 2026, the owner's ChatGPT at Extra High: every run's plan_research call was refused three to five times before
// one passed, as the model guessed the menu's names, types and places. The menu is now read in its own names, and what
// is still unreadable is refused with an example built from the call. These fixtures are invented.
describe("plan_research reads the menu a model guessed, and refuses the rest with an example (12 Nov 2026)", () => {
  const GUESS_TARGET = "Whether a cold-water rinse after a run eases next-day calf soreness";
  const GUESS_TASKS = [
    { task: "Search trials of cold-water immersion after running", kind: "study_search", could_change: "conclusion" },
    { task: "Read the largest trial in full", kind: "full_text", could_change: "confidence" },
    { task: "Read runners' forum threads on post-run rinses", kind: "forum_thread", could_change: "detail" },
  ] as const;
  type Result = Awaited<ReturnType<Awaited<ReturnType<Awaited<ReturnType<typeof start>>["connect"]>>>>;

  async function session() {
    const { service, connect } = await start();
    await service.acceptFreeContributor("auth0|person", agreement);
    const manage = await connect("/mcp", "auth0|person");
    const registered = await manage({ action: "register_plain_answer", plainAnswer: { researchTarget: GUESS_TARGET,
      text: "A cold rinse may ease soreness a little. The effect is small.",
      claims: ["A cold rinse may ease soreness a little."] } });
    const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
    return { service, manage, receipt,
      plan: async (later: Record<string, unknown>) => await manage({ action: "plan_research", later_inputs: later }) };
  }
  const accepted = (result: Result) => {
    expect(result.isError, text(result)).not.toBe(true);
    return result.structuredContent as { researchMenu: { next: string; recommended: unknown[];
      tasks: Array<{ minutes: unknown }>; allocation_not_used?: true }; problems?: string[];
      you_decide_later_inputs?: { researchMenu: Record<string, unknown> } };
  };
  const refused = (result: Result) => {
    expect(result.isError).toBe(true);
    const structured = result.structuredContent as { ok: boolean; error: { code: string }; problems: string[];
      corrected_later_inputs: { researchMenu: { research_target: string; tasks: Array<Record<string, unknown>> } } };
    expect(structured).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(text(result)).toContain(JSON.stringify(structured.corrected_later_inputs));
    return structured;
  };

  it("accepts attempts 1, 5, 6, 7, 9 and 11 once read, saying what it ignored or moved", async () => {
    const { service, plan, receipt } = await session();
    // 1, with tasks: camelCase names, and keys that are not part of the menu.
    const first = await plan({ researchMenu: { researchTarget: GUESS_TARGET, plainAnswerReceipt: receipt,
      focus: "soreness the next day", initial_screening: { searches: 3 },
      tasks: GUESS_TASKS.map(({ could_change, ...task }) => ({ ...task, couldChange: could_change })) } });
    const ignoredFirst = "AskRigor ignored later_inputs.researchMenu.focus, later_inputs.researchMenu.initial_screening, " +
      "which are not part of plan_research's menu.";
    expect(accepted(first).problems).toEqual([ignoredFirst]);
    expect(first.content.map(({ text: part }) => part)).toContain(ignoredFirst);
    expect(accepted(first).researchMenu.next).toBe("ask");
    // 5: one number for a task's minutes, and two of the three tasks.
    const fifth = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
      tasks: GUESS_TASKS.slice(0, 2).map((task) => ({ ...task, minutes: 2 })) } });
    expect(accepted(fifth).researchMenu.tasks.map(({ minutes }) => minutes)).toEqual([[2, 2], [2, 2]]);
    expect(accepted(fifth).problems).toBeUndefined();
    // 6: a null minutes, and the allocation and the person's reply beside the menu. The allocation is read inside the
    // menu. Since 13 Nov 2026 it is the person's answer only with person_answered true, on every account: as the call
    // came it is not used and the menu asks again; with the declaration, beside the menu too, it goes on.
    const sixthLater = { researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
      tasks: [{ ...GUESS_TASKS[0], minutes: null }, GUESS_TASKS[1], GUESS_TASKS[2]] },
      allocation: [{ task: 1, minutes: 3 }, { task: 3, minutes: 2 }], user_choice: "you decide" };
    const asItCame = accepted(await plan(sixthLater));
    expect(asItCame.researchMenu).toMatchObject({ next: "ask", allocation_not_used: true,
      recommended: [{ task: 1, minutes: 2 }, { task: 2, minutes: 2 }] });
    expect(asItCame.problems).toEqual(["later_inputs.researchMenu.allocation: not used; an allocation is the " +
      "person's answer only with person_answered true, which the call did not give", "AskRigor read " +
      "later_inputs.allocation as researchMenu.allocation: the allocation and done list go inside researchMenu, and " +
      "ignored later_inputs.user_choice, which is not part of plan_research's menu."]);
    const sixthMenu = accepted(await plan({ ...sixthLater, person_answered: true }));
    expect(sixthMenu.researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 1, minutes: 3 },
      { task: 3, minutes: 2 }] });
    expect(sixthMenu.problems).toEqual(["AskRigor read later_inputs.allocation as researchMenu.allocation, " +
      "later_inputs.person_answered as researchMenu.person_answered: the allocation and done list go inside " +
      "researchMenu, and ignored later_inputs.user_choice, which is not part of plan_research's menu."]);
    // 7 and 9: a setting beside the menu is ignored, and the account's style is unchanged.
    for (const researchSteering of [{ selection: "you decide" }, {}]) {
      const beside = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
        tasks: GUESS_TASKS }, researchSteering });
      expect(accepted(beside).problems).toEqual(["AskRigor ignored later_inputs.researchSteering, which is not part " +
        "of plan_research's menu."]);
    }
    expect((await service.activeAccount("auth0|person")).steering).toEqual(DEFAULT_RESEARCH_STEERING);
    // 11: user_allocation inside the menu is its allocation, here with the person's answer declared.
    const eleventh = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
      tasks: GUESS_TASKS, user_allocation: [{ task: 1, minutes: 3 }], person_answered: true } });
    expect(accepted(eleventh).researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 1, minutes: 3 }] });
  });

  it("refuses attempts 1 without tasks, 2 and 3 with a complete example built from the call, which then passes",
    async () => {
      const { plan, receipt } = await session();
      // 1 as it came: no tasks.
      const noTasks = refused(await plan({ researchMenu: { researchTarget: GUESS_TARGET, focus: "next-day soreness",
        initial_screening: { searches: 3 } } }));
      expect(noTasks.corrected_later_inputs).toEqual({ researchMenu: { research_target: GUESS_TARGET, tasks: [
        { task: MENU_PLACEHOLDERS.task, kind: MENU_PLACEHOLDERS.kind, could_change: MENU_PLACEHOLDERS.could_change }] } });
      expect(noTasks.problems).toContain("AskRigor ignored later_inputs.researchMenu.focus, " +
        "later_inputs.researchMenu.initial_screening, which are not part of plan_research's menu.");
      // 2: tasks as text.
      const texts = GUESS_TASKS.map(({ task }) => task);
      const asText = refused(await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
        tasks: texts } }));
      expect(asText.problems[0]).toMatch(/^later_inputs\.researchMenu\.tasks\[0\]: /u);
      // 3: tasks as titles, without kind or could_change.
      const titled = refused(await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
        tasks: texts.map((title) => ({ title })) } }));
      expect(titled.problems).toEqual(expect.arrayContaining([expect.stringMatching(
        /^later_inputs\.researchMenu\.tasks\[0\]\.kind: /u), expect.stringMatching(
        /^later_inputs\.researchMenu\.tasks\[0\]\.could_change: /u)]));
      for (const { corrected_later_inputs: example } of [asText, titled]) {
        expect(example).toEqual({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
          tasks: texts.map((task) => ({ task, kind: MENU_PLACEHOLDERS.kind,
            could_change: MENU_PLACEHOLDERS.could_change })) } });
        expect(MENU_PLACEHOLDERS.kind).toBe(`<${PLAN_TASK_KINDS.join("|")}>`);
        expect(MENU_PLACEHOLDERS.could_change).toBe("<conclusion|confidence|detail>");
        // Filled in, the example passes as it is.
        const filled = { researchMenu: { ...example.researchMenu, tasks: example.researchMenu.tasks.map((task, index) =>
          ({ ...task, kind: GUESS_TASKS[index]!.kind, could_change: GUESS_TASKS[index]!.could_change })) } };
        expect(accepted(await plan(filled)).researchMenu.next).toBe("ask");
      }
      // A plan_research call with no menu at all gets the same refusal, with an example to fill.
      const settingAlone = refused(await plan({ researchSteering: {} }));
      expect(settingAlone.corrected_later_inputs.researchMenu.research_target)
        .toBe(MENU_PLACEHOLDERS.research_target);
      expect(settingAlone.problems).toContain("AskRigor ignored later_inputs.researchSteering, which is not part of " +
        "plan_research's menu.");
    });

  it("hands over the \"you decide\" call, ready to copy, which goes on once the person's answer is declared",
    async () => {
      const { plan, receipt } = await session();
      const asked = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
        tasks: GUESS_TASKS } });
      const menuResult = accepted(asked);
      expect(menuResult.researchMenu.next).toBe("ask");
      // 13 Nov 2026: on every account the call carries person_answered's place, right after its allocation.
      const youDecide = menuResult.you_decide_later_inputs!;
      expect(youDecide).toEqual({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
        tasks: GUESS_TASKS, allocation: menuResult.researchMenu.recommended, person_answered: "<true|false>",
        menu_digest: (menuResult.researchMenu as { menu_digest?: string }).menu_digest } });
      expect(Object.keys(youDecide.researchMenu)).toEqual(["research_target", "plain_answer_receipt", "tasks",
        "allocation", "person_answered", "menu_digest"]);
      expect((youDecide.researchMenu as { menu_digest: string }).menu_digest).toMatch(/^md1~[A-Za-z0-9_-]{22}$/u);
      // Read as plan_research reads it, the call is a menu, whose placeholder left in counts as not given.
      expect(researchMenuSchema.safeParse(readResearchMenu(structuredClone(youDecide)).menu).success).toBe(true);
      // In the text, right after the rule for the person's answer, saying the allocation goes inside researchMenu.
      const lines = asked.content[0]!.text.split("\n");
      expect(lines.at(-2)).toMatch(/^When the person replies: /u);
      expect(lines.at(-2)).toContain("for \"you decide\", or a reply that leaves the choice to you such as " +
        "\"continue\", the call on the next line.");
      expect(lines.at(-1)).toBe("Only once the person has replied \"you decide\", in a later message, never in this " +
        "turn: call manage_research_access with action plan_research and these later_inputs, after replacing " +
        "<true|false> in person_answered with whether the person has answered this menu in a message of their own " +
        "since it was shown (true once they have, false before); an allocation sent with false, or without " +
        "person_answered, is not used; the recommended allocation is inside researchMenu, where every allocation " +
        `goes, never beside it: ${JSON.stringify(youDecide)}`);
      expect((asked.structuredContent as { next_step: string }).next_step).toContain("(for \"you decide\", with " +
        "you_decide_later_inputs as later_inputs, after replacing <true|false> in person_answered: true once they " +
        "have answered, false before).");
      // Sent back as it is, it is the ask again, with the same call handed over; once the person has replied and the
      // call says so, it goes on with that allocation, and offers no "you decide" call.
      const copied = accepted(await plan(youDecide));
      expect(copied.researchMenu).toMatchObject({ next: "ask", allocation_not_used: true,
        recommended: menuResult.researchMenu.recommended });
      expect(copied.you_decide_later_inputs).toEqual(youDecide);
      const decided = accepted(await plan({ researchMenu: { ...youDecide.researchMenu, person_answered: true } }));
      expect(decided.researchMenu).toMatchObject({ next: "go_on", recommended: menuResult.researchMenu.recommended });
      expect(decided.researchMenu).not.toHaveProperty("allocation_not_used");
      expect(decided.you_decide_later_inputs).toBeUndefined();
    });
});

// The review of 12 Nov 2026: a re-plan before any task was done (no done list), with a new task added, went on without
// the person's choice, since only a done list marked a re-plan. Each result now carries a digest of its task list, and a
// call whose tasks differ from the digest it passes back asks first. Fixtures invented.
describe("a menu the AI changed after the person saw it is shown to them first (the review of 12 Nov 2026)", () => {
  const FIRST = { task: "Search trials of warm compresses for stiff necks", kind: "study_search",
    could_change: "conclusion" } as const;
  const FORK = { task: "Search trials of heat wraps worn overnight", kind: "study_search",
    could_change: "conclusion" } as const;
  const target = "Whether warm compresses ease a stiff neck within a day";
  type Planned = { researchMenu: { next: string; menu_digest: string; menu_changed?: true; recommended: unknown[] } };

  it("asks when a re-plan before any task is done adds a task, and goes on as before without a digest", async () => {
    const { service, connect } = await start();
    await service.acceptFreeContributor("auth0|person", agreement);
    const manage = await connect("/mcp", "auth0|person");
    const plan = async (researchMenu: Record<string, unknown>) => {
      const result = await manage({ action: "plan_research", later_inputs: { researchMenu } });
      expect(result.isError, text(result)).not.toBe(true);
      return { result, structured: result.structuredContent as Planned };
    };
    // A precise question with one short task goes on, with the digest of its menu.
    const first = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST] });
    expect(first.structured.researchMenu.next).toBe("go_on");
    const digest = first.structured.researchMenu.menu_digest;
    expect(digest).toMatch(/^md1~[A-Za-z0-9_-]{22}$/u);
    // The same menu passed back with its digest is unchanged, and goes on.
    const same = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST], menu_digest: digest });
    expect(same.structured.researchMenu).toMatchObject({ next: "go_on", menu_digest: digest });
    expect(same.structured.researchMenu).not.toHaveProperty("menu_changed");
    // The case: the first task unfinished (no done list), a new task added. It asks, and says why.
    const forked = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      menu_digest: digest });
    expect(forked.structured.researchMenu).toMatchObject({ next: "ask", menu_changed: true,
      recommended: [{ task: 1 }, { task: 2 }] });
    expect(forked.structured.researchMenu.menu_digest).not.toBe(digest);
    expect(text(forked.result)).toContain("This person's research style asks first when the menu changes after they " +
      "saw it, as it has here. Ask now, before any of these tasks");
    // Without a digest, as before this change: it goes on.
    const undigested = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK] });
    expect(undigested.structured.researchMenu.next).toBe("go_on");
    // Greptile's review of 12 Nov 2026: an allocation sent with a changed menu is the person's answer, as they may have
    // added the task themselves when they redirected the research: it goes on with exactly that allocation.
    const redirected = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      allocation: [{ task: 2, minutes: 1 }], person_answered: true, menu_digest: digest });
    expect(redirected.structured.researchMenu).toMatchObject({ next: "go_on", menu_changed: true,
      recommended: [{ task: 2, minutes: 1 }] });
    // The changed menu's own digest, passed back with the person's answer, goes on with it.
    const answered = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      allocation: [{ task: 2, minutes: 3 }], person_answered: true,
      menu_digest: forked.structured.researchMenu.menu_digest });
    expect(answered.structured.researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 2, minutes: 3 }] });
    // The same menu retyped in other words, with new time estimates, when the person's answer is sent: not a change, so
    // the person isn't asked twice.
    const retyped = await plan({ research_target: target, steering_could_help: false,
      tasks: [{ ...FIRST, task: "Find trials of warm compresses for a stiff neck", minutes: [2, 5] },
        { ...FORK, task: "Find trials of heat wraps worn overnight", sources: 2 }],
      allocation: [{ task: 2, minutes: 3 }], person_answered: true,
      menu_digest: forked.structured.researchMenu.menu_digest });
    expect(retyped.structured.researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 2, minutes: 3 }] });
    expect(retyped.structured.researchMenu).not.toHaveProperty("menu_changed");
    // Autonomous research never stops to ask, and keeps the person's own allocation for a menu they changed, rather
    // than the default tasks (Greptile's review of 12 Nov 2026).
    await service.setResearchSteering("auth0|person", { style: "autonomous" });
    const autonomous = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      menu_digest: digest });
    expect(autonomous.structured.researchMenu.next).toBe("go_on");
    const theirs = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      allocation: [{ task: 2, minutes: 1 }], person_answered: true, done: [1], menu_digest: digest });
    expect(theirs.structured.researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 2, minutes: 1 }] });
  });

  it("compares what the person chose among exactly, not wording or times, and decides only through planResearch", () => {
    const READ = { task: "Read the largest trial in full", kind: "full_text", could_change: "confidence" } as const;
    const tasks = [{ ...FIRST }, { ...READ, sources: 2 }];
    const digest = menuDigest(tasks, SECRET);
    expect(menuDigest(tasks.map((task) => ({ ...task })), SECRET)).toBe(digest);
    // What the person chose among: the number of tasks, and each one's kind, what it could change and its loop, in order.
    expect(menuDigest([tasks[1]!, tasks[0]!], SECRET)).not.toBe(digest);
    expect(menuDigest([...tasks, { ...FORK }], SECRET)).not.toBe(digest);
    expect(menuDigest([tasks[0]!], SECRET)).not.toBe(digest);
    expect(menuDigest([tasks[0]!, { ...tasks[1]!, kind: "method_audit" }], SECRET)).not.toBe(digest);
    expect(menuDigest([tasks[0]!, { ...tasks[1]!, could_change: "conclusion" }], SECRET)).not.toBe(digest);
    expect(menuDigest([{ ...tasks[0]!, loop: "studies_to_people" }, tasks[1]!], SECRET)).not.toBe(digest);
    expect(menuDigest(tasks, `${SECRET}-other`)).not.toBe(digest);
    // Not a change: a task retyped in other words, or its sources and minutes estimated again.
    expect(menuDigest([{ ...tasks[0]!, task: "Find the trials of warm compresses on a stiff neck" }, tasks[1]!], SECRET))
      .toBe(digest);
    expect(menuDigest([tasks[0]!, { ...tasks[1]!, sources: 3, minutes: [4, 9] }], SECRET)).toBe(digest);
    const plan = { research_target: target, steering_could_help: false, tasks: [FIRST, FORK] };
    expect(planResearch(plan, DEFAULT_RESEARCH_STEERING, undefined, { digest, changed: true }))
      .toMatchObject({ next: "ask", menu_changed: true, menu_digest: digest });
    // With the person's allocation, a changed menu goes on with it.
    expect(planResearch({ ...plan, allocation: [{ task: 2, minutes: 1.5 }], person_answered: true },
      DEFAULT_RESEARCH_STEERING, undefined, { digest, changed: true })).toMatchObject({ next: "go_on",
      menu_changed: true, recommended: [{ task: 2, minutes: 1.5 }] });
    expect(planResearch(plan, DEFAULT_RESEARCH_STEERING, undefined, { digest, changed: false }).next).toBe("go_on");
    expect(planResearch(plan, DEFAULT_RESEARCH_STEERING).next).toBe("go_on");
  });
});

// The review of 12 Nov 2026: the person's 1.5 minutes became 2, as their allocation was rounded like an estimate.
describe("the person's own minutes are kept as given", () => {
  it("keeps 1.5 as 1.5 in the plan, its total and its text, and rounds only AskRigor's own estimates", () => {
    const allocated = planResearch(menu({ allocation: [{ task: 1, minutes: 1.5 }, { task: 2, minutes: 0.1 },
      { task: 4, minutes: 0.2 }], person_answered: true }), DEFAULT_RESEARCH_STEERING);
    expect(allocated.recommended).toEqual([{ task: 1, minutes: 1.5 }, { task: 2, minutes: 0.1 }, { task: 4, minutes: 0.2 }]);
    expect(allocated.recommended_minutes).toEqual([1.8, 1.8]);
    expect(planResearchText(allocated, new Set())).toContain("Recommended: 1. 1.5 min, 2. 0.1 min, 4. 0.2 min, about " +
      "1.8 min in all.");
    expect(planResearch(menu({ allocation: [{ task: 1, minutes: 2.5 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING).recommended).toEqual([{ task: 1, minutes: 2.5 }]);
    // A task's own estimate is still a rough range for the menu.
    expect(taskMinutes({ task: "x x x", kind: "other", could_change: "detail", minutes: [1.4, 2.6] })).toEqual([1, 3]);
  });
});

// Owner answer 294c (12 Nov 2026). The owner's control question, one figure from one named paper, got the menu instead
// of an answer in both ChatGPT runs: the AI left steering_could_help out on every menu, so the default (owner answer
// 284: left out counts as yes) decided, not the AI. The owner: "those choices should have not been given as choices
// since they were required to answer the question". So from #440 (live 12 Nov, 23:58 UTC) a short menu on a dev
// account needed the AI's own true or false.
// Owner answer 296b (13 Nov 2026). Round 4 of the owner's ChatGPT runs on that build (13 Nov, 00:03 to 00:39 UTC): the
// control got false and a checked answer in one turn, the orange-peel and Syrian-rue questions got true and asked,
// and the PewDiePie and SMILES questions got false and went straight to a checked answer. Asked why, the AI named a
// choice of the person's both times ("you could have clarified whether the comparison concerned Chinese
// AI-distillation attempts specifically or China's broader AI-development capabilities"; "You could have chosen a
// broader comparison of dietary interventions against antidepressant trials ... I selected the narrow approach
// myself"), and the owner: "for pewdiepie, i do recall it answered mostly the wrong question". So on a dev account a
// short menu now names the question the AI would ask this person (steering_choice), or the word none, and the yes or
// no alone no longer answers there; every other account's menus are planned as before when they give no
// steering_choice. These fixtures are invented.
describe("a short menu on a dev account names the question it would ask, or none (owner answers 294c and 296b)", () => {
  const PRECISE_TARGET = "How often loose stools were recorded in one named trial of two fever medicines in children";
  const PRECISE_TASKS: ResearchMenuInput["tasks"] = [
    { task: "Read the trial's adverse-event table in full", kind: "full_text", could_change: "conclusion" },
    { task: "Audit how the trial recorded adverse events", kind: "method_audit", could_change: "confidence" },
  ];
  const LONG_TASK: ResearchMenuInput["tasks"][number] = { task: "Read six more trials in full", kind: "full_text",
    sources: 6, could_change: "conclusion" };
  const QUESTION = "Do you mean loose stools on either medicine, or the difference between the two?";
  const PLACEHOLDER = "<the one question you would ask this person, or none>";
  const guided: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "guided" };
  const autonomous: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" };
  const short = (overrides: Partial<ResearchMenuInput> = {}): ResearchMenuInput =>
    ({ research_target: PRECISE_TARGET, tasks: PRECISE_TASKS, ...overrides });
  const GO_ON_STEP = "Do the recommended tasks now, in order, each within its minutes; then check the answer with " +
    "finalize_research and give it in this turn.";

  it("is needed exactly when the same menu planned as steerable would ask, and as not steerable would go on", () => {
    // Balanced, both tasks recommended, 7 minutes at the most: whether to ask rests on the judgment alone.
    expect(planResearch(short(), DEFAULT_RESEARCH_STEERING)).toMatchObject({ next: "ask",
      recommended_minutes: [3, 7] });
    expect(planResearch(short({ steering_could_help: false }), DEFAULT_RESEARCH_STEERING).next).toBe("go_on");
    expect(steeringChoiceLeftOut(short(), DEFAULT_RESEARCH_STEERING)).toBe(true);
    // Round 4: the yes or no alone, true or false, no longer answers it. The question is still left out.
    expect(steeringChoiceLeftOut(short({ steering_could_help: true }), DEFAULT_RESEARCH_STEERING)).toBe(true);
    expect(steeringChoiceLeftOut(short({ steering_could_help: false }), DEFAULT_RESEARCH_STEERING)).toBe(true);
    // Given, a question or the word none, it is the AI's own decision, whatever the yes or no beside it says.
    for (const steering_choice of [QUESTION, "none"]) {
      for (const steering_could_help of [undefined, true, false]) {
        expect(steeringChoiceLeftOut(short({ steering_choice, steering_could_help }), DEFAULT_RESEARCH_STEERING),
          `${steering_choice} ${steering_could_help}`).toBe(false);
      }
    }
    // A menu of detail alone, with nothing recommended: not steerable would end the research, so it is needed too.
    expect(steeringChoiceLeftOut(short({ tasks: [TASKS[2]!] }), DEFAULT_RESEARCH_STEERING)).toBe(true);
    // Everything that asks or goes on whatever the judgment needs no question, with the yes or no or without it:
    // tasks past the 10 minutes, guided and autonomous research, the person's own allocation, a menu changed after
    // they saw it, and a re-plan.
    expect(planResearch(short({ tasks: [LONG_TASK] }), DEFAULT_RESEARCH_STEERING).recommended_minutes[1])
      .toBeGreaterThan(ASK_ABOVE_MINUTES);
    for (const steering_could_help of [undefined, true, false]) {
      const given = (overrides: Partial<ResearchMenuInput> = {}) => short({ steering_could_help, ...overrides });
      const name = String(steering_could_help);
      expect(steeringChoiceLeftOut(given({ tasks: [LONG_TASK] }), DEFAULT_RESEARCH_STEERING), name).toBe(false);
      expect(steeringChoiceLeftOut(given(), guided), name).toBe(false);
      expect(steeringChoiceLeftOut(given(), autonomous), name).toBe(false);
      expect(steeringChoiceLeftOut(given({ allocation: [{ task: 1, minutes: 2 }], person_answered: true }),
        DEFAULT_RESEARCH_STEERING), name).toBe(false);
      expect(steeringChoiceLeftOut(given(), DEFAULT_RESEARCH_STEERING, { digest: "md1~x", changed: true }), name)
        .toBe(false);
      expect(steeringChoiceLeftOut(given(), DEFAULT_RESEARCH_STEERING, { digest: "md1~x", changed: false }), name)
        .toBe(true);
      expect(steeringChoiceLeftOut(given({ done: [1] }), DEFAULT_RESEARCH_STEERING), name).toBe(false);
      // An allocation the AI did not declare the person's answers nothing, so the question is still needed.
      expect(steeringChoiceLeftOut(given({ allocation: [{ task: 1, minutes: 2 }] }), DEFAULT_RESEARCH_STEERING),
        name).toBe(true);
    }
  });

  it("reads a named question as steerable and the word none as not, in place of the yes or no", () => {
    // The word none, in any letter case and with spaces around it: a short menu goes on, exactly as with false, and
    // has the answer say its reading first (owner answer 297c, below).
    const precise = planResearch(short({ steering_could_help: false }), DEFAULT_RESEARCH_STEERING);
    expect(precise).toMatchObject({ next: "go_on", steering_could_help: false });
    expect(precise).not.toHaveProperty("say_reading_first");
    for (const steering_choice of ["none", "None", "NONE", " nOnE "]) {
      const result = planResearch(short({ steering_choice }), DEFAULT_RESEARCH_STEERING);
      expect(result, steering_choice).toEqual({ ...precise, say_reading_first: true });
      expect(result, steering_choice).not.toHaveProperty("steering_choice");
    }
    // A named question: the menu asks, exactly as with true, and carries the question for the reply.
    const open = planResearch(short({ steering_could_help: true }), DEFAULT_RESEARCH_STEERING);
    const named = planResearch(short({ steering_choice: QUESTION }), DEFAULT_RESEARCH_STEERING);
    expect(open).toMatchObject({ next: "ask", steering_could_help: true });
    expect(open).not.toHaveProperty("steering_choice");
    expect(named).toEqual({ ...open, steering_choice: QUESTION });
    expect(planResearch(short({ steering_choice: `  ${QUESTION} ` }), DEFAULT_RESEARCH_STEERING).steering_choice)
      .toBe(QUESTION);
    // When both are given, steering_choice decides.
    expect(planResearch(short({ steering_could_help: true, steering_choice: "none" }), DEFAULT_RESEARCH_STEERING))
      .toEqual({ ...precise, say_reading_first: true });
    expect(planResearch(short({ steering_could_help: false, steering_choice: QUESTION }), DEFAULT_RESEARCH_STEERING))
      .toEqual(named);
    // none is an exact value, never a reading of meaning: any other text is a named question, in any language, so
    // what is unclear asks.
    for (const steering_choice of ["None.", "no", "n/a", "aucune", "none of these, I think"]) {
      expect(planResearch(short({ steering_choice }), DEFAULT_RESEARCH_STEERING), steering_choice)
        .toMatchObject({ next: "ask", steering_could_help: true, steering_choice });
    }
    // With neither, steering_could_help is read as before: left out, it counts as true and the result carries none.
    const unsaid = planResearch(short(), DEFAULT_RESEARCH_STEERING);
    expect(unsaid.next).toBe("ask");
    expect(unsaid).not.toHaveProperty("steering_could_help");
    expect(unsaid).not.toHaveProperty("steering_choice");
    // The rest of the rule is the owner's as it was. The word none does not stop an ask that has another reason.
    expect(planResearch(short({ tasks: [LONG_TASK], steering_choice: "none" }), DEFAULT_RESEARCH_STEERING))
      .toMatchObject({ next: "ask", steering_could_help: false });
    expect(planResearch(short({ steering_choice: "none" }), guided).next).toBe("ask");
    expect(planResearch(short({ steering_choice: "none" }), DEFAULT_RESEARCH_STEERING, undefined,
      { digest: "md1~x", changed: true }).next).toBe("ask");
    expect(planResearch(short({ steering_choice: "none", done: [1] }), DEFAULT_RESEARCH_STEERING).next).toBe("ask");
    // A named question does not stop autonomous research or the person's own allocation, and the result carries it
    // only where the menu asks; where it asks for another reason too, the question still goes with it.
    for (const going of [planResearch(short({ steering_choice: QUESTION }), autonomous),
      planResearch(short({ steering_choice: QUESTION, allocation: [{ task: 1, minutes: 2 }], person_answered: true }),
        DEFAULT_RESEARCH_STEERING)]) {
      expect(going).toMatchObject({ next: "go_on", steering_could_help: true });
      expect(going).not.toHaveProperty("steering_choice");
    }
    expect(planResearch(short({ tasks: [LONG_TASK], steering_choice: QUESTION }), guided))
      .toMatchObject({ next: "ask", steering_choice: QUESTION });
  });

  it("puts the named question to the person in the reply and in next_step, in place of the general sentence", () => {
    const HEAD = "Your reply: at most two sentences on what the first look suggests, saying it is not yet checked";
    const GENERAL = ", and one on what their choices could change, such as their own situation, the form or dose " +
      "they use, or the outcome that matters most to them";
    const NAMED = `; then the question you named for them, in their language: ${JSON.stringify(QUESTION)}`;
    const STEERS = "What they answer to the question you named decides what the research checks: do the tasks, and " +
      "write the answer, for the reading or choice they gave. A reply that answers it and gives no allocation " +
      "leaves the allocation to you, as \"you decide\" does.";
    const TAIL = "; then this menu, numbered as here, saying for each task whether it means a quick look, reading " +
      "in full or a method audit (the times are rough planning estimates):";
    const lines = (plan: ResearchMenuInput, steering: ResearchSteering = DEFAULT_RESEARCH_STEERING) =>
      planResearchText(planResearch(plan, steering), new Set(), false, PRECISE_TARGET).split("\n");
    const reply = (words: string[]) => words.find((line) => line.startsWith("Your reply: "));
    const open = lines(short({ steering_could_help: true }));
    const named = lines(short({ steering_choice: QUESTION }));
    // Two lines differ. The reply's first: the question stands where the general sentence stood. And the rule for
    // the person's answer: it says what their answer to that question does, which nothing said (13 Nov 2026).
    expect(reply(open)).toBe(HEAD + GENERAL + TAIL);
    expect(reply(named)).toBe(HEAD + NAMED + TAIL);
    expect(NAMED_ANSWER_STEERS).toBe(STEERS);
    expect(named.filter((line) => line.includes(STEERS))).toHaveLength(1);
    expect(named.find((line) => line.includes(STEERS))).toContain("the recommended allocation, with " +
      `person_answered true too. ${STEERS} If the reply changes the question, register the plain answer again ` +
      "for the new research target first");
    expect(open.some((line) => line.includes(STEERS))).toBe(false);
    expect(named.map((line) => line.replace(` ${STEERS}`, "")).filter((line) => line !== reply(named)))
      .toEqual(open.filter((line) => line !== reply(open)));
    expect(named).toHaveLength(open.length);
    // The reason given is the AI's own judgment, as with true.
    expect(named.join("\n")).toContain("their choices could steer the research, as they could here. Ask now, " +
      "before any of these tasks");
    // Guided research, and tasks past the 10 minutes, ask for their own reasons and put a named question all the
    // same; with the word none they put none, and no general sentence either.
    expect(reply(lines(short({ steering_could_help: true }), guided))).toBe(HEAD + TAIL);
    expect(reply(lines(short({ steering_choice: QUESTION }), guided))).toBe(HEAD + NAMED + TAIL);
    expect(reply(lines(short({ tasks: [LONG_TASK], steering_choice: QUESTION })))).toBe(HEAD + NAMED + TAIL);
    expect(reply(lines(short({ tasks: [LONG_TASK], steering_choice: "none" })))).toBe(HEAD + TAIL);
    expect(reply(lines(short({ tasks: [LONG_TASK] })))).toBe(HEAD + GENERAL + TAIL);
    // next_step, for an app that hands its model only the structured content: the question right after the stop.
    const STEP_TAIL = "show researchMenu.tasks as a numbered list with their times, the recommendation and how to " +
      "answer (task numbers and minutes, or \"you decide\"), and end with one line saying they can change how often " +
      "AskRigor asks by saying guided, balanced or autonomous (theirs is balanced now). Make no research call " +
      "and don't call finalize_research " +
      "until they answer; then call action plan_research again with their allocation and person_answered true " +
      "inside later_inputs.researchMenu (for \"you decide\", with you_decide_later_inputs as later_inputs, after " +
      "replacing <true|false> in person_answered: true once they have answered, false before). Send " +
      "person_answered true only once they have answered this menu in a message of their own: an allocation is the " +
      "person's answer only with person_answered true, and one sent without it is not used.";
    expect(planNextStep(planResearch(short({ steering_choice: QUESTION }), DEFAULT_RESEARCH_STEERING))).toBe("Ask " +
      "the person now and end your turn: put the question you named to them, in their language " +
      `(researchMenu.steering_choice), and ${STEP_TAIL} ${STEERS} ` +
      "If the reply asks for another research style, set it first with action set_research_steering " +
      "(later_inputs.researchSteering with style guided, balanced or autonomous), then call plan_research again.");
    for (const plan of [short(), short({ steering_could_help: true }),
      short({ tasks: [LONG_TASK], steering_choice: "none" })]) {
      expect(planNextStep(planResearch(plan, DEFAULT_RESEARCH_STEERING))).toBe("Ask the person now and end your " +
        `turn: ${STEP_TAIL} If the reply asks for another research style, set it first with action ` +
        "set_research_steering (later_inputs.researchSteering with style guided, balanced or autonomous), then " +
        "call plan_research again.");
    }
  });

  it("gives the call back with the question's place marked, and reads the placeholder left in as not given", () => {
    expect(MENU_PLACEHOLDERS.steering_choice).toBe(PLACEHOLDER);
    const example = correctedMenu(short({ plain_answer_receipt: "pa1~receipt" }), true);
    expect(example).toEqual({ researchMenu: { research_target: PRECISE_TARGET, plain_answer_receipt: "pa1~receipt",
      steering_choice: PLACEHOLDER, tasks: PRECISE_TASKS } });
    // The question's place comes before the tasks, where the AI reads it first, after a yes or no the call gave,
    // which is kept; a question given is kept as given; and only this refusal marks the place.
    expect(Object.keys(correctedMenu(short({ plain_answer_receipt: "pa1~receipt", steering_could_help: false }),
      true).researchMenu)).toEqual(["research_target", "plain_answer_receipt", "steering_could_help",
      "steering_choice", "tasks"]);
    expect(correctedMenu(short({ steering_could_help: false }), true).researchMenu)
      .toMatchObject({ steering_could_help: false, steering_choice: PLACEHOLDER });
    expect(correctedMenu(short({ steering_choice: QUESTION }), true).researchMenu.steering_choice).toBe(QUESTION);
    expect(correctedMenu({ ...short(), steering_choice: ` ${QUESTION} ` }).researchMenu.steering_choice)
      .toBe(QUESTION);
    expect(correctedMenu(short()).researchMenu).not.toHaveProperty("steering_choice");
    // 294c's place for the yes or no, <true|false>, is marked no more.
    for (const marked of [false, true]) {
      expect(correctedMenu(short(), marked).researchMenu).not.toHaveProperty("steering_could_help");
    }
    expect(MENU_PLACEHOLDERS).not.toHaveProperty("steering_could_help");
    // As plan_research reads the menu: the placeholder left in is not given, exactly, and so is null.
    const read = (steering_choice: unknown) =>
      readResearchMenu({ researchMenu: { ...short(), steering_choice } }).menu as Record<string, unknown>;
    for (const unfilled of [PLACEHOLDER, ` ${PLACEHOLDER} `, null]) {
      expect(read(unfilled), String(unfilled)).not.toHaveProperty("steering_choice");
      expect(researchMenuSchema.safeParse(read(unfilled)).success, String(unfilled)).toBe(true);
    }
    // A question or the word none is kept, without the spaces around it.
    expect(researchMenuSchema.parse(read(` ${QUESTION} `)).steering_choice).toBe(QUESTION);
    expect(researchMenuSchema.parse(read(" None ")).steering_choice).toBe("None");
    expect(researchMenuSchema.safeParse(read("x".repeat(300))).success).toBe(true);
    // What is not a text of 1 to 300 characters is refused as unreadable: nothing, a yes or no, a list, or more.
    for (const unreadable of ["", "   ", true, [QUESTION], "x".repeat(301)]) {
      expect(researchMenuSchema.safeParse(read(unreadable)).success, String(unreadable)).toBe(false);
    }
    // The test the refusal gives: name the question first; none only when the question fixes what to look up; and
    // tasks that are all needed are not by themselves a reason for none (the round-4 finding).
    expect(STEERING_CHOICE).toBe("the one question you would ask this person before researching, because their " +
      "answer could change what the research checks, such as which reading of the question they mean, what is to " +
      "be compared with what, their own situation or what they have tried, the form, dose or route, or the outcome " +
      "that matters most to them. Try to name that question first, as one sentence in their language: if you can " +
      "name one, AskRigor asks the person first. Write none only when you can name no such question, because the " +
      "question itself fixes exactly what to look up, as with one result of one named study. That every task on " +
      "the menu is needed to answer is not by itself a reason for none: the person may mean a different reading or " +
      "comparison than the one you picked (HRP StructuredUserSteeringAndApproval)");
  });

  async function session(subject: string, dev: boolean, surface: "/mcp" | "/mcp/claude" = "/mcp") {
    const { service, connect } = await start();
    await service.acceptFreeContributor(subject, agreement);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", dev ? service.accountKeyForSubject(subject) : "");
    const manage = await connect(surface, subject);
    return { service, manage,
      plan: async (researchMenu: Record<string, unknown>) =>
        await manage({ action: "plan_research", later_inputs: { researchMenu } }) };
  }
  type Refused = { ok: boolean; error: { code: string; message: string }; problems: string[];
    corrected_later_inputs: { researchMenu: Record<string, unknown> } };
  type Planned = { ok: boolean; researchMenu: { next: string; menu_digest: string; steering_choice?: string };
    next_step: string; you_decide_later_inputs: { researchMenu: Record<string, unknown> } };
  const LEFT_OUT = "later_inputs.researchMenu.steering_choice: left out; name the one question you would ask this " +
    "person, or write none";
  const refusalText = (example: unknown) => "AskRigor planned nothing yet. These tasks are short, so whether to ask " +
    "the person first rests on later_inputs.researchMenu.steering_choice, which this call left out " +
    `(steering_could_help alone, true or false, does not replace it): ${STEERING_CHOICE}.\nCall ` +
    "manage_research_access with action plan_research again with these later_inputs, which are yours, after " +
    `replacing ${PLACEHOLDER} with that question or with the word none: ${JSON.stringify(example)}`;
  const OWN = [{ task: 1, minutes: 2 }, { task: 2, minutes: 3 }];

  it("plans nothing until a dev account's AI names the question or writes none: a yes or no alone is handed back",
    async () => {
      const { plan } = await session("auth0|dev", true);
      // Neither given, or the yes or no alone, true or false: nothing is planned, and the call comes back with the
      // question's place marked and the test.
      for (const given of [{}, { steering_could_help: true }, { steering_could_help: false }]) {
        const first = await plan(short(given));
        expect(first.isError, JSON.stringify(given)).toBe(true);
        const refused = first.structuredContent as Refused;
        expect(refused, JSON.stringify(given)).toMatchObject({ ok: false, error: { code: "invalid_request" },
          problems: [LEFT_OUT] });
        expect(refused).not.toHaveProperty("researchMenu");
        expect(refused).not.toHaveProperty("next_step");
        expect(refused.corrected_later_inputs, JSON.stringify(given)).toEqual({ researchMenu: {
          research_target: PRECISE_TARGET, ...given, steering_choice: PLACEHOLDER, tasks: PRECISE_TASKS } });
        // The text asks for the question with its test and hands the call back; the message carries the test for an
        // app that gives its model only the structured content.
        expect(first.content[0]!.text, JSON.stringify(given)).toBe(refusalText(refused.corrected_later_inputs));
        expect(refused.error.message).toContain(STEERING_CHOICE);
        // The placeholder left in is read as not given: the same refusal again, and still nothing planned.
        const again = await plan(refused.corrected_later_inputs.researchMenu);
        expect(again.isError, JSON.stringify(given)).toBe(true);
        expect(again.structuredContent).toEqual(first.structuredContent);
        expect(again.content[0]!.text).toBe(first.content[0]!.text);
      }
      // The word none, in any letter case: a precise question goes on, with no question to the person; beside a yes
      // too, since steering_choice decides.
      for (const given of [{ steering_choice: "none" }, { steering_choice: "None" }, { steering_choice: " NONE " },
        { steering_could_help: true, steering_choice: "none" }]) {
        const precise = await plan(short(given));
        expect(precise.isError, JSON.stringify(given)).not.toBe(true);
        expect(precise.structuredContent, JSON.stringify(given)).toMatchObject({ ok: true, researchMenu: {
          next: "go_on", steering_could_help: false, recommended: OWN, say_reading_first: true },
          next_step: `${GO_ON_STEP} ${READING_FIRST}` });
        expect(precise.structuredContent).not.toHaveProperty("researchMenu.steering_choice");
        expect(precise.structuredContent).not.toHaveProperty("you_decide_later_inputs");
        expect(text(precise)).toContain("Go on now: do these tasks in this order");
      }
      // A named question: it asks, says the choices could steer the research here, and carries the question into
      // the reply, next_step, researchMenu and the "you decide" call.
      const open = await plan(short({ steering_choice: QUESTION }));
      expect(open.isError).not.toBe(true);
      const asked = open.structuredContent as Planned;
      expect(asked).toMatchObject({ ok: true, researchMenu: { next: "ask", steering_could_help: true,
        steering_choice: QUESTION, recommended: OWN } });
      expect(text(open)).toContain("their choices could steer the research, as they could here. Ask now, before any " +
        "of these tasks");
      expect(text(open)).toContain("saying it is not yet checked; then the question you named for them, in their " +
        `language: ${JSON.stringify(QUESTION)}; then this menu, numbered as here`);
      expect(text(open)).not.toContain("and one on what their choices could change");
      expect(asked.next_step).toMatch(new RegExp("^Ask the person now and end your turn: put the question you " +
        "named to them, in their language \\(researchMenu\\.steering_choice\\), and show researchMenu\\.tasks as a " +
        "numbered list", "u"));
      const youDecide = asked.you_decide_later_inputs;
      expect(youDecide).toEqual({ researchMenu: { research_target: PRECISE_TARGET, steering_choice: QUESTION,
        tasks: PRECISE_TASKS, allocation: OWN, person_answered: "<true|false>",
        menu_digest: asked.researchMenu.menu_digest } });
      expect(Object.keys(youDecide.researchMenu)).toEqual(["research_target", "steering_choice", "tasks",
        "allocation", "person_answered", "menu_digest"]);
      // That call sent as it is does not fall into the refusal again: it is the ask again, with the same question;
      // once the person has answered and the call says so, it goes on.
      const copied = await plan(youDecide.researchMenu);
      expect(copied.isError).not.toBe(true);
      expect(copied.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
        allocation_not_used: true, steering_choice: QUESTION }, you_decide_later_inputs: youDecide });
      const decided = await plan({ ...youDecide.researchMenu, person_answered: true });
      expect(decided.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on", recommended: OWN },
        next_step: GO_ON_STEP });
      expect(decided.structuredContent).not.toHaveProperty("researchMenu.steering_choice");
      // When both are given, steering_choice decides: false beside a named question asks.
      const both = await plan(short({ steering_could_help: false, steering_choice: QUESTION }));
      expect(both.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
        steering_could_help: true, steering_choice: QUESTION } });
      expect((both.structuredContent as Planned).you_decide_later_inputs.researchMenu).toMatchObject({
        steering_could_help: false, steering_choice: QUESTION });
      // What is not a text is no question: the menu is refused as unreadable, naming the field.
      for (const unreadable of [true, [QUESTION], ""]) {
        const unread = await plan({ ...short(), steering_choice: unreadable });
        expect(unread.isError, String(unreadable)).toBe(true);
        expect((unread.structuredContent as Refused).problems[0], String(unreadable))
          .toMatch(/^later_inputs\.researchMenu\.steering_choice: /u);
      }
    });

  it("asks for no question where it would change nothing, on a dev account too", async () => {
    const { manage, plan } = await session("auth0|dev", true);
    // Tasks past the 10 minutes ask whatever the judgment, with neither field or with the yes or no alone.
    const long = await plan(short({ tasks: [LONG_TASK] }));
    expect(long.isError).not.toBe(true);
    expect(long.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
    expect(long.structuredContent).not.toHaveProperty("researchMenu.steering_choice");
    expect(text(long)).toContain("as they usually can (steering_could_help was left out)");
    const timed = await plan(short({ tasks: [LONG_TASK], steering_could_help: false }));
    expect(timed.isError).not.toBe(true);
    expect(timed.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
      steering_could_help: false } });
    // The person's own allocation is their answer: it needs no question and goes on, once the AI declares it theirs
    // (round 3 of 12 Nov 2026, below). One it does not declare is not used, so the question is still asked for.
    const answered = await plan(short({ allocation: OWN, person_answered: true }));
    expect(answered.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
    expect((await plan(short({ allocation: OWN }))).isError).toBe(true);
    // A menu the AI changed after the person saw it, and a re-plan, ask whatever the judgment.
    const digest = (answered.structuredContent as Planned).researchMenu.menu_digest;
    const changed = await plan(short({ tasks: [...PRECISE_TASKS, TASKS[3]!], menu_digest: digest }));
    expect(changed.isError).not.toBe(true);
    expect(changed.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask", menu_changed: true,
      recommended_minutes: [4, 10] } });
    const replanned = await plan(short({ done: [1] }));
    expect(replanned.isError).not.toBe(true);
    expect(replanned.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
    // Guided research asks before every menu, and autonomous research goes on.
    for (const [style, next] of [["guided", "ask"], ["autonomous", "go_on"]] as const) {
      await manage({ action: "set_research_steering", later_inputs: { researchSteering: { style } } });
      const styled = await plan(short());
      expect(styled.isError, style).not.toBe(true);
      expect(styled.structuredContent, style).toMatchObject({ ok: true, researchMenu: { next, style } });
    }
  });

  it("carries the test in the message, for Claude's surface", async () => {
    const claude = await session("auth0|dev-claude", true, "/mcp/claude");
    const refused = await claude.plan(short({ steering_could_help: false }));
    expect(refused.isError).toBe(true);
    expect((refused.structuredContent as Refused).error.message).toBe("plan_research planned nothing yet: this " +
      "menu's tasks are short, so whether to ask the person first rests on " +
      "later_inputs.researchMenu.steering_choice, which the call left out (steering_could_help alone, true or " +
      `false, does not replace it). Call it again with corrected_later_inputs, after replacing ${PLACEHOLDER} with ` +
      `that question or with the word none: ${STEERING_CHOICE}.`);
    expect((refused.structuredContent as Refused).corrected_later_inputs.researchMenu).toMatchObject({
      steering_could_help: false, steering_choice: PLACEHOLDER });
  });

  it("plans every other account's menus as before when they give no steering_choice, and reads one they give",
    async () => {
      const person = await session("auth0|person", false);
      // Neither field: left out still counts as yes (owner answer 284), and nothing is handed back.
      const asked = await person.plan(short());
      expect(asked.isError).not.toBe(true);
      expect(asked.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
      expect(asked.structuredContent).not.toHaveProperty("corrected_later_inputs");
      expect(asked.structuredContent).not.toHaveProperty("researchMenu.steering_could_help");
      expect(asked.structuredContent).not.toHaveProperty("researchMenu.steering_choice");
      // The lines pinned before 13 Nov 2026, byte for byte: the stop, the reply with its general sentence, the menu,
      // the recommendation and the question. Only the two lines after them, on the person's answer, changed that
      // day, for every account (below).
      const lines = asked.content[0]!.text.split("\n");
      expect(lines.slice(0, -2)).toEqual([
        PEOPLE_TASK_MISSING,
        "This person's research style asks first when their choices could steer the research, as they usually can " +
          "(steering_could_help was left out). Ask now, before any of these tasks: your whole reply this turn is the " +
          "message below, in the person's language, after the urgent action if the question is urgent; then end your " +
          "turn. Make no research call and don't call finalize_research for this reply: it is a question, not an " +
          "answer (HRP StructuredUserSteeringAndApproval: when approval is required, begin no substantive source " +
          "collection in the same response).",
        "Your reply: at most two sentences on what the first look suggests, saying it is not yet checked, and one on " +
          "what their choices could change, such as their own situation, the form or dose they use, or the outcome " +
          "that matters most to them; then this menu, numbered as here, saying for each task whether it means a " +
          "quick look, reading in full or a method audit (the times are rough planning estimates):",
        "1. Read the trial's adverse-event table in full: could change the conclusion; about 1 to 3 min.",
        "2. Audit how the trial recorded adverse events: could change how sure the answer is; about 2 to 4 min.",
        "Recommended: 1. 2 min, 2. 3 min, about 3 to 7 min in all; then about 4 to 10 min to check and write the " +
          "answer.",
        "How should I spend the time? Reply with task numbers and minutes, such as \"1. 5 min, 2. 4 min\", in your " +
          "own words, or \"you decide\".",
        menuPreferenceLine("balanced"),
      ]);
      expect(lines.at(-2)).toMatch(/^When the person replies: /u);
      expect(lines.at(-1)).toMatch(/^Only once the person has replied "you decide", in a later message/u);
      const { researchMenu: { menu_digest: digest }, you_decide_later_inputs: handedOver } =
        asked.structuredContent as Planned;
      expect(asked.content[0]!.text).toBe(planResearchText(
        planResearch(short(), DEFAULT_RESEARCH_STEERING, undefined, { digest, changed: false }), new Set(), false,
        PRECISE_TARGET, youDecideLaterInputsSchema.parse(handedOver)));
      // The yes or no alone is planned there as before: false goes on, in the words pinned before.
      const precise = await person.plan(short({ steering_could_help: false }));
      expect(precise.isError).not.toBe(true);
      expect(precise.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        steering_could_help: false, recommended: OWN }, next_step: GO_ON_STEP });
      expect(text(precise)).toContain("Go on now: do these tasks in this order, each within its minutes, showing " +
        "the menu as what you are doing; then check the answer with finalize_research and give it in this turn.");
      const open = await person.plan(short({ steering_could_help: true }));
      expect(open.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
        steering_could_help: true } });
      expect(text(open)).toContain("and one on what their choices could change");
      // A steering_choice an account gives is read the same way on every account: none goes on, and a named question
      // asks and goes to the person.
      const none = await person.plan(short({ steering_choice: "none" }));
      expect(none.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        steering_could_help: false, say_reading_first: true }, next_step: `${GO_ON_STEP} ${READING_FIRST}` });
      const named = await person.plan(short({ steering_choice: QUESTION }));
      expect(named.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
        steering_could_help: true, steering_choice: QUESTION } });
      expect(text(named)).toContain(`then the question you named for them, in their language: ${
        JSON.stringify(QUESTION)}; then this menu`);
      // The placeholder left in is not given: planned as before, with neither.
      const unfilled = await person.plan(short({ steering_choice: PLACEHOLDER }));
      expect(unfilled.isError).not.toBe(true);
      expect(unfilled.content[0]!.text).toBe(asked.content[0]!.text);
    });
});

// Round 3 of the owner's ChatGPT runs (12 Nov 2026, live build 1d877300). An ask hands the AI the "you decide" call
// ready to copy, with the recommended allocation in it, and any allocation naming an open task counted as the
// person's answer. In one run the AI sent that call itself 54 seconds after the ask, in the same turn; AskRigor said
// go on, and it researched for 17 minutes without the person: "I treated AskRigor's returned you_decide_later_inputs
// allocation as a usable default". So an allocation is the person's answer only with person_answered true, which the
// AI declares: on dev accounts from #440 (live 12 Nov, 23:58 UTC), and on every account since 13 Nov 2026. Round 4 on
// the owner's account (13 Nov, 00:03 to 00:39 UTC): no first turn went on with an allocation the person had not
// given, and a real "you decide" went on at the first plan_research call, while every other account still got the
// handed-over call as a usable default, which is how the AI took the person's answer for itself on 12 Nov. These
// fixtures are invented.
describe("an allocation needs the person's answer declared, on every account (round 3, 12 Nov 2026)", () => {
  const OPEN_TARGET = "Whether a warm salt-water gargle shortens a sore throat";
  const OPEN_TASKS: ResearchMenuInput["tasks"] = [
    { task: "Search trials of salt-water gargling for sore throats", kind: "study_search", could_change: "conclusion" },
    { task: "Read the largest trial in full", kind: "full_text", could_change: "confidence" },
    { task: "Read what people who gargle report", kind: "forum_thread", could_change: "detail" },
  ];
  const LONG_TASK: ResearchMenuInput["tasks"][number] = { task: "Read six more trials in full", kind: "full_text",
    sources: 6, could_change: "conclusion" };
  // The question a dev account's menu names (owner answer 296b, above); any other account may give the yes or no.
  const QUESTION = "Is this for a sore throat you have now, or to keep one from coming?";
  // The AI said the person's choices could steer this menu, so it asks.
  const open = (overrides: Partial<ResearchMenuInput> = {}): ResearchMenuInput =>
    ({ research_target: OPEN_TARGET, steering_could_help: true, tasks: OPEN_TASKS, ...overrides });
  // AskRigor's own recommendation for this menu, and an allocation that differs from it in tasks and minutes.
  const OWN = [{ task: 1, minutes: 2 }, { task: 2, minutes: 2 }];
  const THEIRS = [{ task: 1, minutes: 1.5 }, { task: 3, minutes: 4 }];
  const planned = (plan: ResearchMenuInput, steering: ResearchSteering = DEFAULT_RESEARCH_STEERING,
    changed?: { digest: string; changed: boolean }) => planResearch(plan, steering, undefined, changed);
  const autonomous: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" };

  // The words, as the result gives them, to every account since 13 Nov 2026.
  const NOT_USED = "The allocation this call carried was not used: an allocation is the person's answer only with " +
    "person_answered true, which the call did not give, ";
  const STOP = `${NOT_USED}so this menu still waits for them. If the person has not replied since the menu was ` +
    "shown, this is still the turn of the ask.";
  const OWN_TASKS = `${NOT_USED}so the tasks recommended here are AskRigor's own, not the person's choice.`;
  const NOT_USED_PROBLEM = "later_inputs.researchMenu.allocation: not used; an allocation is the person's answer " +
    "only with person_answered true, which the call did not give";
  const RULE_HEAD = "When the person replies: call manage_research_access action plan_research again with the same " +
    "plain_answer_receipt, tasks and menu_digest (researchMenu.menu_digest in this result), research_target word " +
    `for word ${JSON.stringify(OPEN_TARGET)}, and their allocation inside researchMenu, as a list of {task, minutes}`;
  const RULE_TAIL = "; for \"you decide\", or a reply that leaves the choice to you such as \"continue\", the call " +
    "on the next line. If the reply changes the question, register the plain answer again for the new research " +
    "target first, with later_inputs.framing for it. Never send an allocation the person did not give or leave to " +
    "you. If the reply asks for another research style, set it first with action set_research_steering " +
    "(later_inputs.researchSteering with style guided, balanced or autonomous), then call plan_research again.";
  const DECLARED = ", with person_answered true in researchMenu too (send it only once they have answered this " +
    "menu in a message of their own; an allocation without it is not used)";
  const ONLY_ONCE = "Only once the person has replied \"you decide\", in a later message, never in this turn: call " +
    "manage_research_access with action plan_research and ";
  const REPLACING = "these later_inputs, after replacing <true|false> in person_answered with whether the person " +
    "has answered this menu in a message of their own since it was shown (true once they have, false before); an " +
    "allocation sent with false, or without person_answered, is not used; ";
  const INSIDE = "the recommended allocation is inside researchMenu, where every allocation goes, never beside it: ";
  const ASK_NOW = "Ask the person now and end your turn: ";
  const NAMED = "put the question you named to them, in their language (researchMenu.steering_choice), and ";
  const ASK_STEP = "show researchMenu.tasks as a numbered list with their times, the recommendation and how to " +
    "answer (task numbers and minutes, or \"you decide\"), and end with one line saying they can change how often " +
    "AskRigor asks by saying guided, balanced or autonomous (theirs is balanced now). Make no research call and " +
    "don't call finalize_research " +
    "until they answer; then call action plan_research again with their allocation and person_answered true inside " +
    "later_inputs.researchMenu ";
  const SEND_ONLY_ONCE = " Send person_answered true only once they have answered this menu in a message of their " +
    "own: an allocation is the person's answer only with person_answered true, and one sent without it is not used.";
  const STEP_DECLARED = `${ASK_NOW}${ASK_STEP}(for "you decide", with you_decide_later_inputs as later_inputs, after ` +
    `replacing <true|false> in person_answered: true once they have answered, false before).${SEND_ONLY_ONCE} ` +
    "If the reply asks for another research style, set it first with action set_research_steering " +
    "(later_inputs.researchSteering with style guided, balanced or autonomous), then call plan_research again.";
  // With a named question the step also ends with what the person's answer to it does (NAMED_ANSWER_STEERS).
  const STEP_NAMED = STEP_DECLARED.replace(ASK_NOW, ASK_NOW + NAMED)
    .replace(SEND_ONLY_ONCE, `${SEND_ONLY_ONCE} ${NAMED_ANSWER_STEERS}`);
  const GO_ON_STEP = "Do the recommended tasks now, in order, each within its minutes; then check the answer with " +
    "finalize_research and give it in this turn.";
  const AUTONOMOUS_STEP = "Do the recommended tasks now; after about 10 minutes of research, check what you have " +
    "with finalize_research and give that answer, ending it with the open tasks as a numbered menu and the " +
    "question whether to spend more time on them.";
  const AFTER_A_STOP = "If the person stops you or changes direction, call plan_research again with done, their " +
    "new allocation, person_answered true (an allocation without it is not used) and the last result's " +
    "menu_digest; the research target stays word for word the same.";
  // The words every account but a dev account got until 13 Nov 2026, which no result gives any more.
  const AS_THEY_ARE = ["exactly these later_inputs", "with you_decide_later_inputs as later_inputs, as they are",
    "on this account"];

  it("uses an allocation only with person_answered true, and plans as if none had come without it", () => {
    expect(planResearch(open(), DEFAULT_RESEARCH_STEERING)).toMatchObject({ next: "ask", recommended: OWN,
      recommended_minutes: [2, 6] });
    expect(PERSON_ANSWER_DECLARED).toBe("an allocation is the person's answer only with person_answered true");
    // Sent without the declaration, or with false: not used. The recommendation is AskRigor's own, the menu asks,
    // and the stop comes before anything else in the text and in next_step, with the ask after it.
    for (const overrides of [{ allocation: THEIRS }, { allocation: THEIRS, person_answered: false }]) {
      const result = planned(open(overrides));
      expect(result, JSON.stringify(overrides)).toMatchObject({ next: "ask", allocation_not_used: true,
        recommended: OWN, recommended_minutes: [2, 6] });
      expect(allocationNotUsedStop(result)).toBe(STOP);
      const words = planResearchText(result, new Set(), true, OPEN_TARGET,
        youDecideLaterInputs(open(overrides), result)).split("\n");
      expect(words[0]).toBe(STOP);
      expect(words[1]).toMatch(new RegExp("^This person's research style asks first when their choices could steer " +
        "the research, as they could here\\. Ask now, before any of these tasks:", "u"));
      expect(planNextStep(result)).toBe(`${STOP} ${STEP_DECLARED}`);
    }
    // Declared the person's, it is their answer: their minutes as given, and no stop.
    const theirs = planned(open({ allocation: THEIRS, person_answered: true }));
    expect(theirs).toMatchObject({ next: "go_on", recommended: THEIRS, recommended_minutes: [5.5, 5.5] });
    expect(theirs).not.toHaveProperty("allocation_not_used");
    expect(allocationNotUsedStop(theirs)).toBeUndefined();
    expect(planResearchText(theirs, new Set(), true, OPEN_TARGET)).not.toContain("was not used");
    expect(planNextStep(theirs)).toBe(GO_ON_STEP);
    // An allocation that names no open task counted as none before, so it is not one "not used"; and the
    // declaration with no allocation answers nothing.
    for (const overrides of [{ allocation: [{ task: 9, minutes: 5 }] },
      { allocation: [{ task: 9, minutes: 5 }], person_answered: true }, { person_answered: true }]) {
      const result = planned(open(overrides));
      expect(result, JSON.stringify(overrides)).toMatchObject({ next: "ask", recommended: OWN });
      expect(result, JSON.stringify(overrides)).not.toHaveProperty("allocation_not_used");
    }
    // Guided research, a re-plan and a menu changed after the person saw it ask as they do with no allocation;
    // declared, the person's allocation goes on in each, as it did.
    const cases: Array<[ResearchMenuInput, ResearchSteering, { digest: string; changed: boolean } | undefined]> = [
      [open({ steering_could_help: false, allocation: THEIRS }), { ...DEFAULT_RESEARCH_STEERING, style: "guided" },
        undefined],
      [open({ steering_could_help: false, allocation: [{ task: 3, minutes: 4 }], done: [1] }),
        DEFAULT_RESEARCH_STEERING, undefined],
      [open({ steering_could_help: false, allocation: THEIRS }), DEFAULT_RESEARCH_STEERING,
        { digest: "md1~x", changed: true }],
    ];
    for (const [plan, steering, changed] of cases) {
      expect(planned(plan, steering, changed)).toMatchObject({ next: "ask", allocation_not_used: true });
      const declared = planned({ ...plan, person_answered: true }, steering, changed);
      expect(declared).toMatchObject({ next: "go_on", recommended: plan.allocation });
      expect(declared).not.toHaveProperty("allocation_not_used");
    }
    // A dev account's question (owner answer 296b) is read from the same planning: an allocation not used answers
    // nothing, so a short menu that names no question still rests on it; declared, the allocation needs none.
    const unjudged: ResearchMenuInput = { research_target: OPEN_TARGET, tasks: OPEN_TASKS, allocation: THEIRS };
    expect(steeringChoiceLeftOut(unjudged, DEFAULT_RESEARCH_STEERING)).toBe(true);
    expect(steeringChoiceLeftOut({ ...unjudged, person_answered: true }, DEFAULT_RESEARCH_STEERING)).toBe(false);
    // And a menu that asks whatever the judgment (tasks past the 10 minutes, guided research, a changed menu, a
    // re-plan) still needs none when its allocation is not used: planned as not steerable it would ask all the same.
    const guided: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "guided" };
    const long: ResearchMenuInput = { research_target: OPEN_TARGET, tasks: [LONG_TASK],
      allocation: [{ task: 1, minutes: 3 }] };
    expect(planned(long)).toMatchObject({ next: "ask", allocation_not_used: true, recommended_minutes: [6, 15] });
    expect(steeringChoiceLeftOut(long, DEFAULT_RESEARCH_STEERING)).toBe(false);
    expect(steeringChoiceLeftOut(unjudged, guided)).toBe(false);
    expect(steeringChoiceLeftOut(unjudged, DEFAULT_RESEARCH_STEERING, { digest: "md1~x", changed: true }))
      .toBe(false);
    expect(steeringChoiceLeftOut({ ...unjudged, allocation: [{ task: 3, minutes: 4 }], done: [1] },
      DEFAULT_RESEARCH_STEERING)).toBe(false);
    expect(steeringChoiceLeftOut(unjudged, autonomous)).toBe(false);
  });

  it("says the recommended tasks are AskRigor's own where the menu goes on whatever the person says", () => {
    // Autonomous research never waits, and a short menu the AI judged not steerable goes on: neither takes the
    // allocation for the person's.
    for (const [plan, steering, step] of [
      [open({ allocation: THEIRS }), autonomous, AUTONOMOUS_STEP],
      [open({ steering_could_help: false, allocation: THEIRS }), DEFAULT_RESEARCH_STEERING, GO_ON_STEP],
      [open({ steering_choice: "none", allocation: THEIRS }), DEFAULT_RESEARCH_STEERING,
        `${GO_ON_STEP} ${READING_FIRST}`],
    ] as const) {
      const result = planned(plan, steering);
      expect(result).toMatchObject({ next: "go_on", allocation_not_used: true, recommended: OWN,
        recommended_minutes: [2, 6] });
      expect(allocationNotUsedStop(result)).toBe(OWN_TASKS);
      const words = planResearchText(result, new Set(), true, OPEN_TARGET).split("\n");
      expect(words).toHaveLength(2);
      expect(words[0]).toBe(OWN_TASKS);
      expect(words[1]).toMatch(/^The menu to show the person, in their language, numbered as here/u);
      expect(words[1]).toContain("Recommended: 1. 2 min, 2. 2 min, about 2 to 6 min in all.");
      expect(planNextStep(result)).toBe(`${OWN_TASKS} ${step}`);
      // Where the research goes on, the way back after a stop says an allocation goes with the declaration.
      expect(words[1]).toContain(AFTER_A_STOP);
    }
    // Declared, autonomous research keeps the person's own allocation, as it did.
    expect(planned(open({ allocation: THEIRS, person_answered: true }), autonomous))
      .toMatchObject({ next: "go_on", recommended: THEIRS });
  });

  it("reads the words true and false as the values, and the placeholder left in as not given", () => {
    expect(MENU_PLACEHOLDERS.person_answered).toBe("<true|false>");
    const read = (later: Record<string, unknown>) => readResearchMenu(later);
    const given = (value: unknown) =>
      read({ researchMenu: { ...open(), allocation: THEIRS, person_answered: value } }).menu as Record<string, unknown>;
    expect(given(true).person_answered).toBe(true);
    expect(given("true").person_answered).toBe(true);
    expect(given(" TRUE ").person_answered).toBe(true);
    expect(given("False").person_answered).toBe(false);
    // The "you decide" call copied with its placeholder left in is planned as unanswered, not refused; null too.
    for (const unfilled of ["<true|false>", " <true|false> ", null]) {
      expect(given(unfilled), String(unfilled)).not.toHaveProperty("person_answered");
      expect(researchMenuSchema.safeParse(given(unfilled)).success, String(unfilled)).toBe(true);
    }
    // Any other word is no declaration: the menu is refused as unreadable, as for steering_could_help.
    for (const word of ["yes", "maybe", "<TRUE|FALSE>", 1]) {
      expect(given(word).person_answered, String(word)).toBe(word);
      expect(researchMenuSchema.safeParse(given(word)).success, String(word)).toBe(false);
    }
    // Given beside the menu, it goes inside it, like the allocation; camelCase too, and the placeholder not at all.
    const beside = read({ researchMenu: open(), allocation: THEIRS, personAnswered: "true" });
    expect(beside.menu).toMatchObject({ allocation: THEIRS, person_answered: true });
    expect(beside.moved).toEqual([["later_inputs.allocation", "researchMenu.allocation"],
      ["later_inputs.personAnswered", "researchMenu.person_answered"]]);
    expect(beside.ignored).toEqual([]);
    const unfilledBeside = read({ researchMenu: open(), allocation: THEIRS, person_answered: "<true|false>" });
    expect(unfilledBeside.menu).not.toHaveProperty("person_answered");
    expect(unfilledBeside.moved).toEqual([["later_inputs.allocation", "researchMenu.allocation"]]);
    expect(unfilledBeside.ignored).toEqual([]);
    // A refused menu's example keeps a person_answered the call gave, and never marks a place for one: whether the
    // person answered is not something a refusal asks the AI to fill in.
    expect(correctedMenu(open({ allocation: THEIRS, person_answered: false }), true).researchMenu)
      .toMatchObject({ allocation: THEIRS, person_answered: false });
    expect(correctedMenu({ research_target: OPEN_TARGET, tasks: OPEN_TASKS, allocation: THEIRS }, true).researchMenu)
      .toEqual({ research_target: OPEN_TARGET, steering_choice: MENU_PLACEHOLDERS.steering_choice,
        tasks: OPEN_TASKS, allocation: THEIRS });
    expect(correctedMenu({ ...open(), allocation: THEIRS, person_answered: "maybe" }).researchMenu)
      .not.toHaveProperty("person_answered");
  });

  it("hands over the \"you decide\" call with person_answered's place marked, and says what replaces it", () => {
    const plan = open({ plain_answer_receipt: "rr1~x" });
    const result = planResearch(plan, DEFAULT_RESEARCH_STEERING, { matches: true, minutesSince: 2 },
      { digest: "md1~d", changed: false });
    expect(result).toMatchObject({ next: "ask", recommended: OWN });
    const youDecide = youDecideLaterInputs(plan, result)!;
    expect(youDecide).toEqual({ researchMenu: { research_target: OPEN_TARGET, plain_answer_receipt: "rr1~x",
      steering_could_help: true, tasks: OPEN_TASKS, allocation: OWN, person_answered: "<true|false>",
      menu_digest: "md1~d" } });
    // The menu's own judgment goes with it, before the tasks, so the copy is planned as the same menu and, on a dev
    // account, does not fall into the refusal for the question; the placeholder stands right after the allocation it
    // speaks for.
    expect(Object.keys(youDecide.researchMenu)).toEqual(["research_target", "plain_answer_receipt",
      "steering_could_help", "tasks", "allocation", "person_answered", "menu_digest"]);
    const named = open({ steering_choice: QUESTION });
    expect(Object.keys(youDecideLaterInputs(named, planned(named))!.researchMenu)).toEqual(["research_target",
      "steering_could_help", "steering_choice", "tasks", "allocation", "person_answered"]);
    expect(youDecideLaterInputs(named, planned(named))!.researchMenu.steering_choice).toBe(QUESTION);
    // A menu that gave no judgment (its tasks pass the 10 minutes, so it asks whatever the judgment) carries none.
    const long: ResearchMenuInput = { research_target: OPEN_TARGET, tasks: [LONG_TASK], done: [] };
    expect(youDecideLaterInputs(long, planned(long))).toEqual({ researchMenu: { research_target: OPEN_TARGET,
      tasks: [LONG_TASK], allocation: [{ task: 1, minutes: 11 }], person_answered: "<true|false>" } });
    // The call as a result carries it is checked as one: the placeholder, and nothing else, in person_answered.
    expect(youDecideLaterInputsSchema.safeParse(youDecide).success).toBe(true);
    for (const person_answered of [true, false, undefined]) {
      expect(youDecideLaterInputsSchema.safeParse({ researchMenu: { ...youDecide.researchMenu, person_answered } })
        .success, String(person_answered)).toBe(false);
    }
    // The rule for the person's answer, the call's own line and next_step each say it.
    const lines = planResearchText(result, new Set(), false, OPEN_TARGET, youDecide).split("\n");
    expect(lines.at(-2)).toBe(RULE_HEAD + DECLARED + RULE_TAIL);
    expect(lines.at(-1)).toBe(ONLY_ONCE + REPLACING + INSIDE + JSON.stringify(youDecide));
    expect(youDecideLine(youDecide)).toBe(lines.at(-1));
    expect(planNextStep(result)).toBe(STEP_DECLARED);
    for (const gone of AS_THEY_ARE) expect(lines.join("\n") + planNextStep(result)).not.toContain(gone);
    // An ask with nothing recommended, or for a research target that is not the registered one, hands over no call:
    // its rule and next_step still say the person's allocation goes with the declaration.
    const detail = planned(open({ tasks: [OPEN_TASKS[2]!] }));
    expect(youDecideLaterInputs(open({ tasks: [OPEN_TASKS[2]!] }), detail)).toBeUndefined();
    expect(planResearchText(detail, new Set(), false, OPEN_TARGET).split("\n").at(-1)).toContain(
      `as a list of {task, minutes}${DECLARED}; for "you decide", or a reply that leaves the choice to you such as ` +
      "\"continue\", no more research: check the answer with finalize_research and give it.");
    expect(planNextStep(detail)).toBe(`${ASK_NOW}${ASK_STEP}or, for "you decide", do no more research: check the ` +
      `answer with finalize_research and give it.${SEND_ONLY_ONCE} If the reply asks for another research style, ` +
      "set it first with action set_research_steering (later_inputs.researchSteering with style guided, balanced " +
      "or autonomous), then call plan_research again.");
    const other = planResearch(plan, DEFAULT_RESEARCH_STEERING, { matches: false, minutesSince: 2 });
    expect(youDecideLaterInputs(plan, other)).toBeUndefined();
    expect(planResearchText(other, new Set(), false, OPEN_TARGET).split("\n").at(-1)).toContain(
      `as a list of {task, minutes}${DECLARED}; for "you decide", or a reply that leaves the choice to you such as ` +
      "\"continue\", the recommended allocation, with person_answered true too.");
    // There the correction for the research target comes first (13 Nov 2026, below), then the ask.
    expect(planNextStep(other)).toBe(`${TARGET_NOT_REGISTERED} ${ASK_NOW}${ASK_STEP}(for "you decide", the ` +
      `recommended one).${SEND_ONLY_ONCE} ${STYLE_REPLY}`);
  });

  async function session(subject: string, dev: boolean) {
    const { service, connect } = await start();
    await service.acceptFreeContributor(subject, agreement);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", dev ? service.accountKeyForSubject(subject) : "");
    const manage = await connect("/mcp", subject);
    const registered = await manage({ action: "register_plain_answer", plainAnswer: { researchTarget: OPEN_TARGET,
      text: "Gargling warm salt water may ease a sore throat a little. It does not shorten it much.",
      claims: ["Gargling warm salt water may ease a sore throat a little."] } });
    const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
    return { service, manage, receipt,
      plan: async (researchMenu: Record<string, unknown>) =>
        await manage({ action: "plan_research", later_inputs: { researchMenu } }) };
  }
  type Planned = { ok: boolean; researchMenu: { next: string; menu_digest: string; recommended: unknown[];
    allocation_not_used?: true }; problems?: string[]; next_step: string;
    you_decide_later_inputs?: { researchMenu: Record<string, unknown> } };
  type Refused = { ok: boolean; error: { code: string }; problems: string[];
    corrected_later_inputs: { researchMenu: Record<string, unknown> } };
  // Every account gets the same stop, the same words and the same placeholder. A dev account's short menu names its
  // question, which the ask then puts to the person; any other account's may give the yes or no, as before.
  const ACCOUNTS = [
    ["auth0|person", false, { steering_could_help: true }, { steering_could_help: false }, STEP_DECLARED],
    ["auth0|dev", true, { steering_choice: QUESTION }, { steering_choice: "none" }, STEP_NAMED],
  ] as const;

  // Greptile's review of this change (13 Nov 2026, P2): a reply that answers the named question and gives no
  // allocation ("the difference", to "do you mean either medicine or the difference?") had no way forward. The rule
  // forbids an allocation the person did not give, and the declaration alone is no answer to the menu.
  it("takes a reply that only answers the named question as leaving the allocation to the AI", async () => {
    const { plan, receipt } = await session("auth0|dev", true);
    const menu = { research_target: OPEN_TARGET, plain_answer_receipt: receipt, steering_choice: QUESTION,
      tasks: OPEN_TASKS };
    const first = await plan(menu);
    const asked = first.structuredContent as Planned;
    expect(asked).toMatchObject({ ok: true, researchMenu: { next: "ask", steering_choice: QUESTION } });
    // The words, in next_step and in the rule for the person's answer, which a later turn reads.
    const LEAVES = "A reply that answers it and gives no allocation leaves the allocation to you, as \"you decide\" " +
      "does.";
    expect(NAMED_ANSWER_STEERS.endsWith(` ${LEAVES}`)).toBe(true);
    expect(asked.next_step.endsWith(` ${NAMED_ANSWER_STEERS} ${STYLE_REPLY}`)).toBe(true);
    expect(first.content[0]!.text.split("\n").at(-2)).toContain(`the call on the next line. ${NAMED_ANSWER_STEERS} ` +
      "If the reply changes the question, ");
    // Why they are needed: the declaration with no allocation is no answer to the menu, so the same menu asks
    // again, with the same question.
    const alone = (await plan({ ...menu, person_answered: true, menu_digest: asked.researchMenu.menu_digest }))
      .structuredContent as Planned;
    expect(alone).toMatchObject({ ok: true, researchMenu: { next: "ask", steering_choice: QUESTION } });
    // The way forward they name: the handed-over call, declared the person's, goes on at the first call.
    const went = (await plan({ ...asked.you_decide_later_inputs!.researchMenu, person_answered: true }))
      .structuredContent as Planned;
    expect(went).toMatchObject({ ok: true, researchMenu: { next: "go_on", recommended: OWN } });
    expect(went.researchMenu).not.toHaveProperty("allocation_not_used");
    expect(went.researchMenu).not.toHaveProperty("steering_choice");
    expect(went.next_step).toMatch(/^Do the recommended tasks now, in order, /u);
    // A menu that named no question says nothing of it.
    const { plan: other, receipt: otherReceipt } = await session("auth0|person", false);
    const open = await other({ research_target: OPEN_TARGET, plain_answer_receipt: otherReceipt,
      steering_could_help: true, tasks: OPEN_TASKS });
    expect(text(open) + JSON.stringify(open.structuredContent)).not.toContain("the question you named");
  });

  it("asks again when the handed-over call comes back without the person's answer, and goes on once it is declared",
    async () => {
      for (const [subject, dev, steerable, , step] of ACCOUNTS) {
        const { manage, plan, receipt } = await session(subject, dev);
        const menu = { research_target: OPEN_TARGET, plain_answer_receipt: receipt, ...steerable, tasks: OPEN_TASKS };
        const first = await plan(menu);
        expect(first.isError, subject).not.toBe(true);
        const asked = first.structuredContent as Planned;
        expect(asked, subject).toMatchObject({ ok: true, researchMenu: { next: "ask", recommended: OWN } });
        expect(asked.researchMenu).not.toHaveProperty("allocation_not_used");
        expect(asked).not.toHaveProperty("problems");
        // The handed-over call: the same menu with its judgment, AskRigor's recommended allocation, and the
        // placeholder where the AI says whether the person has answered.
        const youDecide = asked.you_decide_later_inputs!;
        expect(youDecide, subject).toEqual({ researchMenu: { ...menu, allocation: OWN,
          person_answered: "<true|false>", menu_digest: asked.researchMenu.menu_digest } });
        const lines = first.content[0]!.text.split("\n");
        // A menu that named a question (the dev account's) also says what the person's answer to it does.
        expect(lines.at(-2), subject).toBe(RULE_HEAD + DECLARED + (dev
          ? RULE_TAIL.replace("on the next line. If the reply", `on the next line. ${NAMED_ANSWER_STEERS} If the reply`)
          : RULE_TAIL));
        expect(lines.at(-1), subject).toBe(ONLY_ONCE + REPLACING + INSIDE + JSON.stringify(youDecide));
        expect(asked.next_step, subject).toBe(step);
        for (const gone of AS_THEY_ARE) expect(text(first) + JSON.stringify(asked), subject).not.toContain(gone);
        // Round 3: the AI sends that call itself, in the turn of the ask. As it is, with false, without the field,
        // or with an allocation of its own, the result is the ask again, not a refusal and not a call to correct:
        // the stop first, AskRigor's own recommendation, and the same call handed over, its placeholder in place.
        const { person_answered: placeholder, ...without } = youDecide.researchMenu;
        expect(placeholder).toBe("<true|false>");
        for (const [name, researchMenu] of [
          ["as it is", youDecide.researchMenu],
          ["with false", { ...youDecide.researchMenu, person_answered: false }],
          ["with the word false", { ...youDecide.researchMenu, person_answered: "false" }],
          ["without the field", without],
          ["its own allocation", { ...without, allocation: THEIRS }],
        ] as const) {
          const again = await plan(researchMenu);
          expect(again.isError, `${subject} ${name}`).not.toBe(true);
          const structured = again.structuredContent as Planned;
          expect(structured, `${subject} ${name}`).toMatchObject({ ok: true, researchMenu: { next: "ask",
            allocation_not_used: true, recommended: OWN }, problems: [NOT_USED_PROBLEM] });
          expect(structured, name).not.toHaveProperty("error");
          expect(structured, name).not.toHaveProperty("corrected_later_inputs");
          const said = again.content[0]!.text.split("\n");
          expect(said[0], `${subject} ${name}`).toBe(STOP);
          expect(said[1], name).toMatch(new RegExp("^This person's research style asks first when their choices " +
            "could steer the research, as they could here\\. Ask now, before any of these tasks:", "u"));
          expect(said.at(-1), name).toBe(ONLY_ONCE + REPLACING + INSIDE + JSON.stringify(youDecide));
          expect(structured.next_step, `${subject} ${name}`).toBe(`${STOP} ${step}`);
          expect(structured.you_decide_later_inputs, name).toEqual(youDecide);
        }
        // A problem of the call's own comes after the stop, and before the ask.
        const past = await plan({ ...without, allocation: [{ task: 9, minutes: 3 }, { task: 1, minutes: 5 }] });
        expect((past.structuredContent as Planned).problems).toEqual([NOT_USED_PROBLEM,
          "Task numbers 9 are past the 3 tasks given; they were left out."]);
        expect(past.content[0]!.text.split("\n").slice(0, 2)).toEqual([STOP,
          "Task numbers 9 are past the 3 tasks given; they were left out."]);
        expect(past.content[0]!.text.split("\n")[2]).toMatch(/^This person's research style asks first when /u);
        // Sent with true once the person has replied "you decide", it goes on with that allocation; the word is
        // read as the value, as the placeholder invites.
        for (const answered of [true, "true"]) {
          const decided = await plan({ ...youDecide.researchMenu, person_answered: answered });
          expect(decided.isError, `${subject} ${String(answered)}`).not.toBe(true);
          const structured = decided.structuredContent as Planned;
          expect(structured, `${subject} ${String(answered)}`).toMatchObject({ ok: true, researchMenu: {
            next: "go_on", recommended: OWN }, next_step: GO_ON_STEP });
          expect(structured.researchMenu).not.toHaveProperty("allocation_not_used");
          expect(structured).not.toHaveProperty("problems");
          expect(structured).not.toHaveProperty("you_decide_later_inputs");
          expect(text(decided)).not.toContain("was not used");
        }
        // The person's own allocation, declared theirs, goes on with their minutes as given, inside the menu or
        // beside it; the way back after a stop says an allocation goes with the declaration.
        const theirs = await plan({ ...without, allocation: THEIRS, person_answered: true });
        expect(theirs.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on",
          recommended: THEIRS, recommended_minutes: [5.5, 5.5] } });
        expect(text(theirs), subject).toContain(AFTER_A_STOP);
        const beside = await manage({ action: "plan_research", later_inputs: { researchMenu: menu,
          allocation: THEIRS, person_answered: true } });
        expect(beside.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on",
          recommended: THEIRS }, problems: ["AskRigor read later_inputs.allocation as researchMenu.allocation, " +
            "later_inputs.person_answered as researchMenu.person_answered: the allocation and done list go inside " +
            "researchMenu."] });
        // Any other word is no declaration: the menu is refused as unreadable, and the call handed back keeps the
        // allocation and marks no place for person_answered.
        const worded = await plan({ ...youDecide.researchMenu, person_answered: "yes" });
        expect(worded.isError, subject).toBe(true);
        const refused = worded.structuredContent as Refused;
        expect(refused.problems[0]).toMatch(/^later_inputs\.researchMenu\.person_answered: /u);
        expect(refused.corrected_later_inputs.researchMenu).toMatchObject({ allocation: OWN });
        expect(refused.corrected_later_inputs.researchMenu).not.toHaveProperty("person_answered");
      }
    });

  it("goes on with AskRigor's own tasks, and says so, where the menu never waits for the person", async () => {
    for (const [subject, dev, steerable, notSteerable] of ACCOUNTS) {
      const { manage, plan } = await session(subject, dev);
      // A short menu the AI judged not steerable goes on; the allocation it carried is not the person's.
      const precise = await plan({ research_target: OPEN_TARGET, ...notSteerable, tasks: OPEN_TASKS,
        allocation: THEIRS });
      // Autonomous research never waits.
      await manage({ action: "set_research_steering", later_inputs: { researchSteering: { style: "autonomous" } } });
      const unasked = await plan({ research_target: OPEN_TARGET, ...steerable, tasks: OPEN_TASKS,
        allocation: THEIRS });
      // A dev account's menu says so with the word none, so its go-ahead has the reading said first (297c).
      for (const [result, step] of [[precise, dev ? `${GO_ON_STEP} ${READING_FIRST}` : GO_ON_STEP],
        [unasked, AUTONOMOUS_STEP]] as const) {
        expect(result.isError, subject).not.toBe(true);
        expect(result.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on",
          allocation_not_used: true, recommended: OWN }, problems: [NOT_USED_PROBLEM],
          next_step: `${OWN_TASKS} ${step}` });
        expect(result.structuredContent).not.toHaveProperty("you_decide_later_inputs");
        const said = result.content[0]!.text.split("\n");
        expect(said[0], subject).toBe(OWN_TASKS);
        expect(said[1]).toMatch(/^The menu to show the person, in their language, numbered as here/u);
        expect(said[1], subject).toContain(AFTER_A_STOP);
      }
      // Declared the person's, autonomous research keeps their allocation.
      const theirs = await plan({ research_target: OPEN_TARGET, ...steerable, tasks: OPEN_TASKS,
        allocation: THEIRS, person_answered: true });
      expect(theirs.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        recommended: THEIRS } });
      expect(theirs.structuredContent).not.toHaveProperty("researchMenu.allocation_not_used");
    }
  });

  it("still hands back a dev account's short menu that names no question, with or without an allocation not used",
    async () => {
      const { plan } = await session("auth0|dev", true);
      const unjudged = { research_target: OPEN_TARGET, tasks: OPEN_TASKS };
      for (const researchMenu of [unjudged, { ...unjudged, allocation: THEIRS },
        { ...unjudged, allocation: THEIRS, person_answered: false },
        { ...unjudged, steering_could_help: true, allocation: THEIRS }]) {
        const result = await plan(researchMenu);
        expect(result.isError, JSON.stringify(researchMenu)).toBe(true);
        const refused = result.structuredContent as Refused;
        expect(refused).toMatchObject({ ok: false, error: { code: "invalid_request" },
          problems: ["later_inputs.researchMenu.steering_choice: left out; name the one question you would ask " +
            "this person, or write none"] });
        expect(refused).not.toHaveProperty("researchMenu");
        // The call handed back is the AI's own, with the question's place marked and no place for person_answered.
        expect(refused.corrected_later_inputs).toEqual({ researchMenu: { ...researchMenu,
          steering_choice: MENU_PLACEHOLDERS.steering_choice } });
        expect(text(result)).toMatch(/^AskRigor planned nothing yet\. These tasks are short/u);
        expect(text(result)).not.toContain("was not used");
      }
      // The question given, the allocation is still not the person's: a named question asks again with the stop
      // first, and the word none goes on with AskRigor's own tasks.
      const steerable = await plan({ ...unjudged, steering_choice: QUESTION, allocation: THEIRS });
      expect(steerable.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
        allocation_not_used: true, recommended: OWN, steering_choice: QUESTION } });
      expect(steerable.content[0]!.text.split("\n")[0]).toBe(STOP);
      expect((steerable.structuredContent as Planned).next_step).toBe(`${STOP} ${STEP_NAMED}`);
      const precise = await plan({ ...unjudged, steering_choice: "none", allocation: THEIRS });
      expect(precise.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        allocation_not_used: true, recommended: OWN } });
      expect(precise.content[0]!.text.split("\n")[0]).toBe(OWN_TASKS);
      // Declared the person's, the allocation is their answer, which needs no question.
      const answered = await plan({ ...unjudged, allocation: THEIRS, person_answered: true });
      expect(answered.isError).not.toBe(true);
      expect(answered.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        recommended: THEIRS } });
      // Tasks past the 10 minutes ask whatever the judgment, so a menu that names no question is not handed back
      // for it when its allocation is not used: it is the ask again, with the stop first.
      const long = await plan({ research_target: OPEN_TARGET, tasks: [LONG_TASK],
        allocation: [{ task: 1, minutes: 3 }] });
      expect(long.isError).not.toBe(true);
      expect(long.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
        allocation_not_used: true, recommended: [{ task: 1, minutes: 11 }] }, problems: [NOT_USED_PROBLEM] });
      expect(long.content[0]!.text.split("\n")[0]).toBe(STOP);
      expect(text(long)).toContain("as they usually can (steering_could_help was left out)");
    });

  it("gives a dev account and any other the same result for the same menu", async () => {
    // One menu that needs nothing more on a dev account (it names its question), sent the same three ways to both:
    // first, then the handed-over call as it is, then with the person's answer declared.
    const results: string[][] = [];
    for (const [subject, dev] of ACCOUNTS) {
      const { plan } = await session(subject, dev);
      const menu = { research_target: OPEN_TARGET, steering_choice: QUESTION, tasks: OPEN_TASKS };
      const first = await plan(menu);
      const youDecide = (first.structuredContent as Planned).you_decide_later_inputs!;
      const copied = await plan(youDecide.researchMenu);
      const decided = await plan({ ...youDecide.researchMenu, person_answered: true });
      expect((copied.structuredContent as Planned).researchMenu, subject).toMatchObject({ next: "ask",
        allocation_not_used: true });
      expect((decided.structuredContent as Planned).researchMenu.next, subject).toBe("go_on");
      results.push([first, copied, decided].map((result) =>
        JSON.stringify([result.isError === true, result.content, result.structuredContent])));
    }
    expect(results[1]).toEqual(results[0]);
  });
});

// Greptile's review of 12 Nov 2026 (P1), reproduced by an independent audit on 13 Nov: when the menu's research target
// is not the one registered with the plain answer, the result's text carried the warning, but next_step only said to
// do the tasks and finalize, or to ask. An app that hands its model the structured content (ChatGPT's model reads it
// first, Claude Code reads only it) missed the correction, and the answer then ended without the comparison with the
// quick answer. These fixtures are invented.
describe("a research target that is not the registered one stops the go-ahead in next_step (13 Nov 2026)", () => {
  const NOT_REGISTERED = "This menu's research_target is not the one registered with the plain answer, so the answer " +
    "would end without the comparison with the quick answer. Before any research call, call action plan_research " +
    "again with the same menu but research_target word for word as register_plain_answer's result quoted it, and " +
    "give finalize_research the same words; or, if the question itself changed, register the plain answer again for " +
    "the new research target, with later_inputs.framing for it, and then plan again.";
  const NO_GO_AHEAD = "Do none of this menu's tasks before that: the go-ahead comes with that call's result.";
  const WARNING = "This research_target is not the one registered with the plain answer: give plan_research and " +
    "finalize_research the research target word for word as register_plain_answer's result quoted it, or the answer " +
    "ends without the comparison with the quick answer.";
  const autonomous: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" };
  const planned = (overrides: Partial<ResearchMenuInput>, matches: boolean,
    steering: ResearchSteering = DEFAULT_RESEARCH_STEERING) =>
    planResearch(menu({ plain_answer_receipt: "rr1~x", ...overrides }), steering, { matches, minutesSince: 3 });
  // Three menus that go on: a short one judged not steerable, autonomous research, and the person's own allocation.
  const GOING_ON: Array<[Partial<ResearchMenuInput>, ResearchSteering]> = [
    [{ tasks: [TASKS[3]!], steering_could_help: false }, DEFAULT_RESEARCH_STEERING],
    [{}, autonomous],
    [{ allocation: [{ task: 1, minutes: 5 }], person_answered: true }, DEFAULT_RESEARCH_STEERING],
  ];

  it("says the correction first in next_step: before the ask, and in place of the go-ahead", () => {
    for (const [overrides, steering] of GOING_ON) {
      const result = planned(overrides, false, steering);
      expect(result, JSON.stringify(overrides)).toMatchObject({ next: "go_on", target_matches_plain_answer: false });
      // No go-ahead: the tasks wait for the corrected call.
      expect(planNextStep(result), JSON.stringify(overrides)).toBe(`${NOT_REGISTERED} ${NO_GO_AHEAD}`);
      expect(planNextStep(result)).not.toContain("Do the recommended tasks now");
      // The registered target, or none checked: the go-ahead as it was.
      for (const same of [planned(overrides, true, steering),
        planResearch(menu(overrides), steering)]) {
        expect(planNextStep(same), JSON.stringify(overrides)).toMatch(/^Do the recommended tasks now[,;] /u);
        expect(planNextStep(same)).not.toContain("not the one registered");
      }
    }
    // A menu that asks: the correction first, then the ask, which hands over no "you decide" call for this target.
    const asked = planned({}, false);
    expect(asked).toMatchObject({ next: "ask", target_matches_plain_answer: false });
    expect(planNextStep(asked).startsWith(`${NOT_REGISTERED} Ask the person now and end your turn: show ` +
      "researchMenu.tasks as a numbered list")).toBe(true);
    expect(planNextStep(asked)).toContain("(for \"you decide\", the recommended one).");
    expect(planNextStep(asked)).not.toContain("Do none of this menu's tasks");
    expect(planNextStep(planned({}, true))).toMatch(/^Ask the person now and end your turn: /u);
    // The stop for an allocation not used still comes before everything else, then the correction, then the ask
    // or, for a menu that never waits, the tasks held back.
    const copied = planned({ allocation: [{ task: 1, minutes: 5 }] }, false);
    expect(copied).toMatchObject({ next: "ask", allocation_not_used: true, target_matches_plain_answer: false });
    expect(planNextStep(copied).startsWith(`${allocationNotUsedStop(copied)} ${NOT_REGISTERED} Ask the person now ` +
      "and end your turn: ")).toBe(true);
    const unasked = planned({ allocation: [{ task: 1, minutes: 5 }] }, false, autonomous);
    expect(unasked).toMatchObject({ next: "go_on", allocation_not_used: true });
    expect(planNextStep(unasked)).toBe(`${allocationNotUsedStop(unasked)} ${NOT_REGISTERED} ${NO_GO_AHEAD}`);
    // The text of a menu that asks keeps its own warning: its rule for the person's answer names the registered
    // target.
    expect(planResearchText(asked, new Set(), false, TARGET).split("\n")[0]).toBe(WARNING);
    expect(TARGET_NOT_REGISTERED).toBe(NOT_REGISTERED);
    // The text of a menu that would go on says what next_step says, and gives no go-ahead either: until 13 Nov 2026
    // it gave the warning and then "Go on now", so the text and next_step of one result disagreed.
    for (const [overrides, steering] of GOING_ON) {
      const held = planResearchText(planned(overrides, false, steering), new Set(), false, TARGET);
      expect(held, JSON.stringify(overrides)).toContain(` ${NOT_REGISTERED} `);
      expect(held.endsWith(` ${NO_GO_AHEAD}`), JSON.stringify(overrides)).toBe(true);
      expect(held).not.toContain(WARNING);
      for (const goAhead of ["Go on now", "go on with the recommended tasks now", "If the person stops you"]) {
        expect(held, goAhead).not.toContain(goAhead);
      }
      // The registered target: the go-ahead as it was.
      const same = planResearchText(planned(overrides, true, steering), new Set(), false, TARGET);
      expect(same).toMatch(/Go on now: |go on with the recommended tasks now\./u);
      expect(same).not.toContain("not the one registered");
      expect(same).not.toContain(NO_GO_AHEAD);
    }
  });

  async function session(subject: string, dev: boolean, surface: "/mcp" | "/mcp/claude" = "/mcp") {
    const { service, connect } = await start();
    await service.acceptFreeContributor(subject, agreement);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", dev ? service.accountKeyForSubject(subject) : "");
    const manage = await connect(surface, subject);
    const registered = await manage({ action: "register_plain_answer", plainAnswer: PLAIN });
    const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
    return { manage, receipt, plan: async (researchMenu: Record<string, unknown>) =>
      await manage({ action: "plan_research", later_inputs: { researchMenu } }) };
  }
  type Planned = { ok: boolean; researchMenu: { next: string; target_matches_plain_answer?: boolean };
    next_step: string; you_decide_later_inputs?: unknown };
  const REWORDED = "Sodium potassium ratio and blood pressure";

  it("gives it through the connector, for a dev account and any other, on ChatGPT's surface and Claude's",
    async () => {
      for (const [subject, dev, surface] of [["auth0|person", false, "/mcp"], ["auth0|dev", true, "/mcp"],
        ["auth0|dev-claude", true, "/mcp/claude"]] as const) {
        const { plan, receipt } = await session(subject, dev, surface);
        // A short menu that says no question is left to the person goes on; with the reworded target it must not.
        // It says so both ways: the yes or no any account may give, and the word none a dev account's menu needs.
        const precise = { research_target: REWORDED, plain_answer_receipt: receipt, steering_could_help: false,
          steering_choice: "none", tasks: [TASKS[3]!] };
        const goingOn = await plan(precise);
        expect(goingOn.isError, subject).not.toBe(true);
        const structured = goingOn.structuredContent as Planned;
        expect(structured, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on",
          target_matches_plain_answer: false }, next_step: `${NOT_REGISTERED} ${NO_GO_AHEAD}` });
        // The text says the same, and gives no go-ahead either.
        expect(text(goingOn), subject).toContain(`${NOT_REGISTERED} ${NO_GO_AHEAD}`);
        expect(text(goingOn), subject).not.toContain("Go on now");
        expect(text(goingOn), subject).not.toContain(WARNING);
        // The call the correction asks for: the same menu with the registered target gets the go-ahead.
        const corrected = await plan({ ...precise, research_target: TARGET });
        expect(corrected.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on",
          target_matches_plain_answer: true, say_reading_first: true }, next_step: "Do the recommended tasks now, " +
          "in order, each within its minutes; then check the answer with finalize_research and give it in this " +
          `turn. ${READING_FIRST}` });
        // Held back, the menu says nothing of what follows a go-ahead.
        expect(structured.researchMenu, subject).not.toHaveProperty("say_reading_first");
        expect(text(goingOn), subject).not.toContain(READING_FIRST);
        // A menu that asks (its tasks pass the 10 minutes) says the correction before the ask.
        const asked = await plan({ research_target: REWORDED, plain_answer_receipt: receipt, tasks: TASKS });
        expect(asked.isError, subject).not.toBe(true);
        const asking = asked.structuredContent as Planned;
        expect(asking, subject).toMatchObject({ ok: true, researchMenu: { next: "ask",
          target_matches_plain_answer: false } });
        expect(asking.next_step.startsWith(`${NOT_REGISTERED} Ask the person now and end your turn: `), subject)
          .toBe(true);
        expect(asking, subject).not.toHaveProperty("you_decide_later_inputs");
        expect(asked.content[0]!.text.split("\n")[0], subject).toBe(WARNING);
      }
    });
});

// Owner answer 297c (13 Nov 2026). Round 5 of the owner's ChatGPT runs (build ea3a9283): two open questions went
// straight to a checked answer, and in both the AI's first call already carried steering_could_help false, sent before
// any result had asked it for a question; the refusal then got the word none. So a dev account's menu refused for its
// shape comes back with the question's place marked, and a menu that names none has the answer say its reading first.
//
// Owner answer 298b (13 Nov 2026). The third part of 297c asked a dev account's AI for the question where it first
// learns the menu, in register_plain_answer's result. In round 6 (build 2e231949) the control, one figure of one named
// trial, then got a question in place of its answer: its first call already carried one, and asked why, the AI said
// "none would have been the better choice". That part is taken back: register_plain_answer gives a dev account what
// it gives every account.
describe("a dev account's refused menu marks the question's place, and an answer after none says its reading (297c, 298b)", () => {
  const PRECISE_TARGET = "How often loose stools were recorded in one named trial of two fever medicines in children";
  const PRECISE_TASKS: ResearchMenuInput["tasks"] = [
    { task: "Read the trial's adverse-event table in full", kind: "full_text", could_change: "conclusion" },
    { task: "Audit how the trial recorded adverse events", kind: "method_audit", could_change: "confidence" },
  ];
  const QUESTION = "Do you mean loose stools on either medicine, or the difference between the two?";
  const PLACEHOLDER = "<the one question you would ask this person, or none>";
  const GO_ON_STEP = "Do the recommended tasks now, in order, each within its minutes; then check the answer with " +
    "finalize_research and give it in this turn.";
  const GO_AHEAD = "Go on now: do these tasks in this order, each within its minutes, showing the menu as what you " +
    "are doing; then check the answer with finalize_research and give it in this turn.";
  const short = (overrides: Partial<ResearchMenuInput> = {}): ResearchMenuInput =>
    ({ research_target: PRECISE_TARGET, tasks: PRECISE_TASKS, ...overrides });
  const FRAMINGS = [undefined,
    { likely_question: "Does it help?" },
    { likely_question: "Does it help?", premise_doubts: ["The premise may be inverted"] },
    { likely_question: "Does it help?", redirecting_questions: ["Which form do you use?"] },
    { likely_question: "Does it help?", premise_doubts: ["The premise may be inverted"],
      redirecting_questions: ["Which form do you use?"] }];
  const STYLES = ["guided", "balanced", "autonomous"] as const;
  type Refused = { ok: boolean; error: { code: string; message: string }; problems: string[];
    corrected_later_inputs: { researchMenu: Record<string, unknown> & { tasks: Array<Record<string, unknown>> } } };

  async function session(subject: string, dev: boolean, surface: "/mcp" | "/mcp/claude" = "/mcp") {
    const { service, connect } = await start();
    await service.acceptFreeContributor(subject, agreement);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", dev ? service.accountKeyForSubject(subject) : "");
    const manage = await connect(surface, subject);
    return { manage, plan: async (researchMenu: unknown) =>
      await manage({ action: "plan_research", later_inputs: { researchMenu } }) };
  }

  it("asks no account for the question at the screen: the shape and the next step name no steering_choice", () => {
    for (const style of STYLES) {
      const steering = { ...DEFAULT_RESEARCH_STEERING, style };
      for (const framing of FRAMINGS) {
        // The screen's text gives the menu's shape once, with the yes or no, and neither names the question.
        const guidance = framingGuidance(steering, framing);
        expect(guidance.split(RESEARCH_MENU_SHAPE)).toHaveLength(2);
        expect(guidance).not.toContain("steering_choice");
        expect(framingNextStep(steering, framing)).not.toContain("steering_choice");
        expect(framingNextStep(steering, framing).endsWith("screen and call action plan_research.") ||
          framingNextStep(steering, framing).endsWith("its result says whether to ask the person first.")).toBe(true);
      }
    }
    expect(RESEARCH_MENU_SHAPE).toContain("in a few sentences; steering_could_help, true when a choice the person " +
      "could make");
    expect(RESEARCH_MENU_SHAPE).not.toContain("steering_choice");
  });

  it("keeps the shape every account is given, to the letter", async () => {
    // The shape as it was on the build before 297c (ea3a9283), by its SHA-256.
    const { createHash } = await import("node:crypto");
    expect(createHash("sha256").update(RESEARCH_MENU_SHAPE, "utf8").digest("hex"))
      .toBe("4f4ce6e9576c57aab4499663d433543993060b85df0fd6514a18d5949f0c0c55");
  });

  it("gives a dev account register_plain_answer's words as every account gets them, on both surfaces", async () => {
    for (const [subject, dev, surface] of [["auth0|person", false, "/mcp"], ["auth0|dev", true, "/mcp"],
      ["auth0|dev-claude", true, "/mcp/claude"], ["auth0|person-claude", false, "/mcp/claude"]] as const) {
      const { manage } = await session(subject, dev, surface);
      for (const framing of [undefined, FRAMINGS[1]!, FRAMINGS[3]!]) {
        const registered = await manage({ action: "register_plain_answer", plainAnswer: PLAIN,
          ...(framing === undefined ? {} : { later_inputs: { framing } }) });
        expect(registered.isError, subject).not.toBe(true);
        expect(registered.content[0]!.text.endsWith(framingGuidance(DEFAULT_RESEARCH_STEERING, framing)), subject)
          .toBe(true);
        expect(registered.structuredContent, subject).toMatchObject({
          next_step: framingNextStep(DEFAULT_RESEARCH_STEERING, framing) });
        // No account is asked for the question before its first menu (owner answer 298b).
        expect(text(registered), subject).not.toContain("steering_choice");
        expect(text(registered), subject).not.toContain(STEERING_CHOICE);
        expect(JSON.stringify(registered.structuredContent), subject).not.toContain("steering_choice");
        expect(text(registered).includes("steering_could_help"), subject).toBe(true);
      }
    }
  });

  it("hands a dev account's unreadable menu back with the question's place marked, so the next call is planned",
    async () => {
      // What ChatGPT sent first in every run of rounds 4 and 5: its own guess at the menu, with no tasks.
      const guessed = { researchTarget: PRECISE_TARGET, screening: { searches: 3 }, steering_could_help: false };
      const asText = { research_target: PRECISE_TARGET, tasks: PRECISE_TASKS.map(({ task }) => task) };
      const dev = await session("auth0|dev", true);
      for (const menu of [guessed, asText]) {
        const first = await dev.plan(menu);
        expect(first.isError).toBe(true);
        const refused = first.structuredContent as Refused;
        expect(refused).toMatchObject({ ok: false, error: { code: "invalid_request" } });
        expect(refused.corrected_later_inputs.researchMenu.steering_choice).toBe(PLACEHOLDER);
        // The text and the message say what replaces the placeholder, with the test.
        const words = `, and ${PLACEHOLDER} with ${STEERING_CHOICE}`;
        expect(first.content[0]!.text).toContain(`or only detail)${words}; the allocation, once the person gives one`);
        expect(refused.error.message).toBe("plan_research could not read later_inputs.researchMenu: call it again " +
          `with corrected_later_inputs, after replacing each <...> with one of the values it lists${words}.`);
        // Filled in, with the word none or a question, the example is planned at once: one refused call, not two.
        const filled = (steering_choice: string) => ({ ...refused.corrected_later_inputs.researchMenu, steering_choice,
          tasks: PRECISE_TASKS });
        const none = await dev.plan(filled("none"));
        expect(none.isError, text(none)).not.toBe(true);
        expect(none.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
          say_reading_first: true } });
        const named = await dev.plan(filled(QUESTION));
        expect(named.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
          steering_choice: QUESTION } });
        // The placeholder left in is read as not given, so the call comes back for the question alone.
        const unchanged = await dev.plan({ ...refused.corrected_later_inputs.researchMenu, tasks: PRECISE_TASKS });
        expect(unchanged.isError).toBe(true);
        expect((unchanged.structuredContent as Refused).problems).toEqual(["later_inputs.researchMenu." +
          "steering_choice: left out; name the one question you would ask this person, or write none"]);
      }
      // A question the guessed menu already named is kept, with no placeholder.
      const kept = (await dev.plan({ ...asText, steering_choice: QUESTION })).structuredContent as Refused;
      expect(kept.corrected_later_inputs.researchMenu.steering_choice).toBe(QUESTION);
      expect(kept.error.message).not.toContain(PLACEHOLDER);
      // Any other account's refusal is as it was: no steering_choice in the example, the text or the message.
      const person = await session("auth0|person", false);
      for (const menu of [guessed, asText]) {
        const first = await person.plan(menu);
        const refused = first.structuredContent as Refused;
        expect(refused.corrected_later_inputs.researchMenu).not.toHaveProperty("steering_choice");
        expect(first.content[0]!.text).not.toContain("steering_choice");
        expect(first.content[0]!.text).toContain("or only detail); the allocation, once the person gives one");
        expect(refused.error.message).toBe("plan_research could not read later_inputs.researchMenu: call it again " +
          "with corrected_later_inputs, after replacing each <...> with one of the values it lists.");
      }
      expect(choicePlaceholderWords(correctedMenu(asText))).toBe("");
      expect(choicePlaceholderWords(correctedMenu({ ...asText, steering_choice: QUESTION }, true))).toBe("");
    });

  it("has the answer say its reading first when a menu names no question and goes on", () => {
    const autonomous: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" };
    const none = planResearch(short({ steering_choice: "none" }), DEFAULT_RESEARCH_STEERING);
    expect(none).toMatchObject({ next: "go_on", say_reading_first: true });
    // The text says it right after the go-ahead, and next_step at its end.
    expect(planResearchText(none, new Set(), false, PRECISE_TARGET)).toContain(`${GO_AHEAD} ${READING_FIRST} `);
    expect(planNextStep(none)).toBe(`${GO_ON_STEP} ${READING_FIRST}`);
    expect(READING_FIRST).toBe("You named no question for this person, so before the answer itself say in one line, " +
      "in their language, how you read their question: which meaning, comparison or situation you took it to be " +
      "about. A reading they did not mean then shows at once.");
    // Autonomous research that names none says it too.
    const unasked = planResearch(short({ steering_choice: "none" }), autonomous);
    expect(unasked).toMatchObject({ next: "go_on", say_reading_first: true });
    expect(planResearchText(unasked, new Set(), false, PRECISE_TARGET)).toContain(` ${READING_FIRST} `);
    expect(planNextStep(unasked).endsWith(` ${READING_FIRST}`)).toBe(true);
    // The person's own allocation on a menu that named none: the research goes on, and the answer says its reading.
    expect(planResearch(short({ steering_choice: "none", allocation: [{ task: 1, minutes: 2 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING)).toMatchObject({ next: "go_on", say_reading_first: true });
    // Not with a named question, the yes or no alone, or neither; not while the menu asks; and not while its
    // research target holds the tasks back.
    for (const [plan, steering, plain] of [
      [short({ steering_choice: QUESTION }), DEFAULT_RESEARCH_STEERING, undefined],
      [short({ steering_choice: QUESTION }), autonomous, undefined],
      [short({ steering_could_help: false }), DEFAULT_RESEARCH_STEERING, undefined],
      [short(), autonomous, undefined],
      [short({ steering_choice: "none" }), { ...DEFAULT_RESEARCH_STEERING, style: "guided" }, undefined],
      [short({ steering_choice: "none", done: [1] }), DEFAULT_RESEARCH_STEERING, undefined],
      [short({ steering_choice: "none" }), DEFAULT_RESEARCH_STEERING, { matches: false, minutesSince: 2 }],
    ] as const) {
      const result = planResearch(plan, steering, plain);
      expect(result, JSON.stringify(plan)).not.toHaveProperty("say_reading_first");
      expect(planResearchText(result, new Set(plan.done ?? []), false, PRECISE_TARGET), JSON.stringify(plan))
        .not.toContain(READING_FIRST);
      expect(planNextStep(result), JSON.stringify(plan)).not.toContain(READING_FIRST);
    }
    // With the registered target, the same menu gets the go-ahead and the sentence.
    expect(planResearch(short({ steering_choice: "none" }), DEFAULT_RESEARCH_STEERING,
      { matches: true, minutesSince: 2 })).toMatchObject({ next: "go_on", say_reading_first: true });
  });

  it("says it through the connector, on ChatGPT's surface and Claude's, for any account whose menu names none",
    async () => {
      for (const [subject, dev, surface] of [["auth0|dev", true, "/mcp"], ["auth0|dev-claude", true, "/mcp/claude"],
        ["auth0|person", false, "/mcp"]] as const) {
        const { plan } = await session(subject, dev, surface);
        const none = await plan(short({ steering_choice: "none" }));
        expect(none.isError, subject).not.toBe(true);
        expect(none.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on",
          say_reading_first: true }, next_step: `${GO_ON_STEP} ${READING_FIRST}` });
        expect(text(none), subject).toContain(`${GO_AHEAD} ${READING_FIRST} `);
        const named = await plan(short({ steering_choice: QUESTION }));
        expect(named.structuredContent, subject).not.toHaveProperty("researchMenu.say_reading_first");
        expect(text(named), subject).not.toContain(READING_FIRST);
      }
    });
});

describe("the light lane and the step aside of AskRigor's own plan (owner answer 302, 14 Nov 2026)", () => {
  const LOOKUP_TARGET = "The figure one named trial reports for its main outcome";
  const READ = { task: "Find the trial's main result: read its results table in full", kind: "full_text" as const,
    could_change: "conclusion" as const };
  const RECORD = { task: "Check the trial's registered outcome in its registry record", kind: "trial_registry" as const,
    could_change: "confidence" as const };
  const AUDIT = { task: "Audit how the trial measured its outcome", kind: "method_audit" as const,
    could_change: "confidence" as const };
  const light = (overrides: Partial<ResearchMenuInput> = {}): ResearchMenuInput =>
    ({ research_target: LOOKUP_TARGET, steering_choice: "none", tasks: [READ], lane: "light", ...overrides });
  const autonomous: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" };
  const guided: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style: "guided" };
  // Sentences of the usual go-ahead that are not exported on their own.
  const TASK_PROGRESS_WORDS = "Before each task, say in one line what you will read, how deep, and why.";
  const NEW_FORK_WORDS = "A new fork that could change the conclusion comes back to the person through the menu";
  const LEFT_OUT = [PEOPLE_TASK_MISSING, READING_FIRST, TASK_PROGRESS_WORDS, NEW_FORK_WORDS, WORDS_ARE_NOT_SIZES,
    "Go on now:", "The person chose autonomous research", "If the person stops you or changes direction",
    "Leads between people's reports and studies", adjustmentGuidance("flagged"), adjustmentGuidance("all")];

  it("words the light look-up's go-ahead exactly as the owner's answer was given", () => {
    expect(LIGHT_LOOKUP).toBe("This is a light look-up, as AskRigor's own plan found: one fact that one named source " +
      "states. Do only what this menu lists: open the source, find the line or table row that states what the person " +
      "asked, and quote it in the answer with where it stands (table, section or page). No method audit, no forum or " +
      "community search, no second literature search and no findings card. If the source cannot be opened in full, or " +
      "does not state it, say so in the answer and give what its abstract or record states, named as that. Then check " +
      "the answer once with finalize_research (every research_receipt, the draft, and the research target word for word " +
      "as registered) and give it in this turn: a passing check's notes are advice on the answer's wording, not a reason " +
      "for more research or a second check. Start the answer with this line, in the person's language: \"AskRigor light " +
      "look-up: the source was opened and the line quoted; nothing else was checked. Say 'research it fully' for more.\" " +
      "If the person then asks for more, register the plain answer again with later_inputs.asked holding their question " +
      "and that request: AskRigor then plans the full research.");
  });

  it("goes on with the light look-up in the text and in next_step, and nothing that asks for more", () => {
    for (const [steering, tasks] of [[DEFAULT_RESEARCH_STEERING, [READ]], [DEFAULT_RESEARCH_STEERING, [READ, RECORD]],
      [autonomous, [READ]], [autonomous, [READ, RECORD]]] as const) {
      const label = `${steering.style} ${tasks.length}`;
      const result = planResearch(light({ tasks: [...tasks] }), steering);
      expect(result, label).toMatchObject({ next: "go_on", lane: "light" });
      // The plan named no question, but a light look-up's answer starts with its own line instead of the reading.
      expect(result, label).not.toHaveProperty("say_reading_first");
      const words = planResearchText(result, new Set(), false, LOOKUP_TARGET);
      // The menu lines as usual, then the light look-up, which ends the text.
      expect(words, label).toContain(`1. ${READ.task}: could change the conclusion; about 1 to 3 min.`);
      expect(words.endsWith(` ${LIGHT_LOOKUP}`), label).toBe(true);
      for (const sentence of LEFT_OUT) expect(words, `${label}: ${sentence.slice(0, 40)}`).not.toContain(sentence);
      expect(planNextStep(result), label).toBe(LIGHT_LOOKUP);
    }
    // The time since the plain answer stays, before it.
    const registered = planResearch(light(), DEFAULT_RESEARCH_STEERING, { matches: true, minutesSince: 2 });
    expect(planResearchText(registered, new Set(), false, LOOKUP_TARGET))
      .toContain(`About 2 minutes have passed since the plain answer was registered. ${LIGHT_LOOKUP}`);
    // An allocation not used is still said first, as a stop.
    const notUsed = planResearch(light({ allocation: [{ task: 1, minutes: 2 }] }), DEFAULT_RESEARCH_STEERING);
    expect(notUsed).toMatchObject({ next: "go_on", lane: "light", allocation_not_used: true });
    expect(planNextStep(notUsed)).toBe(`${allocationNotUsedStop(notUsed)} ${LIGHT_LOOKUP}`);
    expect(planResearchText(notUsed, new Set(), true, LOOKUP_TARGET).startsWith(allocationNotUsedStop(notUsed)!))
      .toBe(true);
  });

  it("gives no light go-ahead when the person gave the light task no time", () => {
    // The person answered the menu with nothing for its task: nothing is recommended, so nothing says to open and
    // quote the source, and the result is the one any menu with nothing to do gets.
    const declined = planResearch(light({ allocation: [{ task: 1, minutes: 0 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING);
    expect(declined).toMatchObject({ next: "go_on", recommended: [] });
    expect(declined).not.toHaveProperty("lane");
    expect(planNextStep(declined)).not.toContain(LIGHT_LOOKUP);
    expect(planResearchText(declined, new Set(), true, LOOKUP_TARGET)).not.toContain(LIGHT_LOOKUP);
    const plain = planResearch(light({ lane: undefined, allocation: [{ task: 1, minutes: 0 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING);
    expect(planNextStep(declined)).toBe(planNextStep(plain));
    expect(planResearchText(declined, new Set(), true, LOOKUP_TARGET))
      .toBe(planResearchText(plain, new Set(), true, LOOKUP_TARGET));
    // With time for the task, the person's answer goes on as the light look-up.
    const taken = planResearch(light({ allocation: [{ task: 1, minutes: 2 }], person_answered: true }),
      DEFAULT_RESEARCH_STEERING);
    expect(taken).toMatchObject({ next: "go_on", lane: "light", recommended: [{ task: 1, minutes: 2 }] });
    expect(planNextStep(taken)).toBe(LIGHT_LOOKUP);
  });

  it("recommends a light look-up's task whatever it was said to change", () => {
    // The look-up's task is the whole look-up: marked as detail, it would otherwise leave nothing to do.
    const detail = planResearch(light({ tasks: [{ ...READ, could_change: "detail" }] }), DEFAULT_RESEARCH_STEERING);
    expect(detail).toMatchObject({ next: "go_on", lane: "light", recommended: [{ task: 1, minutes: 2 }] });
    expect(planResearchText(detail, new Set(), false, LOOKUP_TARGET)).not.toContain("Nothing more is recommended");
    // The same task on a menu that is not light is still left out of the recommendation.
    const research = planResearch(light({ lane: undefined, tasks: [{ ...READ, could_change: "detail" }] }),
      DEFAULT_RESEARCH_STEERING);
    expect(research.recommended).toEqual([]);
  });

  it("holds a light menu with another research target back as any menu, with the warning and no go-ahead", () => {
    const held = planResearch(light(), DEFAULT_RESEARCH_STEERING, { matches: false, minutesSince: 2 });
    expect(held).toMatchObject({ next: "go_on", lane: "light", target_matches_plain_answer: false });
    const words = planResearchText(held, new Set(), false, LOOKUP_TARGET);
    expect(words).toContain(TARGET_NOT_REGISTERED);
    expect(words).not.toContain(LIGHT_LOOKUP);
    expect(words).not.toContain(PEOPLE_TASK_MISSING);
    expect(planNextStep(held)).toBe(`${TARGET_NOT_REGISTERED} Do none of this menu's tasks before that: the ` +
      "go-ahead comes with that call's result.");
  });

  it("is not light with three tasks, a method audit, or no lane, and those menus get the usual words", () => {
    for (const menu of [light({ tasks: [READ, RECORD, READ] }), light({ tasks: [AUDIT] }), light({ tasks: [READ, AUDIT] }),
      light({ lane: undefined })]) {
      expect(isLightLane(menu), JSON.stringify(menu.tasks)).toBe(false);
      const result = planResearch(menu, DEFAULT_RESEARCH_STEERING);
      expect(result, JSON.stringify(menu.tasks)).not.toHaveProperty("lane");
      const words = planResearchText(result, new Set(), false, LOOKUP_TARGET);
      expect(words).not.toContain(LIGHT_LOOKUP);
      expect(planNextStep(result)).not.toContain(LIGHT_LOOKUP);
      // The same menu without the field gets exactly the same words.
      const { lane: _lane, ...plain } = menu;
      expect(words).toBe(planResearchText(planResearch(plain, DEFAULT_RESEARCH_STEERING), new Set(), false,
        LOOKUP_TARGET));
      expect(planNextStep(result)).toBe(planNextStep(planResearch(plain, DEFAULT_RESEARCH_STEERING)));
    }
    expect(isLightLane(light())).toBe(true);
    expect(isLightLane(light({ tasks: [READ, RECORD] }))).toBe(true);
  });

  it("still asks a guided account, with the ask as it is and no request for a people's-reports task", () => {
    const result = planResearch(light(), guided);
    expect(result).toMatchObject({ next: "ask", lane: "light" });
    const { lane: _lane, ...plain } = light();
    const usual = planResearchText(planResearch(plain, guided), new Set(), false, LOOKUP_TARGET);
    expect(usual.startsWith(`${PEOPLE_TASK_MISSING}\n`)).toBe(true);
    expect(planResearchText(result, new Set(), false, LOOKUP_TARGET)).toBe(usual.slice(PEOPLE_TASK_MISSING.length + 1));
    expect(planNextStep(result)).toBe(planNextStep(planResearch(plain, guided)));
    expect(planNextStep(result)).not.toContain(LIGHT_LOOKUP);
    // A menu changed after the person saw it asks too.
    expect(planResearch(light(), DEFAULT_RESEARCH_STEERING, undefined, { digest: "md1~x", changed: true }))
      .toMatchObject({ next: "ask", lane: "light" });
    // Once the person has answered, the light look-up goes on.
    const answered = planResearch(light({ allocation: [{ task: 1, minutes: 2 }], person_answered: true }), guided);
    expect(answered).toMatchObject({ next: "go_on", lane: "light" });
    expect(planNextStep(answered)).toBe(LIGHT_LOOKUP);
  });

  it("carries the lane in every helper that reads, copies or corrects a menu, and not in its digest", () => {
    expect(researchMenuSchema.parse(light()).lane).toBe("light");
    for (const lane of ["research", "aside", "LIGHT", true]) {
      expect(researchMenuSchema.safeParse({ ...light(), lane }).success, String(lane)).toBe(false);
    }
    // Read as the menu, in its own name or another case form, and from a flat call.
    expect(readResearchMenu({ researchMenu: light() }).menu).toMatchObject({ lane: "light" });
    const { lane: _given, ...unlabelled } = light();
    expect(readResearchMenu({ research_menu: { ...unlabelled, Lane: "light" } }).menu).toMatchObject({ lane: "light" });
    expect(readResearchMenu({ ...light() }).flat).toMatchObject({ lane: "light" });
    // Corrected: kept when valid, left out when not.
    expect(correctedMenu(light()).researchMenu.lane).toBe("light");
    expect(correctedMenu({ ...light(), lane: "aside" }).researchMenu).not.toHaveProperty("lane");
    expect(correctedMenu({ ...light(), tasks: [READ.task] }, true).researchMenu.lane).toBe("light");
    // The "you decide" copy of a guided account's light menu stays light.
    const asks = planResearch(light(), guided);
    const youDecide = youDecideLaterInputs(light(), asks)!;
    expect(youDecide.researchMenu.lane).toBe("light");
    expect(youDecideLaterInputsSchema.safeParse(youDecide).success).toBe(true);
    // The digest reads the tasks alone: a menu that keeps its tasks and drops or adds the lane is not a changed menu.
    expect(menuDigest(light().tasks, SECRET)).toBe(menuDigest(light({ lane: undefined }).tasks, SECRET));
  });

  it("says the light lane in the registration's words for a light plan, after what the question is about", () => {
    const later_inputs = { researchMenu: light({ plain_answer_receipt: "rr1~synthetic" }) };
    const about = "The question is about the main figure of one named trial.";
    expect(LIGHT_LANE_PLANNED).toBe("AskRigor's plan puts this in the light lane: after plan_research's go-ahead do " +
      "only what its menu lists and one final check, as that result says.");
    for (const asked of [true, false]) {
      for (const framing of [undefined, { likely_question: "What did it find?", premise_doubts: ["A doubt"] }]) {
        const planned = { about, searches: 1, asked, lane: "light" as const, later_inputs };
        const usual = { ...planned, lane: "research" as const };
        const kept = "(the plan is kept).";
        expect(plannedGuidance(framing, planned)).toBe(plannedGuidance(framing, usual)
          .replace(`${kept} `, `${kept} ${LIGHT_LANE_PLANNED} `));
        const step = "with the same later_inputs.asked.";
        expect(plannedNextStep(framing, planned)).toBe(plannedNextStep(framing, usual)
          .replace(step, `${step} ${LIGHT_LANE_PLANNED}`));
        expect(plannedGuidance(framing, usual)).not.toContain(LIGHT_LANE_PLANNED);
        expect(plannedNextStep(framing, usual)).not.toContain(LIGHT_LANE_PLANNED);
      }
    }
  });

  it("steps aside with the owner's opening sentence, word for word, in the text and in next_step", () => {
    expect(ASIDE_OPENING).toBe("AskRigor says this question doesn't need AskRigor's research. Here is the regular AI's " +
      "answer:");
    const about = "The question asks for the boiling point of water at sea level.";
    expect(asideGuidance({ about, searches: 2 })).toBe("AskRigor's own planning call (2 web searches) found this to be " +
      "a plain look-up that AskRigor's research would add nothing to. What the question is about, as that call found " +
      `it: ${JSON.stringify(about)}. So AskRigor steps aside: make no AskRigor research call for it, and do not call ` +
      "plan_research or finalize_research. Answer the person now as you would without AskRigor, checking it the way " +
      "you normally would (your own search or browsing, if you have it) and naming your source. Start the answer with " +
      "this sentence, in the person's language: \"AskRigor says this question doesn't need AskRigor's research. Here " +
      "is the regular AI's answer:\" Nothing in this answer is checked by AskRigor, so do not say or imply that it " +
      "was. If the person then asks for it to be researched or checked, or asks whether it is true, safe or better " +
      "than something else, register the plain answer again with later_inputs.asked holding their question and that " +
      "request: AskRigor then plans the research.");
    expect(asideGuidance({ about, searches: 1 })).toContain("AskRigor's own planning call (1 web search) found");
    expect(asideGuidance({ about, searches: 0 })).toContain("AskRigor's own planning call (no web search) found");
    expect(asideNextStep()).toBe("AskRigor steps aside for this plain look-up: make no research call, and do not call " +
      "plan_research or finalize_research. Answer as you would without AskRigor, naming your source, and start with " +
      "this sentence, in the person's language: \"AskRigor says this question doesn't need AskRigor's research. Here " +
      "is the regular AI's answer:\" Do not say AskRigor checked it. If the person then asks for research, register " +
      "the plain answer again with their question and that request in later_inputs.asked.");
    for (const words of [asideGuidance({ about, searches: 2 }), asideNextStep()]) {
      expect(words).toContain(`"${ASIDE_OPENING}"`);
    }
  });

  it("plans a light menu through the connector, on ChatGPT's surface and Claude's", async () => {
    for (const [subject, surface] of [["auth0|light", "/mcp"], ["auth0|light-claude", "/mcp/claude"]] as const) {
      const { service, connect } = await start();
      await service.acceptFreeContributor(subject, agreement);
      const manage = await connect(surface, subject);
      const planned = await manage({ action: "plan_research", later_inputs: { researchMenu: light() } });
      expect(planned.isError, text(planned)).not.toBe(true);
      expect(planned.structuredContent, surface).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        lane: "light" }, next_step: LIGHT_LOOKUP });
      expect(planned.structuredContent, surface).not.toHaveProperty("researchMenu.say_reading_first");
      expect(planned.content[0]!.text.endsWith(` ${LIGHT_LOOKUP}`), surface).toBe(true);
    }
  });
});
