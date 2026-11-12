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
  ASK_ABOVE_MINUTES,
  COULD_CHANGE,
  FORM_PEOPLE_USE,
  MENU_PLACEHOLDERS,
  PEOPLE_FIRST_WHEN_USED,
  PEOPLE_TASK_MISSING,
  PLAN_TASK_KINDS,
  RESEARCH_LOOPS,
  RESEARCH_MENU_SHAPE,
  URGENT_FIRST,
  planTaskSchema,
  researchMenuSchema,
  PLAN_TASK_MINUTES,
  WORDS_ARE_NOT_SIZES,
  adjustmentGuidance,
  allocationAnswered,
  framingGuidance,
  menuDigest,
  framingNextStep,
  planNextStep,
  planResearch,
  planResearchText,
  steeringSentence,
  taskMinutes,
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
      { task: 4, minutes: 1 }], done: [1] }), DEFAULT_RESEARCH_STEERING);
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
      "When the person replies: call manage_research_access action plan_research again with the same " +
        "plain_answer_receipt, tasks and menu_digest (researchMenu.menu_digest in this result), research_target word " +
        `for word ${JSON.stringify(TARGET)}, and their ` +
        "allocation inside researchMenu, as a list of {task, minutes}; for \"you decide\", or a reply that leaves the " +
        "choice to you such as \"continue\", the recommended allocation. If the reply changes the question, register " +
        "the plain answer again for the new research target first, with later_inputs.framing for it. Never send an " +
        "allocation the person did not give or leave to you.",
    ]);
    expect(asked.endsWith("Never send an allocation the person did not give or leave to you.")).toBe(true);
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
    expect(planNextStep(planResearch(menu({ allocation: [{ task: 1, minutes: 5 }] }), DEFAULT_RESEARCH_STEERING)))
      .toBe("Do the recommended tasks now, in order, each within its minutes; then check the answer with " +
        "finalize_research and give it in this turn.");
    expect(planNextStep(planResearch(menu(), { ...DEFAULT_RESEARCH_STEERING, style: "autonomous",
      checkBackMinutes: 15 }))).toMatch(/^Do the recommended tasks now; after about 15 minutes of research, check/u);
  });

  // The review of 11 Nov 2026: a new task found while the person's allocation still has an open task went on, neither
  // recommended nor asked about. Sent as the guidance says, with done and without the allocation, it is decided afresh.
  it("doesn't drop a new task found after a partial allocation, sent as the guidance says", () => {
    const fork = { task: "Read the 2024 trial that reverses the 2018 cohort", kind: "full_text" as const,
      could_change: "conclusion" as const };
    const withAllocation = planResearch(menu({ tasks: [...TASKS, fork], allocation: [{ task: 1, minutes: 5 },
      { task: 3, minutes: 4 }], done: [1] }), DEFAULT_RESEARCH_STEERING);
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
      allocation: [{ task: 1, minutes: 4 }, { task: 3, minutes: 3 }] }), DEFAULT_RESEARCH_STEERING);
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
    expect(planResearch(menu({ ...replan, allocation: [{ task: 3, minutes: 3 }, { task: 4, minutes: 1 }] }),
      DEFAULT_RESEARCH_STEERING)).toMatchObject({ next: "go_on", recommended: [{ task: 3, minutes: 3 },
      { task: 4, minutes: 1 }] });
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
    expect(planResearch(menu({ allocation: [{ task: 1, minutes: 0 }] }), DEFAULT_RESEARCH_STEERING))
      .toMatchObject({ next: "go_on", recommended: [], recommended_minutes: [0, 0] });
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
    expect(plan({ steering_could_help: true, allocation: [{ task: 1, minutes: 5 }] }).next).toBe("go_on");
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
    const all = planResearch(menu({ allocation: [{ task: 1, minutes: 5 }] }),
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
        planResearchText(planResearch(menu({ allocation: [{ task: 1, minutes: 5 }] }), steering), new Set(), true),
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
    const fields = [...Object.keys(researchMenuSchema.shape).filter((key) => key !== "allocation" && key !== "done"),
      ...Object.keys(planTaskSchema.shape)];
    for (const name of [...fields, ...PLAN_TASK_KINDS, ...COULD_CHANGE, ...RESEARCH_LOOPS]) {
      expect(RESEARCH_MENU_SHAPE, name).toMatch(new RegExp(`\\b${name}\\b`, "u"));
    }
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
      "allocation inside researchMenu, as a list of {task, minutes}; for \"you decide\", or a reply that leaves the " +
      "choice to you such as \"continue\", the recommended allocation.");
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
    expect(detailStep).toContain("then call action plan_research again with their allocation inside " +
      "later_inputs.researchMenu or, for \"you decide\", do no more research: check the answer with finalize_research " +
      "and give it.");
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
    expect(foreignLines.at(-2)!.endsWith("Never send an allocation the person did not give or leave to you."))
      .toBe(true);
    expect(foreignLines.at(-1)).toBe(`Only once the person has replied "you decide", in a later message, never in this turn: call ` +
      `manage_research_access with action plan_research and ` +
      "exactly these later_inputs; the recommended allocation is inside researchMenu, where every allocation goes, " +
      `never beside it: ${JSON.stringify((foreign.structuredContent as { you_decide_later_inputs: unknown })
        .you_decide_later_inputs)}`);
    // Task numbers past the list are left out, with a problem.
    const past = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), allocation: [{ task: 9, minutes: 3 }, { task: 1, minutes: 5 }] } } });
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
      tasks: Array<{ minutes: unknown }> }; problems?: string[]; you_decide_later_inputs?: Record<string, unknown> };
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
    // 6: a null minutes, and the allocation and the person's reply beside the menu.
    const sixth = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
      tasks: [{ ...GUESS_TASKS[0], minutes: null }, GUESS_TASKS[1], GUESS_TASKS[2]] },
      allocation: [{ task: 1, minutes: 2 }, { task: 2, minutes: 2 }], user_choice: "you decide" });
    const sixthMenu = accepted(sixth);
    expect(sixthMenu.researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 1, minutes: 2 },
      { task: 2, minutes: 2 }] });
    expect(sixthMenu.problems).toEqual(["AskRigor read later_inputs.allocation as researchMenu.allocation: the " +
      "allocation and done list go inside researchMenu, and ignored later_inputs.user_choice, which is not part of " +
      "plan_research's menu."]);
    // 7 and 9: a setting beside the menu is ignored, and the account's style is unchanged.
    for (const researchSteering of [{ selection: "you decide" }, {}]) {
      const beside = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
        tasks: GUESS_TASKS }, researchSteering });
      expect(accepted(beside).problems).toEqual(["AskRigor ignored later_inputs.researchSteering, which is not part " +
        "of plan_research's menu."]);
    }
    expect((await service.activeAccount("auth0|person")).steering).toEqual(DEFAULT_RESEARCH_STEERING);
    // 11: user_allocation inside the menu is its allocation.
    const eleventh = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
      tasks: GUESS_TASKS, user_allocation: [{ task: 1, minutes: 3 }] } });
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

  it("hands over the \"you decide\" call, ready to copy, which goes on with the recommended allocation", async () => {
    const { plan, receipt } = await session();
    const asked = await plan({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
      tasks: GUESS_TASKS } });
    const menuResult = accepted(asked);
    expect(menuResult.researchMenu.next).toBe("ask");
    const youDecide = menuResult.you_decide_later_inputs!;
    expect(youDecide).toEqual({ researchMenu: { research_target: GUESS_TARGET, plain_answer_receipt: receipt,
      tasks: GUESS_TASKS, allocation: menuResult.researchMenu.recommended,
      menu_digest: (menuResult.researchMenu as { menu_digest?: string }).menu_digest } });
    expect((youDecide.researchMenu as { menu_digest: string }).menu_digest).toMatch(/^md1~[A-Za-z0-9_-]{22}$/u);
    expect(researchMenuSchema.safeParse(youDecide.researchMenu).success).toBe(true);
    // In the text, right after the rule for the person's answer, saying the allocation goes inside researchMenu.
    const lines = asked.content[0]!.text.split("\n");
    expect(lines.at(-2)).toMatch(/^When the person replies: /u);
    expect(lines.at(-2)).toContain("for \"you decide\", or a reply that leaves the choice to you such as " +
      "\"continue\", the call on the next line.");
    expect(lines.at(-1)).toBe("Only once the person has replied \"you decide\", in a later message, never in this turn: call " +
      "manage_research_access with action plan_research and exactly " +
      "these later_inputs; the recommended allocation is inside researchMenu, where every allocation goes, never " +
      `beside it: ${JSON.stringify(youDecide)}`);
    expect((asked.structuredContent as { next_step: string }).next_step).toContain("(for \"you decide\", with " +
      "you_decide_later_inputs as later_inputs, as they are).");
    // Sent back as it is, it goes on with that allocation, and offers no "you decide" call.
    const decided = accepted(await plan(youDecide));
    expect(decided.researchMenu).toMatchObject({ next: "go_on", recommended: menuResult.researchMenu.recommended });
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
      allocation: [{ task: 2, minutes: 1 }], menu_digest: digest });
    expect(redirected.structured.researchMenu).toMatchObject({ next: "go_on", menu_changed: true,
      recommended: [{ task: 2, minutes: 1 }] });
    // The changed menu's own digest, passed back with the person's answer, goes on with it.
    const answered = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      allocation: [{ task: 2, minutes: 3 }], menu_digest: forked.structured.researchMenu.menu_digest });
    expect(answered.structured.researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 2, minutes: 3 }] });
    // The same menu retyped in other words, with new time estimates, when the person's answer is sent: not a change, so
    // the person isn't asked twice.
    const retyped = await plan({ research_target: target, steering_could_help: false,
      tasks: [{ ...FIRST, task: "Find trials of warm compresses for a stiff neck", minutes: [2, 5] },
        { ...FORK, task: "Find trials of heat wraps worn overnight", sources: 2 }],
      allocation: [{ task: 2, minutes: 3 }], menu_digest: forked.structured.researchMenu.menu_digest });
    expect(retyped.structured.researchMenu).toMatchObject({ next: "go_on", recommended: [{ task: 2, minutes: 3 }] });
    expect(retyped.structured.researchMenu).not.toHaveProperty("menu_changed");
    // Autonomous research never stops to ask, and keeps the person's own allocation for a menu they changed, rather
    // than the default tasks (Greptile's review of 12 Nov 2026).
    await service.setResearchSteering("auth0|person", { style: "autonomous" });
    const autonomous = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      menu_digest: digest });
    expect(autonomous.structured.researchMenu.next).toBe("go_on");
    const theirs = await plan({ research_target: target, steering_could_help: false, tasks: [FIRST, FORK],
      allocation: [{ task: 2, minutes: 1 }], done: [1], menu_digest: digest });
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
    expect(planResearch({ ...plan, allocation: [{ task: 2, minutes: 1.5 }] }, DEFAULT_RESEARCH_STEERING, undefined,
      { digest, changed: true })).toMatchObject({ next: "go_on", menu_changed: true, recommended: [{ task: 2, minutes: 1.5 }] });
    expect(planResearch(plan, DEFAULT_RESEARCH_STEERING, undefined, { digest, changed: false }).next).toBe("go_on");
    expect(planResearch(plan, DEFAULT_RESEARCH_STEERING).next).toBe("go_on");
  });
});

// The review of 12 Nov 2026: the person's 1.5 minutes became 2, as their allocation was rounded like an estimate.
describe("the person's own minutes are kept as given", () => {
  it("keeps 1.5 as 1.5 in the plan, its total and its text, and rounds only AskRigor's own estimates", () => {
    const allocated = planResearch(menu({ allocation: [{ task: 1, minutes: 1.5 }, { task: 2, minutes: 0.1 },
      { task: 4, minutes: 0.2 }] }), DEFAULT_RESEARCH_STEERING);
    expect(allocated.recommended).toEqual([{ task: 1, minutes: 1.5 }, { task: 2, minutes: 0.1 }, { task: 4, minutes: 0.2 }]);
    expect(allocated.recommended_minutes).toEqual([1.8, 1.8]);
    expect(planResearchText(allocated, new Set())).toContain("Recommended: 1. 1.5 min, 2. 0.1 min, 4. 0.2 min, about " +
      "1.8 min in all.");
    expect(planResearch(menu({ allocation: [{ task: 1, minutes: 2.5 }] }), DEFAULT_RESEARCH_STEERING).recommended)
      .toEqual([{ task: 1, minutes: 2.5 }]);
    // A task's own estimate is still a rough range for the menu.
    expect(taskMinutes({ task: "x x x", kind: "other", could_change: "detail", minutes: [1.4, 2.6] })).toEqual([1, 3]);
  });
});
