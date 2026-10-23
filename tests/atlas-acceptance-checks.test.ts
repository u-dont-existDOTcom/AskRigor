import { describe, expect, it } from "vitest";

// The numbers have one definition, with the intents that store them.
import {
  atlasNumberEntrySchema as atlasNumberSchema,
  atlasNumbersSchema,
  type AtlasNumberEntry as AtlasNumber
} from "@askrigor/evidence-repository";

import { atlasNumbersProblems, binaryContrast } from "../apps/research-mcp/src/binary-results.js";
import {
  atlasBasesOf,
  atlasLinkProblems,
  atlasWordingKey,
  communityState,
  containsCardReference,
  screenAtlasTexts,
  type AtlasLinkRequest,
  type AtlasLinkState
} from "../apps/research-mcp/src/findings/acceptance-checks.js";
import { normalizedFindingsText, withoutStudyForms, type StoredFinding } from "../apps/research-mcp/src/findings/card.js";
import type { FindingsRecord } from "../apps/research-mcp/src/findings/service.js";

// The Atlas phase 2 design's exact checks before the owner accepts a finding (section 2), on the organization draft's
// invented example: Velmor syndrome, zentarine, its trials and every number are synthetic, and 10.0000/ marks synthetic
// identifiers. None of it is evidence about a treatment.
const QUESTION = "Does zentarine help the hand tremor of Velmor syndrome in adults, and what are its side effects?";
const CLAIM = "In one trial of 240 adults with Velmor syndrome, zentarine halved the tremor score in more people than " +
  "placebo over 12 weeks.";

const finding = (overrides: Partial<StoredFinding> = {}): StoredFinding => ({
  claim: CLAIM,
  certainty: "low",
  applies_to: "Adults with Velmor syndrome",
  answer_quote: CLAIM,
  sources: ["10.0000/synthetic-a"],
  why_not_usual: "A quick answer calls it well tolerated and misses the trial's numbers.",
  tags: ["full_text_read"],
  what_would_change_it: "A second trial of similar size.",
  ...overrides
});

const saved = (findings: StoredFinding[], savedAt: string): FindingsRecord => ({
  schema: "askrigor.findings-card.v1",
  card: {
    question: QUESTION,
    usual_answer: "A natural supplement that may ease the tremor and is generally well tolerated.",
    findings,
    public_value: {
      scope: "public",
      who_else: "Adults with Velmor syndrome weighing zentarine",
      what_it_changes: "It gives the trial's numbers, harms included."
    },
    open_leads: []
  },
  card_sha256: "a".repeat(64),
  stamp: {
    saved_at: savedAt,
    askrigor_version: "0.1.0",
    askrigor_build: "test",
    protocols: [],
    tool_catalog_sha256: "b".repeat(64),
    surface: "/mcp",
    research: { finalized_at: savedAt }
  }
});

describe("which save of a card counts", () => {
  it("takes the card's own record when its finding has a basis that counts", () => {
    const card = saved([finding({ verified_bases: ["full_text_audit", "comment_audit"] })], "2026-11-02T10:00:00.000Z");
    const later = saved([finding({ verified_bases: ["bounded_absence"], applies_to: "Adults" })],
      "2026-11-03T10:00:00.000Z");
    expect(atlasBasesOf(card, [later], 1)).toEqual({
      from: "card", record: card, finding: card.card.findings[0], bases: ["full_text_audit"], entryKind: "finding"
    });
  });

  it("otherwise takes the newest later save with the same normalized claim and a basis that counts", () => {
    // Audited comments are not a basis that counts (owner choice 2a).
    const card = saved([finding({ verified_bases: ["comment_audit"] })], "2026-11-02T10:00:00.000Z");
    const sameClaim = (verified: StoredFinding["verified_bases"], appliesTo: string) => finding({
      claim: ` ${CLAIM.toUpperCase().replace(/ /gu, "  ")}​ `,
      applies_to: appliesTo,
      sources: ["10.0000/synthetic-a", "PMID: 40123456"],
      verified_bases: verified
    });
    const newest = saved([finding({ claim: "Another claim.", verified_bases: ["full_text_audit"] }),
      sameClaim(["research_correction", "comment_audit"], "Adults, newest save")], "2026-11-05T10:00:00.000Z");
    const older = saved([sameClaim(["bounded_absence"], "Adults, older save")], "2026-11-04T10:00:00.000Z");
    const withoutBasis = saved([sameClaim(["comment_audit"], "Adults, no basis")], "2026-11-06T10:00:00.000Z");
    // Listed out of order: the save time decides.
    const counted = atlasBasesOf(card, [newest, withoutBasis, older], 1);
    expect(counted).toMatchObject({
      from: "occurrence", occurrence: 0, record: newest, bases: ["research_correction"], entryKind: "finding"
    });
    expect(counted?.finding).toBe(newest.card.findings[1]);
    expect(counted?.finding.applies_to).toBe("Adults, newest save");
    expect(atlasBasesOf(card, [older, withoutBasis], 1)).toMatchObject({ occurrence: 0, bases: ["bounded_absence"] });
  });

  it("keeps the card's own record as a lead when no save has a basis that counts", () => {
    const card = saved([finding({ verified_bases: ["comment_audit"] }), finding({ claim: "Second claim." })],
      "2026-11-02T10:00:00.000Z");
    const otherClaim = saved([finding({ claim: "A different claim.", verified_bases: ["full_text_audit"] })],
      "2026-11-03T10:00:00.000Z");
    const earlier = saved([finding({ verified_bases: ["full_text_audit"] })], "2026-11-01T10:00:00.000Z");
    expect(atlasBasesOf(card, [otherClaim, earlier], 1)).toEqual({
      from: "card", record: card, finding: card.card.findings[0], bases: [], entryKind: "lead"
    });
    // A card saved before bases were signed has none.
    expect(atlasBasesOf(card, [], 2)).toMatchObject({ from: "card", bases: [], entryKind: "lead" });
  });

  it("names findings from 1 and has no finding outside the card", () => {
    const card = saved([finding({ verified_bases: ["full_text_audit"] })], "2026-11-02T10:00:00.000Z");
    expect(atlasBasesOf(card, [], 0)).toBeUndefined();
    expect(atlasBasesOf(card, [], 2)).toBeUndefined();
    expect(atlasBasesOf(card, [], 1.5)).toBeUndefined();
  });
});

describe("community evidence under owner decision 4a", () => {
  it("refuses a finding with no DOI, PMID, PMCID or NCT source", () => {
    expect(communityState(finding({
      sources: [], youtube_videos: 3, verified_bases: ["comment_audit"], tags: ["community_checked"]
    }))).toEqual({ state: "community_only", refused: true, needsConfirmation: false });
    // A source no provider could take is not a study source either.
    expect(communityState(finding({ sources: ["0123"] }))).toMatchObject({ state: "community_only", refused: true });
  });

  it("asks the owner to confirm a finding that also rested on audited comments", () => {
    const mixed = { state: "mixed", refused: false, needsConfirmation: true };
    expect(communityState(finding({ youtube_videos: 1 }))).toEqual(mixed);
    expect(communityState(finding({ verified_bases: ["full_text_audit", "comment_audit"] }))).toEqual(mixed);
    expect(communityState(finding({ tags: ["full_text_read", "community_checked"] }))).toEqual(mixed);
    expect(communityState(finding({ sources: ["PMC1234567"], youtube_videos: 2 }))).toEqual(mixed);
  });

  it("passes a finding that rests on studies alone", () => {
    for (const sources of [["10.0000/synthetic-a"], ["PMID: 40123456"], ["pmc1234567"], ["NCT01234567"]]) {
      expect(communityState(finding({ sources }))).toEqual({ state: "none", refused: false, needsConfirmation: false });
    }
  });
});

describe("numbers against the wording (owner answers 149a and 153b)", () => {
  // The draft's worked example: tremor halved in 30 of 120 on zentarine and 18 of 120 on placebo, and nausea in 12 of
  // 120 and 6 of 120, at 12 weeks.
  const tremor: AtlasNumber = {
    outcome: "tremor score halved", better: "more", option: "zentarine", option_events: 30, option_total: 120,
    comparator: "placebo", comparator_events: 18, comparator_total: 120, follow_up: "12 weeks", nnt: 10
  };
  const nausea: AtlasNumber = {
    outcome: "nausea", better: "fewer", option: "zentarine", option_events: 12, option_total: 120,
    comparator: "placebo", comparator_events: 6, comparator_total: 120, follow_up: "12 weeks", nnh: 20
  };
  const WORDING = "Over 12 weeks, the tremor score halved in 30 of 120 adults on zentarine and 18 of 120 on placebo, " +
    "a number needed to treat of 10; nausea affected 12 of 120 and 6 of 120, a number needed to harm of 20.";
  const codes = (numbers: AtlasNumber[], wording = WORDING) =>
    atlasNumbersProblems(numbers, wording).map(({ at, code }) => `${at} ${code}`);

  it("is binary_results' flat entry without its quote", () => {
    expect(atlasNumbersSchema.parse([tremor, nausea])).toEqual([tremor, nausea]);
    expect(atlasNumbersSchema.parse([])).toEqual([]);
    expect(atlasNumberSchema.safeParse({ ...tremor, quote: WORDING }).success).toBe(false);
    expect(atlasNumberSchema.safeParse({ ...tremor, harms_quote: WORDING }).success).toBe(false);
    expect(atlasNumberSchema.safeParse({ ...tremor, option_total: 0 }).success).toBe(false);
    expect(atlasNumberSchema.safeParse({ ...tremor, option_events: 2.5 }).success).toBe(false);
    expect(atlasNumberSchema.safeParse({ ...tremor, harms_none_found: true }).success).toBe(true);
  });

  it("accepts the worked example, whose number needed to treat is exactly 10", () => {
    expect(binaryContrast(tremor)).toEqual({ optionHigher: true, reciprocal: 10, roundedUp: 10 });
    expect(atlasNumbersProblems([tremor, nausea], WORDING)).toEqual([]);
  });

  it("works the reciprocal out in integers, where floating point would round 5 up to 6", () => {
    // 1 / (0.3 - 0.1) is 5.000000000000001 in floating point.
    const counts = { ...tremor, option_events: 30, option_total: 100, comparator_events: 10, comparator_total: 100 };
    expect(binaryContrast(counts)?.roundedUp).toBe(5);
    const wording = "At 12 weeks, 30 of 100 against 10 of 100, a number needed to treat of 5; nausea in 12 of 120 " +
      "and 6 of 120, a number needed to harm of 20.";
    expect(codes([{ ...counts, nnt: 5 }, nausea], wording)).toEqual([]);
    expect(codes([{ ...counts, nnt: 6 }, nausea], wording.replace("of 5", "of 6")))
      .toEqual(["numbers[0] not_reciprocal_rounded_up"]);
  });

  it("rounds a number needed to treat that is not a whole number up", () => {
    // 25 of 100 against 13 of 100: 1 / 0.12 is 8.3, so 9.
    const counts = { ...tremor, option_events: 25, option_total: 100, comparator_events: 13, comparator_total: 100 };
    const wording = (nnt: string) => `At 12 weeks, 25 of 100 against 13 of 100, a number needed to treat of ${nnt}; ` +
      "nausea in 12 of 120 and 6 of 120, a number needed to harm of 20.";
    expect(codes([{ ...counts, nnt: 9 }, nausea], wording("9"))).toEqual([]);
    expect(codes([{ ...counts, nnt: 8 }, nausea], wording("8"))).toEqual(["numbers[0] not_reciprocal_rounded_up"]);
    const [problem] = atlasNumbersProblems([{ ...counts, nnt: 8.33 }, nausea], wording("8.33"));
    expect(problem).toMatchObject({ at: "numbers[0]", code: "not_reciprocal_rounded_up" });
    expect(problem?.message).toContain("is 8.3, which rounds up to 9");
  });

  it("refuses events above the group's total, and the arithmetic that would follow from them", () => {
    // 130 of 120: the option's figure has no rate to show, and its nnt has no difference in rates to check.
    const problems = atlasNumbersProblems([{ ...tremor, option_events: 130 }, nausea], WORDING);
    expect(problems.map(({ at, code }) => `${at} ${code}`)).toEqual(["numbers[0] events_exceed_total"]);
    expect(problems[0]?.message).toContain("more events than people for zentarine");
  });

  it("refuses a number in the wrong direction, both numbers at once, or one where the rates are the same", () => {
    const worse = { ...tremor, option_events: 18, comparator_events: 30 };
    expect(codes([worse, nausea], WORDING.replace("30 of 120 adults on zentarine and 18 of 120",
      "18 of 120 adults on zentarine and 30 of 120"))).toEqual(["numbers[0] wrong_direction"]);
    expect(atlasNumbersProblems([worse, nausea], WORDING)[0]?.message).toContain("give it as nnh");
    expect(codes([{ ...tremor, nnh: 10 }, nausea])).toEqual(["numbers[0] nnt_and_nnh"]);
    expect(codes([{ ...tremor, comparator_events: 30, nnt: 10 }, nausea],
      WORDING.replace("18 of 120 on placebo", "30 of 120 on placebo"))).toEqual(["numbers[0] same_rates"]);
  });

  it("reads each group's figure in the wording, as events and total or as a rate, in digits of any script", () => {
    const rates = "Over 12 weeks, the tremor score halved in 25% on zentarine against 15% on placebo, a number " +
      "needed to treat of 10; nausea affected 10% and 5%, a number needed to harm of 20.";
    expect(codes([tremor, nausea], rates)).toEqual([]);
    // Arabic-Indic digits.
    const arabic = "على مدى ١٢ أسبوعًا، انخفض الرعاش إلى النصف لدى ٣٠ من ١٢٠ بالغًا تناولوا زنتارين و١٨ من ١٢٠ " +
      "تناولوا دواءً وهميًا، أي أن عدد من يلزم علاجهم ١٠؛ وأصاب الغثيان ١٢ من ١٢٠ و٦ من ١٢٠، أي أن عدد من يلزم " +
      "لحدوث ضرر ٢٠.";
    const inArabic = (entry: AtlasNumber): AtlasNumber => ({ ...entry, follow_up: "١٢ أسبوعًا" });
    expect(codes([inArabic(tremor), inArabic(nausea)], arabic)).toEqual([]);
    // Devanagari digits.
    const hindi = "१२ सप्ताह में, ज़ेंटारिन लेने वाले १२० में से ३० और प्लेसीबो लेने वाले १२० में से १८ लोगों में कंपन " +
      "आधा हुआ, यानी उपचार के लिए आवश्यक संख्या १०; मतली १२० में से १२ और १२० में से ६ लोगों को हुई, यानी " +
      "नुकसान के लिए आवश्यक संख्या २०।";
    const inHindi = (entry: AtlasNumber): AtlasNumber => ({ ...entry, follow_up: "१२ सप्ताह" });
    expect(codes([inHindi(tremor), inHindi(nausea)], hindi)).toEqual([]);
    // A figure the wording does not show, in any script.
    expect(codes([inHindi(tremor), inHindi(nausea)], hindi.replace("१२० में से ३०", "१२० में से ३१")))
      .toEqual(["numbers[0] group_figure_not_shown"]);
    expect(atlasNumbersProblems([tremor, nausea], WORDING.replace("18 of 120 on placebo", "some on placebo"))[0]?.message)
      .toContain("for placebo: the wording contains neither its events and total (18 and 120) nor its rate (15%)");
  });

  it("shows a number needed to treat or harm with its follow-up", () => {
    expect(codes([tremor, nausea], WORDING.replace("a number needed to treat of 10", "a clear benefit")))
      .toEqual(["numbers[0] number_needed_not_shown"]);
    expect(codes([tremor, nausea], WORDING.replace("Over 12 weeks, ", ""))).toEqual([
      "numbers[0] follow_up_not_shown", "numbers[1] follow_up_not_shown"
    ]);
    // Case, dashes, emphasis and a closing mark aside.
    const dashed = { ...tremor, follow_up: "12-Week follow-up." };
    const wording = WORDING.replace("Over 12 weeks", "At the *12–week follow‑up*");
    expect(codes([dashed, { ...nausea, follow_up: "12-week follow-up" }], wording)).toEqual([]);
  });

  it("compares the follow-up in digits of any script (review finding 9)", () => {
    const arabic = "على مدى ١٢ أسبوعًا، انخفض الرعاش إلى النصف لدى ٣٠ من ١٢٠ بالغًا تناولوا زنتارين و١٨ من ١٢٠ " +
      "تناولوا دواءً وهميًا، أي أن عدد من يلزم علاجهم ١٠؛ وأصاب الغثيان ١٢ من ١٢٠ و٦ من ١٢٠، أي أن عدد من يلزم " +
      "لحدوث ضرر ٢٠.";
    // Declared in ASCII digits and shown in Arabic-Indic ones, or declared in Arabic-Indic and Devanagari digits and
    // shown in ASCII ones; the harm beside the number needed to treat is then over the same follow-up too.
    const ascii = (entry: AtlasNumber): AtlasNumber => ({ ...entry, follow_up: "12 أسبوعًا" });
    expect(codes([ascii(tremor), ascii(nausea)], arabic)).toEqual([]);
    expect(codes([{ ...tremor, follow_up: "١٢ weeks" }, { ...nausea, follow_up: "१२ weeks" }])).toEqual([]);
    // Another follow-up is still another, in any script.
    expect(codes([{ ...tremor, follow_up: "١٣ weeks" }, nausea]))
      .toEqual(["numbers[0] follow_up_not_shown", "numbers[0] harms_missing"]);
  });

  it("does not read the follow-up's own numbers as a rate (review finding 10)", () => {
    // 37 of 300 is 12.3%, which "12 weeks" does not show, while "12% at 12 weeks" does.
    const entry: AtlasNumber = {
      outcome: "tremor score halved", better: "more", option: "zentarine", option_events: 37, option_total: 300,
      comparator: "placebo", comparator_events: 18, comparator_total: 300, follow_up: "12 weeks"
    };
    expect(codes([entry], "Over 12 weeks, the tremor score halved in 6% on placebo and in more on zentarine."))
      .toEqual(["numbers[0] group_figure_not_shown"]);
    expect(codes([entry], "Over 12 weeks, the tremor score halved in 12% on zentarine and 6% on placebo.")).toEqual([]);
    expect(codes([entry], "The tremor score halved in 12% on zentarine and 6% on placebo at 12 weeks.")).toEqual([]);
    // A follow-up of two numbers sets aside one occurrence of each.
    expect(codes([{ ...entry, follow_up: "6 to 12 weeks" }],
      "From 6 to 12 weeks, the tremor score halved in more on zentarine than on placebo.")).toEqual([
      "numbers[0] group_figure_not_shown", "numbers[0] group_figure_not_shown"]);
    expect(codes([{ ...entry, follow_up: "6 to 12 weeks" }],
      "From 6 to 12 weeks, the tremor score halved in 12% on zentarine and 6% on placebo.")).toEqual([]);
    // Natural frequencies are read as before.
    expect(codes([entry], "Over 12 weeks, the tremor score halved in 37 of 300 on zentarine and 18 of 300 on placebo."))
      .toEqual([]);
    // A follow-up the wording does not show sets nothing aside: the wording's numbers are then all its own.
    expect(codes([entry], "The tremor score halved in 12% on zentarine and 6% on placebo.")).toEqual([]);
    // In another script too.
    expect(codes([{ ...entry, follow_up: "١٢ أسبوعًا" }],
      "على مدى ١٢ أسبوعًا، انخفض الرعاش إلى النصف لدى ٦٪ ممن تناولوا دواءً وهميًا ولدى عدد أكبر ممن تناولوا زنتارين."))
      .toEqual(["numbers[0] group_figure_not_shown"]);
  });

  it("puts beside a number needed to treat the harms over the same follow-up, or that none were found", () => {
    expect(codes([tremor])).toEqual(["numbers[0] harms_missing"]);
    expect(codes([tremor, { ...nausea, follow_up: "6 weeks", nnh: undefined }])).toEqual(["numbers[0] harms_missing"]);
    // The harm entry is matched by its follow-up, folded as the wording is.
    expect(codes([tremor, { ...nausea, follow_up: "12 Weeks" }])).toEqual([]);
    // A harm entry with no number needed to harm still counts: its rates may be the same.
    const sameRates = { ...nausea, option_events: 6, nnh: undefined };
    expect(codes([tremor, sameRates], WORDING.replace("12 of 120 and 6 of 120, a number needed to harm of 20",
      "6 of 120 and 6 of 120"))).toEqual([]);
    expect(codes([{ ...tremor, harms_none_found: true }],
      WORDING.replace(/; nausea.*$/u, "; no harms were found."))).toEqual([]);
    expect(codes([tremor, { ...nausea, harms_none_found: true }])).toEqual(["numbers[1] harms_none_found_without_nnt"]);
    // A benefit that fewer people should have, such as fewer relapses, is not its own harm entry.
    const relapse: AtlasNumber = {
      outcome: "relapse", better: "fewer", option: "zentarine", option_events: 10, option_total: 100,
      comparator: "placebo", comparator_events: 20, comparator_total: 100, follow_up: "12 weeks", nnt: 10
    };
    const relapses = "Over 12 weeks, 10 of 100 on zentarine relapsed against 20 of 100 on placebo, a number needed " +
      "to treat of 10.";
    expect(codes([relapse], relapses)).toEqual(["numbers[0] harms_missing"]);
    expect(codes([relapse, nausea], `${relapses} Nausea affected 12 of 120 and 6 of 120, a number needed to harm of ` +
      "20.")).toEqual([]);
    // A number whose counts make it one needed to harm is not asked for harms: its own problem changes it first.
    const worse = { ...tremor, option_events: 18, comparator_events: 30 };
    expect(codes([worse], WORDING.replace("30 of 120 adults on zentarine and 18 of 120",
      "18 of 120 adults on zentarine and 30 of 120"))).toEqual(["numbers[0] wrong_direction"]);
  });
});

describe("the privacy screen on the texts the Atlas would store", () => {
  it("passes study summaries and names each field that fails, with every rule it breaks", () => {
    expect(screenAtlasTexts({
      wording: "In one trial (doi:10.0000/synthetic-a; PMID 40123456), tremor halved: odds ratio 1.23 (1.05-1.44), " +
        "2015-2020, and it's the only trial.",
      appliesTo: "Adults with Velmor syndrome",
      note: undefined
    })).toEqual([]);
    expect(screenAtlasTexts({
      wording: "I was diagnosed with Velmor syndrome and my doctor tried zentarine.",
      note: "Write to someone@example.org about it.",
      rationale: "The trials differ in dose: see ARF-0142.",
      topicLabel: "Velmor syndrome"
    })).toEqual([
      { field: "wording", reasonCode: "personal_narrative" },
      { field: "note", reasonCode: "direct_identifier" },
      { field: "rationale", reasonCode: "card_reference" }
    ]);
    expect(withoutStudyForms("PMID 40123456 and NCT01234567, odds ratio 1.23")).toBe("SOURCE and SOURCE, odds ratio N");
  });

  it("refuses ARF- followed by digits in any case, width, dash or script of digits", () => {
    for (const text of [
      "ARF-0142", "as card arf-12 showed", "(Arf-0001)", "ＡＲＦ－０１４２", "ARF‑142", "ARF – 142",
      "ARF-١٤٢", "AR​F-0142", "AR­F-0142"
    ]) {
      expect(containsCardReference(text), text).toBe(true);
    }
    for (const text of ["ARF6 inhibitors", "ARF stands for acute renal failure", "ARF-", "F-1007", "scarf - wool"]) {
      expect(containsCardReference(text), text).toBe(false);
    }
    // An invisible character is also markup to the lesson screen.
    expect(screenAtlasTexts({ wording: "See AR​F-0142." })).toEqual([
      { field: "wording", reasonCode: "control_or_markup" },
      { field: "wording", reasonCode: "card_reference" }
    ]);
  });
});

describe("the exact re-check key", () => {
  it("sets aside Unicode compatibility form, case, spacing and invisible characters", () => {
    const key = atlasWordingKey(QUESTION, CLAIM);
    expect(key).toMatch(/^[a-f0-9]{64}$/u);
    for (const [question, claim] of [
      [QUESTION.toUpperCase(), CLAIM.toLowerCase()],
      [`  ${QUESTION.replace(/ /gu, " \t ")}\n`, CLAIM.replace(/ /gu, "   ")],
      [QUESTION.replace("zentarine", "ｚｅｎｔａｒｉｎｅ"),
        CLAIM.replace("trial", "tri­al").replace("halved", "hal​ved")],
      [QUESTION.replace("Velmor", "Vel⁠mor"), CLAIM.replace("Velmor", "Vel‍mor")]
    ]) {
      expect(atlasWordingKey(question!, claim!)).toBe(key);
    }
    // A ligature reads as its letters.
    expect(atlasWordingKey("ﬁndings", "x")).toBe(atlasWordingKey("findings", "x"));
    expect(normalizedFindingsText(" A​  b­ ")).toBe("a b");
  });

  it("differs for a different question or claim", () => {
    const key = atlasWordingKey(QUESTION, CLAIM);
    expect(atlasWordingKey(QUESTION, `${CLAIM} At a lower dose.`)).not.toBe(key);
    expect(atlasWordingKey(`${QUESTION} In children?`, CLAIM)).not.toBe(key);
    // The parts stay apart: moving text between them changes the key.
    expect(atlasWordingKey("a b", "c")).not.toBe(atlasWordingKey("a", "b c"));
  });
});

describe("links between findings", () => {
  const state: AtlasLinkState = {
    findings: [
      { number: "F-1001", entryKind: "finding", withdrawn: false },
      { number: "F-1002", entryKind: "finding", withdrawn: false },
      { number: "F-1003", entryKind: "lead", withdrawn: false },
      { number: "F-1004", entryKind: "finding", withdrawn: true },
      { number: "F-1005", entryKind: "finding", withdrawn: false },
      { number: "F-1006", entryKind: "finding", withdrawn: false }
    ],
    links: [
      { from: "F-1005", relation: "same_as", to: "F-1006", withdrawn: false },
      { from: "F-1001", relation: "narrows", to: "F-1006", withdrawn: true }
    ]
  };
  const problems = (link: AtlasLinkRequest, at: AtlasLinkState = state) =>
    atlasLinkProblems(link, at).map(({ code }) => code);

  it("accepts a link between two current findings", () => {
    expect(problems({ from: "F-1001", relation: "contradicts", to: "F-1002", disagreement: "dose" })).toEqual([]);
    expect(problems({ from: "f-1001", relation: "same_as", to: " F-1002 " })).toEqual([]);
    expect(problems({ from: "F-1001", relation: "replaces", to: "F-1003" })).toEqual([]);
  });

  it("needs both findings, two of them, neither withdrawn", () => {
    expect(problems({ from: "F-1001", relation: "same_as", to: "F-9999" })).toEqual(["finding_missing"]);
    expect(problems({ from: "F-1001", relation: "same_as", to: "f-1001" })).toEqual(["same_finding"]);
    expect(problems({ from: "F-1004", relation: "narrows", to: "F-1001" })).toEqual(["finding_withdrawn"]);
  });

  it("keeps leads out of links except as the older side of replaces", () => {
    for (const relation of ["same_as", "narrows"] as const) {
      expect(problems({ from: "F-1003", relation, to: "F-1001" })).toEqual(["lead_in_link"]);
      expect(problems({ from: "F-1001", relation, to: "F-1003" })).toEqual(["lead_in_link"]);
    }
    expect(problems({ from: "F-1001", relation: "contradicts", to: "F-1003", disagreement: "population" }))
      .toEqual(["lead_in_link"]);
    expect(problems({ from: "F-1003", relation: "replaces", to: "F-1001" })).toEqual(["lead_in_link"]);
  });

  it("names a disagreement exactly for contradicts", () => {
    expect(problems({ from: "F-1001", relation: "contradicts", to: "F-1002" })).toEqual(["disagreement_missing"]);
    expect(problems({ from: "F-1001", relation: "same_as", to: "F-1002", disagreement: "dose" }))
      .toEqual(["disagreement_not_allowed"]);
  });

  it("gives a pair one relation, and does not record a withdrawn link again", () => {
    expect(problems({ from: "F-1006", relation: "narrows", to: "F-1005" })).toEqual(["pair_already_linked"]);
    expect(problems({ from: "F-1005", relation: "same_as", to: "F-1006" })).toEqual(["pair_already_linked"]);
    expect(problems({ from: "F-1001", relation: "narrows", to: "F-1006" })).toEqual(["link_stored_before"]);
    // The withdrawn link no longer stands, so another relation, or the other direction, can be recorded.
    expect(problems({ from: "F-1006", relation: "narrows", to: "F-1001" })).toEqual([]);
    expect(problems({ from: "F-1001", relation: "contradicts", to: "F-1006", disagreement: "outcome" })).toEqual([]);
  });

  it("makes no cycle of replaces links", () => {
    const chain: AtlasLinkState = {
      findings: state.findings,
      links: [
        { from: "F-1001", relation: "replaces", to: "F-1002", withdrawn: false },
        { from: "F-1002", relation: "replaces", to: "F-1005", withdrawn: false }
      ]
    };
    expect(problems({ from: "F-1005", relation: "replaces", to: "F-1001" }, chain)).toEqual(["replaces_cycle"]);
    expect(problems({ from: "F-1006", relation: "replaces", to: "F-1001" }, chain)).toEqual([]);
    const broken: AtlasLinkState = {
      findings: state.findings,
      links: [chain.links[0]!, { ...chain.links[1]!, withdrawn: true }]
    };
    expect(problems({ from: "F-1005", relation: "replaces", to: "F-1001" }, broken)).toEqual([]);
  });

  it("withdraws only a link that stands", () => {
    expect(problems({ from: "F-1006", relation: "unlink", to: "F-1005" })).toEqual([]);
    expect(problems({ from: "F-1001", relation: "unlink", to: "F-1006" })).toEqual(["link_missing"]);
    expect(problems({ from: "F-1001", relation: "unlink", to: "F-1002", disagreement: "dose" }))
      .toEqual(["link_missing", "disagreement_not_allowed"]);
    // A withdrawn finding's link can still be withdrawn.
    const withdrawn: AtlasLinkState = {
      findings: state.findings,
      links: [{ from: "F-1004", relation: "contradicts", to: "F-1001", withdrawn: false }]
    };
    expect(problems({ from: "F-1001", relation: "unlink", to: "F-1004" }, withdrawn)).toEqual([]);
  });
});
