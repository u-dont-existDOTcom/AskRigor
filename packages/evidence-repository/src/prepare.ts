import {
  assertNoProhibitedPersistentKeys,
  livingEvidenceContributionSchema,
  type LivingEvidenceContribution,
} from "./contracts.js";
import { sha256, stableJson } from "./hash.js";

export interface PreparedContribution {
  contribution: LivingEvidenceContribution;
  wholeText: string;
  wholeTextBytes: number;
  wholeTextSha256: string;
  payloadSha256: string;
  sectionDigests: Array<{ ordinal: number; sha256: string; bytes: number }>;
}

export function prepareContribution(input: unknown): PreparedContribution {
  assertNoProhibitedPersistentKeys(input);
  const contribution = livingEvidenceContributionSchema.parse(input);
  const wholeText = contribution.analysis.sections.map(({ content }) => content).join("");
  const wholeTextSha256 = sha256(wholeText);
  if (
    contribution.analysis.declaredWholeTextSha256 !== null &&
    contribution.analysis.declaredWholeTextSha256 !== wholeTextSha256
  ) {
    throw new Error("ANALYSIS_WHOLE_TEXT_SHA256_MISMATCH");
  }
  return {
    contribution,
    wholeText,
    wholeTextBytes: Buffer.byteLength(wholeText, "utf8"),
    wholeTextSha256,
    payloadSha256: sha256(stableJson(contribution)),
    sectionDigests: contribution.analysis.sections.map(({ ordinal, content }) => ({
      ordinal,
      sha256: sha256(content),
      bytes: Buffer.byteLength(content, "utf8"),
    })),
  };
}

export function splitMarkdownPreservingBytes(markdown: string): LivingEvidenceContribution["analysis"]["sections"] {
  if (markdown.length === 0) throw new Error("EMPTY_ANALYSIS_DOCUMENT");
  const starts: Array<{ index: number; title: string }> = [];
  let index = 0;
  for (const line of markdown.split("\n")) {
    let markerLength = 0;
    while (markerLength < 6 && line.charCodeAt(markerLength) === 35) markerLength += 1;
    const separator = line[markerLength];
    const title = line.slice(markerLength).trim();
    if (markerLength > 0 && (separator === " " || separator === "\t") && title.length > 0) {
      starts.push({ index, title });
    }
    index += line.length + 1;
  }
  if (starts.length === 0 || starts[0]!.index !== 0) {
    starts.unshift({ index: 0, title: "Preamble" });
  }
  return starts.map((start, ordinal) => {
    const end = starts[ordinal + 1]?.index ?? markdown.length;
    const sectionKeyBase = start.title.toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 170) || "section";
    return {
      ordinal,
      sectionKey: `${String(ordinal).padStart(3, "0")}-${sectionKeyBase}`,
      title: start.title.slice(0, 500),
      content: markdown.slice(start.index, end),
    };
  });
}
