"""Give Zara's original AI-still review renders a cinematic finish.

All sound is synthesized locally from mathematical oscillators and noise: no
licensed songs, voices, samples, or third-party audiovisual assets are used.
This is animated still photography, not optical-flow slow-motion gameplay.
"""

from __future__ import annotations

import argparse
import math
import random
import subprocess
import tempfile
import wave
from pathlib import Path


FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SAMPLE_RATE = 22_050
BPM = 112


def run(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def original_music(destination: Path, seconds: float) -> None:
    """Create a deterministic, original instrumental bed with no copyrighted audio."""
    frames = round(seconds * SAMPLE_RATE)
    signal = [0.0] * frames
    rng = random.Random(2106)

    def add(start: float, length: float, generator) -> None:
        first = int(start * SAMPLE_RATE)
        count = min(round(length * SAMPLE_RATE), frames - first)
        for index in range(max(0, count)):
            t = index / SAMPLE_RATE
            signal[first + index] += generator(t)

    beat = 60 / BPM
    bass_roots = [73.42, 58.27, 87.31, 65.41]  # D, Bb, F, C
    chords = [(146.83, 174.61, 220.00), (116.54, 146.83, 174.61),
              (174.61, 220.00, 261.63), (130.81, 164.81, 196.00)]
    melody = [293.66, 349.23, 440.00, 349.23, 261.63, 329.63, 392.00, 329.63]

    for bar in range(math.ceil(seconds / (4 * beat))):
        root = bass_roots[bar % len(bass_roots)]
        beginning = bar * 4 * beat
        for frequency in chords[bar % len(chords)]:
            phase = rng.uniform(0, 3.0)
            add(beginning, 4 * beat, lambda t, f=frequency, p=phase:
                0.026 * min(1.0, t / 0.25) * min(1.0, (4 * beat - t) / 0.55)
                * (math.sin(2 * math.pi * f * t + p) + 0.22 * math.sin(2 * math.pi * 1.005 * f * t)))
        for step in range(4):
            start = beginning + step * beat
            if start >= seconds:
                break
            # Soft, slightly detuned low synth bass.
            add(start, beat * 0.85, lambda t, f=root:
                0.105 * (1 - math.exp(-t * 80)) * math.exp(-t * 4.5)
                * (math.sin(2 * math.pi * f * t) + 0.23 * math.sin(2 * math.pi * f * 2.01 * t)))
            # Original kick with an exponential downward pitch sweep.
            add(start, 0.32, lambda t:
                0.33 * math.exp(-t * 15) * math.sin(2 * math.pi * (47 * t + 3.5 * (1 - math.exp(-30 * t)))))
            if step % 2:
                add(start, 0.19, lambda t:
                    math.exp(-t * 19) * (0.12 * rng.uniform(-1, 1) + 0.04 * math.sin(2 * math.pi * 176 * t)))
            for half in (0, 0.5):
                add(start + half * beat, 0.075, lambda t:
                    0.034 * math.exp(-t * 64) * rng.uniform(-1, 1))
        for step in range(8):
            start = beginning + step * beat / 2
            if start < seconds:
                frequency = melody[(bar * 3 + step) % len(melody)]
                add(start, beat * 0.35, lambda t, f=frequency:
                    0.045 * math.exp(-t * 14) *
                    (math.sin(2 * math.pi * f * t) + 0.15 * math.sin(2 * math.pi * 2 * f * t)))

    with wave.open(str(destination), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        chunk = bytearray()
        for i, value in enumerate(signal):
            position = i / SAMPLE_RATE
            fade = min(1.0, position / 0.8, (seconds - position) / 1.4)
            level = math.tanh(value * max(0.0, fade) * 1.6) * 0.77
            number = max(-32768, min(32767, round(level * 32767)))
            chunk.extend(number.to_bytes(2, "little", signed=True))
            if len(chunk) >= 65536:
                wav.writeframesraw(chunk)
                chunk.clear()
        if chunk:
            wav.writeframesraw(chunk)


def cinematic_finish(source: Path, destination: Path, *, game: str = "GTA VI",
                     scene_count: int = 4, scene_seconds: int = 8,
                     width: int = 1080) -> Path:
    """Grade scenes, add slow camera drift, designed titles, transitions and music."""
    if scene_count < 2 or scene_seconds < 3 or width < 360:
        raise ValueError("Unsupported review format")
    height = width * 16 // 9
    fps = 24
    overlap = 0.65
    final_seconds = scene_count * scene_seconds - (scene_count - 1) * overlap
    titles = ["THE CITY AFTER DARK", "NEON RUSH", "THE NIGHT CHASE", "ONE LAST RIDE",
              "BEYOND THE HORIZON", "THE FINAL FRAME"]
    destination.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="zara_cinematic_") as temp:
        work = Path(temp)
        segments = []
        for index in range(scene_count):
            top = work / f"title-{index}.txt"
            sub = work / f"scene-{index}.txt"
            disclaimer = work / "disclaimer.txt"
            top.write_text("ZARA GAMING  /  ORIGINAL AI CINEMA", encoding="ascii")
            sub.write_text(f"{game}  |  {titles[index % len(titles)]}", encoding="ascii")
            disclaimer.write_text("Fictional AI concept  /  Not actual gameplay", encoding="ascii")
            clip = work / f"graded-{index:02}.mp4"
            # Remove the first-generation header before drawing the new template.
            # Overscan creates gradual camera movement; it is not actual slow-mo.
            pan_x = "(iw-ow)/2 + (iw-ow)*0.27*sin(t*0.24+0.7)" if index % 2 else "(iw-ow)/2 - (iw-ow)*0.27*sin(t*0.24+0.7)"
            pan_y = "(ih-oh)/2 + (ih-oh)*0.28*sin(t*0.21+0.4)"
            filter_parts = [
                "crop=iw:ih-165:0:165",
                f"scale={round(width*1.13)}:{round(height*1.13)}:flags=lanczos",
                f"crop={width}:{height}:x='{pan_x}':y='{pan_y}'",
                "eq=contrast=1.10:saturation=1.19:brightness=-0.015:gamma=0.98",
                "colorbalance=rs=0.035:gs=-0.013:bs=0.032:rm=0.015:bm=0.025",
                "unsharp=3:3:0.32:3:3:0.0",
                "vignette=PI/5",
                f"drawbox=x=0:y=0:w=iw:h={round(height*0.092)}:color=0x07131c@0.86:t=fill",
                f"drawbox=x=0:y={round(height*0.092)-6}:w=iw:h=6:color=0x00cfff@0.95:t=fill",
                f"drawbox=x=0:y={round(height*0.87)}:w=iw:h={round(height*0.13)}:color=0x07131c@0.73:t=fill",
                f"drawbox=x=0:y={round(height*0.87)}:w=iw:h=4:color=0xff7756@0.93:t=fill",
                f"drawtext=fontfile={FONT}:textfile={top}:fontsize={round(width*0.027)}:fontcolor=0x8be7ff:x={round(width*0.045)}:y={round(height*0.018)}",
                f"drawtext=fontfile={FONT}:textfile={sub}:fontsize={round(width*0.036)}:fontcolor=white:x={round(width*0.045)}:y={round(height*0.053)}",
                f"drawtext=fontfile={FONT}:textfile={disclaimer}:fontsize={round(width*0.026)}:fontcolor=white:x={round(width*0.045)}:y={round(height*0.9)}",
                "format=yuv420p",
            ]
            run("-ss", str(index * scene_seconds), "-t", str(scene_seconds),
                "-i", str(source), "-vf", ",".join(filter_parts), "-r", str(fps),
                "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", str(clip))
            segments.append(clip)

        graded = work / "scenes.mp4"
        inputs = []
        for clip in segments:
            inputs.extend(["-i", str(clip)])
        transitions = ["smoothleft", "fadeblack", "slideright", "fade", "circlecrop"]
        graph = []
        previous = "0:v"
        for index in range(1, len(segments)):
            target = f"v{index}"
            offset = index * (scene_seconds - overlap)
            graph.append(f"[{previous}][{index}:v]xfade=transition={transitions[(index-1)%len(transitions)]}:duration={overlap}:offset={offset:.2f}[{target}]")
            previous = target
        # xfade internally promotes to full-chroma pixels and can inherit an
        # unusual sample aspect ratio. Normalize both for mobile/YouTube use.
        graph.append(f"[{previous}]scale=in_range=pc:out_range=tv,format=yuv420p,setsar=1[vout]")
        run(*inputs, "-filter_complex", ";".join(graph), "-map", "[vout]",
            "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "veryfast", "-crf", "22", str(graded))

        soundtrack = work / "original-synthwave.wav"
        original_music(soundtrack, final_seconds + 0.5)
        run("-i", str(graded), "-i", str(soundtrack), "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
            "-af", "highpass=f=38,lowpass=f=11000,acompressor=threshold=-17dB:ratio=2:attack=15:release=190",
            "-t", f"{final_seconds:.2f}", "-movflags", "+faststart", str(destination))
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--game", default="GTA VI")
    parser.add_argument("--scene-count", type=int, default=4)
    parser.add_argument("--scene-seconds", type=int, default=8)
    parser.add_argument("--width", type=int, default=1080)
    args = parser.parse_args()
    print(cinematic_finish(args.source, args.destination, game=args.game,
                           scene_count=args.scene_count, scene_seconds=args.scene_seconds,
                           width=args.width))
