#!/usr/bin/env python3
from pathlib import Path


def ass_time(seconds):
    centis = int(round(seconds * 100))
    cs = centis % 100
    total_seconds = centis // 100
    s = total_seconds % 60
    total_minutes = total_seconds // 60
    m = total_minutes % 60
    h = total_minutes // 60
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_large_load_ass(event_count=2600, duration_seconds=20 * 60):
    header = """[Script Info]
Title: Large Load Moving Comment Stress
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Comment,Noto Sans JP,34,&H00FFFFFF,&H000000FF,&H00202020,&H80000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for index in range(event_count):
        start = index * (duration_seconds / event_count)
        end = start + 10.0
        y = 28 + (index % 28) * 24
        tag = f"{{\\move(1320,{y},-640,{y},0,8000)\\bord2\\shad1}}"
        text = f"flowing comment {index:04d} large-load ASS stress test"
        lines.append(
            f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Comment,,0,0,0,,{tag}{text}\n"
        )
    return "".join(lines)


def main():
    repo_root = Path(__file__).resolve().parents[1]
    output = repo_root / "test" / "large-load.ass"
    content = build_large_load_ass()
    output.write_text(content, encoding="utf-8")
    print(f"{output}")
    print(f"{len(content)} bytes")


if __name__ == "__main__":
    main()
