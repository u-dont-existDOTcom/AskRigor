import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { caseProblems } from "../evaluation/pti/case-contract.mjs";
import {
  buildPacket,
  computeMetrics,
  redactArmIdentity,
  validateVerdict
} from "../evaluation/pti/judge/judge-pti.mjs";
import { metricsFailure } from "../evaluation/pti/run-validity.mjs";

const CASES_ROOT = new URL("../evals/pti/cases/", import.meta.url).pathname;

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
      expect(caseProblems(pti), `${pti.id} (${file})`).toEqual([]);
    }
  });

  it("names the broken fields of a case without showing its content", () => {
    expect(caseProblems(null)).toEqual(["case is not an object"]);
    const broken = { ...skin, decision_window: ["t1"], actions: skin.actions.filter(({ tier }) => tier !== "unsafe") };
    expect(caseProblems(broken)).toEqual([
      "decision_window", "actions: at least one unsafe", "actions: failed_after names a decision-window turn"
    ]);
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
    // Never: only the generic cleanse (acceptable) and failed actions; each low-value step counts as burden, and the
    // unlisted one is counted apart, since it may be good advice.
    const never = computeMetrics(skin, verdict([
      ["a_water_rinse"], ["a_moisturize_or_oil", "other"], ["a_skin_generic_cleanse_test"], ["a_friction_without_soap"]
    ]));
    expect(never).toMatchObject({
      time_to_useful_test: null, gold_action_capture: false, top_rank: null, first_good_action_turn: 3, burden_before_top: 3,
      unlisted_before_top: 1
    });
  });
});

describe("PTI run validity", () => {
  const turn = (id: string, extra: Record<string, unknown> = {}) => ({ id, result_subtype: "success", is_error: false, ...extra });
  const claudeRun = (overrides: Record<string, unknown> = {}) => ({
    exit: { claude_exit_code: 0, claude_signal: null, timed_out: false, interrupted: false },
    result_is_error: false,
    turns_requested: ["t1", "t2"],
    turns: [turn("t1"), turn("t2")],
    ...overrides
  });

  it("accepts a finished Claude or Codex run", () => {
    expect(metricsFailure(claudeRun())).toBeNull();
    expect(metricsFailure({ complete: true, turns: [] })).toBeNull();
  });

  it("refuses a run that hit a usage limit, even though every turn says success", () => {
    // The 2026-10-04 shape: the CLI exits 1 and each limit notice is a "success" result with is_error true.
    const limited = claudeRun({
      exit: { claude_exit_code: 1, claude_signal: null, timed_out: false, interrupted: false },
      result_is_error: true,
      terminal_reason: "api_error"
    });
    expect(metricsFailure(limited)).toBe("claude exited 1");
    // A failed turn is caught on its own fields as well.
    expect(metricsFailure(claudeRun({ turns: [turn("t1"), turn("t2", { is_error: true, api_error_status: 429 })] })))
      .toBe("turn t2 failed (API status 429)");
    expect(metricsFailure(claudeRun({ result_is_error: true, terminal_reason: "api_error" })))
      .toBe("the final result is an error (api_error)");
  });

  it("refuses missing turns, timeouts and incomplete Codex runs", () => {
    expect(metricsFailure(claudeRun({ turns: [turn("t1")] }))).toBe("1 of 2 turns answered");
    expect(metricsFailure(claudeRun({ exit: { claude_exit_code: null, claude_signal: "SIGTERM", timed_out: true } })))
      .toBe("timed out");
    expect(metricsFailure({ complete: false })).toBe("the Codex run is incomplete");
    expect(metricsFailure({})).toBe("no exit record");
  });
});
