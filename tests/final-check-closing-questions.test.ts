import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLOSING_QUESTIONS_GUIDANCE } from "../apps/research-mcp/src/final-check-messages.js";
import { communitySkipCaveat, type FinalizeResearchOutput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { ANSWER_READING_LABELS } from "../apps/research-mcp/src/source-reading.js";

// A lesson from the owner's comparison of 6 Nov 2026: free ChatGPT without AskRigor ended its tirzepatide answer with
// three numbered questions (an alternative to CPAP or an add-on; obesity, overweight or normal weight; the AHI, with
// examples) and said what it would do with the answers; AskRigor's answer never asked about weight. HRP
// ComplexAnswerFooter already asks for the most decision-changing next data, so the result guides the answer's close.
// The study and receipts are synthetic fixtures, not evidence about a treatment.
const SECRET = "closing-questions-test-secret-0123456789abcdef";
const REASON = "Synthetic fixture isolates the closing questions.";
const NOT_APPLICABLE = { status: "not_applicable" as const, reason: REASON };
const DOI = "10.1000/closing-trial";
const AUDITED = ANSWER_READING_LABELS.full_text_audited;
const input = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  receipts: [issueResearchReceipt("study_audit", { doi: DOI, content: "a".repeat(16) }, { secret: SECRET })],
  research_target: "Synthetic closing questions", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
  not_relevant_reason: REASON, commercial_review_applicability: NOT_APPLICABLE, intervention_identity: NOT_APPLICABLE,
  full_text_search: { status: "not_needed", reason: REASON }, lab_preparation: NOT_APPLICABLE,
  key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Trial" }],
  absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
  safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [],
  answer_draft: [`[Trial](https://doi.org/${DOI}) (${AUDITED}) compared two routines.`, communitySkipCaveat(REASON)]
    .join("\n\n"),
  later_inputs: { source_reading: [{ source: DOI, reading: "full_text_audited", quote: AUDITED }] },
  ...overrides
});

afterEach(() => { vi.unstubAllEnvs(); });

describe("the closing questions", () => {
  it("asks for at most three easy questions on what would most change the answer, in any field", () => {
    expect(CLOSING_QUESTIONS_GUIDANCE).toBe("When the answer depends on the person's situation, close it, before the " +
      "lines this result puts at its end, with at most three questions whose answers would most change it (HRP " +
      "ComplexAnswerFooter: the most decision-changing next data): what they are deciding (for example, instead of what " +
      "they use now, or as well as it); whether they match the people the key studies enrolled (such as weight, age, " +
      "severity or other conditions); and their key measurement. Make each easy to answer, with example answers, and " +
      "say what each answer would change.");
  });

  it.each(["/mcp", "/mcp/claude"] as const)("gives the line under every status on %s, before the answer's end lines", async (mcpSurface) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    const server = createAskRigorServer("standard", { mcpSurface, researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "closing-questions-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const call = async (args: Record<string, unknown>) => {
        const response = await client.callTool({ name: "finalize_research", arguments: args });
        expect(response.isError).not.toBe(true);
        return { output: response.structuredContent as FinalizeResearchOutput,
          text: (response.content as Array<{ text: string }>)[0]!.text };
      };
      const passed = await call(input());
      expect(passed.output.status).toMatch(/^ready/u);
      expect(passed.text).toContain(`\n${CLOSING_QUESTIONS_GUIDANCE}`);
      // Before the line the answer ends with.
      expect(passed.text.indexOf(CLOSING_QUESTIONS_GUIDANCE)).toBeLessThan(passed.text.indexOf("End the answer with this line"));
      const blocked = await call(input({ later_inputs: {} }));
      expect(blocked.output.status).toBe("not_ready");
      expect(blocked.text).toContain(`\n${CLOSING_QUESTIONS_GUIDANCE}`);
      // No step and no note reads the questions.
      expect([...blocked.output.next_steps, ...blocked.output.notes ?? []].join(" ")).not.toContain("questions whose answers");
      // Greptile's review of 12 Nov 2026 (P2): a pass after a pass in the same turn is the turn's last check, and says
      // to add no closing questions the checked draft doesn't have. So it doesn't ask for them: the one status without
      // the line.
      const again = await call(input({ round_token: passed.output.round_token, carried_state: passed.output.carry_forward }));
      expect(again.output).toMatchObject({ status: passed.output.status, turn_already_passed: true });
      expect(again.text).toContain("add no closing questions the checked draft doesn't have");
      expect(again.text).not.toContain(CLOSING_QUESTIONS_GUIDANCE);
      expect(again.text).not.toContain("questions whose answers");
    } finally { await client.close(); await server.close(); }
  });
});
