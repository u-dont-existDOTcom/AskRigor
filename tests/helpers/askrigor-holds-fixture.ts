import { searchTextsOf, type AtlasSearchIndex, type ShownFinding } from "../../apps/research-mcp/src/atlas/page-data.js";
import { foldAtlasSearchTexts } from "../../apps/research-mcp/src/atlas/search.js";
import type { HeldAtlasFinding } from "../../apps/research-mcp/src/askrigor-holds.js";

// Invented public findings, with the same folded search fields as loadAtlasSearchIndex.
export function shownFinding(claim: string, extra: Partial<ShownFinding> = {}): ShownFinding {
  return {
    publicationNumber: "P-88001", question: null, usualAnswer: null, links: [], status: { kind: "unreviewed" },
    topic: null, claim, certainty: "low", appliesTo: null, kind: null, subject: null, subjectType: null,
    direction: null, numbers: [], searches: [], sources: [], whyNotUsual: null, whatWouldChangeIt: null,
    verifiedBases: [], savedOn: "2026-11-14", researchCheckedOn: null, askrigorVersion: null,
    contested: [], replacedBy: [], publishedAt: "2026-11-14T12:00:00.000Z", stateChangedAt: "2026-11-14T12:00:00.000Z",
    kept: false, research: [], forumSignal: null, aiReadings: null, challenge: null, ...extra,
  };
}

export function nearIndex(...findings: Array<string | ShownFinding>): AtlasSearchIndex {
  return {
    entries: findings.map((value, i) => {
      // A finding given as a text is about that text: the near match reads a finding's subject and its topic's label.
      const finding = typeof value === "string"
        ? shownFinding(value, { publicationNumber: `P-${88001 + i}`, subject: value }) : value;
      return { finding, texts: foldAtlasSearchTexts(searchTextsOf(finding)) };
    }),
    bytes: 0,
  };
}

export function heldFinding(extra: Partial<HeldAtlasFinding> = {}): HeldAtlasFinding {
  return {
    publication_number: "P-88001", state: "checked", label: "checked", certainty: "low",
    wording: "Cut out sweetpotato parts that turn dark after seconds in air.",
    applies_to: "Fresh sweet potatoes", question: "How do I peel sweet potatoes?",
    page_url: "https://atlas.example/atlas/findings/P-88001", shared_words: ["sweet", "potatoes"], ...extra,
  };
}
