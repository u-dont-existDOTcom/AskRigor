import { afterEach, describe, expect, it, vi } from "vitest";

import { untraceableCitationMarkers, untraceableCitationNote } from "../apps/research-mcp/src/citation-markers.js";
import { ruleText } from "../apps/research-mcp/src/check-rules.js";
import { claimCoverageNotes, extractedClaimIds, videoClaimId } from "../apps/research-mcp/src/claim-coverage.js";
import {
  communitySkipCaveat, finalizeResearch as finalizeResearchUnwrapped, type FinalizeResearchInput,
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { withSourceReading } from "./helpers/source-reading.js";

// AskRigor#431: a ChatGPT run fact-checked a video whose 22 claims were listed, answered a few, cited with markers no
// reader could follow and never called finalize_research. Both new checks are exact and notes only: the final check's
// blocking checks stay six (owner answers 193a, 195a and 217b).

const SECRET = "claim-coverage-test-secret-0123456789abcdefghij";
const VIDEO = "Zx3_synth-1";
const OTHER = "Qq9-synthAB";
const notes = (rules: ReturnType<typeof claimCoverageNotes>) => rules.map(ruleText);

afterEach(() => { vi.useRealTimers(); });

describe("the claims each extraction listed", () => {
  it("are video#1 to video#n of each video's latest reading in claims mode, from the receipts alone", () => {
    expect(videoClaimId(VIDEO, 3)).toBe(`${VIDEO}#3`);
    expect(extractedClaimIds([
      { kind: "youtube_video_claims", claims: { video: VIDEO, mode: "claims", n: "2", t: "100" } },
      { kind: "youtube_video_claims", claims: { video: VIDEO, mode: "claims", n: "3", t: "200" } },
      { kind: "youtube_video_claims", claims: { video: OTHER, mode: "moment", n: "1", t: "300" } },
      { kind: "youtube_video_unread", claims: { video: OTHER, code: "youtube_video_too_long" } },
      { kind: "youtube_video_claims", claims: { video: OTHER, mode: "claims", n: "0", t: "400" } },
      { kind: "study_audit", claims: { doi: "10.5555/x" } },
    ])).toEqual([`${VIDEO}#1`, `${VIDEO}#2`, `${VIDEO}#3`]);
  });

  it("each need a status: a missing one or not_addressed is a note that the answer must call itself partial", () => {
    const expected = [1, 2, 3, 4].map((n) => videoClaimId(VIDEO, n));
    expect(claimCoverageNotes(expected, [
      { claim_id: `${VIDEO}#1`, status: "assessed" },
      { claim_id: `${VIDEO}#2`, status: "limited", reason: "Only animal studies were found." },
      { claim_id: `${VIDEO}#3`, status: "unresolved" },
      { claim_id: `${VIDEO}#4`, status: "assessed" },
    ])).toEqual([]);
    expect(notes(claimCoverageNotes(expected, [
      { claim_id: `${VIDEO}#1`, status: "assessed" },
      { claim_id: `${VIDEO}#3`, status: "not_addressed" },
    ]))).toEqual([`Of the 4 video claim(s) extract_youtube_video_claims listed, 2 have no status in ` +
      `later_inputs.claim_coverage (${VIDEO}#2, ${VIDEO}#4), and 1 are declared not_addressed (${VIDEO}#3). Account for ` +
      "each claim in the answer, assessed, limited with its reason, or unresolved, and give each id's status in " +
      "later_inputs.claim_coverage; while any claim is not addressed, the answer must call itself partial, at its start, " +
      "and say which claims it did not assess."]);
    // Without any declaration every listed claim lacks a status; a long list is shortened.
    const many = Array.from({ length: 22 }, (_, index) => videoClaimId(VIDEO, index + 1));
    expect(notes(claimCoverageNotes(many, undefined))[0]).toContain(`22 have no status in later_inputs.claim_coverage ` +
      `(${many.slice(0, 12).join(", ")} and 10 more)`);
  });

  it("are the only ids a declaration may name, and a limited claim gives its reason", () => {
    expect(notes(claimCoverageNotes([`${VIDEO}#1`], [
      { claim_id: `${VIDEO}#1`, status: "limited" },
      { claim_id: `${OTHER}#7`, status: "assessed" },
    ]))).toEqual([
      `later_inputs.claim_coverage names ${OTHER}#7, which no extract_youtube_video_claims receipt passed here lists: ` +
        "leave them out, or pass the receipt of the reading that listed them.",
      "claim_coverage[0] is limited without a reason: give each limit's reason in a few words.",
    ]);
  });
});

describe("the app's own citation markers", () => {
  it("are found exactly, run together or apart, and nothing else is", () => {
    expect(untraceableCitationMarkers("As shown 【turn0search3】 and citeturn2view1turn0news12, and again turn0search3."))
      .toEqual(["turn0search3", "turn2view1", "turn0news12"]);
    for (const text of ["We return to search 3 later.", "Turn 0 search 3", "turnaround", "Saturn's view", undefined]) {
      expect(untraceableCitationMarkers(text)).toEqual([]);
    }
    expect(ruleText(untraceableCitationNote("A claim turn1search0.")!)).toBe("The draft holds the app's own citation " +
      "markers (turn1search0), which no reader can open: replace each with the link of the source it stands for, or " +
      "remove it, and call finalize_research again with the changed draft.");
    expect(untraceableCitationNote("A claim [Study](https://doi.org/10.5555/x).")).toBeUndefined();
  });
});

// The final check itself: both come back as notes, never as steps that hold the answer back.
const finalizeResearch = (...args: Parameters<typeof finalizeResearchUnwrapped>) =>
  finalizeResearchUnwrapped(withSourceReading(args[0], { check: args[1] }), args[1]);

function fixture(overrides: Partial<FinalizeResearchInput> & { later_inputs?: Record<string, unknown> } = {}): FinalizeResearchInput {
  return {
    receipts: [
      issueResearchReceipt("study_audit", { doi: "10.1000/depth", content: "a".repeat(16) }, { secret: SECRET }),
      issueResearchReceipt("youtube_video_claims", { video: VIDEO, mode: "claims", n: 3 }, { secret: SECRET }),
    ],
    research_target: "Synthetic video fact-check", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
    not_relevant_reason: "Synthetic fixture isolates the claim-coverage note.",
    commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
    intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
    full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the claim-coverage note." },
    lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
    key_sources: [{ id: "10.1000/depth", status: "validated", read_depth: "full_text_audited", answer_marker: "[Texte lu]" }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
    safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth).\n\n" +
      communitySkipCaveat("Synthetic fixture isolates the claim-coverage note."),
    ...overrides,
  } as FinalizeResearchInput;
}

describe("finalize_research (AskRigor#431)", () => {
  it("notes the claims with no status, and holds nothing back for them", () => {
    const result = finalizeResearch({ ...fixture(), later_inputs: {
      claim_coverage: [{ claim_id: `${VIDEO}#1`, status: "assessed" }, { claim_id: `${VIDEO}#3`, status: "not_addressed" }],
    } } as never, { secret: SECRET, findings: "closed" });
    const coverage = (result.notes ?? []).find((note) => note.startsWith("Of the 3 video claim(s)"));
    expect(coverage).toContain(`1 have no status in later_inputs.claim_coverage (${VIDEO}#2), and 1 are declared ` +
      `not_addressed (${VIDEO}#3)`);
    expect(result.next_steps.join("\n")).not.toContain("claim_coverage");
    const covered = finalizeResearch({ ...fixture(), later_inputs: {
      claim_coverage: [1, 2, 3].map((n) => ({ claim_id: `${VIDEO}#${n}`, status: "assessed" })),
    } } as never, { secret: SECRET, findings: "closed" });
    expect((covered.notes ?? []).join("\n")).not.toContain("video claim(s)");
    expect(covered.status).toBe(result.status);
  });

  it("notes the app's citation markers in the draft, and holds nothing back for them", () => {
    const clean = finalizeResearch(fixture(), { secret: SECRET, findings: "closed" });
    const marked = finalizeResearch(fixture({
      answer_draft: "[Texte lu] [Étude](https://doi.org/10.1000/depth) turn0search3.\n\n" +
        communitySkipCaveat("Synthetic fixture isolates the claim-coverage note."),
    }), { secret: SECRET, findings: "closed" });
    expect((marked.notes ?? []).join("\n")).toContain("The draft holds the app's own citation markers (turn0search3)");
    expect((clean.notes ?? []).join("\n")).not.toContain("citation markers");
    expect(marked.next_steps.join("\n")).not.toContain("citation markers");
    expect(marked.status).toBe(clean.status);
  });
});
