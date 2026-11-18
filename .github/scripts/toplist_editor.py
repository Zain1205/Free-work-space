"""Zara Gaming Top 5/10 edit from LOCAL, rights-cleared gameplay clips.

No content is downloaded from third-party sites. No channel upload is made.
Music and any poetry must be original or correctly licensed. No voiceover.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from cinematic_finish import original_music


FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FPS = 24
OVERLAP = 0.45
ALLOWED_RIGHTS = {"self-recorded", "licensed"}
COLOR_PRESETS = {
    "cinematic-pulse": "eq=contrast=1.12:saturation=1.14:gamma=0.96",
    "neon-sweep": "eq=contrast=1.15:saturation=1.24:gamma=0.93",
    "clean": "eq=contrast=1.06:saturation=1.06:gamma=1.0",
}


def run(*arguments: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *arguments], check=True)


def probe_seconds(path: Path) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], check=True, capture_output=True, text=True)
    return float(result.stdout.strip())


def local_asset(root: Path, filename: str) -> Path:
    if not filename or "://" in filename or filename.startswith("//"):
        raise ValueError("Only local rights-cleared media files are allowed")
    asset = (root / filename).resolve()
    if not asset.is_relative_to(root.resolve()) or not asset.is_file():
        raise ValueError(f"Asset not found inside project media directory: {filename}")
    return asset


def load_manifest(path: Path) -> tuple[dict, list[dict], Path | None]:
    document = json.loads(path.read_text(encoding="utf-8"))
    kind = document.get("format")
    if kind not in ("long", "short"):
        raise ValueError("format must be long or short")
    entries = document.get("entries", [])
    if len(entries) not in (5, 10):
        raise ValueError("Provide exactly 5 or 10 ranked entries")
    for field in ("game", "title"):
        if not isinstance(document.get(field), str) or not 2 <= len(document[field]) <= 52:
            raise ValueError(f"Missing/invalid {field}")
    if document.get("preset", "cinematic-pulse") not in COLOR_PRESETS:
        raise ValueError("Unsupported editing preset")
    root = path.resolve().parent
    target_ranks = list(range(len(entries), 0, -1))
    for i, entry in enumerate(entries):
        if entry.get("rank") != target_ranks[i]:
            raise ValueError(f"Entries must count down: {target_ranks}")
        if entry.get("rights") not in ALLOWED_RIGHTS or not str(entry.get("rights_evidence", "")).strip():
            raise ValueError(f"Rank {entry['rank']}: rights and rights_evidence are mandatory")
        if not isinstance(entry.get("label"), str) or not 2 <= len(entry["label"]) <= 52:
            raise ValueError(f"Rank {entry['rank']}: invalid label")
        entry["_path"] = local_asset(root, str(entry.get("clip", "")))
        entry["_speed"] = float(entry.get("speed", 1.0))
        entry["_preset"] = entry.get("preset", document.get("preset", "cinematic-pulse"))
        if entry["_preset"] not in COLOR_PRESETS:
            raise ValueError(f"Rank {entry['rank']}: unsupported editing preset")
        if not 0.5 <= entry["_speed"] <= 1.5:
            raise ValueError("Allowed speed range is 0.5x to 1.5x")
        entry["_duration"] = float(entry.get("duration", 25 if kind == "long" else 5))
        entry["_start"] = float(entry.get("start", 0))
        if entry["_duration"] < 3 or entry["_duration"] > 35 or entry["_start"] < 0:
            raise ValueError("Invalid clip start/duration")
        if probe_seconds(entry["_path"]) + 0.15 < entry["_start"] + entry["_duration"] * entry["_speed"]:
            raise ValueError(f"Rank {entry['rank']}: source clip is too short for requested edit")
        if entry.get("poetry") and entry.get("poetry_rights") not in ("original", "licensed"):
            raise ValueError("Poetry must be original or licensed")
    music = document.get("music")
    music_path = None
    if music:
        if music.get("rights") not in ("original", "licensed") or not str(music.get("rights_evidence", "")).strip():
            raise ValueError("Song/music rights must be documented")
        music_path = local_asset(root, str(music.get("file", "")))
    return document, entries, music_path


def render_card(out: Path, text_path: Path, subtitle_path: Path, *, width: int,
                height: int, seconds: float, title: str) -> None:
    text_path.write_text(title, encoding="utf-8")
    graphic = (
        "drawbox=x=0:y=0:w=iw:h=ih:color=0x070d1a@1:t=fill,"
        f"drawbox=x=0:y={height//3}:w=iw:h=6:color=0x00d8ff:t=fill,"
        f"drawtext=fontfile={FONT}:textfile={text_path}:fontcolor=white:"
        f"fontsize={round(width*.05)}:x=(w-text_w)/2:y=(h-text_h)/2-40:"
        "alpha='min(1,t/0.4)',"
        f"drawtext=fontfile={FONT}:textfile={subtitle_path}:fontcolor=0x8be7ff:"
        f"fontsize={round(width*.024)}:x=(w-text_w)/2:y=(h-text_h)/2+55:"
        "alpha='min(1,t/0.65)',"
        "format=yuv420p,setsar=1"
    )
    run("-f", "lavfi", "-i", f"color=c=0x070d1a:s={width}x{height}:r={FPS}",
        "-t", str(seconds), "-vf", graphic, "-an", "-c:v", "libx264",
        "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22", str(out))


def edit_toplist(manifest: Path, output: Path, *, width: int | None = None) -> Path:
    doc, entries, music_path = load_manifest(manifest)
    aspect = doc["format"]
    width = width or (1920 if aspect == "long" else 1080)
    if width < 360 or width > 1920:
        raise ValueError("Output width must be between 360 and 1920")
    height = round(width * (9 / 16 if aspect == "long" else 16 / 9))
    height -= height % 2
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="zara_toplist_") as temp:
        tmp = Path(temp)
        subtitle = tmp / "subtitle.txt"
        subtitle.write_text(f"ZARA GAMING  /  {doc['game']}  /  NO VOICEOVER", encoding="utf-8")
        intro = tmp / "intro.mp4"
        intro_text = tmp / "intro.txt"
        render_card(intro, intro_text, subtitle, width=width, height=height,
                    seconds=3.0, title=doc["title"])
        videos = [intro]
        lengths = [3.0]

        for idx, entry in enumerate(entries):
            clip = tmp / f"rank-{entry['rank']}.mp4"
            title = tmp / f"rank-{idx}.txt"
            title.write_text(f"#{entry['rank']}  {entry['label']}", encoding="utf-8")
            poem = tmp / f"poetry-{idx}.txt"
            poem.write_text(str(entry.get("poetry", "")), encoding="utf-8")
            duration = entry["_duration"]
            speed = entry["_speed"]
            filters = [
                f"setpts=(PTS-STARTPTS)/{speed}",
                f"scale={width}:{height}:force_original_aspect_ratio=increase:flags=lanczos",
                f"crop={width}:{height}",
                f"fps={FPS}",
                COLOR_PRESETS[entry["_preset"]],
                "unsharp=3:3:0.25:3:3:0.0",
                f"drawbox=x=0:y=0:w=iw:h={round(height*.105)}:color=0x07131c@0.72:t=fill",
                f"drawbox=x=0:y={round(height*.105)-5}:w=iw:h=5:color=0x00d8ff:t=fill",
                f"drawtext=fontfile={FONT}:textfile={title}:fontcolor=white:fontsize={round(width*.040)}:"
                f"x='max({round(width*.035)}{chr(44)}{round(width*.035)}+(0.42-t)*{width})':"
                f"y={round(height*.035)}:alpha='min(1,t/0.38)'",
            ]
            if entry.get("poetry"):
                filters += [
                    f"drawbox=x=0:y={round(height*.85)}:w=iw:h={round(height*.09)}:color=black@0.66:t=fill",
                    f"drawtext=fontfile={FONT}:textfile={poem}:fontcolor=white:fontsize={round(width*.024)}:x={round(width*.035)}:y={round(height*.88)}",
                ]
            filters += ["scale=in_range=pc:out_range=tv", "format=yuv420p", "setsar=1"]
            run("-ss", str(entry["_start"]), "-t", str(duration * speed), "-i", str(entry["_path"]),
                "-vf", ",".join(filters), "-t", str(duration), "-r", str(FPS),
                "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
                "-crf", "22", str(clip))
            videos.append(clip)
            lengths.append(duration)

        outro = tmp / "outro.mp4"
        outro_text = tmp / "outro.txt"
        render_card(outro, outro_text, subtitle, width=width, height=height,
                    seconds=2.6, title="MORE GAMING LISTS SOON")
        videos.append(outro)
        lengths.append(2.6)
        inputs: list[str] = []
        for video in videos:
            inputs += ["-i", str(video)]
        previous = "0:v"
        graph = []
        for index in range(1, len(videos)):
            name = f"xf{index}"
            offset = sum(lengths[:index]) - index * OVERLAP
            transition = "fade" if index % 2 else "smoothleft"
            graph.append(f"[{previous}][{index}:v]xfade=transition={transition}:duration={OVERLAP}:offset={offset:.2f}[{name}]")
            previous = name
        graph.append(f"[{previous}]scale=in_range=pc:out_range=tv,format=yuv420p,setsar=1[final]")
        silent = tmp / "silent.mp4"
        run(*inputs, "-filter_complex", ";".join(graph), "-map", "[final]",
            "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-crf", "22", str(silent))
        seconds = sum(lengths) - (len(videos) - 1) * OVERLAP
        if music_path is None:
            music_path = tmp / "original-synthwave.wav"
            original_music(music_path, seconds + 1)
        run("-stream_loop", "-1", "-i", str(music_path), "-i", str(silent),
            "-map", "1:v:0", "-map", "0:a:0", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "160k", "-af", "volume=0.65,afade=t=in:st=0:d=1.2",
            "-t", f"{seconds:.2f}", "-movflags", "+faststart", str(output))
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Edit ranked gameplay clips with licensed music; no upload")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--width", type=int, default=None, help="Lower width for fast preview tests")
    args = parser.parse_args()
    print(edit_toplist(args.manifest, args.output, width=args.width))
