#!/usr/bin/env python3
"""Apply the exact v20.5.15 -> v20.5.16 Target-Preservation patch.

Fail-closed:
- requires the exact canonical v20.5.15 SHA-256 loaded on 2026-09-07;
- requires each structural anchor exactly once;
- validates resulting XML;
- never overwrites the input unless --in-place is passed.
"""

from pathlib import Path
import argparse
import hashlib
import xml.etree.ElementTree as ET

EXPECTED_SHA256 = "69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172"

REVISION = '''<revision version="20.5.16" priority="Critical">
Added a domain-general Target-Preservation Rule for conceptual and comparative questions. Before answering, the assistant must identify the exact variable being asked about and hold it fixed rather than substituting adjacent properties, applications, consequences, or associated frameworks. Before finalizing, it must test whether the proposed distinction could be true while the target variable remained unchanged; if so, the distinction does not answer the question.
</revision>'''

TARGET_RULE = "Target-preservation rule: Before answering a conceptual or comparative question, identify the exact variable being asked about and hold it fixed. Do not substitute adjacent properties, applications, consequences, or associated frameworks. Before finalizing, test whether the proposed distinction could be true while the target variable remained unchanged; if so, it does not answer the question."


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ABORT: expected exactly one {label} anchor, found {count}")
    return text.replace(old, new, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path)
    ap.add_argument("--in-place", action="store_true")
    args = ap.parse_args()

    data = args.input.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(
            "ABORT: canonical source SHA-256 mismatch.\n"
            f"expected={EXPECTED_SHA256}\nactual={digest}\n"
            "Load the current canonical Universal instructions and rebase this patch."
        )
    text = data.decode("utf-8")

    text = replace_once(
        text,
        'version="20.5.15" revisionDate="2026-08-24"',
        'version="20.5.16" revisionDate="2026-09-07"',
        "protocol version",
    )

    text = replace_once(
        text,
        "<revision_history>\n",
        "<revision_history>\n" + REVISION + "\n",
        "revision history",
    )

    text = replace_once(
        text,
        "Source-scope and derivation check:",
        TARGET_RULE + "\n\nSource-scope and derivation check:",
        "target-preservation insertion",
    )

    ET.fromstring(text.encode("utf-8"))

    if args.in_place:
        target = args.input
    else:
        target = args.output or args.input.with_name("Universal_Instructions_v20.5.16.xml")

    target.write_text(text, encoding="utf-8")
    new_digest = hashlib.sha256(target.read_bytes()).hexdigest()

    print(f"WROTE: {target}")
    print("version=20.5.16 revisionDate=2026-09-07")
    print(f"sha256={new_digest}")
    print("xml_validation=pass")


if __name__ == "__main__":
    main()
