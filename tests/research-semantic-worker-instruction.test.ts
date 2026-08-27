import { describe, expect, it } from "vitest";

import {
  researchSemanticResponseContract,
  researchSemanticWorkerInstruction
} from "../apps/research-mcp/src/research-semantic-worker.js";

describe("research semantic worker instructions", () => {
  it("requires an exact all-candidate decision set for candidate screening", () => {
    const instruction = researchSemanticWorkerInstruction("candidate_screening");

    expect(instruction).toContain(
      "exactly one decision for every candidate in semantic_work.package.candidates"
    );
    expect(instruction).toContain("preserving every packaged video_id exactly once");
    expect(instruction).toContain("never return only selected candidates");
    expect(instruction).toContain(
      "use program_signature as the exact redundancy key"
    );
    expect(instruction).toContain(
      "do not infer duplicates merely from similar titles, channels, or treatment themes"
    );
    expect(instruction).toContain(
      "Set duplicate_of_video_id if and only if redundancy is DUPLICATE"
    );
    expect(instruction).toContain(
      "SELECTED only when materiality is MATERIAL and redundancy is DISTINCT"
    );
  });

  it("carries the same completeness boundary in the internal response contract", () => {
    const contract = researchSemanticResponseContract("candidate_screening") as {
      properties: {
        submission: {
          properties: { decisions: { description?: string } };
        };
      };
    };

    expect(contract.properties.submission.properties.decisions.description)
      .toContain("Exactly one decision for every packaged candidate video_id");
    expect(contract.properties.submission.properties.decisions.description)
      .toContain("never return only selected candidates");
    expect(contract.properties.submission.properties.decisions.description)
      .toContain("program_signature is the exact redundancy key");
    expect(contract.properties.submission.properties.decisions.description)
      .toContain("Similar titles, channels, or treatment themes alone do not establish DUPLICATE");
  });

  it("keeps unrelated semantic work on the bounded base instruction", () => {
    const instruction = researchSemanticWorkerInstruction("module_applicability");

    expect(instruction).toBe(
      "Use only this exact package. Return one JSON object matching response_contract. Do not claim workflow completion."
    );
    expect(instruction).not.toContain("candidate");
  });
});
