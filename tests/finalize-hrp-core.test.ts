// Owner answer 412a, option c (24 November 2026): "Fetching HRP gives a signed slip, and the final check adds a note when
// none is shown. It never blocks, so the six checks that can stop an answer stay six." The registration that hands HRP's
// core over signs it into the plain answer's receipt; load_protocol gives a receipt of its own for it; and the final check,
// only while ASKRIGOR_HRP_CORE holds for the account, gives one note when the research shows neither. Invented fixtures.
import { runInNewContext } from "node:vm";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FINAL_CHECK_PANEL_RENDER_SOURCE } from "../apps/research-mcp/src/final-check-panel.js";
import { HRP_CORE_LOAD_FIRST, HRP_CORE_NOT_SHOWN, HRP_CORE_RECEIPT_USE, hrpCoreDigest } from "../apps/research-mcp/src/hrp-core.js";
import { currentHrpCore, registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { finalizeResearch, plainAnswerClaimDigest, repeatedNotesLine, type FinalizeResearchInput, type FinalizeResearchOptions }
  from "../apps/research-mcp/src/research-finalization-gate.js";
import { researchPlanOf, type ResearchPlanner } from "../apps/research-mcp/src/research-planner.js";
import { issueResearchReceipt, plainAnswerAccountBinding, receiptIssueOrder, researchMapAccountBinding, researchTargetDigest,
  verifyResearchReceipt, type ResearchReceiptClaims } from "../apps/research-mcp/src/research-receipts.js";
import { goOnMark, type ResearchMenuInput } from "../apps/research-mcp/src/research-steering.js";
import { createResearchTrialWindows } from "../apps/research-mcp/src/research-trial.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { withSourceReading } from "./helpers/source-reading.js";

const SECRET = "finalize-hrp-core-test-secret-0123456789abcdef";
const TARGET = "Whether a walnut-leaf rinse lowers foot sweating in adults";
const CLAIMS = ["A walnut-leaf rinse has never been tested for foot sweating."];
const DOI = "10.1000/rinse-trial";
const DIGEST = "0123456789abcdef";
const KEY = "a".repeat(64);
const ACCOUNT = plainAnswerAccountBinding(SECRET, KEY);

afterEach(() => {
  vi.unstubAllEnvs();
});

// The gate ----------------------------------------------------------------------------------------------------------

const NOW = new Date("2026-11-24T12:00:00Z");
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: ResearchReceiptClaims, minutesAgo = 0) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now: () => new Date(NOW.getTime() - minutesAgo * 60_000) });
const plain = (claims: ResearchReceiptClaims = {}, minutesAgo = 60) => sign("plain_answer", { claims: CLAIMS.map(plainAnswerClaimDigest),
  text: "0".repeat(64), target: researchTargetDigest(TARGET), acct: ACCOUNT, t: 1_000, ...claims }, minutesAgo);
const slip = (t = 500, minutesAgo = 90) => sign("protocol_core", { hrp: DIGEST, t }, minutesAgo);
const audit = (t = 2_000) => sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields", t }, 20);
const declaration = { status: "not_applicable" as const, reason: "Synthetic fixture isolates HRP's core." };
const ANSWER = "In three large trials, the rinse did not lower sweating.";
const input = (receipts: string[], overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput =>
  withSourceReading(withCommunitySkip({
    receipts, research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates HRP's core.",
    commercial_review_applicability: declaration, intervention_identity: declaration, lab_preparation: declaration,
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates HRP's core." },
    key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: `[Trial](https://doi.org/${DOI}) was read in full.\n\n${ANSWER}`,
    plain_answer_comparison: [{ claim: CLAIMS[0]!, outcome: "corrected", answer_quote: ANSWER, sources: [DOI] }],
    ...overrides,
  }));
const run = (receipts: string[], on = true, options: Partial<FinalizeResearchOptions> = {}, overrides: Partial<FinalizeResearchInput> = {}) =>
  finalizeResearch(input(receipts, overrides), { secret: SECRET, now: () => NOW, plainAnswer: { note: true, account: ACCOUNT },
    ...(on ? { hrpCore: { account: ACCOUNT } } : {}), ...options });
const noted = (result: ReturnType<typeof run>) => (result.notes ?? []).filter((note) => note === HRP_CORE_NOT_SHOWN).length;

class Element {
  children: Element[] = [];
  private text = "";
  constructor(readonly tagName: string) {}
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  appendChild(child: Element): Element { this.children.push(child); return child; }
  replaceChildren(): void { this.children = []; this.text = ""; }
}
/** Every line of the panel, each as it reads, but the AI's own folded notes. */
function panelLines(result: unknown): string[] {
  const root = new Element("main");
  const doc = { getElementById: () => root, createElement: (tag: string) => new Element(tag) };
  runInNewContext(`${FINAL_CHECK_PANEL_RENDER_SOURCE}\nrenderFinalCheck(document, result);`, { document: doc, result });
  return root.children.filter(({ textContent }) => !textContent.startsWith("Notes for the AI")).map(({ textContent }) => textContent);
}

describe("the final check's note on HRP's core (owner answer 412a, option c)", () => {
  it("is given once for research with no receipt of it, and only while the switch holds for the account", () => {
    const result = run([plain(), audit()]);
    expect(noted(result)).toBe(1);
    expect(HRP_CORE_NOT_SHOWN).toContain("can't tell whether they were; loading them");
    expect(noted(run([plain(), audit()], false))).toBe(0);
    // Also for an answer with no plain answer, and one whose draft is missing steps.
    expect(noted(run([audit()]))).toBe(1);
    expect(noted(run([plain(), audit()], true, {}, { plain_answer_comparison: undefined }))).toBe(1);
  });

  it("is not given with the registration's receipt, or with load_protocol's, whenever that was given", () => {
    expect(noted(run([plain({ hrp: DIGEST }), audit()]))).toBe(0);
    expect(noted(run([plain(), slip(), audit()]))).toBe(0);
    expect(noted(run([plain(), audit(), slip(9_000)]))).toBe(0);
    // The registration that handed it over, passed with a later one for the corrected target that did not.
    expect(noted(run([plain({ hrp: DIGEST, target: researchTargetDigest("Another target"), t: 900 }), plain(), audit()]))).toBe(0);
    // Another account's registration shows nothing of this one's; nor does anything that is not the digest, or is
    // another kind of receipt, or did not verify.
    expect(noted(run([plain({ hrp: DIGEST, acct: plainAnswerAccountBinding(SECRET, "b".repeat(64)) }), audit()]))).toBe(1);
    for (const hrp of ["1", "true", DIGEST.slice(1), `${DIGEST}0`, DIGEST.toUpperCase()]) {
      expect(noted(run([plain({ hrp }), audit()])), hrp).toBe(1);
    }
    expect(noted(run([plain(), sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields", t: 2_000, hrp: DIGEST }, 20)]))).toBe(1);
    expect(noted(run([plain(), `${slip()}x`, audit()]))).toBe(1);
  });

  it("is not given for a call with no research receipt, whatever else it passes", () => {
    for (const receipts of [[], [plain()], [plain(), sign("research_map", { acct: researchMapAccountBinding(SECRET, KEY), t: 3_000 })]]) {
      expect(noted(run(receipts))).toBe(0);
    }
  });

  it("changes no status, step, limit or line of the panel, with a check that passes and with one that does not", () => {
    for (const overrides of [{}, { plain_answer_comparison: undefined }, { answer_draft: "" }] as Array<Partial<FinalizeResearchInput>>) {
      const on = run([plain(), audit()], true, {}, overrides);
      const off = run([plain(), audit()], false, {}, overrides);
      expect(noted(on)).toBe(1);
      expect((on.notes ?? []).filter((note) => note !== HRP_CORE_NOT_SHOWN)).toEqual(off.notes ?? []);
      // All that is signed for this call apart from its notes, which the carried state counts.
      const { notes: _on, carry_forward: _c, round_token: _r, finalization_receipt: _f, ...rest } = on;
      const { notes: _off, carry_forward: _c2, round_token: _r2, finalization_receipt: _f2, ...before } = off;
      const strip = (value: object) => JSON.parse(JSON.stringify(value, (key, entry: unknown) =>
        key === "turn" || key === "turn_notes" ? undefined : entry)) as unknown;
      expect(strip(rest)).toEqual(strip(before));
      expect(panelLines(on)).toEqual(panelLines(off));
    }
    const passing = run([plain(), audit()]);
    expect(passing).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    const strong = (token: string) => {
      const verified = verifyResearchReceipt(token, { secret: SECRET, now: () => NOW });
      return verified.ok ? verified.claims : undefined;
    };
    expect(strong(passing.finalization_receipt!)).toEqual(strong(run([plain(), audit()], false).finalization_receipt!));
  });

  it("is a note about the call: given once in a turn, and not listed to the reader with the ledger on", () => {
    const first = run([plain(), audit()], true, { findingsLedger: { account: KEY } });
    expect(noted(first)).toBe(1);
    const entry = first.check_findings!.findings.find(({ text }) => text === HRP_CORE_NOT_SHOWN);
    expect(entry).toMatchObject({ reader: false });
    const again = run([plain(), audit()], true, {}, { round_token: first.round_token, carried_state: first.carry_forward } as Partial<FinalizeResearchInput>);
    expect(noted(again)).toBe(0);
    expect(again.notes?.join("\n")).toContain("an earlier check of this turn gave");
    expect(repeatedNotesLine(1)).toContain("One note an earlier check of this turn gave is not repeated.");
    // The slip settles it.
    const shown = run([plain(), slip(9_000), audit()], true, { findingsLedger: { account: KEY } });
    expect(shown.check_findings!.findings.some(({ text }) => text === HRP_CORE_NOT_SHOWN)).toBe(false);
  });
});

describe("a receipt of HRP's core is no research (owner answer 412a, option c)", () => {
  it("does not begin the research, so a plain answer registered after it is compared, and no time is counted from it", () => {
    const bare = run([plain(), audit()], false);
    for (const on of [true, false]) {
      const result = run([slip(), plain(), audit()], on);
      expect(result).toMatchObject({ status: bare.status, plain_answer: { status: "registered", claims: 1 } });
      expect(result.plain_answer_note).toBe(bare.plain_answer_note);
      expect(result.reading_summary).toEqual(bare.reading_summary);
      expect(result.receipts_rejected).toEqual([]);
    }
    expect(bare.plain_answer_note).toContain("The research took about 20 minutes");
    // Alone, it is not research: no reading is counted, and no note is due.
    expect(run([slip(), plain()]).reading_summary).toBeUndefined();
    expect(noted(run([slip(), plain()]))).toBe(0);
  });

  it("counts in no research count: a saved card's stamp, and a map filed after the research began", () => {
    const counted = (receipts: string[]) => {
      const verified = verifyResearchReceipt(run(receipts).finalization_receipt!, { secret: SECRET, now: () => NOW });
      return verified.ok ? verified.claims.receipts : undefined;
    };
    expect(counted([slip(), plain(), audit()])).toBe(counted([plain(), audit()]));
    const map = sign("research_map", { acct: researchMapAccountBinding(SECRET, KEY), t: 1_500 }, 30);
    const filed = (receipts: string[]) => run(receipts, true, { researchMap: { mode: "remind", account: researchMapAccountBinding(SECRET, KEY) } })
      .research_map?.status;
    // A map filed after the core was loaded but before any research is not this research's, as without the slip.
    expect(filed([slip(), plain(), map, audit()])).toBe(filed([plain(), map, audit()]));
    expect(filed([slip(), plain(), map, audit()])).toBe("not_filed");
  });
});

// The tools ---------------------------------------------------------------------------------------------------------

const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};
type Result = CallToolResult & { structuredContent?: Record<string, unknown> };
const texts = (result: Result): string[] => result.content.flatMap((block) => block.type === "text" ? [block.text] : []);

async function server(mode: string, options: Partial<RegisterToolsOptions> = {}) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  vi.stubEnv("ASKRIGOR_HRP_CORE", mode);
  const access = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
    identitySecret: new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes") });
  for (const subject of ["auth0|dev", "auth0|person"]) await access.acceptFreeContributor(subject, AGREEMENT);
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", access.accountKeyForSubject("auth0|dev"));
  const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
  registerTools({ registerTool: (name: string, _config: unknown, execute: (input: unknown, extra?: unknown) => Promise<CallToolResult>) => {
    handlers.set(name, execute);
  }, registerResource: () => undefined } as unknown as McpServer, { mcpSurface: "/mcp", researchContributorAccessService: access,
    findingsLibrary: false, ...options });
  /** subject null: a call with no sign-in, whose account cannot be known. */
  const call = async (tool: string, given: Record<string, unknown>, subject: string | null = "auth0|person", chatGpt = false): Promise<Result> =>
    await handlers.get(tool)!(given, { ...(subject === null ? {} : { authInfo: { token: "t", clientId: "c", scopes: ["research:use"],
      expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } }), ...(chatGpt ? { _meta: { "openai/locale": "en" } } : {}) }) as Result;
  const register = (later: Record<string, unknown> = {}, subject = "auth0|person", plainAnswer: Record<string, unknown> =
    { researchTarget: TARGET, text: `${CLAIMS[0]} Cotton socks help.`, claims: CLAIMS }) =>
    call("manage_research_access", { action: "register_plain_answer", plainAnswer, later_inputs: later }, subject);
  return { call, register, access };
}
const claimsOf = (receipt: string | undefined) => {
  const verified = verifyResearchReceipt(receipt ?? "", { secret: SECRET });
  return verified.ok ? { kind: verified.kind, order: receiptIssueOrder(verified), ...verified.claims } : undefined;
};
type Registered = { research_receipt: string; hrp_core?: { scope_sha256: string }; menu_outline?: { researchMenu: { plain_answer_receipt: string } };
  planned_later_inputs?: { researchMenu: ResearchMenuInput } };
const registered = (result: Result) => result.structuredContent as unknown as Registered;

describe("the plain answer's receipt signs HRP's core when its registration hands it over", () => {
  it("in the text, the fields and the menu's outline alike, and never when it is not handed over", async () => {
    const core = (await currentHrpCore())!;
    const { call, register } = await server("on");
    const result = await register();
    const { research_receipt: receipt, hrp_core, menu_outline } = registered(result);
    expect(hrp_core?.scope_sha256).toBe(core.sha256);
    expect(claimsOf(receipt)).toMatchObject({ kind: "plain_answer", hrp: hrpCoreDigest(core), target: researchTargetDigest(TARGET) });
    expect(menu_outline?.researchMenu.plain_answer_receipt).toBe(receipt);
    expect(texts(result)).toContain(`research_receipt: ${receipt}`);
    // Only one receipt is anywhere in the result.
    expect(new Set(JSON.stringify(result).match(/rr1~plain_answer~[^"\\\s]+/gu))).toEqual(new Set([receipt]));
    // Held already, too long to carry it, or off: the receipt says nothing of it.
    expect(claimsOf(registered(await register({ hrpCoreHeld: hrpCoreDigest(core) })).research_receipt)).not.toHaveProperty("hrp");
    // A research target of 5,000 characters of three bytes each, in ChatGPT's result.
    const loaded = await call("manage_research_access", { action: "register_plain_answer",
      plainAnswer: { researchTarget: "足".repeat(5_000), text: CLAIMS[0], claims: CLAIMS } }, "auth0|person", true);
    expect(loaded.structuredContent).toMatchObject({ ok: true });
    expect(texts(loaded)).toContain(HRP_CORE_LOAD_FIRST);
    expect(claimsOf(registered(loaded).research_receipt)).not.toHaveProperty("hrp");
    expect(claimsOf(registered(await (await server("off")).register()).research_receipt)).not.toHaveProperty("hrp");
  });

  const tasks = [{ task: "Read the rinse trial in full", kind: "full_text", could_change: "conclusion", sources: 1 },
    { task: "Search trials of the rinse", kind: "study_search", could_change: "conclusion", sources: 2 }];
  const planner = (lane: string, before?: () => Promise<unknown>): ResearchPlanner => ({ enabled: true, dailyCapUsd: 3,
    accountDailyCalls: 10, lane: async () => undefined, plan: async () => {
      await before?.();
      return { planning: { status: "planned", plan: researchPlanOf({ about: "A rinse made from walnut leaves.", steering_choice: "none",
        lane, tasks: lane === "light" ? tasks.slice(0, 1) : lane === "aside" ? [] : tasks, person_said_go_on: true }, 1, "sk-none", true)! },
      cached: false, costUsd: 0, milliseconds: 1 };
    } });

  it("in AskRigor's own menu and its mark, with an order from before the plan was made", async () => {
    const core = (await currentHrpCore())!;
    const made: { slip?: string } = {};
    const { call, register } = await server("on", { researchPlanner: planner("research", async () => {
      made.slip = /rr1~protocol_core~\S+/u.exec(texts(await call("load_protocol", { protocol: "hrp", section: "core" })).join("\n"))![0];
    }) });
    const result = await register({ asked: ["does the rinse work?", "keep going"] }, "auth0|dev");
    const { research_receipt: receipt, planned_later_inputs } = registered(result);
    expect(claimsOf(receipt)).toMatchObject({ hrp: hrpCoreDigest(core) });
    const menu = planned_later_inputs!.researchMenu;
    expect(menu.plain_answer_receipt).toBe(receipt);
    expect(menu.go_on_asked).toBe(goOnMark(menu.tasks, receipt, SECRET));
    expect(new Set(JSON.stringify(result).match(/rr1~plain_answer~[^"\\\s]+/gu))).toEqual(new Set([receipt]));
    // Research begun while the plan was made comes after it.
    expect(claimsOf(receipt)!.order).toBeLessThan(claimsOf(made.slip)!.order);
    const planned = await call("manage_research_access", { action: "plan_research", later_inputs: planned_later_inputs! }, "auth0|dev");
    expect(planned.structuredContent).toMatchObject({ researchMenu: { target_matches_plain_answer: true } });
    expect(planned.structuredContent).not.toHaveProperty("problems");
    // A plain look-up's receipt signs nothing of it, light or aside.
    for (const lane of ["light", "aside"]) {
      const look = registered(await (await server("on", { researchPlanner: planner(lane) })).register({ asked: ["q?", "go on"] }, "auth0|dev"));
      expect(claimsOf(look.research_receipt), lane).not.toHaveProperty("hrp");
      if (lane === "light") expect(look.planned_later_inputs!.researchMenu.plain_answer_receipt).toBe(look.research_receipt);
    }
  });
});

describe("load_protocol's receipt for HRP's core", () => {
  const slipIn = (result: Result) => /rr1~protocol_core~\S+/u.exec(texts(result).join("\n"))?.[0];

  it("comes in its text alone, with HRP's core whole, while the switch holds for the account", async () => {
    const core = (await currentHrpCore())!;
    const { call } = await server("on");
    const plainResult = await (await server("off")).call("load_protocol", { protocol: "hrp", section: "core" });
    vi.stubEnv("ASKRIGOR_HRP_CORE", "on");
    const result = await call("load_protocol", { protocol: "hrp", section: "core" });
    const slipGiven = slipIn(result)!;
    expect(claimsOf(slipGiven)).toMatchObject({ kind: "protocol_core", hrp: hrpCoreDigest(core) });
    expect(Object.keys(claimsOf(slipGiven)!).sort()).toEqual(["hrp", "kind", "order", "t"]);
    expect(texts(result)).toContain(`research_receipt: ${slipGiven} ${HRP_CORE_RECEIPT_USE}`);
    expect(result.structuredContent).toEqual(plainResult.structuredContent);
    // The exact bytes are the last text, as before, and everything else is as it was.
    expect(texts(result).at(-1)).toBe(core.text);
    expect(texts(result).filter((text) => !text.startsWith("research_receipt: "))).toEqual(texts(plainResult));
    const chatGpt = await call("load_protocol", { protocol: "hrp", section: "core" }, "auth0|person", true);
    expect(texts(chatGpt)).toHaveLength(2);
    expect(slipIn(chatGpt)).toBeDefined();
    expect(chatGpt.structuredContent).toEqual(plainResult.structuredContent);
    // A request that names the core among others gives it too, with the last page; the core's own digest, not the text's.
    const section = `${core.furtherSections[0]}, core`;
    const { page_count: pages, scope_sha256 } = (await call("load_protocol", { protocol: "hrp", section }))
      .structuredContent as { page_count: number; scope_sha256: string };
    expect(scope_sha256).not.toBe(core.sha256);
    for (let page = 1; page <= pages; page += 1) {
      const given = slipIn(await call("load_protocol", { protocol: "hrp", section, page }));
      expect(given === undefined, `${page} of ${pages}`).toBe(page < pages);
      if (given !== undefined) expect(claimsOf(given)).toMatchObject({ hrp: hrpCoreDigest(core) });
    }
  });

  it("comes with nothing else of the protocols", async () => {
    const { call } = await server("on");
    const index = (await call("load_protocol", { protocol: "hrp", section: "index" })).structuredContent as { core_sections: string[] };
    for (const request of [{ protocol: "hrp", section: "index" }, { protocol: "hrp" }, { protocol: "hrp", section: index.core_sections[0]! },
      { protocol: "hrp", section: index.core_sections.join(",") }, { protocol: "universal", section: "core" },
      { protocol: "hrp", section: "core", page: 9 }, { protocol: "hrp", section: "core,index" }, { protocol: "hrp", section: "NoSuchSection" }]) {
      expect(slipIn(await call("load_protocol", request)), JSON.stringify(request)).toBeUndefined();
    }
  });

  it("goes by the account's switch, and by the mode alone for a call with no account to ask about", async () => {
    const given = async (mode: string, subject: string | null, window?: boolean) => {
      const windows = createResearchTrialWindows();
      const { call, access } = await server(mode, { researchTrialWindows: windows });
      if (window !== undefined) windows.set(access.accountKeyForSubject("auth0|dev"), { claimAccounting: true, hrpCore: window, minutes: 9 });
      return slipIn(await call("load_protocol", { protocol: "hrp", section: "core" }, subject)) !== undefined;
    };
    for (const [mode, dev, person, unknown] of [["off", false, false, false], ["", false, false, false], ["trial", false, false, true],
      ["dev", true, false, true], ["on", true, true, true]] as const) {
      expect([await given(mode, "auth0|dev"), await given(mode, "auth0|person"), await given(mode, null)], mode)
        .toEqual([dev, person, unknown]);
    }
    expect(await given("trial", "auth0|dev", true)).toBe(true);
    expect(await given("trial", "auth0|dev", false)).toBe(false);
    expect(await given("trial", "auth0|person", true)).toBe(false);
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "");
    const { call } = await server("on");
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "");
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", "");
    expect(slipIn(await call("load_protocol", { protocol: "hrp", section: "core" }))).toBeUndefined();
  });
});

describe("finalize_research with HRP's core handed over", () => {
  it("notes research that shows no receipt of it, and is quiet with the registration's receipt or load_protocol's", async () => {
    const { call, register, access } = await server("on");
    const receipt = (later: ResearchReceiptClaims = {}) => issueResearchReceipt("study_audit", { id: DOI,
      status: "complete_no_unresolved_fields", t: Date.now() + 60_000, ...later }, { secret: SECRET });
    const check = async (receipts: string[], subject = "auth0|person") => {
      const result = await call("finalize_research", input(receipts) as unknown as Record<string, unknown>, subject);
      return ((result.structuredContent as { notes?: string[] }).notes ?? []).includes(HRP_CORE_NOT_SHOWN);
    };
    const handed = registered(await register()).research_receipt;
    expect(await check([handed, receipt()])).toBe(false);
    const held = registered(await register({ hrpCoreHeld: hrpCoreDigest((await currentHrpCore())!) })).research_receipt;
    expect(await check([held, receipt()])).toBe(true);
    // As the result says, the earlier registration's receipt goes with it.
    expect(await check([handed, held, receipt()])).toBe(false);
    const loaded = /rr1~protocol_core~\S+/u.exec(texts(await call("load_protocol", { protocol: "hrp", section: "core" })).join("\n"))![0];
    expect(await check([held, loaded, receipt()])).toBe(false);
    expect(await check([receipt()])).toBe(true);
    // Another account's registration is not this one's.
    expect(await check([handed, receipt()], "auth0|dev")).toBe(true);
    expect(access.accountKeyForSubject("auth0|dev")).not.toBe(access.accountKeyForSubject("auth0|person"));
    // Off, trial without a window, or dev for another account: nothing is said.
    for (const mode of ["off", "trial", "dev"]) {
      vi.stubEnv("ASKRIGOR_HRP_CORE", mode);
      expect(await check([receipt()]), mode).toBe(false);
    }
    expect(await check([receipt()], "auth0|dev")).toBe(true);
  });
});
