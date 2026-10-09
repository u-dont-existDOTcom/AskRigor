import { createHash } from "node:crypto";

import { commentProductClassSchema, type YoutubeComment } from "@askrigor/sources";
import { z } from "zod";

import { rankYoutubeCommentIdentifier } from "./youtube-audit-continuation.js";
import {
  youtubeCommunityAuditOutputSchema,
  type YoutubeCommunityAuditOutput
} from "./youtube-community-audit.js";
import {
  youtubeVideoCommunityAuditOutputSchema,
  type YoutubeVideoCommunityAuditOutput
} from "./youtube-video-community-audit.js";

/**
 * MCP view of a per-video comment audit sample.
 *
 * Full comment records spend about two thirds of their bytes on metadata
 * (channel and parent identifiers, display names, update times), and MCP
 * clients reject large results (Claude clients near 50,000 characters). The MCP
 * tool therefore returns compact records: the comment id, the parent for a
 * reply, a per-video pseudonymous author key (enough to count distinct people,
 * never the channel id or display name), the date, likes, an edited flag and
 * the text. Records are kept in the deterministic sample order until the
 * response budget is reached, then shown chronologically. Retrieval counts,
 * corpus hashes and the completion receipt still cover the whole corpus.
 */

export const compactYoutubeCommentSchema = z.object({
  product_class: commentProductClassSchema.optional(),
  id: z.string(),
  reply_to: z.string().optional(),
  author: z.string().regex(/^[a-f0-9]{8}$/u),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  likes: z.number().int().nonnegative(),
  edited: z.literal(true).optional(),
  text: z.string()
}).strict();

export const compactYoutubeAuditSampleSchema = z.object({
  mode: z.enum(["all", "deterministic_hash_chronological"]),
  corpus_count: z.number().int().nonnegative(),
  sampled_count: z.number().int().min(0).max(500),
  comments: z.array(compactYoutubeCommentSchema).max(500)
}).strict();

/**
 * What a YouTube audit's receipt covers, said where the model reads it. A
 * receipt that said only "synthesis_lock: pass" was read as leave to write the
 * answer, and Reddit and specialist forums went unsearched (owner report,
 * 2026-09-29), so the MCP views name the lock for what it covers.
 */
export const YOUTUBE_VIDEO_AUDIT_SCOPE =
  "Covers this one YouTube video's comments only: not other videos, Reddit, forums or other communities, and not " +
  "whether the research is complete, which finalize_research decides.";
export const YOUTUBE_COMMUNITY_AUDIT_SCOPE =
  "Covers these YouTube videos' comments only: not Reddit, forums or other communities, and not whether the " +
  "research is complete, which finalize_research decides.";

const videoAuditReceiptSchema = youtubeVideoCommunityAuditOutputSchema.shape.receipt;
const mcpVideoAuditReceiptSchema = z.object({
  scope: z.literal(YOUTUBE_VIDEO_AUDIT_SCOPE),
  comment_retrieval_state: videoAuditReceiptSchema.shape.completion_state,
  video_comments_lock: videoAuditReceiptSchema.shape.synthesis_lock,
  ...videoAuditReceiptSchema.omit({ completion_state: true, synthesis_lock: true }).shape
}).strict();

export const mcpYoutubeVideoCommunityAuditOutputSchema = youtubeVideoCommunityAuditOutputSchema.extend({
  receipt: mcpVideoAuditReceiptSchema,
  sample: compactYoutubeAuditSampleSchema.optional(),
  research_receipt: z.string().optional()
});

export type McpYoutubeVideoCommunityAuditOutput = z.output<typeof mcpYoutubeVideoCommunityAuditOutputSchema>;

// A large video can report hundreds of reply-count mismatches; the view lists
// the first few, and the counts and the receipt cover them all.
const MCP_REPLY_MISMATCHES_SHOWN = 20;
const MID_CHAIN_SAMPLE_LIMITATION =
  "The comment sample comes with this audit's last page; continue with continuation_token to read it.";

export function compactYoutubeAuditForMcp(
  output: YoutubeVideoCommunityAuditOutput,
  maximumBytes: number,
  boundedSampleLimitation: string
): McpYoutubeVideoCommunityAuditOutput {
  const { sample, receipt, ...fields } = output;
  const { completion_state: state, synthesis_lock: lock, ...checks } = receipt;
  const all = {
    ...fields,
    receipt: { scope: YOUTUBE_VIDEO_AUDIT_SCOPE, comment_retrieval_state: state, video_comments_lock: lock, ...checks }
  };
  const mismatches = all.reply_count_mismatches.length;
  const rest = mismatches <= MCP_REPLY_MISMATCHES_SHOWN ? all : {
    ...all,
    reply_count_mismatches: all.reply_count_mismatches.slice(0, MCP_REPLY_MISMATCHES_SHOWN),
    limitations: [
      ...all.limitations,
      `This MCP view lists ${MCP_REPLY_MISMATCHES_SHOWN} of ${mismatches} reply-count mismatches.`
    ]
  };
  const fits = (candidate: McpYoutubeVideoCommunityAuditOutput) =>
    Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maximumBytes;
  // Never an oversized result: the client would cut it and lose the
  // continuation token or the receipt.
  if (sample === undefined) {
    const view = mcpYoutubeVideoCommunityAuditOutputSchema.parse(rest);
    if (!fits(view)) throw new YoutubeMcpResponseTooLargeError();
    return view;
  }
  // While the chain continues, the sample waits for its last page: sent with
  // every page, a long video's comments were read again on each call (about
  // 38 KB a page in the 27 Sep test runs).
  if (output.continuation_recommended) {
    const view = mcpYoutubeVideoCommunityAuditOutputSchema.parse({
      ...rest,
      records_returned_for_analysis: 0,
      top_level_records_returned_for_analysis: 0,
      reply_records_returned_for_analysis: 0,
      limitations: [...new Set([...rest.limitations, MID_CHAIN_SAMPLE_LIMITATION])]
    });
    if (!fits(view)) throw new YoutubeMcpResponseTooLargeError();
    return view;
  }

  const ranked = [...sample.comments].sort((left, right) =>
    rankYoutubeCommentIdentifier(left.comment_id).localeCompare(rankYoutubeCommentIdentifier(right.comment_id)) ||
    left.comment_id.localeCompare(right.comment_id)
  );
  const build = (count: number): McpYoutubeVideoCommunityAuditOutput => {
    const selected = [...ranked.slice(0, count)].sort((left, right) =>
      left.published_at.localeCompare(right.published_at) ||
      left.comment_id.localeCompare(right.comment_id)
    );
    const topLevel = selected.filter(({ is_reply }) => !is_reply).length;
    const trimmed = count < sample.comments.length;
    return {
      ...rest,
      records_returned_for_analysis: count,
      top_level_records_returned_for_analysis: topLevel,
      reply_records_returned_for_analysis: count - topLevel,
      limitations: trimmed
        ? [...new Set([...rest.limitations, boundedSampleLimitation])]
        : rest.limitations,
      sample: {
        mode: trimmed ? "deterministic_hash_chronological" : sample.mode,
        corpus_count: sample.corpus_count,
        sampled_count: count,
        comments: selected.map((comment) => compactComment(output.video_id, comment))
      }
    };
  };
  const full = build(ranked.length);
  if (fits(full)) return mcpYoutubeVideoCommunityAuditOutputSchema.parse(full);
  let best = build(0);
  if (!fits(best)) throw new YoutubeMcpResponseTooLargeError();
  let lower = 1;
  let upper = ranked.length - 1;
  while (lower <= upper) {
    const count = Math.floor((lower + upper) / 2);
    const candidate = build(count);
    if (fits(candidate)) {
      best = candidate;
      lower = count + 1;
    } else {
      upper = count - 1;
    }
  }
  return mcpYoutubeVideoCommunityAuditOutputSchema.parse(best);
}

const mcpCommunityAuditVideoSchema = youtubeCommunityAuditOutputSchema.shape.videos.element.extend({
  sample: z.object({
    mode: z.enum(["all", "systematic_chronological", "deterministic_hash_chronological"]),
    corpus_count: z.number().int().nonnegative(),
    sampled_count: z.number().int().min(0).max(500),
    comments: z.array(compactYoutubeCommentSchema).max(500)
  }).strict().optional()
});

const communityAuditReceiptSchema = youtubeCommunityAuditOutputSchema.shape.receipt;
const mcpCommunityAuditReceiptSchema = z.object({
  scope: z.literal(YOUTUBE_COMMUNITY_AUDIT_SCOPE),
  comment_retrieval_state: communityAuditReceiptSchema.shape.completion_state,
  youtube_comments_lock: communityAuditReceiptSchema.shape.synthesis_lock,
  ...communityAuditReceiptSchema.omit({ completion_state: true, synthesis_lock: true }).shape
}).strict();

export const mcpYoutubeCommunityAuditOutputSchema = youtubeCommunityAuditOutputSchema.extend({
  videos: z.array(mcpCommunityAuditVideoSchema).max(3),
  receipt: mcpCommunityAuditReceiptSchema,
  research_receipt: z.string().optional()
});

export type McpYoutubeCommunityAuditOutput = z.output<typeof mcpYoutubeCommunityAuditOutputSchema>;

/** Even with no comments, an audit's fixed fields do not fit the response budget. */
export class YoutubeMcpResponseTooLargeError extends Error {
  constructor() {
    super("youtube_audit_response_too_large");
  }
}

const SHORTENED_ECHO_LIMITATION =
  "Long queries, the research question and video metadata are shortened in this MCP view.";

/**
 * MCP view of a one-call community audit: the same compact records, with one
 * response budget shared by up to three videos. Uncompacted, three samples of
 * up to 500 records reached about 63,000 tokens, which clients truncate, and
 * the audit's findings were then lost before the answer. Each video keeps the
 * same number of records, in its deterministic sample order, shown
 * chronologically; manifests, corpus hashes and the receipt still cover every
 * retrieved record.
 */
export function compactYoutubeCommunityAuditForMcp(
  output: YoutubeCommunityAuditOutput,
  maximumBytes: number,
  boundedSampleLimitation: string
): McpYoutubeCommunityAuditOutput {
  const ranked = output.videos.map((video) => [...(video.sample?.comments ?? [])].sort((left, right) =>
    rankYoutubeCommentIdentifier(left.comment_id).localeCompare(rankYoutubeCommentIdentifier(right.comment_id)) ||
    left.comment_id.localeCompare(right.comment_id)
  ));
  // Echoed queries and provider metadata can be long; the model wrote the
  // queries and can read full metadata elsewhere, so the view shortens them.
  let shortenedAny = false;
  const shorten = (value: string, maximum: number): string => {
    if (value.length <= maximum) return value;
    shortenedAny = true;
    return `${value.slice(0, maximum - 1)}…`;
  };
  const firstTags = (tags: string[]): string[] => {
    if (tags.length <= 20) return tags;
    shortenedAny = true;
    return tags.slice(0, 20);
  };
  const { completion_state: state, synthesis_lock: lock, ...checks } = output.receipt;
  const fixed = {
    ...output,
    receipt: { scope: YOUTUBE_COMMUNITY_AUDIT_SCOPE, comment_retrieval_state: state, youtube_comments_lock: lock, ...checks },
    research_question: shorten(output.research_question, 1_000),
    searches: output.searches.map((search) => ({ ...search, query: shorten(search.query, 300) })),
    videos: output.videos.map((video) => ({
      ...video,
      search_queries: video.search_queries.map((query) => shorten(query, 300)),
      ...(video.metadata === undefined ? {} : {
        metadata: {
          ...video.metadata,
          ...(video.metadata.title === undefined ? {} : { title: shorten(video.metadata.title, 300) }),
          ...(video.metadata.channel_title === undefined ? {} : { channel_title: shorten(video.metadata.channel_title, 300) }),
          ...(video.metadata.description === undefined ? {} : { description: shorten(video.metadata.description, 1_000) }),
          ...(video.metadata.tags === undefined ? {} : { tags: firstTags(video.metadata.tags) })
        }
      })
    }))
  };
  const baseLimitations = shortenedAny ? [...new Set([...output.limitations, SHORTENED_ECHO_LIMITATION])] : output.limitations;
  const build = (perVideo: number): McpYoutubeCommunityAuditOutput => {
    let trimmedAny = false;
    const videos = fixed.videos.map((video, index) => {
      const { sample, ...rest } = video;
      if (sample === undefined) return rest;
      const kept = ranked[index]!.slice(0, perVideo).sort((left, right) =>
        left.published_at.localeCompare(right.published_at) ||
        left.comment_id.localeCompare(right.comment_id)
      );
      const trimmed = kept.length < sample.comments.length;
      trimmedAny ||= trimmed;
      return {
        ...rest,
        limitations: trimmed ? [...new Set([...rest.limitations, boundedSampleLimitation])] : rest.limitations,
        sample: {
          mode: trimmed ? "deterministic_hash_chronological" as const : sample.mode,
          corpus_count: sample.corpus_count,
          sampled_count: kept.length,
          comments: kept.map((comment) => compactComment(video.video_id, comment))
        }
      };
    });
    return {
      ...fixed,
      limitations: trimmedAny ? [...new Set([...baseLimitations, boundedSampleLimitation])] : baseLimitations,
      videos
    };
  };
  const fits = (candidate: McpYoutubeCommunityAuditOutput) =>
    Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maximumBytes;

  const largest = Math.max(0, ...ranked.map((comments) => comments.length));
  const full = build(largest);
  if (fits(full)) return mcpYoutubeCommunityAuditOutputSchema.parse(full);
  let best = build(0);
  if (!fits(best)) throw new YoutubeMcpResponseTooLargeError();
  let lower = 1;
  let upper = largest - 1;
  while (lower <= upper) {
    const count = Math.floor((lower + upper) / 2);
    const candidate = build(count);
    if (fits(candidate)) {
      best = candidate;
      lower = count + 1;
    } else {
      upper = count - 1;
    }
  }
  return mcpYoutubeCommunityAuditOutputSchema.parse(best);
}

function compactComment(
  videoId: string,
  comment: YoutubeComment
): z.output<typeof compactYoutubeCommentSchema> {
  return {
    id: comment.comment_id,
    ...(comment.product_class === undefined ? {} : { product_class: comment.product_class }),
    ...(comment.is_reply && comment.parent_id !== null ? { reply_to: comment.parent_id } : {}),
    author: authorKey(videoId, comment),
    date: comment.published_at.slice(0, 10),
    likes: comment.like_count,
    ...(comment.updated_at !== comment.published_at ? { edited: true as const } : {}),
    text: comment.text
  };
}

/**
 * Stable within one video, unlinkable across videos. Without a channel ID the
 * key is per comment: display names are not unique, so they never merge people.
 */
function authorKey(videoId: string, comment: YoutubeComment): string {
  const identity = comment.author_channel_id ?? `comment:${comment.comment_id}`;
  return createHash("sha256")
    .update(`askrigor-author-v1\n${videoId}\n${identity}`)
    .digest("hex")
    .slice(0, 8);
}
