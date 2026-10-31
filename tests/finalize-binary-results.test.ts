import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PUBLIC_RATE_LIMIT } from "../apps/research-mcp/src/config.js";
import { createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import {
  FINALIZE_RESEARCH_SHAPES_DESCRIPTION,
  TOOL_LIST_REFRESH_HINT,
  finalizeResearch,
  finalizeResearchInputSchema,
  finalizeResearchPublishedInputSchema,
  type FinalizeResearchInput,
  type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

import { communitySkipCaveat, withCommunitySkip } from "./helpers/community-skip.js";
import { withHarmScreen } from "./helpers/harm-screen.js";

// AskRigor#356 and the 21 Oct q136 responders case, whose answer computed a ratio from counts that conflicted with the
// paper's: for each yes-or-no outcome the answer reports for two groups, the model declares each group's events and
// total, which direction is better and the follow-up, and the final check works out the arithmetic and checks that the
// quote shows them. Owner answer 153b (HRP: "Give an NNT or NNH with both groups' rates and the follow-up beside it,
// rounding the reciprocal up, and beside a benefit figure give the harms measured over the same follow-up, or say that
// none were found"): only the reciprocal rounded up counts, and a number needed to treat has the answer's sentence on
// its harms, harms_quote. The figures are synthetic gate fixtures, the sertraline one shaped like the issue's example
// (any adverse event, 87% against 68% on placebo); none is evidence about a treatment.
const SECRET = "binary-results-test-secret-0123456789012345678";
const DOI = "10.1000/binary-results";
const responders = (nnt = "7") => "After 12 weeks, 45 of 100 people taking the drug had a response, against 30 of " +
  `100 taking placebo, a number needed to treat of ${nnt}.`;
const GOOD = responders();
// The sentence beside the benefit figure on the harms over the same follow-up.
const HARMS = "Over the same 12 weeks, side effects were about as common on the drug as on placebo.";
type BinaryResult = NonNullable<FinalizeResearchInput["binary_results"]>[number];
const declaration = (overrides: Partial<BinaryResult> = {}): BinaryResult => ({
  quote: GOOD, outcome: "a response", better: "more", option: "the drug", option_events: 45, option_total: 100,
  comparator: "placebo", comparator_events: 30, comparator_total: 100, follow_up: "12 weeks", nnt: 7,
  harms_quote: HARMS, ...overrides
});
const SERTRALINE = "Over 10 to 13 weeks, 87% of people taking sertraline had any adverse event, against 68% taking " +
  "placebo: one more person in every 6 treated had one, a number needed to harm of 6.";
const sertraline: BinaryResult = {
  quote: SERTRALINE, outcome: "any adverse event", better: "fewer", option: "sertraline", option_events: 261,
  option_total: 300, comparator: "placebo", comparator_events: 204, comparator_total: 300,
  follow_up: "over 10 to 13 weeks", nnh: 6
};
const notApplicable = { status: "not_applicable" as const, reason: "Synthetic fixture isolates yes-or-no results." };
const packageFor = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  lab_preparation: notApplicable, commercial_review_applicability: notApplicable, intervention_identity: notApplicable,
  full_text_search: { status: "not_needed", reason: "Synthetic fixtures isolate yes-or-no result checks." },
  receipts: [issueResearchReceipt("study_audit", { id: DOI, status: "complete_no_unresolved_fields" }, { secret: SECRET })],
  research_target: "Synthetic yes-or-no result gate fixture", research_depth: "deep",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: "Isolates exact declaration checks with synthetic receipts and text.",
  treatment_choice: "not_compared",
  key_sources: [{ read_depth: "full_text_audited", answer_marker: "Study", id: DOI, status: "validated" }],
  answer_draft: `${GOOD} ${HARMS}`, absence_claims: [], scale_results: [], binary_results: [declaration()], user_observations: [],
  proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  ...overrides
});
// The figure steps, as the check words them.
const noFigure = (index: number, group: string, events: number, total: number, rate: number) =>
  `binary_results[${index}] quotes no figure for ${group}: the quote contains neither its events and total ` +
  `(${events} and ${total}) nor its rate (${rate}%).`;
const recompute = (field: "nnt" | "nnh", value: number, reciprocal: string, roundedUp: number) =>
  `binary_results[0] gives ${field} ${value}, but by its counts 1 divided by the difference in rates is ` +
  `${reciprocal}, which rounds up to ${roundedUp}: give the reciprocal rounded up, recomputed from the groups' counts ` +
  "the answer uses, or correct the counts.";
const NO_HARMS = (index = 0) => `binary_results[${index}] gives nnt without harms_quote: give, beside the benefit ` +
  "figure, the harms measured over the same follow-up, or say that none were found, and copy that sentence from " +
  "answer_draft as harms_quote.";

describe.each(["gate", "MCP endpoint"] as const)("finalize_research binary_results through the %s", (surface) => {
  let server: Server | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    // These tests call the endpoint more often than the public 60-a-minute limit allows one address.
    server = createAskRigorHttpServer({
      publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false,
      privateOrchestrationEnabled: false,
      rateLimiter: createTokenBucketLimiter({ ...PUBLIC_RATE_LIMIT, capacity: 1_000 })
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    client = new Client({ name: "binary-results-test", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  });
  afterAll(async () => {
    await client?.close();
    if (server !== undefined) await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    vi.unstubAllEnvs();
  });
  const call = async (overrides: Partial<FinalizeResearchInput> = {}): Promise<FinalizeResearchOutput> => {
    const input = withHarmScreen(withCommunitySkip(packageFor(overrides)));
    if (input.answer_draft !== undefined) input.answer_draft += `\n\n[Study](https://doi.org/${DOI})`;
    if (surface === "gate") return assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
  };
  // A result in a sentence of its own, with its harms sentence when it gives a number needed to treat.
  const one = (result: BinaryResult, overrides: Partial<FinalizeResearchInput> = {}) =>
    call({ answer_draft: result.nnt === undefined || result.harms_quote === undefined ? result.quote
      : `${result.quote} ${result.harms_quote}`, binary_results: [result], ...overrides });

  it("reads a middle-dot percentage in the answer as the declared 11.9%", async () => {
    const result = await one(declaration({
      quote: "After 12 weeks, 11·9% responded to the drug versus 10% on placebo.",
      option_events: 119, option_total: 1000, comparator_events: 100, comparator_total: 1000,
      nnt: undefined, harms_quote: undefined,
    }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result).join("\n")).not.toContain("quotes no figure");
  });
  // Its one limit is the community search skipped for no real-world outcome (owner question 125).
  const ready = (result: FinalizeResearchOutput, screened = false) => {
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual([
      communitySkipCaveat(packageFor().not_relevant_reason!),
      ...(screened ? ["The serious-harm screen covered severe allergic reactions (product labels). Other serious harms may not have been checked."] : [])
    ]);
    expect(verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET })).toMatchObject({
      ok: true, kind: "finalization", claims: { status: "ready_with_limits" }
    });
  };
  const advised = (result: FinalizeResearchOutput, notes: string[]) => {
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(advisoryNotes(result).filter((note) => note !== TOOL_LIST_REFRESH_HINT)).toEqual(notes);
    expect(result.finalization_receipt).toEqual(expect.any(String));
  };
  const blocked = (result: FinalizeResearchOutput, steps: string[]) => {
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual(steps);
    expect(result.finalization_receipt).toBeUndefined();
  };

  it("passes the issue's example: any adverse event on sertraline, 87% against 68% over 10 to 13 weeks, NNH 6", async () => {
    // The sentence is a harm statement too, declared as one, so the answer also screens serious harms.
    ready(await one(sertraline, { safety_claims: [{
      quote: SERTRALINE, direction: "harm", exposure: "sertraline", basis: "comparative_rates",
      measured_exposure: "sertraline for 10 to 13 weeks", studies: [DOI]
    }] }), true);
    ready(await call());
  });

  it("requires binary_results with answer_draft, while accepting an explicit empty list", async () => {
    const missing = await call({ binary_results: undefined });
    advised(missing, [
      "binary_results is missing: with answer_draft, it lists each yes-or-no outcome the answer reports for two " +
        "groups, or with a number needed to treat or harm (an empty list means none)."
    ]);
    // A chat whose tool list predates binary_results is told the way out once.
    expect(advisoryNotes(missing).filter((step) => step === TOOL_LIST_REFRESH_HINT)).toHaveLength(1);
    ready(await call({ answer_draft: "This answer reports no yes-or-no outcome.", binary_results: [] }));
  });

  it("does not require the declaration without answer_draft", async () => {
    const result = await call({ answer_draft: undefined, binary_results: undefined });
    expect(result.status).toBe("not_ready");
    expect(result.answer_checked).toBe(false);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toContain("binary_results");
  });

  it("rejects a quote absent from the answer", async () => {
    advised(await call({ answer_draft: `The drug helped some people. ${HARMS}` }), [
      "binary_results[0] gives text the answer does not show: copy each sentence exactly from answer_draft."
    ]);
    // Its harms sentence is a quote too.
    advised(await call({ answer_draft: "The drug helped some people." }), [
      "binary_results[0], binary_results[0].harms_quote give text the answer does not show: copy each sentence " +
        "exactly from answer_draft."
    ]);
  });

  it("names a group with more events than people, and leaves its other numbers unchecked", async () => {
    blocked(await call({ binary_results: [declaration({ option_events: 101 })] }), [
      "binary_results[0] gives more events than people for the drug: option_events counts the people in that group " +
        "with the outcome, so it cannot exceed option_total."
    ]);
    blocked(await call({ binary_results: [declaration({ comparator_events: 31, comparator_total: 30, nnt: 2 })] }), [
      "binary_results[0] gives more events than people for placebo: comparator_events counts the people in that " +
        "group with the outcome, so it cannot exceed comparator_total.",
      "binary_results[0] quotes no number needed to treat: the quote does not contain 2."
    ]);
    // As many events as people is a rate of 100%.
    const all = "After 12 weeks, all 40 people taking the drug had a response (100%), against 30 of 100 on placebo.";
    ready(await one(declaration({ quote: all, option_events: 40, option_total: 40, nnt: undefined })));
  });

  describe("each group's figure", () => {
    const counts = "After 12 weeks, 90 of 200 people taking the drug had a response, against 60 of 200 taking placebo.";
    const rates = "After 12 weeks, 45% of people taking the drug had a response, against 30% taking placebo.";
    const halves = declaration({ option_events: 90, option_total: 200, comparator_events: 60, comparator_total: 200,
      nnt: undefined });

    it.each([["counts", counts], ["percentages", rates],
      ["one of each", "After 12 weeks, 90 of 200 people taking the drug had a response, against 30% taking placebo."]
    ])("shows them as %s", async (_name, quote) => {
      ready(await one({ ...halves, quote }));
    });

    it("names each group whose figure the quote leaves out", async () => {
      const vague = "After 12 weeks, more people taking the drug had a response than people taking placebo.";
      blocked(await one({ ...halves, quote: vague }), [
        noFigure(0, "the drug", 90, 200, 45), noFigure(0, "placebo", 60, 200, 30)
      ]);
      // Events without the total are not the figure: 90 alone could be a rate of 90%.
      const partial = "After 12 weeks, 90 people taking the drug had a response, against 30% taking placebo.";
      blocked(await one({ ...halves, quote: partial }), [noFigure(0, "the drug", 90, 200, 45)]);
    });

    it.each(["33%", "33.3%", "33,3 %"])("accepts a rate of 100 in 300 written %s", async (rate) => {
      const quote = `After 12 weeks, ${rate} of people taking the drug had a response, against 30% taking placebo.`;
      ready(await one({ ...halves, quote, option_events: 100, option_total: 300 }));
    });

    it.each(["34%", "32%", "0.33"])("refuses a rate of 100 in 300 written %s", async (rate) => {
      const quote = `After 12 weeks, ${rate} of people taking the drug had a response, against 30% taking placebo.`;
      blocked(await one({ ...halves, quote, option_events: 100, option_total: 300 }), [
        noFigure(0, "the drug", 100, 300, 33.3)
      ]);
    });

    it.each(["1,234", "1 234", "1.234", "1 234", "1234"])("reads a total of 1,234 written %s", async (written) => {
      const quote = `Over 2 years, 617 of ${written} people taking the drug had a response, against 494 of 1,235 ` +
        "taking placebo.";
      ready(await one(declaration({ quote, option_events: 617, option_total: 1_234, comparator_events: 494,
        comparator_total: 1_235, nnt: undefined, follow_up: "2 years" })));
    });

    it("checks numbers in the quote rather than elsewhere in the answer", async () => {
      const vague = "The drug helped more people than placebo did.";
      blocked(await call({ answer_draft: `${counts} ${vague}`, binary_results: [{ ...halves, quote: vague }] }), [
        noFigure(0, "the drug", 90, 200, 45), noFigure(0, "placebo", 60, 200, 30)
      ]);
    });
  });

  describe("a number needed to treat or harm", () => {
    // 45 of 100 against 30 of 100: 1 divided by the difference in rates is 6.7, which rounds up to 7.
    it("accepts the reciprocal rounded up", async () => {
      ready(await one(declaration({ quote: responders("7"), nnt: 7 })));
    });

    // Owner answer 153b: only the reciprocal rounded up counts, not the value rounded down or left unrounded.
    it.each([5, 6, 6.7, 8])("refuses %s, giving the reciprocal and its rounded-up value", async (nnt) => {
      const refused = await one(declaration({ quote: responders(String(nnt)), nnt }));
      blocked(refused, [recompute("nnt", nnt, "6.7", 7)]);
      expect(refused.next_step_kinds).toEqual(["declaration"]);
    });

    it("refuses a number needed to harm rounded down too", async () => {
      // 87% against 68%: 1 divided by 0.19 is 5.3, which rounds up to 6.
      blocked(await one({ ...sertraline, quote: SERTRALINE.replace("harm of 6", "harm of 5"), nnh: 5 }),
        [recompute("nnh", 5, "5.3", 6)]);
    });

    it("accepts only the exact value when the reciprocal is a whole number", async () => {
      const exact = (nnt: number) => declaration({ quote: "After 12 weeks, 50 of 100 people taking the drug had a " +
        `response, against 30 of 100 taking placebo, a number needed to treat of ${nnt}.`, option_events: 50, nnt });
      ready(await one(exact(5)));
      blocked(await one(exact(6)), [recompute("nnt", 6, "5.0", 5)]);
    });

    it("works out the arithmetic exactly for groups of different sizes", async () => {
      // 261 of 300 against 137 of 200: 1 divided by (0.87 - 0.685) is 5.4.
      const quote = "Over 10 to 13 weeks, 261 of 300 people taking sertraline had any adverse event, against 137 of " +
        "200 taking placebo, a number needed to harm of 6.";
      ready(await one({ ...sertraline, quote, comparator_events: 137, comparator_total: 200 }));
      blocked(await one({ ...sertraline, quote: quote.replace("harm of 6", "harm of 4"), comparator_events: 137,
        comparator_total: 200, nnh: 4 }), [recompute("nnh", 4, "5.4", 6)]);
    });

    it.each([
      { better: "more", outcome: "a response", option_events: 45, comparator_events: 30, share: "larger", kind: "treat" },
      { better: "more", outcome: "a response", option_events: 30, comparator_events: 45, share: "smaller", kind: "harm" },
      { better: "fewer", outcome: "a relapse", option_events: 45, comparator_events: 30, share: "larger", kind: "harm" },
      { better: "fewer", outcome: "a relapse", option_events: 30, comparator_events: 45, share: "smaller", kind: "treat" }
    ] as const)("with $better better and the option's $share share, accepts only the number needed to $kind",
      async ({ better, outcome, option_events, comparator_events, share, kind }) => {
        const [supported, other] = kind === "treat" ? ["nnt", "nnh"] as const : ["nnh", "nnt"] as const;
        const quote = `After 12 weeks, ${option_events} of 100 people taking the drug had ${outcome}, against ` +
          `${comparator_events} of 100 taking placebo, a number needed to ${kind} of 7.`;
        const result = (field: "nnt" | "nnh") => declaration({ quote, outcome, better, option_events, comparator_events,
          nnt: undefined, [field]: 7 });
        ready(await one(result(supported)));
        blocked(await one(result(other)), [
          `binary_results[0] gives ${other}, but by its counts a ${share} share of people had ${outcome} with the ` +
            `drug than with placebo, and ${better} is better, so it is a number needed to ${kind}: give it as ` +
            `${supported}.`
        ]);
      });

    it("names a wrong direction and a wrong value together", async () => {
      blocked(await one(declaration({ quote: responders("4"), nnt: undefined, nnh: 4 })), [
        "binary_results[0] gives nnh, but by its counts a larger share of people had a response with the drug than " +
          "with placebo, and more is better, so it is a number needed to treat: give it as nnt.",
        recompute("nnh", 4, "6.7", 7)
      ]);
    });

    it("refuses one when both groups have the same rate, compared exactly", async () => {
      const same = "After 12 weeks, 30 of 100 people taking the drug had a response, against 60 of 200 taking " +
        "placebo, a number needed to treat of 7.";
      blocked(await one(declaration({ quote: same, option_events: 30, comparator_events: 60, comparator_total: 200 })), [
        "binary_results[0]'s counts give the same rate in both groups, so there is no number needed to treat or " +
          "harm: leave nnt out."
      ]);
      ready(await one(declaration({ quote: same.replace(", a number needed to treat of 7", ""), option_events: 30,
        comparator_events: 60, comparator_total: 200, nnt: undefined })));
    });

    it("asks for only the one the counts support when both are given", async () => {
      blocked(await one(declaration({ nnh: 7 })), [
        "binary_results[0] gives both nnt and nnh: give only nnt, the one its counts support."
      ]);
    });

    it("needs the stated value in the quote", async () => {
      const quote = "After 12 weeks, 45 of 100 people taking the drug had a response, against 30 of 100 taking placebo.";
      blocked(await call({ answer_draft: `${quote} A number needed to treat of 7 follows. ${HARMS}`,
        binary_results: [declaration({ quote })] }), [
        "binary_results[0] quotes no number needed to treat: the quote does not contain 7."
      ]);
    });

    it("needs the follow-up in the quote, compared as declared phrases are", async () => {
      const unbounded = "45 of 100 people taking the drug had a response, against 30 of 100 taking placebo, a number " +
        "needed to treat of 7.";
      blocked(await one(declaration({ quote: unbounded })), [
        "binary_results[0] gives a number needed to treat or harm without its follow-up: the quote does not contain " +
          "the declared follow-up."
      ]);
      // A result without one needs no follow-up in its sentence.
      ready(await one(declaration({ quote: unbounded.replace(", a number needed to treat of 7", ""), nnt: undefined })));
      // Case, dashes, spacing, emphasis and a closing mark aside.
      ready(await one(declaration({ follow_up: "12 WEEKS." })));
      ready(await one(declaration({ follow_up: "“12 weeks”" })));
      ready(await one(declaration({ quote: GOOD.replace("12 weeks", "**12**  weeks") })));
      ready(await one({ ...sertraline, quote: SERTRALINE.replace("10 to 13", "10–13"), follow_up: "over 10-13 weeks" }));
    });

    // The answer's figures and an Atlas finding's numbers are read by one check (figureShown in binary-results.ts).
    const NO_FOLLOW_UP = "binary_results[0] gives a number needed to treat or harm without its follow-up: the quote does " +
      "not contain the declared follow-up.";

    it("compares the follow-up in digits of any script", async () => {
      ready(await one(declaration({ quote: GOOD.replace("12 weeks", "١٢ weeks") })));
      ready(await one(declaration({ quote: GOOD.replace("12 weeks", "१२ weeks") })));
      ready(await one(declaration({ follow_up: "١٢ weeks" })));
      blocked(await one(declaration({ quote: GOOD.replace("12 weeks", "١٣ weeks") })), [NO_FOLLOW_UP]);
    });

    it("finds the follow-up only as its own number, not as part of a longer one", async () => {
      blocked(await one(declaration({ quote: GOOD.replace("12 weeks", "112 weeks") })), [NO_FOLLOW_UP]);
      blocked(await one(declaration({ quote: GOOD.replace("12 weeks", "1.12 weeks") })), [NO_FOLLOW_UP]);
      blocked(await one(declaration({ quote: GOOD.replace("After 12 weeks", "At week 12"), follow_up: "week 1" })),
        [NO_FOLLOW_UP]);
      blocked(await one(declaration({ quote: GOOD.replace("After 12 weeks", "At week 1.5"), follow_up: "week 1" })),
        [NO_FOLLOW_UP]);
      blocked(await one(declaration({ quote: GOOD.replace("After 12 weeks", "At week 1·5"), follow_up: "week 1" })),
        [NO_FOLLOW_UP]);
      // Standing as its own number, it is shown, beside other numbers too.
      ready(await one(declaration({ quote: GOOD.replace("After 12 weeks", "At week 1"), follow_up: "week 1" })));
      ready(await one(declaration({ quote: GOOD.replace("After 12 weeks", "After 8-12 weeks") })));
      ready(await one(declaration({ quote: GOOD.replace("After 12 weeks", "At visit 3, 12 weeks in") })));
      // Any occurrence that stands as its own number shows it.
      ready(await one(declaration({ quote: GOOD.replace("After 12 weeks", "After 112 weeks of screening and 12 weeks") })));
    });

    it("does not read the follow-up's own numbers as a group's rate", async () => {
      // 37 of 300 is 12.3%, which "12 weeks" does not show, while "12% after 12 weeks" does.
      const figure = declaration({ option_events: 37, option_total: 300, comparator_events: 18, comparator_total: 300,
        nnt: undefined });
      blocked(await one({ ...figure, quote: "After 12 weeks, 6% of people taking placebo had a response, and more " +
        "taking the drug." }), [noFigure(0, "the drug", 37, 300, 12.3)]);
      ready(await one({ ...figure, quote: "After 12 weeks, 12% of people taking the drug had a response, against 6% " +
        "taking placebo." }));
      // A follow-up the quote does not show sets nothing aside.
      ready(await one({ ...figure, quote: "12% of people taking the drug had a response, against 6% taking placebo." }));
    });
  });

  // Owner answer 153b: beside a benefit figure, the harms measured over the same follow-up, or that none were found.
  describe("the harms beside a number needed to treat", () => {
    const NONE_FOUND = "No side effects were reported in either group over those 12 weeks.";

    it("needs harms_quote with an nnt, as a step on the answer, without the refresh hint", async () => {
      const result = await one(declaration({ harms_quote: undefined }));
      advised(result, [NO_HARMS()]);
      expect(result.next_step_kinds).toEqual([]);
      expect(result.next_steps).not.toContain(TOOL_LIST_REFRESH_HINT);
    });

    it("accepts the sentence giving the harms or saying none were found, in any language", async () => {
      for (const harms of [HARMS, NONE_FOUND,
        "Sur les mêmes 12 semaines, les effets indésirables ont été aussi fréquents sous le médicament que sous placebo.",
        "同じ12週間で、副作用の頻度は薬とプラセボでほぼ同じでした。"
      ]) ready(await one(declaration({ harms_quote: harms })));
      // The same sentence may give the benefit and the harms.
      const both = `${GOOD.slice(0, -1)}; side effects were about as common on both.`;
      ready(await one(declaration({ quote: both, harms_quote: both })));
      // Compared as other quotes are: its closing mark, quotation marks, emphasis, spacing and case aside.
      ready(await call({ answer_draft: `${GOOD} **Over the same 12 weeks**, side effects were about as common on ` +
        "the drug as on placebo.", binary_results: [declaration({ harms_quote: `"${HARMS.slice(0, -1).toUpperCase()}"` })] }));
    });

    it("needs the answer to show it", async () => {
      for (const draft of [GOOD, `${GOOD}\n\n\`\`\`\n${HARMS}\n\`\`\``, `${GOOD}\n\n> ${HARMS}`, `${GOOD} <!-- ${HARMS} -->`]) {
        const result = await call({ answer_draft: draft, binary_results: [declaration()] });
        advised(result, ["binary_results[0].harms_quote gives text the answer does not show: copy each sentence " +
          "exactly from answer_draft."]);
        expect(result.next_step_kinds).toEqual([]);
      }
    });

    it("is not asked of a number needed to harm, or a result without a number", async () => {
      ready(await one(sertraline));
      ready(await one(declaration({ nnt: undefined, harms_quote: undefined,
        quote: GOOD.replace(", a number needed to treat of 7", "") })));
      // Given there, it is not used: the answer need not show it.
      ready(await one({ ...sertraline, harms_quote: "A sentence the answer does not show." }));
    });

    it("is not asked while the counts make the number one to harm, or leave none", async () => {
      // The option did worse, so the step turns the nnt into an nnh before any harms beside it.
      const worse = "After 12 weeks, 30 of 100 people taking the drug had a response, against 45 of 100 taking " +
        "placebo, a number needed to harm of 7.";
      blocked(await one(declaration({ quote: worse, option_events: 30, comparator_events: 45, harms_quote: undefined })), [
        "binary_results[0] gives nnt, but by its counts a smaller share of people had a response with the drug than " +
          "with placebo, and more is better, so it is a number needed to harm: give it as nnh."
      ]);
      // The same rate in both groups leaves no number at all.
      const same = "After 12 weeks, 30 of 100 people taking the drug had a response, against 30 of 100 taking " +
        "placebo, a number needed to treat of 7.";
      blocked(await one(declaration({ quote: same, option_events: 30, harms_quote: undefined })), [
        "binary_results[0]'s counts give the same rate in both groups, so there is no number needed to treat or " +
          "harm: leave nnt out."
      ]);
    });

    it("names the missing harms with the entry's other steps, each with its own kind", async () => {
      const result = await one(declaration({ quote: responders("6"), nnt: 6, harms_quote: undefined }));
      blocked(result, [recompute("nnt", 6, "6.7", 7)]);
      expect(result.next_step_kinds).toEqual(["declaration"]);
      expect(advisoryNotes(result)).toContain(NO_HARMS());
      // Both numbers given, the one the counts support is kept, so its harms are asked for too.
      blocked(await one(declaration({ nnh: 7, harms_quote: undefined })), [
        "binary_results[0] gives both nnt and nnh: give only nnt, the one its counts support."
      ]);
      // Each entry by its index.
      const second = "After 12 weeks, 50 of 100 people taking the drug had a remission, against 30 of 100 taking " +
        "placebo, a number needed to treat of 5.";
      advised(await call({ answer_draft: `${GOOD} ${HARMS} ${second}`, binary_results: [declaration(),
        declaration({ quote: second, outcome: "a remission", option_events: 50, nnt: 5, harms_quote: undefined })] }),
      [NO_HARMS(1)]);
    });
  });

  it("accepts a French result with decimal commas", async () => {
    // 86.5% against 68.5%: 1 divided by 0.18 is 5.6, which rounds up to 6.
    const quote = "Sur 12 semaines, 86,5 % des patients sous sertraline ont eu au moins un effet indésirable, contre " +
      "68,5 % sous placebo, soit un nombre de patients à traiter pour nuire de 6.";
    ready(await one({ ...sertraline, quote, option_events: 173, option_total: 200, comparator_events: 137,
      comparator_total: 200, follow_up: "12 semaines", nnh: 6 }));
    // An unrounded 5,6 is the reciprocal, not the number needed to harm.
    blocked(await one({ ...sertraline, quote: quote.replace("de 6.", "de 5,6."), option_events: 173, option_total: 200,
      comparator_events: 137, comparator_total: 200, follow_up: "12 semaines", nnh: 5.6 }), [recompute("nnh", 5.6, "5.6", 6)]);
  });

  it("reports each failed entry by its index", async () => {
    const vague = "After 12 weeks, more people taking the drug had a response than people taking placebo.";
    blocked(await call({ answer_draft: `${GOOD} ${HARMS} ${vague}`,
      binary_results: [declaration(), declaration({ quote: vague, nnt: undefined })] }), [
      noFigure(1, "the drug", 45, 100, 45), noFigure(1, "placebo", 30, 100, 30)
    ]);
  });

  it.each([
    { better: "lower" }, { option_total: 0 }, { option_events: -1 }, { comparator_events: 1.5 }, { nnt: 0 },
    { nnh: -6 }, { outcome: "" }, { follow_up: undefined }, { option: "o".repeat(121) }, { extra: "unexpected" }
  ])("notes malformed declarations (%j) while checking the answer", async (invalid) => {
    const input = { ...packageFor(), binary_results: [{ ...declaration(), ...invalid }] };
    expect(finalizeResearchInputSchema.safeParse(input).success).toBe(false);
    if (surface === "MCP endpoint") {
      const result = await client!.callTool({ name: "finalize_research", arguments: input });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent!.answer_checked).toBe(true);
      expect((result.structuredContent!.notes as string[]).length).toBeGreaterThan(0);
      expect((result.structuredContent!.notes as string[]).join("\n")).toContain("binary_results[0]");
    }
  });

  it("keeps the declaration out of the finalization receipt and the carried state", async () => {
    const result = await call();
    ready(result);
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
    for (const declared of ["the drug", "a response", "12 weeks", "placebo", "side effects"]) {
      expect(JSON.stringify(receipt)).not.toContain(declared);
      expect(JSON.stringify(result.carried ?? {})).not.toContain(declared);
    }
  });

  if (surface === "MCP endpoint") it("publishes binary_results flat, with its catalog text", async () => {
    const { tools } = await client!.listTools();
    expect(tools).toHaveLength(33);
    const tool = tools.find(({ name }) => name === "finalize_research")!;
    expect(tool.description).toContain("its reported yes-or-no results (binary_results: each group's events and " +
      "total, quoted as counts or a percentage, and any number needed to treat or harm, rounded up, checked against " +
      "them and quoted with its follow-up, and for a number needed to treat the sentence on harms over the same " +
      "follow-up, harms_quote)");
    // Primitives only, so ChatGPT's app shows the model each field: nothing of it needs JSON in the description.
    type Node = { type?: string; items?: { properties?: Record<string, Node> } };
    for (const relaxed of [true, false]) {
      const published = finalizeResearchPublishedInputSchema({ relaxed }) as { properties: Record<string, Node> };
      const fields = published.properties.binary_results!.items!.properties!;
      expect(Object.keys(fields)).toEqual([
        "quote", "outcome", "better", "option", "option_events", "option_total", "comparator", "comparator_events",
        "comparator_total", "follow_up", "nnt", "nnh", "harms_quote"
      ]);
      for (const field of Object.values(fields)) expect(["string", "integer", "number"]).toContain(field.type);
    }
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).not.toContain("binary_results");
  });
});
