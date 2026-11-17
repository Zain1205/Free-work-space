"""Produce a Minecraft-history Short using specific CC BY gameplay excerpts.

Every source comes from a separately CC-BY-licensed Xbox Mexico excerpt on
Wikimedia Commons. No Youtube channels are scraped, no game soundtrack/voices
are copied, and an original synthesized instrumental is added at export.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import urllib.request

from cinematic_finish import original_music


USER_AGENT = "ZaraGamingCloud-CCBYEditor/1.0 (https://github.com/Zain1205/Free-work-space)"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SOURCE_AUTHOR = "Xbox México"
FILES = [
    ("Cave Game Gameplay (Minecraft Prototype).webm", "2009: THE PROTOTYPE", "Before Minecraft, there was Cave Game.", "The world began as simple movable blocks."),
    ("Minecraft Classic Gameplay.webm", "2009: CLASSIC", "Creative building became the core idea.", "Early worlds were basic but full of possibility."),
    ("Minecraft Alpha Gameplay.webm", "2010: ALPHA", "Survival made each night feel dangerous.", "Exploration and resource choices mattered."),
    ("Minecraft Beta Gameplay.webm", "2011: BETA", "Adventure, caves, and a growing world.", "The sandbox kept evolving."),
    ("Minecraft Gameplay.webm", "THE MODERN ERA", "Years of updates changed exploration.", "The block world keeps growing."),
]
WIDTH = 720
HEIGHT = 1280
FPS = 24
CLIP_SECONDS = 4.7
OVERLAP = 0.4
OUT = Path("preview_output")


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def api_metadata(name: str) -> dict:
    params = urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "imageinfo",
        "titles": f"File:{name}", "iiprop": "url|size|sha1|extmetadata",
    })
    url = f"https://commons.wikimedia.org/w/api.php?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as resp:
        obj = json.load(resp)
    pages = obj["query"]["pages"]
    data = next(iter(pages.values()))["imageinfo"][0]
    # Do not trust an arbitrary redirect or a removed license.
    if not data["url"].startswith("https://upload.wikimedia.org/"):
        raise RuntimeError(f"Untrusted Commons URL for {name}")
    license_name = data.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
    if "CC BY" not in license_name:
        raise RuntimeError(f"CC BY licensing needs a new review for {name}: {license_name}")
    if int(data["size"]) > 20_000_000:
        raise RuntimeError("Unexpected source size")
    return data


def download(name: str, dest: Path) -> None:
    data = api_metadata(name)
    req = urllib.request.Request(data["url"], headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=160) as resp, dest.open("wb") as output:
        total = 0
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > 20_000_000:
                raise RuntimeError("Source exceeded bound")
            output.write(chunk)
    if total != int(data["size"]):
        raise RuntimeError(f"Source size mismatch for {name}")
    if hashlib.sha1(dest.read_bytes()).hexdigest().lower() != data["sha1"].lower():
        raise RuntimeError(f"Source SHA-1 mismatch for {name}")
    print(f"Verified licensed clip: {name} ({total} bytes)")


def card(source: Path, destination: Path, heading: str, detail: str, seconds: float,
         scratch: Path, *, episode: int, footer: str = "") -> None:
    name_path = scratch / f"heading-{episode}.txt"
    detail_path = scratch / f"detail-{episode}.txt"
    footer_path = scratch / f"footer-{episode}.txt"
    name_path.write_text(heading, encoding="utf-8")
    detail_path.write_text(detail, encoding="utf-8")
    footer_path.write_text(footer, encoding="utf-8")
    bar_width = WIDTH * episode // 5

    # Foreground is real moving gameplay, letterboxed over a dark, blurred
    # moving gameplay background. Crop-free composition preserves game action.
    graph = (
        "[0:v]split=2[orig][back];"
        f"[back]scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
        f"crop={WIDTH}:{HEIGHT},boxblur=10:2,eq=brightness=-0.20:saturation=0.85[bg];"
        f"[orig]scale={WIDTH}:-2:flags=lanczos,eq=contrast=1.08:saturation=1.10[fg];"
        "[bg][fg]overlay=x=0:y=(H-h)/2," 
        f"drawbox=x=0:y=0:w=iw:h=275:color=0x091421@0.91:t=fill,"
        f"drawbox=x=0:y=1000:w=iw:h=280:color=0x091421@0.91:t=fill,"
        f"drawbox=x=0:y=271:w={bar_width}:h=5:color=0x24d8ff:t=fill,"
        f"drawtext=fontfile={FONT}:text='ZARA GAMING  |  5 MINECRAFT ERAS':"
        "fontsize=26:fontcolor=0x76e9ff:x=36:y=34,"
        f"drawtext=fontfile={FONT}:textfile={name_path}:"
        "fontsize=38:fontcolor=white:x=36:y=102,"
        f"drawtext=fontfile={FONT}:textfile={detail_path}:"
        "fontsize=22:fontcolor=white:x=36:y=1054,"
        f"drawtext=fontfile={FONT}:textfile={footer_path}:"
        "fontsize=19:fontcolor=0x9befff:x=36:y=1124,"
        "format=yuv420p,setsar=1[out]"
    )
    run("-ss", "0.3", "-t", str(seconds), "-i", str(source),
        "-filter_complex", graph, "-map", "[out]", "-an", "-r", str(FPS),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", str(destination))


def simple_card(destination: Path, title: str, second: str, seconds: float,
                scratch: Path, idx: int) -> None:
    a = scratch / f"splash-{idx}.txt"
    b = scratch / f"caption-{idx}.txt"
    a.write_text(title, encoding="utf-8")
    b.write_text(second, encoding="utf-8")
    graph = (
        "drawbox=x=0:y=280:w=iw:h=720:color=0x061b30:t=fill,"
        "drawbox=x=0:y=275:w=iw:h=8:color=0x21d5ef:t=fill,"
        f"drawtext=fontfile={FONT}:textfile={a}:fontsize=50:"
        "fontcolor=white:x=(w-text_w)/2:y=510,"
        f"drawtext=fontfile={FONT}:textfile={b}:fontsize=24:"
        "fontcolor=0x8ee7ff:x=(w-text_w)/2:y=630,"
        "format=yuv420p"
    )
    run("-f", "lavfi", "-i", f"color=c=0x040914:s={WIDTH}x{HEIGHT}:r={FPS}",
        "-t", str(seconds), "-vf", graph, "-an", "-c:v", "libx264",
        "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "23", str(destination))


def render(destination: Path, smoke: bool = False) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="zara_minecraft_history_") as temp:
        scratch = Path(temp)
        segments = []
        lengths = []
        intro = scratch / "intro.mp4"
        simple_card(intro, "MINECRAFT", "5 ERAS IN 25 SECONDS", 2.2, scratch, 0)
        segments.append(intro)
        lengths.append(2.2)

        dummy = scratch / "local-smoke.webm"
        if smoke:
            run("-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24",
                "-t", "6.2", "-c:v", "libvpx-vp9", "-b:v", "500k", str(dummy))

        for i, (filename, heading, detail, secondary) in enumerate(FILES, 1):
            source = scratch / f"clip-{i}.webm"
            if smoke:
                source = dummy
            else:
                download(filename, source)
            clip = scratch / f"part-{i}.mp4"
            card(source, clip, heading, detail, CLIP_SECONDS, scratch,
                 episode=i, footer=secondary)
            segments.append(clip)
            lengths.append(CLIP_SECONDS)

        outro = scratch / "outro.mp4"
        simple_card(outro, "WHICH ERA IS BEST?", "COMMENT YOUR FAVORITE  /  ZARA GAMING", 2.0, scratch, 6)
        segments.append(outro)
        lengths.append(2.0)

        args = []
        for clip in segments:
            args += ["-i", str(clip)]
        chain = []
        current = "0:v"
        for i in range(1, len(segments)):
            next_name = f"v{i}"
            offset = sum(lengths[:i]) - i * OVERLAP
            trans = "smoothleft" if i % 2 else "fade"
            chain.append(f"[{current}][{i}:v]xfade=transition={trans}:duration={OVERLAP}:offset={offset:.2f}[{next_name}]")
            current = next_name
        chain.append(f"[{current}]format=yuv420p,setsar=1[final]")
        mute = scratch / "edited-muted.mp4"
        run(*args, "-filter_complex", ";".join(chain), "-map", "[final]", "-an",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", str(mute))
        total = sum(lengths) - OVERLAP * (len(segments) - 1)
        soundtrack = scratch / "original-music.wav"
        original_music(soundtrack, total + 1)
        run("-i", str(mute), "-i", str(soundtrack), "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-af", "volume=0.8,afade=t=in:st=0:d=0.8",
            "-t", str(round(total, 2)), "-movflags", "+faststart", str(destination))
        print(f"Short ready: {destination} duration={total:.1f}s sha256={hashlib.sha256(destination.read_bytes()).hexdigest()}")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true", help="Local safe test cards; no downloads")
    parser.add_argument("--output", type=Path, default=OUT / "minecraft-five-eras-2026-11-17.mp4")
    args = parser.parse_args()
    render(args.output, smoke=args.smoke)
