#!/usr/bin/env python3
"""Jev research-quality comparison. Offline only: no network or provider calls."""
from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

FLAGS = (
    "human_comparator_omission",
    "dose_response_omission",
    "denominator_causality",
    "context_source_role",
    "surrogate_overclaim",
    "regime_confusion",
    "unnecessary_steering",
    "missing_continuation",
    "species_conflation",
    "expert_forecasts_omitted",
    "bio_compute_omitted",
)
MODELS = ("existing", "jev", "stronger")
PROMPTS = {
    "human_comparator_omission": "When the question is about human risk, does the answer overlook relevant human comparison evidence in the supplied context? Mechanism-only questions need not survey clinical patients.",
    "dose_response_omission": "Does the answer omit a consequential dose-response trend already visible in the supplied source summary?",
    "denominator_causality": "Does it conflate exposure percentages, dose, events, infusions, people or causal incidence?",
    "context_source_role": "Does it treat background or alternative-cause evidence as direct causal support without an adequate bridge?",
    "surrogate_overclaim": "Does it overinterpret a histology, behavior or cell-marker surrogate as an established human functional outcome?",
    "regime_confusion": "Does it wrongly equate interventions or exposures that differ materially in timing, temperature, route or formulation?",
    "unnecessary_steering": "Does it ask an avoidable blocking clarification despite a sufficient user-specified default?",
    "missing_continuation": "If the answer is preliminary and high-impact gaps remain, does it fail to name concrete next evidence steps and why they matter?",
    "species_conflation": "Does it conflate distinct biological species or unverified commercial labels?",
    "expert_forecasts_omitted": "Does it omit expert forecasts from a question where future expert predictions are relevant?",
    "bio_compute_omitted": "Does it overlook living-neuron or biological computing as a relevant candidate in an AI consciousness possibility question?",
}


def load_inputs(case_path: Path, gold_path: Path) -> tuple[list[dict], dict[str, list[str]]]:
    cases = json.loads(case_path.read_text(encoding="utf-8"))["cases"]
    gold_rows = json.loads(gold_path.read_text(encoding="utf-8"))["gold"]
    labels = {entry["id"]: entry["required_flags"] for entry in gold_rows}
    ids = [entry["id"] for entry in cases]
    if len(ids) != len(set(ids)) or len(labels) != len(gold_rows) or set(ids) != set(labels):
        raise ValueError("Cases and adjudications must have a unique one-to-one ID correspondence.")
    if any(entry.get("cohort") not in ("DEVELOPMENT", "CONFIRMATION") for entry in cases):
        raise ValueError("Every case must declare its evidence cohort.")
    for entry in cases:
        if any(flag not in FLAGS for flag in labels[entry["id"]]):
            raise ValueError("Unknown independently adjudicated issue tag.")
        if not all(entry.get(key) for key in ("question", "context", "answer")):
            raise ValueError("Missing question, candidate answer, or source context.")
    return cases, labels


def build_jev_packet(case: dict) -> dict:
    # Strict allowlist: provenance labels, cohort, source ID, and ground truth never leave.
    return {
        "model": "typesafe/jev-1.13",
        "state": {
            "research_question": case["question"],
            "source_context": case["context"],
            "candidate_answer": case["answer"],
        },
        "questions": {
            flag: {"type": "noul", "instructions": prompt}
            for flag, prompt in PROMPTS.items()
        },
        "provider": {"allow_fallbacks": False},
    }


def prepare(cases: list[dict], target: Path) -> None:
    with target.open("w", encoding="utf-8") as output:
        for case in cases:
            packet = build_jev_packet(case)
            assert "required_flags" not in json.dumps(packet)
            # The same factual input should go to the stronger evaluator, blinded
            # to source issue, prior answers, and gold labels.
            output.write(json.dumps({
                "case_id": case["id"], "jev_request": packet,
                "stronger_input": packet["state"],
                "stronger_task": "Independently list supported research-quality errors using the named issue taxonomy; return flags only. A good answer can have no flags.",
                "allowed_flags": FLAGS,
            }, ensure_ascii=False) + "\n")


def normalize_jev_responses(path: Path, target: Path, threshold: float = 0.5) -> None:
    """Convert previously collected OpenRouter Decisions JSONL into comparable records.
    Each input: {case_id, response: {id, answers, usage}, latency_ms}, or
    {case_id, error_code, fallback_identity}. Never calls a provider.
    """
    if not 0.0 < threshold < 1.0:
        raise ValueError("The prespecified Noul threshold must be between 0 and 1.")
    with target.open("w", encoding="utf-8") as output:
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            row = json.loads(line)
            case_id = row.get("case_id")
            raw = row.get("response")
            if row.get("error_code"):
                output.write(json.dumps({
                    "case_id": case_id, "model": "jev", "status": "ERROR", "flags": [],
                    "fallback_identity": row.get("fallback_identity"),
                    "error_code": row["error_code"],
                }) + "\n")
                continue
            if not isinstance(raw, dict) or not isinstance(raw.get("answers"), dict):
                raise ValueError(f"Invalid Jev response on line {number}.")
            if not raw.get("id"):
                raise ValueError(f"Missing provider response ID on line {number}.")
            flags = []
            for flag in FLAGS:
                answer = raw["answers"].get(flag)
                value = answer.get("noul") if isinstance(answer, dict) else None
                if isinstance(value, bool):
                    value = 1.0 if value else 0.0
                if not isinstance(value, (int, float)) or not 0 <= value <= 1:
                    raise ValueError(f"Invalid or missing Noul {flag} on line {number}.")
                if value >= threshold:
                    flags.append(flag)
            usage = raw.get("usage") or {}
            output.write(json.dumps({
                "case_id": case_id, "model": "jev", "status": "OK",
                "flags": flags, "response_id": raw["id"],
                "latency_ms": row.get("latency_ms"), "cost_usd": usage.get("cost"),
            }) + "\n")


def load_predictions(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid predictions line {line_number}: {exc}") from exc
    return rows


def quantile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * percentile))]


def score(cases: list[dict], gold: dict[str, list[str]], predictions: list[dict]) -> dict:
    known = {case["id"] for case in cases}
    deduped = []
    seen_provider = set()
    for row in predictions:
        case_id, model = row.get("case_id"), row.get("model")
        if case_id not in known or model not in MODELS:
            raise ValueError("Unknown case or model in prediction.")
        if row.get("status") not in ("OK", "ERROR", "NOT_RUN"):
            raise ValueError("Model observation needs an explicit status.")
        flags = row.get("flags", [])
        if not isinstance(flags, list) or any(flag not in FLAGS for flag in flags):
            raise ValueError("Unrecognized research-quality flag.")
        if row["status"] != "OK" and flags:
            raise ValueError("A failed or unrun model cannot assert issue flags.")
        identity = row.get("response_id") or row.get("fallback_identity")
        if row["status"] == "OK" and model == "jev" and not row.get("response_id"):
            raise ValueError("An OK Jev response needs a provider response_id.")
        if identity is not None:
            key = (model, str(identity))
            if key in seen_provider:
                continue
            seen_provider.add(key)
        latency = row.get("latency_ms")
        cost = row.get("cost_usd")
        if latency is not None and (not isinstance(latency, (int, float)) or latency < 0):
            raise ValueError("Invalid latency.")
        if cost is not None and (not isinstance(cost, (int, float)) or cost < 0):
            raise ValueError("Invalid provider cost.")
        deduped.append(row)
    groups = defaultdict(list)
    for row in deduped:
        groups[(row["model"], row["case_id"])].append(row)

    verdict = {}
    by_model = {}
    for model in MODELS:
        evaluated = 0
        tp = tn = fp = fn = tags_found = tags_needed = extra_flags = 0
        errors = 0
        latency = []
        provider_cost = 0.0
        for case in cases:
            group = groups.get((model, case["id"]), [])
            errors += sum(r["status"] == "ERROR" for r in group)
            provider_cost += sum(float(r.get("cost_usd", 0) or 0) for r in group)
            latency += [float(r["latency_ms"]) for r in group
                        if r["status"] == "OK" and r.get("latency_ms") is not None]
            ok = next((r for r in group if r["status"] == "OK"), None)
            if not ok:
                continue  # unknown, not a zero and not a false negative
            evaluated += 1
            actual = set(gold[case["id"]])
            predicted = set(ok.get("flags", []))
            predicted_positive = bool(predicted)
            actual_positive = bool(actual)
            if predicted_positive and actual_positive:
                tp += 1
            elif predicted_positive:
                fp += 1
            elif actual_positive:
                fn += 1
            else:
                tn += 1
            tags_found += len(actual & predicted)
            tags_needed += len(actual)
            extra_flags += len(predicted - actual)
            verdict[(model, case["id"])] = predicted
        by_model[model] = {
            "cases_scored": evaluated, "cases_unknown": len(cases) - evaluated,
            "true_positive": tp, "true_negative": tn, "false_positive": fp, "false_negative": fn,
            "tag_recall": (tags_found / tags_needed) if tags_needed else None,
            "spurious_tags": extra_flags, "provider_failures": errors,
            "median_latency_ms": statistics.median(latency) if latency else None,
            "p90_latency_ms": quantile(latency, .9),
            "cumulative_observed_cost_usd": round(provider_cost, 9),
        }

    compared = {}
    for challenger in ("jev", "stronger"):
        matched = [case for case in cases if
                   ("existing", case["id"]) in verdict and (challenger, case["id"]) in verdict]
        catches = introduced = 0
        for case in matched:
            expected = set(gold[case["id"]])
            baseline = verdict[("existing", case["id"])]
            alternate = verdict[(challenger, case["id"])]
            baseline_correct = baseline == expected
            alternate_correct = alternate == expected
            catches += int(not baseline_correct and alternate_correct)
            introduced += int(baseline_correct and not alternate_correct)
        compared[challenger] = {
            "matched_cases": len(matched),
            "net_new_exact_catches": catches,
            "errors_introduced": introduced,
        }
    return {
        "schema": "jev-research-quality-report-v1",
        "fixture_kind": "deidentified development reconstructions; not actual original model outputs",
        "distinct_case_count": len(cases),
        "development_cases": sum(x["cohort"] == "DEVELOPMENT" for x in cases),
        "confirmation_cases": sum(x["cohort"] == "CONFIRMATION" for x in cases),
        "deduplicated_model_observation_rows": len(deduped),
        "unique_jev_provider_observations": sum(
            row["model"] == "jev" and row["status"] != "NOT_RUN"
            for row in deduped
        ),
        "by_model": by_model, "comparison": compared,
        "independent_value_demonstrated": False if by_model["jev"]["cases_scored"] == 0 else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "score", "ingest-jev"))
    parser.add_argument("--cases", type=Path, default=Path(__file__).with_name("cases.json"))
    parser.add_argument("--gold", type=Path, default=Path(__file__).with_name("gold.json"))
    parser.add_argument("--predictions", type=Path, default=Path(__file__).with_name("predictions.jsonl"))
    parser.add_argument("--input", type=Path, help="Existing Jev Decisions response JSONL, for offline ingestion only")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    cases, gold = load_inputs(args.cases, args.gold)
    if args.action == "prepare":
        prepare(cases, args.out)
        print(f"Prepared {len(cases)} deidentified blind packets (zero inference calls).")
        return
    if args.action == "ingest-jev":
        if args.input is None:
            parser.error("ingest-jev requires --input")
        normalize_jev_responses(args.input, args.out)
        print("Existing Jev responses normalized offline; no provider called.")
        return
    report = score(cases, gold, load_predictions(args.predictions))
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "cases": report["distinct_case_count"],
        "actual_jev_comparisons": report["by_model"]["jev"]["cases_scored"],
        "actual_stronger_comparisons": report["by_model"]["stronger"]["cases_scored"],
        "incremental_matches": report["comparison"]["jev"]["matched_cases"],
    }))


if __name__ == "__main__":
    main()
