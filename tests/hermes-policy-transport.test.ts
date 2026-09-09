import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { getProtocolManifest } from "@askrigor/protocol";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: vi.fn((...args: any[]) => {
      const callback = args.at(-1);
      const commandArgs = args[1] as string[];
      if (args[0] === "git" && commandArgs.includes("rev-parse")) {
        callback(null, "fcbd1076a93841fa88855acce810e342a5b78101\n", "");
        return undefined;
      }
      if (args[0] === "git" && commandArgs.includes("status")) {
        callback(null, "", "");
        return undefined;
      }
      return (actual.execFile as any)(...args);
    })
  };
});

import { protocolBindingsFromManifests } from
  "../apps/research-mcp/src/actions/research-session-controller.js";
import {
  HERMES_SEMANTIC_INPUT_MAX_BYTES,
  createHermesProcessSemanticExecutor,
  serializeHermesSemanticWorkerInput
} from "../apps/research-mcp/src/hermes-worker-pilot.js";
import { createResearchSemanticPolicyInputs } from
  "../apps/research-mcp/src/research-semantic-policy-input.js";
import {
  researchSemanticResponseContract,
  type ResearchSemanticWork
} from
  "../apps/research-mcp/src/research-semantic-worker.js";

const ROOT = resolve(import.meta.dirname, "..");
const BRIDGE = resolve(ROOT, "scripts/hermes-semantic-worker.py");
const SESSION = `ars1_${"A".repeat(32)}`;
const STATE = "a".repeat(64);

describe("Hermes policy transport", () => {
  it("sends the complete real server policy package through the Python agent boundary", async () => {
    const [universal, hrp] = await Promise.all([
      getProtocolManifest("universal"),
      getProtocolManifest("hrp")
    ]);
    const policyInputs = await createResearchSemanticPolicyInputs({
      kind: "module_applicability",
      expectedProtocols: protocolBindingsFromManifests(universal, hrp)
    });
    const work = {
      session_id: SESSION,
      state_digest: STATE,
      ...policyInputs,
      research_context: "synthetic transport fixture",
      evidence_context: { source: "synthetic transport fixture" },
      response_contract: researchSemanticResponseContract("module_applicability"),
      semantic_work: {
        kind: "module_applicability" as const,
        package: {
          package_version: "askrigor_module_applicability_v1" as const,
          state_digest: STATE,
          unresolved_module_ids: ["FORUM_SIGNAL" as const]
        }
      }
    };
    const serialized = Buffer.from(JSON.stringify(work), "utf8");
    expect(serialized.byteLength).toBeGreaterThan(512 * 1_024);
    expect(serialized.byteLength).toBeLessThanOrEqual(2 * 1_024 * 1_024);
    process.stdout.write(`Hermes complete-policy fixture bytes: ${serialized.byteLength}\n`);

    const directory = await mkdtemp(join(tmpdir(), "askrigor-hermes-policy-test-"));
    try {
      const checkout = join(directory, "fake-hermes");
      const capture = join(directory, "capture.json");
      await writeFile(join(directory, "placeholder"), "");
      await mkdir(checkout);
      await writeFile(join(checkout, "run_agent.py"), `
import json
import os
class AIAgent:
    def __init__(self, **kwargs): self.kwargs = kwargs
    def run_conversation(self, message):
        work = json.loads(message)
        with open(os.environ["ASKRIGOR_HERMES_TEST_CAPTURE"], "w", encoding="utf-8", newline="") as handle:
            json.dump({"kwargs": self.kwargs, "work": work, "message": message}, handle, ensure_ascii=False)
        output = {
            "contract_version": "askrigor_hermes_semantic_result_v1",
            "session_id": work["session_id"], "state_digest": work["state_digest"],
            "work_type": "module_applicability",
            "submission": {"package_version": "askrigor_module_applicability_v1", "decisions": [{
                "module_id": "FORUM_SIGNAL", "applicability": "REQUIRED", "rationale": "Synthetic fixture."
            }]}
        }
        return {"completed": True, "api_calls": 0, "final_response": json.dumps(output)}
`, "utf8");
      const result = spawnSync("python3", [BRIDGE], {
        cwd: directory,
        input: serialized,
        env: {
          PATH: process.env.PATH,
          LANG: "C.UTF-8",
          HERMES_ASKRIGOR_CHECKOUT: checkout,
          HERMES_ASKRIGOR_PROVIDER: "synthetic-provider",
          HERMES_ASKRIGOR_MODEL: "synthetic-model",
          HERMES_ASKRIGOR_API_KEY: "synthetic-api-key",
          ASKRIGOR_HERMES_TEST_CAPTURE: capture
        },
        encoding: "utf8",
        maxBuffer: 4 * 1_024 * 1_024
      });
      expect(result.status, result.stderr).toBe(0);
      const captured = JSON.parse(await readFile(capture, "utf8"));
      expect(captured.work).toEqual(work);
      expect(Buffer.from(captured.message, "utf8")).toEqual(serialized);
      expect(captured.kwargs.ephemeral_system_prompt.endsWith(
        `\n\n${policyInputs.instruction}`
      )).toBe(true);
      expect(captured.kwargs).toMatchObject({
        enabled_toolsets: [],
        skip_memory: true,
        skip_context_files: true,
        skip_background_review: true,
        save_trajectories: false
      });
      for (const [index, document] of policyInputs.policy_context.documents.entries()) {
        expect(captured.work.policy_context.documents[index]).toEqual(document);
        expect(Buffer.from(captured.work.policy_context.documents[index].text, "utf8"))
          .toEqual(Buffer.from(document.text, "utf8"));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs the Python standard-library bridge contract suite", () => {
    const result = spawnSync("python3", [
      resolve(ROOT, "tests/test_hermes_semantic_worker.py")
    ], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 8 * 1_024 * 1_024
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("uses the concrete executor to write the validated bytes to the real Python bridge", async () => {
    const directory = await mkdtemp(join(tmpdir(), "askrigor-hermes-executor-test-"));
    const checkout = join(directory, "fake-hermes");
    const capture = join(directory, "capture.json");
    try {
      await mkdir(checkout);
      await writeFile(join(checkout, "run_agent.py"), `
import json
class AIAgent:
    def __init__(self, **kwargs): self.kwargs = kwargs
    def run_conversation(self, message):
        work = json.loads(message)
        with open(${JSON.stringify(capture)}, "w", encoding="utf-8", newline="") as handle:
            json.dump({"kwargs": self.kwargs, "work": work, "message": message}, handle, ensure_ascii=False)
        output = {
            "contract_version": "askrigor_hermes_semantic_result_v1",
            "session_id": work["session_id"], "state_digest": work["state_digest"],
            "work_type": "module_applicability",
            "submission": {"package_version": "askrigor_module_applicability_v1", "decisions": [{
                "module_id": "FORUM_SIGNAL", "applicability": "REQUIRED", "rationale": "Synthetic executor fixture."
            }]}
        }
        return {"completed": True, "api_calls": 1, "final_response": json.dumps(output)}
`, "utf8");
      const work = await moduleEnvelope();
      const expectedBytes = serializeHermesSemanticWorkerInput(work);
      const executor = createHermesProcessSemanticExecutor({
        hermesCheckout: checkout,
        pythonExecutable: "/usr/bin/python3",
        provider: "synthetic-provider",
        model: "synthetic-model",
        apiKey: "synthetic-api-key",
        timeoutMs: 30_000
      });
      const result = await executor.execute(work);
      expect(result).toMatchObject({
        model_output: {
          session_id: SESSION,
          state_digest: STATE,
          work_type: "module_applicability"
        },
        diagnostics: {
          worker: "hermes_agent",
          upstream_commit: "fcbd1076a93841fa88855acce810e342a5b78101",
          provider: "synthetic-provider",
          model: "synthetic-model",
          usage: { api_calls: 1 }
        }
      });
      const captured = JSON.parse(await readFile(capture, "utf8"));
      expect(captured.work).toEqual(work);
      expect(Buffer.from(captured.message, "utf8")).toEqual(expectedBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("preserves all ten semantic work kinds across adapter serialization and Python dispatch", async () => {
    const [universal, hrp] = await Promise.all([
      getProtocolManifest("universal"),
      getProtocolManifest("hrp")
    ]);
    const binding = protocolBindingsFromManifests(universal, hrp);
    const directory = await mkdtemp(join(tmpdir(), "askrigor-hermes-kinds-test-"));
    const checkout = join(directory, "fake-hermes");
    const capture = join(directory, "capture.json");
    try {
      await mkdir(checkout);
      await writeFile(join(checkout, "run_agent.py"), `
import json
import os
class AIAgent:
    def __init__(self, **kwargs): self.kwargs = kwargs
    def run_conversation(self, message):
        work = json.loads(message)
        with open(os.environ["ASKRIGOR_HERMES_TEST_CAPTURE"], "w", encoding="utf-8", newline="") as handle:
            json.dump({"kwargs": self.kwargs, "work": work, "message": message}, handle, ensure_ascii=False)
        return {"completed": True, "api_calls": 0, "final_response": json.dumps({"synthetic_kind": work["semantic_work"]["kind"]})}
`, "utf8");

      for (const semanticWork of semanticWorkFixtures()) {
        const policyInputs = await createResearchSemanticPolicyInputs({
          kind: semanticWork.kind,
          expectedProtocols: binding
        });
        const work = {
          session_id: SESSION,
          state_digest: STATE,
          ...policyInputs,
          research_context: `synthetic ${semanticWork.kind} fixture`,
          evidence_context: { source: `synthetic ${semanticWork.kind} evidence` },
          response_contract: researchSemanticResponseContract(semanticWork.kind),
          semantic_work: semanticWork
        };
        const serialized = serializeHermesSemanticWorkerInput(work);
        const result = spawnSync("python3", [BRIDGE], {
          cwd: directory,
          input: serialized,
          env: {
            PATH: process.env.PATH,
            LANG: "C.UTF-8",
            HERMES_ASKRIGOR_CHECKOUT: checkout,
            HERMES_ASKRIGOR_PROVIDER: "synthetic-provider",
            HERMES_ASKRIGOR_MODEL: "synthetic-model",
            HERMES_ASKRIGOR_API_KEY: "synthetic-api-key",
            ASKRIGOR_HERMES_TEST_CAPTURE: capture
          },
          encoding: "utf8",
          maxBuffer: 4 * 1_024 * 1_024
        });
        expect(result.status, `${semanticWork.kind}: ${result.stderr}`).toBe(0);
        const captured = JSON.parse(await readFile(capture, "utf8"));
        expect(captured.work).toEqual(work);
        expect(captured.work.instruction).toBe(policyInputs.instruction);
        expect(captured.work.response_contract).toEqual(
          researchSemanticResponseContract(semanticWork.kind)
        );
        expect(captured.work.policy_context).toEqual(policyInputs.policy_context);
        expect(captured.kwargs.ephemeral_system_prompt)
          .toBe(`${captured.kwargs.ephemeral_system_prompt.slice(
            0,
            -policyInputs.instruction.length - 2
          )}\n\n${policyInputs.instruction}`);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it("enforces the exact TypeScript input ceiling without truncation", async () => {
    const work = await moduleEnvelope();
    work.evidence_context = { padding: "" };
    const initial = serializeHermesSemanticWorkerInput(work);
    (work.evidence_context as { padding: string }).padding = "x".repeat(
      HERMES_SEMANTIC_INPUT_MAX_BYTES - initial.byteLength
    );
    const exact = serializeHermesSemanticWorkerInput(work);
    expect(exact.byteLength).toBe(HERMES_SEMANTIC_INPUT_MAX_BYTES);
    (work.evidence_context as { padding: string }).padding += "x";
    expect(() => serializeHermesSemanticWorkerInput(work))
      .toThrow("INPUT_TOO_LARGE");
  });

  it("rejects malformed policy-bound envelopes at the concrete adapter", async () => {
    const valid = await moduleEnvelope();
    const cases: unknown[] = [];
    const missing = structuredClone(valid) as Record<string, unknown>;
    delete missing.policy_context;
    missing.evidence_context = { policy_context: valid.policy_context };
    cases.push(missing);
    const duplicate = structuredClone(valid) as any;
    duplicate.policy_context.documents[1] = duplicate.policy_context.documents[0];
    cases.push(duplicate);
    const badBytes = structuredClone(valid) as any;
    badBytes.policy_context.documents[2].utf8_bytes += 1;
    cases.push(badBytes);
    const badHash = structuredClone(valid) as any;
    badHash.policy_context.documents[3].sha256 = "0".repeat(64);
    cases.push(badHash);
    const badDigest = structuredClone(valid) as any;
    badDigest.policy_context.context_sha256 = "0".repeat(64);
    cases.push(badDigest);
    const badInstruction = structuredClone(valid) as any;
    badInstruction.instruction += " changed";
    cases.push(badInstruction);
    const badContract = structuredClone(valid) as any;
    badContract.response_contract = {};
    cases.push(badContract);
    for (const candidate of cases) {
      expect(() => serializeHermesSemanticWorkerInput(candidate)).toThrow(
        /POLICY_INPUT_(?:REQUIRED|INVALID)/u
      );
    }
  });
});

async function moduleEnvelope() {
  const [universal, hrp] = await Promise.all([
    getProtocolManifest("universal"),
    getProtocolManifest("hrp")
  ]);
  const semanticWork = semanticWorkFixtures()[0]!;
  const policyInputs = await createResearchSemanticPolicyInputs({
    kind: semanticWork.kind,
    expectedProtocols: protocolBindingsFromManifests(universal, hrp)
  });
  return {
    session_id: SESSION,
    state_digest: STATE,
    ...policyInputs,
    response_contract: researchSemanticResponseContract(semanticWork.kind),
    semantic_work: semanticWork,
    evidence_context: { source: "synthetic fixture" }
  };
}

function semanticWorkFixtures(): ResearchSemanticWork[] {
  const d = (character: string) => character.repeat(64);
  const videoId = "ABCDEFGHIJK";
  const program = {
    components: "synthetic component",
    dose_or_intensity: "synthetic dose",
    frequency: "synthetic frequency",
    duration: "synthetic duration",
    supervision: "synthetic supervision",
    adherence_or_fidelity: "synthetic adherence",
    cointerventions: "synthetic cointerventions",
    stage_or_baseline: "synthetic baseline",
    outcome: "synthetic outcome",
    horizon: "synthetic horizon",
    care_stage: "synthetic care stage"
  };
  return [
    {
      kind: "module_applicability",
      package: {
        package_version: "askrigor_module_applicability_v1",
        state_digest: STATE,
        unresolved_module_ids: ["FORUM_SIGNAL"]
      }
    },
    {
      kind: "candidate_screening",
      package: {
        package_version: "askrigor_candidate_screening_v1",
        state_digest: STATE,
        discovery_digest: d("b"),
        candidates: [{
          video_id: videoId,
          canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
          channel_id: "synthetic-channel",
          channel_title: "Synthetic channel",
          title: "Synthetic candidate",
          metadata_access_status: "complete",
          origins: [{
            source: "NATIVE_YOUTUBE",
            frontier_id: d("c"),
            query_ids: ["native_query_01"],
            query_linkage: "EXACT_SEARCH_RESULT"
          }],
          target_distance: "exact",
          stage_distance: "exact",
          provisional_treatment_class: "synthetic class",
          provisional_claim_summary: "synthetic claim",
          program,
          program_description_status: "PARTIAL_PROVISIONAL",
          program_signature: d("d")
        }]
      }
    },
    {
      kind: "formal_source_screening",
      package: {
        package_version: "askrigor_formal_source_screening_v1",
        state_digest: STATE,
        formal_frontier_digest: d("b"),
        sources_total: 1,
        sources_pending_before: 1,
        sources: [{
          source_id: d("c"),
          hypothesis_ids: [d("d")],
          origins: [{
            provider: "pubmed",
            provider_record_id: "synthetic-record",
            canonical_url: "https://example.test/source",
            hypothesis_ids: [d("d")],
            provider_access_status: "complete",
            source_record_hash: d("e")
          }],
          identity: {
            pmid: "1",
            identity_status: "PROVIDER_REPORTED",
            identity_hash: d("f")
          },
          abstract_visibility: "ABSTRACT_PRESENT"
        }]
      }
    },
    {
      kind: "formal_method_audit",
      package: {
        package_version: "askrigor_formal_method_audit_v1",
        state_digest: STATE,
        source_id: d("b"),
        source_kind: "SCIENTIFIC_STUDY",
        audit_kind: "STUDY",
        document_handle: `aft1_${"A".repeat(32)}`,
        source_primary_identifier: "10.1234/synthetic",
        source_content_sha256: d("c"),
        source_block_count: 1,
        source_segment_count: 1,
        full_text_exhausted: true
      }
    },
    {
      kind: "formal_claim_recalculation",
      package: {
        package_version: "askrigor_formal_claim_recalculation_v1",
        state_digest: STATE,
        source_id: d("b"),
        doi: "10.1234/synthetic",
        document_handle: `aft1_${"B".repeat(32)}`,
        source_primary_identifier: "10.1234/synthetic",
        source_content_sha256: d("c"),
        method_audit_sha256: d("d"),
        external_receipt_payload_sha256: d("e"),
        external_bundle_hash: d("f"),
        external_study_identity_hash: d("1"),
        linked_work_complete: true
      }
    },
    {
      kind: "video_evidence_synthesis",
      package: {
        package_version: "askrigor_video_evidence_v1",
        state_digest: STATE,
        evidence_basis_digest: d("b"),
        video_id: videoId,
        canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
        title: "Synthetic video",
        channel_title: "Synthetic channel",
        transcript_receipt_sha256: d("c"),
        discussion_receipt_sha256: d("d"),
        transcript_record_count: 1,
        discussion_analysis_record_count: 0
      }
    },
    {
      kind: "bidirectional_iteration",
      package: {
        package_version: "askrigor_bidirectional_iteration_v1",
        state_digest: STATE,
        evidence_basis_digest: d("b"),
        round_number: 1,
        community_evidence: [{
          evidence_ref_id: d("c"),
          video_id: videoId,
          program_signature: d("d"),
          treatment_class: "synthetic class",
          provisional_claim_summary: "synthetic claim",
          transcript_status: "COMPLETE",
          transcript_receipt_sha256: d("e"),
          discussion_status: "COMPLETE",
          discussion_receipt_sha256: d("f")
        }],
        formal_evidence: [{
          evidence_ref_id: d("1"),
          reference_kind: "HYPOTHESIS_WITHOUT_SOURCE",
          hypothesis_id: d("2"),
          program_signature: d("3"),
          treatment_class: "synthetic class",
          claim_summary: "synthetic formal claim",
          source_kind: "hypothesis",
          linked_work_digest: d("4"),
          claim_capability_status: "BOUNDED_ONLY",
          possible_decision_impact: "unknown"
        }]
      }
    },
    {
      kind: "bidirectional_return_assessment",
      package: {
        package_version: "askrigor_bidirectional_return_assessment_v1",
        state_digest: STATE,
        evidence_basis_digest: d("b"),
        round_id: d("c"),
        transfer_id: d("d"),
        discriminator_query: "synthetic discriminator",
        result_receipts: [{
          evidence_ref_id: d("e"),
          video_id: videoId,
          records_returned_cumulative: 1,
          result_rolling_sha256: d("f"),
          page_receipt_hashes: [d("1")]
        }]
      }
    },
    {
      kind: "treatment_landscape",
      package: {
        package_version: "askrigor_treatment_landscape_v1",
        state_digest: STATE,
        evidence_basis_digest: d("b"),
        attempt: 1,
        research_target: "synthetic target",
        discovery_batches: [{
          batch_id: "batch-1",
          query_or_scope: "synthetic scope",
          candidate_video_ids: [videoId],
          access_status: "complete",
          exhausted: true,
          next_cursor_present: false,
          server_direction_hints: ["benefit"]
        }],
        candidates: [{
          video_id: videoId,
          title: "Synthetic video",
          channel_id: "synthetic-channel",
          channel_title: "Synthetic channel",
          published_at: "2026-09-08",
          treatment_class_id: "class-1",
          treatment_class_label: "synthetic class",
          fingerprint_id: "fingerprint-1",
          program,
          materiality: "MATERIAL",
          selection_status: "SELECTED",
          discovery_batch_ids: ["batch-1"],
          screening_rationale: "synthetic rationale"
        }],
        selected_videos: [{
          video_id: videoId,
          fingerprint_id: "fingerprint-1",
          transcript_receipt_sha256: d("c"),
          discussion_receipt_sha256: d("d")
        }],
        bidirectional_status: "COMPLETE"
      }
    },
    {
      kind: "report_synthesis",
      package: {
        package_version: "askrigor_report_synthesis_v1",
        state_digest: STATE,
        evidence_basis_digest: d("b"),
        report_scope: "bounded_nonranking_report",
        research_target: "synthetic target",
        selected_video_count: 1,
        formal_source_count: 1,
        required_limitation_count: 1
      }
    }
  ];
}
