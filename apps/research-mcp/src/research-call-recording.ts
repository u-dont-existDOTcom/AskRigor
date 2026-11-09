import type { ResearchCallRecordEntry, ResearchCallRecordStore, ResearchContributorAccessService } from "@askrigor/evidence-repository";
import { authorizedSubject, manageResearchAccessInputSchema } from "./research-contributor-access-tool.js";
import type { ResearchOperationExtra } from "./research-operation.js";
import type { CallRecordingOptions } from "./tool-result.js";

/** Uses the access tool's exact sign-in check and runtime action enum, without introducing a result-module cycle. */
export function researchCallRecordingOptions(
  store: ResearchCallRecordStore,
  service: ResearchContributorAccessService,
  route: ResearchCallRecordEntry["route"],
): CallRecordingOptions {
  return {
    store, route,
    accountKeyForCall(extra) {
      const auth = authorizedSubject(extra as ResearchOperationExtra | undefined, undefined);
      return "error" in auth ? undefined : service.accountKeyForSubject(auth.subject);
    },
    actionForCall(tool, input) {
      if (tool !== "manage_research_access") return null;
      const raw = input as Record<string, unknown>;
      const parsed = manageResearchAccessInputSchema.shape.action.safeParse(raw?.action);
      return parsed.success ? parsed.data : "other";
    },
  };
}

/** A process-local hourly sweep, stopped by the HTTP server at close and never keeping the process alive. */
export function startResearchCallRecordSweep(store: ResearchCallRecordStore): NodeJS.Timeout {
  const timer = setInterval(() => {
    void Promise.resolve().then(() => store.sweep(new Date())).catch(() => undefined);
  }, 60 * 60 * 1_000);
  timer.unref();
  return timer;
}
