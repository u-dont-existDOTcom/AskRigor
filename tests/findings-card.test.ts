import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  findingsCardDigest,
  findingsCardFingerprint,
  findingsCardSchema,
  isSafeReportedModel,
  isSourceIdentifier,
  screenFindingsCard,
} from "../apps/research-mcp/src/findings/card.js";
import { CARD, parsedCard } from "./helpers/findings-fixtures.js";

describe("findings card", () => {
  it("has one canonical text and digest, whatever the key order, spacing or omitted defaults", () => {
    expect(canonicalJson({ b: [2, { d: 1, c: undefined, a: "x" }], a: null })).toBe('{"a":null,"b":[2,{"a":"x","d":1}]}');
    const reordered = findingsCardSchema.parse({
      open_leads: CARD.open_leads,
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
