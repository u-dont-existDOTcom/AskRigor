#!/usr/bin/env python3
"""Use the pinned public MAST prompt and metric implementation without copying it."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path


METRIC_NAMES = (
    "F1_weighted",
    "Precision_weighted",
    "Recall_weighted",
    "Severe_rate",
    "Moderate_rate",
    "Mild_rate",
    "Offrubric_rate",
)


def request() -> dict:
    value = json.load(sys.stdin)
    if not isinstance(value, dict):
        raise ValueError("bridge request must be an object")
    return value


def import_mast(mast_root: Path):
    sys.path.insert(0, str(mast_root))
    from benchmarks.donoharm.judge import metrics  # pylint: disable=import-outside-toplevel
    from benchmarks.donoharm.judge.stages import match_helpers  # pylint: disable=import-outside-toplevel

    return metrics, match_helpers


def effective_score(option: dict) -> int:
    return option.get("placement") or option.get("score") or option["grade"]


def json_metric(value):
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def render(payload: dict) -> dict:
    mast_root = Path(payload["mastRoot"]).resolve()
    family_id = str(payload["familyId"])
    response_path = Path(payload["responsePath"]).resolve()
    _, helpers = import_mast(mast_root)
    rubric_path = mast_root / "benchmarks" / "donoharm" / "dataset" / "rubrics" / f"{family_id}.json"
    template_path = mast_root / "benchmarks" / "donoharm" / "judge" / "prompts" / "extract_match.md"
    rubric = json.loads(rubric_path.read_text(encoding="utf-8"))
    template = template_path.read_text(encoding="utf-8")
    response = response_path.read_text(encoding="utf-8")
    guidance = helpers.load_guidance(family_id)
    rendered = (
        template.replace("{CASE_PRESENTATION}", rubric.get("case", {}).get("presentation", ""))
        .replace("{GUIDANCE}", helpers.format_guidance_header(guidance))
        .replace("{RESPONSE}", response)
        .replace(
            "{RUBRIC_OPTIONS}",
            helpers.format_rubric_concept_first(rubric, guidance=guidance),
        )
    )
    return {"renderedMatchingPrompt": rendered}


def metrics(payload: dict) -> dict:
    mast_root = Path(payload["mastRoot"]).resolve()
    family_id = str(payload["familyId"])
    judgment = payload["judgment"]
    mast_metrics, _ = import_mast(mast_root)
    rubric_path = mast_root / "benchmarks" / "donoharm" / "dataset" / "rubrics" / f"{family_id}.json"
    rubric = json.loads(rubric_path.read_text(encoding="utf-8"))

    judge_options = [
        {
            "id": option["id"],
            "matched": option["matchVerdict"] in ("yes", "partial"),
            "partial": option["matchVerdict"] == "partial",
            "evidence": option["evidence"] or "",
        }
        for option in judgment["options"]
    ]
    response_actions = [
        {
            "number": action["id"],
            "action": action["action"],
            "category": action["category"],
            "match": action["match"],
            "score": 0 if action["match"] else 5,
            "rationale": "",
        }
        for action in judgment["actions"]
    ]
    harms = mast_metrics.compute_harm(judge_options, rubric)
    computed = mast_metrics.compute_metrics_for_case(harms, response_actions, rubric)
    selected = {name: json_metric(computed[name]) for name in METRIC_NAMES}

    scores = {option["id"]: effective_score(option) for option in rubric["options"]}
    severe_rubric_commission = any(
        scores[option["id"]] == 1 and option["matchVerdict"] in ("yes", "partial")
        for option in judgment["options"]
    )
    severe_nonrubric_commission = any(
        item["severeCommission"] for item in judgment["nonRubricSafety"]
    )
    return {
        "metricLabel": "NONOFFICIAL_PROJECTED_MAST_METRICS",
        "metrics": selected,
        "responseLevelSevereCommission": severe_rubric_commission or severe_nonrubric_commission,
    }


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"render", "metrics"}:
        raise ValueError("usage: mast-blinded-evaluator-source-bridge.py render|metrics")
    payload = request()
    result = render(payload) if sys.argv[1] == "render" else metrics(payload)
    json.dump(result, sys.stdout, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
