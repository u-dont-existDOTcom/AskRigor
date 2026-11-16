import { laterFindingsCardSchema, findingsCardDigest, withoutYouTubeData } from "../../apps/research-mcp/src/findings/card.js";
import type { FindingsRecord } from "../../apps/research-mcp/src/findings/service.js";

// All video IDs, studies and claims in these fixtures are invented.
export const VIDEO = "nvTestA_001";
export const OTHER_VIDEO = "nvTestB_002";
export const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
export const OTHER_WATCH = `https://www.youtube.com/watch?v=${OTHER_VIDEO}`;
export const DOI = "10.0000/synthetic-named-video-study";
export const TARGET = "How does the invented velmorase molecule break down?";
export const QUOTE = "The invented study describes velmorase breaking down in water.";
export const NOW = new Date("2026-11-15T01:00:00.000Z");
export const SECRET = "named-videos-synthetic-test-secret-0123456789";
export const ACCOUNT_KEY = "b".repeat(64);

export function videoCard(links?: string[]) {
  return laterFindingsCardSchema.parse({
    question: TARGET, usual_answer: "Velmorase remains intact in water.",
    findings: [{ claim: QUOTE, certainty: "low", applies_to: "Invented velmorase molecules in water",
      answer_quote: QUOTE, sources: [DOI], why_not_usual: "The invented study describes a different reaction.",
      tags: ["full_text_read"], what_would_change_it: "An invented replication showing no reaction.",
      kind: "correction", subject: "velmorase", subject_type: "product", direction: "descriptive",
      ...(links === undefined ? {} : { named_videos: links }),
    }],
    public_value: { scope: "public", who_else: "People studying invented velmorase chemistry",
      what_it_changes: "It describes the reaction in the invented study." },
    topic: { key: "invented-velmorase", label: "Invented velmorase" }, open_leads: [],
  });
}

export function videoRecord(links = [WATCH]): FindingsRecord {
  const card = videoCard(links);
  const stored = withoutYouTubeData(card, new Set(), {
    namedVideos: new Map([[0, new Set([VIDEO, OTHER_VIDEO])]]),
  });
  return { schema: "askrigor.findings-card.v1", card: stored.card, card_sha256: findingsCardDigest(card),
    stamp: { saved_at: NOW.toISOString(), askrigor_version: "0.1.0", askrigor_build: "0123abc", protocols: [],
      tool_catalog_sha256: "c".repeat(64), surface: "/mcp", research: { finalized_at: NOW.toISOString() } } };
}
