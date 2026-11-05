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
import { lookUpQuotes, quoteCache, type SourceLineTexts } from "../apps/research-mcp/src/source-lines.js";
import {
  lookUpStudyMap, registryNumbers, registryRecordOf, STUDY_MAP_GUIDANCE,
  type RegistryRecord, type StudyMap, type StudyMapTexts
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
const R_CITES_B = "A second pooled trial found that supervised walking lowered knee pain by 7 points.";
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
    { text: R_CITES_B, section: "Results" },
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
async function check(input: FinalizeResearchInput | Record<string, unknown>, given = texts(), milliseconds?: number) {
  const first = finalizeResearch(input, OPTIONS);
  const asked = studyMapRequestsOf(first);
  if (asked === undefined) return { first, result: first, notes: [] as string[] };
  const lookup = await lookUpStudyMap(asked.map, asked.requests, given, milliseconds === undefined ? {} : { milliseconds });
  const result = finalizeResearch(input, { ...OPTIONS, studyMapLookup: lookup });
  // The map's notes: those the same check gives without it set aside.
  const { study_map: _map, later_inputs: _later, ...without } = input as FinalizeResearchInput & { study_map?: unknown; later_inputs?: unknown };
  const before = finalizeResearch(without, OPTIONS).notes ?? [];
  return { first, result, lookup, notes: (result.notes ?? []).filter((note) => !before.includes(note)) };
}

const TAIL = "count them once, or, if they are different people, give each its own group, and check the answer again.";
const quoted = (quote: string, ...lines: string[]) => fixture({ answer_draft: draft(quote, ...lines) });
const twoTrials = "Two independent trials found that walking eased knee pain.";

describe("the study map's shape", () => {
  it("takes the map through later_inputs, and drops a study with an unusable source with a note, not the map", () => {
    const parsed = parseFinalizeResearchInput({ ...fixture(), later_inputs: { study_map: THREE } });
    expect(parsed.data?.study_map).toEqual(THREE);
    const bad = parseFinalizeResearchInput({ ...fixture(), later_inputs: { study_map: {
      ...THREE, studies: [...THREE.studies, { id: "D", source: "a paper I read", group: "Someone" }],
    } } });
    expect(bad.data?.study_map?.studies.map(({ id }) => id)).toEqual(["A", "B", "C"]);
    expect(bad.notes).toContain("study_map.studies[3].source: dropped: give the study's DOI, PMID, PMCID or web address.");
  });

  it("names each item by its place as given, though an item before it was left out", async () => {
    const raw = { ...fixture(), later_inputs: { study_map: {
      studies: [{ id: "X" }, TRIAL_A, { ...TRIAL_B, registry: ["none", "NCT09000002"] }, TRIAL_C],
      links: [
        { from: "A", kind: "duplicate_of", to: "B", passage: A_RESULT },
        { from: "B", kind: "same_cohort", to: "C", passage: "This sentence is in neither study's text at all." },
      ],
      claims: [
        { quote: CLAIM },
        { quote: CLAIM, studies: ["A", "B", "C"], groups: 3, passages: [
          { study: "A" }, { study: "A", passage: A_RESULT.replace("9 points", "8 points") },
          { study: "B", passage: B_RESULT }, { study: "C", passage: C_RESULT },
        ] },
      ],
    } } };
    const { result, notes } = await check(raw);
    expect(notes).toEqual(expect.arrayContaining([
      "study_map.studies[0]: dropped as a whole, since its required source and group could not be used: send it again " +
        "with those fields usable, or leave it out.",
      "study_map.studies[2].registry[0] (\"none\") isn't a registry number, so it was left out: give trial registry " +
        "numbers only, such as NCT01234567, or leave registry out.",
      "study_map.links[0]: dropped as a whole, since its required kind could not be used: send it again with that field " +
        "usable, or leave it out.",
      "The passage given in study_map.links[1] isn't in the text of either study AskRigor looked in. Copy each whole and " +
        "exactly, with no ellipsis, in the paper's language, or take it out of the map, and check the answer again.",
      "study_map.claims[0]: dropped as a whole, since its required studies and groups could not be used: send it again " +
        "with those fields usable, or leave it out.",
      "study_map.claims[1].passages[0]: dropped as a whole, since its required passage could not be used: send it again " +
        "with that field usable, or leave it out.",
      "The passage given in study_map.claims[1].passages[1] (from A, in the full text) isn't in the text AskRigor looked " +
        "in. Copy each whole and exactly, with no ellipsis, in the paper's language, or take it out of the map, and check " +
        "the answer again.",
      `study_map.claims[1] counts 3 independent groups of people, but the map links B to C (study_map.links[1], ` +
        `same_cohort), so AskRigor counts 2: ${TAIL}`,
    ]));
    expect(result.study_map?.studies.map(({ place, id }) => [place, id])).toEqual([[1, "A"], [2, "B"], [3, "C"]]);
    expect(result.study_map?.studies[1]?.registry).toEqual([{ place: 1, number: "NCT09000002", tie: "in_text", registered: "by_start" }]);
    expect(result.study_map?.links).toEqual([{ place: 1, outcome: "not_found" }]);
    expect(result.study_map?.claims).toEqual([{ place: 1, shown: true, groups: 3, counted: 2, passages: [
      { place: 1, outcome: "not_found" }, { place: 2, outcome: "found" }, { place: 3, outcome: "found" },
    ] }]);
  });

  it("leaves out an item naming a study the map doesn't have, and checks the rest", async () => {
    const map: StudyMap = {
      ...THREE,
      links: [{ from: "B", kind: "same_cohort", to: "Z", passage: B_RESULT }],
      claims: [...THREE.claims, { quote: CLAIM, studies: ["A", "Q"], groups: 2 }],
    };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual([
      "study_map.links[0] names Z, which isn't a study in study_map.studies, so it was left out: name each study by its id.",
      "study_map.claims[1] names Q, which isn't a study in study_map.studies, so it was left out: name each study by its id.",
    ]);
    expect(result.study_map?.links).toEqual([]);
    expect(result.study_map?.claims.map(({ place }) => place)).toEqual([0]);
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
        { place: 0, id: "A", tied: true, text: "full_text", group: 1,
          registry: [{ place: 0, number: "NCT01234567", tie: "in_text", registered: "by_start" }] },
        { place: 1, id: "B", tied: true, text: "full_text", group: 2,
          registry: [{ place: 0, number: "NCT09000002", tie: "in_text", registered: "by_start" }] },
        { place: 2, id: "C", tied: true, text: "full_text", group: 3,
          registry: [{ place: 0, number: "NCT09000003", tie: "in_text", registered: "by_start" }] },
      ],
      links: [],
      claims: [{ place: 0, shown: true, groups: 3, counted: 3, passages: [
        { place: 0, outcome: "found" }, { place: 1, outcome: "found" }, { place: 2, outcome: "found" },
      ] }],
    });
    expect(finalizeResearchOutputSchema.safeParse(result).success).toBe(true);
  });

  it("counts two primary reports of one group of people once, by the registry number in an abstract", async () => {
    const quote = "Two trials, one report each, found that walking eased knee pain.";
    const map: StudyMap = {
      studies: [TRIAL_A, study("A2", A2, "Adults with knee pain followed for two years")],
      claims: [{ quote, studies: ["A", "A2"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "A2", passage: A2_RESULT }] }],
    };
    const { result, notes } = await check({ ...quoted(quote), study_map: map });
    expect(result.status).toMatch(/^ready/u);
    expect(notes).toEqual(["study_map.claims[0] counts 2 independent groups of people, but A and A2 name the same " +
      `registry number, NCT01234567 (in A2's abstract), so AskRigor counts 1: ${TAIL}`]);
    expect(result.study_map?.claims[0]).toMatchObject({ groups: 2, counted: 1 });
    expect(result.study_map?.studies.map(({ group }) => group)).toEqual([1, 1]);
  });

  it("counts two reports once when a registration lists the other's registry number", async () => {
    const quote = "Two trials, one report each, found that walking eased knee pain.";
    const records = { ...RECORDS, NCT01234567: { ...RECORDS.NCT01234567!, secondaryIds: ["2010-012345-12", "RRI-EX-001"] } };
    const followUp: SourceLineDocument = { kind: "full_text", blocks: [
      { text: "EudraCT number: 2010-012345-12.", abstract: true }, { text: A2_RESULT, section: "Results" }] };
    const map: StudyMap = {
      studies: [TRIAL_A, study("A2", A2, "Adults with knee pain followed for two years", ["EudraCT 2010-012345-12"])],
      claims: [{ quote, studies: ["A", "A2"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "A2", passage: A2_RESULT }] }],
    };
    const { result, notes } = await check({ ...quoted(quote), study_map: map }, texts({
      fullText: (handle) => handle === A2.handle ? followUp : DOCUMENTS[handle],
      registry: async (nct) => records[nct as keyof typeof records],
    }));
    expect(notes).toEqual([`study_map.claims[0] counts 2 independent groups of people, but A's NCT01234567 and A2's ` +
      `2010-012345-12 are one trial's registrations (its ClinicalTrials.gov record lists both), so AskRigor counts 1: ${TAIL}`]);
    expect(result.study_map?.studies[1]?.registry).toEqual([{ place: 0, number: "2010-012345-12", tie: "in_text" }]);
  });

  it("doesn't join two reports only because one registration lists both papers", async () => {
    const quote = "Two reports of the trial found that walking eased knee pain.";
    const records = { ...RECORDS, NCT01234567: { ...RECORDS.NCT01234567!, pmids: [A.pmid, A2.pmid] } };
    const followUp: SourceLineDocument = { kind: "full_text", blocks: [{ text: A2_RESULT, section: "Results" }] };
    const map: StudyMap = {
      studies: [TRIAL_A, study("A2", A2, "Adults with knee pain followed for two years")],
      claims: [{ quote, studies: ["A", "A2"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "A2", passage: A2_RESULT }] }],
    };
    const { notes } = await check({ ...quoted(quote), study_map: map }, texts({
      fullText: (handle) => handle === A2.handle ? followUp : DOCUMENTS[handle],
      registry: async (nct) => records[nct as keyof typeof records],
    }));
    expect(notes).toEqual([]);
  });

  // A review, or a pooled study, holds several groups of people: it joins none, and a claim resting on it isn't counted.
  it("doesn't merge two trials through a review citing both", async () => {
    const map: StudyMap = {
      studies: [TRIAL_A, TRIAL_B, study("R", R, "Pooled trials of walking for knee pain")],
      links: [{ from: "R", kind: "cites_as_evidence", to: "A", passage: R_CITES },
        { from: "R", kind: "cites_as_evidence", to: "B", passage: R_CITES_B }],
      claims: [{ quote: twoTrials, studies: ["A", "B"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }],
    };
    const { result, notes } = await check({ ...quoted(twoTrials), study_map: map });
    expect(notes).toEqual([]);
    expect(result.study_map?.claims[0]).toMatchObject({ groups: 2, counted: 2 });
    expect(result.study_map?.studies[2]).toMatchObject({ id: "R", several_groups: true });
    expect(result.study_map?.studies[2]).not.toHaveProperty("group");
  });

  it("gives no count for a claim resting on a review, however many groups it counts", async () => {
    const quote = "A review and the trial it rests on found that walking eased knee pain.";
    for (const groups of [1, 2]) {
      const map: StudyMap = {
        studies: [study("R", R, "Pooled trials of walking for knee pain"), TRIAL_A],
        links: [{ from: "R", kind: "cites_as_evidence", to: "A", passage: R_CITES }],
        claims: [{ quote, studies: ["R", "A"], groups,
          passages: [{ study: "R", passage: R_CITES }, { study: "A", passage: A_RESULT }] }],
      };
      const { result, notes } = await check({ ...quoted(quote), study_map: map });
      expect(notes).toEqual([]);
      expect(result.study_map?.claims[0]).not.toHaveProperty("counted");
      expect(result.study_map?.links).toEqual([{ place: 0, outcome: "found" }]);
    }
  });

  it("doesn't merge two trials through a review whose abstract names both registrations", async () => {
    const pooled: SourceLineDocument = { kind: "full_text", blocks: [
      { text: "We pooled two trials (NCT01234567 and NCT09000002) of walking for knee pain.", abstract: true },
      { text: R_CITES, section: "Results" }] };
    const map: StudyMap = {
      studies: [TRIAL_A, TRIAL_B, study("R", R, "Pooled trials of walking for knee pain")],
      claims: [{ quote: twoTrials, studies: ["A", "B"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }],
    };
    const { result, notes } = await check({ ...quoted(twoTrials), study_map: map },
      texts({ fullText: (handle) => handle === R.handle ? pooled : DOCUMENTS[handle] }));
    expect(notes).toEqual([]);
    expect(result.study_map?.studies[2]).toMatchObject({ id: "R", several_groups: true });
  });

  it("doesn't merge two trials through a pooled study declaring both registrations", async () => {
    const quote = "A pooled analysis and the two trials in it found that walking eased knee pain.";
    const pooled: SourceLineDocument = { kind: "full_text", blocks: [{ text: R_CITES, section: "Results" }] };
    const map: StudyMap = {
      studies: [TRIAL_A, TRIAL_B, study("P", R, "Both trials' people, pooled", ["NCT01234567", "NCT09000002"])],
      links: [{ from: "P", kind: "reanalysis_of", to: "A", passage: R_CITES }],
      claims: [{ quote: twoTrials, studies: ["A", "B"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] },
      { quote, studies: ["P", "A", "B"], groups: 3, passages: [{ study: "P", passage: R_CITES },
        { study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }],
    };
    const { result, notes } = await check({ ...quoted(twoTrials, quote), study_map: map },
      texts({ fullText: (handle) => handle === R.handle ? pooled : DOCUMENTS[handle] }));
    // Its registry numbers aren't in its text, which is said; but it joins no group, and its claim isn't counted.
    expect(notes.filter((note) => !note.includes("doesn't name it"))).toEqual([]);
    expect(result.study_map?.claims.map(({ counted }) => counted)).toEqual([2, undefined]);
  });

  it("doesn't merge two cohorts one paper reports, however its abstract reads", async () => {
    const quote = "Two independent cohorts found that walking eased knee pain.";
    const map: StudyMap = {
      studies: [study("A1", A, "Discovery cohort, Exampleton"), study("A2", A, "Validation cohort, Sampleville")],
      claims: [{ quote, studies: ["A1", "A2"], groups: 2, passages: [{ study: "A1", passage: A_RESULT },
        { study: "A2", passage: "Adults with knee pain were randomised to walking or usual care." }] }],
    };
    const { result, notes } = await check({ ...quoted(quote), study_map: map });
    expect(notes).toEqual([]);
    expect(result.study_map?.claims[0]).toMatchObject({ groups: 2, counted: 2 });
  });

  it("adds no note for a genuinely independent replication", async () => {
    const map: StudyMap = { studies: [TRIAL_A, TRIAL_B], claims: [{ quote: twoTrials, studies: ["A", "B"], groups: 2,
      passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }] };
    const { result, notes } = await check({ ...quoted(twoTrials), study_map: map });
    expect(notes).toEqual([]);
    expect(result.study_map?.claims[0]).toMatchObject({ groups: 2, counted: 2 });
  });

  it("counts studies with identical audited figures, or the same group, once", async () => {
    const map: StudyMap = { studies: [TRIAL_A, TRIAL_B], claims: [{ quote: twoTrials, studies: ["A", "B"], groups: 2,
      passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }] };
    const receipts = [audit(A, { fig: "consistent", figv: ["9", "2", "120"] }), audit(B, { fig: "consistent", figv: ["9", "2"] }), audit(C)];
    const figures = await check({ ...quoted(twoTrials), study_map: map, receipts });
    expect(figures.notes).toEqual([`study_map.claims[0] counts 2 independent groups of people, but A and B report ` +
      `identical results, so AskRigor counts 1: ${TAIL}`]);
    const labelled = await check({ ...quoted(twoTrials),
      study_map: { ...map, studies: [TRIAL_A, { ...TRIAL_B, group: " adults with knee pain,  EXAMPLETON, 2025" }] } });
    expect(labelled.notes).toEqual([expect.stringContaining('but A and B name the same group of people, ' +
      '"Adults with knee pain, Exampleton, 2025", so AskRigor counts 1')]);
  });

  it("never joins two studies on a value that isn't a registry number", async () => {
    const map: StudyMap = { studies: [{ ...TRIAL_A, registry: ["none"] }, { ...TRIAL_B, registry: ["not registered"] }],
      claims: [{ quote: twoTrials, studies: ["A", "B"], groups: 2,
        passages: [{ study: "A", passage: A_RESULT }, { study: "B", passage: B_RESULT }] }] };
    const { result, notes } = await check({ ...quoted(twoTrials), study_map: map });
    expect(notes).toEqual([
      "study_map.studies[0].registry[0] (\"none\") isn't a registry number, so it was left out: give trial registry " +
        "numbers only, such as NCT01234567, or leave registry out.",
      "study_map.studies[1].registry[0] (\"not registered\") isn't a registry number, so it was left out: give trial " +
        "registry numbers only, such as NCT01234567, or leave registry out.",
    ]);
    expect(result.study_map?.claims[0]).toMatchObject({ groups: 2, counted: 2 });
    expect(result.study_map?.studies[0]).not.toHaveProperty("registry");
  });
});

describe("each claim anchored", () => {
  it("asks for a passage from each study a claim rests on", async () => {
    const map: StudyMap = { ...THREE, claims: [{ ...THREE.claims[0]!, passages: THREE.claims[0]!.passages!.slice(0, 2) }] };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual(["study_map.claims[0] rests on C but gives no passage from it: give, in passages, each " +
      "study's sentence the claim rests on, copied whole and exactly."]);
    expect(result.study_map?.claims[0]?.passages).toEqual([{ place: 0, outcome: "found" }, { place: 1, outcome: "found" }]);
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
    expect(notes).toEqual(["The passages given in study_map.claims[0].passages[0] (from A, in the full text) and " +
      "study_map.claims[0].passages[1] (from B, in the full text) aren't in the text AskRigor looked in. Copy each whole " +
      "and exactly, with no ellipsis, in the paper's language, or take it out of the map, and check the answer again."]);
    expect(result.study_map?.claims[0]?.passages.map(({ outcome }) => outcome)).toEqual(["not_found", "not_found", "found"]);
  });

  it("says a passage is too short to mean much, as a source line's quote is", async () => {
    const map: StudyMap = { ...THREE,
      links: [{ from: "B", kind: "extension_of", to: "C", passage: "Same trial." }],
      claims: [{ ...THREE.claims[0]!, passages: [{ study: "A", passage: "Pain fell." }, ...THREE.claims[0]!.passages!.slice(1)] }] };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual(expect.arrayContaining([
      "A passage given in study_map.claims[0].passages[0] is too short to mean much: give the whole sentence.",
      "A passage given in study_map.links[0] is too short to mean much: give the whole sentence.",
    ]));
    expect(notes.filter((note) => note.includes("text AskRigor looked in") || note.includes("fetched no text"))).toEqual([]);
    expect(result.study_map?.claims[0]?.passages[0]).toEqual({ place: 0, outcome: "not_checked" });
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
    expect(found.result.study_map?.claims[0]?.passages.map(({ outcome }) => outcome)).toEqual(["found", "found", "found"]);
    const changed = await check(fixture({ study_map: map([japanese.replace("9", "8"), french.replace("réduit", "augmenté")]) }), given);
    expect(changed.result.study_map?.claims[0]?.passages.map(({ outcome }) => outcome)).toEqual(["not_found", "not_found", "found"]);
  });

  it("says a study no receipt ties wasn't looked in", async () => {
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, TRIAL_B, { ...TRIAL_C, source: "10.1000/map-never-found" }] };
    const { result, notes } = await check(fixture({ study_map: map }));
    expect(notes).toEqual(["study_map: study C (10.1000/map-never-found) isn't tied to any research receipt passed " +
      "here, so its text wasn't looked in: give its source as AskRigor's tools returned it, and pass the " +
      "research_receipt of the search, record, reading or audit that found it."]);
    expect(result.study_map?.studies[2]).toMatchObject({ id: "C", tied: false,
      registry: [{ place: 0, number: "NCT09000003", tie: "not_checked" }] });
  });
});

describe("registry numbers", () => {
  it("reads a number in any known registry's format, with its registry's name or a label set aside", () => {
    expect(registryNumbers("EudraCT number: 2010-012345-12").map(({ core }) => core)).toEqual(["2010-012345-12"]);
    expect(registryNumbers("EudraCT 2010-012345-12")[0]?.key).toBe(registryNumbers("2010-012345-12")[0]?.key);
    expect(registryNumbers("EUCTR2010-012345-12-GB")[0]?.key).toBe(registryNumbers("2010-012345-12")[0]?.key);
    expect(registryNumbers("ClinicalTrials.gov NCT 01234567; ISRCTN00000001; ACTRN12600000000001; ChiCTR-IOR-17000001; " +
      "DRKS00000001; CTRI/2020/01/000001; jRCTs031180001; JPRN-UMIN000000001; IRCT20180101000001N1; PACTR201900000000001; " +
      "KCT0000001; NTR1001; NL-OMON10001; TCTR20200101001; RBR-0abc12; SLCTR/2019/001; 2022-500001-01-00; CRD42020000001")
      .map(({ registry }) => registry)).toEqual(["NCT", "ISRCTN", "ACTRN", "ChiCTR", "DRKS", "CTRI", "jRCT", "UMIN", "IRCT",
      "PACTR", "KCT", "NTR", "NL-OMON", "TCTR", "RBR", "SLCTR", "EU CT", "PROSPERO"]);
    for (const value of ["none", "unknown", "not registered", "N/A", "12345"]) expect(registryNumbers(value)).toEqual([]);
  });

  it("finds a number its text gives with another label than the map's", async () => {
    const european: SourceLineDocument = { kind: "full_text", blocks: [
      { text: "A randomised trial of supervised walking. EudraCT number: 2010-012345-12.", abstract: true },
      { text: B_RESULT, section: "Results" }] };
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, { ...TRIAL_B, registry: ["EudraCT 2010-012345-12"] }, TRIAL_C] };
    const { result, notes } = await check(fixture({ study_map: map }),
      texts({ fullText: (handle) => handle === B.handle ? european : DOCUMENTS[handle] }));
    expect(notes).toEqual([]);
    expect(result.study_map?.studies[1]?.registry).toEqual([{ place: 0, number: "2010-012345-12", tie: "in_text" }]);
  });

  it("ties a number its text doesn't name to a study whose registration lists it among its secondary IDs", async () => {
    const records = { ...RECORDS, NCT09000002: { ...RECORDS.NCT09000002!, secondaryIds: ["2010-012345-12"] } };
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, { ...TRIAL_B, registry: ["NCT09000002", "EudraCT 2010-012345-12"] }, TRIAL_C] };
    const { result, notes } = await check(fixture({ study_map: map }), texts({ registry: async (nct) => records[nct as keyof typeof records] }));
    expect(notes).toEqual([]);
    expect(result.study_map?.studies[1]).toMatchObject({ group: 2,
      registry: [{ place: 0, number: "NCT09000002", tie: "in_text" }, { place: 1, number: "2010-012345-12", tie: "in_record" }] });
  });

  it("notes a registry number its study's full text doesn't name and its record doesn't tie", async () => {
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
      { place: 0, number: "NCT09000003", tie: "in_text", registered: "by_start" },
      { place: 1, number: "NCT09000009", tie: "not_found", registered: "after_start" },
      { place: 2, number: "ISRCTN00000001", tie: "not_found" },
    ]);
  });

  it("asks nothing of a number an abstract doesn't name: only a full text can show it isn't there", async () => {
    const abstract = vi.fn<StudyMapTexts["abstract"]>(async () => ({ kind: "abstract", blocks: [{ text: `Results: ${C_RESULT}` }] }));
    const receipts = [audit(A), audit(B), issueResearchReceipt("pubmed_record", { pmid: C.pmid, doi: C.doi }, { secret: SECRET })];
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, TRIAL_B, { ...TRIAL_C, registry: ["ISRCTN00000001"] }] };
    const { result, notes } = await check(fixture({ study_map: map, receipts,
      key_sources: [...fixture().key_sources.slice(0, 2), { id: C.doi, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial C" }] }),
    texts({ abstract }));
    expect(abstract).toHaveBeenCalledWith(C.pmid);
    expect(notes).toEqual([]);
    expect(result.study_map?.studies[2]).toMatchObject({ text: "abstract", registry: [{ place: 0, number: "ISRCTN00000001", tie: "not_checked" }] });
    expect(result.study_map?.claims[0]?.passages[2]).toEqual({ place: 2, outcome: "found" });
  });

  it("ties a number its text doesn't name when its record lists the study's paper, and notes a number with no record", async () => {
    const quiet: SourceLineDocument = { kind: "full_text", blocks: [{ text: A_RESULT, section: "Results" }] };
    const map: StudyMap = { ...THREE, studies: [TRIAL_A, { ...TRIAL_B, registry: ["NCT09000002", "NCT09000008"] }, TRIAL_C] };
    const { result, notes } = await check(fixture({ study_map: map }), texts({
      fullText: (handle) => handle === A.handle ? quiet : DOCUMENTS[handle],
    }));
    expect(result.study_map?.studies[0]?.registry).toEqual([{ place: 0, number: "NCT01234567", tie: "in_record", registered: "by_start" }]);
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
    expect(result.study_map?.studies[0]?.registry).toEqual([{ place: 0, number: "NCT01234567", tie: "in_text", registered: "after_start" }]);
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
    expect(result.study_map?.claims[0]?.passages.map(({ outcome }) => outcome)).toEqual(["found", "found", "found"]);
    expect(result.study_map?.studies.map(({ registry }) => registry?.[0]?.tie)).toEqual(["in_text", "in_text", "in_text"]);
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

describe("one deadline, and what was read in time kept", () => {
  it("keeps the passages found when the registry doesn't answer in time, with one note", async () => {
    const slow = texts({ registry: async (nct) => nct === "NCT09000002" ? RECORDS[nct] : new Promise(() => undefined) });
    const { first, result, notes } = await check(fixture({ study_map: THREE }), slow, 50);
    expect(notes).toEqual(["study_map: the registrations of NCT01234567 and NCT09000003 couldn't be read in time, so " +
      "what they list and when they were submitted weren't checked."]);
    expect(result.status).toBe(first.status);
    expect(result.study_map).toMatchObject({ looked_up: true, groups: 3 });
    expect(result.study_map?.claims[0]?.passages.map(({ outcome }) => outcome)).toEqual(["found", "found", "found"]);
    // The record that came in time is read; the others change nothing but their note.
    expect(result.study_map?.studies.map(({ registry }) => registry?.[0])).toEqual([
      { place: 0, number: "NCT01234567", tie: "in_text" },
      { place: 0, number: "NCT09000002", tie: "in_text", registered: "by_start" },
      { place: 0, number: "NCT09000003", tie: "in_text" },
    ]);
  });

  it("leaves a study whose abstract doesn't come in time unchecked, with one note, and keeps the rest", async () => {
    const receipts = [audit(A), audit(B), issueResearchReceipt("pubmed_record", { pmid: C.pmid, doi: C.doi }, { secret: SECRET })];
    const input = fixture({ study_map: THREE, receipts,
      key_sources: [...fixture().key_sources.slice(0, 2), { id: C.doi, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial C" }] });
    const { result, notes } = await check(input, texts({ abstract: () => new Promise(() => undefined) }), 50);
    expect(notes).toEqual(["study_map: AskRigor couldn't read the abstract of study C in time, so what the map gives " +
      "from it wasn't looked up."]);
    expect(result.study_map?.claims[0]?.passages.map(({ outcome }) => outcome)).toEqual(["found", "found", "not_checked"]);
  });

  it("starts the map's PubMed reads only after the source lines' lookups, and shares what they read", async () => {
    const abstract = vi.fn<SourceLineTexts["abstract"]>(async (pmid) => ({ kind: "abstract", blocks: [{ text: `${pmid}: ${C_RESULT}` }] }));
    const cache = quoteCache();
    let finish!: () => void;
    const lines = new Promise<void>((resolve) => { finish = resolve; });
    const receipts = [audit(A), audit(B), issueResearchReceipt("pubmed_record", { pmid: C.pmid, doi: C.doi }, { secret: SECRET })];
    const asked = studyMapRequestsOf(finalizeResearch(fixture({ study_map: THREE, receipts,
      key_sources: [...fixture().key_sources.slice(0, 2), { id: C.doi, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial C" }] }), OPTIONS))!;
    const pending = lookUpStudyMap(asked.map, asked.requests, texts({ abstract }), { cache, after: lines });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(abstract).not.toHaveBeenCalled();
    finish();
    expect((await pending).claims[0]).toEqual(["found", "found", "found"]);
    expect(abstract).toHaveBeenCalledOnce();
    // A text the source lines read is read once: the map uses theirs.
    abstract.mockClear();
    await lookUpQuotes({ handles: [], pmids: [C.pmid] }, [C_RESULT], texts({ abstract }), cache);
    expect(abstract).not.toHaveBeenCalled();
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
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetClinicalTrialsFreshnessCacheForTests();
  });

  async function call(name: string, input: unknown, given: StudyMapTexts = texts(), lines?: SourceLineTexts) {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { studyMapTexts: given, ...(lines === undefined ? {} : { sourceLineTexts: lines }),
      findingsLibrary: false, secondReader: { enabled: false, readAnswer: vi.fn() } });
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

  it("describes the map only with a passing check of an answer on two or more key sources, in a few words", async () => {
    expect(STUDY_MAP_GUIDANCE.length).toBeLessThanOrEqual(400);
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

  it("returns a not_ready check without a map just as it did before the study map", async () => {
    const registry = vi.fn<StudyMapTexts["registry"]>();
    const fullText = vi.fn<StudyMapTexts["fullText"]>();
    const { body, text } = await call("finalize_research", fixture({ answer_draft: CLAIM }), texts({ fullText, registry }));
    expect(body.status).toBe("not_ready");
    // Nothing of the map: no shape described, no result, no note, nothing looked up.
    expect(JSON.stringify(body)).not.toContain("study_map");
    expect(text).not.toContain("study_map");
    expect(text).not.toContain("groups of people");
    expect(registry).not.toHaveBeenCalled();
    expect(fullText).not.toHaveBeenCalled();
  });

  it("keeps the check when the lookup fails outright", async () => {
    const { body, text } = await call("finalize_research", { ...fixture(), later_inputs: { study_map: THREE } },
      texts({ fullText: () => { throw new Error("synthetic failure"); } }));
    expect(body.status).toMatch(/^ready/u);
    expect(body.study_map).toMatchObject({ looked_up: false, groups: 3 });
    expect(text).toContain("study_map: AskRigor couldn't look the studies' texts and registry records up in time");
  });

  it("keeps what the map read when the registry doesn't answer by the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = call("finalize_research", { ...fixture(), later_inputs: { study_map: THREE } },
      texts({ registry: () => new Promise(() => undefined) }));
    await vi.advanceTimersByTimeAsync(9_500);
    const { body, text } = await pending;
    expect(body.status).toMatch(/^ready/u);
    expect(body.study_map).toMatchObject({ looked_up: true, claims: [{ passages: [
      { place: 0, outcome: "found" }, { place: 1, outcome: "found" }, { place: 2, outcome: "found" }] }] });
    expect(text).toContain("study_map: the registrations of NCT01234567, NCT09000002 and NCT09000003 couldn't be read in time");
  });

  it("reads one abstract once for a source line and the map", async () => {
    const abstract = vi.fn<SourceLineTexts["abstract"]>(async () => ({ kind: "abstract", blocks: [{ text: `${C_RESULT} ${A2_RESULT}` }] }));
    const fullText: SourceLineTexts["fullText"] = (handle) => DOCUMENTS[handle];
    const receipts = [audit(A), audit(B), issueResearchReceipt("pubmed_record", { pmid: C.pmid, doi: C.doi }, { secret: SECRET })];
    const input = { ...fixture({ receipts,
      key_sources: [...fixture().key_sources.slice(0, 2), { id: C.doi, status: "lead_only", read_depth: "abstract_only", answer_marker: "Trial C" }],
      answer_draft: draft(`"${C_RESULT}" "${A2_RESULT}"`) }),
    later_inputs: { study_map: THREE, source_lines: [{ source: C.doi, claim: "Brisk walking helped older adults.",
      sentence: C_RESULT, conclusion: A2_RESULT, against: "Nothing against it was found." }] } };
    const { body } = await call("finalize_research", input, { fullText, abstract, registry: async (nct) => RECORDS[nct] },
      { fullText, abstract });
    expect(body.status).toMatch(/^ready/u);
    expect(body.source_lines).toMatchObject([{ sentence: "found", conclusion: "found", text: "abstract" }]);
    expect((body.study_map as { claims: Array<{ passages: unknown[] }> }).claims[0]!.passages[2]).toEqual({ place: 2, outcome: "found" });
    expect(abstract).toHaveBeenCalledOnce();
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
