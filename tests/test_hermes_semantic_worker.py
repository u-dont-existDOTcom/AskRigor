#!/usr/bin/env python3
"""Offline contract tests for the repository Hermes Python bridge."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "scripts" / "hermes-semantic-worker.py"
MAX_INPUT_BYTES = 2 * 1024 * 1024
SESSION_ID = "ars1_" + "A" * 32
STATE_DIGEST = "a" * 64
INSTRUCTION = "Exact server instruction café\r\nsecond line"


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def policy_document(document_id: str, path: str, text: str, protocol: bool = False) -> dict:
    encoded = text.encode("utf-8")
    document = {
        "document_id": document_id,
        "path": path,
        "text": text,
        "utf8_bytes": len(encoded),
        "sha256": sha256_bytes(encoded),
    }
    if protocol:
        document["protocol_manifest"] = {
            "name": document_id,
            "version": "test-v1",
            "revisionDate": "2026-09-08",
            "sha256": document["sha256"],
        }
    return document


def valid_work() -> dict:
    documents = [
        policy_document(
            "universal",
            "protocols/Universal_Instructions.xml",
            "\ufeff<universal>café\r\nline</universal>\n",
            True,
        ),
        policy_document(
            "hrp",
            "protocols/HRP_Full.xml",
            "<hrp>naïf\nline\r\n</hrp>\n",
            True,
        ),
        policy_document(
            "project_router",
            "project/PROJECT_INSTRUCTIONS.md",
            "\ufeffProject café\r\nrouter\n",
        ),
        policy_document(
            "forum_signal_module",
            "project/FORUM_SIGNAL_MODULE.md",
            "Forum naïf\nsignal\r\n",
        ),
    ]
    unsigned = {
        "context_version": "askrigor_semantic_policy_context_v1",
        "documents": documents,
    }
    return {
        "session_id": SESSION_ID,
        "state_digest": STATE_DIGEST,
        "instruction": INSTRUCTION,
        "policy_context": {
            **unsigned,
            "context_sha256": sha256_bytes(canonical_json(unsigned).encode("utf-8")),
        },
        "research_context": "synthetic research fixture",
        "evidence_context": {"source": "synthetic evidence fixture"},
        "response_contract": {"type": "object"},
        "semantic_work": {
            "kind": "module_applicability",
            "package": {
                "package_version": "askrigor_module_applicability_v1",
                "state_digest": STATE_DIGEST,
                "unresolved_module_ids": ["FORUM_SIGNAL"],
            },
        },
    }


def serialized_work(work: dict) -> bytes:
    return json.dumps(work, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def fit_to_exact_limit(work: dict) -> bytes:
    fitted = json.loads(json.dumps(work))
    fitted["evidence_context"] = {"padding": ""}
    initial = serialized_work(fitted)
    fitted["evidence_context"]["padding"] = "x" * (MAX_INPUT_BYTES - len(initial))
    encoded = serialized_work(fitted)
    if len(encoded) != MAX_INPUT_BYTES:
        raise AssertionError("fixture did not reach exact input limit")
    return encoded


class HermesSemanticWorkerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.checkout = self.directory / "fake-hermes"
        self.checkout.mkdir()
        self.capture = self.directory / "agent-capture.json"
        fake_agent = '''
import json
import os

class AIAgent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def run_conversation(self, message):
        work = json.loads(message)
        with open(os.environ["ASKRIGOR_HERMES_TEST_CAPTURE"], "w", encoding="utf-8", newline="") as handle:
            json.dump({"kwargs": self.kwargs, "message": message, "work": work}, handle, ensure_ascii=False)
        if os.environ.get("ASKRIGOR_HERMES_TEST_MODE") == "OUTPUT_TOO_LARGE":
            return {
                "completed": True,
                "api_calls": 0,
                "final_response": json.dumps({"padding": "x" * (512 * 1024)}),
            }
        response = {
            "contract_version": "askrigor_hermes_semantic_result_v1",
            "session_id": work["session_id"],
            "state_digest": work["state_digest"],
            "work_type": "module_applicability",
            "submission": {
                "package_version": "askrigor_module_applicability_v1",
                "decisions": [{
                    "module_id": "FORUM_SIGNAL",
                    "applicability": "REQUIRED",
                    "rationale": "Synthetic offline bridge fixture."
                }]
            }
        }
        return {"completed": True, "api_calls": 0, "final_response": json.dumps(response)}
'''
        (self.checkout / "run_agent.py").write_text(fake_agent, encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_bridge(
        self,
        payload: bytes,
        mode: str | None = None,
    ) -> subprocess.CompletedProcess[bytes]:
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "LANG": "C.UTF-8",
            "HERMES_ASKRIGOR_CHECKOUT": str(self.checkout),
            "HERMES_ASKRIGOR_PROVIDER": "synthetic-provider",
            "HERMES_ASKRIGOR_MODEL": "synthetic-model",
            "HERMES_ASKRIGOR_API_KEY": "synthetic-api-key",
            "ASKRIGOR_HERMES_TEST_CAPTURE": str(self.capture),
            **({} if mode is None else {"ASKRIGOR_HERMES_TEST_MODE": mode}),
        }
        return subprocess.run(
            [sys.executable, str(BRIDGE)],
            input=payload,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=environment,
            cwd=self.directory,
            check=False,
        )

    def test_delivers_exact_instruction_policy_and_work_to_fake_agent(self) -> None:
        work = valid_work()
        result = self.run_bridge(serialized_work(work))
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8"))
        capture = json.loads(self.capture.read_text(encoding="utf-8"))
        expected_prompt = self.system_prompt_from_bridge() + "\n\n" + INSTRUCTION
        self.assertEqual(capture["kwargs"]["ephemeral_system_prompt"], expected_prompt)
        self.assertEqual(capture["work"], work)
        self.assertEqual(json.loads(capture["message"]), work)
        self.assertEqual(capture["kwargs"]["enabled_toolsets"], [])
        self.assertTrue(capture["kwargs"]["skip_memory"])
        self.assertTrue(capture["kwargs"]["skip_context_files"])
        self.assertTrue(capture["kwargs"]["skip_background_review"])

    def test_missing_top_level_policy_cannot_be_replaced_by_evidence(self) -> None:
        work = valid_work()
        work["evidence_context"] = {
            "instruction": work.pop("instruction"),
            "policy_context": work.pop("policy_context"),
        }
        result = self.run_bridge(serialized_work(work))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Hermes semantic worker failed: POLICY_INPUT_REQUIRED", result.stderr)
        self.assertFalse(self.capture.exists())

    def test_context_digest_tampering_fails_before_agent_import(self) -> None:
        work = valid_work()
        work["policy_context"]["context_sha256"] = "0" * 64
        result = self.run_bridge(serialized_work(work))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Hermes semantic worker failed: POLICY_INPUT_INVALID", result.stderr)
        self.assertFalse(self.capture.exists())

    def test_rejects_each_malformed_policy_shape_before_agent_import(self) -> None:
        def missing_document(work: dict) -> None:
            work["policy_context"]["documents"].pop()

        def duplicate_document(work: dict) -> None:
            work["policy_context"]["documents"][1] = dict(
                work["policy_context"]["documents"][0]
            )

        def changed_text(work: dict) -> None:
            work["policy_context"]["documents"][2]["text"] += "changed"

        def changed_byte_count(work: dict) -> None:
            work["policy_context"]["documents"][2]["utf8_bytes"] += 1

        def changed_hash(work: dict) -> None:
            work["policy_context"]["documents"][3]["sha256"] = "0" * 64

        def changed_manifest(work: dict) -> None:
            work["policy_context"]["documents"][0]["protocol_manifest"]["sha256"] = (
                "0" * 64
            )

        for mutate in (
            missing_document,
            duplicate_document,
            changed_text,
            changed_byte_count,
            changed_hash,
            changed_manifest,
        ):
            with self.subTest(mutation=mutate.__name__):
                work = valid_work()
                mutate(work)
                result = self.run_bridge(serialized_work(work))
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    b"Hermes semantic worker failed: POLICY_INPUT_INVALID",
                    result.stderr,
                )
                self.assertFalse(self.capture.exists())

    def test_rejects_malformed_json_before_agent_import(self) -> None:
        result = self.run_bridge(b"{")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Hermes semantic worker failed: JSONDecodeError", result.stderr)
        self.assertFalse(self.capture.exists())

    def test_accepts_exact_input_limit_and_rejects_one_byte_above(self) -> None:
        exact = fit_to_exact_limit(valid_work())
        accepted = self.run_bridge(exact)
        self.assertEqual(accepted.returncode, 0, accepted.stderr.decode("utf-8"))
        self.capture.unlink()
        rejected = self.run_bridge(exact + b" ")
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn(b"Hermes semantic worker failed: INPUT_TOO_LARGE", rejected.stderr)
        self.assertFalse(self.capture.exists())

    def test_preserves_the_separate_output_limit(self) -> None:
        result = self.run_bridge(serialized_work(valid_work()), "OUTPUT_TOO_LARGE")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Hermes semantic worker failed: OUTPUT_TOO_LARGE", result.stderr)

    @staticmethod
    def system_prompt_from_bridge() -> str:
        namespace: dict = {"__name__": "hermes_semantic_worker_test_import"}
        source = BRIDGE.read_text(encoding="utf-8")
        exec(compile(source, str(BRIDGE), "exec"), namespace)
        return namespace["system_prompt"]()


if __name__ == "__main__":
    unittest.main()
