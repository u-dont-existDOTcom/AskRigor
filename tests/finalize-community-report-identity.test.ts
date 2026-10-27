import { atlasLookupFixture } from "./helpers/atlas-lookup-fixture.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT,
  type FinalizeResearchInput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  discoveryQueryDigest, issueResearchReceipt, researchTargetDigest, verifyResearchReceipt
} from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

const SECRET = "community-report-identity-test-secret-0123456789";
const TARGET = "Form A and form B community reports";
const DOI = "10.1000/forms";
const QUOTE = "The reports describe form A compared with form B.";
const FINDINGS = {
  benefit_reports: "One person reported improvement.", no_effect_reports: "One reported no change.",
  adverse_reports: "No harms were reported.", effect_on_answer: "These reports cannot establish an effect."
};
type Search = NonNullable<FinalizeResearchInput["community_searches"]>[number];
type Identity = NonNullable<Search["report_identity"]>[number];
type Claim = NonNullable<FinalizeResearchInput["comparison_claims"]>[number];
const identity = (overrides: Partial<Identity> = {}): Identity => ({
  exposure: "form A", reports_read: 4, firsthand_exact: 1, exposure_unclear: 1,
  other_exposure: 1, not_firsthand: 1, measured_after: 0, ...overrides
});
const claim = (a: number | null = 1, b: number | null = 1, unitA: string | null = "mg", unitB: string | null = "mg"): Claim => ({
  quote: QUOTE, arms: [{ exposure: "form A", dose: a, unit: unitA }, { exposure: "form B", dose: b, unit: unitB }],
  same_people: true
});
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
function base(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  const searches: Search[] = ["Mineral Forum", "Longevity Forum"].map((community, i) => ({
    community, platform: "forum", queries: [TARGET], threads_read: [{ url: `https://forum${i}.example/forms` }],
    thread_selection: "all_found", report_identity: [identity()], ...FINDINGS, answer_quotes: { ...FINDINGS }
  }));
  return {
    receipts: [atlasLookupFixture(TARGET, { secret: SECRET }), sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" }),
      sign("treatment_coverage", { boundary: "ledger_consistent_for_synthesis", lock: "pass", broad: true,
        target: researchTargetDigest(TARGET) })],
    research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared", community_evidence: "researched",
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates declarations, not source searches." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic comparisons do not concern a commercial product." },
    intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient study intervention." },
    key_sources: [{ id: DOI, status: "validated", read_depth: "partial_text", answer_marker: "Study" }],
    principal_communities: searches.map(({ community: name, platform }) => ({ name, platform })),
    community_searches: searches, absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [],
    mechanism_claims: [], recommendations: [],
    answer_draft: `[Study](https://doi.org/${DOI}) describes the exposures. ${QUOTE}\n\n` + searches.map((s) =>
      `On [${s.community}](${s.threads_read[0]!.url}): ${Object.values(FINDINGS).join(" ")}`).join("\n\n"),
    ...overrides
  };
}
// An answer that compares the forms lists each plausible class of treatment, searched by name (owner answer 153a): here
// one class, searched in PubMed and reported in a sentence of its own.
const CLASS_QUERY = "mineral forms supplementation";
const CLASS_SENTENCE = "A PubMed search for mineral forms found only the study above.";
function compared(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  const input = base({ treatment_choice: "compared", ...overrides });
  return {
    ...input,
    receipts: [...input.receipts, sign("literature_search", { src: "pubmed", q: discoveryQueryDigest([CLASS_QUERY]), ret: 1, n: 1 })],
    option_classes: [{ option_class: "mineral forms", state: "researched", search_query: CLASS_QUERY, answer_quote: CLASS_SENTENCE }],
    answer_draft: `${input.answer_draft}\n\n${CLASS_SENTENCE}`
  };
}
const run = (input: FinalizeResearchInput) => assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
const checked = (input: FinalizeResearchInput) => {
  const first = run(input);
  return run({ ...input, answer_draft: `${input.answer_draft}\n\n${first.caveats.join(" ")}` });
};
// An emergency before triage skips the community search with no caveat; no_real_world_outcome would add one (owner
// question 125), and with it a limit.
const noForum = () => base({
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic emergency before triage.",
  principal_communities: undefined, community_searches: undefined
});
const zeroCaveat = "No one in this community described their own use of what was asked about, so its reports are not evidence about it. Community: Mineral Forum. Asked about: form A.";
const sumStep = "report_identity for form A in Mineral Forum does not add up: the four classes must add up to reports_read, and measured_after cannot exceed firsthand_exact.";
const doseLimit = "The comparison of form A with form B rests on reports whose doses differ or were not given; say it cannot show which works better.";
const missingDose = "Reports comparing two options did not give both doses, so they cannot show which works better at the same dose: form A; form B.";

afterEach(() => vi.unstubAllEnvs());

describe("forum report identity", () => {
  it("asks for the declaration and the connector refresh once", () => {
    const input = base();
    delete input.community_searches![0]!.report_identity;
    const result = checked(input);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      "community_searches for Mineral Forum reads threads without report_identity: for each exposure the answer draws on, count the reports you read: firsthand use of exactly it, form not stated, something else, and advice or hearsay, with how many gave a measurement after the change.",
      TOOL_LIST_REFRESH_HINT
    ]);
  });
  it.each([
    { reports_read: 3 }, { measured_after: 2 }, { firsthand_exact: 0, reports_read: 2 }
  ])("rejects inconsistent counts without emitting their line or zero caveat: %j", (counts) => {
    const input = base();
    input.community_searches![0]!.report_identity = [identity(counts)];
    const result = checked(input);
    expect(result.next_steps).toEqual([sumStep]);
    expect(result.must_report.some((line) => line.startsWith("Mineral Forum, form A:"))).toBe(false);
    expect(result.caveats).not.toContain(zeroCaveat);
  });
  it("reports the exact count line, including zero measurements", () => {
    const result = checked(base());
    expect(result.status).toBe("ready_with_limits");
    expect(result.must_report).toContain("Mineral Forum, form A: 4 report(s) read; 1 firsthand report(s) of exactly this, 0 with a measurement after the change; 1 that don't say which form or product, 1 about something else and 1 advice or hearsay, not counted.");
    expect(result.caveats).not.toContain(zeroCaveat);
  });
  it("requires the zero-firsthand limit and caveat, including all-zero reports", () => {
    const input = base();
    input.community_searches![0]!.report_identity = [identity({ reports_read: 0, firsthand_exact: 0,
      exposure_unclear: 0, other_exposure: 0, not_firsthand: 0 })];
    const first = run(input);
    expect(first.status).toBe("not_ready");
    expect(first.limits).toContain("No one in Mineral Forum described their own use of form A; say so.");
    expect(first.caveats).toContain(zeroCaveat);
    expect(first.must_report).toContain("Mineral Forum, form A: 0 report(s) read; 0 firsthand report(s) of exactly this, 0 with a measurement after the change; 0 that don't say which form or product, 0 about something else and 0 advice or hearsay, not counted.");
    expect(checked(input).status).toBe("ready_with_limits");
  });
  it("does not require report identity when no thread was read", () => {
    const input = base();
    input.community_searches![0] = { community: "Mineral Forum", platform: "forum", queries: [TARGET],
      threads_read: [], url: "https://forum0.example/", access_boundary: "retrieval_failed" };
    expect(checked(input).status).toBe("ready_with_limits");
  });
  it("keeps review sites on review_corpora and item_identity", () => {
    const input = base();
    input.community_searches![0]!.platform = "review_site";
    input.principal_communities![0]!.platform = "review_site";
    input.community_searches![0]!.review_corpora = [{ product: "form A", reviews_read: 4, selection: "all",
      outcome_search: { queries: [TARGET], directions: ["benefit", "no_effect", "worse"] },
      item_identity: { exact_product: 4, variant_unresolved: 0, other_variant_excluded: 0 } }];
    const result = checked(input);
    expect(result.next_steps).toContain("community_searches for Mineral Forum gives report_identity, which is for threads outside review sites: review sites use review_corpora.");
    expect(result.must_report.some((line) => line.startsWith("Mineral Forum, form A: 4 report(s) read;"))).toBe(false);
    delete input.community_searches![0]!.report_identity;
    expect(checked(input).next_steps.some((step) => step.includes("report_identity"))).toBe(false);
  });
});

describe("comparisons with declared doses", () => {
  it("requires the declaration with a compared answer and threads read, and accepts an empty list", () => {
    const input = compared();
    expect(checked(input).next_steps).toEqual([
      "Give comparison_claims: each comparison the answer draws from forum reports, with both sides' daily doses as numbers, or an empty list if it draws none.", TOOL_LIST_REFRESH_HINT
    ]);
    expect(checked({ ...input, comparison_claims: [] }).status).toBe("ready_with_limits");
  });
  it("does not require comparisons for an uncompared answer, absent draft, unread threads or review sites alone", () => {
    expect(checked(base()).status).toBe("ready_with_limits");
    const absentDraft = run(base({ treatment_choice: "compared", answer_draft: undefined }));
    expect(absentDraft.next_steps.some((step) => step.includes("comparison_claims"))).toBe(false);
    for (const platform of ["forum", "review_site"] as const) {
      const input = compared();
      for (const s of input.community_searches!) {
        s.platform = platform;
        if (platform === "forum") s.threads_read = [];
      }
      expect(run(input).next_steps.some((step) => step.includes("comparison_claims"))).toBe(false);
    }
  });
  it("checks the comparison quote against the shown answer", () => {
    const input = base({ comparison_claims: [{ ...claim(), quote: "A sentence absent from the answer." }] });
    expect(checked(input).next_steps).toEqual([
      "comparison_claims[0] gives text the answer does not show: copy each sentence exactly from answer_draft."
    ]);
  });
  it.each([
    [1, 1, "mg", "mg"], [1, 1000, "g", "mg"], [2, 2, "capsules", "capsules"],
    [2, 2, " Capsules ", "CAPSULES"], [1000, 1, "mcg", "mg"], [1000, 1, "µg", "mg"],
    [1000, 1, "μg", "mg"], [1000, 1, "ug", "mg"], [0, 0, "g", "mg"],
    [1, 1 + 5e-10, "mg", "mg"]
  ] as const)("accepts comparable daily doses %s %s %s %s", (a, b, unitA, unitB) => {
    const result = checked(base({ comparison_claims: [claim(a, b, unitA, unitB)] }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).not.toContain(doseLimit);
    expect(result.caveats.some((line) => line.startsWith("Reports comparing two options"))).toBe(false);
  });
  it.each([[0.9, 6, "mg", "mg"], [2, 2, "IU", "mg"], [1, 1 + 2e-9, "mg", "mg"]] as const)(
    "requires the exact caveat for different doses %s %s %s %s", (a, b, unitA, unitB) => {
      const input = base({ comparison_claims: [claim(a, b, unitA, unitB)] });
      const first = run(input);
      expect(first.status).toBe("not_ready");
      expect(first.limits).toContain(doseLimit);
      expect(first.caveats).toContain(`Reports comparing two options changed the dose as well, so they cannot show which works better: form A at ${a} ${unitA}; form B at ${b} ${unitB}.`);
      expect(checked(input).status).toBe("ready_with_limits");
    }
  );
  it.each([[null, 1, "mg", "mg"], [1, null, "mg", "mg"], [1, 1, null, "mg"], [1, 1, "mg", null]] as const)(
    "requires the missing-dose caveat for %j %j %j %j", (a, b, unitA, unitB) => {
      const result = checked(base({ comparison_claims: [claim(a, b, unitA, unitB)] }));
      expect(result.status).toBe("ready_with_limits");
      expect(result.limits).toContain(doseLimit);
      expect(result.caveats).toContain(missingDose);
    }
  );
  it("requires the same-people caveat and deduplicates repeated comparison caveats", () => {
    const c = { ...claim(null, 1), same_people: false };
    const result = checked(base({ comparison_claims: [c, c] }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.limits).toContain("The comparison of form A with form B rests on reports from people who did not use both; say so.");
    const direct = "Reports comparing two options did not come from people who used both, so they are not a direct comparison of the two: form A; form B.";
    expect(result.caveats.filter((line) => line === direct)).toEqual([direct]);
    expect(result.caveats.filter((line) => line === missingDose)).toEqual([missingDose]);
  });
  it("checks quoted comparisons in other languages with the same numeric rules", () => {
    const quote = "この報告は二つの形態を比較しています。";
    const input = base({ comparison_claims: [{ ...claim(1, 1000, "g", "mg"), quote }] });
    input.answer_draft += `\n\n${quote}`;
    expect(checked(input).status).toBe("ready_with_limits");
  });
});

describe("communities named by the user and the visible check line", () => {
  it("requires each named forum once even when the dominant and independent communities were searched", () => {
    const input = base();
    input.principal_communities!.push({ name: "Named Forum", platform: "forum", named_by_user: true },
      { name: "Named Forum", platform: "forum", named_by_user: true });
    const step = "The user named Named Forum: search it with your web search and record it in community_searches, or the access boundary that stops you.";
    expect(checked(input).next_steps).toEqual([step, TOOL_LIST_REFRESH_HINT]);
    input.community_searches!.push({ ...input.community_searches![0]!, community: "Named Forum",
      threads_read: [{ url: "https://named.example/forms" }] });
    input.answer_draft += `\n\nOn [Named Forum](https://named.example/forms): ${Object.values(FINDINGS).join(" ")}`;
    expect(checked(input).status).toBe("ready_with_limits");
  });
  it("counts a platform the user names, such as Reddit, as searched when a community on it was (22 Oct, o355 keto thread)", () => {
    const input = base();
    input.principal_communities!.push({ name: "Reddit", platform: "reddit", named_by_user: true });
    const step = (name: string) => `The user named ${name}: search it with your web search and record it in ` +
      "community_searches, or the access boundary that stops you.";
    expect(checked(input).next_steps).toContain(step("Reddit"));
    // A Reddit search is recorded by its subreddit, so the search of r/Supplements is the search of Reddit.
    const thread = "https://www.reddit.com/r/Supplements/comments/abc123/form_a_and_form_b/";
    input.principal_communities!.push({ name: "r/Supplements", platform: "reddit" });
    input.community_searches!.push({ ...input.community_searches![0]!, community: "r/Supplements", platform: "reddit",
      threads_read: [{ url: thread }] });
    input.answer_draft += `\n\nOn [r/Supplements](${thread}): ${Object.values(FINDINGS).join(" ")}`;
    expect(checked(input).next_steps).not.toContain(step("Reddit"));
    // A subreddit the user names is still a community of its own, and another platform's name is not Reddit's.
    input.principal_communities!.push({ name: "r/Nootropics", platform: "reddit", named_by_user: true },
      { name: "Facebook", platform: "facebook", named_by_user: true });
    expect(checked(input).next_steps).toEqual(expect.arrayContaining([step("r/Nootropics"), step("Facebook")]));
  });
  it("records a named community that cannot be found without an address, as no discussion pool (22 Oct, book cases)", () => {
    const ghost: Search = { community: "Ghost Forum", platform: "forum", queries: ["Ghost Forum form A"], threads_read: [],
      access_boundary: "not_found" };
    const input = base();
    input.principal_communities!.push({ name: "Ghost Forum", platform: "forum", named_by_user: true });
    input.community_searches!.push(ghost);
    const result = checked(input);
    expect(result.next_steps.join("\n")).not.toMatch(/records an access boundary but no url|The user named Ghost Forum/u);
    expect(result.caveats).toContain("A community I could not find: Ghost Forum. Reports there are not included.");
    expect(result.limits).toContain("Ghost Forum could not be found; say so.");
    expect(result.status).toBe("ready_with_limits");
    // Found is not not_found: an address or a thread read contradicts it.
    const withAddress = base();
    withAddress.principal_communities!.push({ name: "Ghost Forum", platform: "forum", named_by_user: true });
    withAddress.community_searches!.push({ ...ghost, url: "https://ghost.example/" });
    expect(checked(withAddress).next_steps).toContain("community_searches for Ghost Forum gives access_boundary not_found " +
      "with an address: a community with an address was found, so record what stopped the search instead, or the " +
      "threads and what they showed.");
    // A community that could not be found is no discussion pool of its own: with one found forum, that one is alone.
    const alone = base();
    alone.principal_communities = [{ name: "Mineral Forum", platform: "forum" }, { name: "Ghost Forum", platform: "forum", named_by_user: true }];
    alone.community_searches = [alone.community_searches![0]!, ghost];
    expect(checked(alone).next_steps).toContain("principal_communities lists one community: name an independent one " +
      "(another platform, forum or discussion pool) and search it, or give single_community_reason.");
  });
  it("accepts a recorded access boundary for a named forum", () => {
    const input = base();
    input.principal_communities!.push({ name: "Named Forum", platform: "forum", named_by_user: true });
    input.community_searches!.push({ community: "Named Forum", platform: "forum", queries: [TARGET],
      threads_read: [], url: "https://named.example/", access_boundary: "login_required" });
    expect(checked(input).status).toBe("ready_with_limits");
  });
  it("runs YouTube discovery checks when the user names it after two searched forums", () => {
    const input = base();
    input.principal_communities!.push({ name: "YouTube", platform: "youtube", named_by_user: true });
    expect(checked(input).next_steps).toContain(
      "Find community videos with scout_gemini_youtube_candidates (survey_youtube_community only if the scout is unavailable), audit each material video, and pass the remedies its comments name back to the scout as rediscovery_leads (a video or creator as video:<id>)."
    );
  });
  it("returns the fixed ready line without requiring it in the draft, caveats or receipt", () => {
    const result = checked(noForum());
    expect(result.status).toBe("ready");
    expect(result.check_line).toBe("Checked with AskRigor's final check.");
    expect(result.caveats).toEqual([]);
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
    expect(receipt.ok).toBe(true);
    if (receipt.ok) expect(receipt.claims).not.toHaveProperty("check_line");
    expect(noForum().answer_draft).not.toContain(result.check_line);
  });
  it("returns the limited line separately, and omits it for not_ready and unavailable receipts", () => {
    const result = checked(base());
    expect(result.status).toBe("ready_with_limits");
    expect(result.check_line).toBe("Checked with AskRigor's final check, with the limits above.");
    expect(result.caveats).not.toContain(result.check_line);
    const notReady = run(base());
    expect(notReady.status).toBe("not_ready");
    expect(notReady).not.toHaveProperty("check_line");
    expect(finalizeResearch(base(), { secret: undefined })).not.toHaveProperty("check_line");
  });
  it("appends the exact instruction after the caveat and must-report lines in the MCP text result", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    const server = createAskRigorServer();
    const client = new Client({ name: "community-report-identity-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const input = base();
      const result = await client.callTool({ name: "finalize_research", arguments: {
        ...input, answer_draft: `${input.answer_draft}\n\n${run(input).caveats.join(" ")}`
      } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ status: "ready_with_limits",
        check_line: "Checked with AskRigor's final check, with the limits above." });
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      const ending = "End the answer with this line, as written (in the answer's language when the answer is not in English): Checked with AskRigor's final check, with the limits above.";
      expect(text).toContain(`\n${ending}`);
      expect(text.indexOf(ending)).toBeGreaterThan(text.lastIndexOf("The answer must report:"));
      expect(text.indexOf(ending)).toBeGreaterThan(text.lastIndexOf("The answer must contain, as written:"));
      // The lanes keep their instruction for the model; the one-line panel shows none of them (owner question 108).
      expect(text).toContain("Then copy the sentences that report it into the entry's answer_quotes.");
      expect(result._meta).toBeUndefined();
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe("strict declaration schemas", () => {
  it.each([
    { report_identity: [] }, { report_identity: Array.from({ length: 5 }, () => identity()) },
    { report_identity: [identity({ reports_read: -1 })] }, { report_identity: [identity({ measured_after: 0.5 })] },
    { report_identity: [{ ...identity(), unexpected: true }] }, { report_identity: [identity({ exposure: " " })] },
    { report_identity: [identity({ exposure: "a".repeat(201) })] }
  ])("rejects invalid report identity %j", (overrides) => {
    const input = base();
    Object.assign(input.community_searches![0]!, overrides);
    expect(finalizeResearchInputSchema.safeParse(input).success).toBe(false);
  });
  // ChatGPT's app shows report_identity only as "unknown", and lesson #30's 2026-10-16 regression sent one object.
  const single = (value: unknown): FinalizeResearchInput => {
    const input = base();
    (input.community_searches![0] as Record<string, unknown>).report_identity = value;
    return input;
  };
  const shown = (input: FinalizeResearchInput) => ({ ...input, answer_draft: `${input.answer_draft}\n\n${run(base()).caveats.join(" ")}` });
  const withoutReceipt = ({ finalization_receipt: _receipt, carry_forward: _token, carried, ...rest }: ReturnType<typeof finalizeResearch>) => {
    const { issued_at: _issued, turn: _turn, ...state } = carried ?? {};
    return { ...rest, carried: state };
  };
  it("accepts one report identity object and checks it as a list of one", () => {
    expect(finalizeResearchInputSchema.parse(single(identity())).community_searches![0]!.report_identity).toEqual([identity()]);
    expect(withoutReceipt(run(shown(single(identity()))))).toEqual(withoutReceipt(run(shown(base()))));
    expect(run(shown(single(identity({ reports_read: 3 })))).next_steps).toEqual([sumStep]);
  });
  it.each([{ ...identity(), unexpected: true }, identity({ reports_read: -1 }), identity({ exposure: " " })])(
    "rejects an invalid single report identity %j", (value) => {
      expect(finalizeResearchInputSchema.safeParse(single(value)).success).toBe(false);
    });
  it("accepts one report identity object at the MCP endpoint, whose published schema allows it", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    const server = createAskRigorServer();
    const client = new Client({ name: "community-report-identity-single-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const tool = (await client.listTools()).tools.find(({ name }) => name === "finalize_research")!;
      const published = (tool.inputSchema as { properties: { community_searches: { items: { properties: {
        report_identity: { anyOf?: unknown; type?: string; description?: string } } } } } }).properties.community_searches.items.properties.report_identity;
      expect(published.anyOf).toBeUndefined();
      expect(published.type).toBeUndefined();
      expect(published.description).toContain("Outside review sites");
      const result = await client.callTool({ name: "finalize_research", arguments: { ...shown(single(identity())) } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ status: "ready_with_limits" });
    } finally {
      await client.close();
      await server.close();
    }
  });
  it.each([
    { ...claim(), arms: [claim().arms[0]] }, { ...claim(), arms: [...claim().arms, claim().arms[0]] },
    { ...claim(), unexpected: true }, { ...claim(), arms: [{ ...claim().arms[0], dose: -1 }, claim().arms[1]] },
    { ...claim(), arms: [{ ...claim().arms[0], unit: " " }, claim().arms[1]] },
    { ...claim(), arms: [{ ...claim().arms[0], unexpected: true }, claim().arms[1]] }
  ])("rejects invalid comparison %j", (invalid) => {
    expect(finalizeResearchInputSchema.safeParse({ ...base(), comparison_claims: [invalid] }).success).toBe(false);
  });
  it("bounds comparison claims at twelve and trims exposure and unit labels", () => {
    expect(finalizeResearchInputSchema.safeParse(base({ comparison_claims: Array.from({ length: 13 }, () => claim()) })).success).toBe(false);
    const input = base({ comparison_claims: [claim(1, 1, " mg ", "mg")] });
    input.community_searches![0]!.report_identity![0]!.exposure = " form A ";
    const parsed = finalizeResearchInputSchema.parse(input);
    expect(parsed.community_searches![0]!.report_identity![0]!.exposure).toBe("form A");
    expect(parsed.comparison_claims![0]!.arms[0]!.unit).toBe("mg");
  });
});
