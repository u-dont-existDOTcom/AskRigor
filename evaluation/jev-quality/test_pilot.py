import json
import tempfile
import unittest
from pathlib import Path

from pilot import FLAGS, build_jev_packet, load_inputs, prepare, score, normalize_jev_responses

HERE = Path(__file__).parent


class JevQualityPilotTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases, cls.gold = load_inputs(HERE / "cases.json", HERE / "gold.json")

    def test_documented_cases_and_negative_controls(self):
        self.assertEqual(len(self.cases), 14)
        self.assertEqual(sum(bool(self.gold[c["id"]]) for c in self.cases), 10)
        self.assertEqual(sum(not self.gold[c["id"]] for c in self.cases), 4)
        self.assertTrue(all(c["cohort"] == "DEVELOPMENT" for c in self.cases))

    def test_no_gold_provenance_or_prior_answer_key_is_sent(self):
        for case in self.cases:
            body = json.dumps(build_jev_packet(case))
            self.assertNotIn(case["origin"], body)
            self.assertNotIn("required_flags", body)
            self.assertNotIn("case_id", body)
            self.assertNotIn("gold", body.lower())
            self.assertIn("candidate_answer", body)
            self.assertEqual(len(json.loads(body)["questions"]), len(FLAGS))
            self.assertFalse(json.loads(body)["provider"]["allow_fallbacks"])

    def test_prepare_zero_call_blind_packets(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "packets.jsonl"
            prepare(self.cases, target)
            rows = [json.loads(line) for line in target.read_text().splitlines()]
        self.assertEqual(len(rows), 14)
        self.assertTrue(all("gold" not in json.dumps(r).lower() for r in rows))
        self.assertTrue(all("stronger_input" in r for r in rows))

    def test_unrun_evaluation_is_unknown_not_perfect_accuracy(self):
        out = score(self.cases, self.gold, [])
        for name in ("existing", "jev", "stronger"):
            self.assertEqual(out["by_model"][name]["cases_scored"], 0)
            self.assertEqual(out["by_model"][name]["cases_unknown"], 14)
            self.assertEqual(out["by_model"][name]["false_negative"], 0)
        self.assertFalse(out["independent_value_demonstrated"])

    def test_recorded_incremental_catch_vs_existing_checks(self):
        fake = [
            dict(case_id="dmso-human-comparators", model="existing", status="OK", flags=[]),
            dict(case_id="dmso-human-comparators", model="jev", status="OK",
                 flags=["human_comparator_omission"], response_id="j1", latency_ms=500, cost_usd=.003),
            dict(case_id="dmso-human-comparators", model="stronger", status="OK",
                 flags=["human_comparator_omission"], response_id="s1", latency_ms=1000),
            dict(case_id="complete-narrow-control", model="existing", status="OK", flags=[]),
            dict(case_id="complete-narrow-control", model="jev", status="OK",
                 flags=["human_comparator_omission"], response_id="j2", latency_ms=600, cost_usd=.002),
            # Mirrored response must not double-count cost or evidence.
            dict(case_id="complete-narrow-control", model="jev", status="OK",
                 flags=["human_comparator_omission"], response_id="j2", latency_ms=600, cost_usd=.002),
            dict(case_id="dmso-dose-response", model="jev", status="ERROR",
                 flags=[], fallback_identity="provider-error-a"),
        ]
        out = score(self.cases, self.gold, fake)
        jev = out["by_model"]["jev"]
        self.assertEqual(jev["cases_scored"], 2)
        self.assertEqual(jev["true_positive"], 1)
        self.assertEqual(jev["false_positive"], 1)
        self.assertEqual(jev["provider_failures"], 1)
        self.assertAlmostEqual(jev["cumulative_observed_cost_usd"], .005)
        self.assertEqual(out["comparison"]["jev"]["matched_cases"], 2)
        self.assertEqual(out["comparison"]["jev"]["net_new_exact_catches"], 1)
        self.assertEqual(out["comparison"]["jev"]["errors_introduced"], 1)
        self.assertEqual(out["comparison"]["stronger"]["matched_cases"], 1)

    def test_false_negative_detected_when_model_explicitly_passes_defect(self):
        r = score(self.cases, self.gold, [
            dict(case_id="species-conflation", model="jev", status="OK", flags=[], response_id="j4"),
        ])
        self.assertEqual(r["by_model"]["jev"]["false_negative"], 1)
        self.assertEqual(r["by_model"]["jev"]["cases_unknown"], 13)

    def test_failure_and_bad_tags_are_not_fake_verdicts(self):
        with self.assertRaisesRegex(ValueError, "failed or unrun"):
            score(self.cases, self.gold, [dict(case_id="dmso-human-comparators", model="jev",
                                              status="ERROR", flags=["human_comparator_omission"])])
        with self.assertRaisesRegex(ValueError, "Unrecognized"):
            score(self.cases, self.gold, [dict(case_id="dmso-human-comparators", model="jev",
                                              status="OK", flags=["unreal_issue"], response_id="j5")])
        with self.assertRaisesRegex(ValueError, "response_id"):
            score(self.cases, self.gold, [dict(case_id="dmso-human-comparators", model="jev",
                                              status="OK", flags=[])])

    def test_differing_gold_and_case_set_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            cases = Path(d) / "cases.json"
            gold = Path(d) / "gold.json"
            cases.write_text(json.dumps({"cases": self.cases[:1]}))
            gold.write_text(json.dumps({"gold": []}))
            with self.assertRaisesRegex(ValueError, "unique one-to-one"):
                load_inputs(cases, gold)


    def test_import_preexisting_decisions_nouls_without_a_new_api_call(self):
        response = {
            "case_id": "dmso-human-comparators",
            "response": {
                "id": "jev-deidentified-001",
                "answers": {name: {"noul": 0.9 if name == "human_comparator_omission"
                          else 0.1} for name in FLAGS},
                "usage": {"cost": 0.00001},
            },
            "latency_ms": 321,
        }
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / "source.jsonl"
            result = Path(d) / "normalized.jsonl"
            source.write_text(json.dumps(response) + "\n", encoding="utf-8")
            normalize_jev_responses(source, result)
            row = json.loads(result.read_text(encoding="utf-8").strip())
        self.assertEqual(row["flags"], ["human_comparator_omission"])
        self.assertEqual(row["response_id"], "jev-deidentified-001")
        self.assertEqual(row["latency_ms"], 321)
        self.assertAlmostEqual(row["cost_usd"], 0.00001)

    def test_import_rejects_incomplete_response_instead_of_silent_clean_pass(self):
        response = {"case_id": "x", "response": {
            "id": "bad", "answers": {"human_comparator_omission": {"noul": 0.9}}}}
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / "in.jsonl"
            target = Path(d) / "out.jsonl"
            source.write_text(json.dumps(response) + "\n")
            with self.assertRaisesRegex(ValueError, "Invalid or missing Noul"):
                normalize_jev_responses(source, target)


if __name__ == "__main__":
    unittest.main()
