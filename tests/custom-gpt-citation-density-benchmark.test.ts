import { describe, expect, it } from "vitest";

const claims = [
  "Supervised strengthening improved function modestly over usual care",
  "The average pain improvement was smaller than many patients would consider substantial",
  "Targeted tendon-loading programs produced different outcomes from generic exercise advice",
  "Aquatic exercise reduced joint loading during training",
  "That unloading may make early adherence easier for some participants",
  "Repeated steroid injections were associated with shorter relief in some reports",
  "A single injection sometimes provided temporary symptom relief",
  "Postoperative rehabilitation addressed a different treatment stage from surgery-avoidance exercise",
  "Progressive walking programs varied in pace and starting tolerance",
  "Programs with explicit load-management education reported fewer avoidable flares",
  "The difference may partly reflect supervision and adherence rather than exercise selection alone",
  "Programs that were not described could not support conclusions about exercise as a whole",
  "Replacement surgery produced larger average functional gains in advanced disease",
  "Some participants assigned to conservative care later chose surgery",
  "Persistent pain remained possible after replacement",
  "The apparent advantage may not transfer to people with milder disease",
  "Outside-of-hip tendon pain responded differently from joint osteoarthritis",
  "Aggressive compressive stretching aggravated symptoms in some tendon-focused reports",
  "Sleep-position changes reduced compression without constituting a strengthening program",
  "The combined evidence suggests that diagnosis and disease stage modify which program is useful",
  "Dietary elimination reports described variable adherence and uncertain causality",
  "Regenerative injection outcomes varied across preparation and follow-up",
  "Creator claims of cartilage regrowth were not established by symptom improvement alone",
  "A missing matched study did not make adjacent community observations false",
];

const sourceSets = [
  [1], [1], [2], [3], [3, 4], [4], [5], [5],
  [6], [7], [7, 8], [8], [9], [9], [10], [10, 11],
  [11], [12], [1], [2, 3], [4], [5], [6], [7],
];
const inferred = new Set([4, 10, 15, 19]);
const sourceUrl = (id: number) => `https://example.invalid/source-${id}`;

function visibleWords(text: string): number {
  return (text
    .replace(/\]\([^)]*\)/gu, "]")
    .replace(/[\[\]()*_`#>]/gu, " ")
    .match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []).length;
}

function links(text: string): string[] {
  return [...text.matchAll(/\]\(([^)]+)\)/gu)].map((match) => match[1] ?? "");
}

function renderVerbose(count: number): string {
  return claims.slice(0, count).map((claim, index) => {
    const linked = sourceSets[index]!.map((id) =>
      `[Source ${id}](${sourceUrl(id)})`
    ).join(" and ");
    const note = inferred.has(index)
      ? `This is an inference based on ${linked}, not a directly tested conclusion.`
      : `This claim is supported by ${linked}.`;
    return `${claim}. ${note}`;
  }).join("\n\n");
}

function renderCompact(count: number): string {
  return claims.slice(0, count).map((claim, index) => {
    const sources = sourceSets[index]!;
    if (!inferred.has(index)) return `[${claim}](${sourceUrl(sources[0]!)}).`;
    const basis = sources.map((id, sourceIndex) => sourceIndex === 0
      ? `[inferred](${sourceUrl(id)})`
      : `[basis ${sourceIndex + 1}](${sourceUrl(id)})`
    ).join(", ");
    return `${claim} (${basis}).`;
  }).join("\n\n");
}

function renderGrouped(count: number): string {
  const paragraphs: string[] = [];
  for (let start = 0; start < count; start += 3) {
    const group = claims.slice(start, Math.min(start + 3, count));
    const ids = [...new Set(group.flatMap((_, offset) => sourceSets[start + offset]!))];
    paragraphs.push(`${group.map((claim) => `${claim}.`).join(" ")} ${
      ids.map((id) => `[${id}](${sourceUrl(id)})`).join(" ")
    }`);
  }
  return paragraphs.join("\n\n");
}

function ambiguousGroupedClaims(count: number): number {
  let ambiguous = 0;
  for (let start = 0; start < count; start += 3) {
    const groupCount = Math.min(3, count - start);
    const ids = new Set(Array.from({ length: groupCount }, (_, offset) =>
      sourceSets[start + offset]
    ).flat());
    if (groupCount > 1 && ids.size > 1) ambiguous += groupCount;
  }
  return ambiguous;
}

function metrics(count: number, output: string) {
  const base = claims.slice(0, count).map((claim) => `${claim}.`).join("\n\n");
  const outputLinks = links(output);
  const added = visibleWords(output) - visibleWords(base);
  return {
    links: outputLinks.length,
    visibleWords: visibleWords(output),
    citationWordsAdded: added,
    citationOverheadPercent: Math.round((added / visibleWords(base)) * 100),
  };
}

describe("compact citation-density benchmark", () => {
  it.each([
    ["short", 8, 9, 141, 65, 86, 79, 3, 4, 5, 81, 5, 7, 6],
    ["medium", 16, 19, 296, 139, 89, 166, 9, 6, 12, 169, 12, 8, 15],
    ["comparison", 24, 28, 441, 204, 86, 249, 12, 5, 20, 257, 20, 8, 24],
  ] as const)(
    "%s answer keeps link count while removing citation narration",
    (_name, count, expectedLinks, verboseWords, verboseAdded, verboseOverhead,
      compactWords, compactAdded, compactOverhead, groupedLinks, groupedWords,
      groupedAdded, groupedOverhead, groupedAmbiguity) => {
      expect(metrics(count, renderVerbose(count))).toEqual({
        links: expectedLinks,
        visibleWords: verboseWords,
        citationWordsAdded: verboseAdded,
        citationOverheadPercent: verboseOverhead,
      });
      expect(metrics(count, renderCompact(count))).toEqual({
        links: expectedLinks,
        visibleWords: compactWords,
        citationWordsAdded: compactAdded,
        citationOverheadPercent: compactOverhead,
      });
      expect(metrics(count, renderGrouped(count))).toEqual({
        links: groupedLinks,
        visibleWords: groupedWords,
        citationWordsAdded: groupedAdded,
        citationOverheadPercent: groupedOverhead,
      });
      expect(ambiguousGroupedClaims(count)).toBe(groupedAmbiguity);
    },
  );

  it("uses synthetic, non-routable source URLs only", () => {
    expect(links(renderCompact(24)).every((link) =>
      link.startsWith("https://example.invalid/source-")
    )).toBe(true);
  });
});
