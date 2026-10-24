import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  canonicalJson,
  findingsCardDigest,
  findingsCardFingerprint,
  findingsCardSchema,
  isSafeReportedModel,
  isSourceIdentifier,
  screenFindingsCard,
  withoutYouTubeData,
} from "../apps/research-mcp/src/findings/card.js";
import { saveResearchFindingsInputSchema } from "../apps/research-mcp/src/findings/contracts.js";
import { finalizeResearchPublishedInputSchema } from "../apps/research-mcp/src/research-finalization-gate.js";
import { CARD, parsedCard } from "./helpers/findings-fixtures.js";

describe("findings card", () => {
  it("has one canonical text and digest, whatever the key order, spacing or omitted defaults", () => {
    expect(canonicalJson({ b: [2, { d: 1, c: undefined, a: "x" }], a: null })).toBe('{"a":null,"b":[2,{"a":"x","d":1}]}');
    const reordered = findingsCardSchema.parse({
      open_leads: CARD.open_leads,
      topic: Object.fromEntries(Object.entries(CARD.topic).reverse()),
      public_value: Object.fromEntries(Object.entries(CARD.public_value).reverse()),
      findings: CARD.findings.map((finding) => Object.fromEntries(Object.entries(finding).reverse())),
      usual_answer: `  ${CARD.usual_answer}  `,
      question: CARD.question,
    });
    expect(findingsCardDigest(reordered)).toBe(findingsCardDigest(parsedCard()));
    expect(findingsCardDigest(parsedCard())).toBe(createHash("sha256").update(canonicalJson(parsedCard())).digest("hex"));
    // Tags and open leads default to empty lists, so leaving them out and sending none are one card.
    const bare = { ...CARD, open_leads: undefined, findings: [{ ...CARD.findings[0], tags: undefined }] };
    const empty = { ...CARD, open_leads: [], findings: [{ ...CARD.findings[0], tags: [] }] };
    expect(findingsCardDigest(findingsCardSchema.parse(bare))).toBe(findingsCardDigest(findingsCardSchema.parse(empty)));
    expect(findingsCardDigest(findingsCardSchema.parse({ ...CARD, question: `${CARD.question} Really?` })))
      .not.toBe(findingsCardDigest(parsedCard()));
  });

  it("fingerprints the question and claims, not their case, spacing or order", () => {
    const second = { ...CARD.findings[0], claim: "Walking programs helped some people delay surgery." };
    const card = findingsCardSchema.parse({ ...CARD, findings: [CARD.findings[0], second] });
    const variant = findingsCardSchema.parse({
      ...CARD,
      question: CARD.question.toUpperCase().replace(/ /gu, "   "),
      usual_answer: "Something else entirely.",
      findings: [{ ...second, certainty: "low" }, { ...CARD.findings[0], sources: ["10.1002/art.41142"] }],
    });
    expect(findingsCardFingerprint(variant)).toBe(findingsCardFingerprint(card));
    expect(findingsCardFingerprint(parsedCard())).not.toBe(findingsCardFingerprint(card));
  });

  it("passes study summaries through the lesson privacy screen", () => {
    // Study identifiers and links, statistics, year ranges and contractions are what findings are made of.
    expect(screenFindingsCard(parsedCard())).toEqual([]);
    for (const text of [
      "See PMID 31999999, PMC10518852 and NCT01234567 (doi:10.1016/S0140-6736(20)30183-5).",
      "Read https://doi.org/10.1016/S0140-6736(20)30183-5, https://pubmed.ncbi.nlm.nih.gov/31999999/ and " +
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/.",
      "Watch [this talk](https://www.youtube.com/watch?v=aaaaaaaaaaa&t=95s) or https://youtu.be/aaaaaaaaaaa.",
      "The trial registry entry is https://clinicaltrials.gov/study/NCT01234567 and " +
        "[its review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10518852/).",
      "Odds ratio 1.23 (1.05-1.44); mean difference -0.5 (-0.9 to -0.1); p = 0.003; 2015 - 2020.",
      `"${"The review's authors didn't find that patients' pain changed, ".repeat(6)}"`,
    ]) {
      expect(screenFindingsCard(findingsCardSchema.parse({ ...CARD, open_leads: [text.slice(0, 200)] })))
        .toEqual([]);
      expect(screenFindingsCard(findingsCardSchema.parse({
        ...CARD, findings: [{ ...CARD.findings[0], answer_quote: text }],
      }))).toEqual([]);
    }
  });

  it("still rejects personal and identifying details, naming the field", () => {
    const withLead = (lead: string) => screenFindingsCard(findingsCardSchema.parse({ ...CARD, open_leads: [lead] }));
    for (const [lead, reasonCode] of [
      ["Call the clinic on 555-123-4567 first.", "direct_identifier"],
      ["Call +44 20 7946 0958 first.", "direct_identifier"],
      ["Their number is 01.23.45.67.89.", "direct_identifier"],
      ["Write to someone@example.org about it.", "direct_identifier"],
      ["I was diagnosed with hip osteoarthritis last year.", "personal_narrative"],
      ["Thread: https://www.reddit.com/r/HipOA/comments/abc123/x/", "unsafe_url"],
      ["See [the thread](https://www.reddit.com/r/HipOA/comments/abc123/x/).", "control_or_markup"],
      ["See [this](https://doi.org/10.1002/art.41142?utm_source=x).", "control_or_markup"],
      ["Line one\nline two", "control_or_markup"],
      ["Use sk-abcdefghijklmnopqrstuvwxyz to pay.", "secret_like_data"],
    ] as const) {
      expect(withLead(lead)).toEqual([{ field: "open_leads[0]", reasonCode }]);
    }
    // A stated limit, not a goal: the screen reads English first-person words, so a Roman numeral near a
    // medical word trips it and the field is reworded.
    expect(withLead("Type I diabetes treatment trials")).toEqual([{ field: "open_leads[0]", reasonCode: "personal_narrative" }]);
    expect(screenFindingsCard(findingsCardSchema.parse({
      ...CARD, findings: [{ ...CARD.findings[0], sources: ["10.1002/art.41142", "my own notes"] }],
    }))).toEqual([{ field: "findings[0].sources[1]", reasonCode: "not_a_source_identifier" }]);
  });

  it("checks sources and the reported model by their form", () => {
    for (const source of ["10.1002/art.41142", "https://doi.org/10.1002/ART.41142", "doi: 10.1002/art.41142", "PMID: 31999999",
      "31999999", "PMC10518852", "pmcid: PMC10518852", "NCT01234567", "aaaaaaaaaaa", "dQw4w9WgXcQ"]) {
      expect(isSourceIdentifier(source)).toBe(true);
    }
    for (const source of ["my notes", "https://example.org/study", "PMID 1234567890", "NCT0123", "dQw4w9WgXc"]) {
      expect(isSourceIdentifier(source)).toBe(false);
    }
    for (const model of ["Example Model 2026-08-06", "vendor/example-model-20250514", "Example (large) 4.1+"]) {
      expect(isSafeReportedModel(model)).toBe(true);
    }
    for (const model of ["someone@example.org", "https://example.org/model", "sk-abcdefghijklmnopqrstuvwxyz", "<b>model</b>", " x"]) {
      expect(isSafeReportedModel(model)).toBe(false);
    }
  });
});

describe("findings card as the library stores it", () => {
  // Owner answer 170 (24 Oct): no finding drawn from YouTube comments is stored until YouTube confirms it may.
  it("leaves out a finding drawn from YouTube comments, and keeps no YouTube video IDs or links in the rest", () => {
    const card = findingsCardSchema.parse({
      ...CARD,
      findings: [{
        ...CARD.findings[0],
        claim: "Viewers of [a physiotherapist's talk](https://www.youtube.com/watch?v=aaaaaaaaaaa) and of " +
          "https://youtu.be/bbbbbbbbbbb?t=42 reported less pain after eight weeks.",
        sources: ["10.1002/art.41142", "aaaaaaaaaaa", "bbbbbbbbbbb"]
      }, {
        ...CARD.findings[0],
        why_not_usual: "Quick answers skip [the trial's talk](https://youtu.be/ccccccccccc) of its methods."
      }]
    });
    const stored = withoutYouTubeData(card);
    expect(stored).toMatchObject({ omitted: true, kept: [1], findingsLeftOut: 1 });
    expect(stored.card.findings).toHaveLength(1);
    expect(stored.card.findings[0]).toMatchObject({ claim: CARD.findings[0]!.claim, sources: ["10.1002/art.41142"],
      why_not_usual: "Quick answers skip the trial's talk (YouTube video) of its methods." });
    expect(JSON.stringify(stored.card)).not.toMatch(/aaaaaaaaaaa|bbbbbbbbbbb|ccccccccccc|youtube\.com|youtu\.be/u);
    // A finding the receipt signs as resting on a comment audit is left out too.
    expect(withoutYouTubeData(card, new Set([1]))).toMatchObject({ kept: [], findingsLeftOut: 2 });
  });

  it("stores a card without YouTube data as it was checked", () => {
    const card = findingsCardSchema.parse({ ...CARD, findings: [{ ...CARD.findings[0], sources: ["10.1002/art.41142"] }] });
    expect(withoutYouTubeData(card)).toEqual({ card, omitted: false, kept: [0], findingsLeftOut: 0 });
  });
});

// Owner answer 156a (2026-10-22): the AI declares on each card who else its findings would help and why, or that they
// are personal only. Whether they would help is the model's declaration; what the server checks is exact.
describe("a findings card's public-value declaration (owner answer 156a)", () => {
  type Node = { description?: string; type?: string; enum?: unknown[]; required?: string[]; properties?: Record<string, Node> };
  const declarationIn = (schema: unknown) => {
    const card = (schema as Node).properties!.findings_card!;
    return { card, declared: card.properties!.public_value! };
  };

  it("is one optional object that every published schema shows with its fields and their descriptions", () => {
    for (const schema of [
      finalizeResearchPublishedInputSchema({ relaxed: true }),
      finalizeResearchPublishedInputSchema({ relaxed: false }),
      z.toJSONSchema(saveResearchFindingsInputSchema, { target: "draft-7", io: "input" })
    ]) {
      const { card, declared } = declarationIn(schema);
      // Optional, so a call from an app whose tool list predates it still parses; the final check asks for it.
      expect(card.required).not.toContain("public_value");
      expect(declared.required).toEqual(["scope"]);
      // One object whose fields ChatGPT's app shows, not a union it would show only as "unknown".
      expect(declared.type).toBe("object");
      expect(Object.keys(declared.properties!)).toEqual(["scope", "who_else", "what_it_changes"]);
      expect(declared.properties!.scope!.enum).toEqual(["public", "personal_only"]);
      expect(declared.description).toBe("Whether these findings would help anyone beyond this person. Findings " +
        "declared personal_only are not saved to AskRigor's findings library or offered for it. When the answer holds " +
        "both kinds, put only the general findings on the card, written without the person, and declare them public.");
      // The owner's four-part test, in the words the model reads.
      expect(declared.properties!.scope!.description).toBe("public when all four hold: other people face it (it is " +
        "about a condition, symptom, test, treatment, supplement, product, food or practice, and holds without this " +
        "person's history); it rests on what the research checked here, not on what this person reported; it could " +
        "change what someone does or believes; and it adds something to well-known guidance. personal_only otherwise, " +
        "as for a cause found only in this person's own past or routine.");
      expect(declared.properties!.who_else!.description).toBe("With scope public: who else faces it, in general terms " +
        "with no personal details, such as adults with hip osteoarthritis weighing surgery.");
      expect(declared.properties!.what_it_changes!.description).toBe("With scope public: what it could change in what " +
        "they do or believe, beyond well-known guidance, such as an effect in absolute numbers, a harm with its basis, " +
        "an overlooked option with real evidence, a correction of a widely repeated claim or a search that found nothing.");
    }
    expect(declarationIn(finalizeResearchPublishedInputSchema({ relaxed: true })).card.description)
      .toContain("with public_value saying whether they would help anyone beyond this person");
  });

  it("adds nothing to a card that does not declare it, so its digest is what it was", () => {
    const { public_value: _declared, ...undeclared } = CARD;
    const parsed = findingsCardSchema.parse(undeclared);
    expect(parsed).not.toHaveProperty("public_value");
    expect(canonicalJson(parsed)).not.toContain("public_value");
    expect(findingsCardDigest(parsed)).not.toBe(findingsCardDigest(parsedCard()));
    // Who the findings would help is not part of the duplicate key: the same question and claims are one card.
    expect(findingsCardFingerprint(parsed)).toBe(findingsCardFingerprint(parsedCard()));
    for (const declared of [{ scope: "everyone" }, { scope: "public", who_else: "" }, { scope: "public", reason: "x" }]) {
      expect(findingsCardSchema.safeParse({ ...CARD, public_value: declared }).success, JSON.stringify(declared)).toBe(false);
    }
    expect(findingsCardSchema.safeParse({ ...CARD, public_value: { scope: "personal_only" } }).success).toBe(true);
  });

  it("screens the declaration's words as it screens the card's other text, whatever the scope", () => {
    const declaring = (public_value: Record<string, string>) =>
      screenFindingsCard(findingsCardSchema.parse({ ...CARD, public_value }));
    expect(declaring(CARD.public_value)).toEqual([]);
    expect(declaring({ ...CARD.public_value, who_else: "I was diagnosed with hip osteoarthritis last year." }))
      .toEqual([{ field: "public_value.who_else", reasonCode: "personal_narrative" }]);
    expect(declaring({ ...CARD.public_value, what_it_changes: "Call the clinic on 555-123-4567 first." }))
      .toEqual([{ field: "public_value.what_it_changes", reasonCode: "direct_identifier" }]);
    expect(declaring({ ...CARD.public_value, what_it_changes: "See [the thread](https://www.reddit.com/r/HipOA/comments/abc123/x/)." }))
      .toEqual([{ field: "public_value.what_it_changes", reasonCode: "control_or_markup" }]);
    expect(declaring({ scope: "personal_only", who_else: "Write to someone@example.org about it." }))
      .toEqual([{ field: "public_value.who_else", reasonCode: "direct_identifier" }]);
    // Study references and statistics are what a declaration may name, as elsewhere on the card.
    expect(declaring({ ...CARD.public_value, what_it_changes: "Pain fell by 0.45 (0.21-0.69) in PMC10518852." })).toEqual([]);
  });

  it("is stored without YouTube video IDs or links, like the rest of the card", () => {
    const card = findingsCardSchema.parse({
      ...CARD,
      public_value: {
        scope: "public",
        who_else: "Viewers of [a physiotherapist's talk](https://www.youtube.com/watch?v=aaaaaaaaaaa) with hip pain",
        what_it_changes: "Shows that https://youtu.be/bbbbbbbbbbb overstates the benefit."
      }
    });
    const { card: stored, omitted } = withoutYouTubeData(card);
    expect(omitted).toBe(true);
    expect(stored.public_value).toEqual({
      scope: "public",
      who_else: "Viewers of a physiotherapist's talk (YouTube video) with hip pain",
      what_it_changes: "Shows that (YouTube video) overstates the benefit."
    });
    expect(withoutYouTubeData(findingsCardSchema.parse({ ...CARD, public_value: { scope: "personal_only" } })).card.public_value)
      .toEqual({ scope: "personal_only" });
  });
});
