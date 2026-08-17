import type { YoutubeComment } from "@askrigor/sources";

import { rankYoutubeCommentIdentifier } from "../youtube-audit-continuation.js";
import {
  youtubeVideoCommunityAuditOutputSchema,
  type YoutubeVideoCommunityAuditOutput
} from "../youtube-video-community-audit.js";
import { ActionResponseTooLargeError } from "./types.js";

export const ACTION_BOUNDED_SAMPLE_LIMITATION =
  "The Custom GPT Action returned a deterministic transport-bounded analysis sample; retrieval coverage and corpus counts are reported separately.";

export function boundYoutubeAuditForAction(
  output: YoutubeVideoCommunityAuditOutput,
  maximumBytes: number
): YoutubeVideoCommunityAuditOutput {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("Action response byte limit must be a positive safe integer");
  }
  const original = youtubeVideoCommunityAuditOutputSchema.parse(output);
  if (serializedBytes(original) <= maximumBytes) return original;
  if (original.sample === undefined || original.sample.comments.length === 0) {
    throw new ActionResponseTooLargeError(
      "The YouTube audit fixed envelope cannot fit the Action response byte limit"
    );
  }

  const ranked = [...original.sample.comments].sort((left, right) =>
    rankYoutubeCommentIdentifier(left.comment_id)
      .localeCompare(rankYoutubeCommentIdentifier(right.comment_id)) ||
    left.comment_id.localeCompare(right.comment_id)
  );
  let lower = 1;
  let upper = ranked.length;
  let best: YoutubeVideoCommunityAuditOutput | undefined;
  while (lower <= upper) {
    const count = Math.floor((lower + upper) / 2);
    const candidate = createBoundedCandidate(original, ranked.slice(0, count));
    if (serializedBytes(candidate) <= maximumBytes) {
      best = candidate;
      lower = count + 1;
    } else {
      upper = count - 1;
    }
  }
  if (best === undefined) {
    throw new ActionResponseTooLargeError(
      "The YouTube audit fixed envelope and one analysis record cannot fit the Action response byte limit"
    );
  }
  return best;
}

function createBoundedCandidate(
  original: YoutubeVideoCommunityAuditOutput,
  selected: readonly YoutubeComment[]
): YoutubeVideoCommunityAuditOutput {
  const comments = chronological(selected);
  const topLevel = comments.filter(({ is_reply }) => !is_reply).length;
  return youtubeVideoCommunityAuditOutputSchema.parse({
    ...original,
    analysis_limit: comments.length,
    records_returned_for_analysis: comments.length,
    top_level_records_returned_for_analysis: topLevel,
    reply_records_returned_for_analysis: comments.length - topLevel,
    limitations: [...new Set([
      ...original.limitations,
      ACTION_BOUNDED_SAMPLE_LIMITATION
    ])],
    sample: {
      ...original.sample!,
      mode: "deterministic_hash_chronological",
      sampled_count: comments.length,
      comments
    }
  });
}

function chronological(comments: readonly YoutubeComment[]): YoutubeComment[] {
  return [...comments].sort((left, right) =>
    left.published_at.localeCompare(right.published_at) ||
    left.comment_id.localeCompare(right.comment_id)
  );
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
