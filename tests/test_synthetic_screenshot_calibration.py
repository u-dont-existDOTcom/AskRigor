import base64
import copy
import hashlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "synthetic_screenshot_calibration.py"
SPEC = importlib.util.spec_from_file_location("synthetic_screenshot_calibration", MODULE_PATH)
calibration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(calibration)


def evidence(dpr=1):
    page = calibration.build_synthetic_page()
    geometry = {"innerWidth": 320, "innerHeight": 280, "devicePixelRatio": dpr, "scrollX": 0, "scrollY": 0,
                "visualViewport": {"width": 320, "height": 280, "offsetLeft": 0, "offsetTop": 0, "scale": 1}}
    return {"schemaVersion": 1, "observations": [
        {"phase": phase, "dataUrlSha256": page["dataUrlSha256"], "documentElementOuterHtmlSha256": page["documentElementOuterHtmlSha256"],
         "dataUrlMatchedBeforeOuterHtmlRead": True, "geometry": copy.deepcopy(geometry)} for phase in calibration.PHASES
    ], "captures": [dict(capture, automaticDisplayObserved=False, outputMetadataOnly=True, outputHandlingKnown=True)
                    for capture in page["captureSequence"]]}


def png(image):
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def image_pair(scale=1, offset=0, width_delta=0, height_delta=0):
    viewport = Image.new("RGB", (round(320 * scale) + width_delta, round(280 * scale) + height_delta), (255, 255, 255))
    draw = ImageDraw.Draw(viewport)
    for x, y, width, height, rgb in calibration.SQUARES:
        draw.rectangle((round(x * scale) + offset, round(y * scale), round((x + width) * scale) - 1 + offset,
                        round((y + height) * scale) - 1), fill=rgb)
    clip = viewport.crop(tuple(round(value * scale) for value in (16, 32, 288, 256)))
    result = png(viewport), png(clip)
    viewport.close()
    clip.close()
    return result


def check_by_id(result, name):
    return next(check for check in result["checks"] if check["id"] == name)


class SyntheticPageTests(unittest.TestCase):
    def test_exact_fixed_page_and_document_identity(self):
        first = calibration.build_synthetic_page()
        self.assertEqual(first, calibration.build_synthetic_page())
        self.assertEqual(base64.b64decode(first["dataUrl"].split(",", 1)[1]), first["html"].encode())
        self.assertEqual(first["html"], "<!doctype html>" + first["expectedDocumentElementOuterHtml"])
        self.assertEqual(hashlib.sha256(first["html"].encode()).hexdigest(), first["htmlSha256"])
        self.assertEqual(hashlib.sha256(first["dataUrl"].encode()).hexdigest(), first["dataUrlSha256"])
        self.assertEqual(hashlib.sha256(first["expectedDocumentElementOuterHtml"].encode()).hexdigest(), first["documentElementOuterHtmlSha256"])
        elements = []

        class Parser(HTMLParser):
            def handle_starttag(self, tag, attrs):
                elements.append((tag, dict(attrs)))

        Parser().feed(first["html"])
        self.assertEqual([tag for tag, _attrs in elements], ["html", "head", "meta", "style", "body", "div", "div", "div", "div"])
        squares = [attrs["style"] for tag, attrs in elements if tag == "div"]
        self.assertEqual(squares, ["left:32px;top:48px;background:rgb(255,0,0)", "left:224px;top:48px;background:rgb(0,255,0)",
                                   "left:32px;top:208px;background:rgb(0,0,255)", "left:224px;top:208px;background:rgb(255,255,0)"])
        self.assertIn("overflow:hidden", first["html"])
        self.assertIn("margin:0;height:200vh", first["html"])
        self.assertIn("width:32px;height:32px", first["html"])
        self.assertFalse(any(term in first["html"] for term in ("<script", "<form", "<iframe", " src=", " href=", "@import", "transform", "animation")))


class FixedPixelCheckerTests(unittest.TestCase):
    def test_matching_pair_and_deduplicated_scale_one(self):
        viewport, clip = image_pair()
        receipt = evidence()
        before = copy.deepcopy(receipt)
        result = calibration.check_calibration(viewport, clip, receipt)
        self.assertEqual(result["status"], "CALIBRATION_PASS")
        self.assertEqual(result["candidateScales"], [1])
        self.assertEqual(result["acceptedScale"], 1)
        self.assertTrue(all(check["passed"] for check in result["checks"]))
        self.assertEqual(result["images"]["CAL_VIEWPORT"]["sha256"], hashlib.sha256(viewport).hexdigest())
        self.assertEqual(receipt, before)
        self.assertNotIn(base64.b64encode(viewport).decode(), json.dumps(result))

    def test_only_one_or_observed_dpr_candidates(self):
        for actual_scale in (1, 2):
            with self.subTest(actual_scale=actual_scale):
                result = calibration.check_calibration(*image_pair(actual_scale), evidence(dpr=2))
                self.assertEqual(result["status"], "CALIBRATION_PASS")
                self.assertEqual(result["candidateScales"], [1, 2])
                self.assertEqual(result["acceptedScale"], actual_scale)

    def test_wrong_scale_preserves_every_failed_candidate_check(self):
        result = calibration.check_calibration(*image_pair(3), evidence(dpr=2))
        self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
        self.assertIsNone(result["acceptedScale"])
        self.assertEqual(result["candidateScales"], [1, 2])
        for candidate in result["candidates"]:
            checks = {check["id"]: check for check in candidate["checks"]}
            self.assertFalse(checks["viewport_dimensions"]["passed"])
            self.assertFalse(checks["square_1_edges"]["passed"])
            self.assertFalse(checks["clip_dimensions"]["passed"])
            self.assertIn("observed", checks["square_1_edges"])
            self.assertIn("expected", checks["square_1_edges"])

    def test_offset_is_not_automatically_aligned(self):
        result = calibration.check_calibration(*image_pair(offset=3), evidence())
        self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
        checks = {check["id"]: check for check in result["candidates"][0]["checks"]}
        self.assertFalse(checks["square_1_edges"]["passed"])
        self.assertTrue(checks["clip_pixel_equality"]["passed"])

    def test_one_pixel_edge_and_viewport_dimension_tolerance(self):
        result = calibration.check_calibration(*image_pair(offset=1, width_delta=1, height_delta=-1), evidence())
        self.assertEqual(result["status"], "CALIBRATION_PASS")

    def test_ignored_clip_is_rejected(self):
        viewport, _clip = image_pair()
        result = calibration.check_calibration(viewport, viewport, evidence())
        self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
        checks = {check["id"]: check for check in result["candidates"][0]["checks"]}
        self.assertFalse(checks["clip_dimensions"]["passed"])
        self.assertFalse(checks["clip_pixel_equality"]["passed"])

    def test_dimension_mismatch_and_full_page_capture_are_rejected(self):
        for width_delta, height_delta in ((2, 0), (0, 280)):
            with self.subTest(width_delta=width_delta, height_delta=height_delta):
                result = calibration.check_calibration(*image_pair(width_delta=width_delta, height_delta=height_delta), evidence())
                self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
                self.assertFalse(result["candidates"][0]["checks"][0]["passed"])

    def test_extra_display_unknown_handling_and_nonmetadata_output_are_rejected(self):
        viewport, clip = image_pair()
        for field, value in (("automaticDisplayObserved", True), ("automaticDisplayObserved", None),
                             ("outputHandlingKnown", None), ("outputMetadataOnly", False)):
            with self.subTest(field=field, value=value):
                receipt = evidence()
                receipt["captures"][0][field] = value
                result = calibration.check_calibration(viewport, clip, receipt)
                self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
                self.assertEqual(check_by_id(result, f"CAL_VIEWPORT.{field}")["observed"], value)
                self.assertFalse(check_by_id(result, f"CAL_VIEWPORT.{field}")["passed"])

    def test_non_synthetic_identity_prevents_pixel_inspection(self):
        viewport, clip = image_pair()
        for field, value in (("dataUrlSha256", "0" * 64), ("documentElementOuterHtmlSha256", "0" * 64),
                             ("dataUrlMatchedBeforeOuterHtmlRead", False)):
            with self.subTest(field=field):
                receipt = evidence()
                receipt["observations"][0][field] = value
                with mock.patch.object(calibration.Image, "open", side_effect=AssertionError("NON_SYNTHETIC_PIXELS_MUST_NOT_BE_READ")) as image_open:
                    result = calibration.check_calibration(viewport, clip, receipt)
                image_open.assert_not_called()
                self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
                self.assertIsNone(check_by_id(result, "CAL_VIEWPORT.complete_decodable_bytes")["passed"])

    def test_changed_geometry_and_missing_observations_are_preserved_as_failures(self):
        viewport, clip = image_pair()
        changed = evidence()
        changed["observations"][2]["geometry"]["innerWidth"] += 1
        result = calibration.check_calibration(viewport, clip, changed)
        self.assertFalse(check_by_id(result, "geometry_unchanged")["passed"])
        self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
        for receipt in (None, {}, {"observations": [None]}, {"schemaVersion": 1, "observations": evidence()["observations"][:2], "captures": []}):
            with self.subTest(receipt_type=type(receipt).__name__):
                result = calibration.check_calibration(None, None, receipt)
                self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
                self.assertFalse(check_by_id(result, "observation_sequence")["passed"])
                self.assertFalse(check_by_id(result, "capture_sequence")["passed"])

    def test_all_geometry_fields_are_required_without_adjustments(self):
        for field in calibration.GEOMETRY_FIELDS:
            with self.subTest(field=field):
                receipt = evidence()
                target = receipt["observations"][0]["geometry"]
                if field.startswith("visualViewport."):
                    target = target["visualViewport"]
                del target[field.split(".")[-1]]
                result = calibration.check_calibration(*image_pair(), receipt)
                self.assertFalse(check_by_id(result, "BEFORE_VIEWPORT.geometry_fields")["passed"])
                self.assertEqual(result["status"], "CALIBRATION_BLOCKED")

    def test_non_integral_clip_edges_are_not_rounded(self):
        result = calibration.check_calibration(*image_pair(1.2), evidence(dpr=1.2))
        self.assertEqual(result["candidateScales"], [1, 1.2])
        checks = {check["id"]: check for check in result["candidates"][1]["checks"]}
        self.assertFalse(checks["clip_edges_integral"]["passed"])
        self.assertIsNone(checks["clip_pixel_equality"]["passed"])
        self.assertEqual(result["status"], "CALIBRATION_BLOCKED")

    def test_exact_crop_pixels_are_required_without_normalization(self):
        viewport, clip = image_pair()
        with Image.open(io.BytesIO(clip)) as image:
            changed = image.copy()
        changed.putpixel((0, 0), (254, 255, 255))
        result = calibration.check_calibration(viewport, png(changed), evidence())
        self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
        self.assertFalse(next(check for check in result["candidates"][0]["checks"] if check["id"] == "clip_pixel_equality")["passed"])
        changed.close()

    def test_complete_image_bytes_are_required(self):
        viewport, clip = image_pair()
        for incomplete in (b"", b"not an image", viewport[:-1], viewport[:-8], viewport[:-20]):
            with self.subTest(byte_count=len(incomplete)):
                result = calibration.check_calibration(incomplete, clip, evidence())
                self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
                self.assertFalse(check_by_id(result, "CAL_VIEWPORT.complete_decodable_bytes")["passed"])

    def test_capture_calls_and_options_remain_exact(self):
        receipt = evidence()
        receipt["captures"][1]["options"]["clip"]["x"] = 17
        result = calibration.check_calibration(*image_pair(), receipt)
        self.assertFalse(check_by_id(result, "CAL_CLIP.options")["passed"])
        self.assertEqual(result["status"], "CALIBRATION_BLOCKED")

    def test_cli_returns_only_metadata_and_does_not_open_images_for_invalid_identity(self):
        with tempfile.TemporaryDirectory(prefix="askrigor-synthetic-calibration-test-") as directory:
            root = Path(directory)
            receipt = evidence()
            receipt["observations"][0]["dataUrlSha256"] = "0" * 64
            path = root / "evidence.json"
            path.write_text(json.dumps(receipt))
            completed = subprocess.run([sys.executable, str(MODULE_PATH), "check", "--evidence", str(path),
                                        "--viewport", str(root / "not-read-viewport.png"), "--clip", str(root / "not-read-clip.png")],
                                       capture_output=True, text=True, check=False)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(completed.stderr, "")
            result = json.loads(completed.stdout)
            self.assertEqual(result["status"], "CALIBRATION_BLOCKED")
            self.assertEqual(result["images"]["CAL_VIEWPORT"]["bytes"], None)
            self.assertNotIn("not-read-viewport", completed.stdout)


if __name__ == "__main__":
    unittest.main()
