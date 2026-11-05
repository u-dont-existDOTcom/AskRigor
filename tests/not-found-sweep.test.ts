import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ABSENCE_SWEEP_RULES, SEARCH_COVERAGE_VALUES, SMALL_LITERATURE_SEARCH_NOTE, nameFormInQuery
} from "../apps/research-mcp/src/absence-searches.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import {
  communitySkipCaveat, finalizeResearch, finalizeResearchInputSchema, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { advisoryNotes, assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// The free Claude test of 5 Nov 2026 (Claude Sonnet with AskRigor, on Piliostigma reticulatum leaves): the answer passed
// the final check saying no mammal toxicity study exists, after PubMed and Europe PMC searches under the plant's usual
// name. It missed a paper whose title spells it "Pilostigma" and a 2022 study in a journal neither index covers. HRP
// already asks for both searches (UserNamedInterventionSweep, HistoricalVocabularyAndCitationBackchain,
// NoHumanEvidenceAbsenceClaimBeforeSweep); a small search's result now names them, and the final check asks for them
// beside a not-found claim, as notes, checking exactly each name form declared searched. The plant, studies and counts
// here are invented.
const SECRET = "not-found-sweep-test-secret-0123456789abcdef";
const TARGET = "Toxicity of a synthetic shrub's leaves";
const DOI = "10.1000/sweep-trial";
const NAME = "Sampleia reticulata";
const VARIANT = "Samplia reticulata";
const AUDITED = "full text read, methods audited by AskRigor";
const ABSENT = "No study of the leaves' toxicity in mammals turned up in these searches.";
const REASON = "Synthetic fixture isolates the not-found searches.";
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: REASON };
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const searched = (query: string, src: "pubmed" | "europepmc" | "ctgov" = "pubmed") =>
  sign("literature_search", { src, q: discoveryQueryDigest([query]), ret: 2, n: 2 });
const input = (overrides: Record<string, unknown> = {}, later: Record<string, unknown> = {}) => ({
  receipts: [sign("study_audit", { doi: DOI, content: "a".repeat(16) }), searched(`${NAME} toxicity`)],
  research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: REASON, commercial_review_applicability: NOT_APPLICABLE, intervention_identity: NOT_APPLICABLE,
  full_text_search: { status: "not_needed", reason: REASON }, lab_preparation: NOT_APPLICABLE,
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [{ quote: ABSENT, state: "support_not_located" }],
  scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [], safety_claims: [],
  safety_question: false, mechanism_claims: [], recommendations: [],
  answer_draft: [`[Trial](https://doi.org/${DOI}) (${AUDITED}) gave rats an extract of ${NAME} leaves.`, ABSENT,
    communitySkipCaveat(REASON)].join("\n\n"),
  later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED }], ...later },
  ...overrides
});
const check = (overrides: Record<string, unknown> = {}, later: Record<string, unknown> = {}) =>
  assertNextStepsContract(finalizeResearch(input(overrides, later), { secret: SECRET }));

// The note and the limit, word for word.
const FORMS_ASK = "search the key name's other spellings, older names and synonyms, each with search_pubmed or " +
  "search_europe_pmc, and give each in later_inputs.name_forms as {form, query}, with that search's exact query, and " +
  "the key name as the answer writes it in later_inputs.key_name";
// With the key name the answer shows given (the review of 5 Nov 2026), the ask leaves it out.
const FORMS_ASK_NAMED = FORMS_ASK.replace(", and the key name as the answer writes it in later_inputs.key_name", "");
const BEYOND_ASK = "search a source beyond PubMed and Europe PMC: your own web search finds journals they don't index " +
  "(then give other_journals in later_inputs.search_coverage), and search_clinical_trials covers trial registries";
const sweep = (...asks: string[]) => `The answer says something was not found: before saying so, ${ABSENCE_SWEEP_RULES} ` +
  `ask you to ${asks.join("; and ")}.`;
const notFoundLimit = (uncovered: string) => "Where this answer says something was not found, it means the searches " +
  `made here (PubMed) did not find it${uncovered === "" ? "" : `, and they did not cover ${uncovered}`}; that is not ` +
  "evidence that it does not exist.";
const sweepNotes = (result: FinalizeResearchOutput) =>
  advisoryNotes(result).filter((note) => note.startsWith("The answer says something was not found: before"));
const formNotes = (result: FinalizeResearchOutput) =>
  advisoryNotes(result).filter((note) => note.startsWith("name_forms["));

describe("the searches before a not-found claim: shape", () => {
  it("names HRP's three rules, and takes name_forms and search_coverage's newer form as later inputs", () => {
    expect(ABSENCE_SWEEP_RULES).toBe("HRP UserNamedInterventionSweep, HistoricalVocabularyAndCitationBackchain and " +
      "NoHumanEvidenceAbsenceClaimBeforeSweep");
    expect(laterInputNames("finalize_research")).toEqual(expect.arrayContaining(["name_forms", "search_coverage"]));
    expect(SEARCH_COVERAGE_VALUES).toEqual(["historical_terms", "citation_chains", "grey_literature", "other_journals"]);
    // The published input keeps its three values (owner answer 189a): other_journals goes in later_inputs.
    expect(finalizeResearchInputSchema.shape.search_coverage.safeParse(["other_journals"]).success).toBe(false);
  });

  it("matches a name form against its query exactly, in any script, case or compatibility form", () => {
    expect(nameFormInQuery({ form: VARIANT, query: `${VARIANT.toUpperCase()} AND toxicity` })).toBe(true);
    expect(nameFormInQuery({ form: "ピリオスティグマ", query: "ピリオスティグマ 毒性" })).toBe(true);
    expect(nameFormInQuery({ form: "Ｓａｍｐｌｉａ", query: `${VARIANT} toxicity` })).toBe(true);
    expect(nameFormInQuery({ form: VARIANT, query: `${NAME} toxicity` })).toBe(false);
  });
});

describe("the searches before a not-found claim: the final check", () => {
  it("asks for the key name's other forms and a source beyond the indexes, and names both gaps in the limit", () => {
    const result = check();
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.round).toEqual({ number: 1, limit: 10 });
    expect(sweepNotes(result)).toEqual([sweep(FORMS_ASK, BEYOND_ASK)]);
    expect(result.limits).toContain(notFoundLimit("older or variant terms, citation chains, grey literature and " +
      "journals outside PubMed and Europe PMC"));
  });

  it("takes a name form searched here as older or variant terms covered, and stops asking for it", () => {
    const result = check({ receipts: [...input().receipts as string[], searched(`${VARIANT} toxicity`)] },
      { name_forms: [{ form: VARIANT, query: `${VARIANT} toxicity` }], key_name: NAME });
    expect(formNotes(result)).toEqual([]);
    expect(sweepNotes(result)).toEqual([sweep(BEYOND_ASK)]);
    expect(result.limits).toContain(notFoundLimit("citation chains, grey literature and journals outside PubMed and " +
      "Europe PMC"));
  });

  it("takes other_journals from search_coverage's newer form, at the top level or in later_inputs", () => {
    for (const result of [check({}, { search_coverage: ["other_journals"] }),
      check({ search_coverage: ["other_journals"] })]) {
      expect(sweepNotes(result)).toEqual([sweep(FORMS_ASK)]);
      expect(result.limits).toContain(notFoundLimit("older or variant terms, citation chains and grey literature"));
    }
    const both = check({ receipts: [...input().receipts as string[], searched(VARIANT, "europepmc")] },
      { name_forms: [{ form: VARIANT, query: VARIANT }], key_name: NAME, search_coverage: ["other_journals",
        "citation_chains", "grey_literature"] });
    expect(sweepNotes(both)).toEqual([]);
    expect(both.limits.some((limit) => limit.startsWith("Where this answer says something was not found, it means " +
      "the searches made here (PubMed and Europe PMC) did not find it; that is not evidence"))).toBe(true);
  });

  it("checks each name form exactly: its query against this call's literature searches, and the form in it", () => {
    const unsearched = check({}, { name_forms: [{ form: VARIANT, query: `${VARIANT} toxicity` }], key_name: NAME });
    expect(formNotes(unsearched)).toEqual([`name_forms[0].query is not the query of any literature search passed here: ` +
      `search ${VARIANT} with search_pubmed, search_europe_pmc or search_clinical_trials, give that exact query, and ` +
      "pass its research_receipt."]);
    // The form unsearched is no older or variant term covered.
    expect(sweepNotes(unsearched)).toEqual([sweep(FORMS_ASK_NAMED, BEYOND_ASK)]);
    const elsewhere = check({}, { name_forms: [{ form: VARIANT, query: `${NAME} toxicity` }], key_name: NAME });
    expect(formNotes(elsewhere)).toEqual([`name_forms[0].form is not in its query: give the query that searched ` +
      `${VARIANT}, copied exactly.`]);
    // A form in another script is matched as written.
    const japanese = "サンプレイア";
    const matched = check({ receipts: [...input().receipts as string[], searched(`${japanese} 毒性`)] },
      { name_forms: [{ form: japanese, query: `${japanese} 毒性` }], key_name: NAME });
    expect(formNotes(matched)).toEqual([]);
    expect(sweepNotes(matched)).toEqual([sweep(BEYOND_ASK)]);
  });

  // The review of 5 Nov 2026.
  it("checks each word of a form among its query's words, so field tags don't hide it", () => {
    const query = "Samplia[tiab] AND reticulata[tiab]";
    expect(nameFormInQuery({ form: VARIANT, query })).toBe(true);
    expect(nameFormInQuery({ form: VARIANT, query: "\"Samplia reticulata\"[Title/Abstract] OR Samplia*" })).toBe(true);
    expect(nameFormInQuery({ form: VARIANT, query: "Sampliana[tiab] AND reticulata[tiab]" })).toBe(false);
    const tagged = check({ receipts: [...input().receipts as string[], searched(query)] },
      { name_forms: [{ form: VARIANT, query }], key_name: NAME });
    expect(formNotes(tagged)).toEqual([]);
    expect(sweepNotes(tagged)).toEqual([sweep(BEYOND_ASK)]);
  });

  it("takes a one-character name in a script without spaces, found inside its query", () => {
    expect(nameFormInQuery({ form: "艾", query: "艾 毒性" })).toBe(true);
    expect(nameFormInQuery({ form: "艾", query: "艾叶毒性" })).toBe(true);
    expect(nameFormInQuery({ form: "艾", query: "蒿 毒性" })).toBe(false);
    const one = check({ receipts: [...input().receipts as string[], searched("艾 toxicity")] },
      { name_forms: [{ form: "艾", query: "艾 toxicity" }], key_name: NAME });
    expect(advisoryNotes(one).join("\n")).not.toContain("name_forms[0]");
    expect(sweepNotes(one)).toEqual([sweep(BEYOND_ASK)]);
  });

  it("digests a query in Unicode's composed form, as the search's receipt signs it", () => {
    const composed = "Sampl\u00e9ia toxicity";
    const decomposed = "Sample\u0301ia toxicity";
    expect(discoveryQueryDigest([decomposed])).toBe(discoveryQueryDigest([composed]));
    for (const [signed, declared] of [[composed, decomposed], [decomposed, composed]]) {
      const result = check({ receipts: [...input().receipts as string[], searched(signed)] },
        { name_forms: [{ form: "Sampl\u00e9ia", query: declared }], key_name: NAME });
      expect(formNotes(result), declared).toEqual([]);
      expect(sweepNotes(result)).toEqual([sweep(BEYOND_ASK)]);
    }
  });

  it("keeps the ask until a form other than the key name, as the answer writes it, was searched", () => {
    const usual = { name_forms: [{ form: NAME, query: `${NAME} toxicity` }], search_coverage: ["other_journals"] };
    // The usual name given as a form is no other name, and the note says so.
    const named = check({}, { ...usual, key_name: NAME });
    expect(formNotes(named)).toEqual(["name_forms[0].form is the key name as the answer writes it: give the other " +
      "spellings, older names and synonyms searched."]);
    expect(sweepNotes(named)).toEqual([sweep(FORMS_ASK_NAMED)]);
    // Without the key name, no form can be shown to be another one: the ask stays, and asks for it.
    expect(sweepNotes(check({}, usual))).toEqual([sweep(FORMS_ASK)]);
    // A key name the answer doesn't show counts nothing, and is a note of its own.
    const unshown = check({ receipts: [...input().receipts as string[], searched(`${VARIANT} toxicity`)] },
      { name_forms: [{ form: VARIANT, query: `${VARIANT} toxicity` }], key_name: "Exemplaria", search_coverage: ["other_journals"] });
    expect(advisoryNotes(unshown)).toContain("later_inputs.key_name is not in the answer: give the key name exactly as " +
      "the answer writes it, copied from answer_draft.");
    expect(sweepNotes(unshown)).toEqual([sweep(FORMS_ASK)]);
    // The same name in another case is still the key name.
    expect(formNotes(check({}, { ...usual, key_name: NAME.toUpperCase() }))).toEqual(formNotes(named));
  });

  it("asks nothing of an answer that says nothing was not found, and never blocks", () => {
    const none = check({ absence_claims: [], answer_draft: (input().answer_draft as string).replace(`${ABSENT}\n\n`, "") });
    expect(sweepNotes(none)).toEqual([]);
    expect(none.limits.some((limit) => limit.startsWith("Where this answer says something was not found"))).toBe(false);
    // A malformed form is dropped with a note; the check still runs.
    const malformed = check({}, { name_forms: [{ form: "x", query: "" }] });
    expect(malformed.status).toBe("ready_with_limits");
    expect(advisoryNotes(malformed).join("\n")).toContain("name_forms[0]");
  });
});

describe("the searches before a not-found claim: a small search's result", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const connect = async () => {
    vi.stubEnv("NCBI_TOOL", "askrigor-sweep-tests");
    vi.stubEnv("NCBI_EMAIL", "maintainer@example.test");
    const server = createAskRigorServer();
    const client = new Client({ name: "not-found-sweep-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    return { client, server };
  };
  const pubmed = (count: number) => JSON.stringify({ header: { type: "esearch", version: "0.3" }, esearchresult: {
    count: String(count), retmax: "2", retstart: "0", idlist: ["40123456", "39876543"], translationset: [],
    querytranslation: NAME } });
  const europePmc = (count: number) => JSON.stringify({ version: "6.9", hitCount: count, nextCursorMark: "AoE=",
    request: { queryString: NAME, resultType: "lite", cursorMark: "*", pageSize: 2, sort: "", synonym: false },
    resultList: { result: [
      { id: "40123456", source: "MED", pmid: "40123456", title: "First synthetic record", pubYear: "2024" },
      { id: "39876543", source: "MED", pmid: "39876543", title: "Second synthetic record", pubYear: "2023" }
    ] } });

  // 50 is the small search read whole before anything is called not found; the test's searches had 11 and 23 records.
  it.each([[2, true], [11, true], [50, true], [51, false]])("PubMed with %i records: note %s", async (count, noted) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(pubmed(count), { status: 200 })));
    const { client, server } = await connect();
    try {
      const result = await client.callTool({ name: "search_pubmed", arguments: { query: NAME, page_size: 2 } });
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      expect(text.includes(SMALL_LITERATURE_SEARCH_NOTE)).toBe(noted);
      expect(text.split("Few records").length).toBeLessThanOrEqual(2);
    } finally { await client.close(); await server.close(); }
  });

  it.each([[23, true], [94, false]])("Europe PMC with %i records: note %s", async (count, noted) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(europePmc(count), { status: 200 })));
    const { client, server } = await connect();
    try {
      const result = await client.callTool({ name: "search_europe_pmc", arguments: { query: NAME, page_size: 2 } });
      expect(result.isError).not.toBe(true);
      expect((result.content as Array<{ text: string }>)[0]!.text.includes(SMALL_LITERATURE_SEARCH_NOTE)).toBe(noted);
    } finally { await client.close(); await server.close(); }
  });

  it("keeps the owner's words of 30 Sep 2026, then names the other forms, a source beyond the indexes and HRP's rules", () => {
    expect(SMALL_LITERATURE_SEARCH_NOTE).toBe(" Few records: before saying anything was not found, try synonyms, older " +
      "or variant terms, the components of a mixed exposure, and citation chains. Before saying studies don't exist, " +
      "also search the key name's other spellings and older names, and a source beyond PubMed and Europe PMC: your " +
      "own web search finds journals they don't index, and search_clinical_trials covers trial registries (HRP " +
      "UserNamedInterventionSweep, HistoricalVocabularyAndCitationBackchain and NoHumanEvidenceAbsenceClaimBeforeSweep).");
  });
});
