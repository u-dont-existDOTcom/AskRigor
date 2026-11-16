import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import Anthropic from "@anthropic-ai/sdk";
import {
  InMemoryResearchContributorAccessStore,
  InMemoryResearchDossierStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  deterministicUuid,
} from "@askrigor/evidence-repository";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dossierPrivacyReadingFromEnv } from "../apps/research-mcp/src/config.js";
import {
  DOSSIER_PRIVACY_READING_LIMITS,
  DOSSIER_PRIVACY_READING_MODEL,
  DOSSIER_PRIVACY_READING_RESERVED_USD,
  DOSSIER_PRIVACY_READING_RUBRIC,
  type DossierPrivacyReader,
  type DossierText,
} from "../apps/research-mcp/src/findings/dossier-privacy-reading.js";
import { dossierReadingTexts, researchDossierInputSchema, saveResearchDossier,
  type ResearchDossierSaveRequest } from "../apps/research-mcp/src/findings/dossier.js";
import { registerTools } from "../apps/research-mcp/src/register-tools.js";
import { PRICES, createResearchPlanner, type ResearchPlanner, type ResearchPlannerClient }
  from "../apps/research-mcp/src/research-planner.js";
import { discoveryQueryDigest, issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { withSourceReading } from "./helpers/source-reading.js";

// AskRigor#477 stage 1, Codex's final check: the optional meaning-based privacy reading before a dossier is stored, off
// by default (ASKRIGOR_DOSSIER_PRIVACY_READING=on), on the research planner's own API path. No test reaches the network.

const SECRET = "research-dossier-privacy-reading-secret-0123456789";
const NOW = new Date("2026-11-16T18:00:00.000Z");
const ACCOUNT = "c".repeat(64);
const TARGET = researchTargetDigest("Magnesium for night cramps in adults");
const ANSWER = createHash("sha256").update("The checked answer.", "utf8").digest("hex");
const receipt = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Record<string, string | number | string[]>) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now: () => NOW });
const DOSSIER = {
  scope: "public",
  value: { saves_work: "substantial", adds: ["f1"], reason: "It weighs a trial against a null result." },
  question: "Does magnesium reduce night cramps in adults?",
  topic: { key: "night-cramps", name: "Night cramps" },
  searches: [{ id: "q1", database: "pubmed", query: "magnesium night cramps" }],
  studies: [{ id: "s1", identifiers: ["PMID 12121212"], kind: "human_trial", population: "Older adults", decision: "used" }],
  results: [{ id: "r1", study: "s1", outcome: "Cramps per week", direction: "no_difference", certainty: "moderate" }],
  findings: [{ id: "f1", claim: "Magnesium did not reduce night cramps in older adults.", certainty: "moderate",
    kind: "no_difference", applies_to: "Older adults", rests_on: ["r1"], what_would_change_it: "A larger trial",
    importance: "decision_changing" }],
  coverage: Object.fromEntries(["benefits", "harms", "null_results", "conflicts", "mainstream_options", "people_reports"]
    .map((area) => [area, { status: "not_researched", reason: "Not asked." }])),
};
let versions = 0;
const request = (privacyReading?: DossierPrivacyReader): ResearchDossierSaveRequest => ({
  dossier: { given: true, value: DOSSIER },
  account: { mode: "FREE_CONTRIBUTOR", accountKey: ACCOUNT, findingsSave: true, noticeVersion: RESEARCH_USE_NOTICE_VERSION },
  callSavingOff: false,
  finalizationReceipt: receipt("finalization", { status: "ready", target: TARGET, answer: ANSWER }),
  shortLookup: false,
  validatedSources: 1,
  receipts: [receipt("pubmed_record", { pmid: "12121212", abs: "1" }),
    receipt("literature_search", { src: "pubmed", q: discoveryQueryDigest(["magnesium night cramps"]), ret: 3, n: 3,
      ids: ["12121212"] })],
  atlasReuse: [],
  cardId: undefined,
  commentsRead: false,
  secret: SECRET,
  versions: { askrigor: "0.1.0", build: "0123abc" },
  now: () => NOW,
  newVersionId: () => deterministicUuid(`privacy-reading:${versions++}`),
  ...(privacyReading === undefined ? {} : { privacyReading }),
});

describe("what the privacy page and the data map say of the reading (owner answer 334a)", () => {
  // The owner chose to release with the AI privacy reading on (334a, 16 Nov 2026): the page says so in his words, and
  // the data map quotes the page and names the setting, the model and the key the reading uses.
  const SENTENCE = "Before a research dossier is stored, its text (never your chat or anything about you) is checked " +
    "for personal details by an AI model from Anthropic, on AskRigor’s own account.";
  it("says it on the privacy page and in the data map's dossier row, in the same words", async () => {
    const page = await readFile(new URL("../site/privacy/index.html", import.meta.url), "utf8");
    const map = await readFile(new URL("../docs/privacy-data-map.md", import.meta.url), "utf8");
    expect(page).toContain(SENTENCE);
    const row = map.split("\n").find((line) => line.startsWith("| Private research dossier"))!;
    expect(row).toContain(`"${SENTENCE}"`);
    for (const fact of ["ASKRIGOR_DOSSIER_PRIVACY_READING=on", "owner answer 334a", "`claude-haiku-5-5`",
      "never its identifiers, the chat or the answer", "a dossier the reading does not pass is not stored"]) {
      expect(row).toContain(fact);
    }
  });
});

describe("the save with the privacy reading on", () => {
  it("is off unless ASKRIGOR_DOSSIER_PRIVACY_READING is on, and then saves without any reading", async () => {
    expect(dossierPrivacyReadingFromEnv(undefined)).toBe(false);
    expect(dossierPrivacyReadingFromEnv("true")).toBe(false);
    expect(dossierPrivacyReadingFromEnv(" on ")).toBe(true);
    const store = new InMemoryResearchDossierStore();
    expect((await saveResearchDossier(store, request()))?.disposition?.status).toBe("saved");
  });

  it("reads only the dossier's text fields, and saves on a pass", async () => {
    const read: DossierText[][] = [];
    const store = new InMemoryResearchDossierStore();
    const outcome = await saveResearchDossier(store, request(async (texts) => { read.push([...texts]); return { status: "pass" }; }));
    expect(outcome?.disposition?.status).toBe("saved");
    const paths = read[0]!.map(({ path }) => path);
    expect(paths).toEqual(expect.arrayContaining(["question", "topic.key", "topic.name", "findings[0].claim",
      "findings[0].applies_to", "searches[0].query", "studies[0].population"]));
    // No identifier, id or reference: they are not text, and the screen and the receipts check them.
    expect(paths.some((path) => /identifiers|\.id$|rests_on|\.study$|adds/u.test(path))).toBe(false);
    expect(read[0]).toEqual(dossierReadingTexts(researchDossierInputSchema.parse(DOSSIER)));
  });

  it("stores nothing after a refusal, final for the research, or when the reading cannot be made", async () => {
    const refused = new InMemoryResearchDossierStore();
    const refusal = await saveResearchDossier(refused, request(async () =>
      ({ status: "refuse", reason: "personal_health_story", path: "findings[0].applies_to" })));
    expect(refusal?.disposition).toEqual({ status: "insufficient", reason: "privacy_reading",
      problems: [{ path: "findings[0].applies_to", rule: "privacy_reading_personal_health_story" }],
      explanations: { privacy_reading_personal_health_story: "AskRigor's privacy reading found personal health story, " +
        "which refuses the dossier for good in this research" } });
    expect(refusal?.note).toContain("A privacy refusal is final for this research");
    expect(refused.snapshot()).toEqual([]);
    for (const [reader, reason] of [
      [async () => ({ status: "unavailable", reason: "timeout" }) as const, "privacy_reading_timeout"],
      [async () => ({ status: "unavailable", reason: "off" }) as const, "privacy_reading_off"],
      [async () => { throw new Error("socket closed"); }, "privacy_reading_error"],
    ] as const) {
      const store = new InMemoryResearchDossierStore();
      const outcome = await saveResearchDossier(store, request(reader as DossierPrivacyReader));
      expect(outcome?.disposition).toEqual({ status: "unavailable", reason });
      expect(store.snapshot()).toEqual([]);
    }
  });
});

describe("the reading on the research planner's API path", () => {
  const KEY = "sk-ant-api03-synthetic-key-for-tests-only-0123456789";
  const ENV = { ASKRIGOR_RESEARCH_PLANNER: "on", ASKRIGOR_RESEARCH_PLANNER_KEY_FILE: "/run/secret/claude-key",
    ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: "/var/lib/askrigor/planner-state.json" };
  type Body = Anthropic.Beta.MessageCreateParamsNonStreaming;
  const reply = (decision: unknown, overrides: Record<string, unknown> = {}) => ({
    id: "msg_synthetic", type: "message", role: "assistant", model: DOSSIER_PRIVACY_READING_MODEL, stop_reason: "end_turn",
    stop_sequence: null, content: [{ type: "text", text: typeof decision === "string" ? decision : JSON.stringify(decision),
      citations: null }],
    usage: { input_tokens: 1_800, output_tokens: 240, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...overrides,
  }) as unknown as Anthropic.Beta.BetaMessage;
  function planner(answer: (body: Body) => Anthropic.Beta.BetaMessage | Promise<Anthropic.Beta.BetaMessage>,
    env: Record<string, string> = {}) {
    const bodies: Body[] = [];
    const states: string[] = [];
    const client = (): ResearchPlannerClient => ({ beta: { messages: { create: async (body) => {
      bodies.push(body);
      return await answer(body);
    } } } });
    const made = createResearchPlanner({ env: { ...ENV, ...env } as NodeJS.ProcessEnv, client, log: () => undefined,
      readFile: (path) => { if (path === ENV.ASKRIGOR_RESEARCH_PLANNER_KEY_FILE) return `${KEY}\n`; throw new Error("absent"); },
      writeFile: (_path, text) => { states.push(text); }, now: () => NOW.getTime() });
    return { made, bodies, states };
  }
  const TEXTS: DossierText[] = [{ path: "question", text: "Does magnesium reduce night cramps in adults?" },
    { path: "findings[0].applies_to", text: "Older adults" }];
  const afterReading = (states: string[]) => JSON.parse(states.at(-1)!) as { spent_usd: number };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the texts to the smallest model the planner prices, with the rubric and the schema, and counts its cost", async () => {
    const { made, bodies, states } = planner(() => reply({ decision: "pass", reason: "none", path: "" }));
    await expect(made.readDossierPrivacy!(TEXTS)).resolves.toEqual({ status: "pass" });
    const body = bodies[0]!;
    expect(body.model).toBe("claude-haiku-5-5");
    expect(PRICES[body.model]).toBeDefined();
    expect(Object.values(PRICES).every(({ input }) => input >= PRICES[body.model]!.input)).toBe(true);
    expect(body.max_tokens).toBe(DOSSIER_PRIVACY_READING_LIMITS.outputTokens);
    expect(body.system).toEqual([{ type: "text", text: DOSSIER_PRIVACY_READING_RUBRIC }]);
    expect(body).not.toHaveProperty("tools");
    expect(JSON.parse(body.messages[0]!.content as string)).toEqual({ texts: TEXTS });
    // The day's spending record is the planner's: the reading's real cost at its list price, after its hold settles.
    expect(afterReading(states).spent_usd).toBeCloseTo((1_800 * 0.1 + 240 * 0.5) / 1e6, 12);
  });

  it("refuses with the reply's reason, keeping its path only when it was sent, and treats anything else as unread", async () => {
    await expect(planner(() => reply({ decision: "refuse", reason: "names_a_person", path: "findings[0].applies_to" }))
      .made.readDossierPrivacy!(TEXTS)).resolves.toEqual({ status: "refuse", reason: "names_a_person",
      path: "findings[0].applies_to" });
    await expect(planner(() => reply({ decision: "refuse", reason: "birth_date", path: "not.sent" }))
      .made.readDossierPrivacy!(TEXTS)).resolves.toEqual({ status: "refuse", reason: "birth_date" });
    for (const unread of [reply("not json"), reply({ decision: "pass", reason: "birth_date", path: "" }),
      reply({ decision: "refuse", reason: "none", path: "" }), reply({ decision: "pass", reason: "none", path: "", extra: 1 }),
      reply({ decision: "pass", reason: "none", path: "" }, { stop_reason: "max_tokens" })]) {
      await expect(planner(() => unread).made.readDossierPrivacy!(TEXTS))
        .resolves.toEqual({ status: "unavailable", reason: "unreadable" });
    }
    await expect(planner(() => reply({}, { stop_reason: "refusal" })).made.readDossierPrivacy!(TEXTS))
      .resolves.toEqual({ status: "unavailable", reason: "refusal" });
  });

  it("holds a long real dossier in one call, and the reservation covers the dearest call it can make", async () => {
    const long = (n: number) => "Adults over 60 with nocturnal leg cramps in primary care, randomised. ".repeat(10).slice(0, n);
    const large = researchDossierInputSchema.parse({ ...DOSSIER,
      studies: Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, identifiers: [`PMID ${10000000 + i}`], kind: "human_trial",
        form: long(60), dose: long(40), population: long(120), comparator: long(60), design: long(160), decision: "used" })),
      results: Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, study: `s${i}`, outcome: long(120),
        direction: "benefit", certainty: "low" })),
      findings: Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, claim: long(400), certainty: "low", kind: "helps",
        applies_to: long(160), rests_on: [`r${i}`], what_would_change_it: long(160), importance: "context" })),
      value: { ...DOSSIER.value, adds: ["f1"] } });
    const body = JSON.stringify({ texts: dossierReadingTexts(large) });
    expect(body.length).toBeGreaterThan(40_000);
    expect(body.length).toBeLessThanOrEqual(DOSSIER_PRIVACY_READING_LIMITS.characters);
    const dearest = (DOSSIER_PRIVACY_READING_LIMITS.characters + DOSSIER_PRIVACY_READING_RUBRIC.length) *
      PRICES[DOSSIER_PRIVACY_READING_MODEL]!.input / 1e6 +
      DOSSIER_PRIVACY_READING_LIMITS.outputTokens * PRICES[DOSSIER_PRIVACY_READING_MODEL]!.output / 1e6;
    expect(dearest).toBeLessThan(DOSSIER_PRIVACY_READING_RESERVED_USD);
  });

  it("sends nothing too long for one call or past the day's cap; an error or a timeout reads nothing", async () => {
    const long = planner(() => reply({ decision: "pass", reason: "none", path: "" }));
    await expect(long.made.readDossierPrivacy!([{ path: "question", text: "x".repeat(DOSSIER_PRIVACY_READING_LIMITS.characters) }]))
      .resolves.toEqual({ status: "unavailable", reason: "too_long" });
    expect(long.bodies).toEqual([]);
    const capped = planner(() => reply({ decision: "pass", reason: "none", path: "" }),
      { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.005" });
    await expect(capped.made.readDossierPrivacy!(TEXTS)).resolves.toEqual({ status: "unavailable", reason: "daily_budget" });
    expect(capped.bodies).toEqual([]);
    const failing = planner(() => { throw new Error("socket closed"); });
    await expect(failing.made.readDossierPrivacy!(TEXTS)).resolves.toEqual({ status: "unavailable", reason: "error" });
    // A call with no answer may have run: it keeps its hold against the day's cap.
    expect(afterReading(failing.states).spent_usd).toBeCloseTo(0.01, 12);
    vi.useFakeTimers();
    const hanging = planner(() => new Promise<never>(() => undefined));
    const reading = hanging.made.readDossierPrivacy!(TEXTS);
    await vi.advanceTimersByTimeAsync(DOSSIER_PRIVACY_READING_LIMITS.timeoutMs);
    await expect(reading).resolves.toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("is absent while the planner is off", () => {
    const off = createResearchPlanner({ env: {} as NodeJS.ProcessEnv, log: () => undefined });
    expect(off.enabled).toBe(false);
    expect(off.readDossierPrivacy).toBeUndefined();
  });
});

describe("finalize_research with the reading on", () => {
  afterEach(() => {
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
  });

  async function finalizeWith(options: { reading?: boolean; planner?: ResearchPlanner }) {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const accounts = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store: accounts, identitySecret: Buffer.alloc(32, 29) });
    await service.acceptFreeContributor("auth0|reading", { noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true });
    const store = new InMemoryResearchDossierStore();
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (name: string, _config: unknown, execute: typeof handler) => {
        if (name === "finalize_research") handler = execute;
      },
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude",
      researchContributorAccessService: service, researchDossiers: store,
      ...(options.reading === undefined ? {} : { dossierPrivacyReading: options.reading }),
      ...(options.planner === undefined ? {} : { researchPlanner: options.planner }) });
    const QUOTE = "The liver clears this drug within a few hours.";
    const result = await handler!(withSourceReading({
      lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
      full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the privacy reading." },
      receipts: [issueResearchReceipt("study_audit", { id: "PMC10518852", doi: "10.1002/art.41142",
        status: "complete_no_unresolved_fields" }, { secret: SECRET })],
      community_evidence: "researched",
      commercial_review_applicability: { status: "not_applicable", reason: "Nothing here is bought." },
      treatment_choice: "not_compared",
      research_target: "How quickly does the body clear this drug in adults",
      research_depth: "deep",
      intervention_identity: { status: "not_applicable", reason: "No coded product." },
      key_sources: [{ read_depth: "partial_text", answer_marker: "Study", id: "PMC10518852", status: "validated" }],
      absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [],
      safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
      answer_draft: `${QUOTE}\n\n[Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/)`,
      later_inputs: { research_dossier: {
        scope: "public", value: { saves_work: "substantial", adds: ["f1"], reason: "It reads the clearance study in full." },
        question: "How quickly does the body clear this drug?", topic: { key: "drug-clearance", name: "Drug clearance" },
        studies: [{ id: "s1", identifiers: ["PMC10518852"], kind: "human_trial", population: "Adults", decision: "used" }],
        results: [{ id: "r1", study: "s1", outcome: "Cleared within hours", direction: "benefit", certainty: "moderate" }],
        findings: [{ id: "f1", claim: "The liver clears this drug within a few hours in adults.", certainty: "moderate",
          kind: "helps", applies_to: "Adults", rests_on: ["r1"], what_would_change_it: "A study in older adults",
          importance: "important" }],
        coverage: Object.fromEntries(["benefits", "harms", "null_results", "conflicts", "mainstream_options",
          "people_reports"].map((area) => [area, { status: "not_researched", reason: "Not asked." }])),
      } },
    }), { authInfo: { token: "t", clientId: "c", scopes: ["research:use"], expiresAt: Math.floor(Date.now() / 1_000) + 60,
      extra: { subject: "auth0|reading" } } });
    return { structured: result.structuredContent as Record<string, any>, store };
  }
  const plannerWith = (reading?: DossierPrivacyReader): ResearchPlanner => ({
    enabled: reading !== undefined, plan: async () => ({ planning: { status: "skipped", reason: "off" }, cached: false,
      costUsd: 0, milliseconds: 0 }), lane: async () => undefined, ...(reading === undefined ? {} : { readDossierPrivacy: reading }),
  });

  it("saves as before with the reading off, and only after a pass with it on", async () => {
    const off = await finalizeWith({ reading: false, planner: plannerWith(async () => ({ status: "refuse", reason: "names_a_person" })) });
    expect(off.structured.research_dossier).toMatchObject({ status: "saved" });
    const passed = await finalizeWith({ reading: true, planner: plannerWith(async () => ({ status: "pass" })) });
    expect(passed.structured.research_dossier).toMatchObject({ status: "saved" });
  });

  it("stores nothing after a refusal, or with the planner off: never saved unread", async () => {
    const refused = await finalizeWith({ reading: true,
      planner: plannerWith(async () => ({ status: "refuse", reason: "relative_or_household", path: "findings[0].claim" })) });
    expect(refused.structured.research_dossier).toEqual({ status: "insufficient", reason: "privacy_reading",
      problems: [{ path: "findings[0].claim", rule: "privacy_reading_relative_or_household" }],
      explanations: { privacy_reading_relative_or_household: "AskRigor's privacy reading found relative or household, " +
        "which refuses the dossier for good in this research" } });
    expect(refused.store.snapshot()).toEqual([]);
    const plannerOff = await finalizeWith({ reading: true, planner: plannerWith() });
    expect(plannerOff.structured.research_dossier).toEqual({ status: "unavailable", reason: "privacy_reading_off" });
    expect(plannerOff.store.snapshot()).toEqual([]);
    expect(plannerOff.structured.saved_line).toContain("No research dossier was saved");
  });
});
