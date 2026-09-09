"""Fixed synthetic page and source-authorized screenshot checks; never displays images."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image


SQUARES = (
    (32, 48, 32, 32, (255, 0, 0)),
    (224, 48, 32, 32, (0, 255, 0)),
    (32, 208, 32, 32, (0, 0, 255)),
    (224, 208, 32, 32, (255, 255, 0)),
)
CLIP = {"x": 16, "y": 32, "width": 272, "height": 224}
PHASES = ("BEFORE_VIEWPORT", "BETWEEN_CAPTURES", "AFTER_CLIP")
CAPTURE_IDS = ("CAL_VIEWPORT", "CAL_CLIP")
GEOMETRY_FIELDS = (
    "innerWidth", "innerHeight", "devicePixelRatio", "scrollX", "scrollY",
    "visualViewport.width", "visualViewport.height", "visualViewport.offsetLeft",
    "visualViewport.offsetTop", "visualViewport.scale",
)


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def build_synthetic_page() -> dict[str, Any]:
    """The expected outerHTML is the exact HTML element, excluding its doctype."""
    style = (
        "html{background:rgb(255,255,255);margin:0;overflow:hidden}"
        "body{background:rgb(255,255,255);margin:0;height:200vh}"
        "div{position:absolute;width:32px;height:32px}"
    )
    squares = "".join(
        f'<div style="left:{x}px;top:{y}px;background:rgb({r},{g},{b})"></div>'
        for x, y, _width, _height, (r, g, b) in SQUARES
    )
    outer_html = f'<html><head><meta charset="utf-8"><style>{style}</style></head><body>{squares}</body></html>'
    html = "<!doctype html>" + outer_html
    html_bytes = html.encode("utf-8")
    data_url = "data:text/html;base64," + base64.b64encode(html_bytes).decode("ascii")
    return {
        "html": html,
        "htmlSha256": _sha256(html_bytes),
        "htmlUtf8Bytes": len(html_bytes),
        "dataUrl": data_url,
        "dataUrlSha256": _sha256(data_url.encode("utf-8")),
        "expectedDocumentElementOuterHtml": outer_html,
        "documentElementOuterHtmlSha256": _sha256(outer_html.encode("utf-8")),
        "captureSequence": [
            {"id": "CAL_VIEWPORT", "method": "Tab.screenshot", "options": {"fullPage": False}},
            {"id": "CAL_CLIP", "method": "Tab.screenshot", "options": {"fullPage": False, "clip": dict(CLIP)}},
        ],
    }


def _check(check_id: str, passed: bool | None, observed: Any, expected: Any, reason: str | None = None) -> dict[str, Any]:
    result = {"id": check_id, "passed": passed, "observed": observed, "expected": expected}
    if reason is not None:
        result["reason"] = reason
    return result


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _exact(value: Any, expected: Any) -> bool:
    return json.dumps(value, sort_keys=True, separators=(",", ":")) == json.dumps(expected, sort_keys=True, separators=(",", ":"))


def _geometry(observation: dict[str, Any]) -> dict[str, Any]:
    geometry = _object(observation.get("geometry"))
    visual = _object(geometry.get("visualViewport"))
    return {field: visual.get(field.split(".")[1]) if field.startswith("visualViewport.") else geometry.get(field)
            for field in GEOMETRY_FIELDS}


def _prerequisites(evidence: Any) -> tuple[list[dict[str, Any]], bool, dict[str, Any]]:
    evidence = _object(evidence)
    page = build_synthetic_page()
    checks = [_check("evidence_schema", evidence.get("schemaVersion") == 1 and type(evidence.get("schemaVersion")) is int,
                     evidence.get("schemaVersion"), 1)]
    observations = evidence.get("observations")
    observations = observations if isinstance(observations, list) else []
    phases = [_object(value).get("phase") for value in observations]
    checks.append(_check("observation_sequence", phases == list(PHASES), phases, list(PHASES)))
    identity_passes = len(observations) == 3
    geometries = []
    for index, phase in enumerate(PHASES):
        observation = _object(observations[index]) if index < len(observations) else {}
        identity_checks = []
        for field, expected in (("dataUrlSha256", page["dataUrlSha256"]),
                                ("documentElementOuterHtmlSha256", page["documentElementOuterHtmlSha256"]),
                                ("dataUrlMatchedBeforeOuterHtmlRead", True)):
            observed = observation.get(field)
            passed = _exact(observed, expected)
            identity_checks.append(passed)
            checks.append(_check(f"{phase}.{field}", passed, observed if isinstance(observed, (str, bool)) else None, expected,
                                 "REQUIRED_IDENTITY_OBSERVATION_MISSING" if observed is None else None))
        identity_passes = identity_passes and observation.get("phase") == phase and all(identity_checks)
        geometry = _geometry(observation)
        geometries.append(geometry)
        complete = all(_finite(value) for value in geometry.values())
        checks.append(_check(f"{phase}.geometry_fields", complete, geometry, list(GEOMETRY_FIELDS)))
        required = complete and geometry["innerWidth"] >= 320 and geometry["innerHeight"] >= 280
        required = required and geometry["devicePixelRatio"] > 0 and geometry["visualViewport.width"] > 0 and geometry["visualViewport.height"] > 0
        required = required and all(geometry[key] == 0 for key in ("scrollX", "scrollY", "visualViewport.offsetLeft", "visualViewport.offsetTop"))
        required = required and geometry["visualViewport.scale"] == 1
        checks.append(_check(f"{phase}.required_geometry", bool(required), geometry,
                             {"minimumInnerWidth": 320, "minimumInnerHeight": 280, "scrollAndVisualOffsets": 0, "visualViewportScale": 1}))
    unchanged = len(observations) == 3 and all(_finite(value) for value in geometries[0].values()) and geometries[0] == geometries[1] == geometries[2]
    checks.append(_check("geometry_unchanged", unchanged, geometries, "ALL_THREE_OBSERVATIONS_IDENTICAL"))
    captures = evidence.get("captures")
    captures = captures if isinstance(captures, list) else []
    ids = [_object(value).get("id") for value in captures]
    checks.append(_check("capture_sequence", ids == list(CAPTURE_IDS), ids, list(CAPTURE_IDS)))
    for index, capture_id in enumerate(CAPTURE_IDS):
        capture = _object(captures[index]) if index < len(captures) else {}
        expected = page["captureSequence"][index]
        checks.append(_check(f"{capture_id}.method", capture.get("method") == expected["method"], capture.get("method"), expected["method"]))
        checks.append(_check(f"{capture_id}.options", _exact(capture.get("options"), expected["options"]), capture.get("options"), expected["options"]))
        for field, required in (("automaticDisplayObserved", False), ("outputMetadataOnly", True), ("outputHandlingKnown", True)):
            value = capture.get(field)
            checks.append(_check(f"{capture_id}.{field}", value is required, value if isinstance(value, bool) else None, required,
                                 "OBSERVATION_UNKNOWN" if not isinstance(value, bool) else None))
    return checks, bool(identity_passes), geometries[0]


def _decode(value: bytes | None, capture_id: str, identity_established: bool) -> tuple[Image.Image | None, dict[str, Any], dict[str, Any]]:
    metadata: dict[str, Any] = {"sha256": _sha256(value) if isinstance(value, bytes) else None,
                                "bytes": len(value) if isinstance(value, bytes) else None,
                                "format": None, "mode": None, "width": None, "height": None}
    if not identity_established:
        return None, metadata, _check(f"{capture_id}.complete_decodable_bytes", None, None, True, "NOT_INSPECTED_SYNTHETIC_IDENTITY_NOT_ESTABLISHED")
    if not isinstance(value, bytes) or not value:
        return None, metadata, _check(f"{capture_id}.complete_decodable_bytes", False, False, True, "COMPLETE_IMAGE_BYTES_UNAVAILABLE")
    try:
        with Image.open(io.BytesIO(value)) as probe:
            # Pillow can decode a PNG missing part of IEND. Require its complete
            # zero-length terminal chunk as well as decoder verification/loading.
            if probe.format == "PNG" and not value.endswith(b"\x00\x00\x00\x00IEND\xaeB\x60\x82"):
                raise ValueError("PNG_TERMINAL_CHUNK_INCOMPLETE")
            probe.verify()
        with Image.open(io.BytesIO(value)) as loaded:
            loaded.load()
            metadata.update({"format": loaded.format, "mode": loaded.mode, "width": loaded.width, "height": loaded.height})
            image = loaded.copy()
        return image, metadata, _check(f"{capture_id}.complete_decodable_bytes", True, True, True)
    except Exception:
        return None, metadata, _check(f"{capture_id}.complete_decodable_bytes", False, False, True, "IMAGE_DECODE_OR_COMPLETENESS_FAILED")


def _color_boxes(image: Image.Image | None) -> dict[tuple[int, int, int], dict[str, Any] | None]:
    colors = {square[4]: None for square in SQUARES}
    if image is None or image.mode not in ("RGB", "RGBA"):
        return colors
    # Inspect exact channels. No conversion, color normalization, alignment, or resampling.
    pixels = image.load()
    bounds: dict[tuple[int, int, int], list[int]] = {}
    for y in range(image.height):
        for x in range(image.width):
            pixel = pixels[x, y]
            color = pixel[:3]
            if color not in colors or (image.mode == "RGBA" and pixel[3] != 255):
                continue
            if color not in bounds:
                bounds[color] = [x, y, x + 1, y + 1, 1]
            else:
                box = bounds[color]
                box[0], box[1], box[2], box[3], box[4] = min(box[0], x), min(box[1], y), max(box[2], x + 1), max(box[3], y + 1), box[4] + 1
    for color, (left, top, right, bottom, count) in bounds.items():
        colors[color] = {"edges": [left, top, right, bottom], "width": right - left, "height": bottom - top,
                         "exactColorPixels": count, "solidRectangle": count == (right - left) * (bottom - top)}
    return colors


def check_calibration(viewport_bytes: bytes | None, clip_bytes: bytes | None, evidence: Any) -> dict[str, Any]:
    """Return literal fixed-check outcomes, including unavailable and failed checks."""
    checks, identity_established, geometry = _prerequisites(evidence)
    viewport, viewport_metadata, viewport_check = _decode(viewport_bytes, "CAL_VIEWPORT", identity_established)
    clip_image, clip_metadata, clip_check = _decode(clip_bytes, "CAL_CLIP", identity_established)
    checks.extend((viewport_check, clip_check))
    scales: list[int | float] = [1]
    dpr = geometry["devicePixelRatio"]
    if _finite(dpr) and dpr > 0 and dpr not in scales:
        scales.append(dpr)
    boxes = _color_boxes(viewport)
    candidates = []
    for scale in scales:
        candidate_checks = []
        expected_dimensions = [geometry[key] * scale if _finite(geometry[key]) else None for key in ("innerWidth", "innerHeight")]
        actual_dimensions = [viewport.width, viewport.height] if viewport is not None else None
        dimensions_pass = viewport is not None and all(value is not None for value in expected_dimensions) and all(
            abs(actual - expected) <= 1 for actual, expected in zip(actual_dimensions, expected_dimensions))
        candidate_checks.append(_check("viewport_dimensions", bool(dimensions_pass), actual_dimensions, {"dimensions": expected_dimensions, "tolerancePixels": 1}))
        for index, (x, y, width, height, color) in enumerate(SQUARES, start=1):
            observed = boxes[color]
            predicted_edges = [x * scale, y * scale, (x + width) * scale, (y + height) * scale]
            passed = observed is not None and observed["solidRectangle"] and all(abs(actual - expected) <= 1 for actual, expected in zip(observed["edges"], predicted_edges))
            candidate_checks.append(_check(f"square_{index}_edges", bool(passed), observed,
                                           {"rgb": list(color), "edges": predicted_edges, "width": width * scale, "height": height * scale, "edgeTolerancePixels": 1}))
        edges = [CLIP["x"] * scale, CLIP["y"] * scale, (CLIP["x"] + CLIP["width"]) * scale, (CLIP["y"] + CLIP["height"]) * scale]
        integral = all(_finite(edge) and float(edge).is_integer() for edge in edges)
        candidate_checks.append(_check("clip_edges_integral", integral, edges, "ALL_FOUR_EDGES_INTEGRAL"))
        expected_clip_size = [CLIP["width"] * scale, CLIP["height"] * scale]
        clip_size = [clip_image.width, clip_image.height] if clip_image is not None else None
        candidate_checks.append(_check("clip_dimensions", clip_size == expected_clip_size, clip_size, expected_clip_size))
        equality: bool | None = None
        reason = "REQUIRED_IMAGES_OR_INTEGRAL_EDGES_UNAVAILABLE"
        if integral and viewport is not None and clip_image is not None:
            box = tuple(int(edge) for edge in edges)
            if 0 <= box[0] < box[2] <= viewport.width and 0 <= box[1] < box[3] <= viewport.height:
                crop = viewport.crop(box)
                equality = crop.size == clip_image.size and crop.mode == clip_image.mode and crop.tobytes() == clip_image.tobytes()
                reason = None
                crop.close()
            else:
                equality, reason = False, "REQUESTED_CROP_OUTSIDE_VIEWPORT_IMAGE"
        candidate_checks.append(_check("clip_pixel_equality", equality, equality, True, reason))
        candidates.append({"scale": scale, "passed": all(check["passed"] is True for check in candidate_checks), "checks": candidate_checks})
    passing = [candidate["scale"] for candidate in candidates if candidate["passed"]]
    checks.append(_check("exactly_one_distinct_candidate_passes", len(passing) == 1, passing, "EXACTLY_ONE_SCALE"))
    accepted = all(check["passed"] is True for check in checks)
    if viewport is not None:
        viewport.close()
    if clip_image is not None:
        clip_image.close()
    return {"schemaVersion": 1, "status": "CALIBRATION_PASS" if accepted else "CALIBRATION_BLOCKED",
            "acceptedScale": passing[0] if accepted else None, "candidateScales": scales, "checks": checks, "candidates": candidates,
            "images": {"CAL_VIEWPORT": viewport_metadata, "CAL_CLIP": clip_metadata}}


def main() -> int:
    parser = argparse.ArgumentParser(description="Fixed synthetic screenshot calibration; metadata-only checker output.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("page")
    checker = commands.add_parser("check")
    checker.add_argument("--evidence", required=True)
    checker.add_argument("--viewport", required=True)
    checker.add_argument("--clip", required=True)
    args = parser.parse_args()
    if args.command == "page":
        print(json.dumps(build_synthetic_page(), separators=(",", ":")))
        return 0
    try:
        evidence = json.loads(Path(args.evidence).read_text(encoding="utf-8"))
    except Exception:
        print(json.dumps({"status": "CALIBRATION_BLOCKED", "error": "EVIDENCE_JSON_UNAVAILABLE_OR_INVALID"}))
        return 1
    _checks, identity_established, _geometry_values = _prerequisites(evidence)
    images = []
    for path in (args.viewport, args.clip):
        try:
            images.append(Path(path).read_bytes() if identity_established else None)
        except Exception:
            images.append(None)
    result = check_calibration(images[0], images[1], evidence)
    print(json.dumps(result, separators=(",", ":"), allow_nan=False))
    return 0 if result["status"] == "CALIBRATION_PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
