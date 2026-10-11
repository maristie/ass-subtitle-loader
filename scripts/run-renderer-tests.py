#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from test_support.firefox_harness import (
    default_firefox_bin,
    execute_async as run_async_script,
    firefox_session,
    get_available_port,
    navigate,
    save_screenshot,
    serve_directory,
)


DEFAULT_ADJUSTMENTS = {
    "fontScale": 1,
    "opacity": 1,
    "marginTop": 0,
    "marginBottom": 0,
    "laneGap": 0,
}

_BROWSER_SCRIPT_DIR = Path(__file__).resolve().parents[1] / "test" / "browser"


def load_browser_script(name):
    return (_BROWSER_SCRIPT_DIR / name).read_text(encoding="utf-8")


DOM_RENDERER_TEST = load_browser_script("renderer-dom.js")
DOM_DENSE_LANES_TEST = load_browser_script("renderer-dom-dense-lanes.js")
DOM_SYNTHETIC_LANES_TEST = load_browser_script("renderer-dom-synthetic-lanes.js")
DOM_LANE_SCHEDULER_TEST = load_browser_script("renderer-dom-lane-scheduler.js")
DOM_FIXED_WRAP_TEST = load_browser_script("renderer-dom-fixed-wrap.js")

def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Run Firefox/Marionette renderer checks against test/harness.html."
    )
    parser.add_argument(
        "--firefox-bin",
        default=os.environ.get("FIREFOX_BIN") or default_firefox_bin(),
        help="Firefox executable path. Defaults to FIREFOX_BIN or the platform default.",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Show the Firefox window instead of running headless.",
    )
    parser.add_argument(
        "--http-port",
        type=int,
        default=0,
        help="Local HTTP port. Defaults to an available port.",
    )
    parser.add_argument(
        "--marionette-port",
        type=int,
        default=0,
        help="Marionette port. Defaults to an available port.",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        default=None,
        help="Optional directory for screenshots captured after each renderer check.",
    )
    return parser.parse_args(argv)


def repo_root():
    return Path(__file__).resolve().parents[1]


def run_dom_renderer_test(client, base_url, artifacts_dir):
    navigate(client, f"{base_url}/test/harness.html?file=large-load.ass")
    result = run_async_script(client, DOM_RENDERER_TEST)
    if artifacts_dir:
        save_screenshot(client, artifacts_dir / "dom-renderer.png")
    assert_no_script_error(result, "DOM renderer test")
    assert_dom_result(result)
    return result


def run_dom_dense_lanes_test(client, base_url, artifacts_dir):
    navigate(client, f"{base_url}/test/harness.html?file=dom-dense-lanes.ass")
    result = run_async_script(client, DOM_DENSE_LANES_TEST)
    if artifacts_dir:
        save_screenshot(client, artifacts_dir / "dom-dense-lanes.png")
    assert_no_script_error(result, "DOM dense lanes test")
    assert_dom_dense_lanes_result(result)
    return result


def run_dom_synthetic_lanes_test(client, base_url, artifacts_dir):
    navigate(client, f"{base_url}/test/harness.html?file=dom-synthetic-lane-matrix.ass")
    result = run_async_script(client, DOM_SYNTHETIC_LANES_TEST)
    if artifacts_dir:
        save_screenshot(client, artifacts_dir / "dom-synthetic-lane-matrix.png")
    assert_no_script_error(result, "DOM synthetic lane matrix test")
    assert_dom_synthetic_lanes_result(result)
    return result


def run_dom_lane_scheduler_test(client, base_url, artifacts_dir):
    navigate(client, f"{base_url}/test/harness.html?file=dom-lane-scheduler.ass")
    result = run_async_script(client, DOM_LANE_SCHEDULER_TEST)
    if artifacts_dir:
        save_screenshot(client, artifacts_dir / "dom-lane-scheduler.png")
    assert_no_script_error(result, "DOM lane scheduler test")
    assert_dom_lane_scheduler_result(result)
    return result


def run_dom_fixed_wrap_test(client, base_url, artifacts_dir):
    navigate(client, f"{base_url}/test/harness.html?file=dom-fixed-wrap.ass")
    result = run_async_script(client, DOM_FIXED_WRAP_TEST)
    if artifacts_dir:
        save_screenshot(client, artifacts_dir / "dom-fixed-wrap.png")
    assert_no_script_error(result, "DOM fixed wrap test")
    assert_dom_fixed_wrap_result(result)
    return result


def assert_no_script_error(result, label):
    if isinstance(result, dict) and result.get("error"):
        raise AssertionError(f"{label} failed in page script: {json.dumps(result['error'], indent=2)}")


def assert_dom_result(result):
    default_status = result["defaultStatus"]
    adjusted_status = result["adjustedStatus"]
    scaled_font_status = result["scaledFontStatus"]
    compact_font_status = result["compactFontStatus"]
    default_metrics = result["defaultMetrics"]
    adjusted_metrics = result["adjustedMetrics"]
    scaled_font_metrics = result["scaledFontMetrics"]
    compact_font_metrics = result["compactFontMetrics"]

    require(default_status["ok"], "DOM default ping failed")
    require(default_status["rendererBackend"] == "dom", "large-load.ass did not use the DOM renderer")
    require(default_status["rendererReady"], "DOM renderer was not ready")
    require(default_status["hasSubtitle"], "DOM renderer did not report a loaded subtitle")
    require(default_status["subtitleName"] == "large-load.ass", "DOM renderer loaded the wrong subtitle")
    require(default_status["subtitleAdjustments"] == DEFAULT_ADJUSTMENTS, "default adjustments changed unexpectedly")
    require(default_status["renderStats"]["lanes"] >= 20, "large-load.ass did not expose enough comment lanes")
    require(default_status["renderStats"]["laneGap"] == 0, "default lane gap was not reported")

    require(default_metrics["active"] >= 3, "DOM subtitles were not observable as active elements")
    require(
        default_metrics["firstText"] and "flowing comment" in default_metrics["firstText"],
        "DOM subtitle text was not observable",
    )
    require(
        0 <= default_metrics["firstY"] <= 25,
        f"default zero top padding produced an unexpected first row Y: {default_metrics['firstY']}",
    )
    require(
        default_metrics["rowGapToFont"] and default_metrics["rowGapToFont"] >= 1,
        f"default row spacing was too tight: {default_metrics['rowGapToFont']}",
    )
    require(default_metrics["strokeWidth"] > 0, "DOM outline was not rendered as a continuous stroke")
    require(default_metrics["strokeToFont"] > 0, "DOM stroke/font ratio was not observable")
    # large-load.ass authors Outline=2 and Fontsize=34. CSS centers its stroke,
    # so the renderer doubles the outline; the fill hides the inward half.
    dom_font_size_factor = 0.7  # Mirrors the documented font-metric conversion in layout.js.
    expected_stroke_to_font = (2 * 2) / (34 * dom_font_size_factor)
    require(
        abs(default_metrics["strokeToFont"] - expected_stroke_to_font) <= 0.003,
        f"DOM outline no longer matches the authored radius: actual={default_metrics['strokeToFont']}, expected={expected_stroke_to_font}",
    )
    require(
        all(row["paintOrder"] == "stroke" for row in default_metrics["sampleRows"]),
        f"DOM glyph fill was not painted over its outline: {default_metrics['sampleRows']}",
    )
    require(
        all(row["textShadowLayerCount"] == 1 for row in default_metrics["sampleRows"]),
        f"DOM outline leaked back into layered text shadows: {default_metrics['sampleRows']}",
    )
    require(
        default_metrics["shadowOffsetX"] > 0 and default_metrics["shadowOffsetY"] > 0,
        f"DOM authored shadow lost its positive diagonal offset: {default_metrics}",
    )
    require(
        abs(default_metrics["shadowOffsetX"] - default_metrics["shadowOffsetY"]) <= 0.01,
        f"DOM authored shadow offsets diverged: {default_metrics}",
    )
    require(abs(default_metrics["shadowBlur"]) <= 0.001, f"DOM authored shadow gained blur: {default_metrics}")

    require(adjusted_status["ok"], "DOM adjusted ping failed")
    require(adjusted_status["rendererBackend"] == "dom", "adjusted subtitles switched away from DOM renderer")
    require(adjusted_status["subtitleAdjustments"]["laneGap"] == 0.75, "adjusted lane gap was not applied")
    require(adjusted_status["renderStats"]["laneGap"] == 0.75, "DOM stats did not report adjusted lane gap")
    require(
        default_metrics["fontSize"] and adjusted_metrics["fontSize"],
        f"font size was not observable: before={default_metrics}, after={adjusted_metrics}",
    )
    require(
        abs(adjusted_metrics["fontSize"] - default_metrics["fontSize"]) <= 0.01,
        f"lane-gap-only adjustment changed font size: before={default_metrics['fontSize']}, after={adjusted_metrics['fontSize']}",
    )
    require(
        adjusted_metrics["rowGapToFont"] > default_metrics["rowGapToFont"] + 0.15,
        "increasing lane gap did not increase observable row spacing",
    )

    assert_font_scaled_lanes(adjusted_metrics, scaled_font_status, scaled_font_metrics, 1.5, "font-scaled")
    assert_font_scaled_lanes(adjusted_metrics, compact_font_status, compact_font_metrics, 0.65, "compact-font")

    assert_dom_boundary_result(result["boundary"])


def assert_dom_boundary_result(boundary):
    baseline = boundary["baseline"]
    scaled = boundary["scaled"]
    baseline_status = baseline["status"]
    scaled_status = scaled["status"]
    baseline_stats = baseline_status["renderStats"]
    scaled_stats = scaled_status["renderStats"]
    baseline_metrics = baseline["metrics"]
    scaled_metrics = scaled["metrics"]

    require(boundary["delayStatus"]["ok"], f"DOM boundary delay adjustment failed: {boundary}")
    require(baseline["setStatus"]["ok"], f"DOM boundary baseline adjustment failed: {boundary}")
    require(scaled["setStatus"]["ok"], f"DOM boundary scaled adjustment failed: {boundary}")
    require(baseline_status["ok"] and scaled_status["ok"], f"DOM boundary ping failed: {boundary}")
    require(
        baseline_status["rendererBackend"] == "dom" and scaled_status["rendererBackend"] == "dom",
        f"DOM boundary case switched renderers: {boundary}",
    )
    require(
        baseline_status["rendererReady"] and scaled_status["rendererReady"],
        f"DOM boundary renderer was not ready: {boundary}",
    )
    require(
        abs(baseline_status["subtitleTime"] - boundary["targetSubtitleTime"]) <= 0.01
        and abs(scaled_status["subtitleTime"] - boundary["targetSubtitleTime"]) <= 0.01,
        f"DOM boundary case did not stay at its fixed subtitle time: {boundary}",
    )
    require(baseline_stats["lanes"] == 28, f"large-load baseline source lanes changed: {baseline_stats}")
    if baseline_stats.get("sourceLanes") is not None:
        require(baseline_stats["sourceLanes"] == 28, f"large-load baseline source lane count changed: {baseline_stats}")
    if scaled_stats.get("sourceLanes") is not None:
        require(scaled_stats["sourceLanes"] == 28, f"font scaling changed the source lane count: {scaled_stats}")
    require(
        0 < scaled_stats["lanes"] < baseline_stats["lanes"],
        f"2x font size did not reduce the effective DOM lane count: before={baseline_stats}, after={scaled_stats}",
    )
    require(
        baseline_metrics["active"] >= 20 and 0 < scaled_metrics["active"] <= baseline_metrics["active"],
        f"fixed-time DOM boundary case rendered an invalid scheduled event set: before={baseline_metrics}, after={scaled_metrics}",
    )
    require(baseline_metrics["sourceLaneCount"] >= 20, f"large-load boundary fixture lost source lanes: {baseline_metrics}")
    require(baseline_metrics["allInside"], f"large-load baseline escaped the video layer: {baseline_metrics}")
    require(scaled_metrics["allInside"], f"2x DOM subtitles escaped the video layer: {scaled_metrics}")
    require(
        scaled_metrics["distinctRows"] < baseline_metrics["distinctRows"],
        f"2x font size did not remap active comments onto fewer lanes: before={baseline_metrics}, after={scaled_metrics}",
    )
    require(
        scaled_metrics["distinctRows"] <= scaled_stats["lanes"],
        f"rendered DOM rows exceeded the effective lane count: metrics={scaled_metrics}, stats={scaled_stats}",
    )
    font_ratio = scaled_metrics["fontSize"] / baseline_metrics["fontSize"]
    require(abs(font_ratio - 2) <= 0.03, f"boundary font size did not scale to 2x: ratio={font_ratio}")


def assert_dom_dense_lanes_result(result):
    cases = {case["label"]: case for case in result["cases"]}
    expected_adjustments = {
        "nominal": (1, 0.5),
        "gap-zero": (1, 0),
        "gap-wide": (1, 0.75),
        "scale-up": (1.5, 0.5),
        "scale-down": (0.65, 0.5),
        "scale-up-gap-zero": (1.5, 0),
        "scale-down-gap-wide": (0.65, 0.75),
        "scale-min-gap-max": (0.5, 1),
        "scale-max-gap-zero": (2, 0),
    }
    require(set(cases) == set(expected_adjustments), f"DOM dense lane cases changed: {sorted(cases)}")

    measured = {}
    source_lane_count = 9
    max_paint_height = (40 * 0.7 * 1.125) + (2 * (2 + 1))
    for label, (font_scale, lane_gap) in expected_adjustments.items():
        case = cases[label]
        status = case["status"]
        metrics = case["metrics"]
        rows = metrics["rows"]
        gaps = metrics["gaps"]
        adjacent = [gap for gap in gaps if gap["slotSpan"] == 1]
        sparse = [gap for gap in gaps if gap["slotSpan"] == 2]

        require(case["setOk"], f"{label} dense lane adjustment failed")
        require(status["ok"], f"{label} dense lane ping failed")
        require(status["rendererBackend"] == "dom", f"{label} dense lanes switched away from DOM")
        require(status["rendererReady"], f"{label} dense lane renderer was not ready")
        require(status["subtitleName"] == "dom-dense-lanes.ass", f"{label} loaded the wrong dense fixture")
        require(status["subtitleAdjustments"]["fontScale"] == font_scale, f"{label} font scale was not applied")
        require(status["subtitleAdjustments"]["laneGap"] == lane_gap, f"{label} lane gap was not applied")
        stats = status["renderStats"]
        require(stats["sourceLanes"] == source_lane_count, f"{label} source lane count changed: {stats}")
        if font_scale == 1 and lane_gap == 0:
            expected_lanes = source_lane_count
        else:
            clear_gap = 40 * 0.7 * font_scale * lane_gap
            expected_lanes = max(
                1,
                int((720 + clear_gap) / ((max_paint_height * font_scale) + clear_gap)),
            )
        require(stats["lanes"] == expected_lanes, f"{label} reported the wrong physical lane capacity: {stats}")
        require([row["slot"] for row in rows] == [0, 1, 2, 3, 5, 6, 7, 8], f"{label} dense slots changed: {rows}")
        require(len(set(row["sourceFontSize"] for row in rows)) >= 6, f"{label} fixture no longer has mixed sizes")
        for row in rows:
            expected_font_size = row["sourceFontSize"] * 0.7 * metrics["layerHeight"] / 720 * font_scale
            require(
                abs(row["fontSize"] - expected_font_size) <= 0.05,
                f"{label} font conversion drifted from calibrated scale: row={row}, expected={expected_font_size}",
            )
        require(all(row["insideLayer"] for row in rows), f"{label} pushed a dense row outside the layer: {rows}")
        require(len(adjacent) == 6 and len(sparse) == 1, f"{label} dense gap topology changed: {gaps}")
        require(all(gap["clearGap"] >= -0.05 for gap in adjacent), f"{label} dense rows overlap: {adjacent}")

        adjacent_values = [gap["clearGap"] for gap in adjacent]
        gap_mean = sum(adjacent_values) / len(adjacent_values)
        gap_spread = max(adjacent_values) - min(adjacent_values)
        if not (font_scale == 1 and lane_gap == 0):
            scale_y = metrics["layerHeight"] / 720
            minimum_clear_gap = font_scale * scale_y * ((2 * (2 + 1)) + (40 * 0.7 * lane_gap))
            require(
                all(value >= minimum_clear_gap - 0.15 for value in adjacent_values),
                f"{label} scheduled rows violated the minimum paint gap: actual={adjacent_values}, expected={minimum_clear_gap}",
            )
        require(
            sparse[0]["clearGap"] > min(adjacent_values),
            f"{label} did not preserve space for the inactive source row: {gaps}",
        )
        measured[label] = {
            "rows": rows,
            "gapMean": gap_mean,
            "gapSpread": gap_spread,
            "sparseGap": sparse[0]["clearGap"],
            "laneCount": stats["lanes"],
        }

    nominal = measured["nominal"]
    gap_zero = measured["gap-zero"]
    gap_wide = measured["gap-wide"]
    authored_y = {
        0: 20,
        1: 48.35,
        2: 79.85,
        3: 79.85,
        5: 122.375,
        6: 153.0875,
        7: 179.075,
        8: 179.075,
    }
    layer_height = cases["gap-zero"]["metrics"]["layerHeight"]
    for row in gap_zero["rows"]:
        expected_y = authored_y[row["slot"]] * layer_height / 720
        require(
            abs(row["startY"] - expected_y) <= 0.03,
            f"zero-gap baseline moved authored row {row['slot']}: row={row}, expectedY={expected_y}",
        )
    require(nominal["gapMean"] < gap_wide["gapMean"], f"wider lane gap did not open more space: {measured}")
    require(
        measured["scale-max-gap-zero"]["laneCount"] < measured["scale-down"]["laneCount"],
        f"physical lane capacity did not respond to font scale: {measured}",
    )
    for label, (font_scale, lane_gap) in expected_adjustments.items():
        current = measured[label]
        for nominal_row, current_row in zip(nominal["rows"], current["rows"]):
            ratio = current_row["fontSize"] / nominal_row["fontSize"]
            require(nominal_row["slot"] == current_row["slot"], f"{label} changed dense row order")
            require(
                abs(ratio - font_scale) <= 0.03,
                f"{label} font size did not scale in slot {nominal_row['slot']}: {ratio}",
            )


def assert_dom_synthetic_lanes_result(result):
    fixture = result["fixture"]
    require(fixture["events"] == 29, f"synthetic fixture event count changed: {fixture}")
    require(fixture["movingEvents"] == 27, f"synthetic moving-event count changed: {fixture}")
    require(fixture["fixedEvents"] == 2, f"synthetic fixed-event count changed: {fixture}")
    require(fixture["maxFontSize"] == 37, f"synthetic maximum font size changed: {fixture}")
    require(
        result["futureLayoutDelta"] <= 0.01,
        f"a later larger event reflowed persistent lanes: {result['futureLayoutDelta']}",
    )
    require(result["persistentEvents"] > 0, f"synthetic fixture had no persistent scheduled rows: {result}")

    expected_adjustments = {
        "baseline": (1, 0),
        "nominal": (1, 0.5),
        "large-zero": (1.5, 0),
        "large-mid": (1.5, 0.5),
        "small-wide": (0.65, 0.75),
        "maximum-zero": (2, 0),
    }
    cases = {case["label"]: case for case in result["cases"]}
    require(set(cases) == set(expected_adjustments), f"synthetic lane cases changed: {sorted(cases)}")

    for label, (font_scale, lane_gap) in expected_adjustments.items():
        case = cases[label]
        status = case["status"]
        metrics = case["metrics"]
        rows = metrics["rows"]
        moving_rows = [row for row in rows if row["kind"] == "move"]

        require(case["setOk"], f"{label} synthetic lane adjustment failed")
        require(status["ok"], f"{label} synthetic lane ping failed")
        require(status["rendererBackend"] == "dom", f"{label} synthetic fixture switched away from DOM")
        require(status["rendererReady"], f"{label} synthetic DOM renderer was not ready")
        require(
            status["subtitleName"] == "dom-synthetic-lane-matrix.ass",
            f"{label} loaded the wrong synthetic fixture",
        )
        require(status["subtitleAdjustments"]["fontScale"] == font_scale, f"{label} font scale was not applied")
        require(status["subtitleAdjustments"]["laneGap"] == lane_gap, f"{label} lane gap was not applied")
        stats = status["renderStats"]
        require(stats["sourceLanes"] == 8, f"{label} source lane count changed: {stats}")
        if font_scale == 1 and lane_gap == 0:
            expected_lanes = 8
        else:
            clear_gap = 37 * 0.7 * font_scale * lane_gap
            max_paint_height = (37 * 0.7 * 1.125) + (2 * (2 + 1))
            expected_lanes = max(
                1,
                int((486 + clear_gap) / ((max_paint_height * font_scale) + clear_gap)),
            )
        require(stats["lanes"] == expected_lanes, f"{label} reported the wrong physical lane capacity: {stats}")
        require(0 < len(rows) <= 29, f"{label} rendered an invalid synthetic event count: {len(rows)}")
        require(0 < len(moving_rows) <= 27, f"{label} rendered no scheduled moving events")
        require(
            [group["slot"] for group in metrics["groups"]] == list(range(expected_lanes)),
            f"{label} synthetic lane grouping changed: {metrics['groups']}",
        )
        require(all(group["insideLayer"] for group in metrics["groups"]), f"{label} pushed a lane outside the layer")
        require(all(row["insideLayer"] for row in rows), f"{label} pushed subtitle paint outside the layer")
        require(len({row["sourceFontSize"] for row in moving_rows}) >= 3, f"{label} lost mixed font sizes")
        for row in rows:
            expected_font_size = row["sourceFontSize"] * 0.7 * metrics["layerHeight"] / 486 * font_scale
            require(
                abs(row["fontSize"] - expected_font_size) <= 0.05,
                f"{label} synthetic font conversion drifted: row={row}, expected={expected_font_size}",
            )

        if label == "baseline":
            for row in rows:
                expected_y = row["authoredY"] * metrics["layerHeight"] / 486
                require(
                    abs(row["startY"] - expected_y) <= 0.03,
                    f"baseline moved an authored synthetic anchor: row={row}, expectedY={expected_y}",
                )
                require(row["anchorDelta"] <= 0.1, f"baseline changed ASS vertical alignment: {row}")
            continue

        gaps = metrics["gaps"]
        require(len(gaps) == expected_lanes - 1, f"{label} synthetic gap count changed: {gaps}")
        require(min(gaps) >= -0.05, f"{label} synthetic painted lanes overlap: {gaps}")
        expected_gap = metrics["paintGapUnit"] * lane_gap
        require(
            all(gap >= expected_gap - 0.1 for gap in gaps),
            f"{label} synthetic scheduled paint violated the minimum gap: actual={gaps}, expected={expected_gap}",
        )


def assert_dom_lane_scheduler_result(result):
    ready = result["readyStatus"]
    stats = ready["renderStats"]
    early = result["firstEarly"]
    late = result["firstLate"]
    backward = result["backward"]
    forward = result["forward"]
    before_zero = result["beforeZero"]

    require(result["setOk"], f"DOM scheduler font-scale adjustment failed: {result}")
    require(ready["ok"], f"DOM scheduler ping failed: {result}")
    require(ready["rendererBackend"] == "dom", f"scheduler fixture switched away from DOM: {result}")
    require(ready["rendererReady"], f"DOM scheduler was not ready: {result}")
    require(ready["subtitleName"] == "dom-lane-scheduler.ass", f"scheduler loaded the wrong fixture: {result}")
    require(ready["subtitleAdjustments"]["fontScale"] == 2, f"scheduler font scale was not applied: {result}")
    require(stats["sourceLanes"] == 3, f"scheduler source lane count changed: {stats}")
    require(stats["lanes"] == 2 and stats["movingLanes"] == 2, f"2x scale did not reduce moving lanes: {stats}")
    require(stats["fixedLanes"] == 2, f"scheduler fixed pool size changed: {stats}")
    require(stats["delayed"] == 1 and abs(stats["maxDelay"] - 4) <= 0.001, f"fixed cue was not delayed to the first free lane: {stats}")

    expected_early = [
        "B",
        "M",
        "T",
    ]
    expected_late = [
        "B",
        "Q",
    ]
    require(early["delaySetOk"] and late["delaySetOk"], f"initial scheduler seeks failed: {result}")
    require(backward["delaySetOk"] and forward["delaySetOk"], f"repeat scheduler seeks failed: {result}")
    require(before_zero["delaySetOk"], f"negative scheduler timestamp failed: {result}")
    require(before_zero["snapshot"]["texts"] == [], f"negative timestamp rendered DOM cues: {before_zero}")
    require(early["snapshot"]["texts"] == expected_early, f"fixed and moving pools were not independent: {early}")
    require(early["status"]["renderStats"]["queued"] == 1, f"fixed cue was not queued while both fixed lanes were occupied: {early}")
    require(late["snapshot"]["texts"] == expected_late, f"delayed fixed cue did not launch at the first free lane: {late}")
    require(late["targetTime"] > 3, f"delayed cue was not sampled after its authored end: {late}")
    require(late["status"]["renderStats"]["queued"] == 0, f"launched fixed cue remained queued: {late}")
    require(early["snapshot"] == backward["snapshot"], f"backward seek rebuilt a different schedule: {result}")
    require(late["snapshot"] == forward["snapshot"], f"forward seek rebuilt a different schedule: {result}")
    require(
        all(case["snapshot"]["allPaintInside"] for case in (early, late, backward, forward)),
        f"scheduled subtitle paint escaped the video layer: {result}",
    )

    expected_texts = ["1", "2", "B", "D", "M", "OVERSIZED", "Q", "T"]
    coverage_cases = [("initial geometry", result["initialCoverage"])] + [
        (case["label"], case["coverage"]) for case in result["resized"]
    ]
    require(len(result["resized"]) == 2, f"scheduler resize coverage changed: {result}")
    for label, coverage in coverage_cases:
        require(
            coverage["visibleTexts"] == expected_texts,
            f"{label} dropped a scheduled danmaku after resizing: {coverage}",
        )
        require(coverage["allPaintInside"], f"{label} allowed danmaku paint outside the video: {coverage}")

    for case in result["resized"]:
        require(case["layer"]["width"] > 0 and case["layer"]["height"] > 0, f"invalid resized layer: {case}")
        require(
            all(sample["snapshot"]["allPaintInside"] for sample in case["samples"]),
            f"{case['label']} resize allowed subtitle paint outside the video: {case}",
        )

    live_resize = result["liveFontResize"]
    require(live_resize["expectedText"] == "OVERSIZED", f"live resize checked the wrong cue: {live_resize}")
    require(
        [case["fontScale"] for case in live_resize["cases"]] == [1, 2],
        f"live font resize coverage changed: {live_resize}",
    )
    require(
        all(case["setOk"] and case["row"]["paintInside"] for case in live_resize["cases"]),
        f"oversized cue disappeared or escaped during live font resize: {live_resize}",
    )


def assert_dom_fixed_wrap_result(result):
    status = result["status"]
    layer = result["layer"]
    metrics = result["metrics"]

    require(status["ok"], "DOM fixed wrap ping failed")
    require(status["rendererBackend"] == "dom", "fixed wrap fixture did not use the DOM renderer")
    require(status["rendererReady"], "DOM fixed wrap renderer was not ready")
    require(status["hasSubtitle"], "DOM fixed wrap renderer did not report a loaded subtitle")
    require(status["subtitleName"] == "dom-fixed-wrap.ass", "DOM fixed wrap renderer loaded the wrong subtitle")

    for name in ("top", "bottom", "topInward", "bottomInward"):
        item = metrics[name]
        require(
            "ass-subtitle-loader-dom-fixed-wrap" in item["className"],
            f"fixed {name} subtitle did not opt into wrapping: {item}",
        )
        require(item["lineCount"] >= 2, f"fixed {name} subtitle did not wrap: {item}")
        require(
            item["height"] > item["lineHeight"] * 1.5,
            f"fixed {name} subtitle did not occupy multiple rendered lines: {item}",
        )
        require(item["insideLayer"], f"fixed {name} subtitle escaped the video layer: {item}")
        require(item["paintInsideLayer"], f"fixed {name} subtitle paint escaped the video layer: {item}")
        require(
            item["width"] <= layer["width"] * 0.91,
            f"fixed {name} subtitle exceeded its readable width cap: {item}",
        )
        require(abs(item["centerXDelta"]) <= 2, f"fixed {name} subtitle lost its center anchor: {item}")
        require(item["whiteSpace"] == "pre-wrap", f"fixed {name} subtitle did not enable wrapping: {item}")
        require(item["overflowWrap"] == "anywhere", f"fixed {name} subtitle cannot break long tokens: {item}")
        require(item["textAlign"] == "center", f"fixed {name} subtitle lost ASS text alignment: {item}")
        require(item["strokeWidth"] > 0, f"fixed {name} subtitle lost its ASS outline: {item}")
        require(item["paintOrder"] == "stroke", f"fixed {name} subtitle paints its outline over the fill: {item}")
        require(item["textShadow"] == "none", f"fixed {name} outline still uses layered shadows: {item}")

    require(abs(metrics["top"]["topAnchorDelta"]) <= 2, f"wrapped top subtitle moved off its anchor: {metrics['top']}")
    require(abs(metrics["bottom"]["bottomAnchorDelta"]) <= 2, f"wrapped bottom subtitle moved off its anchor: {metrics['bottom']}")
    require(
        abs(metrics["topInward"]["topAnchorDelta"] + metrics["topInward"]["lineHeight"]) <= 2,
        f"wrapped top inward subtitle did not preserve its authored first row: {metrics['topInward']}",
    )
    require(
        abs(metrics["bottomInward"]["bottomAnchorDelta"] - metrics["bottomInward"]["lineHeight"]) <= 2,
        f"wrapped bottom inward subtitle did not preserve its authored last row: {metrics['bottomInward']}",
    )

    fixed_names = (
        "top",
        "bottom",
        "topInward",
        "bottomInward",
        "topShort",
        "bottomShort",
        "topExplicit",
        "bottomExplicit",
    )
    for index, first_name in enumerate(fixed_names):
        for second_name in fixed_names[index + 1:]:
            first = metrics[first_name]["paintBounds"]
            second = metrics[second_name]["paintBounds"]
            separated = first["bottom"] <= second["top"] + 1 or second["bottom"] <= first["top"] + 1
            require(
                separated,
                f"fixed subtitles overlap after automatic wrapping: "
                f"{first_name}={first}, {second_name}={second}",
            )

    for name, anchor_delta in (("topShort", "bottomAnchorDelta"), ("bottomShort", "topAnchorDelta")):
        item = metrics[name]
        require(
            "ass-subtitle-loader-dom-fixed-wrap" in item["className"],
            f"fixed {name} control did not use fixed-edge layout: {item}",
        )
        require(item["lineCount"] == 1, f"fixed {name} control unexpectedly wrapped: {item}")
        require(item["paintInsideLayer"], f"fixed {name} control paint escaped the video layer: {item}")
        require(abs(item[anchor_delta]) <= 2, f"fixed {name} control moved from its authored row: {item}")

    for name, anchor_delta in (("topExplicit", "bottomAnchorDelta"), ("bottomExplicit", "topAnchorDelta")):
        item = metrics[name]
        require(
            "ass-subtitle-loader-dom-fixed-wrap" in item["className"],
            f"fixed {name} control did not use fixed-edge layout: {item}",
        )
        require(item["lineCount"] == 2, f"fixed {name} control changed its authored line count: {item}")
        require(item["paintInsideLayer"], f"fixed {name} control paint escaped the video layer: {item}")
        require(abs(item[anchor_delta]) <= 2, f"fixed {name} control moved its authored multiline block: {item}")

    for name in ("middle", "moving"):
        item = metrics[name]
        require(
            "ass-subtitle-loader-dom-fixed-wrap" not in item["className"],
            f"{name} control unexpectedly opted into fixed-edge wrapping: {item}",
        )
        require(item["lineCount"] == 1, f"{name} control unexpectedly wrapped: {item}")
        require(item["whiteSpace"] == "pre", f"{name} control changed its single-line layout: {item}")


def assert_font_scaled_lanes(baseline_metrics, status, metrics, expected_scale, label):
    require(status["ok"], f"DOM {label} ping failed")
    require(status["rendererBackend"] == "dom", f"{label} subtitles switched away from DOM renderer")
    require(status["subtitleAdjustments"]["fontScale"] == expected_scale, f"{label} adjustment was not applied")
    require(status["subtitleAdjustments"]["laneGap"] == 0.75, f"{label} adjustment changed lane gap")

    font_ratio = metrics["fontSize"] / baseline_metrics["fontSize"]
    lane_ratio = metrics["rowGap"] / baseline_metrics["rowGap"]
    stroke_ratio = metrics["strokeWidth"] / baseline_metrics["strokeWidth"]
    shadow_ratio = metrics["shadowOffsetX"] / baseline_metrics["shadowOffsetX"]
    require(
        abs(font_ratio - expected_scale) <= 0.08,
        f"{label} font size did not follow font scale {expected_scale}: before={baseline_metrics['fontSize']}, after={metrics['fontSize']}",
    )
    require(
        abs(lane_ratio - expected_scale) <= 0.08,
        f"{label} lane spacing did not follow font scale {expected_scale}: before={baseline_metrics['rowGap']}, after={metrics['rowGap']}",
    )
    require(
        abs(stroke_ratio - expected_scale) <= 0.08,
        f"{label} outline did not follow font scale {expected_scale}: before={baseline_metrics['strokeWidth']}, after={metrics['strokeWidth']}",
    )
    require(
        abs(metrics["strokeToFont"] - baseline_metrics["strokeToFont"]) <= 0.01,
        f"{label} outline/font proportion changed: before={baseline_metrics['strokeToFont']}, after={metrics['strokeToFont']}",
    )
    require(
        abs(shadow_ratio - expected_scale) <= 0.08,
        f"{label} authored shadow did not follow font scale {expected_scale}: before={baseline_metrics['shadowOffsetX']}, after={metrics['shadowOffsetX']}",
    )
    require(
        abs(metrics["shadowOffsetX"] - metrics["shadowOffsetY"]) <= 0.01 and abs(metrics["shadowBlur"]) <= 0.001,
        f"{label} authored shadow geometry changed: {metrics}",
    )
    require(
        abs(metrics["rowGapToFont"] - baseline_metrics["rowGapToFont"]) <= 0.05,
        f"{label} row spacing did not stay proportional to font size: before={baseline_metrics['rowGapToFont']}, after={metrics['rowGapToFont']}",
    )


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def build_content_bundle(root):
    result = subprocess.run(
        ["npm", "run", "bundle"],
        cwd=str(root),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Could not build content bundle:\n"
            f"{result.stdout}\n{result.stderr}"
        )


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    root = repo_root()
    required_files = [
        root / "test" / "harness.html",
        root / "test" / "large-load.ass",
        root / "test" / "dom-dense-lanes.ass",
        root / "test" / "dom-synthetic-lane-matrix.ass",
        root / "test" / "dom-lane-scheduler.ass",
        root / "test" / "dom-fixed-wrap.ass",
        root / "src" / "content.js",
        root / "scripts" / "build-content-bundle.js",
    ]
    missing = [str(path) for path in required_files if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing test prerequisite files: {', '.join(missing)}")

    build_content_bundle(root)

    if args.artifacts_dir:
        args.artifacts_dir.mkdir(parents=True, exist_ok=True)

    http_port = args.http_port or get_available_port()
    marionette_port = args.marionette_port or get_available_port()
    with serve_directory(root, http_port) as base_url:
        with tempfile.TemporaryDirectory(prefix="ass-renderer-firefox-profile-", ignore_cleanup_errors=True) as profile_dir:
            with firefox_session(
                args.firefox_bin,
                profile_dir,
                marionette_port,
                headed=args.headed,
            ) as client:
                dom_result = run_dom_renderer_test(client, base_url, args.artifacts_dir)
                dense_result = run_dom_dense_lanes_test(client, base_url, args.artifacts_dir)
                synthetic_result = run_dom_synthetic_lanes_test(client, base_url, args.artifacts_dir)
                scheduler_result = run_dom_lane_scheduler_test(client, base_url, args.artifacts_dir)
                fixed_wrap_result = run_dom_fixed_wrap_test(client, base_url, args.artifacts_dir)
                print(json.dumps({"cssRegressions": 5, "passed": True}))


if __name__ == "__main__":
    main()
