import { runInNewContext } from "node:vm";

import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { safetyLimitsFromEnv } from "../apps/research-mcp/src/config.js";
import { FINAL_CHECK_PANEL_RENDER_SOURCE } from "../apps/research-mcp/src/final-check-panel.js";
import { laterInputShape } from "../apps/research-mcp/src/later-inputs.js";
import {
  communitySkipCaveat, finalizeResearch as finalizeResearchUnwrapped, meaningJudgeSourceOf, type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { fallbackModelOf } from "../apps/research-mcp/src/research-planner.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import {
  SAFETY_LIMIT_FOR_JUDGE, SAFETY_LIMIT_MARK, SAFETY_LIMITS_SHAPE, reviewSafetyLimits, safetyLimitCount, safetyLimitSentence, safetyLimitsSchema, type SafetyLimitEntry,
} from "../apps/research-mcp/src/safety-limits.js";
import { withSourceReading } from "./helpers/source-reading.js";

// Promise P69 (the owner, chat, 21 Nov 2026: "explain to people in the answer when a guardrail is preventing you from
// considering something at your max intelligence"). The AI declares each research step a model's or app's own safety
// rules limited; AskRigor lists it in its own words and looks the answer's sentence up. Notes and limits only, off
// unless ASKRIGOR_SAFETY_LIMITS is on. Invented fixtures: no test question, no private data.

const SECRET = "safety-limits-test-secret-0123456789abcdefghijk";
const LIMIT_SENTENCE = "Les règles de sécurité d'un modèle ont limité une étape : les quantités des tableaux de l'essai n'ont pas été lues.";

const entry = (overrides: Partial<SafetyLimitEntry> = {}): SafetyLimitEntry => ({
  step: "Reading the trial's dosing tables.",
  kind: "stopped_and_switched",
  left_out: "dose amounts from the trial tables",
  left_out_how: "not_examined",
  redone: "another_model",
  recovered: "partly",
  could_change: "confidence",
  affects: "the dose findings",
  reported_by: "ai",
  answer_quote: LIMIT_SENTENCE,
  ...overrides,
});

const finalizeResearch = (...args: Parameters<typeof finalizeResearchUnwrapped>) =>
  finalizeResearchUnwrapped(withSourceReading(args[0], { check: args[1] }), args[1]);

function fixture(draftTail = LIMIT_SENTENCE): FinalizeResearchInput {
  return {
    receipts: [issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET })],
    research_target: "Synthetic safety-limit fixture", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the safety-limit declaration.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the safety-limit declaration." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth).\n\n" + draftTail + "\n\n" +
      communitySkipCaveat("Synthetic fixture isolates the safety-limit declaration."),
  } as FinalizeResearchInput;
}

const run = (later: Record<string, unknown> | undefined, safetyLimits: boolean, draftTail?: string) =>
  finalizeResearch({ ...fixture(draftTail), ...(later === undefined ? {} : { later_inputs: later }) } as never,
    { secret: SECRET, findings: "closed", ...(safetyLimits ? { safetyLimits: true } : {}) });

describe("the safety_limits declaration", () => {
  it("is a later input of finalize_research only, and the switch is on only for \"on\"", () => {
    expect(Object.keys(laterInputShape("finalize_research"))).toContain("safety_limits");
    expect(safetyLimitsFromEnv("on")).toBe(true);
    expect(safetyLimitsFromEnv(" on ")).toBe(true);
    for (const value of [undefined, "", "off", "enabled", "ON", "true"]) expect(safetyLimitsFromEnv(value)).toBe(false);
  });

  it("takes 1 to 20 entries with fixed kinds and no links, and no declaration of none", () => {
    expect(safetyLimitsSchema.safeParse([entry()]).success).toBe(true);
    expect(safetyLimitsSchema.safeParse([{ ...entry(), affects: undefined }]).success).toBe(true);
    expect(safetyLimitsSchema.safeParse(Array.from({ length: 20 }, () => entry())).success).toBe(true);
    expect(safetyLimitsSchema.safeParse(Array.from({ length: 21 }, () => entry())).success).toBe(false);
    expect(safetyLimitsSchema.safeParse([]).success).toBe(false);
    expect(safetyLimitsSchema.safeParse("none_noticed").success).toBe(false);
    expect(safetyLimitsSchema.safeParse([{ ...entry(), kind: "censored" }]).success).toBe(false);
    expect(safetyLimitsSchema.safeParse([{ ...entry(), step: "  " }]).success).toBe(false);
    // A field the entry doesn't take is dropped unread; only step, left_out and answer_quote are needed.
    const extra = safetyLimitsSchema.safeParse([{ ...entry(), reason: "extra sentinel" }]);
    expect(extra.success && JSON.stringify(extra.data)).not.toContain("sentinel");
    expect(safetyLimitsSchema.safeParse([{ step: "s", left_out: "l" }]).success).toBe(false);
    // No link, web address or DOI in an entry's own words: it would point to what a model declined to give.
    for (const left_out of ["the tables at https://example.org/t", "see www.example.org", "the paper 10.1000/xyz.1",
      "the copy at //example.org/path", "the copy at \"//example.org/path\"", "ftp://example.org/t", "file:/tmp/example",
      "write to mailto:someone", "(//example.org)"]) {
      expect(safetyLimitsSchema.safeParse([{ ...entry(), left_out }]).success, left_out).toBe(false);
    }
    // Ordinary words in any language pass, a bare host name among them: its shape can't be told from "mg.kg" or
    // "dott.ssa", so it is left to the description and the attribution (Codex's recheck of 21 Nov 2026).
    for (const step of ["Lecture des tableaux de l'essai, version 10.2", "St. John's wort reports", "10.1234 mg doses",
      "読んだ試験の表", "e.g. the dose tables", "قراءة جداول الجرعات", "Dr. Smith's 2019 trial", "dott.ssa Rossi's cases",
      "doses in mg.kg", "data: the dose tables", "the trial's file: dose tables", "ratio 1:2 at 12:30",
      "See example.org.", "Чтение раздела 1.2.3.4 отчёта", "la section 1.2.3.4 du rapport", "版本 2.1.0.3 的表"]) {
      expect(safetyLimitsSchema.safeParse([{ ...entry(), step }]).success, step).toBe(true);
    }
  });

  it("becomes a limit in AskRigor's fixed words, saying who reports it, around the reporter's step and topic", () => {
    expect(safetyLimitSentence(entry())).toBe(`As the AI reports, ${SAFETY_LIMIT_MARK} (a safety stop switched the model): ` +
      "Reading the trial's dosing tables. Left out, not examined: dose amounts from the trial tables. Done again by " +
      "another model, which recovered part of it. It could change the confidence in: the dose findings.");
    expect(safetyLimitSentence(entry({ kind: "refused", reported_by: "person", redone: "no", recovered: "no",
      could_change: "unknown", affects: undefined, left_out_how: "examined_not_reported", step: "the search\nfor   reports;" })))
      .toBe(`As the person reports, ${SAFETY_LIMIT_MARK} (a model refused it): the search for reports. Examined but not ` +
        "reported: dose amounts from the trial tables. Not done again. What it could change is not known.");
    expect(safetyLimitSentence(entry({ could_change: "no_loss_identified", redone: "same_model", recovered: "unknown" })))
      .toContain("Done again by the same model; whether that recovered it is not known. No loss was identified.");
    // An entry with only what HRP's sentence names gets "not known" for the rest, and the AI as its reporter.
    const minimal = safetyLimitsSchema.parse([{ step: "Reading the trial's tables", left_out: "dose amounts",
      answer_quote: LIMIT_SENTENCE }])[0]!;
    expect(safetyLimitSentence(minimal)).toBe(`As the AI reports, ${SAFETY_LIMIT_MARK} (a safety rule changed it): ` +
      "Reading the trial's tables. Left out: dose amounts. Whether it was done again is not known. What it could change " +
      "is not known.");
  });

  it("gives nothing without a declaration, and each limit once", () => {
    expect(reviewSafetyLimits(undefined)).toEqual({ limits: [], quotes: [], notes: [] });
    const twice = reviewSafetyLimits([entry(), entry(), entry({ kind: "narrowed" })]);
    expect(twice.limits).toHaveLength(2);
    expect(twice.quotes.map(({ at }) => at)).toEqual(["safety_limits[0].answer_quote", "safety_limits[1].answer_quote",
      "safety_limits[2].answer_quote"]);
  });

  it("uses each usable entry and notes the others by place, the schema's own field names and the shape, never a value given", () => {
    const review = reviewSafetyLimits([entry(), { ...entry(), "private topic sentinel": 1 },
      { ...entry(), left_out: "see https://example.org/hidden-sentinel" }, { ...entry(), kind: "sentinel-kind" }, "sentinel text"]);
    // An unknown field is dropped unread, so that entry counts (and repeats the first one's limit).
    expect(review.limits).toEqual([safetyLimitSentence(entry())]);
    expect(review.quotes.map(({ at }) => at)).toEqual(["safety_limits[0].answer_quote", "safety_limits[1].answer_quote"]);
    expect(review.notes.map((note) => note.split(". Its shape: ")[0])).toEqual([
      "later_inputs.safety_limits[2]: not used: check left_out; take out the link, web address or DOI",
      "later_inputs.safety_limits[3]: not used: check kind",
      "later_inputs.safety_limits[4]: not used: give an object with its fields",
    ]);
    for (const note of review.notes) expect(note).toContain(`Its shape: ${SAFETY_LIMITS_SHAPE}`);
    expect(review.notes.join("\n")).not.toMatch(/sentinel/u);
    expect(reviewSafetyLimits([]).notes).toEqual([`later_inputs.safety_limits: not used: give a list of 1 to 20 entries. Its shape: ${SAFETY_LIMITS_SHAPE}`]);
    expect(reviewSafetyLimits("sentinel").notes).toEqual([`later_inputs.safety_limits: not used: give a list of 1 to 20 entries. Its shape: ${SAFETY_LIMITS_SHAPE}`]);
    const many = reviewSafetyLimits(Array.from({ length: 22 }, (_, index) => entry({ step: `Step ${index}` })));
    expect(many.limits).toHaveLength(20);
    expect(many.notes).toEqual(["later_inputs.safety_limits: only the first 20 entries are used; put steps limited the same way in one entry."]);
  });
});

describe("finalize_research with safety_limits (promise P69)", () => {
  it("changes nothing while the switch is off, whatever is declared and wherever", () => {
    const plain = run(undefined, false);
    const calls = [[entry()], [], "sentinel", [{ ...entry(), "private topic sentinel": 1 }]].flatMap((declared) => [
      finalizeResearch({ ...fixture(), later_inputs: { safety_limits: declared } } as never, { secret: SECRET, findings: "closed" }),
      // Given at the top level and in later_inputs too, which would otherwise be a duplicate's note.
      finalizeResearch({ ...fixture(), safety_limits: declared, later_inputs: { safety_limits: declared } } as never,
        { secret: SECRET, findings: "closed" }),
      finalizeResearch({ ...fixture(), later_inputs: JSON.stringify({ safety_limits: declared }) } as never,
        { secret: SECRET, findings: "closed" }),
    ]);
    const asText = finalizeResearch({ ...fixture(), later_inputs: JSON.stringify({}) } as never, { secret: SECRET, findings: "closed" });
    for (const [index, off] of calls.entries()) {
      const base = index % 3 === 2 ? asText : plain;
      expect(off.status).toBe(base.status);
      expect(off.limits ?? []).toEqual(base.limits ?? []);
      expect(off.notes ?? []).toEqual(base.notes ?? []);
      expect(off.next_steps).toEqual(base.next_steps);
      expect(JSON.stringify(off)).not.toContain(SAFETY_LIMIT_MARK);
      expect(JSON.stringify(off)).not.toMatch(/sentinel|safety_limits/u);
    }
  });

  it("keeps a safety limit's words from the meaning judge, its place in the list kept, and no verdict on it counted", () => {
    const declared = { safety_limits: [entry({ left_out: "Zq7 synthetic topic words" })] };
    const on = run(declared, true);
    const sentence = safetyLimitSentence(entry({ left_out: "Zq7 synthetic topic words" }));
    expect(on.limits).toContain(sentence);
    const judged = meaningJudgeSourceOf(on);
    expect(judged).toBeDefined();
    expect(JSON.stringify(judged)).not.toContain("Zq7");
    // The same numbering as the result's limits, the safety limit's place held by a fixed line.
    expect(judged!.limits).toHaveLength((on.limits ?? []).length);
    const place = (on.limits ?? []).indexOf(sentence);
    expect(judged!.limits[place]).toBe(SAFETY_LIMIT_FOR_JUDGE);
    // A verdict on that place, from the judge's reading of this pass, makes no note.
    const verdicts = { status: "ran" as const, youtube: [], comparison: [], standalone: [], sourceLines: [], significance: [],
      limits: (on.limits ?? []).map((_, index) => ({ limit: index + 1, why: "synthetic verdict" })) };
    const next = finalizeResearch({ ...fixture(), later_inputs: declared } as never,
      { secret: SECRET, findings: "closed", safetyLimits: true, meaningJudgment: verdicts });
    const judgeNotes = (next.notes ?? []).filter((note) => note.startsWith("The meaning judge reads limits["));
    expect(judgeNotes).toHaveLength((on.limits ?? []).length - 1);
    expect(judgeNotes.join("\n")).not.toContain(`limits[${place}]`);
  });

  it("lists each declared limit in its own words, with the answer's sentence found, and blocks nothing", () => {
    const off = run(undefined, false);
    const on = run({ safety_limits: [entry()] }, true);
    expect(on.limits).toContain(safetyLimitSentence(entry()));
    expect(safetyLimitCount(on.limits ?? [])).toBe(1);
    expect((on.notes ?? []).join("\n")).not.toContain("safety_limits");
    expect(on.next_steps.join("\n")).not.toContain("safety_limits");
    // A limit is added, never a step: the check passes as it did, now with its limits.
    expect(["ready", "ready_with_limits"]).toContain(off.status);
    expect(on.status).toBe("ready_with_limits");
  });

  it("notes a sentence the answer doesn't show, by the entry's place and never its words", () => {
    const missing = run({ safety_limits: [entry({ answer_quote: "A sentence the draft never had." })] }, true,
      "The answer says nothing about it.");
    const notes = (missing.notes ?? []).join("\n");
    expect(notes).toContain("safety_limits[0].answer_quote");
    expect(notes).not.toContain("A sentence the draft never had");
    expect(notes).not.toContain("dose amounts");
    expect(missing.next_steps.join("\n")).not.toContain("safety_limits");
    expect(missing.limits).toContain(safetyLimitSentence(entry({ answer_quote: "A sentence the draft never had." })));
  });

  it("asks for nothing when no declaration comes, and keeps the entry's words in the limits alone", () => {
    const missing = run(undefined, true);
    expect(JSON.stringify(missing)).not.toContain("safety_limits");
    expect(missing.status).toBe(run(undefined, false).status);
    // The entry's words come back only in the result's limits (and the caveats they are kept with), never in a note,
    // a step, a receipt or any other field (the findings ledger keeps notes; Codex's red team of 21 Nov 2026).
    const on = run({ safety_limits: [entry({ left_out: "Zq7 synthetic topic words" })] }, true);
    const { limits, caveats, ...rest } = on as typeof on & { caveats?: unknown };
    expect(JSON.stringify(limits)).toContain("Zq7 synthetic topic words");
    expect(JSON.stringify(rest)).not.toContain("Zq7");
    expect(Array.isArray(caveats) ? caveats.join("\n") : "").not.toContain("safety_limits");
  });
});

// The repository has no DOM library; the same shim as the panel's own tests, which rejects HTML assignment.
class Element {
  children: Element[] = [];
  private text = "";
  constructor(readonly tagName: string) {}
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value: string) { this.text = String(value); this.children = []; }
  set innerHTML(_value: string) { throw new Error("Result text must never be HTML"); }
  appendChild(child: Element): Element { this.children.push(child); return child; }
  replaceChildren(): void { this.children = []; this.text = ""; }
}
function render(result: unknown): Element {
  const root = new Element("main");
  const doc = { getElementById: (id: string) => id === "final-check-panel" ? root : null, createElement: (tag: string) => new Element(tag) };
  runInNewContext(`${FINAL_CHECK_PANEL_RENDER_SOURCE}\nrenderFinalCheck(document, result);`, { document: doc, result });
  return root;
}
const visibleLines = (root: Element) => root.children.filter(({ tagName }) => tagName === "p").map(({ textContent }) => textContent);

describe("the final check's panel", () => {
  it("shows one line above the fold when AskRigor listed a safety limit, and none otherwise", () => {
    const limit = safetyLimitSentence(entry());
    expect(visibleLines(render({ status: "ready_with_limits", limits: [limit, "Another limit."] })))
      .toContain("As reported, a model's safety rules limited one research step; the limits below say which, and who reports it.");
    expect(visibleLines(render({ status: "not_ready", limits: [limit, safetyLimitSentence(entry({ kind: "refused", reported_by: "person" }))] })))
      .toContain("As reported, a model's safety rules limited 2 research steps.");
    // Only AskRigor's own fixed start counts: a limit that merely mentions safety rules, or none, shows no line.
    for (const limits of [[], ["The model's safety rules were discussed in a source."], [`Note: ${limit}`],
      [`${SAFETY_LIMIT_MARK} as a bare phrase`]]) {
      expect(visibleLines(render({ status: "ready_with_limits", limits })).join("\n")).not.toContain("research step");
    }
  });
});

describe("AskRigor's own Claude calls", () => {
  const reply = (iterations: unknown[] | undefined, model = "claude-opus-5-5") =>
    ({ model, usage: { input_tokens: 1, output_tokens: 1, ...(iterations === undefined ? {} : { iterations }) } }) as unknown as
      Anthropic.Beta.BetaMessage;

  it("count a reply as the fallback's only by the API's own fallback record", () => {
    expect(fallbackModelOf(reply([{ type: "message", model: "claude-opus-5-5" },
      { type: "fallback_message", model: "claude-opus-5" }]))).toBe("claude-opus-5");
    expect(fallbackModelOf(reply([{ type: "message", model: "claude-opus-5-5" }, { type: "fallback_message", model: "claude-opus-5" },
      { type: "fallback_message", model: "claude-sonnet-5-5" }]))).toBe("claude-sonnet-5-5");
    expect(fallbackModelOf(reply([{ type: "fallback_message" }]))).toBe("unnamed");
    expect(fallbackModelOf(reply([{ type: "fallback_message", model: "a model\nwith text" }]))).toBe("unnamed");
    // A dated name, another model's name, or no iterations: no fallback.
    expect(fallbackModelOf(reply([{ type: "message", model: "claude-opus-5-5-20261101" }], "claude-opus-5-5-20261101"))).toBeUndefined();
    expect(fallbackModelOf(reply(undefined, "claude-opus-5"))).toBeUndefined();
    expect(fallbackModelOf(reply([]))).toBeUndefined();
  });
});
