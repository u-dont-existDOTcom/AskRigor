import type { ResearchUseNoticeVersion } from "./research-contributor-access.js";

/** One free contributor notice version and what it changed from the version before it. */
export interface ResearchUseNoticeChange {
  readonly version: ResearchUseNoticeVersion;
  /**
   * Whether this version collects or publishes more than the one before it. A material version asks every account
   * again; one that changes only wording carries an earlier yes forward (the owner, 6 November 2026). Decided in the
   * change that adds the version, and reviewed with it: no code can tell from the words.
   */
  readonly material: boolean;
  /** What changed, with the decision behind it. */
  readonly change: string;
}

/**
 * Every free contributor notice, oldest first, ending with RESEARCH_USE_NOTICE_VERSION. A new version adds its entry
 * here, in the change that adds the version, saying whether it is material; tests hold this list to the versions the
 * access schema admits. Kept in its own module so a test can stand a wording-only version in for the current one.
 */
export const RESEARCH_USE_NOTICE_CHANGES: readonly ResearchUseNoticeChange[] = Object.freeze(([
  { version: "free-contributor-v1-2026-09-01", material: true,
    change: "The first notice: free use saves deidentified structured research progress for review." },
  { version: "free-contributor-v2-2026-09-30", material: true,
    change: "Each finished answer's findings card joins what free use saves (owner decision Q11)." },
  { version: "free-contributor-v3-2026-10-22", material: true,
    change: "Findings the owner accepts may be published in the public Atlas (owner answers 159 and 160b)." },
  { version: "free-contributor-v4-2026-10-25", material: true,
    change: "Free cards publish as soon as they are saved, with votes and comments (owner answer 171)." },
  { version: "free-contributor-v5-2026-11-05", material: true,
    change: "A card's summary of what communities reported holds links to the forum threads read (owner answer 253a)." },
] satisfies ResearchUseNoticeChange[]).map((entry) => Object.freeze(entry)));
