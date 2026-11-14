import { describe, expect, it } from "vitest";

import { ATLAS_NEAR, nearAtlasMatches, nearWordsOf } from "../apps/research-mcp/src/atlas/near-match.js";
import { nearIndex, shownFinding } from "./helpers/askrigor-holds-fixture.js";

// Invented findings, each with what it is about: its subject and its topic's label.
const about = (subject: string | null, topic: string | null, number: number, claim = "An invented finding.") =>
  shownFinding(claim, { publicationNumber: `P-${88000 + number}`, subject,
    topic: topic === null ? null : { key: `topic-${number}`, label: topic } });
const numbers = (matches: ReturnType<typeof nearAtlasMatches>) => matches.map(({ finding }) => finding.publicationNumber);

describe("near Atlas findings (the owner, 14 Nov 2026)", () => {
  it("finds the sweet potato finding for a question about peeling sweet potatoes", () => {
    const index = nearIndex(
      about("Sweetpotato fungal spoilage", "Sweetpotato rot and food safety", 1,
        "Tissue near infection darkened within 10-30 seconds on cutting."),
      about("Tirzepatide", "Obstructive sleep apnea", 2));
    expect(nearAtlasMatches(index, "How do I peel sweet potatoes?")).toEqual([
      { finding: index.entries[0]!.finding, words: ["sweet", "potatoes"] },
    ]);
    // The same question in another language shares no word with an English finding.
    expect(nearAtlasMatches(index, "Comment éplucher les patates douces ?")).toEqual([]);
  });

  it("needs the two shared words in the same part: both in the subject, or both in the topic's label", () => {
    expect(numbers(nearAtlasMatches(nearIndex(about("amber birch", "other things", 1)), "amber birch"))).toEqual(["P-88001"]);
    expect(numbers(nearAtlasMatches(nearIndex(about("other things", "amber birch", 1)), "amber birch"))).toEqual(["P-88001"]);
    expect(nearAtlasMatches(nearIndex(about("amber things", "birch things", 1)), "amber birch")).toEqual([]);
  });

  it("does not match the sentences of a finding: its wording, question, whom it holds for, research or sources", () => {
    const index = nearIndex(shownFinding("Amber birch helps.", {
      question: "Does amber birch help?", appliesTo: "Adults who take amber birch", usualAnswer: "amber birch",
      whyNotUsual: "amber birch", whatWouldChangeIt: "amber birch", subject: "mint", topic: { key: "mint", label: "Mint" },
      sources: [{ identifiers: [], title: "Amber birch", year: null }],
      searches: [{ database: "pubmed", query: "amber birch", dateRange: null }],
    }));
    expect(nearAtlasMatches(index, "amber birch")).toEqual([]);
    // The trial of 14 Nov 2026: everyday words of a question met the findings' sentences by chance.
    expect(nearAtlasMatches(nearIndex(about("Tinnitus", "Hearing", 1, "What people say about it.")),
      "What can I do about hearing loss?")).toEqual([]);
  });

  it("counts a word that at most a tenth of the findings hold in that part, and always when at most three do", () => {
    // Three of three hold both words: still counted.
    expect(nearAtlasMatches(nearIndex(...[1, 2, 3].map((n) => about("common mint", null, n))), "common mint"))
      .toHaveLength(3);
    // Four of 40 hold "common" (a tenth) and one holds "mint": both count.
    const tenth = nearIndex(about("common mint", null, 1), ...[2, 3, 4].map((n) => about("common thing", null, n)),
      ...Array.from({ length: 36 }, (_, i) => about("unrelated matter", null, 5 + i)));
    expect(tenth.entries).toHaveLength(40);
    expect(nearAtlasMatches(tenth, "common mint")).toEqual([
      { finding: tenth.entries[0]!.finding, words: ["mint", "common"] },
    ]);
    // Four of 39 is more than a tenth and more than three: "common" does not count, so one word is left.
    const over = nearIndex(about("common mint", null, 1), ...[2, 3, 4].map((n) => about("common thing", null, n)),
      ...Array.from({ length: 35 }, (_, i) => about("unrelated matter", null, 5 + i)));
    expect(over.entries).toHaveLength(39);
    expect(nearAtlasMatches(over, "common mint")).toEqual([]);
  });

  it("finds a finding whose subject is one word when the question holds that word", () => {
    const index = nearIndex(about("Tirzepatide", "Obstructive sleep apnea", 1), about("Tirzepatide dosing", null, 2),
      about("Probiotics", null, 3), about("DMT", null, 4), about(null, "Creatine", 5));
    expect(nearAtlasMatches(index, "What are the side effects of tirzepatide?")).toEqual([
      { finding: index.entries[0]!.finding, words: ["tirzepatide"] },
    ]);
    // A plural subject is found by its singular and a singular one by a plural.
    expect(numbers(nearAtlasMatches(index, "Is a probiotic worth taking?"))).toEqual(["P-88003"]);
    expect(numbers(nearAtlasMatches(nearIndex(about("Probiotic", null, 1)), "Are probiotics worth taking?")))
      .toEqual(["P-88001"]);
    // Not a subject of two words by one of them, a subject under four characters, or a one-word topic.
    expect(nearAtlasMatches(index, "tirzepatide dosing")[1]?.finding.publicationNumber).toBe("P-88001");
    expect(numbers(nearAtlasMatches(index, "What is dosing?"))).toEqual([]);
    expect(nearAtlasMatches(index, "Is DMT legal?")).toEqual([]);
    expect(nearAtlasMatches(index, "Is creatine safe?")).toEqual([]);
    // Many findings may share a one-word subject: the question names it, so the newest three come.
    const many = nearIndex(...Array.from({ length: 30 }, (_, i) => about("Creatine", null, 1 + i)));
    expect(numbers(nearAtlasMatches(many, "Is creatine safe?"))).toEqual(["P-88001", "P-88002", "P-88003"]);
  });

  it.each([
    ["potatoes", "sweetpotato spoilage"], ["studies", "blue study"], ["glass", "blue glass"],
  ])("finds the question's %s in a subject that says %s", (word, subject) => {
    const index = nearIndex(about(`blue ${subject}`, null, 1));
    expect(nearAtlasMatches(index, `blue ${word}`)).toEqual([
      { finding: index.entries[0]!.finding, words: ["blue", word] },
    ]);
  });

  it("does not cut glass to glas, and does not count short words or tokens without a letter", () => {
    expect(nearAtlasMatches(nearIndex(about("blue glas gla", null, 1)), "blue glass")).toEqual([]);
    expect(nearAtlasMatches(nearIndex(about("mint cat 12345678 🥔🥔🥔🥔", null, 1)), "mint cat 12345678 🥔🥔🥔🥔"))
      .toEqual([]);
  });

  it("orders by how many words are shared, then by how rare they are, then as the index holds them", () => {
    const index = nearIndex(about("alpha bravo", null, 1), about("cider delta", null, 2), about("alpha bravo echo", null, 3),
      about("alpha bravo", null, 4), about("cider delta", null, 5), about("Foxtrot", null, 6));
    expect(numbers(nearAtlasMatches(index, "alpha bravo cider delta echo foxtrot", 10)))
      .toEqual(["P-88003", "P-88002", "P-88005", "P-88001", "P-88004", "P-88006"]);
    expect(nearAtlasMatches(index, "alpha bravo echo")[0]!.words).toEqual(["echo", "alpha", "bravo"]);
  });

  it("uses rarer topic words on a subject/topic count tie so the newest finding comes first", () => {
    const newest = about("alpha bravo", "cider delta", 1);
    const index = nearIndex(newest, about("alpha bravo", null, 2), about("alpha bravo", null, 3),
      about("ember frost", null, 4), about("green hazel", null, 5), about("ivory juniper", null, 6));
    const text = "alpha bravo cider delta ember frost green hazel ivory juniper";
    expect(nearAtlasMatches(index, text)[0]).toEqual({ finding: newest, words: ["cider", "delta"] });
    expect(numbers(nearAtlasMatches(index, text))).toEqual(["P-88001", "P-88004", "P-88005"]);
  });

  it("hands over at most three by default, or as many as asked", () => {
    const index = nearIndex(about("amber birch", null, 1), about("cider delta", null, 2), about("ember frost", null, 3),
      about("green hazel", null, 4));
    const text = "amber birch cider delta ember frost green hazel";
    const all = nearAtlasMatches(index, text, 10);
    expect(all).toHaveLength(4);
    expect(ATLAS_NEAR.matches).toBe(3);
    expect(nearAtlasMatches(index, text)).toEqual(all.slice(0, 3));
    expect(nearAtlasMatches(index, text, 1)).toEqual(all.slice(0, 1));
  });

  it("gives none for an empty index, a text with no telling word, a limit of 0, or findings that say nothing of what they are about", () => {
    expect(nearAtlasMatches(nearIndex(), "blue mint")).toEqual([]);
    expect(nearAtlasMatches(nearIndex(about("blue mint", null, 1)), "I am 1234")).toEqual([]);
    expect(nearAtlasMatches(nearIndex(about("blue mint", null, 1)), "blue mint", 0)).toEqual([]);
    expect(nearAtlasMatches(nearIndex(about(null, null, 1, "blue mint")), "blue mint")).toEqual([]);
  });

  it("reads a text in a script without spaces without throwing", () => {
    const text = "红薯去皮方法 空气变色部分";
    const index = nearIndex(about(text, null, 1));
    expect(() => nearAtlasMatches(index, text)).not.toThrow();
    expect(nearAtlasMatches(index, text)[0]?.words).toEqual(["红薯去皮方法", "空气变色部分"]);
  });
});

describe("nearWordsOf", () => {
  it("folds case and accents, removes short and non-letter tokens, and deduplicates in order", () => {
    expect(nearWordsOf("I am CAT MÍNT mint; 1234 🥔🥔🥔🥔 blue a123 𐐀𐐀 𐐀𐐀𐐀𐐀"))
      .toEqual(["mint", "blue", "a123", "𐐨𐐨𐐨𐐨"]);
  });

  it("retains the question's plural spelling", () => {
    expect(nearWordsOf("potatoes studies glass")).toEqual(["potatoes", "studies", "glass"]);
  });

  it("caps distinct words in their original order", () => {
    const words = Array.from({ length: ATLAS_NEAR.words + 2 }, (_, i) => `token${i}`);
    expect(nearWordsOf([words[0], ...words].join(" "))).toEqual(words.slice(0, ATLAS_NEAR.words));
  });
});
