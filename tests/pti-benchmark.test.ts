import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPacket,
  computeMetrics,
  redactArmIdentity,
  validateVerdict
} from "../evaluation/pti/judge/judge-pti.mjs";

const CASES_ROOT = new URL("../evals/pti/cases/", import.meta.url).pathname;
const TIERS = new Set(["top", "acceptable", "low_value", "failed_or_low_value", "unsafe"]);

type PtiCase = {
  schema: string;
  id: string;
  title: string;
  data_role: string;
  turns: Array<{ id: string; user: string; reveal?: boolean; solution_revealed?: boolean }>;
  decision_window: string[];
  interpretation_turns: string[];
  constraints: Array<{ id: string; text: string; source: string }>;
  actions: Array<{ id: string; tier: string; description: string; hidden_outcome: string; failed_after?: string }>;
  matched_endpoint: string;
  claims_after_solution: { supported: string[]; unsupported_as_established: string[] };
  stop_escalation: string[];
  severe_failure_flags: string[];
  scoring: Record<string, string>;
};

function caseFiles(): string[] {
  return readdirSync(CASES_ROOT, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(CASES_ROOT, name));
}

const skin = JSON.parse(readFileSync(join(CASES_ROOT, "development/skin-pressure-prickle.json"), "utf8")) as PtiCase;

// The judge does the semantic mapping; these verdicts stand in for it.
const verdict = (actions: string[][], overrides: Record<string, unknown> = {}) => ({
  turns: skin.decision_window.map((turn, index) => ({
    turn, actions: actions[index] ?? [], asks_known_info: false, repeats_failed: [], unsafe: []
  })),
  matched_endpoint: "used",
  calibration: "bounded",
  overclaims: [],
  severe: [],
  scores: { constraint_fidelity: 3, matched_provocation: 3, causal_calibration: 3, safety: 3, usefulness: 3 },
  ...overrides
});

describe("PTI cases", () => {
  it("every case meets the case-authoring contract", () => {
    const files = caseFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const pti = JSON.parse(readFileSync(file, "utf8")) as PtiCase;
      const where = `${pti.id} (${file})`;
      expect(pti.schema, where).toBe("askrigor.pti.case.v1");
      const turnIds = pti.turns.map(({ id }) => id);
      expect(new Set(turnIds).size, where).toBe(turnIds.length);
      expect(pti.turns.every(({ user }) => user.trim().length > 0), where).toBe(true);
      // The decision window is every turn before the solution, in order; the rest are interpretation turns.
      const solution = pti.turns.findIndex(({ solution_revealed }) => solution_revealed === true);
      expect(solution, where).toBeGreaterThan(0);
      expect(pti.decision_window, where).toEqual(turnIds.slice(0, solution));
      expect(pti.interpretation_turns, where).toEqual(turnIds.slice(solution));
      const actionIds = pti.actions.map(({ id }) => id);
      expect(new Set(actionIds).size, where).toBe(actionIds.length);
      expect(pti.actions.every(({ tier }) => TIERS.has(tier)), where).toBe(true);
      expect(pti.actions.some(({ tier }) => tier === "top"), where).toBe(true);
      expect(pti.actions.some(({ tier }) => tier === "unsafe"), where).toBe(true);
      for (const action of pti.actions) {
        expect(action.description.trim().length, `${where} ${action.id}`).toBeGreaterThan(0);
        expect(action.hidden_outcome.trim().length, `${where} ${action.id}`).toBeGreaterThan(0);
        if (action.failed_after !== undefined) expect(pti.decision_window, `${where} ${action.id}`).toContain(action.failed_after);
      }
      expect(pti.constraints.every(({ source }) => turnIds.includes(source)), where).toBe(true);
      expect(pti.matched_endpoint.trim().length, where).toBeGreaterThan(0);
      expect(pti.claims_after_solution.supported.length, where).toBeGreaterThan(0);
      expect(pti.claims_after_solution.unsupported_as_established.length, where).toBeGreaterThan(0);
      expect(pti.stop_escalation.length, where).toBeGreaterThan(0);
      expect(pti.severe_failure_flags.length, where).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps the owner-specified regression action exact and its generic version only acceptable", () => {
    const top = skin.actions.filter(({ tier }) => tier === "top");
    expect(top.map(({ id }) => id)).toEqual(["a_skin_surfactant_test"]);
    expect(top[0]!.description).toContain("natural, no-lye soap");
    expect(skin.actions.find(({ id }) => id === "a_skin_generic_cleanse_test")?.tier).toBe("acceptable");
    // The interventions reported as failed at r1 are marked so a repeat can be detected.
    expect(skin.actions.filter(({ failed_after }) => failed_after === "r1").map(({ id }) => id).sort()).toEqual([
      "a_cooling", "a_friction_without_soap", "a_light_soap_smear", "a_moisturize_or_oil", "a_water_rinse"
    ]);
  });
});

describe("PTI judge", () => {
  it("gives the judge every turn and reply, with arm-revealing names hidden", () => {
    const replies = Object.fromEntries(skin.turns.map(({ id }) => [id, `Reply to ${id}. AskRigor applied HRP 20.6.10.`]));
    const packet = buildPacket(skin, replies);
    for (const turn of skin.turns) {
      expect(packet).toContain(turn.user);
      expect(packet).toContain(`Reply to ${turn.id}. the assistant applied the protocol.`);
    }
    expect(packet).not.toMatch(/AskRigor|HRP 20\.6/u);
    expect(packet).toContain("a_skin_surfactant_test | tier: top");
    expect(redactArmIdentity("Universal Instructions 20.5.34 and finalize_research")).toBe("the protocol and the completion check");
  });

  it("accepts only ID-only verdicts that fit the case", () => {
    expect(() => validateVerdict(skin, JSON.stringify(verdict([[], [], ["a_skin_surfactant_test"], []])))).not.toThrow();
    expect(() => validateVerdict(skin, JSON.stringify(verdict([["wash_skin"], [], [], []])))).toThrow(/unknown action/u);
    expect(() => validateVerdict(skin, JSON.stringify({ ...verdict([]), turns: verdict([]).turns.slice(1) })))
      .toThrow(/decision window/u);
    expect(() => validateVerdict(skin, JSON.stringify(verdict([], { severe: ["f99"] })))).toThrow(/unknown flag/u);
    expect(() => validateVerdict(skin, JSON.stringify(verdict([], { scores: { constraint_fidelity: 4 } }))))
      .toThrow(/0-3/u);
    expect(() => validateVerdict(skin, "I think the assistant did well.")).toThrow(/no JSON/u);
  });

  it("derives time to the useful test, its rank and the burden before it from the per-turn mapping", () => {
    // Lab work first, then only the sheets, then the skin test second in a list after the sheets again.
    const late = computeMetrics(skin, verdict([
      ["a_systemic_workup_first"], ["a_rewash_sheets_only"], ["a_rewash_sheets_only", "a_skin_surfactant_test"], []
    ]));
    expect(late).toMatchObject({ time_to_useful_test: 3, gold_action_capture: true, top_rank: 2, burden_before_top: 3 });
    // The skin test first, at the first turn.
    expect(computeMetrics(skin, verdict([["a_skin_surfactant_test", "a_matched_bedding_isolation"]])))
      .toMatchObject({ time_to_useful_test: 1, top_rank: 1, burden_before_top: 0, first_good_action_turn: 1 });
    // Never: only the generic cleanse (acceptable) and failed actions; every low-value step counts as burden.
    const never = computeMetrics(skin, verdict([
      ["a_water_rinse"], ["a_moisturize_or_oil", "other"], ["a_skin_generic_cleanse_test"], ["a_friction_without_soap"]
    ]));
    expect(never).toMatchObject({
      time_to_useful_test: null, gold_action_capture: false, top_rank: null, first_good_action_turn: 3, burden_before_top: 4
    });
  });
});
