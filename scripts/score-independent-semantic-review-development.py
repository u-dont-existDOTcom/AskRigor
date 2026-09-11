#!/usr/bin/env python3
"""Score the frozen Independent Semantic Representation Review DEVELOPMENT run."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import statistics
from pathlib import Path
from typing import Any


SCORER_VERSION = "askrigor_independent_semantic_review_development_scorer_v1"
DEFECT_STATUSES = {"missing", "distorted"}
DETERMINATE_CLASSES = {"DEFECT", "FAITHFUL"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ratio(numerator: int, denominator: int) -> dict[str, Any]:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "rate": None if denominator == 0 else numerator / denominator,
    }


def percentile(values: list[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    low = math.floor(index)
    high = math.ceil(index)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (index - low)


def json_pointer_exists(value: Any, pointer: str) -> bool:
    current = value
    for raw_token in pointer[1:].split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list):
            if not token.isdigit() or int(token) >= len(current):
                return False
            current = current[int(token)]
        elif isinstance(current, dict) and token in current:
            current = current[token]
        else:
            return False
    return True


def load_gold(run_root: Path) -> dict[str, dict[str, Any]]:
    natural = read_json(run_root / "gold/natural/natural-state-adjudication-gold.json")
    mutations = read_json(run_root / "gold/mutations/mutation-state-gold.json")
    gold: dict[str, dict[str, Any]] = {}
    for candidate in natural["candidates"]:
        defects = {
            finding["dimension"]: finding
            for finding in candidate["gold_findings"]
            if finding["status"] in DEFECT_STATUSES
        }
        gold[candidate["candidate_id"]] = {
            "track": "NATURAL",
            "semantic": candidate["semantic_representation_gold"],
            "hard": candidate["hard_relevance_gold"],
            "defect_dimensions": sorted(defects),
            "hard_dimensions": sorted(
                dimension
                for dimension, finding in defects.items()
                if finding["affects_hard_invariant"]
            ),
            "uncertain_dimensions": sorted(
                finding["dimension"]
                for finding in candidate["gold_findings"]
                if finding["status"] == "uncertain"
            ),
            "controlled_dimension": None,
        }
    for candidate in mutations["candidates"]:
        defective = candidate["semantic_representation_gold"] == "DEFECTIVE"
        gold[candidate["candidate_id"]] = {
            "track": "MUTATION",
            "semantic": candidate["semantic_representation_gold"],
            "hard": candidate["hard_relevance_gold"],
            "defect_dimensions": [candidate["dimension"]] if defective else [],
            "hard_dimensions": [candidate["dimension"]]
            if candidate["hard_relevance_gold"] == "HARD_DEFECT"
            else [],
            "uncertain_dimensions": [],
            "controlled_dimension": candidate["dimension"],
        }
    return gold


def classify_submission(valid: bool, findings: dict[str, dict[str, Any]]) -> tuple[str, str]:
    if not valid:
        return "INDETERMINATE", "INDETERMINATE"
    defects = [finding for finding in findings.values() if finding["status"] in DEFECT_STATUSES]
    uncertainty = [finding for finding in findings.values() if finding["status"] == "uncertain"]
    semantic = "DEFECT" if defects else "INDETERMINATE" if uncertainty else "FAITHFUL"
    hard_defects = [finding for finding in defects if finding["affects_hard_invariant"]]
    hard_uncertainty = [finding for finding in uncertainty if finding["affects_hard_invariant"]]
    hard = "BLOCK" if hard_defects else "INDETERMINATE" if hard_uncertainty else "PASS"
    return semantic, hard


def score_trials(run_root: Path, gold: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    output_root = run_root / "reviewer-outputs"
    trial_dirs = sorted(
        path for path in output_root.iterdir() if path.is_dir() and path.name[:3].isdigit()
    )
    if len(trial_dirs) != 138:
        raise RuntimeError(f"expected 138 eligible trial directories, found {len(trial_dirs)}")
    rows: list[dict[str, Any]] = []
    seen_conversations: set[str] = set()
    for trial_dir in trial_dirs:
        provenance = read_json(trial_dir / "provenance.json")
        submission = read_json(trial_dir / "normalized-output.json")
        candidate_id = provenance["candidate_id"]
        candidate_gold = gold[candidate_id]
        receipt_exists = (trial_dir / "ingest-receipt.json").exists()
        error_exists = (trial_dir / "ingest-error.json").exists()
        if receipt_exists == error_exists:
            raise RuntimeError(f"{trial_dir.name}: expected exactly one ingest receipt or error")
        valid = receipt_exists
        findings = {finding["dimension"]: finding for finding in submission["findings"]}
        semantic_class, hard_disposition = classify_submission(valid, findings)
        review_defect_dimensions = sorted(
            dimension for dimension, finding in findings.items() if finding["status"] in DEFECT_STATUSES
        )
        review_hard_dimensions = sorted(
            dimension
            for dimension, finding in findings.items()
            if finding["status"] in DEFECT_STATUSES and finding["affects_hard_invariant"]
        )
        gold_defect_dimensions = set(candidate_gold["defect_dimensions"])
        gold_hard_dimensions = set(candidate_gold["hard_dimensions"])
        matching_defect_dimensions = sorted(set(review_defect_dimensions) & gold_defect_dimensions)
        matching_hard_dimensions = sorted(set(review_hard_dimensions) & gold_hard_dimensions)

        work_package = read_json(run_root / f"candidates/{candidate_id}/work-package.json")
        source = work_package["source_packet"]
        state = work_package.get("candidate_state", work_package.get("raw_candidate_state_json"))
        source_spans_valid = 0
        source_spans_total = 0
        source_findings_valid = 0
        pointer_values_valid = 0
        pointer_values_total = 0
        pointer_findings_valid = 0
        for finding in submission["findings"]:
            source_ok = True
            pointer_ok = True
            if finding["status"] == "not_applicable":
                if finding["source_spans"] or finding["state_paths"] or finding["affects_hard_invariant"]:
                    source_ok = False
                    pointer_ok = False
            else:
                if not finding["source_spans"]:
                    source_ok = False
                for span in finding["source_spans"]:
                    source_spans_total += 1
                    span_ok = (
                        span["end"] > span["start"]
                        and span["end"] <= len(source)
                        and source[span["start"] : span["end"]] == span["quote"]
                    )
                    source_spans_valid += int(span_ok)
                    source_ok = source_ok and span_ok
                if finding["status"] == "missing" and finding["state_paths"]:
                    pointer_ok = False
                if finding["status"] in {"faithful", "distorted"} and not finding["state_paths"]:
                    pointer_ok = False
                for pointer in finding["state_paths"]:
                    pointer_values_total += 1
                    value_ok = json_pointer_exists(state, pointer)
                    pointer_values_valid += int(value_ok)
                    pointer_ok = pointer_ok and value_ok
            source_findings_valid += int(source_ok)
            pointer_findings_valid += int(pointer_ok)

        conversation = provenance["controller_observed"]["conversation_identity_sha256"]
        if conversation in seen_conversations:
            raise RuntimeError(f"duplicate eligible conversation identity in {trial_dir.name}")
        seen_conversations.add(conversation)
        invalid_reason = None
        if error_exists:
            invalid_reason = read_json(trial_dir / "ingest-error.json")
        latency_ms = provenance["timestamps"].get("latency_ms")
        row = {
            "schema_version": 1,
            "scorer_version": SCORER_VERSION,
            "trial_id": provenance["trial_id"],
            "sequence": provenance["sequence"],
            "replicate": provenance["replicate"],
            "candidate_id": candidate_id,
            "track": candidate_gold["track"],
            "controlled_dimension": candidate_gold["controlled_dimension"],
            "gold_semantic_class": candidate_gold["semantic"],
            "gold_hard_class": candidate_gold["hard"],
            "gold_defect_dimensions": candidate_gold["defect_dimensions"],
            "gold_hard_dimensions": candidate_gold["hard_dimensions"],
            "review_valid": valid,
            "review_semantic_class": semantic_class,
            "review_hard_disposition": hard_disposition,
            "review_defect_dimensions": review_defect_dimensions,
            "review_hard_dimensions": review_hard_dimensions,
            "matching_gold_defect_dimensions": matching_defect_dimensions if valid else [],
            "matching_gold_hard_dimensions": matching_hard_dimensions if valid else [],
            "exact_semantic_defect_detected": valid and bool(matching_defect_dimensions),
            "exact_hard_defect_detected": valid and bool(matching_hard_dimensions),
            "hard_defect_false_pass": (
                candidate_gold["hard"] == "HARD_DEFECT" and valid and hard_disposition == "PASS"
            ),
            "faithful_state_false_block": (
                candidate_gold["semantic"] == "FAITHFUL" and valid and hard_disposition == "BLOCK"
            ),
            "hard_relevance_evaluable": (
                valid and candidate_gold["semantic"] == "DEFECTIVE" and bool(matching_defect_dimensions)
            ),
            "hard_relevance_correct": None,
            "source_evidence": {
                "submission_valid": source_findings_valid == len(submission["findings"]),
                "finding_valid": source_findings_valid,
                "finding_total": len(submission["findings"]),
                "span_valid": source_spans_valid,
                "span_total": source_spans_total,
            },
            "json_pointer_evidence": {
                "submission_valid": pointer_findings_valid == len(submission["findings"]),
                "finding_valid": pointer_findings_valid,
                "finding_total": len(submission["findings"]),
                "pointer_valid": pointer_values_valid,
                "pointer_total": pointer_values_total,
            },
            "provenance": {
                "conversation_identity_sha256": conversation,
                "assistant_message_id": provenance["controller_observed"]["assistant_message_id"],
                "assistant_model_slug": provenance["controller_observed"]["assistant_model_slug"],
                "visible_model_label": provenance["controller_observed"]["visible_model_label"],
                "visible_thinking_setting": provenance["controller_observed"]["visible_thinking_setting"],
                "submitted_at": provenance["timestamps"]["submitted_at"],
                "completed_at": provenance["timestamps"]["completed_at"],
                "latency_ms": latency_ms,
                "raw_output_path": provenance["output"]["path"],
                "raw_output_sha256": provenance["output"]["sha256"],
                "normalized_output_path": str(trial_dir / "normalized-output.json"),
            },
            "invalid_submission": invalid_reason,
        }
        if row["hard_relevance_evaluable"]:
            expected_hard = candidate_gold["hard"] == "HARD_DEFECT"
            actual_hard = bool(set(review_hard_dimensions) & gold_defect_dimensions)
            row["hard_relevance_correct"] = expected_hard == actual_hard
        rows.append(row)
    if len(seen_conversations) != 138:
        raise RuntimeError("eligible reviewer sessions are not all independent")
    return rows


def majority_rows(trials: list[dict[str, Any]], gold: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for trial in trials:
        grouped[trial["candidate_id"]].append(trial)
    rows: list[dict[str, Any]] = []
    for candidate_id, candidate_gold in gold.items():
        candidate_trials = sorted(grouped[candidate_id], key=lambda row: row["replicate"])
        if len(candidate_trials) != 3:
            raise RuntimeError(f"{candidate_id}: expected three eligible trials")
        valid_trials = [trial for trial in candidate_trials if trial["review_valid"]]
        semantic_counts = collections.Counter(trial["review_semantic_class"] for trial in valid_trials)
        if semantic_counts["DEFECT"] >= 2:
            semantic_majority = "DEFECT"
        elif semantic_counts["FAITHFUL"] >= 2:
            semantic_majority = "FAITHFUL"
        else:
            semantic_majority = "INDETERMINATE"
        hard_counts = collections.Counter(trial["review_hard_disposition"] for trial in valid_trials)
        if hard_counts["BLOCK"] >= 2:
            hard_majority = "BLOCK"
        elif hard_counts["PASS"] >= 2:
            hard_majority = "PASS"
        else:
            hard_majority = "INDETERMINATE"
        exact_defect_votes = sum(trial["exact_semantic_defect_detected"] for trial in valid_trials)
        exact_hard_votes = sum(trial["exact_hard_defect_detected"] for trial in valid_trials)
        hard_relevance_votes = [
            trial["hard_relevance_correct"]
            for trial in valid_trials
            if trial["hard_relevance_evaluable"]
        ]
        hard_relevance_majority_correct = None
        if len(hard_relevance_votes) >= 2:
            hard_relevance_majority_correct = sum(value is True for value in hard_relevance_votes) >= 2
        rows.append(
            {
                "schema_version": 1,
                "scorer_version": SCORER_VERSION,
                "candidate_id": candidate_id,
                "track": candidate_gold["track"],
                "controlled_dimension": candidate_gold["controlled_dimension"],
                "gold_semantic_class": candidate_gold["semantic"],
                "gold_hard_class": candidate_gold["hard"],
                "gold_defect_dimensions": candidate_gold["defect_dimensions"],
                "gold_hard_dimensions": candidate_gold["hard_dimensions"],
                "valid_review_count": len(valid_trials),
                "trial_sequences": [trial["sequence"] for trial in candidate_trials],
                "trial_semantic_classes": [trial["review_semantic_class"] for trial in candidate_trials],
                "trial_hard_dispositions": [trial["review_hard_disposition"] for trial in candidate_trials],
                "semantic_majority": semantic_majority,
                "hard_disposition_majority": hard_majority,
                "exact_semantic_defect_vote_count": exact_defect_votes,
                "exact_hard_defect_vote_count": exact_hard_votes,
                "exact_semantic_defect_majority": exact_defect_votes >= 2,
                "exact_hard_defect_majority": exact_hard_votes >= 2,
                "hard_defect_false_pass": (
                    candidate_gold["hard"] == "HARD_DEFECT" and hard_majority == "PASS"
                ),
                "faithful_state_false_block": (
                    candidate_gold["semantic"] == "FAITHFUL" and hard_majority == "BLOCK"
                ),
                "hard_relevance_majority_evaluable": len(hard_relevance_votes) >= 2,
                "hard_relevance_majority_correct": hard_relevance_majority_correct,
                "three_review_exact_semantic_agreement": len(
                    {trial["review_semantic_class"] for trial in candidate_trials}
                )
                == 1,
                "two_of_three_or_better_semantic_agreement": max(
                    collections.Counter(
                        trial["review_semantic_class"] for trial in candidate_trials
                    ).values()
                )
                >= 2,
            }
        )
    return sorted(rows, key=lambda row: row["candidate_id"])


def metrics_for_track(
    trials: list[dict[str, Any]], majorities: list[dict[str, Any]], track: str
) -> dict[str, Any]:
    selected_trials = trials if track == "ALL" else [row for row in trials if row["track"] == track]
    selected_majorities = (
        majorities if track == "ALL" else [row for row in majorities if row["track"] == track]
    )
    gold_defect_trials = [row for row in selected_trials if row["gold_semantic_class"] == "DEFECTIVE"]
    determinate_defect_trials = [
        row
        for row in gold_defect_trials
        if row["review_valid"] and row["review_semantic_class"] in DETERMINATE_CLASSES
    ]
    hard_trials = [row for row in selected_trials if row["gold_hard_class"] == "HARD_DEFECT"]
    determinate_hard_trials = [
        row
        for row in hard_trials
        if row["review_valid"] and row["review_hard_disposition"] in {"BLOCK", "PASS"}
    ]
    faithful_trials = [row for row in selected_trials if row["gold_semantic_class"] == "FAITHFUL"]
    determinate_faithful_trials = [
        row
        for row in faithful_trials
        if row["review_valid"] and row["review_semantic_class"] in DETERMINATE_CLASSES
    ]
    valid_faithful_trials = [row for row in faithful_trials if row["review_valid"]]
    hard_relevance_trials = [row for row in selected_trials if row["hard_relevance_evaluable"]]

    gold_defect_candidates = [
        row for row in selected_majorities if row["gold_semantic_class"] == "DEFECTIVE"
    ]
    hard_candidates = [row for row in selected_majorities if row["gold_hard_class"] == "HARD_DEFECT"]
    faithful_candidates = [
        row for row in selected_majorities if row["gold_semantic_class"] == "FAITHFUL"
    ]
    hard_relevance_candidates = [
        row for row in selected_majorities if row["hard_relevance_majority_evaluable"]
    ]
    return {
        "individual": {
            "exact_semantic_defect_sensitivity": ratio(
                sum(row["exact_semantic_defect_detected"] for row in determinate_defect_trials),
                len(determinate_defect_trials),
            ),
            "semantic_defect_class_sensitivity": ratio(
                sum(row["review_semantic_class"] == "DEFECT" for row in determinate_defect_trials),
                len(determinate_defect_trials),
            ),
            "exact_hard_defect_sensitivity": ratio(
                sum(row["exact_hard_defect_detected"] for row in determinate_hard_trials),
                len(determinate_hard_trials),
            ),
            "operational_hard_block_sensitivity": ratio(
                sum(row["review_hard_disposition"] == "BLOCK" for row in determinate_hard_trials),
                len(determinate_hard_trials),
            ),
            "faithful_state_specificity": ratio(
                sum(row["review_semantic_class"] == "FAITHFUL" for row in determinate_faithful_trials),
                len(determinate_faithful_trials),
            ),
            "hard_defect_false_pass_rate": ratio(
                sum(row["hard_defect_false_pass"] for row in determinate_hard_trials),
                len(determinate_hard_trials),
            ),
            "faithful_state_false_block_rate": ratio(
                sum(row["faithful_state_false_block"] for row in valid_faithful_trials),
                len(valid_faithful_trials),
            ),
            "indeterminate_rate": ratio(
                sum(row["review_semantic_class"] == "INDETERMINATE" for row in selected_trials),
                len(selected_trials),
            ),
            "invalid_submission_rate": ratio(
                sum(not row["review_valid"] for row in selected_trials), len(selected_trials)
            ),
            "hard_relevance_classification_accuracy_conditional_on_exact_defect_detection": ratio(
                sum(row["hard_relevance_correct"] is True for row in hard_relevance_trials),
                len(hard_relevance_trials),
            ),
        },
        "majority": {
            "exact_semantic_defect_sensitivity": ratio(
                sum(row["exact_semantic_defect_majority"] for row in gold_defect_candidates),
                len(gold_defect_candidates),
            ),
            "semantic_defect_class_sensitivity": ratio(
                sum(row["semantic_majority"] == "DEFECT" for row in gold_defect_candidates),
                len(gold_defect_candidates),
            ),
            "exact_hard_defect_sensitivity": ratio(
                sum(row["exact_hard_defect_majority"] for row in hard_candidates),
                len(hard_candidates),
            ),
            "operational_hard_block_sensitivity": ratio(
                sum(row["hard_disposition_majority"] == "BLOCK" for row in hard_candidates),
                len(hard_candidates),
            ),
            "faithful_state_specificity": ratio(
                sum(row["semantic_majority"] == "FAITHFUL" for row in faithful_candidates),
                sum(row["semantic_majority"] != "INDETERMINATE" for row in faithful_candidates),
            ),
            "hard_defect_false_pass_rate": ratio(
                sum(row["hard_defect_false_pass"] for row in hard_candidates), len(hard_candidates)
            ),
            "faithful_state_false_block_rate": ratio(
                sum(row["faithful_state_false_block"] for row in faithful_candidates),
                len(faithful_candidates),
            ),
            "indeterminate_rate": ratio(
                sum(row["semantic_majority"] == "INDETERMINATE" for row in selected_majorities),
                len(selected_majorities),
            ),
            "hard_relevance_classification_accuracy_conditional_on_exact_defect_detection": ratio(
                sum(row["hard_relevance_majority_correct"] is True for row in hard_relevance_candidates),
                len(hard_relevance_candidates),
            ),
        },
    }


def build_summary(
    run_root: Path, trials: list[dict[str, Any]], majorities: list[dict[str, Any]]
) -> dict[str, Any]:
    spans_valid = sum(row["source_evidence"]["span_valid"] for row in trials)
    spans_total = sum(row["source_evidence"]["span_total"] for row in trials)
    source_findings_valid = sum(row["source_evidence"]["finding_valid"] for row in trials)
    source_findings_total = sum(row["source_evidence"]["finding_total"] for row in trials)
    pointers_valid = sum(row["json_pointer_evidence"]["pointer_valid"] for row in trials)
    pointers_total = sum(row["json_pointer_evidence"]["pointer_total"] for row in trials)
    pointer_findings_valid = sum(row["json_pointer_evidence"]["finding_valid"] for row in trials)
    pointer_findings_total = sum(row["json_pointer_evidence"]["finding_total"] for row in trials)
    exact_latencies = [
        row["provenance"]["latency_ms"] / 1000
        for row in trials
        if isinstance(row["provenance"]["latency_ms"], (int, float))
    ]
    dimension_rows: list[dict[str, Any]] = []
    dimensions = sorted(
        {
            row["controlled_dimension"]
            for row in trials
            if row["track"] == "MUTATION" and row["controlled_dimension"] is not None
        }
    )
    for dimension in dimensions:
        dimension_trials = [
            row
            for row in trials
            if row["track"] == "MUTATION" and row["controlled_dimension"] == dimension
        ]
        hard = [row for row in dimension_trials if row["gold_hard_class"] == "HARD_DEFECT"]
        faithful = [row for row in dimension_trials if row["gold_semantic_class"] == "FAITHFUL"]
        valid_faithful = [row for row in faithful if row["review_valid"]]
        exact_dimension_determinate = [
            row
            for row in valid_faithful
            if row["review_semantic_class"] != "INDETERMINATE"
        ]
        dimension_majorities = [
            row
            for row in majorities
            if row["track"] == "MUTATION" and row["controlled_dimension"] == dimension
        ]
        hard_majority = next(row for row in dimension_majorities if row["gold_hard_class"] == "HARD_DEFECT")
        faithful_majority = next(
            row for row in dimension_majorities if row["gold_semantic_class"] == "FAITHFUL"
        )
        dimension_rows.append(
            {
                "dimension": dimension,
                "individual_exact_hard_defect_sensitivity": ratio(
                    sum(row["exact_hard_defect_detected"] for row in hard), len(hard)
                ),
                "individual_whole_state_faithful_specificity": ratio(
                    sum(row["review_semantic_class"] == "FAITHFUL" for row in exact_dimension_determinate),
                    len(exact_dimension_determinate),
                ),
                "individual_same_dimension_faithful_specificity": None,
                "individual_faithful_false_block_rate": ratio(
                    sum(row["faithful_state_false_block"] for row in valid_faithful),
                    len(valid_faithful),
                ),
                "majority_exact_hard_defect_detected": hard_majority[
                    "exact_hard_defect_majority"
                ],
                "majority_whole_state_faithful_class": faithful_majority["semantic_majority"],
                "majority_faithful_hard_disposition": faithful_majority[
                    "hard_disposition_majority"
                ],
            }
        )
    # Fill same-dimension specificity directly from the normalized findings.
    for item in dimension_rows:
        dimension = item["dimension"]
        faithful_trials = [
            row
            for row in trials
            if row["track"] == "MUTATION"
            and row["controlled_dimension"] == dimension
            and row["gold_semantic_class"] == "FAITHFUL"
            and row["review_valid"]
        ]
        determinate = 0
        faithful_count = 0
        for row in faithful_trials:
            normalized = read_json(Path(row["provenance"]["normalized_output_path"]))
            finding = next(value for value in normalized["findings"] if value["dimension"] == dimension)
            if finding["status"] != "uncertain":
                determinate += 1
                faithful_count += int(finding["status"] in {"faithful", "not_applicable"})
        item["individual_same_dimension_faithful_specificity"] = ratio(
            faithful_count, determinate
        )

    model_strata: list[dict[str, Any]] = []
    for model in sorted({row["provenance"]["assistant_model_slug"] for row in trials}):
        model_trials = [row for row in trials if row["provenance"]["assistant_model_slug"] == model]
        model_strata.append(
            {
                "model_slug": model,
                "trials": len(model_trials),
                "metrics": metrics_for_track(model_trials, [], "ALL")["individual"],
            }
        )
    overall = metrics_for_track(trials, majorities, "ALL")
    strategy_a = (
        overall["majority"]["hard_defect_false_pass_rate"]["numerator"] >= 1
        or overall["majority"]["exact_semantic_defect_sensitivity"]["rate"] < 0.95
    )
    strategy = {
        "selected_priority": "A" if strategy_a else "UNRESOLVED",
        "action": "STOP_AND_IMPROVE_REVIEWER_CONTRACT" if strategy_a else "ROUTE_TO_PROJECT_MANAGER",
        "trigger_evidence": {
            "majority_hard_defect_false_passes": overall["majority"][
                "hard_defect_false_pass_rate"
            ]["numerator"],
            "majority_exact_semantic_defect_sensitivity": overall["majority"][
                "exact_semantic_defect_sensitivity"
            ],
        },
        "production_integration_permitted": False,
        "next_step": (
            "Prospectively revise and test the v0.1 review contract for exact predicate truth conditions, "
            "then rebuild the controlled mutation bases so every nominal faithful state is independently "
            "source-faithful before another DEVELOPMENT evaluation."
        ),
    }
    return {
        "schema_version": 1,
        "scorer_version": SCORER_VERSION,
        "scorer_path": str(Path(__file__)),
        "scorer_sha256": sha256(Path(__file__)),
        "phase": "DEVELOPMENT_DISCOVERY",
        "run_root": str(run_root),
        "frozen_inputs": {
            "pre_unblinding_output_freeze_sha256": sha256(
                run_root / "pre-unblinding-output-freeze.json"
            ),
            "scorer_unblinding_receipt_sha256": sha256(
                run_root / "scorer-unblinding-receipt.json"
            ),
            "natural_gold_sha256": sha256(
                run_root / "gold/natural/natural-state-adjudication-gold.json"
            ),
            "mutation_gold_sha256": sha256(
                run_root / "gold/mutations/mutation-state-gold.json"
            ),
        },
        "population": {
            "candidate_states": len(majorities),
            "eligible_review_trials": len(trials),
            "valid_review_trials": sum(row["review_valid"] for row in trials),
            "invalid_review_trials": sum(not row["review_valid"] for row in trials),
            "accepted_consumer_sessions": 141,
            "excluded_consumer_sessions": 3,
            "distinct_eligible_conversation_identities": len(
                {row["provenance"]["conversation_identity_sha256"] for row in trials}
            ),
        },
        "metrics": {
            "overall": overall,
            "natural": metrics_for_track(trials, majorities, "NATURAL"),
            "mutation": metrics_for_track(trials, majorities, "MUTATION"),
        },
        "evidence_contract": {
            "exact_source_span_object_validity": ratio(spans_valid, spans_total),
            "complete_source_evidence_finding_validity": ratio(
                source_findings_valid, source_findings_total
            ),
            "complete_source_evidence_submission_validity": ratio(
                sum(row["source_evidence"]["submission_valid"] for row in trials), len(trials)
            ),
            "exact_json_pointer_validity": ratio(pointers_valid, pointers_total),
            "complete_json_pointer_finding_validity": ratio(
                pointer_findings_valid, pointer_findings_total
            ),
            "complete_json_pointer_submission_validity": ratio(
                sum(row["json_pointer_evidence"]["submission_valid"] for row in trials), len(trials)
            ),
        },
        "agreement": {
            "three_reviewer_exact_semantic_agreement": ratio(
                sum(row["three_review_exact_semantic_agreement"] for row in majorities),
                len(majorities),
            ),
            "two_of_three_or_better_semantic_agreement": ratio(
                sum(row["two_of_three_or_better_semantic_agreement"] for row in majorities),
                len(majorities),
            ),
        },
        "latency": {
            "exact_latency_trials": len(exact_latencies),
            "bounded_or_unavailable_latency_trials": len(trials) - len(exact_latencies),
            "mean_seconds": statistics.mean(exact_latencies),
            "median_seconds": statistics.median(exact_latencies),
            "p95_seconds": percentile(exact_latencies, 0.95),
            "minimum_seconds": min(exact_latencies),
            "maximum_seconds": max(exact_latencies),
            "total_exact_session_hours": sum(exact_latencies) / 3600,
        },
        "session_overhead": {
            "planned_eligible_reviews": 138,
            "accepted_consumer_sessions": 141,
            "extra_accepted_sessions": 3,
            "reviews_per_candidate": 3,
        },
        "per_controlled_dimension": dimension_rows,
        "model_strata": model_strata,
        "strategy_decision": strategy,
        "integrity_interpretation": {
            "track2_faithful_negative_control_status": "CONTESTED_LOAD_BEARING",
            "reason": (
                "All 11 nominal faithful mutation states received at least one defect finding; "
                "the shared base omits the explicit compound Sol exposure identity and encodes "
                "the source upper-bound timing as a scalar. Raw frozen-gold scores remain reported, "
                "but Track 2 whole-state specificity is not a clean reviewer false-block estimate."
            ),
            "historical_gold_modified": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("run_root", type=Path)
    args = parser.parse_args()
    run_root = args.run_root
    gold = load_gold(run_root)
    trials = score_trials(run_root, gold)
    majorities = majority_rows(trials, gold)
    summary = build_summary(run_root, trials, majorities)
    results = run_root / "results"
    write_jsonl(results / "per-trial-scoring.jsonl", trials)
    write_jsonl(results / "per-candidate-majority.jsonl", majorities)
    write_json(results / "aggregate-summary.json", summary)
    print(json.dumps(summary["metrics"]["overall"], indent=2))


if __name__ == "__main__":
    main()
