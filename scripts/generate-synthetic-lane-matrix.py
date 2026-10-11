#!/usr/bin/env python3
import argparse
from pathlib import Path


PLAY_RES_X = 864
PLAY_RES_Y = 486
GRID_ORIGIN = 19
GRID_PITCH = 31
LANE_FONT_SIZES = [15, 25, 37, 19, 29, 17, 25, 35]


class TokenGenerator:
    def __init__(self, seed=0x6D2B79F5):
        self.state = seed
        self.letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"

    def token(self, pair_count=4):
        pairs = []
        for _ in range(pair_count):
            self.state = (1664525 * self.state + 1013904223) & 0xFFFFFFFF
            letter = self.letters[self.state % len(self.letters)]
            digit = (self.state >> 16) % 10
            pairs.append(f"{letter}{digit}")
        return "-".join(pairs)


def ass_time(seconds):
    centiseconds = int(round(seconds * 100))
    total_seconds, cs = divmod(centiseconds, 100)
    total_minutes, second = divmod(total_seconds, 60)
    hour, minute = divmod(total_minutes, 60)
    return f"{hour}:{minute:02d}:{second:02d}.{cs:02d}"


def lane_anchor(row_top, font_size, alignment, line_count=1):
    vertical = (alignment + 2) // 3
    height = font_size * line_count
    if vertical == 1:
        return row_top + height
    if vertical == 2:
        return row_top + (height / 2)
    return row_top


def format_number(value):
    return f"{value:.1f}".rstrip("0").rstrip(".")


def moving_event(token, slot, font_size, alignment, index, row_shift=0, second_line=None,
                 start=0, end=55.73):
    row_top = GRID_ORIGIN + (slot * GRID_PITCH) + row_shift
    line_count = 2 if second_line else 1
    y = format_number(lane_anchor(row_top, font_size, alignment, line_count))
    x1 = 911 + ((index * 47) % 173)
    x2 = -227 - ((index * 29) % 149)
    move_end = 11731 + (index * 43)
    payload = token if not second_line else f"{token}\\N{second_line}"
    tags = f"{{\\move({x1},{y},{x2},{y},0,{move_end})\\fs{font_size}\\an{alignment}}}"
    return (
        f"Dialogue: 0,{ass_time(start)},{ass_time(end)},G0,,0,0,0,,{tags}{payload}"
    )


def fixed_event(token, y, alignment, font_size, start=0, end=55.73):
    tags = f"{{\\pos({PLAY_RES_X / 2:g},{y})\\fs{font_size}\\an{alignment}}}"
    return (
        f"Dialogue: 0,{ass_time(start)},{ass_time(end)},G0,,0,0,0,,{tags}{token}"
    )


def build_fixture():
    tokens = TokenGenerator()
    header = f"""[Script Info]
Title: SYNTHETIC-LAYOUT-MATRIX-V1
ScriptType: v4.00+
PlayResX: {PLAY_RES_X}
PlayResY: {PLAY_RES_Y}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: G0,sans-serif,23,&H00F7F7F7,&H000000FF,&H00252525,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    alignments = [7, 4, 1]
    for slot, largest_font in enumerate(LANE_FONT_SIZES):
        fonts = [largest_font, max(11, largest_font - 6), max(11, largest_font - 10)]
        for variant, font_size in enumerate(fonts):
            alignment = alignments[(slot + variant) % len(alignments)]
            multiline = slot == 3 and variant == 2
            lines.append(moving_event(
                tokens.token(),
                slot,
                font_size,
                alignment,
                len(lines),
                second_line=tokens.token() if multiline else None,
            ))

    # A small minority of nearby coordinates exercises grid snapping without
    # changing the dominant independently generated 31-unit lattice.
    for slot, shift, font_size, alignment in [(2, 3.7, 21, 4), (6, -3.8, 17, 1)]:
        lines.append(moving_event(
            tokens.token(),
            slot,
            font_size,
            alignment,
            len(lines),
            row_shift=shift,
        ))

    # This later, larger event must reserve its lane before it becomes active.
    lines.append(moving_event(
        tokens.token(),
        5,
        33,
        7,
        len(lines),
        start=16.37,
    ))
    lines.extend([
        fixed_event(tokens.token(), 14, 8, 16),
        fixed_event(tokens.token(), 472, 2, 18),
    ])
    return header + "\n".join(lines) + "\n"


def output_path():
    return Path(__file__).resolve().parents[1] / "test" / "dom-synthetic-lane-matrix.ass"


def main():
    parser = argparse.ArgumentParser(description="Generate the deterministic synthetic DOM lane fixture.")
    parser.add_argument("--check", action="store_true", help="Fail if the committed fixture is stale.")
    args = parser.parse_args()
    content = build_fixture()
    path = output_path()
    if args.check:
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            raise SystemExit("Synthetic lane fixture is stale; regenerate it.")
        print("Synthetic lane fixture is reproducible.")
        return
    path.write_text(content, encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()
