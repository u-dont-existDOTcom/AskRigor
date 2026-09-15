import { generalizedLessonSchema, type LessonCandidate } from "./contracts.js";
import type { LessonAnonymizer } from "./openai-anonymizer.js";
import { screenLessonCandidate } from "./privacy-screen.js";

/**
 * Validates an already-generalized lesson produced in the active ChatGPT
 * conversation. This adapter performs no network or model call. The Action
 * backend remains responsible for strict schema and deterministic privacy
 * screening before the lesson may enter the review queue.
 */
export function createLocalLessonGeneralizer(): LessonAnonymizer {
  return {
    async generalize(candidate: LessonCandidate) {
      const parsed = generalizedLessonSchema.safeParse(candidate);
      if (!parsed.success) return { status: "privacy_rejected" };

      const screened = screenLessonCandidate(parsed.data);
      if (!screened.safe) return { status: "privacy_rejected" };

      return { status: "generalized", candidate: screened.candidate };
    },
  };
}
