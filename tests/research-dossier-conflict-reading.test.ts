import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  DOSSIER_CONFLICT_READING_LIMITS,
  DOSSIER_CONFLICT_READING_RUBRIC,
  dossierConflictBatches,
  readDossierConflicts,
  type DossierConflictRequest,
  type DossierConflictSide,
} from "../apps/research-mcp/src/findings/dossier-conflict-reading.js";
import { PRICES, createResearchPlanner, type ResearchPlannerClient } from "../apps/research-mcp/src/research-planner.js";

// AskRigor#477 stage 2, Codex's review findings 3 and 4: the meaning-based conflict comparison on the research planner's
// own paid path. Every finding here is invented; no test reaches the network.

const NOW = new Date("2026-11-17T15:00:00.000Z");
const side = (findings: number, claim = "Myo-inositol improved fasting insulin."): DossierConflictSide => ({
  topic: "Inositol (invented)", other_names: ["IP6"], forms: ["myo-inositol"],
  findings: Array.from({ length: findings }, (_, index) => ({ id: `f${index + 1}`, claim, kind: "helps",
    applies_to: "Adults with a metabolic syndrome", form: "myo-inositol", importance: "important" })),
});
const REQUEST: DossierConflictRequest = { dossier: side(2, "Myo-inositol worsened fasting insulin."),
  shown: [{ dossier: "D-1001", ...side(2) }, { dossier: "D-1002", ...side(1) }] };

describe("the conflict comparison's request and reply", () => {
  it("asks nothing when no dossier is shown, and splits a long request into calls that each fit", async () => {
    let calls = 0;
    await expect(readDossierConflicts({ dossier: side(1), shown: [] }, async () => { calls += 1;
      return { status: "reply", reply: { conflicts: [] } }; })).resolves.toEqual({ status: "read", conflicts: [] });
    expect(calls).toBe(0);
    const long = "A claim that is long enough to fill a call. ".repeat(10);
    const many: DossierConflictRequest = { dossier: side(3, long),
      shown: Array.from({ length: 60 }, (_, index) => ({ dossier: `D-${1001 + index}`, ...side(10, long) })) };
    const batches = dossierConflictBatches(many)!;
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap(({ shown }) => shown.map(({ dossier }) => dossier))).toEqual(many.shown.map(({ dossier }) => dossier));
    for (const batch of batches) expect(JSON.stringify(batch).length).toBeLessThanOrEqual(DOSSIER_CONFLICT_READING_LIMITS.characters);
    // A new dossier too long to send with even one shown dossier can't be compared.
    expect(dossierConflictBatches({ dossier: side(30, "x".repeat(2_200)), shown: [{ dossier: "D-1001", ...side(1) }] }))
      .toBeUndefined();
  });

  it("keeps a reply's conflicts only when every id was sent; anything else is no reading", async () => {
    const answer = (reply: unknown) => async () => ({ status: "reply" as const, reply });
    await expect(readDossierConflicts(REQUEST, answer({ conflicts: [{ finding: "f1", dossier: "D-1001", theirs: "f2" }] })))
      .resolves.toEqual({ status: "read", conflicts: [{ finding: "f1", dossier: "D-1001", theirs: "f2" }] });
    for (const unread of [{ conflicts: [{ finding: "f9", dossier: "D-1001", theirs: "f1" }] },
      { conflicts: [{ finding: "f1", dossier: "D-1003", theirs: "f1" }] }, { conflicts: [{ finding: "f1",
        dossier: "D-1002", theirs: "f2" }] }, { conflicts: [], extra: true }, "not an object"]) {
      await expect(readDossierConflicts(REQUEST, answer(unread))).resolves.toEqual({ status: "unavailable",
        reason: "unreadable" });
    }
    await expect(readDossierConflicts(REQUEST, async () => ({ status: "unavailable", reason: "daily_budget" })))
      .resolves.toEqual({ status: "unavailable", reason: "daily_budget" });
  });
});

describe("the comparison on the research planner's API path", () => {
  const KEY = "sk-ant-api03-synthetic-key-for-tests-only-0123456789";
  const ENV = { ASKRIGOR_RESEARCH_PLANNER: "on", ASKRIGOR_RESEARCH_PLANNER_KEY_FILE: "/run/secret/claude-key",
    ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: "/var/lib/askrigor/planner-state.json" };
  type Body = Anthropic.Beta.MessageCreateParamsNonStreaming;
  const message = (text: string) => ({
    id: "msg_synthetic", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn",
    stop_sequence: null, content: [{ type: "text", text, citations: null }],
    usage: { input_tokens: 2_000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  }) as unknown as Anthropic.Beta.BetaMessage;
  function planner(text: string, env: Record<string, string> = {}) {
    const bodies: Body[] = [];
    const states: string[] = [];
    const client = (): ResearchPlannerClient => ({ beta: { messages: { create: async (body) => {
      bodies.push(body);
      return message(text);
    } } } });
    const made = createResearchPlanner({ env: { ...ENV, ...env } as NodeJS.ProcessEnv, client, log: () => undefined,
      readFile: (path) => { if (path === ENV.ASKRIGOR_RESEARCH_PLANNER_KEY_FILE) return `${KEY}\n`; throw new Error("absent"); },
      writeFile: (_path, written) => { states.push(written); }, now: () => NOW.getTime() });
    return { made, bodies, states };
  }

  it("sends the request to the smallest model the planner prices, with the rubric, and counts its cost", async () => {
    const { made, bodies, states } = planner(JSON.stringify({ conflicts: [{ finding: "f1", dossier: "D-1001",
      theirs: "f1" }] }));
    await expect(readDossierConflicts(REQUEST, made.readDossierConflicts!)).resolves.toEqual({ status: "read",
      conflicts: [{ finding: "f1", dossier: "D-1001", theirs: "f1" }] });
    const body = bodies[0]!;
    expect(body.model).toBe("claude-haiku-5-5");
    expect(Object.values(PRICES).every(({ input }) => input >= PRICES[body.model]!.input)).toBe(true);
    expect(body.system).toEqual([{ type: "text", text: DOSSIER_CONFLICT_READING_RUBRIC }]);
    expect(DOSSIER_CONFLICT_READING_RUBRIC.replace(/\s+/gu, " ")).toContain("a benefit against a harm on the same outcome");
    expect(body).not.toHaveProperty("tools");
    expect(JSON.parse(body.messages[0]!.content as string)).toEqual(REQUEST);
    expect((JSON.parse(states.at(-1)!) as { spent_usd: number }).spent_usd).toBeCloseTo((2_000 * 0.1 + 300 * 0.5) / 1e6, 12);
  });

  it("makes no call past the day's cap, and is absent while the planner is off", async () => {
    const { made, bodies } = planner(JSON.stringify({ conflicts: [] }), { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0" });
    await expect(readDossierConflicts(REQUEST, made.readDossierConflicts!)).resolves.toEqual({ status: "unavailable",
      reason: "daily_budget" });
    expect(bodies).toEqual([]);
    expect(createResearchPlanner({ env: {} as NodeJS.ProcessEnv, log: () => undefined }).readDossierConflicts)
      .toBeUndefined();
  });
});
