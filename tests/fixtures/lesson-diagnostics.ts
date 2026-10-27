import type { ConnectorLessonDiagnostics } from "../../apps/research-mcp/src/lessons/contracts.js";

export const lessonDiagnostics: ConnectorLessonDiagnostics = {
  existing_rules: { rules: [{
    name: "claim_scope_predicate_alignment_gate",
    status: "unknown",
    reason: "The answer and its cited evidence addressed different claims; the execution trace is unavailable.",
  }] },
  observed_behavior: "The answer ranked two invented interventions without sources that addressed the ranking.",
  part_to_change: { kind: "final_check", name: "finalize_research claim-to-source check" },
};
