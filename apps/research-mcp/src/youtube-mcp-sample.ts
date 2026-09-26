import { createHash } from "node:crypto";

import type { YoutubeComment } from "@askrigor/sources";
import { z } from "zod";

import { rankYoutubeCommentIdentifier } from "./youtube-audit-continuation.js";
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

export const mcpYoutubeVideoCommunityAuditOutputSchema = youtubeVideoCommunityAuditOutputSchema.extend({
  sample: compactYoutubeAuditSampleSchema.optional(),
  research_receipt: z.string().optional()
});

export type McpYoutubeVideoCommunityAuditOutput = z.output<typeof mcpYoutubeVideoCommunityAuditOutputSchema>;

export function compactYoutubeAuditForMcp(
  output: YoutubeVideoCommunityAuditOutput,
  maximumBytes: number,
  boundedSampleLimitation: string
): McpYoutubeVideoCommunityAuditOutput {
  const { sample, ...rest } = output;
  if (sample === undefined) return mcpYoutubeVideoCommunityAuditOutputSchema.parse(rest);

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
  const fits = (candidate: McpYoutubeVideoCommunityAuditOutput) =>
    Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maximumBytes;

  const full = build(ranked.length);
  if (fits(full)) return mcpYoutubeVideoCommunityAuditOutputSchema.parse(full);
  let lower = 0;
  let upper = ranked.length - 1;
  let best = build(0);
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

function compactComment(
  videoId: string,
  comment: YoutubeComment
): z.output<typeof compactYoutubeCommentSchema> {
  return {
    id: comment.comment_id,
    ...(comment.is_reply && comment.parent_id !== null ? { reply_to: comment.parent_id } : {}),
    author: authorKey(videoId, comment),
    date: comment.published_at.slice(0, 10),
    likes: comment.like_count,
    ...(comment.updated_at !== comment.published_at ? { edited: true as const } : {}),
    text: comment.text
  };
}

/** Stable within one video, unlinkable across videos; a missing identity never merges people. */
function authorKey(videoId: string, comment: YoutubeComment): string {
  const identity = comment.author_channel_id ?? comment.author_display_name ?? `comment:${comment.comment_id}`;
  return createHash("sha256")
    .update(`askrigor-author-v1\n${videoId}\n${identity}`)
    .digest("hex")
    .slice(0, 8);
}
