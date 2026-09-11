#!/usr/bin/env python3
"""Normalize and fail-closed ingest one frozen v0.2 consumer output."""

from __future__ import annotations

import datetime
import json
import subprocess
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("usage: ingest-independent-semantic-review-v02-output.py <output-directory>")

output = Path(sys.argv[1])
run = Path("evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract")
provenance = json.loads((output / "provenance.json").read_text(encoding="utf-8"))
candidate_id = provenance["candidate_id"]

if not (output / "normalized-output.json").exists():
    subprocess.run(
        ["npx", "tsx", "scripts/normalize-independent-semantic-review-output.mts", str(output / "raw-output.txt")],
        check=True,
        stdout=subprocess.DEVNULL,
    )

receipt = output / "ingest-receipt.json"
error_path = output / "ingest-error.json"
if receipt.exists() or error_path.exists():
    raise SystemExit(f"ingest disposition already exists for {output}")
completed = subprocess.run(
    [
        "npx", "tsx", "scripts/ingest-independent-semantic-review-development.mts",
        str(run / "candidates" / candidate_id / "work-package.json"),
        str(output / "normalized-output.json"), str(receipt),
    ],
    capture_output=True, text=True,
)
if completed.returncode == 0:
    print(json.dumps({"candidate_id": candidate_id, "status": "VALID"}))
    raise SystemExit(0)

lines = completed.stderr.splitlines()
message = next(
    (line.strip() for line in lines if "source span does not match" in line or "state path" in line),
    lines[0].strip() if lines else "unknown deterministic ingest failure",
)
error_path.write_text(json.dumps({
    "schema_version": 1,
    "status": "INVALID_ADJUDICATION_OUTPUT",
    "stage": "DETERMINISTIC_EVIDENCE_VALIDATION",
    "error": message,
    "raw_output_preserved": True,
    "normalized_output_preserved": True,
    "counts_as_valid_adjudication": False,
    "required_follow_up": "ADDITIONAL_FRESH_INDEPENDENT_ADJUDICATION_BEFORE_GOLD_ADMISSION",
    "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"candidate_id": candidate_id, "status": "INVALID", "error": message}))
