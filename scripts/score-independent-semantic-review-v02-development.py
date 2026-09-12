#!/usr/bin/env python3
"""Score the frozen v0.2 prospective semantic-review DEVELOPMENT run."""

from __future__ import annotations

import collections
import datetime
import json
import statistics
from pathlib import Path
from typing import Any

RUN = Path("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract")
DEFECT = {"missing", "distorted"}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def ratio(n: int, d: int) -> dict[str, Any]:
    return {"numerator": n, "denominator": d, "rate": None if d == 0 else n / d}


def pointer_exists(value: Any, pointer: str) -> bool:
    current = value
    for raw in pointer[1:].split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list) and token.isdigit() and int(token) < len(current):
            current = current[int(token)]
        elif isinstance(current, dict) and token in current:
            current = current[token]
        else:
            return False
    return True


gold_file = RUN / "gold/adjudicated-gold-v021-corrected.json"
dispatch_file = RUN / "reviewer/dispatch-order.json"
if not gold_file.exists() or not dispatch_file.exists():
    raise RuntimeError("Adjudicated gold and frozen reviewer dispatch are required")
gold_doc = load(gold_file)
if gold_doc["conflict_count"] != 0:
    raise RuntimeError("Conflicted gold cannot be scored")
gold = {item["candidate_id"]: item for item in gold_doc["candidates"]}
dispatch = load(dispatch_file)
output_root = RUN / "reviewer/outputs"
directories = sorted(path for path in output_root.iterdir() if path.is_dir() and path.name[:3].isdigit())
if len(directories) != dispatch["planned_sessions"]:
    raise RuntimeError(f"Expected {dispatch['planned_sessions']} reviewer trials, found {len(directories)}")

rows: list[dict[str, Any]] = []
message_ids: set[str] = set()
for directory in directories:
    provenance = load(directory / "provenance.json")
    candidate_id = provenance["candidate_id"]
    candidate_gold = gold[candidate_id]
    submission = load(directory / "normalized-output.json")
    valid = (directory / "ingest-receipt.json").exists()
    if valid == (directory / "ingest-error.json").exists():
        raise RuntimeError(f"{directory.name}: expected one ingest receipt or error")
    findings = {item["dimension"]: item for item in submission.get("findings", [])}
    statuses = [item["status"] for item in findings.values()]
    semantic = "INDETERMINATE" if not valid or "uncertain" in statuses else "DEFECT" if any(s in DEFECT for s in statuses) else "FAITHFUL"
    hard_defects = [item for item in findings.values() if item["status"] in DEFECT and item["affects_hard_invariant"]]
    hard_uncertain = [item for item in findings.values() if item["status"] == "uncertain" and item["affects_hard_invariant"]]
    disposition = "INDETERMINATE" if not valid or hard_uncertain else "BLOCK" if hard_defects else "PASS"
    expected_defect = candidate_gold["construction_class"] == "DEFECTIVE"
    dimension = candidate_gold["construction_dimension"]
    dimension_finding = findings.get(dimension)
    exact_defect = bool(valid and dimension_finding and dimension_finding["status"] in DEFECT)
    exact_hard = bool(exact_defect and dimension_finding["affects_hard_invariant"])
    hard_relevance_error = bool(
        valid
        and ((expected_defect and exact_defect and not exact_hard) or (not expected_defect and disposition == "BLOCK"))
    )

    work = load(RUN / f"candidates/{candidate_id}/work-package.json")
    source, state = work["source_packet"], work["candidate_state"]
    spans_total = spans_valid = pointers_total = pointers_valid = 0
    for finding in findings.values():
        for span in finding["source_spans"]:
            spans_total += 1
            spans_valid += int(0 <= span["start"] < span["end"] <= len(source) and source[span["start"]:span["end"]] == span["quote"])
        for pointer in finding["state_paths"]:
            pointers_total += 1
            pointers_valid += int(pointer_exists(state, pointer))

    assistant_id = provenance["controller_observed"]["assistant_message_id"]
    if assistant_id in message_ids:
        raise RuntimeError(f"Duplicate assistant message identity: {assistant_id}")
    message_ids.add(assistant_id)
    start = datetime.datetime.fromisoformat(provenance["timestamps"]["submitted_at"].replace("Z", "+00:00"))
    end = datetime.datetime.fromisoformat(provenance["timestamps"]["completed_at"].replace("Z", "+00:00"))
    rows.append({
        "trial_id": provenance["trial_id"], "sequence": provenance["sequence"], "replicate": provenance["replicate"],
        "candidate_id": candidate_id, "dimension": dimension, "gold": "HARD_DEFECT" if expected_defect else "FAITHFUL",
        "valid": valid, "semantic_class": semantic, "hard_disposition": disposition,
        "exact_defect_detected": exact_defect, "exact_hard_defect_detected": exact_hard,
        "hard_defect_false_pass": expected_defect and disposition == "PASS",
        "faithful_state_false_block": not expected_defect and disposition == "BLOCK",
        "hard_relevance_error": hard_relevance_error,
        "source_spans_valid": spans_valid, "source_spans_total": spans_total,
        "json_pointers_valid": pointers_valid, "json_pointers_total": pointers_total,
        "latency_seconds": (end - start).total_seconds(),
        "evidence": [{"dimension": item["dimension"], "status": item["status"], "affects_hard_invariant": item["affects_hard_invariant"], "rationale": item["rationale"]} for item in findings.values()]
    })

def majority(values: list[Any]) -> Any:
    counts = collections.Counter(values)
    value, count = counts.most_common(1)[0]
    return value if count >= 2 else None


by_candidate: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
for row in rows:
    by_candidate[row["candidate_id"]].append(row)
majority_rows = []
for candidate_id, trials in sorted(by_candidate.items()):
    if len(trials) != 3:
        raise RuntimeError(f"{candidate_id}: expected three reviewer trials")
    majority_rows.append({
        "candidate_id": candidate_id, "dimension": trials[0]["dimension"], "gold": trials[0]["gold"],
        "semantic_class": majority([trial["semantic_class"] for trial in trials]),
        "hard_disposition": majority([trial["hard_disposition"] for trial in trials]),
        "exact_hard_defect_detected": majority([trial["exact_hard_defect_detected"] for trial in trials]),
        "replicate_semantic_agreement": len({trial["semantic_class"] for trial in trials}) == 1,
        "replicate_hard_agreement": len({trial["hard_disposition"] for trial in trials}) == 1,
    })

hard_trials = [row for row in rows if row["gold"] == "HARD_DEFECT"]
faithful_trials = [row for row in rows if row["gold"] == "FAITHFUL"]
hard_majority = [row for row in majority_rows if row["gold"] == "HARD_DEFECT"]
faithful_majority = [row for row in majority_rows if row["gold"] == "FAITHFUL"]
dimensions = {}
for dimension in sorted({row["dimension"] for row in rows}):
    dh = [row for row in hard_trials if row["dimension"] == dimension]
    df = [row for row in faithful_trials if row["dimension"] == dimension]
    mh = [row for row in hard_majority if row["dimension"] == dimension]
    mf = [row for row in faithful_majority if row["dimension"] == dimension]
    dimensions[dimension] = {
        "individual_hard_sensitivity": ratio(sum(row["exact_hard_defect_detected"] for row in dh), len(dh)),
        "individual_faithful_specificity": ratio(sum(row["semantic_class"] == "FAITHFUL" for row in df), len(df)),
        "majority_hard_sensitivity": ratio(sum(row["exact_hard_defect_detected"] is True for row in mh), len(mh)),
        "majority_faithful_specificity": ratio(sum(row["semantic_class"] == "FAITHFUL" for row in mf), len(mf)),
    }

summary = {
    "schema_version": 1, "scorer_version": "askrigor_independent_semantic_review_v02_development_scorer_v1",
    "phase": "DEVELOPMENT_DISCOVERY", "candidate_states": len(by_candidate), "reviewer_trials": len(rows),
    "individual": {
        "hard_defect_sensitivity": ratio(sum(row["exact_hard_defect_detected"] for row in hard_trials), len(hard_trials)),
        "faithful_state_specificity": ratio(sum(row["semantic_class"] == "FAITHFUL" for row in faithful_trials), len(faithful_trials)),
        "hard_defect_false_pass": ratio(sum(row["hard_defect_false_pass"] for row in hard_trials), len(hard_trials)),
        "faithful_state_false_block": ratio(sum(row["faithful_state_false_block"] for row in faithful_trials), len(faithful_trials)),
        "indeterminate": ratio(sum(row["semantic_class"] == "INDETERMINATE" for row in rows), len(rows)),
        "hard_relevance_errors": ratio(sum(row["hard_relevance_error"] for row in rows), len(rows)),
    },
    "majority": {
        "hard_defect_sensitivity": ratio(sum(row["exact_hard_defect_detected"] is True for row in hard_majority), len(hard_majority)),
        "faithful_state_specificity": ratio(sum(row["semantic_class"] == "FAITHFUL" for row in faithful_majority), len(faithful_majority)),
        "hard_defect_false_pass": ratio(sum(row["hard_disposition"] == "PASS" for row in hard_majority), len(hard_majority)),
        "faithful_state_false_block": ratio(sum(row["hard_disposition"] == "BLOCK" for row in faithful_majority), len(faithful_majority)),
        "indeterminate": ratio(sum(row["semantic_class"] == "INDETERMINATE" for row in majority_rows), len(majority_rows)),
    },
    "evidence_location_validity": {
        "source_spans": ratio(sum(row["source_spans_valid"] for row in rows), sum(row["source_spans_total"] for row in rows)),
        "json_pointers": ratio(sum(row["json_pointers_valid"] for row in rows), sum(row["json_pointers_total"] for row in rows)),
    },
    "replicate_agreement": {
        "semantic": ratio(sum(row["replicate_semantic_agreement"] for row in majority_rows), len(majority_rows)),
        "hard_disposition": ratio(sum(row["replicate_hard_agreement"] for row in majority_rows), len(majority_rows)),
    },
    "latency_seconds": {
        "median": statistics.median(row["latency_seconds"] for row in rows),
        "mean": statistics.mean(row["latency_seconds"] for row in rows),
        "min": min(row["latency_seconds"] for row in rows), "max": max(row["latency_seconds"] for row in rows),
    },
    "per_dimension": dimensions,
}
dump(RUN / "results/trial-scoring-ledger.json", {"schema_version": 1, "trials": rows})
dump(RUN / "results/majority-scoring-ledger.json", {"schema_version": 1, "candidates": majority_rows})
dump(RUN / "results/summary.json", summary)
print(json.dumps(summary, indent=2))
