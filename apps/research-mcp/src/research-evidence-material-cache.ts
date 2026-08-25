import type {
  YoutubeDiscussionActionOutput,
  YoutubeTranscriptActionOutput
} from "./actions/research-video-depth-controller.js";
import {
  sourceMaterialDigest,
  sourceRecordSha256,
  type VideoEvidenceMaterial
} from "./actions/research-bounded-evidence.js";

export interface ResearchEvidenceMaterialCache {
  captureTranscript(input: {
    sessionId: string;
    videoId: string;
    output: YoutubeTranscriptActionOutput;
  }): void;
  captureDiscussion(input: {
    sessionId: string;
    videoId: string;
    output: YoutubeDiscussionActionOutput;
  }): void;
  get(input: {
    sessionId: string;
    videoId: string;
    transcriptReceiptSha256: string;
    discussionReceiptSha256: string;
  }): VideoEvidenceMaterial | undefined;
  revokeSession(sessionId: string): void;
}

interface MutableMaterial {
  transcriptSegments: Map<string, VideoEvidenceMaterial["transcript_segments"][number]>;
  discussionComments: Map<string, VideoEvidenceMaterial["discussion_comments"][number]>;
  transcriptReceiptSha256?: string;
  discussionReceiptSha256?: string;
}

const DEFAULT_MAXIMUM_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_ENTRIES = 100;

/** Raw public source material is bounded, process-local, and never checkpointed. */
export function createInMemoryResearchEvidenceMaterialCache(input: {
  maximumBytes?: number;
  maximumEntries?: number;
} = {}): ResearchEvidenceMaterialCache {
  const maximumBytes = boundedPositiveInteger(
    input.maximumBytes ?? DEFAULT_MAXIMUM_BYTES,
    "evidence-material byte limit"
  );
  const maximumEntries = boundedPositiveInteger(
    input.maximumEntries ?? DEFAULT_MAXIMUM_ENTRIES,
    "evidence-material entry limit"
  );
  const entries = new Map<string, MutableMaterial>();

  const cache: ResearchEvidenceMaterialCache = {
    captureTranscript({ sessionId, videoId, output }: {
      sessionId: string;
      videoId: string;
      output: YoutubeTranscriptActionOutput;
    }) {
      const key = cacheKey(sessionId, videoId);
      const next = cloneMutable(entries.get(key) ?? emptyMaterial());
      for (const segment of output.data) {
        const record_sha256 = sourceRecordSha256(segment);
        next.transcriptSegments.set(record_sha256, { ...segment, record_sha256 });
      }
      if (
        output.coverage_receipt.pagination.exhausted &&
        output.coverage_receipt.access_status === "api_visible_complete"
      ) {
        next.transcriptReceiptSha256 = sourceRecordSha256(output.coverage_receipt);
      }
      commitBounded(entries, key, next, maximumEntries, maximumBytes);
    },
    captureDiscussion({ sessionId, videoId, output }: {
      sessionId: string;
      videoId: string;
      output: YoutubeDiscussionActionOutput;
    }) {
      const key = cacheKey(sessionId, videoId);
      const next = cloneMutable(entries.get(key) ?? emptyMaterial());
      for (const comment of output.sample?.comments ?? []) {
        const record_sha256 = sourceRecordSha256(comment);
        next.discussionComments.set(record_sha256, {
          record_sha256,
          video_id: comment.video_id,
          comment_id: comment.comment_id,
          parent_id: comment.parent_id,
          top_level_comment_id: comment.top_level_comment_id,
          is_reply: comment.is_reply,
          text: comment.text,
          like_count: comment.like_count,
          published_at: comment.published_at,
          updated_at: comment.updated_at
        });
      }
      if (
        output.coverage_receipt.receipt.synthesis_lock === "pass" &&
        output.coverage_receipt.receipt.completion_state === "api_visible_complete"
      ) {
        next.discussionReceiptSha256 = sourceRecordSha256(output.coverage_receipt);
      }
      commitBounded(entries, key, next, maximumEntries, maximumBytes);
    },
    get({
      sessionId,
      videoId,
      transcriptReceiptSha256,
      discussionReceiptSha256
    }: {
      sessionId: string;
      videoId: string;
      transcriptReceiptSha256: string;
      discussionReceiptSha256: string;
    }) {
      const entry = entries.get(cacheKey(sessionId, videoId));
      if (
        entry === undefined ||
        entry.transcriptReceiptSha256 !== transcriptReceiptSha256 ||
        entry.discussionReceiptSha256 !== discussionReceiptSha256 ||
        entry.transcriptSegments.size === 0
      ) return undefined;
      entries.delete(cacheKey(sessionId, videoId));
      entries.set(cacheKey(sessionId, videoId), entry);
      const transcriptSegments = [...entry.transcriptSegments.values()].sort(
        (left, right) => left.index - right.index
      );
      const discussionComments = [...entry.discussionComments.values()];
      return structuredClone({
        video_id: videoId,
        transcript_receipt_sha256: transcriptReceiptSha256,
        discussion_receipt_sha256: discussionReceiptSha256,
        transcript_segments: transcriptSegments,
        discussion_comments: discussionComments,
        source_material_digest: sourceMaterialDigest({
          video_id: videoId,
          transcript_receipt_sha256: transcriptReceiptSha256,
          discussion_receipt_sha256: discussionReceiptSha256,
          transcript_record_sha256s: transcriptSegments.map(({ record_sha256 }) =>
            record_sha256
          ),
          discussion_record_sha256s: discussionComments.map(({ record_sha256 }) =>
            record_sha256
          )
        })
      });
    },
    revokeSession(sessionId: string) {
      for (const key of entries.keys()) {
        if (key.startsWith(`${sessionId}:`)) entries.delete(key);
      }
    }
  };
  return Object.freeze(cache);
}

function emptyMaterial(): MutableMaterial {
  return {
    transcriptSegments: new Map(),
    discussionComments: new Map()
  };
}

function cloneMutable(value: MutableMaterial): MutableMaterial {
  return {
    transcriptSegments: new Map(value.transcriptSegments),
    discussionComments: new Map(value.discussionComments),
    ...(value.transcriptReceiptSha256 === undefined
      ? {}
      : { transcriptReceiptSha256: value.transcriptReceiptSha256 }),
    ...(value.discussionReceiptSha256 === undefined
      ? {}
      : { discussionReceiptSha256: value.discussionReceiptSha256 })
  };
}

function commitBounded(
  entries: Map<string, MutableMaterial>,
  key: string,
  value: MutableMaterial,
  maximumEntries: number,
  maximumBytes: number
): void {
  const nextEntries = new Map(entries);
  nextEntries.delete(key);
  nextEntries.set(key, value);
  while (
    nextEntries.size > maximumEntries ||
    serializedEntryBytes(nextEntries) > maximumBytes
  ) {
    const oldestKey = nextEntries.keys().next().value as string | undefined;
    if (oldestKey === undefined || oldestKey === key && nextEntries.size === 1) {
      throw new Error("Evidence-material cache byte limit exceeded");
    }
    nextEntries.delete(oldestKey);
  }
  if (!nextEntries.has(key)) {
    throw new Error("Evidence-material cache byte limit exceeded");
  }
  entries.clear();
  for (const [entryKey, entry] of nextEntries) entries.set(entryKey, entry);
}

function serializedEntryBytes(entries: Map<string, MutableMaterial>): number {
  return Buffer.byteLength(JSON.stringify([...entries.entries()].map(
    ([entryKey, entry]) => ({
      entryKey,
      transcriptSegments: [...entry.transcriptSegments.values()],
      discussionComments: [...entry.discussionComments.values()],
      transcriptReceiptSha256: entry.transcriptReceiptSha256,
      discussionReceiptSha256: entry.discussionReceiptSha256
    })
  )), "utf8");
}

function cacheKey(sessionId: string, videoId: string): string {
  if (!/^ars1_[A-Za-z0-9_-]{32}$/u.test(sessionId)) {
    throw new Error("Invalid research session identity for evidence material");
  }
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) {
    throw new Error("Invalid video identity for evidence material");
  }
  return `${sessionId}:${videoId}`;
}

function boundedPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}`);
  return value;
}
