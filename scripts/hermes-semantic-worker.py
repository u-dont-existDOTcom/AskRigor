#!/usr/bin/env python3
"""One-shot, no-tools Hermes bridge for an AskRigor semantic work package.

This process deliberately has no AskRigor orchestration credential and cannot
advance a research session. It emits only model JSON plus non-authoritative API
call diagnostics; the TypeScript adapter and AskRigor server validate all work.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
from typing import Any


MAX_INPUT_BYTES = 512 * 1024
MAX_OUTPUT_BYTES = 512 * 1024


class WorkerFailure(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise WorkerFailure("CONFIGURATION_INCOMPLETE")
    return value


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if len(lines) >= 3 and lines[-1].strip() == "```":
            cleaned = "\n".join(lines[1:-1])
            if cleaned.lstrip().startswith("json"):
                cleaned = cleaned.lstrip()[4:].lstrip()
    value = json.loads(cleaned)
    if not isinstance(value, dict):
        raise WorkerFailure("MODEL_OUTPUT_NOT_OBJECT")
    return value


def system_prompt() -> str:
    return """You are a bounded semantic worker for AskRigor.

You are not protocol authority, completion authority, or a medical adviser.
You have no tools. Use only the exact server-issued public/source-linked work
package and transient evidence_context in the user message. The
response_contract is the exact JSON Schema for this turn. Do not invent missing
evidence or fields. Return exactly one JSON object and no Markdown.

The object must contain exactly:
- contract_version: \"askrigor_hermes_semantic_result_v1\"
- session_id: copied exactly from the work envelope
- state_digest: copied exactly from the work envelope
- work_type: copied exactly from semantic_work.kind
- submission: the exact submission object for that work type

For module_applicability, decide every unresolved_module_id exactly once and
return package_version \"askrigor_module_applicability_v1\", plus decisions
with module_id, applicability REQUIRED or NOT_REQUIRED, and a concise rationale.
Never demote a module based on evidence quality or convenience.

For candidate_screening, decide every packaged candidate exactly once and
return package_version \"askrigor_candidate_screening_v1\", the exact
discovery_digest, and decisions with video_id, materiality, redundancy,
optional duplicate_of_video_id, selection_status, and rationale. Selection is
for nonredundant information value, not credibility or efficacy. Preserve
program differences and mark missing program detail as missing.

For video_evidence_synthesis, inspect only the supplied exact transcript
segments and de-identified public discussion sample. Cite only supplied record
hashes. Bind every creator and community finding to its own exact structured
program, including a program-description finding for each material
creator-described implementation; do not collapse distinct exercise,
rehabilitation, diet, procedure, or multimodal programs into a generic
category. Treat creator and commenter outcomes as attributed reports, not proof
of efficacy or rates.

For formal_source_screening, classify every packaged source exactly once using
its exact identity and relevance. For formal_method_audit, inspect the complete
supplied document index, cite exact block IDs, and assess the actual design,
population, intervention, comparator, outcome, horizon, execution, missingness,
analysis, and limitations. Peer review, publication venue, randomization label,
or an abstract is not itself evidence that a study is reliable or supports a
broader treatment class. For formal_claim_recalculation, use both the exact
document and exact external audit; preserve corrected, retracted, unresolved,
and claim-local restrictions.

For bidirectional_iteration and bidirectional_return_assessment, return only
source-grounded transfers or assessments from the supplied frontier. Missing
or inaccessible evidence is not negative evidence. For treatment_landscape,
keep every materially different program fingerprint separate and report
uncovered or likely answer-changing work honestly.

For report_synthesis, write plain-language population-level evidence research.
Use only exact current capabilities and source-linked creator/community
findings. Keep population/stage, complete program implementation,
outcome/horizon, uncertainty, alternatives, harms, and access limits explicit.
Do not use jargon or internal status codes in ordinary wording. Do not give an
individual diagnosis or directive. A bounded report cannot rank treatments or
state the blocked comparative conclusion. Every approach must use the exact
same structured program as its linked claims; never pool materially different
programs under one label.

Never emit complete, synthesis_permitted, completed-operation counts/lists,
provider completion, final prose, credentials, or any field not required by
the submission contract. The AskRigor server alone determines what happens
next and whether a final response is allowed."""


def main() -> int:
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise WorkerFailure("INPUT_TOO_LARGE")
    work = json.loads(raw.decode("utf-8"))
    if not isinstance(work, dict):
        raise WorkerFailure("INPUT_NOT_OBJECT")

    checkout = required_environment("HERMES_ASKRIGOR_CHECKOUT")
    provider = required_environment("HERMES_ASKRIGOR_PROVIDER")
    model = required_environment("HERMES_ASKRIGOR_MODEL")
    api_key = required_environment("HERMES_ASKRIGOR_API_KEY")
    base_url = os.environ.get("HERMES_ASKRIGOR_BASE_URL", "").strip() or None
    sys.path.insert(0, checkout)

    # Upstream occasionally writes progress text. Keep stdout a one-object IPC
    # channel and discard incidental logs rather than forwarding them.
    captured_stdout = io.StringIO()
    captured_stderr = io.StringIO()
    with contextlib.redirect_stdout(captured_stdout), contextlib.redirect_stderr(captured_stderr):
        from run_agent import AIAgent

        agent = AIAgent(
            base_url=base_url,
            api_key=api_key,
            provider=provider,
            model=model,
            max_iterations=1,
            max_tokens=16_000,
            enabled_toolsets=[],
            save_trajectories=False,
            verbose_logging=False,
            quiet_mode=True,
            ephemeral_system_prompt=system_prompt(),
            skip_context_files=True,
            skip_memory=True,
            skip_background_review=True,
            checkpoints_enabled=False,
            run_budget_seconds=120,
        )
        result = agent.run_conversation(
            json.dumps(work, separators=(",", ":"), ensure_ascii=False)
        )

    if not isinstance(result, dict) or not result.get("completed", False):
        raise WorkerFailure("MODEL_TURN_INCOMPLETE")
    model_output = parse_json_object(str(result.get("final_response", "")))
    output = {
        "model_output": model_output,
        "api_calls": int(result.get("api_calls", 0)),
    }
    encoded = json.dumps(output, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(encoded) > MAX_OUTPUT_BYTES:
        raise WorkerFailure("OUTPUT_TOO_LARGE")
    sys.stdout.buffer.write(encoded)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # Do not echo provider exceptions, request bodies, environment, or
        # credentials across the subprocess boundary. The exception class is a
        # bounded diagnostic and contains no provider message.
        failure_class = error.code if isinstance(error, WorkerFailure) else type(error).__name__
        sys.stderr.write(f"Hermes semantic worker failed: {failure_class}\n")
        raise SystemExit(1)
