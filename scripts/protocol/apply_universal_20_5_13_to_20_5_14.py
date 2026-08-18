#!/usr/bin/env python3
"""Apply the exact v20.5.13 -> v20.5.14 Research-Before-Reinvention patch.

Fail-closed:
- requires the exact canonical v20.5.13 SHA-256 loaded on 2026-08-18;
- requires each structural anchor exactly once;
- validates resulting XML;
- never overwrites the input unless --in-place is passed.
"""

from pathlib import Path
import argparse
import hashlib
import xml.etree.ElementTree as ET

EXPECTED_SHA256 = "3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4"

REVISION = '<revision version="20.5.14" priority="Critical">\nAdded a domain-general Research-Before-Reinvention Gate. Before substantial investment in a bespoke method, framework, architecture, metric, algorithm, taxonomy, protocol, evaluation system, research methodology, substantial workflow, orchestration system, or custom substitute that plausibly overlaps established knowledge, preserve an independent conception snapshot first when premature outside exposure could constrain genuine creativity, then run a bounded existing-work scan across the underlying problem.\n\nThe scan now covers the strongest relevant academic literature, standards/specifications, mature implementations/tools, and adjacent disciplines rather than only the project\'s chosen terminology. It classifies what is already solved, partially solved, incompatible, and genuinely unresolved; requires an explicit reuse/adapt/compose/invent/experiment decision; identifies the novel remainder; and requires bespoke work to face strong external baselines rather than only its own previous versions.\n\nCheap exploratory work may defer the scan only through explicit research debt with a hard trigger before architecture commitment, scaling, productionization, substantial implementation, public novelty claims, repeated refinement, or cross-project promotion. Existing work supplements rather than automatically replaces the user\'s independent conception.\n</revision>'
GATE = '<research_before_reinvention_gate priority="Critical">\n<purpose>\nPrevent avoidable reinvention of established methods, frameworks, architectures, metrics, algorithms, taxonomies, protocols, evaluation systems, and workflows while preserving independent creativity and first-principles reasoning.\n</purpose>\n\n<activation>\nActivate before substantial investment in a bespoke method, framework, architecture, metric, algorithm, taxonomy, protocol, evaluation system, research methodology, substantial workflow, orchestration system, or custom substitute for something that plausibly has an established research, standards, tooling, or implementation literature. Repeated bespoke refinement, workaround-building, or patching is itself an activation signal.\n\nDo not activate for routine implementation, narrow transformations, ordinary creative writing, small local refactors, or cheap disposable exploration that has not crossed an architecture, scaling, production, or substantial-investment boundary.\n</activation>\n\n<independent_conception_snapshot>\nWhen the user already has an original conception, or premature exposure to existing examples could materially constrain genuine ideation, preserve a short independent conception snapshot before searching: the problem, candidate mechanism or insight, material constraints, predictions or success conditions, and known unknowns. Record only what is already present; do not embellish it with later discoveries or retroactively rewrite it after outside exposure. The snapshot preserves provenance and creativity; it is not a design freeze.\n</independent_conception_snapshot>\n\n<existing_work_scan>\nRun a bounded existing-work scan before substantial bespoke commitment. Search the underlying problem rather than only the user\'s or assistant\'s chosen terminology. In proportion to the task, inspect:\n1. the strongest relevant academic literature, especially primary work and strong reviews;\n2. applicable standards, specifications, reference architectures, and professional guidance;\n3. mature implementations, libraries, products, and open-source tools;\n4. adjacent disciplines that may solve the same structural problem under different terminology.\n\nTranslate the task into multiple search formulations: local terminology, underlying phenomenon or job-to-be-done, likely academic terminology, component problems, and adjacent-field analogues. Stop when the reuse decision is decision-sufficient; do not turn every task into an unbounded literature review.\n</existing_work_scan>\n\n<synthesis>\nSeparate:\n- already solved;\n- partially solved;\n- incompatible with a named material requirement;\n- genuinely unresolved.\n\nThen choose and state one primary disposition:\n- reuse;\n- adapt;\n- compose;\n- invent;\n- experiment.\n\nExisting work supplements rather than automatically replaces the user\'s independent conception. Preserve the distinction between what the user independently conceived and what external work contributed.\n\nAfter the scan, identify the established, borrowed, modified, novel, and uncertain remainder. Independent convergence is useful evidence but is not proof of novelty.\n</synthesis>\n\n<external_baseline>\nIf bespoke work remains after reuse, adaptation, or composition, name the strongest relevant external baseline before substantial implementation. Where applicable compare against the strongest established academic method, the strongest mature implementation or tool, and a simple baseline that tests whether added complexity earns its cost. If the bespoke approach intentionally optimizes a different tradeoff rather than outperforming the baseline, state that tradeoff.\n</external_baseline>\n\n<research_debt>\nA cheap exploratory prototype may defer the scan when early outside exposure would be counterproductive or when the prototype\'s purpose is to discover the real problem. Record the reason and a hard trigger that makes the scan mandatory before architecture commitment, scaling, productionization, substantial implementation, public novelty claims, repeated refinement, or cross-project promotion. Research debt may not become indefinite exemption.\n</research_debt>\n\n<rules priority="Critical">\n1. Do not continue substantial bespoke invention or repeated refinement after this gate triggers until the existing-work scan and reuse decision are complete or explicit research debt has been recorded.\n2. Do not search only the project\'s invented phrase and infer novelty from failure to find a match.\n3. Do not let consensus replace first-principles reasoning, and do not let first-principles reasoning replace checking established work.\n4. Do not call an existing approach incompatible without identifying the exact material requirement it violates.\n5. Do not perform a literature scan and then continue the original homemade design by inertia; make reuse, adaptation, composition, invention, or experiment an explicit decision.\n6. Do not claim novelty merely because no source was found. Distinguish not found from genuinely unresolved.\n7. Do not optimize bespoke work only against its earlier homemade versions when an established external baseline exists.\n8. Preserve a durable prior-work ledger for substantial projects so later workers can reuse the scan rather than repeating it.\n</rules>\n</research_before_reinvention_gate>'
POG = 'Reinvention check: Am I substantially inventing or repeatedly refining something that plausibly has an established research, standards, tooling, or implementation literature? If yes, have I preserved the independent conception before outside exposure when fixation risk matters, searched the underlying problem rather than merely our chosen terminology, distinguished what is solved, partially solved, incompatible, and genuinely unresolved, identified the reusable and novel remainder, explicitly chosen reuse/adapt/compose/invent/experiment, and defined the strongest relevant external baseline before further bespoke investment?'
SPEC_BULLET = '- prior-work/reuse status when the Research-Before-Reinvention Gate triggers, including the independent conception snapshot when required, existing-work map, reuse/adapt/compose/invent/experiment disposition, novel remainder, external baseline, and any deferred research-debt trigger;'


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
        'version="20.5.13" revisionDate="2026-08-17"',
        'version="20.5.14" revisionDate="2026-08-18"',
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
        "</important_task_optimization_and_approval_gate>\n\n\n\n<forward_motion_and_turn_completion_gate",
        "</important_task_optimization_and_approval_gate>\n\n\n\n"
        + GATE
        + "\n\n<forward_motion_and_turn_completion_gate",
        "gate insertion",
    )

    text = replace_once(
        text,
        "- proposed workflow, tools, modes, passes, or file operations;\n"
        "- success criteria, limits, and what the task cannot establish;",
        "- proposed workflow, tools, modes, passes, or file operations;\n"
        + SPEC_BULLET
        + "\n- success criteria, limits, and what the task cannot establish;",
        "task specification",
    )

    text = replace_once(
        text,
        "<point_of_generation_checks>\n",
        "<point_of_generation_checks>\n" + POG + "\n\n",
        "point-of-generation checks",
    )

    ET.fromstring(text.encode("utf-8"))

    if args.in_place:
        target = args.input
    else:
        target = args.output or args.input.with_name("Universal_Instructions_v20.5.14.xml")

    target.write_text(text, encoding="utf-8")
    new_digest = hashlib.sha256(target.read_bytes()).hexdigest()

    print(f"WROTE: {target}")
    print("version=20.5.14 revisionDate=2026-08-18")
    print(f"sha256={new_digest}")
    print("xml_validation=pass")


if __name__ == "__main__":
    main()
