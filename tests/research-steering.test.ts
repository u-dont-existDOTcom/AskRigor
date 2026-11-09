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
  COULD_CHANGE,
  FORM_PEOPLE_USE,
  PEOPLE_FIRST_WHEN_USED,
  PEOPLE_TASK_MISSING,
  PLAN_TASK_KINDS,
  RESEARCH_LOOPS,
  RESEARCH_MENU_SHAPE,
  planTaskSchema,
  researchMenuSchema,
  PLAN_TASK_MINUTES,
  WORDS_ARE_NOT_SIZES,
  adjustmentGuidance,
  framingGuidance,
  planResearch,
  planResearchText,
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
    expect(balanced).toContain("Say plainly near the start of your reply what looks inverted or unclear");
    expect(balanced).toContain("Ask the person these questions now, in their language, and wait for the answers " +
      "before any research call: 1. Did you mean lowering the ratio? 2. Is this about your own blood pressure?");
    expect(framingGuidance(steering("guided"), framing)).toContain("Ask the person these questions now");
    const autonomous = framingGuidance(steering("autonomous"), framing);
    expect(autonomous).toContain("don't stop to ask");
    expect(autonomous).not.toContain("Ask the person these questions now");
    const clear = { likely_question: framing.likely_question };
    expect(framingGuidance(steering("balanced"), clear)).toContain("No question could redirect the research, so go on " +
      "without asking.");
    expect(framingGuidance(steering("autonomous"), clear)).toContain("go on without asking");
    expect(framingGuidance(steering("guided"), clear)).toContain("confirm in one line the question you will research");
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      expect(framingGuidance(steering(style), clear)).toContain("Screen first:");
      expect(framingGuidance(steering(style), undefined)).toContain("Give later_inputs.framing with the plain answer " +
        "next time");
    }
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
    const without = await manage({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(text(without)).toContain("Give later_inputs.framing with the plain answer next time");
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
    expect(taskMinutes({ task: "x x x", kind: "full_text", could_change: "conclusion" })).toEqual([3, 6]);
    expect(taskMinutes({ task: "x x x", kind: "full_text", sources: 3, could_change: "conclusion" })).toEqual([9, 18]);
    expect(taskMinutes({ task: "x x x", kind: "abstract_screen", sources: 20, could_change: "detail" })).toEqual([4, 10]);
    expect(taskMinutes({ task: "x x x", kind: "abstract_screen", could_change: "detail" })).toEqual([0.5, 1]);
    expect(taskMinutes({ task: "x x x", kind: "other", could_change: "detail" })).toBeNull();
    expect(taskMinutes({ task: "x x x", kind: "other", could_change: "detail", minutes: [9, 4] })).toEqual([4, 9]);
  });

  it("recommends what could change the conclusion first, within the check-back allowance, never detail alone", () => {
    const result = planResearch(menu(), DEFAULT_RESEARCH_STEERING);
    // 1 (conclusion, 3-6: 5 min), then 2 (confidence, 2-4: 3 min); 4 (1-2: 2 min) would pass 10 minutes in all.
    expect(result.recommended).toEqual([{ task: 1, minutes: 5 }, { task: 2, minutes: 3 }, { task: 4, minutes: 2 }]);
    expect(result.recommended_minutes).toEqual([6, 12]);
    // Balanced asks when the recommended tasks would take more than about five minutes.
    expect(result.next).toBe("ask");
    const short = planResearch(menu({ tasks: [TASKS[3]!] }), DEFAULT_RESEARCH_STEERING);
    expect(short).toMatchObject({ recommended: [{ task: 1, minutes: 2 }], recommended_minutes: [1, 2], next: "go_on" });
    // A smaller allowance keeps the first task even when it alone is longer.
    expect(planResearch(menu(), { ...DEFAULT_RESEARCH_STEERING, checkBackMinutes: 2 }).recommended)
      .toEqual([{ task: 1, minutes: 5 }]);
    // Detail only: nothing recommended.
    expect(planResearch(menu({ tasks: [TASKS[2]!] }), DEFAULT_RESEARCH_STEERING).recommended).toEqual([]);
  });

  it("asks or goes on by the account's style, and follows the person's allocation once given", () => {
    expect(planResearch(menu({ tasks: [TASKS[3]!] }), { ...DEFAULT_RESEARCH_STEERING, style: "guided" }).next)
      .toBe("ask");
    const autonomous = planResearch(menu(), { ...DEFAULT_RESEARCH_STEERING, style: "autonomous" });
    expect(autonomous.next).toBe("go_on");
    expect(planResearchText(autonomous, new Set())).toContain("Check back with them after about 10 minutes of research");
    const allocated = planResearch(menu({ allocation: [{ task: 1, minutes: 5 }, { task: 3, minutes: 4 },
      { task: 4, minutes: 1 }], done: [1] }), DEFAULT_RESEARCH_STEERING);
    expect(allocated).toMatchObject({ next: "go_on", recommended: [{ task: 3, minutes: 4 }, { task: 4, minutes: 1 }],
      recommended_minutes: [5, 5] });
    const words = planResearchText(allocated, new Set([1]));
    expect(words).toContain("1. Read the 2018 cohort's full text: could change the conclusion; about 3 to 6 min (done).");
    expect(words).toContain("4. Search studies for the muscle cramps people reported: could change how sure the " +
      "answer is, studies checked for what people reported; about 1 to 2 min.");
    expect(words).toContain("Recommended: 3. 4 min, 4. 1 min, about 5 min in all.");
    expect(words).toContain("Do these tasks now, in this order, each within its minutes");
    const asked = planResearchText(planResearch(menu(), DEFAULT_RESEARCH_STEERING), new Set());
    expect(asked).toContain("such as \"1. 5 min, 2. 4 min, 7. 1 min\", in their own words, or \"you decide\". Wait " +
      "for the answer before any of these tasks");
    // Every menu carries the progress line, the way back after a stop, the loop between reports and studies, and the
    // adjusted-variables look by the account's choice.
    for (const words of [asked, planResearchText(autonomous, new Set())]) {
      expect(words).toContain("Before each task, say in one line what you will read, how deep, and why.");
      expect(words).toContain("If the person stops you or changes direction, call plan_research again");
      expect(words).toContain("later_inputs.community_leads");
      expect(words).toContain(adjustmentGuidance("flagged"));
    }
  });

  it("mentions only doubtful adjustments by default, and all of them when the person chose that", () => {
    expect(adjustmentGuidance("flagged")).toContain("mention only adjustments that look doubtful or disputed");
    expect(adjustmentGuidance("flagged")).toContain("say nothing about the rest unless the person asks");
    expect(adjustmentGuidance("all")).toContain("list each key study's adjusted variables with each one's likely role");
    const all = planResearch(menu(), { ...DEFAULT_RESEARCH_STEERING, adjustmentDetail: "all" });
    expect(planResearchText(all, new Set())).toContain(adjustmentGuidance("all"));
  });

  // The owner, 9 Nov 2026, after the Syrian rue oil comparison: a word such as "significant" or "rich" is not a size,
  // and a widely used old remedy's screen should ask first what people who use it report.
  it("says a word is not a size at the screen and at the menu, in every style", () => {
    expect(WORDS_ARE_NOT_SIZES).toContain("is not a size");
    expect(WORDS_ARE_NOT_SIZES).toContain("in any language");
    expect(WORDS_ARE_NOT_SIZES).toContain("compare that number with what the question needs");
    for (const style of ["guided", "balanced", "autonomous"] as const) {
      const steering: ResearchSteering = { ...DEFAULT_RESEARCH_STEERING, style };
      for (const words of [
        framingGuidance(steering, undefined),
        framingGuidance(steering, { likely_question: TARGET }),
        planResearchText(planResearch(menu(), steering), new Set()),
      ]) {
        expect(words).toContain(WORDS_ARE_NOT_SIZES);
      }
      expect(framingGuidance(steering, undefined)).toContain(PEOPLE_FIRST_WHEN_USED);
    }
  });

  // The owner, 9 Nov 2026 (Inbox reply): nobody sells the hexane-extracted seed oil, so ask which form the person has.
  it("asks for the form people actually buy or make, when the answer turns on it, with the plain answer's request", async () => {
    const { plainAnswerRequest } = await import("../apps/research-mcp/src/research-contributor-access-tool.js");
    for (const note of [true, false]) expect(plainAnswerRequest(note).endsWith(FORM_PEOPLE_USE)).toBe(true);
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
    expect(asked).toContain("then call plan_research again with their allocation as a list of {task, minutes}; for " +
      "\"you decide\", the recommended tasks and minutes.");
  });

  it("asks for a people's-reports task when a first menu has none, and never renumbers an allocated one", () => {
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
    // Once the person allocated time by task number, the menu isn't changed under them.
    const allocated = planResearch(menu({ tasks: [TASKS[0]!, TASKS[1]!], allocation: [{ task: 1, minutes: 5 }] }),
      DEFAULT_RESEARCH_STEERING);
    expect(planResearchText(allocated, new Set(), true)).not.toContain(PEOPLE_TASK_MISSING);
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
    expect(text(same)).toContain("The menu to show the person, in their language, numbered as here");
    const reworded = await manage({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), research_target: "Sodium potassium ratio and blood pressure", plain_answer_receipt: receipt } } });
    expect(reworded.structuredContent).toMatchObject({ researchMenu: { target_matches_plain_answer: false } });
    expect(text(reworded)).toContain("This research_target is not the one registered with the plain answer");
    // Another account's receipt, or none that verifies: said so, and the menu still comes.
    const other = await connect("/mcp", "auth0|other");
    await service.acceptFreeContributor("auth0|other", agreement);
    const foreign = await other({ action: "plan_research", later_inputs: { researchMenu: {
      ...menu(), plain_answer_receipt: receipt } } });
    expect(foreign.structuredContent).toMatchObject({ ok: true, problems: [expect.stringContaining(
      "is not a current plain-answer receipt of this account")] });
    expect(foreign.structuredContent).not.toHaveProperty("researchMenu.target_matches_plain_answer");
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
