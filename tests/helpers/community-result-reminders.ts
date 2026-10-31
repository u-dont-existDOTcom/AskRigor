import { expect } from "vitest";

export const COMMUNITY_RESEARCH_REMINDER =
  "Before concluding: turn the treatments, diagnoses, subgroups and harms these reports name into study searches, " +
  "and pass the methods commenters credit to scout_gemini_youtube_candidates as rediscovery_leads. In the answer, " +
  "name each video (title, channel, date, link), and give how many comments were retrieved, how many were " +
  "classified, and how they were chosen.";
export const VIDEO_COMMENT_MAP_REMINDER =
  "Give this video's comment map from the sample: how many people said they did the video's method; how it went " +
  "for them (better, no change, worse, mixed), with the counts; how long their results had lasted; the kinds of " +
  "harm reported, with counts; and the other methods commenters credit, with how many credit each and how many " +
  "say it worked better than the video's method. Call them people who commented and said they tried it, never a " +
  "success rate. When the answer audits several videos for one problem, rank them by the share who said it " +
  "helped, only among videos with at least 20 such people, giving each video's counts.";

export function expectCommunityRemindersInTextOnly(result: { content: unknown; structuredContent?: unknown }, video = false) {
  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter(({ type }) => type === "text").map(({ text }) => text).join("\n");
  expect(text).toContain(COMMUNITY_RESEARCH_REMINDER);
  if (video) expect(text).toContain(VIDEO_COMMENT_MAP_REMINDER);
  else expect(text).not.toContain(VIDEO_COMMENT_MAP_REMINDER);
  expect(JSON.stringify(result.structuredContent)).not.toContain(COMMUNITY_RESEARCH_REMINDER);
  expect(JSON.stringify(result.structuredContent)).not.toContain(VIDEO_COMMENT_MAP_REMINDER);
}
