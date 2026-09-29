import {
  searchYoutube,
  YOUTUBE_SEARCH_QUOTA_EXHAUSTED_CODE,
  youtubeLabelsMatch,
  youtubeTitlesMatch,
  youtubeTitlesNearlySame,
  type YoutubeConfig
} from "@askrigor/sources";

/**
 * Exact-title lookup for scout finds that have no usable video ID.
 *
 * Gemini's Google Search results often name a video without showing its watch
 * URL, so the scout reports such finds by title, and sometimes garbles an ID
 * it did propose. One YouTube search per title (100 quota units) recovers the
 * video when a result's title matches the declared one. A matching title alone
 * can name another video (a generic "Recovery Story" also matches "Cancer
 * Recovery Story"), so a result is accepted only when the declared channel
 * agrees or the titles are nearly the same (youtubeTitlesNearlySame). YouTube's
 * metadata stays authoritative for what the video is. Titles beyond the
 * per-call limit are returned unsearched so the model can decide whether they
 * are worth a search.
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
    reason: "no_matching_video" | "search_quota_exhausted" | "search_failed" | "not_searched";
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
  // Similar titles can name different videos (hip pain, back pain), so only
  // an exact repeat of a title, ignoring case, spacing and punctuation, shares
  // a search. Each lead is still matched with its own channel, and a lead
  // whose title is past the search limit comes back unresolved.
  const compact = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const identity = (lead: ScoutTitleLead) => `${compact(lead.title)}\n${compact(lead.channel)}`;
  const unique = leads.filter((lead, index) =>
    leads.findIndex((other) => identity(other) === identity(lead)) === index
  );
  const titleKeys = [...new Set(unique.map(({ title }) => compact(title)))].slice(0, limit);
  type TitleSearch =
    | "search_quota_exhausted"
    | "search_failed"
    | Array<{ video_id: string; title: string; channel_title?: string }>;
  const responses = new Map(await Promise.all(titleKeys.map(async (key): Promise<[string, TitleSearch]> => {
    const query = unique.find(({ title }) => compact(title) === key)!.title;
    try {
      const result = await search({ query, pageSize: LOOKUP_PAGE_SIZE }, options.config);
      if (result.error?.code === YOUTUBE_SEARCH_QUOTA_EXHAUSTED_CODE) return [key, "search_quota_exhausted"];
      if (result.access_status !== "complete") return [key, "search_failed"];
      return [key, result.data.flatMap((record) => record.title === undefined ? [] : [{
        video_id: record.video_id,
        title: decodeHtmlEntities(record.title),
        ...(record.channel_title === undefined ? {} : { channel_title: decodeHtmlEntities(record.channel_title) })
      }])];
    } catch {
      return [key, "search_failed"];
    }
  })));

  const found: ScoutTitleLookupResult["found"] = [];
  const unresolved: ScoutTitleLookupResult["unresolved"] = [];
  const seen = new Set(options.knownVideoIds);
  for (const lead of unique) {
    const response = responses.get(compact(lead.title));
    if (response === undefined) {
      unresolved.push({ ...lead, reason: "not_searched" });
      continue;
    }
    if (typeof response === "string") {
      unresolved.push({ ...lead, reason: response });
      continue;
    }
    const titled = response.filter((record) => youtubeTitlesMatch(record.title, lead.title));
    const match = titled.find((record) =>
      lead.channel.trim().toLowerCase() !== UNKNOWN_CHANNEL &&
      record.channel_title !== undefined &&
      youtubeLabelsMatch(record.channel_title, lead.channel)
    ) ?? titled.find((record) => youtubeTitlesNearlySame(record.title, lead.title));
    if (match === undefined) {
      unresolved.push({ ...lead, reason: "no_matching_video" });
      continue;
    }
    if (seen.has(match.video_id)) continue;
    seen.add(match.video_id);
    found.push({
      video_id: match.video_id,
      title: match.title,
      channel: match.channel_title ?? lead.channel,
      declared_title: lead.title,
      ...(lead.why_surfaced === undefined ? {} : { why_surfaced: lead.why_surfaced })
    });
  }
  return { found, unresolved };
}
