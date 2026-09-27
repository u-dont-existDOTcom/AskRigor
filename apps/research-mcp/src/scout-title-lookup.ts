import {
  searchYoutube,
  youtubeLabelsMatch,
  type YoutubeConfig
} from "@askrigor/sources";

/**
 * Exact-title lookup for scout finds that have no usable video ID.
 *
 * Gemini's Google Search results often name a video without showing its watch
 * URL, so the scout reports such finds by title, and sometimes garbles an ID
 * it did propose. One YouTube search per title (100 quota units) recovers the
 * video when a result's title matches the declared one. Among matching titles
 * the declared channel wins; YouTube's metadata stays authoritative for what
 * the video is. Titles beyond the per-call limit are returned unsearched so
 * the model can decide whether they are worth a search.
 */
export const SCOUT_TITLE_LOOKUP_LIMIT = 4;
const LOOKUP_PAGE_SIZE = 10;
const UNKNOWN_CHANNEL = "not described";
// YouTube search snippets HTML-escape titles and channel names.
const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#\d{1,6}|#x[\da-f]{1,6}|[a-z]{2,5});/giu, (entity, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return HTML_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

export interface ScoutTitleLead {
  title: string;
  channel: string;
  why_surfaced?: string;
}

export interface ScoutTitleLookupResult {
  found: Array<{
    video_id: string;
    title: string;
    channel: string;
    declared_title: string;
    why_surfaced?: string;
  }>;
  unresolved: Array<ScoutTitleLead & {
    reason: "no_matching_video" | "search_failed" | "not_searched";
  }>;
}

export async function lookUpScoutTitles(
  leads: readonly ScoutTitleLead[],
  options: {
    config: YoutubeConfig;
    knownVideoIds: ReadonlySet<string>;
    search?: typeof searchYoutube;
    limit?: number;
  }
): Promise<ScoutTitleLookupResult> {
  const search = options.search ?? searchYoutube;
  const limit = options.limit ?? SCOUT_TITLE_LOOKUP_LIMIT;
  const unique = leads.filter((lead, index) =>
    leads.findIndex((other) => youtubeLabelsMatch(other.title, lead.title) &&
      youtubeLabelsMatch(lead.title, other.title)) === index
  );
  const searched = await Promise.all(unique.slice(0, limit).map(async (lead) => {
    try {
      const result = await search({ query: lead.title, pageSize: LOOKUP_PAGE_SIZE }, options.config);
      if (result.access_status !== "complete") return { lead, outcome: "search_failed" as const };
      const titled = result.data.flatMap((record) => {
        if (record.title === undefined) return [];
        const decoded = {
          video_id: record.video_id,
          title: decodeHtmlEntities(record.title),
          ...(record.channel_title === undefined ? {} : { channel_title: decodeHtmlEntities(record.channel_title) })
        };
        return youtubeLabelsMatch(decoded.title, lead.title) ? [decoded] : [];
      });
      const match = titled.find((record) =>
        lead.channel.trim().toLowerCase() !== UNKNOWN_CHANNEL &&
        record.channel_title !== undefined &&
        youtubeLabelsMatch(record.channel_title, lead.channel)
      ) ?? titled[0];
      return match === undefined
        ? { lead, outcome: "no_matching_video" as const }
        : { lead, outcome: "found" as const, match };
    } catch {
      return { lead, outcome: "search_failed" as const };
    }
  }));

  const found: ScoutTitleLookupResult["found"] = [];
  const unresolved: ScoutTitleLookupResult["unresolved"] = [];
  const seen = new Set(options.knownVideoIds);
  for (const entry of searched) {
    if (entry.outcome !== "found") {
      unresolved.push({ ...entry.lead, reason: entry.outcome });
      continue;
    }
    if (seen.has(entry.match.video_id)) continue;
    seen.add(entry.match.video_id);
    found.push({
      video_id: entry.match.video_id,
      title: entry.match.title,
      channel: entry.match.channel_title ?? entry.lead.channel,
      declared_title: entry.lead.title,
      ...(entry.lead.why_surfaced === undefined ? {} : { why_surfaced: entry.lead.why_surfaced })
    });
  }
  for (const lead of unique.slice(limit)) unresolved.push({ ...lead, reason: "not_searched" });
  return { found, unresolved };
}
