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
  HRP_CORE_END_CHARACTERS,
  HRP_CORE_LOAD_FIRST,
  HRP_CORE_NEXT_STEP,
  HRP_CORE_RECEIPT_NEXT_STEP,
  HRP_CORE_RECEIPT_USE,
  HRP_CORE_RESULT_LIMITS,
  HRP_CORE_STATUSES,
  HRP_CORE_WITH_PLAN,
  holdsHrpCore,
  hrpCoreDigest,
  hrpCoreEnd,
  hrpCoreStructured,
  hrpCoreText,
  type HrpCore,
} from "../apps/research-mcp/src/hrp-core.js";
import { withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { currentHrpCore, registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { createManageResearchAccessHandler, manageResearchAccessInputSchema, manageResearchAccessOutputSchema,
  type ResearchContributorToolOptions } from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { researchPlanOf, type ResearchPlanner } from "../apps/research-mcp/src/research-planner.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { goOnMark, menuDigest, type ResearchMenuInput } from "../apps/research-mcp/src/research-steering.js";
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

/** A planner whose reply is the one given, over a plan of one task that a light lane may have. */
const planner = (reply: Record<string, unknown>, followUp = false): ResearchPlanner => ({ enabled: true, dailyCapUsd: 3,
  accountDailyCalls: 10, lane: async () => undefined, plan: async () => ({ planning: { status: "planned", plan: researchPlanOf({
    about: "A rinse made from walnut leaves.", steering_choice: "none", tasks: [{ task: "Find trials of the rinse",
      kind: "full_text", could_change: "conclusion", sources: 1 }], ...reply }, 1, "sk-none", followUp)! }, cached: false, costUsd: 0,
  milliseconds: 1 }) });

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
type Registered = { hrp_core?: ReturnType<typeof hrpCoreStructured>; hrp_core_status?: string; next_step: string;
  research_receipt: string; planned_later_inputs?: { researchMenu: ResearchMenuInput } };
const data = (result: Result) => result.structuredContent as unknown as Registered;
/** A result without what it says it served of the core, which is nothing the AI is asked to do. */
const unmarked = (result: Result): Result => {
  const { hrp_core_status: _status, ...structuredContent } = result.structuredContent!;
  // Every app but ChatGPT gets the structured content as text too, as JSON.
  return { ...result, structuredContent, content: result.content.map((block) => block.type === "text" && block.text.startsWith("{")
    ? { ...block, text: JSON.stringify(JSON.parse(block.text), (key, value: unknown) => key === "hrp_core_status" ? undefined : value) }
    : block) };
};
const claimsOf = (receipt: string | undefined) => {
  const verified = verifyResearchReceipt(receipt ?? "", { secret: SECRET });
  return verified.ok ? { kind: verified.kind, ...verified.claims } : undefined;
};
const sizeOf = (result: Result, chatGpt: boolean): number => chatGpt
  ? Buffer.byteLength(JSON.stringify({ content: result.content, structuredContent: result.structuredContent }), "utf8")
  : JSON.stringify(result.structuredContent).length;
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
      sections: core.sections, further_sections: core.furtherSections, how_to_use: expect.any(String),
      characters: Array.from(core.text).length, ends_with: hrpCoreEnd(core), text: core.text });
    expect(data(result).hrp_core_status).toBe("here");
    expect(JSON.stringify(result).split(JSON.stringify(core.text).slice(1, 300))).toHaveLength(2);
    expect(texts(result).filter((text) => text === hrpCoreText(core, true))).toHaveLength(1);
    expect(texts(result).join("\n")).not.toContain(core.text.slice(0, 200));
    // What the paragraph and the field beside the text say: what the rules are, when to read them, the further sections in
    // one call, not again unless the text was cut short, and the digest.
    for (const said of [hrpCoreText(core, true), hrpCoreText(core, false)]) {
      for (const part of ["They are the rules this research and its answer are held to, not background. Read all of them now, " +
        "before your next call.", "choose them for this question from hrp_core.further_sections and load them now in one " +
        "load_protocol call (protocol \"hrp\", section the names separated by commas), before your first search.",
        "When this result says to ask the person first, ask first, and load them once they have answered.",
        "If what you see of hrp_core.text doesn't end with hrp_core.ends_with, load the core with load_protocol (protocol " +
        "\"hrp\", section \"core\"); otherwise do not load the core again in this conversation.",
        `later_inputs.hrpCoreHeld "${hrpCoreDigest(core)}"`]) {
        expect(said).toContain(part);
      }
    }
    expect(hrpCoreText(core, true)).toContain("hrp_core.text in its structured content, not in this text");
    expect(data(result).hrp_core!.how_to_use).toBe("HRP's core rules, exact canonical text: the rules this research and its answer " +
      "are held to. next_step says when to read them and what to load. If you register the plain answer again in this " +
      `conversation, give later_inputs.hrpCoreHeld "${hrpCoreDigest(core)}", so it is not sent again.`);
    // What the paragraph says of the Architecture section stands there.
    expect(core.text).toContain("Load and apply the smallest set of modules the actual question needs");
    for (const part of ["Before your next call, read all of HRP's core rules", "in one load_protocol call (protocol \"hrp\", section " +
      "the names separated by commas)", "unless hrp_core.text doesn't end with hrp_core.ends_with"]) {
      expect(HRP_CORE_NEXT_STEP).toContain(part);
    }
    expect(data(result).next_step.endsWith(` ${HRP_CORE_NEXT_STEP}`)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify({ content: result.content, structuredContent: result.structuredContent }), "utf8"))
      .toBeLessThanOrEqual(HRP_CORE_RESULT_LIMITS.chatGptBytes);
    // The registration itself is as without it: the same texts, and the same fields.
    const off = await (await server("off")).register({ chatGpt: true });
    expect(texts(result).filter((text) => text !== hrpCoreText(core, true)).join("\n").replaceAll(data(result).research_receipt, "R"))
      .toBe(texts(off).join("\n").replaceAll(data(off).research_receipt, "R"));
    const { hrp_core: _core, hrp_core_status: _status, ...rest } = data(result);
    expect(JSON.stringify({ ...rest, next_step: rest.next_step.slice(0, -HRP_CORE_NEXT_STEP.length - 1) })
      .replaceAll(rest.research_receipt, "R")).toBe(JSON.stringify(data(off)).replaceAll(data(off).research_receipt, "R"));
  });

  it("gives the text's length and its last characters, whole ones, so a text cut short can be seen to be", async () => {
    const core = (await currentHrpCore())!;
    const { characters, ends_with, text } = hrpCoreStructured(core);
    expect(HRP_CORE_END_CHARACTERS).toBe(60);
    expect(Array.from(ends_with)).toHaveLength(60);
    expect(text.endsWith(ends_with)).toBe(true);
    expect(characters).toBe(Array.from(text).length);
    // Characters, not the halves of one; a short text is its own end.
    const socks = { ...core, text: "\u{1F9E6}".repeat(70) };
    expect(hrpCoreStructured(socks)).toMatchObject({ characters: 70, ends_with: "\u{1F9E6}".repeat(60) });
    expect(hrpCoreEnd({ text: "<A/>" })).toBe("<A/>");
    // Both stand before the text, which is the last thing the structured content carries.
    const keys = Object.keys(hrpCoreStructured(core));
    expect(keys.slice(-3)).toEqual(["characters", "ends_with", "text"]);
    const result = await (await server("on")).register({ chatGpt: true });
    expect(Object.keys(result.structuredContent!).at(-1)).toBe("hrp_core");
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
      expect(data(held).hrp_core_status).toBe("already_held");
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
    expect(data(await off.register())).not.toHaveProperty("hrp_core_status");
  });

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
        expect(on.structuredContent).toMatchObject({ research_plan: { lane }, hrp_core_status: "not_for_this" });
        expect(timeless(unmarked(on))).toBe(timeless(await run("off")));
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
    expect(Object.keys(manageResearchAccessOutputSchema.shape)).not.toContain("hrp_core_status");
    expect(HRP_CORE_STATUSES).toEqual(["here", "with_plan_research", "load_it", "already_held", "not_for_this"]);
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

  it("keeps all that AskRigor holds for the question, and carries the core only beside all of it", async () => {
    for (const chatGpt of [true, false]) {
      const askrigorHolds = { atlas: async () => findings(3, 3_000), pointers: () => OWNER_POINTERS };
      const held = await (await handler({ askrigorHolds, hrpCoreFor: () => false }))(chatGpt);
      expect(shown(held)).toBe(3);
      // No room for both: what is held stands whole, as without the core, and a sentence says to load the core first.
      const result = await (await handler({ askrigorHolds }))(chatGpt);
      expect(data(result)).not.toHaveProperty("hrp_core");
      expect(data(result).hrp_core_status).toBe("load_it");
      expect(result.structuredContent!.askrigor_holds).toEqual(held.structuredContent!.askrigor_holds);
      expect(texts(result).filter((text) => text === HRP_CORE_LOAD_FIRST)).toHaveLength(1);
      expect(clientResultBytes(result)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
      // Room for both: the core beside everything held, to the last byte the app takes.
      const limit = chatGpt ? HRP_CORE_RESULT_LIMITS.chatGptBytes : HRP_CORE_RESULT_LIMITS.structuredCharacters;
      const at = async (length: number) => await (await handler({ askrigorHolds: { atlas: async () => findings(1, length) } }))(chatGpt);
      let [fits, over] = [1, 15_000];
      while (over - fits > 1) {
        const middle = Math.floor((fits + over) / 2);
        if (data(await at(middle)).hrp_core === undefined) over = middle; else fits = middle;
      }
      const most = await at(fits);
      expect([data(most).hrp_core_status, data(most).hrp_core?.text, shown(most)]).toEqual(["here", CORE.text, 1]);
      expect(sizeOf(most, chatGpt)).toBeLessThanOrEqual(limit);
      // A receipt's own length may differ by a character or two from one call to the next.
      expect(limit - sizeOf(most, chatGpt)).toBeLessThan(8);
      const next = await at(over);
      expect([data(next).hrp_core_status, data(next).hrp_core, shown(next)]).toEqual(["load_it", undefined, 1]);
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
      expect(data(result).hrp_core_status).toBe("load_it");
      expect(texts(result).filter((text) => text === HRP_CORE_LOAD_FIRST)).toHaveLength(1);
      expect(data(result).next_step.endsWith(` ${HRP_CORE_LOAD_FIRST}`)).toBe(true);
      // What AskRigor holds is there, within the limit every other registration has.
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
      expect(data(result).hrp_core_status).toBe("load_it");
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
        expect(data(result).hrp_core_status).toBe("here");
        expect((result.structuredContent as { askrigor_holds?: unknown }).askrigor_holds).toBeDefined();
      }
    }
  });
});

// The review of 24 November 2026, F4: what AskRigor holds is kept; where that leaves the core no room and AskRigor planned
// the research, the core comes with the next call's result, plan_research's, on the research's first menu.
describe("the core with plan_research, when the registration has no room for it", () => {
  // Long enough to leave the registration of a planned research no room for the core, in either kind of app: its menu, its
  // summary and its next call each quote the research target.
  const LONG = { ...PLAIN, researchTarget: `Whether ${"a walnut-leaf rinse lowers foot sweating in adults and ".repeat(90)}`.slice(0, 4_800).trim() };
  const asked = { asked: "does the rinse work?" };
  type Plan = { hrp_core?: ReturnType<typeof hrpCoreStructured>; hrp_core_status?: string; next_step: string; research_receipt?: string;
    researchMenu: { next: string; menu_digest: string } };
  const planData = (result: Result) => result.structuredContent as unknown as Plan;
  const plannedBy = async (mode: string, reply: Record<string, unknown> = { lane: "research" }, options: Partial<RegisterToolsOptions> = {}) => {
    const made = await server(mode, { researchPlanner: planner(reply, true), ...options });
    const planned = (later: unknown, chatGpt = false) => made.call("manage_research_access", { action: "plan_research",
      later_inputs: later as Record<string, unknown> }, { subject: "auth0|dev", chatGpt });
    const menu = async (chatGpt: boolean, later: Record<string, unknown> = {}, plainAnswer: Record<string, unknown> = LONG) => {
      const registered = await made.register({ subject: "auth0|dev", chatGpt }, { ...asked, ...later }, plainAnswer);
      expect(registered.isError, texts(registered)[0]).not.toBe(true);
      return { registered, later: data(registered).planned_later_inputs! };
    };
    return { ...made, planned, menu };
  };

  it("says so in the registration, whose receipt, menu and mark say it too, and shows all that is held", async () => {
    for (const chatGpt of [true, false]) {
      const { register } = await plannedBy("on", { lane: "research", person_said_go_on: true });
      const result = await register({ subject: "auth0|dev", chatGpt }, { asked: ["does the rinse work?", "keep going"] }, LONG);
      const { research_receipt: receipt, planned_later_inputs, hrp_core, hrp_core_status } = data(result);
      expect([hrp_core, hrp_core_status]).toEqual([undefined, "with_plan_research"]);
      expect(texts(result).filter((text) => text === HRP_CORE_WITH_PLAN)).toHaveLength(1);
      expect(data(result).next_step.endsWith(` ${HRP_CORE_WITH_PLAN}`)).toBe(true);
      expect(texts(result).join("\n")).not.toContain(HRP_CORE_LOAD_FIRST);
      const signed = claimsOf(receipt)!;
      expect(signed).toMatchObject({ kind: "plain_answer", core: "plan" });
      expect(signed).not.toHaveProperty("hrp");
      const menu = planned_later_inputs!.researchMenu;
      expect(menu.plain_answer_receipt).toBe(receipt);
      expect(menu.go_on_asked).toBe(goOnMark(menu.tasks, receipt, SECRET));
      expect(new Set(JSON.stringify(result).match(/rr1~plain_answer~[^"\\\s]+/gu))).toEqual(new Set([receipt]));
      // The registration is otherwise as without the core.
      const off = await (await plannedBy("off", { lane: "research", person_said_go_on: true }))
        .register({ subject: "auth0|dev", chatGpt }, { asked: ["does the rinse work?", "keep going"] }, LONG);
      const plainTexts = (from: Result, dropped: string) => texts(from).filter((text) => text !== dropped && !text.startsWith("{"))
        .join("\n").replaceAll(data(from).research_receipt, "R").replace(/"go_on_asked":"[^"]+"/gu, "G");
      expect(plainTexts(result, HRP_CORE_WITH_PLAN)).toBe(plainTexts(off, HRP_CORE_WITH_PLAN));
    }
  });

  it("is in the first menu's result, exact, with load_protocol's receipt, where and when said in text and next_step", async () => {
    const core = (await currentHrpCore())!;
    for (const chatGpt of [true, false]) {
      const { menu, planned } = await plannedBy("on");
      const { later } = await menu(chatGpt);
      const result = await planned(later, chatGpt);
      expect(result.isError, texts(result)[0]).not.toBe(true);
      const { hrp_core, hrp_core_status, research_receipt: slip, next_step } = planData(result);
      expect(hrp_core_status).toBe("here");
      expect(hrp_core).toEqual(hrpCoreStructured(core));
      expect(sha256(hrp_core!.text)).toBe(core.sha256);
      expect(claimsOf(slip)).toMatchObject({ kind: "protocol_core", hrp: hrpCoreDigest(core) });
      expect(texts(result)).toContain(hrpCoreText(core, chatGpt));
      expect(texts(result)).toContain(`research_receipt: ${slip} ${HRP_CORE_RECEIPT_USE}`);
      expect(next_step.endsWith(` ${HRP_CORE_NEXT_STEP} ${HRP_CORE_RECEIPT_NEXT_STEP}`)).toBe(true);
      expect(HRP_CORE_NEXT_STEP).toContain("before your first search");
      // ChatGPT reads it in the structured content; every other app's text ends with its exact bytes.
      expect(texts(result).at(-1) === core.text).toBe(!chatGpt);
      expect(JSON.stringify(result.structuredContent).split(JSON.stringify(core.text).slice(1, 300))).toHaveLength(2);
      expect(sizeOf(result, chatGpt)).toBeLessThanOrEqual(chatGpt ? HRP_CORE_RESULT_LIMITS.chatGptBytes
        : HRP_CORE_RESULT_LIMITS.structuredCharacters);
      // Everything else is as without it: the menu, its texts and its fields.
      vi.stubEnv("ASKRIGOR_HRP_CORE", "off");
      const off = await planned(later, chatGpt);
      const { hrp_core: _core, hrp_core_status: _status, research_receipt: _slip, ...rest } = planData(result);
      expect({ ...rest, next_step: next_step.slice(0, -HRP_CORE_NEXT_STEP.length - HRP_CORE_RECEIPT_NEXT_STEP.length - 2) })
        .toEqual(planData(off));
      expect(texts(off)[0]).toBe(texts(result)[0]);
    }
  });

  it("comes once: not with an answer to the menu, a re-plan or a menu that names an earlier one", async () => {
    const { menu, planned } = await plannedBy("on");
    const { later } = await menu(true);
    const { researchMenu } = later;
    const first = await planned(later, true);
    const digest = planData(first).researchMenu.menu_digest;
    expect(digest).toBe(menuDigest(researchMenu.tasks, SECRET));
    for (const next of [{ ...researchMenu, menu_digest: digest }, { ...researchMenu, menu_digest: digest, done: [1] },
      { ...researchMenu, done: [1] }, { ...researchMenu, allocation: [{ task: 1, minutes: 5 }], person_answered: true }]) {
      const result = await planned({ researchMenu: next }, true);
      expect(result.isError, texts(result)[0]).not.toBe(true);
      expect(planData(result), JSON.stringify(next)).not.toHaveProperty("hrp_core");
      expect(planData(result)).not.toHaveProperty("hrp_core_status");
      expect(planData(result)).not.toHaveProperty("research_receipt");
      expect(texts(result).join("\n")).not.toContain("HRP's core rules");
    }
    // A menu handed back for a question it must name gets nothing of it; the corrected one is the first.
    const { steering_choice: _choice, ...unnamed } = researchMenu;
    const refused = await planned({ researchMenu: unnamed }, true);
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).not.toContain("hrp_core");
  });

  it("says to load it when that result has no room for it either, or the server cannot read it", async () => {
    const huge: HrpCore = { version: "20.0.0", sha256: sha256("huge"), sections: ["Purpose"], furtherSections: ["EvidenceLayers"],
      text: "x".repeat(58_000) };
    const access = await service();
    const receipts: ResearchContributorToolOptions["plainAnswer"] = {
      sign: (claims) => issueResearchReceipt("plain_answer", claims, { secret: SECRET }),
      read: (receipt) => ({ target: String(claimsOf(receipt)!.target), issuedAt: new Date().toISOString(),
        ...(claimsOf(receipt)!.core === "plan" ? { hrpCore: "plan" as const } : {}) }),
    };
    for (const chatGpt of [true, false]) {
      for (const read of [async () => huge, async () => undefined, async () => { throw new Error("synthetic"); }]) {
        let core: () => Promise<HrpCore | undefined> = async () => huge;
        const execute = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, createManageResearchAccessHandler({
          service: access, plainAnswer: receipts, menuDigestSecret: () => SECRET,
          devAccountKeys: () => new Set([researchAccountReference(access.accountKeyForSubject("auth0|dev"))]),
          researchPlanner: () => planner({ lane: "research" }), hrpCore: async () => await core(), hrpCoreFor: () => true,
          hrpCoreReceipt: () => "rr1~never" })).execute;
        const call = async (input: Record<string, unknown>) => await execute(input, extraOf("auth0|dev", chatGpt) as never) as Result;
        const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: asked });
        expect(data(registered).hrp_core_status).toBe("with_plan_research");
        core = read;
        const result = await call({ action: "plan_research", later_inputs: data(registered).planned_later_inputs! });
        expect(result.isError, texts(result)[0]).not.toBe(true);
        expect(planData(result).hrp_core_status).toBe("load_it");
        expect(planData(result)).not.toHaveProperty("hrp_core");
        expect(planData(result)).not.toHaveProperty("research_receipt");
        expect(texts(result).filter((text) => text === HRP_CORE_LOAD_FIRST)).toHaveLength(1);
        expect(planData(result).next_step.endsWith(` ${HRP_CORE_LOAD_FIRST}`)).toBe(true);
      }
    }
  });

  it("gives a light menu none, and one whose registration handed it over, or whose AI holds it, none again", async () => {
    const core = (await currentHrpCore())!;
    for (const chatGpt of [true, false]) {
      const light = await plannedBy("on", { lane: "light" });
      const look = await light.menu(chatGpt, {}, PLAIN);
      expect(data(look.registered).hrp_core_status).toBe("not_for_this");
      const looked = await light.planned(look.later, chatGpt);
      expect(planData(looked)).toMatchObject({ hrp_core_status: "not_for_this", researchMenu: { lane: "light" } });
      vi.stubEnv("ASKRIGOR_HRP_CORE", "off");
      expect(unmarked(looked)).toEqual(await light.planned(look.later, chatGpt));
      // The registration carried it: the next call says so and serves nothing.
      const { menu, planned } = await plannedBy("on");
      const here = await menu(chatGpt, {}, PLAIN);
      expect(data(here.registered).hrp_core_status).toBe("here");
      // The AI said this conversation holds it.
      const held = await menu(chatGpt, { hrpCoreHeld: hrpCoreDigest(core) });
      expect(data(held.registered).hrp_core_status).toBe("already_held");
      expect(claimsOf(data(held.registered).research_receipt)).toMatchObject({ core: "held" });
      for (const { later } of [here, held]) {
        vi.stubEnv("ASKRIGOR_HRP_CORE", "on");
        const result = await planned(later, chatGpt);
        expect(planData(result).hrp_core_status).toBe("already_held");
        vi.stubEnv("ASKRIGOR_HRP_CORE", "off");
        expect(unmarked(result)).toEqual(await planned(later, chatGpt));
      }
    }
  });

  it("serves nothing for an account AskRigor does not plan for, a plan of the AI's own, or while the switch is off", async () => {
    // An ordinary account, and a dev account whose plan was not made: told at registration to load it first.
    const own = await server("on", { researchPlanner: { ...planner({ lane: "research" }), plan: async () => ({ planning: {
      status: "skipped", reason: "timeout" }, cached: false, costUsd: 0, milliseconds: 1 }) } });
    for (const subject of ["auth0|person", "auth0|dev"]) {
      const registered = await own.register({ subject, chatGpt: true }, asked, { ...LONG, researchTarget: "足".repeat(5_000) });
      expect(data(registered).hrp_core_status, subject).toBe("load_it");
      expect(texts(registered)).toContain(HRP_CORE_LOAD_FIRST);
      const result = await own.call("manage_research_access", { action: "plan_research", later_inputs: { researchMenu: {
        research_target: "足".repeat(5_000), plain_answer_receipt: data(registered).research_receipt, steering_choice: "none",
        tasks: [{ task: "Find trials of the rinse", kind: "study_search", could_change: "conclusion" }] } } }, { subject, chatGpt: true });
      expect(result.isError, texts(result)[0]).not.toBe(true);
      for (const field of ["hrp_core", "hrp_core_status", "research_receipt"]) expect(planData(result)).not.toHaveProperty(field);
    }
    // A window closed, or a switch turned off, since the registration: the call is as without it.
    const { menu, planned } = await plannedBy("on");
    const { later } = await menu(true);
    vi.stubEnv("ASKRIGOR_HRP_CORE", "off");
    for (const field of ["hrp_core", "hrp_core_status", "research_receipt"]) expect(planData(await planned(later, true))).not.toHaveProperty(field);
    // Nor without the plain answer's receipt, or with one that is not this account's.
    vi.stubEnv("ASKRIGOR_HRP_CORE", "on");
    for (const plain_answer_receipt of [undefined, "rr1~plain_answer~x~1~y"]) {
      expect(planData(await planned({ researchMenu: { ...later.researchMenu, plain_answer_receipt } }, true))).not.toHaveProperty("hrp_core");
    }
  });
});
