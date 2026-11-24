// Owner answer 412a (24 November 2026): registering the plain answer hands over HRP's core, the bytes load_protocol serves
// for section "core", once, and names the further sections. Behind ASKRIGOR_HRP_CORE (off by default). Invented question
// and answer; the protocol text is the repository's own.
import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OWNER_POINTERS } from "../apps/research-mcp/src/owner-pointers.js";
import { MCP_RESULT_MAX_BYTES } from "../apps/research-mcp/src/config.js";
import {
  HRP_CORE_ALREADY_HELD,
  HRP_CORE_DIGEST_CHARACTERS,
  HRP_CORE_LOAD_FIRST,
  HRP_CORE_NEXT_STEP,
  HRP_CORE_RESULT_LIMITS,
  holdsHrpCore,
  hrpCoreDigest,
  hrpCoreStructured,
  hrpCoreText,
  type HrpCore,
} from "../apps/research-mcp/src/hrp-core.js";
import { withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { currentHrpCore, registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { createManageResearchAccessHandler, manageResearchAccessInputSchema, manageResearchAccessOutputSchema,
  type ResearchContributorToolOptions } from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { researchPlanOf, type ResearchPlanner } from "../apps/research-mcp/src/research-planner.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createResearchTrialWindows } from "../apps/research-mcp/src/research-trial.js";
import { clientResultBytes, resultForClient } from "../apps/research-mcp/src/tool-result.js";
import { heldFinding } from "./helpers/askrigor-holds-fixture.js";

const SECRET = "hrp-core-test-secret-0123456789abcdef0123456789";
const TARGET = "Whether a walnut-leaf rinse lowers foot sweating in adults";
const CLAIMS = ["A walnut-leaf rinse has never been tested for foot sweating."];
const PLAIN = { researchTarget: TARGET, text: `${CLAIMS[0]} Cotton socks help.`, claims: CLAIMS };
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const CHATGPT = { "openai/locale": "en-US" };

afterEach(() => {
  vi.unstubAllEnvs();
});

const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};
type Result = CallToolResult & { structuredContent?: Record<string, unknown> };
const texts = (result: Result): string[] => result.content.flatMap((block) => block.type === "text" ? [block.text] : []);
const service = async () => {
  const made = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
    identitySecret: new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes") });
  for (const subject of ["auth0|dev", "auth0|person"]) await made.acceptFreeContributor(subject, AGREEMENT);
  return made;
};
const extraOf = (subject: string, chatGpt: boolean) => ({ authInfo: { token: "t", clientId: "c", scopes: ["research:use"],
  expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } }, ...(chatGpt ? { _meta: CHATGPT } : {}) });

/** The connector's own tools, as a client gets their results. */
async function server(mode: string, options: Partial<RegisterToolsOptions> = {}) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  vi.stubEnv("ASKRIGOR_HRP_CORE", mode);
  const access = await service();
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", access.accountKeyForSubject("auth0|dev"));
  const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
  registerTools({ registerTool: (name: string, _config: unknown, execute: (input: unknown, extra?: unknown) => Promise<CallToolResult>) => {
    handlers.set(name, execute);
  } } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp", researchContributorAccessService: access,
    ...options });
  const call = async (tool: string, input: Record<string, unknown>, who: { subject?: string; chatGpt?: boolean } = {}): Promise<Result> =>
    await handlers.get(tool)!(input, extraOf(who.subject ?? "auth0|person", who.chatGpt === true)) as Result;
  const register = (who: { subject?: string; chatGpt?: boolean } = {}, later?: Record<string, unknown>,
    plainAnswer: Record<string, unknown> = PLAIN) => call("manage_research_access", { action: "register_plain_answer", plainAnswer,
    ...(later === undefined ? {} : { later_inputs: later }) }, who);
  return { call, register, access };
}
type Registered = { hrp_core?: ReturnType<typeof hrpCoreStructured>; next_step: string; research_receipt: string };
const data = (result: Result) => result.structuredContent as unknown as Registered;
/** A result without its receipt, which signs the time, so two registrations can be compared. */
const timeless = (result: Result) => JSON.stringify(result).replaceAll(data(result).research_receipt, "<receipt>");

describe("HRP's core, as load_protocol serves it (owner answer 412a)", () => {
  it("is the same bytes, SHA-256 and version, with the core's sections and every other section for research by name", async () => {
    const { call } = await server("off");
    const core = (await currentHrpCore())!;
    const index = (await call("load_protocol", { protocol: "hrp", section: "index" })).structuredContent as unknown as {
      manifest: { version: string }; index: Array<{ name: string; core: boolean; runtime: boolean }>; core_sections: string[] };
    const pages: string[] = [];
    let last: { scope_sha256: string; complete: boolean; text: string };
    do {
      last = (await call("load_protocol", { protocol: "hrp", section: "core", page: pages.length + 1 }))
        .structuredContent as unknown as typeof last;
      pages.push(last.text);
    } while (!last.complete);
    expect(core.text).toBe(pages.join(""));
    expect(core.sha256).toBe(last.scope_sha256);
    expect(core.sha256).toBe(sha256(core.text));
    expect(core.version).toBe(index.manifest.version);
    expect(core.sections).toEqual(index.core_sections);
    expect(core.furtherSections).toEqual(index.index.filter(({ core: isCore, runtime }) => runtime && !isCore).map(({ name }) => name));
    expect(core.furtherSections.length).toBeGreaterThan(10);
    for (const section of index.index.filter(({ runtime }) => !runtime)) expect(core.furtherSections).not.toContain(section.name);
  });

  it("is said to be held by its digest or its whole SHA-256, and by nothing else", async () => {
    const core = (await currentHrpCore())!;
    expect(hrpCoreDigest(core)).toBe(core.sha256.slice(0, 16));
    expect(HRP_CORE_DIGEST_CHARACTERS).toBe(16);
    for (const held of [hrpCoreDigest(core), core.sha256, ` ${hrpCoreDigest(core).toUpperCase()} `, core.sha256.slice(0, 20)]) {
      expect(holdsHrpCore(held, core), held).toBe(true);
    }
    for (const held of [undefined, null, true, 1, "", "true", core.sha256.slice(0, 15), `${core.sha256}0`,
      core.sha256.slice(1, 17), [hrpCoreDigest(core)], { digest: hrpCoreDigest(core) }]) {
      expect(holdsHrpCore(held, core), JSON.stringify(held)).toBe(false);
    }
  });
});

describe("the registration that hands it over (owner answer 412a)", () => {
  it("carries it once, in the structured content, for ChatGPT, whose text says where it is", async () => {
    const core = (await currentHrpCore())!;
    const { register } = await server("on");
    const result = await register({ chatGpt: true });
    expect(result.isError, texts(result)[0]).not.toBe(true);
    expect(data(result).hrp_core).toEqual({ protocol: "hrp", version: core.version, scope_sha256: core.sha256,
      sections: core.sections, further_sections: core.furtherSections, how_to_use: expect.any(String), text: core.text });
    expect(JSON.stringify(result).split(JSON.stringify(core.text).slice(1, 300))).toHaveLength(2);
    expect(texts(result).filter((text) => text === hrpCoreText(core, true))).toHaveLength(1);
    expect(texts(result).join("\n")).not.toContain(core.text.slice(0, 200));
    // What the paragraph and the field beside the text say: where, when, not again, the further sections, and the digest.
    for (const said of [hrpCoreText(core, true), data(result).hrp_core!.how_to_use]) {
      for (const part of ["Read it before your first search and follow it", "do not load the core again in this conversation",
        "load it by name with load_protocol", "hrp_core.further_sections", `later_inputs.hrpCoreHeld "${hrpCoreDigest(core)}"`]) {
        expect(said).toContain(part);
      }
    }
    expect(hrpCoreText(core, true)).toContain("hrp_core.text in its structured content, not in this text");
    expect(data(result).next_step.endsWith(` ${HRP_CORE_NEXT_STEP}`)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify({ content: result.content, structuredContent: result.structuredContent }), "utf8"))
      .toBeLessThanOrEqual(HRP_CORE_RESULT_LIMITS.chatGptBytes);
    // The registration itself is as without it: the same texts, and the same fields.
    const off = await (await server("off")).register({ chatGpt: true });
    expect(texts(result).filter((text) => text !== hrpCoreText(core, true)).join("\n").replaceAll(data(result).research_receipt, "R"))
      .toBe(texts(off).join("\n").replaceAll(data(off).research_receipt, "R"));
    const { hrp_core: _core, ...rest } = data(result);
    expect(JSON.stringify({ ...rest, next_step: rest.next_step.slice(0, -HRP_CORE_NEXT_STEP.length - 1) })
      .replaceAll(rest.research_receipt, "R")).toBe(JSON.stringify(data(off)).replaceAll(data(off).research_receipt, "R"));
  });

  it("gives every other app the same structured content, and the core's exact bytes as the last text, raw", async () => {
    const core = (await currentHrpCore())!;
    const { register } = await server("on");
    const result = await register();
    const blocks = texts(result);
    expect(blocks.at(-1)).toBe(core.text);
    expect(sha256(blocks.at(-1)!)).toBe(core.sha256);
    const { text: _text, ...fields } = data(result).hrp_core!;
    expect(JSON.parse(blocks.at(-2)!)).toEqual({ ...result.structuredContent, hrp_core: fields });
    expect(blocks.filter((text) => text === hrpCoreText(core, false))).toHaveLength(1);
    expect(hrpCoreText(core, false)).toContain("hrp_core.text in its structured content, and the last text block of this result");
    expect(data(result).hrp_core!.text).toBe(core.text);
    expect(data(result).next_step.endsWith(` ${HRP_CORE_NEXT_STEP}`)).toBe(true);
    expect(JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(HRP_CORE_RESULT_LIMITS.structuredCharacters);
    expect(Buffer.byteLength(JSON.stringify({ content: result.content, structuredContent: result.structuredContent }), "utf8"))
      .toBeLessThanOrEqual(HRP_CORE_RESULT_LIMITS.wholeBytes);
  });

  it("shapes only that tool's answered result so, for an app other than ChatGPT", () => {
    const core: HrpCore = { version: "1", sha256: "a".repeat(64), sections: ["A"], furtherSections: ["B"], text: "<A/>" };
    const made = { content: [{ type: "text" as const, text: "first" }], structuredContent: { ok: true, hrp_core: hrpCoreStructured(core) } };
    expect(texts(resultForClient("manage_research_access", made, false))).toEqual(["first",
      JSON.stringify({ ok: true, hrp_core: (({ text: _text, ...fields }) => fields)(hrpCoreStructured(core)) }), "<A/>"]);
    expect(resultForClient("manage_research_access", made, true)).toEqual(made);
    for (const [tool, result] of [["search_pubmed", made], ["manage_research_access", { ...made, isError: true }],
      ["manage_research_access", { ...made, structuredContent: { ok: true, hrp_core: "x" } }],
      ["manage_research_access", { ...made, structuredContent: { ok: true, hrp_core: null } }]] as const) {
      expect(texts(resultForClient(tool, result, false))).toEqual(["first", JSON.stringify(result.structuredContent)]);
    }
  });

  it("leaves it out when the call says this conversation holds it, with one line, and sends it for any other value", async () => {
    const core = (await currentHrpCore())!;
    const { register } = await server("on");
    for (const chatGpt of [true, false]) {
      const held = await register({ chatGpt }, { hrpCoreHeld: hrpCoreDigest(core) });
      expect(held.isError, texts(held)[0]).not.toBe(true);
      expect(data(held)).not.toHaveProperty("hrp_core");
      expect(texts(held).filter((text) => text === HRP_CORE_ALREADY_HELD)).toHaveLength(1);
      expect(data(held).next_step.endsWith(` ${HRP_CORE_ALREADY_HELD}`)).toBe(true);
      expect(clientResultBytes(held)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
      for (const other of ["0".repeat(16), true, null, "", { sha256: core.sha256 }]) {
        expect(data(await register({ chatGpt }, { hrpCoreHeld: other })).hrp_core?.text, JSON.stringify(other)).toBe(core.text);
      }
    }
    // Off, it is read for nothing, and the registration is as without it.
    const off = await server("off");
    expect(timeless(await off.register({}, { hrpCoreHeld: hrpCoreDigest(core) }))).toBe(timeless(await off.register()));
  });

  const planner = (reply: Record<string, unknown>): ResearchPlanner => ({ enabled: true, dailyCapUsd: 3, accountDailyCalls: 10,
    lane: async () => undefined, plan: async () => ({ planning: { status: "planned", plan: researchPlanOf({
      about: "A rinse made from walnut leaves.", steering_choice: "none", tasks: [{ task: "Find trials of the rinse",
        kind: "full_text", could_change: "conclusion", sources: 1 }], ...reply }, 1, "sk-none")! }, cached: false, costUsd: 0,
    milliseconds: 1 }) });

  it("hands it over with AskRigor's own plan, and not for a plain look-up, light or aside", async () => {
    const core = (await currentHrpCore())!;
    const planned = await server("on", { researchPlanner: planner({ lane: "research" }) });
    const result = await planned.register({ subject: "auth0|dev" }, { asked: "does the rinse work?" });
    expect(result.structuredContent).toMatchObject({ research_plan: { lane: "research" }, planned_later_inputs: expect.anything() });
    expect(data(result).hrp_core?.text).toBe(core.text);
    for (const lane of ["light", "aside"]) {
      for (const chatGpt of [true, false]) {
        const run = async (mode: string) => (await server(mode, { researchPlanner: planner({ lane }) }))
          .register({ subject: "auth0|dev", chatGpt }, { asked: "does the rinse work?", hrpCoreHeld: "0".repeat(16) });
        const on = await run("on");
        expect(on.structuredContent).toMatchObject({ research_plan: { lane } });
        expect(timeless(on)).toBe(timeless(await run("off")));
      }
    }
  });

  it("goes by the account's switch: off, dev, on, and a dev account's test window", async () => {
    const carries = async (mode: string, subject: string, window?: boolean) => {
      const windows = createResearchTrialWindows();
      const { register, access } = await server(mode, { researchTrialWindows: windows });
      if (window !== undefined) {
        windows.set(access.accountKeyForSubject("auth0|dev"), { claimAccounting: false, hrpCore: window, minutes: 10 });
      }
      return data(await register({ subject })).hrp_core !== undefined;
    };
    for (const subject of ["auth0|dev", "auth0|person"]) {
      expect(await carries("off", subject, true)).toBe(false);
      expect(await carries("", subject, true)).toBe(false);
      expect(await carries("on", subject)).toBe(true);
      expect(await carries("dev", subject)).toBe(subject === "auth0|dev");
      expect(await carries("trial", subject)).toBe(false);
      expect(await carries("trial", subject, true)).toBe(subject === "auth0|dev");
      expect(await carries("trial", subject, false)).toBe(false);
    }
  });

  it("is a runtime field alone: the published result is as it was", () => {
    expect(Object.keys(manageResearchAccessOutputSchema.shape)).not.toContain("hrp_core");
    expect(Object.keys(manageResearchAccessInputSchema.shape)).not.toContain("hrpCoreHeld");
  });
});

describe("the size of the result that carries it (owner answer 412a)", () => {
  const CORE: HrpCore = { version: "20.0.0", sha256: sha256("core"), sections: ["Purpose"], furtherSections: ["EvidenceLayers"],
    text: "x".repeat(40_000) };
  async function handler(options: Partial<ResearchContributorToolOptions>) {
    const access = await service();
    const execute = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, createManageResearchAccessHandler({
      service: access, plainAnswer: { sign: (claims) => issueResearchReceipt("plain_answer", claims, { secret: SECRET }) },
      devAccountKeys: () => new Set([researchAccountReference(access.accountKeyForSubject("auth0|dev"))]),
      hrpCore: async () => CORE, hrpCoreFor: () => true, ...options })).execute;
    return async (chatGpt: boolean, plainAnswer: Record<string, unknown> = PLAIN) => await execute(
      { action: "register_plain_answer", plainAnswer }, extraOf("auth0|person", chatGpt) as never) as Result;
  }
  const findings = (count: number, length: number) => Array.from({ length: count }, (_, index) => heldFinding({
    publication_number: `P-${88001 + index}`, wording: "w".repeat(length), page_url: `https://atlas.example/atlas/findings/P-${88001 + index}` }));
  const shown = (result: Result) => (result.structuredContent as { askrigor_holds?: { atlas_findings?: unknown[] } })
    .askrigor_holds?.atlas_findings?.length ?? 0;

  it("keeps the core and shows less of what AskRigor holds before it leaves the core out", async () => {
    for (const chatGpt of [true, false]) {
      const atlas = async () => findings(3, 3_000);
      const held = (await (await handler({ askrigorHolds: { atlas, pointers: () => OWNER_POINTERS }, hrpCoreFor: () => false }))(chatGpt));
      expect(shown(held)).toBe(3);
      const result = await (await handler({ askrigorHolds: { atlas, pointers: () => OWNER_POINTERS } }))(chatGpt);
      expect(data(result).hrp_core?.text).toBe(CORE.text);
      expect(shown(result)).toBeLessThan(3);
      // It takes the most that fits: one finding more would not.
      const limit = chatGpt ? HRP_CORE_RESULT_LIMITS.chatGptBytes : HRP_CORE_RESULT_LIMITS.structuredCharacters;
      const size = chatGpt ? Buffer.byteLength(JSON.stringify({ content: result.content, structuredContent: result.structuredContent }), "utf8")
        : JSON.stringify(result.structuredContent).length;
      expect(size).toBeLessThanOrEqual(limit);
      expect(size + 3_000).toBeGreaterThan(limit);
    }
    const small = await (await handler({ askrigorHolds: { atlas: async () => findings(1, 60) } }))(true);
    expect([data(small).hrp_core !== undefined, shown(small)]).toEqual([true, 1]);
  });

  it("leaves the core out, and says to load it first, when nothing else can be left out", async () => {
    // A research target of 5,000 characters is in the result several times.
    const long = { ...PLAIN, researchTarget: `Whether ${"a walnut-leaf rinse ".repeat(400)}`.slice(0, 5_000).trim() };
    for (const chatGpt of [true, false]) {
      const atlas = async () => findings(2, 200);
      const call = await handler({ askrigorHolds: { atlas } });
      const huge = { ...CORE, text: "x".repeat(58_000) };
      const result = await (await handler({ askrigorHolds: { atlas }, hrpCore: async () => huge }))(chatGpt, long);
      expect(result.isError, texts(result)[0]).not.toBe(true);
      expect(data(result)).not.toHaveProperty("hrp_core");
      expect(texts(result).filter((text) => text === HRP_CORE_LOAD_FIRST)).toHaveLength(1);
      expect(data(result).next_step.endsWith(` ${HRP_CORE_LOAD_FIRST}`)).toBe(true);
      // Without the core there is room for what AskRigor holds again, within the limit every other registration has.
      expect(shown(result)).toBe(2);
      expect(clientResultBytes(result)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
      expect(data(await call(chatGpt)).hrp_core).toBeDefined();
    }
    expect(HRP_CORE_LOAD_FIRST).toContain("call load_protocol with protocol \"hrp\" and section \"core\"");
  });

  it("says to load it first when the server cannot read it, and never fails a registration for it", async () => {
    for (const hrpCore of [async () => undefined, async () => { throw new Error("synthetic"); }, undefined,
      () => { throw new Error("synthetic"); }]) {
      const result = await (await handler({ hrpCore: hrpCore as ResearchContributorToolOptions["hrpCore"] }))(true);
      expect(result.structuredContent).toMatchObject({ ok: true, research_receipt: expect.any(String) });
      expect(data(result)).not.toHaveProperty("hrp_core");
      expect(texts(result)).toContain(HRP_CORE_LOAD_FIRST);
    }
  });

  it("fits every app with the real core, with what AskRigor's owner keeps, with the menu's claims and with a plan", async () => {
    const reply = { about: "A rinse made from walnut leaves, used on the feet for sweating.", steering_choice:
      "Which leaves do you have: fresh, dried or an extract?", lane: "research", person_said_go_on: false, tasks: Array.from({ length: 5 },
      (_, index) => ({ task: `${index + 1}: find whether any placebo trial tested the rinse on adults who sweat, and read what it measured and for how long`,
        kind: "study_search", could_change: "conclusion", sources: 2, claims: index === 0 ? [1] : [] })), left_out: [] };
    const made: ResearchPlanner = { enabled: true, dailyCapUsd: 3, accountDailyCalls: 10, lane: async () => undefined,
      plan: async (source) => ({ planning: { status: "planned", plan: researchPlanOf(reply, 1, "sk-none", false, true, source.claims)! },
        cached: false, costUsd: 0, milliseconds: 1 }) };
    for (const researchPlanner of [undefined, made]) {
      for (const chatGpt of [true, false]) {
        const { register } = await server("on", researchPlanner === undefined ? {} : { researchPlanner });
        vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", "on");
        const result = await register({ subject: "auth0|dev", chatGpt }, { framing: { likely_question: "Does the rinse work?" } });
        expect(data(result).hrp_core).toBeDefined();
        expect((result.structuredContent as { askrigor_holds?: unknown }).askrigor_holds).toBeDefined();
      }
    }
  });
});
