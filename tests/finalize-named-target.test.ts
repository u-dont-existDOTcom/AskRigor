import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PUBLIC_RATE_LIMIT } from "../apps/research-mcp/src/config.js";
import { createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import {
  FINALIZE_RESEARCH_SHAPES_DESCRIPTION,
  NAMED_TARGET_FIELDS,
  NAMED_TARGET_SOURCES,
  TARGET_MATCHES,
  TOOL_LIST_REFRESH_HINT,
  finalizeResearch,
  finalizeResearchInputSchema,
  finalizeResearchPublishedInputSchema,
  isProgramNotDescribed,
  namedTargetCaveat,
  unwatchedVideoCaveat,
  type FinalizeResearchInput,
  type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";

import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

// AskRigor#359: a person asked whether a video's 2-minute "gentle fascia hopping" routine is the most important daily
// exercise. extract_youtube_video_claims could not read the video, yet the answer described the routine as if watched,
// answered "No" from studies of other exercises (maximal countermovement jumps; stair-climbing exercise snacks) and
// gave a confident verdict while the final check was not_ready. The owner's correction on the issue adds the routine's
// defining parts: upward lengthening of the spine, the chest held open, and a small forefoot bounce (T1b). The HRP
// already has the method (ExactProgramFingerprint, QuestionDecomposition, CompositeInterventionAttribution, indirect
// evidence for a poor exposure match); these are its execution checks. The model judges each match; the check is
// exact on what it declares, and its caveats state only what the receipts show and the declared mismatches. Studies,
// identifiers and the video are synthetic gate fixtures, not evidence about any exercise.
const SECRET = "named-target-test-secret-0123456789abcdefghijk";
const VIDEO = "dQw4w9WgXcQ";
const OTHER_VIDEO = "aBcDeFgHiJ1";
const JUMPS = "10.1000/maximal-jump-trial";
const SNACKS = "10.1000/exercise-snack-review";
const BOUNCE = "10.1000/bounce-only-trial";
const STRETCH = "10.1000/elongation-trial";
const MATCHED = "10.1000/same-routine-trial";
const TARGET = "Whether the video's 2-minute fascia routine is the most important daily exercise";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const unread = sign("youtube_video_unread", { video: VIDEO, code: "gemini_video_not_completed" });
const read = sign("youtube_video_claims", { video: VIDEO, mode: "claims", n: 3 });
// A reading Gemini had not finished when extract_youtube_video_claims returned, which the AI never took up again.
const pending = sign("youtube_video_pending", { video: VIDEO });
const audit = (id: string) => sign("study_audit", { id, status: "complete_no_unresolved_fields" });
const reviewAudit = (id: string) => sign("review_audit", { id, status: "complete_no_unresolved_fields" });

type NamedTarget = NonNullable<FinalizeResearchInput["named_target"]>;
type KeySource = FinalizeResearchInput["key_sources"][number];
// T1b: the routine as the owner's correction describes it, a compound of three parts at a light dose.
const ROUTINE: NamedTarget = {
  label: "the video's 2-minute fascia routine",
  described_from: "person",
  video_id: VIDEO,
  components: "lengthening the neck and spine upward, holding the chest open, and a small rhythmic bounce on the " +
    "forefeet with the heels as an anchor",
  dose_or_intensity: "a light bounce, rising about 2 cm",
  frequency_and_duration: "2 minutes a day for 7 days",
  population: "adults who feel stiff with age",
  outcome: "stiffness",
  time_horizon: "7 days"
};
const matches = (match: (typeof TARGET_MATCHES)[number]) => ({
  target_components: match, target_dose_or_intensity: match, target_frequency_and_duration: match,
  target_population: match, target_outcome: match, target_time_horizon: match
});
const source = (id: string, marker: string, overrides: Partial<KeySource> = {}): KeySource => ({
  id, status: "validated", read_depth: "full_text_audited", answer_marker: marker, ...overrides
});
// (D) ten maximal countermovement jumps three times a week for eight months, measuring heel bone: different throughout.
const jumpTrial = source(JUMPS, "Jump trial", matches("different"));
// Two or more daily bouts of stair climbing or strength exercise, measuring fitness; who took part varied.
const snackReview = source(SNACKS, "Snack review", { ...matches("different"), target_population: "not_described" });
const JUMP_LINE = `[Jump trial](https://doi.org/${JUMPS}) tested ten maximal jumps three times a week for eight months.`;
const SNACK_LINE = `[Snack review](https://doi.org/${SNACKS}) pooled trials of stair climbing done at least twice a day.`;
const STUDY_LINES = `${JUMP_LINE}\n\n${SNACK_LINE}`;
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const UNWATCHED = `I could not watch [this video](${WATCH}), so what this answer says about it comes only from its ` +
  "title and description.";
const UNWATCHED_PERSON = `I could not watch [this video](${WATCH}), so what this answer says about it comes from what ` +
  "you said about it, not from watching it.";
const INDIRECT = "Not tested as described in any study I found: the video's 2-minute fascia routine. The studies " +
  "differ from it in the components, the dose or intensity, the frequency and duration, the population, the outcome, " +
  "and the time horizon, so they are indirect evidence about it.";
const UNWATCHED_LIMIT = `Video ${VIDEO} was not watched, so what the answer says about it comes only from its title and ` +
  "description: say so, as the caveat does.";
const UNWATCHED_PERSON_LIMIT = `Video ${VIDEO} was not watched, so what the answer says about it comes from what the ` +
  "person said about it: say so, as the caveat does.";
const unfinishedLimit = (account: string) => `extract_youtube_video_claims was still reading video ${VIDEO} when it ` +
  "last returned, and no research_receipt passed here shows the reading finished: finish it with its " +
  "continuation_token and pass the research_receipt it returns, or say that the video was not watched and that what " +
  `the answer says about it comes ${account}, as the caveat does.`;
const INDIRECT_LIMIT = "No key study is shown to have tested the video's 2-minute fascia routine as described: say so, " +
  "as the caveat does.";
const REQUIRED = "Give named_target: the person gave a video, which extract_youtube_video_claims read or could not " +
  "read, so the answer is about what it puts forward. Give its label as the answer names it; described_from, where " +
  "its description comes from (video_read, video_description_only, person or source_text), with the video's video_id; " +
  "and its components, dose_or_intensity, frequency_and_duration, population, outcome and time_horizon, each in a few " +
  "words or \"program not described\". Each key source then says how it matches each one (target_components to " +
  "target_time_horizon: same, different or not_described).";
const unmatchedStep = (ids: string) => `named_target is given, so each key source says how it matches it: give ${ids} ` +
  "target_components, target_dose_or_intensity, target_frequency_and_duration, target_population, target_outcome and " +
  "target_time_horizon, each same, different or not_described (the study, or named_target, does not describe it).";
const leftOut = (...caveats: string[]) => `The answer leaves out ${caveats.length === 1 ? "this caveat" : "these caveats"}; ` +
  "include each as its own sentence, as written (a link's text may change), or, in an answer not in English, in the " +
  `answer's language with the same links, given in caveat_renderings: ${caveats.map((caveat) => `"${caveat}"`).join(" ")}`;
const notApplicable = { status: "not_applicable" as const, reason: "Synthetic fixture isolates the named target." };
const packageFor = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [unread, audit(JUMPS), reviewAudit(SNACKS)], research_target: TARGET, research_depth: "deep",
  treatment_choice: "not_compared", community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic fixture isolates the named target.",
  lab_preparation: notApplicable, intervention_identity: notApplicable,
  full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the named target." },
  key_sources: [jumpTrial, snackReview], named_target: ROUTINE,
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  mechanism_claims: [], recommendations: [], safety_claims: [], safety_question: false,
  answer_draft: `${STUDY_LINES}\n\n${UNWATCHED_PERSON} ${INDIRECT}`, ...overrides
});

describe("the named target's sentences", () => {
  it("writes each caveat from the receipts and the declared mismatches only", () => {
    expect(unwatchedVideoCaveat(VIDEO, "description_only")).toBe(UNWATCHED);
    expect(unwatchedVideoCaveat(VIDEO, "person")).toBe(UNWATCHED_PERSON);
    expect(namedTargetCaveat("the video's 2-minute fascia routine.", 2, NAMED_TARGET_FIELDS, [])).toBe(INDIRECT);
    expect(namedTargetCaveat("the routine", 1, ["components"], ["outcome"])).toBe("Not tested as described in the " +
      "study I found: the routine. The study differs from it in the components, so it is indirect evidence about it.");
    expect(namedTargetCaveat("the routine", 3, ["components", "outcome"], [])).toBe("Not tested as described in any " +
      "study I found: the routine. The studies differ from it in the components and the outcome, so they are indirect " +
      "evidence about it.");
    // The fields that could not be compared start a sentence of their own.
    expect(namedTargetCaveat("the routine", 2, [], ["dose_or_intensity", "time_horizon"])).toBe("Not known to have " +
      "been tested as described in any study I found: the routine. The dose or intensity and the time horizon could " +
      "not be compared, so how directly the studies apply is not known.");
    expect(namedTargetCaveat("the routine", 1, [], ["population"])).toBe("Not known to have been tested as described " +
      "in the study I found: the routine. The population could not be compared, so how directly the study applies is " +
      "not known.");
    expect([...NAMED_TARGET_FIELDS]).toEqual([
      "components", "dose_or_intensity", "frequency_and_duration", "population", "outcome", "time_horizon"
    ]);
    expect([...NAMED_TARGET_SOURCES]).toEqual(["video_read", "video_description_only", "person", "source_text"]);
  });

  it("reads the HRP's sentinel with its legacy spacing, hyphen, underscore and case variants, and nothing else", () => {
    for (const sentinel of ["program not described", "Program Not Described", "program-not-described",
      "PROGRAM_NOT_DESCRIBED", "  program  not_described. ", "“program not described”"]) {
      expect(isProgramNotDescribed(sentinel), sentinel).toBe(true);
    }
    for (const described of ["not described", "program described", "2 minutes a day", "programme not described"]) {
      expect(isProgramNotDescribed(described), described).toBe(false);
    }
  });
});

describe.each(["gate", "MCP endpoint"] as const)("finalize_research named_target through the %s", (surface) => {
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
    client = new Client({ name: "named-target-test", version: "0.1.0" });
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
    const input = packageFor(overrides);
    if (surface === "gate") return assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
  };
  const steps = async (overrides: Partial<FinalizeResearchInput> = {}) =>
    (await call(overrides)).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT);

  describe("T1b: a compound routine judged by studies of other exercises", () => {
    it("needs the caveats that the video was not watched and that the studies are indirect, and holds back a draft without them", async () => {
      // The draft answers from the two studies as if they settled the routine, and says nothing of either gap.
      const verdict = "No: stair climbing and chair stands matter more than this bounce.";
      const blocked = await call({ answer_draft: `${verdict}\n\n${STUDY_LINES}` });
      expect(blocked).toMatchObject({
        status: "not_ready", next_steps: [leftOut(UNWATCHED_PERSON, INDIRECT)], next_step_kinds: ["answer_draft"],
        caveats: [UNWATCHED_PERSON, INDIRECT], limits: [UNWATCHED_PERSON_LIMIT, INDIRECT_LIMIT]
      });
      expect(blocked.finalization_receipt).toBeUndefined();
      expect(blocked.unchecked_line).toBe("AskRigor's final check has not passed: some of its statements were not checked.");
      // One caveat is not enough.
      expect(await steps({ answer_draft: `${STUDY_LINES}\n\n${UNWATCHED_PERSON}` })).toEqual([leftOut(INDIRECT)]);

      const passed = await call();
      expect(passed).toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [UNWATCHED_PERSON, INDIRECT] });
      expect(verifyResearchReceipt(passed.finalization_receipt!, { secret: SECRET })).toMatchObject({
        ok: true, kind: "finalization", claims: { status: "ready_with_limits" }
      });
    });

    it("counts trials of a part of the routine, or of none of it, as indirect: only the whole routine is the same", async () => {
      // (B) the bounce without lengthening or chest opening; (C) lengthening and chest opening without the bounce;
      // (D) high-impact jumps. Only the components differ for B and C.
      const bounceOnly = source(BOUNCE, "Bounce trial", { ...matches("same"), target_components: "different" });
      const stretchOnly = source(STRETCH, "Lengthening trial", {
        ...matches("same"), target_components: "different", target_dose_or_intensity: "not_described"
      });
      const lines = `[Bounce trial](https://doi.org/${BOUNCE}) tested the bounce alone.\n\n` +
        `[Lengthening trial](https://doi.org/${STRETCH}) tested lengthening and chest opening alone.`;
      const componentsOnly = "Not tested as described in any study I found: the video's 2-minute fascia routine. The " +
        "studies differ from it in the components, so they are indirect evidence about it.";
      const parts = { receipts: [unread, audit(BOUNCE), audit(STRETCH)], key_sources: [bounceOnly, stretchOnly] };
      expect(await call({ ...parts, answer_draft: `${lines}\n\n${UNWATCHED_PERSON} ${componentsOnly}` }))
        .toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [UNWATCHED_PERSON, componentsOnly] });
      // With the jump trial too, every field one of them differs in is named, and the draft must say so.
      const withJumps = await call({
        receipts: [unread, audit(BOUNCE), audit(STRETCH), audit(JUMPS)], key_sources: [bounceOnly, stretchOnly, jumpTrial],
        answer_draft: `${lines}\n\n${JUMP_LINE}\n\n${UNWATCHED_PERSON} ${componentsOnly}`
      });
      expect(withJumps).toMatchObject({ status: "not_ready", caveats: [UNWATCHED_PERSON, INDIRECT],
        next_steps: [leftOut(INDIRECT)] });
    });

    it("adds no such caveat when a key study tested the routine as described", async () => {
      // T2: a trial of the same routine, at the same dose, in the same people, for the same outcome and time.
      const same = source(MATCHED, "Routine trial", matches("same"));
      const line = `[Routine trial](https://doi.org/${MATCHED}) tested this routine for a week.`;
      const result = await call({
        receipts: [unread, audit(MATCHED), audit(JUMPS), reviewAudit(SNACKS)],
        key_sources: [same, jumpTrial, snackReview],
        answer_draft: `${line}\n\n${STUDY_LINES}\n\n${UNWATCHED_PERSON}`
      });
      expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [UNWATCHED_PERSON],
        limits: [UNWATCHED_PERSON_LIMIT] });
    });
  });

  describe("a video the person gave that AskRigor could not read", () => {
    it("says it was not watched, from its title and description unless the person described it", async () => {
      // Described from a source text, the routine's video still has its own caveat, from its title and description.
      const result = await call({ named_target: { ...ROUTINE, described_from: "source_text" },
        answer_draft: `${STUDY_LINES}\n\n${UNWATCHED} ${INDIRECT}` });
      expect(result).toMatchObject({ status: "ready_with_limits", caveats: [UNWATCHED, INDIRECT],
        limits: [UNWATCHED_LIMIT, INDIRECT_LIMIT] });
      // What the person said about it, declared for the video itself.
      expect(await call({ named_target: { ...ROUTINE, described_from: "source_text" },
        unwatched_videos: [{ video_id: VIDEO, content_from: "person" }] }))
        .toMatchObject({ status: "ready_with_limits", caveats: [UNWATCHED_PERSON, INDIRECT] });
      // Or for the routine the person described from it: the same caveat.
      expect((await call()).caveats).toEqual([UNWATCHED_PERSON, INDIRECT]);
      expect((await call({ unwatched_videos: [{ video_id: VIDEO, content_from: "person" }] })).status)
        .toBe("ready_with_limits");
    });

    it("adds no such caveat for a video another receipt shows was read", async () => {
      // A reading that failed once and succeeded later: the video was watched.
      const result = await call({ receipts: [unread, read, audit(JUMPS), reviewAudit(SNACKS)],
        named_target: { ...ROUTINE, described_from: "video_read" }, answer_draft: `${STUDY_LINES}\n\n${INDIRECT}` });
      expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [INDIRECT] });
    });

    it("checks each unwatched_videos entry against the receipts, one entry a video", async () => {
      expect(await steps({ receipts: [unread, read, audit(JUMPS), reviewAudit(SNACKS)],
        named_target: { ...ROUTINE, described_from: "video_read" },
        unwatched_videos: [{ video_id: VIDEO, content_from: "description_only" }], answer_draft: `${STUDY_LINES}\n\n${INDIRECT}` }))
        .toEqual([`unwatched_videos[0] names video ${VIDEO}, which extract_youtube_video_claims read: leave it out.`]);
      expect(await steps({ unwatched_videos: [{ video_id: OTHER_VIDEO, content_from: "person" }] })).toEqual([
        `unwatched_videos[0] names video ${OTHER_VIDEO}, which no research_receipt passed here shows ` +
          "extract_youtube_video_claims could not read: read it with extract_youtube_video_claims and pass the " +
          "research_receipt it returns, or leave the entry out."
      ]);
      expect(await steps({ unwatched_videos: [{ video_id: VIDEO, content_from: "person" },
        { video_id: VIDEO, content_from: "description_only" }] }))
        .toEqual(["unwatched_videos[1] names the same video as unwatched_videos[0]: give each video one entry."]);
    });

    it("asks the named target and the video's entry to agree on where the account comes from", async () => {
      const result = await call({ named_target: { ...ROUTINE, described_from: "video_description_only" },
        unwatched_videos: [{ video_id: VIDEO, content_from: "person" }] });
      expect(result.next_steps).toEqual([`named_target is described_from video_description_only for video ${VIDEO}, ` +
        "but unwatched_videos[0] gives its content_from as person: make the two agree."]);
      expect(result.next_step_kinds).toEqual(["declaration"]);
      // Agreeing, the caveat comes from its title and description.
      expect(await call({ named_target: { ...ROUTINE, described_from: "video_description_only" },
        answer_draft: `${STUDY_LINES}\n\n${UNWATCHED} ${INDIRECT}` }))
        .toMatchObject({ status: "ready_with_limits", caveats: [UNWATCHED, INDIRECT] });
    });

    it("refuses described_from video_read for a video AskRigor could not read, or did not try to", async () => {
      expect(await steps({ named_target: { ...ROUTINE, described_from: "video_read" } })).toEqual([
        `named_target is described_from video_read, but extract_youtube_video_claims could not read video ${VIDEO}: ` +
          "give described_from as the case is, video_description_only or person.",
        // Its caveat still comes from its title and description, which the draft does not state.
        leftOut(UNWATCHED)
      ]);
      expect(await steps({ receipts: [audit(JUMPS), reviewAudit(SNACKS)], named_target: { ...ROUTINE, described_from: "video_read" },
        answer_draft: `${STUDY_LINES}\n\n${INDIRECT}` })).toEqual([
        `named_target is described_from video_read, but no research_receipt passed here shows that ` +
          `extract_youtube_video_claims read video ${VIDEO}: read it and pass the research_receipt it returns, or give ` +
          "described_from as the case is."
      ]);
      const { video_id: _video, ...unidentified } = ROUTINE;
      expect(await steps({ receipts: [read, audit(JUMPS), reviewAudit(SNACKS)],
        named_target: { ...unidentified, described_from: "video_read" }, answer_draft: `${STUDY_LINES}\n\n${INDIRECT}` }))
        .toEqual(["named_target is described_from video_read without video_id: give the video's 11-character ID."]);
    });
  });

  describe("a reading left in progress", () => {
    const withReceipts = (...receipts: string[]) => [...receipts, audit(JUMPS), reviewAudit(SNACKS)];

    it("counts as not watched, and says the reading can still be finished", async () => {
      expect(await call({ receipts: withReceipts(pending) })).toMatchObject({ status: "ready_with_limits",
        next_steps: [], caveats: [UNWATCHED_PERSON, INDIRECT],
        limits: [unfinishedLimit("from what the person said about it"), INDIRECT_LIMIT] });
      // From its title and description, the draft must say so.
      expect(await steps({ receipts: withReceipts(pending), named_target: { ...ROUTINE, described_from: "source_text" } }))
        .toEqual([leftOut(UNWATCHED)]);
      expect((await call({ receipts: withReceipts(pending), named_target: { ...ROUTINE, described_from: "source_text" },
        answer_draft: `${STUDY_LINES}\n\n${UNWATCHED} ${INDIRECT}` })).limits)
        .toEqual([unfinishedLimit("only from its title and description"), INDIRECT_LIMIT]);
      // Its unwatched_videos entry is accepted, as for a video the tool could not read.
      expect(await call({ receipts: withReceipts(pending), named_target: { ...ROUTINE, described_from: "source_text" },
        unwatched_videos: [{ video_id: VIDEO, content_from: "person" }] }))
        .toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [UNWATCHED_PERSON, INDIRECT] });
    });

    it("is settled by a later receipt: read, or not read", async () => {
      // Finished: the video was watched, so no caveat, and video_read holds.
      expect(await call({ receipts: withReceipts(pending, read), named_target: { ...ROUTINE, described_from: "video_read" },
        answer_draft: `${STUDY_LINES}\n\n${INDIRECT}` }))
        .toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [INDIRECT], limits: [INDIRECT_LIMIT] });
      // Ended unread (an expired token, say): the usual caveat, with no offer to finish it.
      expect(await call({ receipts: withReceipts(pending, unread) })).toMatchObject({ status: "ready_with_limits",
        caveats: [UNWATCHED_PERSON, INDIRECT], limits: [UNWATCHED_PERSON_LIMIT, INDIRECT_LIMIT] });
    });

    it("refuses described_from video_read until the reading is finished", async () => {
      expect(await steps({ receipts: withReceipts(pending), named_target: { ...ROUTINE, described_from: "video_read" } }))
        .toEqual([
          `named_target is described_from video_read, but extract_youtube_video_claims had not finished reading video ` +
            `${VIDEO}: finish the reading with its continuation_token and pass the research_receipt it returns, or give ` +
            "described_from as the case is, video_description_only or person.",
          leftOut(UNWATCHED)
        ]);
    });
  });

  describe("when named_target is required", () => {
    // Key sources without matches, as an older call gives them.
    const unmatched = [source(JUMPS, "Jump trial"), source(SNACKS, "Snack review")];

    it("asks for it whenever a video receipt is passed, read or not, with the connector-refresh hint", async () => {
      for (const receipt of [unread, read, pending]) {
        const result = await call({ receipts: [receipt, audit(JUMPS), reviewAudit(SNACKS)], named_target: undefined,
          key_sources: unmatched, answer_draft: `${STUDY_LINES}\n\n${UNWATCHED}` });
        expect(result.next_steps).toEqual([REQUIRED, TOOL_LIST_REFRESH_HINT]);
        expect(result.next_step_kinds).toEqual(["declaration", "tool_list"]);
      }
      // Without it, a video that was not read still has its caveat, from its title and description.
      expect((await call({ named_target: undefined, key_sources: unmatched })).caveats).toEqual([UNWATCHED]);
    });

    it("is not required without a video, but is checked when given", async () => {
      const noVideo = { receipts: [audit(JUMPS), reviewAudit(SNACKS)], answer_draft: STUDY_LINES };
      expect(await call({ ...noVideo, named_target: undefined, key_sources: unmatched }))
        .toMatchObject({ status: "ready", next_steps: [], caveats: [] });
      // Given for a question about one routine with no video, its caveat still holds the answer.
      expect(await call({ ...noVideo, named_target: { ...ROUTINE, described_from: "source_text" } }))
        .toMatchObject({ status: "not_ready", next_steps: [leftOut(INDIRECT)], caveats: [INDIRECT] });
    });

    it("asks every key source for its six matches, as one declaration", async () => {
      const { target_outcome: _outcome, ...noOutcome } = snackReview;
      const result = await call({ key_sources: [source(JUMPS, "Jump trial"), noOutcome] });
      expect(result.next_steps).toEqual([unmatchedStep(`${JUMPS} and ${SNACKS}`), TOOL_LIST_REFRESH_HINT]);
      expect(result.next_step_kinds).toEqual(["declaration", "tool_list"]);
      // Until every source has them, no indirect-evidence caveat is written from part of them.
      expect(result.caveats).toEqual([UNWATCHED_PERSON]);
    });

    it("asks for named_target when key sources give matches without one", async () => {
      expect(await steps({ receipts: [audit(JUMPS), reviewAudit(SNACKS)], named_target: undefined,
        answer_draft: STUDY_LINES })).toEqual(["key_sources gives target_components to target_time_horizon without " +
        "named_target, what they are matched with: give named_target, or leave the matches out."]);
    });
  });

  describe("a field its description leaves out", () => {
    it("matches nothing: a study the same on every described field is not known to have tested it as described", async () => {
      const undescribed = { ...ROUTINE, dose_or_intensity: "Program-Not_Described" };
      const same = source(MATCHED, "Routine trial", { ...matches("same"), target_dose_or_intensity: "not_described" });
      const line = `[Routine trial](https://doi.org/${MATCHED}) tested this routine for a week.`;
      const caveat = "Not known to have been tested as described in the study I found: the video's 2-minute fascia " +
        "routine. The dose or intensity could not be compared, so how directly the study applies is not known.";
      const result = await call({ receipts: [unread, audit(MATCHED)], key_sources: [same], named_target: undescribed,
        answer_draft: `${line}\n\n${UNWATCHED_PERSON} ${caveat}` });
      expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [UNWATCHED_PERSON, caveat] });
    });

    it("refuses a study declared the same as, or different from, what is not described", async () => {
      const undescribed = { ...ROUTINE, time_horizon: "program not described" };
      const result = await call({ named_target: undescribed });
      expect(result.next_steps[0]).toBe(`named_target.time_horizon is "program not described", so no study is the ` +
        `same there or differs there: give ${JUMPS} and ${SNACKS} target_time_horizon not_described.`);
      expect(result.next_step_kinds[0]).toBe("declaration");
      // The caveat counts that field as not compared, whatever the studies declared for it.
      expect(result.caveats).toEqual([UNWATCHED_PERSON, "Not tested as described in any study I found: the video's " +
        "2-minute fascia routine. The studies differ from it in the components, the dose or intensity, the frequency " +
        "and duration, the population, and the outcome, so they are indirect evidence about it."]);
    });
  });

  describe("the caveat names the target as declared", () => {
    it("in any language, rendered through caveat_renderings", async () => {
      const label = "la routine de 2 minutes de la vidéo";
      const french = "Aucune des études trouvées n'a testé la routine de 2 minutes de la vidéo telle que décrite : " +
        "elles en diffèrent par les composantes, la dose, la fréquence, la population, le critère et la durée, ce sont " +
        "donc des preuves indirectes.";
      const caveat = namedTargetCaveat(label, 2, NAMED_TARGET_FIELDS, []);
      const renderedVideo = `Je n'ai pas pu regarder [cette vidéo](${WATCH}) : ce que dit cette réponse à son sujet ` +
        "vient de ce que vous en avez dit, pas de la vidéo elle-même.";
      const result = await call({ named_target: { ...ROUTINE, label }, answer_language: "fr",
        caveat_renderings: [{ caveat, text: french }, { caveat: UNWATCHED_PERSON, text: renderedVideo }],
        answer_draft: `${STUDY_LINES}\n\n${renderedVideo} ${french}` });
      expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [], caveats: [UNWATCHED_PERSON, caveat] });
      expect(caveat).toContain("Not tested as described in any study I found: la routine de 2 minutes de la vidéo.");
      // A rendering that drops the video's link is refused.
      expect(await steps({ named_target: { ...ROUTINE, label }, answer_language: "fr",
        caveat_renderings: [{ caveat, text: french }, { caveat: UNWATCHED_PERSON, text: "Je n'ai pas pu regarder cette vidéo." }],
        answer_draft: `${STUDY_LINES}\n\nJe n'ai pas pu regarder cette vidéo. ${french}` }))
        .toEqual([`caveat_renderings drops the link(s) of this caveat; keep each link: "${UNWATCHED_PERSON}"`]);
    });

    it("asks for the label in plain words when its caveat would show internal labels", async () => {
      const label = "the fascia_bounce routine";
      const caveat = namedTargetCaveat(label, 2, NAMED_TARGET_FIELDS, []);
      expect(await steps({ named_target: { ...ROUTINE, label }, answer_draft: `${STUDY_LINES}\n\n${UNWATCHED_PERSON} ${caveat}` }))
        .toEqual(["named_target.label shows internal labels (fascia_bounce): the answer names it in its caveat, so give " +
          "it in plain words."]);
      // A label that reaches no caveat is not checked for them.
      const same = source(MATCHED, "Routine trial", matches("same"));
      expect((await call({ receipts: [unread, audit(MATCHED)], key_sources: [same], named_target: { ...ROUTINE, label },
        answer_draft: `[Routine trial](https://doi.org/${MATCHED}) tested it.\n\n${UNWATCHED_PERSON}` })).status)
        .toBe("ready_with_limits");
    });
  });

  it("keeps the target and its fingerprint out of the finalization receipt and the carried state", async () => {
    const result = await call();
    expect(result.status).toBe("ready_with_limits");
    const receipt = verifyResearchReceipt(result.finalization_receipt!, { secret: SECRET });
    expect(receipt.ok).toBe(true);
    for (const declared of ["fascia", "forefeet", "stiffness", "2 cm", "feel stiff"]) {
      expect(JSON.stringify(receipt), declared).not.toContain(declared);
      expect(JSON.stringify(result.carried ?? {}), declared).not.toContain(declared);
      expect(result.carry_forward ?? "", declared).not.toContain(declared);
    }
    // Only the label comes back, in its caveat and limit; the fingerprint never does.
    const output = JSON.stringify(result);
    for (const declared of ["forefeet", "stiffness", "2 cm", "feel stiff"]) expect(output, declared).not.toContain(declared);
  });

  it.each([
    { named_target: { ...ROUTINE, described_from: "watched" } },
    { named_target: { ...ROUTINE, components: "" } },
    { named_target: { ...ROUTINE, label: "l".repeat(161) } },
    { named_target: { ...ROUTINE, outcome: "o".repeat(301) } },
    { named_target: { ...ROUTINE, video_id: "my video" } },
    { named_target: (({ time_horizon: _horizon, ...rest }) => rest)(ROUTINE) },
    { named_target: { ...ROUTINE, extra: "unexpected" } },
    { key_sources: [{ ...jumpTrial, target_outcome: "similar" }] },
    { unwatched_videos: [{ video_id: VIDEO, content_from: "transcript" }] }
  ])("notes a malformed declaration (%j) and still checks the answer", async (invalid) => {
    const input = { ...packageFor(), ...invalid };
    expect(finalizeResearchInputSchema.safeParse(input).success).toBe(false);
    const result = surface === "gate"
      ? finalizeResearch(input, { secret: SECRET })
      : (await client!.callTool({ name: "finalize_research", arguments: input })).structuredContent as FinalizeResearchOutput;
    expect(result.answer_checked).toBe(true);
    expect(result.notes!.length).toBeGreaterThan(0);
    expect(result.next_step_kinds).not.toContain("input_invalid");
  });

  if (surface === "MCP endpoint") it("publishes the declarations flat, with their catalog text", async () => {
    const { tools } = await client!.listTools();
    expect(tools).toHaveLength(33);
    const tool = tools.find(({ name }) => name === "finalize_research")!;
    expect(tool.description).toContain("whole-intervention identity (intervention_identity), the one thing the question " +
      "is about and how each key study matches it (named_target), videos AskRigor could not read (unwatched_videos), ");
    // Primitives only below the top level, so ChatGPT's app shows the model each field: no JSON in the description.
    type Node = { type?: string; description?: string; enum?: string[]; items?: Node; properties?: Record<string, Node> };
    for (const relaxed of [true, false]) {
      const published = finalizeResearchPublishedInputSchema({ relaxed }) as { properties: Record<string, Node> };
      const target = published.properties.named_target!;
      expect(target.type).toBe("object");
      expect(target.description).toContain("whenever extract_youtube_video_claims ran on a video, read or not");
      expect(Object.keys(target.properties!)).toEqual(["label", "described_from", "video_id", ...NAMED_TARGET_FIELDS]);
      for (const field of Object.values(target.properties!)) expect(field.type).toBe("string");
      expect(target.properties!.described_from!.enum).toEqual([...NAMED_TARGET_SOURCES]);
      const sourceFields = published.properties.key_sources!.items!.properties!;
      for (const field of NAMED_TARGET_FIELDS) {
        expect(sourceFields[`target_${field}`]!.enum, field).toEqual([...TARGET_MATCHES]);
      }
      const videos = published.properties.unwatched_videos!;
      expect(videos.type).toBe("array");
      expect(Object.keys(videos.items!.properties!)).toEqual(["video_id", "content_from"]);
      expect(videos.items!.properties!.content_from!.enum).toEqual(["description_only", "person"]);
    }
    for (const name of ["named_target", "unwatched_videos", "target_components"]) {
      expect(FINALIZE_RESEARCH_SHAPES_DESCRIPTION).not.toContain(name);
    }
  });
});
