import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  communitySkipCaveat, finalizeResearch, finalizeResearchOutputSchema, parseFinalizeResearchInput, studyMapRequestsOf,
  type FinalizeResearchInput, type FinalizeResearchOptions
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import type { SourceLineDocument } from "../apps/research-mcp/src/source-lines.js";
import {
  lookUpStudyMap, registryRecordOf, STUDY_MAP_GUIDANCE, type RegistryRecord, type StudyMap, type StudyMapTexts
} from "../apps/research-mcp/src/study-map.js";
import { resetClinicalTrialsFreshnessCacheForTests } from "../packages/sources/src/clinical-trials.js";

// Every number and name here is invented. NCT01234567 is the fixture record the ClinicalTrials.gov tests use.
const SECRET = "study-map-test-secret-0123456789012345678901";
const REASON = "Synthetic fixture isolates the study map.";
const paper = (letter: string, pmid: string) =>
  ({ doi: `10.1000/map-${letter}`, pmid, handle: `aft1_${letter.repeat(32)}` });
const A = paper("a", "49000101");
const B = paper("b", "49000102");
const C = paper("c", "49000103");
// A second report of trial A's people, and a review that repeats trial A.
const A2 = paper("d", "49000104");
const R = paper("e", "49000105");

const A_RESULT = "Walking for 30 minutes a day lowered knee pain by 9 points at 6 months, against 2 points with usual care.";
const B_RESULT = "Supervised walking lowered knee pain by 7 points at 6 months compared with stretching alone.";
const C_RESULT = "In older adults, brisk walking lowered knee pain by 6 points at 12 months against a waiting list.";
const A2_RESULT = "Two years after the trial ended, walking still lowered knee pain by 5 points against usual care.";
const R_CITES = "The largest of the three trials we pooled found that walking lowered knee pain by 9 points at 6 months.";
const CLAIM = "Walking eased knee pain in three independent trials.";
const ABSENCE = "No trial showed that walking prevents knee surgery.";

const DOCUMENTS: Readonly<Record<string, SourceLineDocument>> = {
  [A.handle]: { kind: "full_text", blocks: [
    { text: "Adults with knee pain were randomised to walking or usual care. Trial registration: ClinicalTrials.gov NCT01234567.", abstract: true },
    { text: A_RESULT, section: "Results" },
  ] },
  [B.handle]: { kind: "full_text", blocks: [
    { text: "A randomised trial of supervised walking (registered as NCT09000002).", abstract: true },
    { text: B_RESULT, section: "Results" },
  ] },
  [C.handle]: { kind: "full_text", blocks: [
    { text: "Older adults with knee pain; registration NCT 09000003.", abstract: true },
    { text: C_RESULT, section: "Results" },
    // A trial named outside the abstract, in the discussion, is another trial's and ties nothing.
    { text: "An earlier trial (NCT09000006) used a different walking programme.", section: "Discussion" },
  ] },
  [A2.handle]: { kind: "full_text", blocks: [
    { text: "This is the two-year follow-up of a randomised trial of walking (NCT01234567).", abstract: true },
    { text: A2_RESULT, section: "Results" },
  ] },
  [R.handle]: { kind: "full_text", blocks: [
    { text: "A review of trials of walking for knee pain.", abstract: true },
    { text: R_CITES, section: "Results" },
  ] },
};
const RECORDS: Readonly<Record<string, RegistryRecord>> = {
  NCT01234567: { nct: "NCT01234567", start: "2025-01-15", firstSubmitted: "2024-12-02", pmids: [A.pmid], secondaryIds: [] },
  NCT09000002: { nct: "NCT09000002", start: "2024-03-01", firstSubmitted: "2024-02", pmids: [B.pmid], secondaryIds: [] },
  NCT09000003: { nct: "NCT09000003", start: "2023-09", firstSubmitted: "2023-06-30", pmids: [], secondaryIds: [] },
};
const texts = (overrides: Partial<StudyMapTexts> = {}): StudyMapTexts => ({
  fullText: (handle) => DOCUMENTS[handle],
  abstract: async () => undefined,
  registry: async (nct) => RECORDS[nct],
  ...overrides,
});

const audit = ({ doi, pmid, handle }: ReturnType<typeof paper>, claims: Record<string, string | string[]> = {}) =>
  issueResearchReceipt("study_audit", { doi, pmid, content: "a".repeat(16), handle, ...claims }, { secret: SECRET });
const draft = (...extra: string[]) => [
  CLAIM, ...extra,
  "- Trial A: [Smith 2024](https://doi.org/10.1000/map-a)",
  "- Trial B: [Jones 2024](https://doi.org/10.1000/map-b)",
  "- Trial C: [Lee 2023](https://doi.org/10.1000/map-c)",
  "",
  communitySkipCaveat(REASON),
].join("\n");

function fixture(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  return {
    receipts: [A, B, C, A2, R].map((each) => audit(each)),
    research_target: "Synthetic study map", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: REASON,
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no coded intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the study map." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [["Trial A", A], ["Trial B", B], ["Trial C", C]].map(([marker, { doi }]) =>
      ({ id: doi as string, status: "validated", read_depth: "full_text_audited", answer_marker: marker as string })),
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: draft(),
    ...overrides,
  } as FinalizeResearchInput;
}

type MapStudy = StudyMap["studies"][number];
const study = (id: string, { doi }: ReturnType<typeof paper>, group: string, registry?: string[]): MapStudy =>
  ({ id, source: doi, group, ...(registry === undefined ? {} : { registry }) });
const TRIAL_A = study("A", A, "Adults with knee pain, Exampleton, 2025", ["NCT01234567"]);
const TRIAL_B = study("B", B, "Adults with knee pain, Sampleville, 2024", ["NCT09000002"]);
const TRIAL_C = study("C", C, "Older adults with knee pain, Testford, 2023", ["NCT09000003"]);
const THREE: StudyMap = {
  studies: [TRIAL_A, TRIAL_B, TRIAL_C],
  claims: [{ quote: CLAIM, studies: ["A", "B", "C"], groups: 3, passages: [
    { study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }, { study: "C", passage: C_RESULT },
  ] }],
};

const OPTIONS: FinalizeResearchOptions = { secret: SECRET };
/** A result without what differs from one call to the next: its tokens, its receipt and the turn and time they carry. */
const stable = (result: ReturnType<typeof finalizeResearch>) => {
  const { carry_forward: _carry, round_token: _round, finalization_receipt: _receipt, carried, ...rest } = result;
  const { turn: _turn, issued_at: _issued, ...state } = carried ?? {};
  return { ...rest, carried: state };
};

/** The check as the tool runs it: a first pass, the map looked up, and the check again with what was found. */
async function check(input: FinalizeResearchInput, given = texts()) {
  const first = finalizeResearch(input, OPTIONS);
  const asked = studyMapRequestsOf(first);
  if (asked === undefined) return { first, result: first, notes: [] as string[] };
  const lookup = await lookUpStudyMap(asked.map, asked.requests, given);
  const result = finalizeResearch(input, { ...OPTIONS, studyMapLookup: lookup });
  // The map's notes: those the same check gives without it set aside.
  const { study_map: _map, ...without } = input as FinalizeResearchInput & { study_map?: unknown };
  const before = finalizeResearch(without, OPTIONS).notes ?? [];
  return { first, result, lookup, notes: (result.notes ?? []).filter((note) => !before.includes(note)) };
}

describe("the study map's shape", () => {
  it("takes the map through later_inputs, and drops a study with an unusable source with a note, not the map", () => {
    const parsed = parseFinalizeResearchInput({ ...fixture(), later_inputs: { study_map: THREE } });
    expect(parsed.data?.study_map).toEqual(THREE);
    const bad = parseFinalizeResearchInput({ ...fixture(), later_inputs: { study_map: {
      ...THREE, studies: [...THREE.studies, { id: "D", source: "a paper I read", group: "Someone" }],
    } } });
    expect(bad.data?.study_map?.studies.map(({ id }) => id)).toEqual(["A", "B", "C"]);
    expect(bad.notes.join(" ")).toContain("study_map.studies[3].source: dropped: give the study's DOI, PMID, PMCID or web address.");
  });

  it("leaves out an item naming a study the map doesn't have, and checks the rest", async () => {
    const map: StudyMap = {
      ...THREE,
      links: [{ from: "B", kind: "same_cohort", to: "Z", passage: B_RESULT }],
      claims: [...THREE.claims, { quote: CLAIM, studies: ["A", "Q"], groups: 2 }],
    };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toContain("study_map.links[0] names Z, which isn't a study in study_map.studies, so it was left out: " +
      "name each study by its id.");
    expect(notes).toContain("study_map.claims[1] names Q, which isn't a study in study_map.studies, so it was left out: " +
      "name each study by its id.");
    expect(result.study_map?.links).toEqual([]);
    expect(result.study_map?.claims.map(({ claim }) => claim)).toEqual([0]);
    expect(result.study_map?.groups).toBe(3);
  });
});

describe("groups of people counted once", () => {
  it("adds no note for three distinct trials with everything found (the negative control)", async () => {
    const { first, result, notes } = await check(fixture({ study_map: THREE }));
    expect(first.status).toMatch(/^ready/u);
    expect(result.status).toBe(first.status);
    expect(result.next_steps).toEqual([]);
    expect(result.round).toEqual(first.round);
    expect(notes).toEqual([]);
    expect(result.study_map).toEqual({
      looked_up: true,
      groups: 3,
      studies: [
        { id: "A", tied: true, text: "full_text", group: 1, registry: [{ number: "NCT01234567", tie: "in_text", registered: "by_start" }] },
        { id: "B", tied: true, text: "full_text", group: 2, registry: [{ number: "NCT09000002", tie: "in_text", registered: "by_start" }] },
        { id: "C", tied: true, text: "full_text", group: 3, registry: [{ number: "NCT09000003", tie: "in_text", registered: "by_start" }] },
      ],
      links: [],
      claims: [{ claim: 0, shown: true, groups: 3, counted: 3, passages: ["found", "found", "found"] }],
    });
    expect(finalizeResearchOutputSchema.safeParse(result).success).toBe(true);
  });

  it("counts two reports of one group of people once, by the registry number in an abstract", async () => {
    const quote = "Two trials, one report each, found that walking eased knee pain.";
    const map: StudyMap = {
      studies: [TRIAL_A, study("A2", A2, "Adults with knee pain followed for two years")],
      claims: [{ quote, studies: ["A", "A2"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "A2", passage: A2_RESULT }] }],
    };
    const { result, notes } = await check(fixture({ study_map: map, answer_draft: draft(quote) }));
    expect(result.status).toMatch(/^ready/u);
    expect(notes).toEqual(["study_map.claims[0] counts 2 independent groups of people, but A and A2 name the same " +
      "registry number, NCT01234567 (in A2's abstract), so AskRigor counts 1: count them once, or show in the map " +
      "that they are different people, and check the answer again."]);
    expect(result.study_map?.claims).toEqual([{ claim: 0, shown: true, groups: 2, counted: 1, passages: ["found", "found"] }]);
    expect(result.study_map?.studies.map(({ group }) => group)).toEqual([1, 1]);
  });

  it("counts one group of people from one registration that lists both papers", async () => {
    const quote = "Two reports of the trial found that walking eased knee pain.";
    const records = { ...RECORDS, NCT01234567: { ...RECORDS.NCT01234567!, pmids: [A.pmid, A2.pmid] } };
    const followUp: SourceLineDocument = { kind: "full_text", blocks: [{ text: A2_RESULT, section: "Results" }] };
    const map: StudyMap = {
      studies: [TRIAL_A, study("A2", A2, "Adults with knee pain followed for two years")],
      claims: [{ quote, studies: ["A", "A2"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "A2", passage: A2_RESULT }] }],
    };
    const { notes } = await check(fixture({ study_map: map, answer_draft: draft(quote) }), texts({
      fullText: (handle) => handle === A2.handle ? followUp : DOCUMENTS[handle],
      registry: async (nct) => records[nct as keyof typeof records],
    }));
    expect(notes).toEqual([expect.stringContaining(`but A's registration NCT01234567 lists A2's paper (PMID ${A2.pmid}), ` +
      "so AskRigor counts 1")]);
  });

  it("counts a review that repeats a trial once, and notes it counted twice", async () => {
    const quote = "A review and the trial it rests on found that walking eased knee pain.";
    const map = (groups: number): StudyMap => ({
      studies: [study("R", R, "Three pooled trials of walking for knee pain"), TRIAL_A],
      links: [{ from: "R", kind: "cites_as_evidence", to: "A", passage: R_CITES }],
      claims: [{ quote, studies: ["R", "A"], groups,
        passages: [{ study: "R", passage: R_CITES }, { study: "A", passage: A_RESULT }] }],
    });
    const once = await check(fixture({ study_map: map(1), answer_draft: draft(quote) }));
    expect(once.notes).toEqual([]);
    expect(once.result.study_map?.links).toEqual([{ link: 0, passage: "found" }]);
    const twice = await check(fixture({ study_map: map(2), answer_draft: draft(quote) }));
    expect(twice.notes).toEqual(["study_map.claims[0] counts 2 independent groups of people, but the map links R to A " +
      "(study_map.links[0], cites_as_evidence), so AskRigor counts 1: count them once, or show in the map that they " +
      "are different people, and check the answer again."]);
  });

  it("adds no note for a genuinely independent replication", async () => {
    const quote = "Two independent trials found that walking eased knee pain.";
    const map: StudyMap = { studies: [TRIAL_A, TRIAL_B], claims: [{ quote, studies: ["A", "B"], groups: 2,
      passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }] };
    const { result, notes } = await check(fixture({ study_map: map, answer_draft: draft(quote) }));
    expect(notes).toEqual([]);
    expect(result.study_map?.claims[0]).toMatchObject({ groups: 2, counted: 2 });
  });

  it("counts studies with identical audited figures, or the same group, once", async () => {
    const quote = "Two independent trials found that walking eased knee pain.";
    const map: StudyMap = { studies: [TRIAL_A, TRIAL_B], claims: [{ quote, studies: ["A", "B"], groups: 2,
      passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }] };
    const receipts = [audit(A, { fig: "consistent", figv: ["9", "2", "120"] }), audit(B, { fig: "consistent", figv: ["9", "2"] }), audit(C)];
    const figures = await check(fixture({ study_map: map, receipts, answer_draft: draft(quote) }));
    expect(figures.notes).toEqual([expect.stringContaining("but A and B report identical results, so AskRigor counts 1")]);
    const labelled = await check(fixture({ answer_draft: draft(quote),
      study_map: { ...map, studies: [TRIAL_A, { ...TRIAL_B, group: " adults with knee pain,  EXAMPLETON, 2025" }] } }));
    expect(labelled.notes).toEqual([expect.stringContaining('but A and B name the same group of people, ' +
      '"Adults with knee pain, Exampleton, 2025", so AskRigor counts 1')]);
  });
});

describe("each claim anchored", () => {
  it("asks for a passage from each study a claim rests on", async () => {
    const map: StudyMap = { ...THREE, claims: [{ ...THREE.claims[0]!, passages: THREE.claims[0]!.passages!.slice(0, 2) }] };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual(["study_map.claims[0] rests on C but gives no passage from it: give, in passages, each " +
      "study's sentence the claim rests on, copied whole and exactly."]);
    expect(result.study_map?.claims[0]?.passages).toEqual(["found", "found"]);
  });

  it("asks for an absence claim resting on two or more studies to be in claims", async () => {
    const absence = { quote: ABSENCE, state: "not_established" as const, studies: [A.doi, B.doi] };
    const input = fixture({ study_map: THREE, absence_claims: [absence], answer_draft: draft(ABSENCE) });
    const { result, notes } = await check(input);
    expect(result.status).toMatch(/^ready/u);
    expect(notes).toEqual(["absence_claims[0] rests on 2 studies, but study_map.claims doesn't give it: add it there, " +
      "with the same quote, the studies it rests on, how many independent groups of people they are and each one's passage."]);
    const given: StudyMap = { ...THREE, claims: [...THREE.claims, { quote: ABSENCE, studies: ["A", "B"], groups: 2,
      passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }] };
    expect((await check({ ...input, study_map: given })).notes).toEqual([]);
  });

  it("asks for the claim's own sentence, as the answer shows it", async () => {
    const map: StudyMap = { ...THREE, claims: [{ ...THREE.claims[0]!, quote: "Walking cured knee pain everywhere." }] };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual(["study_map.claims[0].quote isn't in the answer: copy the claim's sentence exactly from answer_draft."]);
    expect(result.study_map?.claims[0]?.shown).toBe(false);
  });
});

describe("passages looked up in their own study's text", () => {
  it("doesn't find a passage with a number changed, nor one that is another study's", async () => {
    const map: StudyMap = { ...THREE, claims: [{ ...THREE.claims[0]!, passages: [
      { study: "A", passage: A_RESULT.replace("9 points", "8 points") }, { study: "B", passage: C_RESULT },
      { study: "C", passage: C_RESULT },
    ] }] };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual(["study_map.claims[0] gives passages that aren't in the text AskRigor looked in: from A (the " +
      "full text) and B (the full text). Copy each whole and exactly, with no ellipsis, in the paper's language, or " +
      "take it out of the map, and check the answer again."]);
    expect(result.study_map?.claims[0]?.passages).toEqual(["not_found", "not_found", "found"]);
  });

  it("finds passages in Japanese and French, with spacing and case set aside, and nothing else", async () => {
    const japanese = "歩行療法は6か月後の膝の痛みを9点軽減した。";
    const french = "La marche a réduit la douleur du genou de 7 points à six mois.";
    const local: Record<string, SourceLineDocument> = {
      ...DOCUMENTS,
      [A.handle]: { kind: "full_text", blocks: [{ text: "登録番号 NCT01234567。", abstract: true }, { text: japanese }] },
      [B.handle]: { kind: "full_text", blocks: [{ text: "Essai enregistré sous NCT09000002.", abstract: true }, { text: french }] },
    };
    const map = (passages: string[]): StudyMap => ({ ...THREE, claims: [{ ...THREE.claims[0]!, passages: [
      { study: "A", passage: passages[0]! }, { study: "B", passage: passages[1]! }, { study: "C", passage: C_RESULT },
    ] }] });
    const given = texts({ fullText: (handle) => local[handle] });
    const found = await check(fixture({ study_map: map([japanese, "  la MARCHE a réduit la douleur du genou de 7 points à six mois  "]) }), given);
    expect(found.notes).toEqual([]);
    expect(found.result.study_map?.claims[0]?.passages).toEqual(["found", "found", "found"]);
    const changed = await check(fixture({ study_map: map([japanese.replace("9", "8"), french.replace("réduit", "augmenté")]) }), given);
    expect(changed.result.study_map?.claims[0]?.passages).toEqual(["not_found", "not_found", "found"]);
  });

  it("says a study no receipt ties wasn't looked in", async () => {
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, TRIAL_B, { ...TRIAL_C, source: "10.1000/map-never-found" }] };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual(["study_map: study C (10.1000/map-never-found) isn't tied to any research receipt passed " +
      "here, so its text wasn't looked in: give its source as AskRigor's tools returned it, and pass the " +
      "research_receipt of the search, record, reading or audit that found it."]);
    expect(result.study_map?.studies[2]).toMatchObject({ id: "C", tied: false, registry: [{ number: "NCT09000003", tie: "not_checked" }] });
  });
});

describe("registry numbers", () => {
  it("notes a registry number its study's text doesn't name and its record doesn't tie", async () => {
    // Registered late, but nothing ties the number to study C, so only the number is questioned.
    const records = { ...RECORDS, NCT09000009: { nct: "NCT09000009", start: "2022-01-10", firstSubmitted: "2022-03-01",
      pmids: ["49000199"], secondaryIds: [] } };
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, TRIAL_B,
      { ...TRIAL_C, registry: ["NCT09000003", "NCT09000009", "ISRCTN00000001"] }] };
    const { result, notes } = await check(fixture({ study_map: map }), texts({ registry: async (nct) => records[nct as keyof typeof records] }));
    expect(notes).toEqual([
      "study_map: study C gives the registry number NCT09000009, but the full text AskRigor looked in doesn't name it " +
        "and its ClinicalTrials.gov record doesn't list the study's paper: check the number, or take it out of the map.",
      "study_map: study C gives the registry number ISRCTN00000001, but the full text AskRigor looked in doesn't name " +
        "it: check the number, or take it out of the map.",
    ]);
    expect(result.study_map?.studies[2]?.registry).toEqual([
      { number: "NCT09000003", tie: "in_text", registered: "by_start" },
      { number: "NCT09000009", tie: "not_found", registered: "after_start" },
      { number: "ISRCTN00000001", tie: "not_found" },
    ]);
  });

  it("ties a number its text doesn't name when its record lists the study's paper, and notes a number with no record", async () => {
    const quiet: SourceLineDocument = { kind: "full_text", blocks: [{ text: A_RESULT, section: "Results" }] };
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, { ...TRIAL_B, registry: ["NCT09000002", "NCT09000008"] }, TRIAL_C] };
    const { result, notes } = await check(fixture({ study_map: map }), texts({
      fullText: (handle) => handle === A.handle ? quiet : DOCUMENTS[handle],
    }));
    expect(result.study_map?.studies[0]?.registry).toEqual([{ number: "NCT01234567", tie: "in_record", registered: "by_start" }]);
    expect(notes).toEqual(["study_map: ClinicalTrials.gov has no record of NCT09000008, which study B gives as its " +
      "registry number: check the number, or take it out of the map."]);
  });

  it("says when a trial was registered after it started, beside that study's result", async () => {
    const late = { ...RECORDS, NCT01234567: { ...RECORDS.NCT01234567!, firstSubmitted: "2025-03-02" } };
    const { result, notes } = await check(fixture({ study_map: THREE }), texts({ registry: async (nct) => late[nct as keyof typeof late] }));
    expect(notes).toEqual(["study_map: study A's trial registration, NCT01234567, was first submitted to " +
      "ClinicalTrials.gov on 2025-03-02, after the trial started on 2025-01-15: say so in the answer, beside that " +
      "study's result."]);
    expect(result.status).toMatch(/^ready/u);
    expect(result.study_map?.studies[0]?.registry).toEqual([{ number: "NCT01234567", tie: "in_text", registered: "after_start" }]);
  });

  it("compares a month-only date only when it can't be the same month, and leaves an expected start alone", async () => {
    const records = { ...RECORDS,
      NCT01234567: { ...RECORDS.NCT01234567!, start: "2025-01", firstSubmitted: "2025-01-20" },
      NCT09000002: { ...RECORDS.NCT09000002!, start: "2024-03-01", firstSubmitted: "2024-05-02", startEstimated: true } };
    const { result, notes } = await check(fixture({ study_map: THREE }), texts({ registry: async (nct) => records[nct as keyof typeof records] }));
    expect(notes).toEqual([]);
    expect(result.study_map?.studies.map(({ registry }) => registry?.[0]?.registered)).toEqual([undefined, undefined, "by_start"]);
  });

  it("gives one note when the registry can't be read, and the check stands", async () => {
    const offline = texts({ registry: async () => { throw new Error("offline"); } });
    const { first, result, notes } = await check(fixture({ study_map: THREE }), offline);
    expect(notes).toEqual(["study_map: AskRigor couldn't read the ClinicalTrials.gov records of NCT01234567, " +
      "NCT09000002 and NCT09000003 just now, so what they list and when they were registered weren't checked; the " +
      "rest of the map was."]);
    expect(result.status).toBe(first.status);
    expect(result.study_map?.claims[0]?.passages).toEqual(["found", "found", "found"]);
    expect(result.study_map?.studies.map(({ registry }) => registry?.[0]?.tie)).toEqual(["in_text", "in_text", "in_text"]);
  });

  it("gives up on a slow record, as on one that failed", async () => {
    const asked = studyMapRequestsOf(finalizeResearch(fixture({ study_map: THREE }), OPTIONS))!;
    const lookup = await lookUpStudyMap(asked.map, asked.requests, texts({ registry: () => new Promise(() => undefined) }),
      undefined, 20);
    expect(lookup.records).toEqual(["NCT01234567", "NCT09000002", "NCT09000003"].map((nct) => ({ nct, status: "unavailable" })));
  });

  it("reads the record as fetch_clinical_trial gives it: the papers of its results, not its background reading", () => {
    expect(registryRecordOf({ nct_id: "NCT01234567", start_date: "2025-01-15", references: [
      { pmid: "49000101", type: "RESULT" }, { pmid: "49000150", type: "BACKGROUND" }, { pmid: " 49000104 ", type: "DERIVED" },
    ], registration: { first_submitted: "2024-12-02", start_date_type: "ACTUAL",
      secondary_ids: [{ id: "RRI-EX-001", type: "OTHER" }] } })).toEqual({
      nct: "NCT01234567", start: "2025-01-15", firstSubmitted: "2024-12-02",
      pmids: ["49000101", "49000104"], secondaryIds: ["RRI-EX-001"],
    });
  });
});

describe("a check without a map", () => {
  it("returns exactly what it returns without the study map, whatever is looked up", async () => {
    const input = fixture();
    const result = finalizeResearch(input, OPTIONS);
    expect(studyMapRequestsOf(result)).toBeUndefined();
    expect(result).not.toHaveProperty("study_map");
    const lookup = await lookUpStudyMap({ studies: [], links: [], claims: [] }, [], texts());
    expect(stable(finalizeResearch(input, { ...OPTIONS, studyMapLookup: lookup }))).toEqual(stable(result));
  });

  it("asks nothing of a check that hasn't passed", () => {
    const failing = finalizeResearch(fixture({ study_map: THREE, answer_draft: CLAIM }), OPTIONS);
    expect(failing.status).toBe("not_ready");
    expect(studyMapRequestsOf(failing)).toBeUndefined();
  });
});

describe("the finalize_research tool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetClinicalTrialsFreshnessCacheForTests();
  });

  async function call(name: string, input: unknown, given: StudyMapTexts = texts()) {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { studyMapTexts: given, findingsLibrary: false,
      secondReader: { enabled: false, readAnswer: vi.fn() } });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "study-map-test", version: "1" });
    try {
      await server.connect(st); await client.connect(ct);
      const result = await client.callTool({ name, arguments: input as Record<string, unknown> });
      return { result, body: result.structuredContent as Record<string, unknown>,
        text: (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n") };
    } finally { await client.close(); await server.close(); }
  }

  it("looks the map up once the check passes, and its notes come with the result", async () => {
    const fullText = vi.fn<StudyMapTexts["fullText"]>((handle) => DOCUMENTS[handle]);
    const late = { ...RECORDS, NCT01234567: { ...RECORDS.NCT01234567!, firstSubmitted: "2025-03-02" } };
    const registry = vi.fn<StudyMapTexts["registry"]>(async (nct) => late[nct as keyof typeof late]);
    const { body, text } = await call("finalize_research", { ...fixture(), later_inputs: { study_map: THREE } },
      texts({ fullText, registry }));
    expect(body.status).toMatch(/^ready/u);
    expect(fullText).toHaveBeenCalledWith(A.handle);
    expect(registry.mock.calls.map(([nct]) => nct).sort()).toEqual(["NCT01234567", "NCT09000002", "NCT09000003"]);
    expect(body.study_map).toMatchObject({ looked_up: true, groups: 3 });
    expect(text).toContain("study_map: study A's trial registration, NCT01234567, was first submitted");
    // The map was given, so its shape isn't described again.
    expect(text).not.toContain(STUDY_MAP_GUIDANCE);
  });

  it("describes the map only to an answer resting on two or more key sources, and looks nothing up without one", async () => {
    const registry = vi.fn<StudyMapTexts["registry"]>();
    const fullText = vi.fn<StudyMapTexts["fullText"]>();
    const several = await call("finalize_research", fixture(), texts({ fullText, registry }));
    expect(several.body.status).toMatch(/^ready/u);
    expect(several.body).not.toHaveProperty("study_map");
    expect(several.text).toContain(STUDY_MAP_GUIDANCE);
    expect(registry).not.toHaveBeenCalled();
    expect(fullText).not.toHaveBeenCalled();
    const one = await call("finalize_research", fixture({ key_sources: fixture().key_sources.slice(0, 1),
      answer_draft: draft().split("\n").filter((line) => !/Trial [BC]/u.test(line)).join("\n") }));
    expect(one.body.status).toMatch(/^ready/u);
    expect(one.text).not.toContain("study_map");
  });

  it("keeps the check when the lookup fails outright", async () => {
    const { body, text } = await call("finalize_research", { ...fixture(), later_inputs: { study_map: THREE } },
      texts({ fullText: () => { throw new Error("synthetic failure"); } }));
    expect(body.status).toMatch(/^ready/u);
    expect(body.study_map).toMatchObject({ looked_up: false, groups: 3 });
    expect(text).toContain("study_map: AskRigor couldn't look the studies' texts and registry records up in time");
  });

  it("gives what a fetched record registered beside its published data (fetch_clinical_trial)", async () => {
    const [studyBody, versionBody] = await Promise.all(["study-NCT01234567.json", "version.json"].map((name) =>
      readFile(new URL(`fixtures/clinical-trials/${name}`, import.meta.url), "utf8")));
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      new Response(new URL(String(input)).pathname === "/api/v2/version" ? versionBody : studyBody, { status: 200 })));
    const { result, body } = await call("fetch_clinical_trial", { nct_id: "NCT01234567" });
    expect(result.isError).not.toBe(true);
    expect(body.data).not.toHaveProperty("registration");
    expect(body.registration).toMatchObject({ first_submitted: "2024-12-02",
      primary_outcomes: [{ measure: "Change in the example score", time_frame: "12 weeks" }],
      sites: { count: 2, countries: ["Exampleland", "Sampleland"] } });
  });
});
