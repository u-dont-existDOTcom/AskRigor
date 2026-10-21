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

import { COMMUNITY_SKIP_LIMIT, withCommunitySkip } from "./helpers/community-skip.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";
import { withHarmScreen } from "./helpers/harm-screen.js";

// AskRigor#356 and the 21 Oct q136 responders case, whose answer computed a ratio from counts that conflicted with the
// paper's: for each yes-or-no outcome the answer reports for two groups, the model declares each group's events and
// total, which direction is better and the follow-up, and the final check works out the arithmetic and checks that the
// quote shows them. The figures are synthetic gate fixtures, the sertraline one shaped like the issue's example (any
// adverse event, 87% against 68% on placebo); none is evidence about a treatment.
const SECRET = "binary-results-test-secret-0123456789012345678";
const DOI = "10.1000/binary-results";
const responders = (nnt = "7") => "After 12 weeks, 45 of 100 people taking the drug had a response, against 30 of " +
  `100 taking placebo, a number needed to treat of ${nnt}.`;
const GOOD = responders();
type BinaryResult = NonNullable<FinalizeResearchInput["binary_results"]>[number];
const declaration = (overrides: Partial<BinaryResult> = {}): BinaryResult => ({
  quote: GOOD, outcome: "a response", better: "more", option: "the drug", option_events: 45, option_total: 100,
  comparator: "placebo", comparator_events: 30, comparator_total: 100, follow_up: "12 weeks", nnt: 7, ...overrides
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
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Isolates exact declaration checks with synthetic receipts and text.",
  treatment_choice: "not_compared",
  key_sources: [{ read_depth: "full_text_audited", answer_marker: "Study", id: DOI, status: "validated" }],
  answer_draft: GOOD, absence_claims: [], scale_results: [], binary_results: [declaration()], user_observations: [],
  proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  ...overrides
});
// The figure steps, as the check words them.
const noFigure = (index: number, group: string, events: number, total: number, rate: number) =>
  `binary_results[${index}] quotes no figure for ${group}: the quote contains neither its events and total ` +
  `(${events} and ${total}) nor its rate (${rate}%).`;
const recompute = (field: "nnt" | "nnh", value: number, reciprocal: string, roundedUp: number) =>
  `binary_results[0] gives ${field} ${value}, but by its counts 1 divided by the difference in rates is ` +
  `${reciprocal}, ${roundedUp} rounded up: recompute it from the groups' counts the answer uses, or correct the counts.`;

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
  // A result in a sentence of its own.
  const one = (result: BinaryResult, overrides: Partial<FinalizeResearchInput> = {}) =>
    call({ answer_draft: result.quote, binary_results: [result], ...overrides });
  // Its one limit is the community search skipped for no real-world outcome (owner question 125).
  const ready = (result: FinalizeResearchOutput) => {
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toEqual([COMMUNITY_SKIP_LIMIT]);
    expect(verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET })).toMatchObject({
      ok: true, kind: "finalization", claims: { status: "ready_with_limits" }
    });
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
    }] }));
    ready(await call());
  });

  it("requires binary_results with answer_draft, while accepting an explicit empty list", async () => {
    const missing = await call({ binary_results: undefined });
    blocked(missing, [
      "binary_results is missing: with answer_draft, it lists each yes-or-no outcome the answer reports for two " +
        "groups, or with a number needed to treat or harm (an empty list means none)."
    ]);
    // A chat whose tool list predates binary_results is told the way out once.
    expect(missing.next_steps.filter((step) => step === TOOL_LIST_REFRESH_HINT)).toHaveLength(1);
    ready(await call({ answer_draft: "This answer reports no yes-or-no outcome.", binary_results: [] }));
  });

  it("does not require the declaration without answer_draft", async () => {
    const result = await call({ answer_draft: undefined, binary_results: undefined });
    expect(result.status).toBe("not_ready");
    expect(result.answer_checked).toBe(false);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).not.toContain("binary_results");
  });

  it("rejects a quote absent from the answer", async () => {
    blocked(await call({ answer_draft: "The drug helped some people." }), [
      "binary_results[0] gives text the answer does not show: copy each sentence exactly from answer_draft."
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
    // 45 of 100 against 30 of 100: 1 divided by the difference in rates is 6.7.
    it.each(["6", "6.7", "7"])("accepts %s, from the reciprocal rounded down to rounded up", async (nnt) => {
      ready(await one(declaration({ quote: responders(nnt), nnt: Number(nnt) })));
    });

    it.each([5, 8])("refuses %s, giving the reciprocal and its rounded-up value", async (nnt) => {
      blocked(await one(declaration({ quote: responders(String(nnt)), nnt })), [recompute("nnt", nnt, "6.7", 7)]);
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
      blocked(await call({ answer_draft: `${quote} A number needed to treat of 7 follows.`,
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
      ready(await one(declaration({ quote: GOOD.replace("12 weeks", "**12**  weeks") })));
      ready(await one({ ...sertraline, quote: SERTRALINE.replace("10 to 13", "10–13"), follow_up: "over 10-13 weeks" }));
    });
  });

  it("accepts a French result with decimal commas", async () => {
    const quote = "Sur 12 semaines, 86,5 % des patients sous sertraline ont eu au moins un effet indésirable, contre " +
      "68,5 % sous placebo, soit un nombre de patients à traiter pour nuire de 5,6.";
    ready(await one({ ...sertraline, quote, option_events: 173, option_total: 200, comparator_events: 137,
      comparator_total: 200, follow_up: "12 semaines", nnh: 5.6 }));
  });

  it("reports each failed entry by its index", async () => {
    const vague = "After 12 weeks, more people taking the drug had a response than people taking placebo.";
    blocked(await call({ answer_draft: `${GOOD} ${vague}`,
      binary_results: [declaration(), declaration({ quote: vague, nnt: undefined })] }), [
      noFigure(1, "the drug", 45, 100, 45), noFigure(1, "placebo", 30, 100, 30)
    ]);
  });

  it.each([
    { better: "lower" }, { option_total: 0 }, { option_events: -1 }, { comparator_events: 1.5 }, { nnt: 0 },
    { nnh: -6 }, { outcome: "" }, { follow_up: undefined }, { option: "o".repeat(121) }, { extra: "unexpected" }
  ])("rejects malformed declarations (%j)", async (invalid) => {
    const input = { ...packageFor(), binary_results: [{ ...declaration(), ...invalid }] };
    expect(finalizeResearchInputSchema.safeParse(input).success).toBe(false);
    if (surface === "MCP endpoint") {
      const result = await client!.callTool({ name: "finalize_research", arguments: input });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ status: "not_ready", answer_checked: false, receipts_verified: 0 });
      expect((result.structuredContent!.next_steps as string[]).join("\n")).toContain("binary_results[0]");
    }
  });

  it("keeps the declaration out of the finalization receipt and the carried state", async () => {
    const result = await call();
    ready(result);
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
    for (const declared of ["the drug", "a response", "12 weeks", "placebo"]) {
      expect(JSON.stringify(receipt)).not.toContain(declared);
      expect(JSON.stringify(result.carried ?? {})).not.toContain(declared);
    }
  });

  if (surface === "MCP endpoint") it("publishes binary_results flat, with its catalog text", async () => {
    const { tools } = await client!.listTools();
    expect(tools).toHaveLength(33);
    const tool = tools.find(({ name }) => name === "finalize_research")!;
    expect(tool.description).toContain("its reported yes-or-no results (binary_results: each group's events and " +
      "total, quoted as counts or a percentage, and any number needed to treat or harm, checked against them and " +
      "quoted with its follow-up)");
    // Primitives only, so ChatGPT's app shows the model each field: nothing of it needs JSON in the description.
    type Node = { type?: string; items?: { properties?: Record<string, Node> } };
    for (const relaxed of [true, false]) {
      const published = finalizeResearchPublishedInputSchema({ relaxed }) as { properties: Record<string, Node> };
      const fields = published.properties.binary_results!.items!.properties!;
      expect(Object.keys(fields)).toEqual([
        "quote", "outcome", "better", "option", "option_events", "option_total", "comparator", "comparator_events",
        "comparator_total", "follow_up", "nnt", "nnh"
      ]);
      for (const field of Object.values(fields)) expect(["string", "integer", "number"]).toContain(field.type);
    }
    expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).not.toContain("binary_results");
  });
});
