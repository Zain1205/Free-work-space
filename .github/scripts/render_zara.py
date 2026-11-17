"""Render review-only, original AI-concept gaming videos on GitHub Actions.

The renderer downloads only freshly generated, original Cloudflare Workers AI
images through a short-lived GitHub OIDC token. It never downloads third-party
game footage, accesses YouTube credentials, or publishes content.
"""

import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from cinematic_finish import cinematic_finish

ORIGIN = "https://zara-gaming-cloud.z16958420.workers.dev"
AUDIENCE = "zara-gaming-cloud-render"
# Cloudflare workers.dev Browser Integrity Check rejects Python urllib's default
# signature. Identify this integration honestly, as Cloudflare recommends; do
# not impersonate a browser or turn off security protections.
USER_AGENT = "ZaraGamingCloud-ReviewRenderer/1.0 (+https://github.com/Zain1205/Free-work-space)"
FRAME_COUNTS = {"short": 4, "long": 6}
SEGMENT_SECONDS = {"short": 8, "long": 25}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
WORK = Path("preview_work")
OUTPUT = Path("preview_output")


def request_json(url: str, *, headers: dict | None = None) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(request, timeout=35) as response:
        return json.load(response)


def github_oidc_token() -> str:
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    request_key = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not request_url or not request_key:
        raise RuntimeError("GitHub Actions OIDC not available; run the official workflow")
    separator = "&" if "?" in request_url else "?"
    encoded_audience = urllib.parse.quote(AUDIENCE, safe="")
    token = request_json(
        f"{request_url}{separator}audience={encoded_audience}",
        headers={"Authorization": f"Bearer {request_key}"},
    )["value"]
    if not token:
        raise RuntimeError("GitHub OIDC provider returned no identity token")
    print(f"::add-mask::{token}")
    return token


def choose_job(jobs: list[dict]) -> dict | None:
    explicit = os.getenv("ZARA_JOB_ID", "").strip()
    now_pakistan = datetime.now(timezone(timedelta(hours=5)))
    event_schedule = os.getenv("ZARA_SCHEDULE", "")
    kind = "long" if event_schedule.startswith("20 16") else "short"
    selected_id = explicit or f"{now_pakistan:%Y-%m-%d}:{kind}"
    matches = [job for job in jobs if job.get("id") == selected_id]
    if not matches:
        print(f"No matching queued draft ({selected_id}); waiting for Cloudflare Cron. Nothing published.")
        return None
    job = matches[0]
    if job.get("format") not in FRAME_COUNTS:
        raise RuntimeError("Unexpected format")
    if job.get("status") not in {
        "awaiting_rights_cleared_assets",
        "awaiting_approved_ai_provider",
        "ready_for_manual_review",
    }:
        raise RuntimeError("Draft is not approved for review render")
    return job


def image_frame(job: dict, frame: int, token: str) -> Path:
    job_id = job["id"]
    params = urllib.parse.urlencode({"job_id": job_id, "frame": frame})
    target = f"{ORIGIN}/runner/frame?{params}"
    request = urllib.request.Request(
        target,
        data=b"",
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Accept": "image/jpeg", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            if response.headers.get("Content-Type", "").split(";")[0] != "image/jpeg":
                raise RuntimeError("Cloudflare returned no image")
            data = response.read(10_000_000)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Cloudflare frame API failed: HTTP {exc.code}") from exc
    if len(data) < 128 or len(data) > 10_000_000:
        raise RuntimeError("Invalid AI image data")
    image_path = WORK / f"scene-{frame:02}.jpg"
    image_path.write_bytes(data)
    return image_path


def render_segment(job: dict, frame: int, input_path: Path) -> Path:
    kind = job["format"]
    seconds = SEGMENT_SECONDS[kind]
    segment = WORK / f"scene-{frame:02}.mp4"
    title = WORK / f"text-{frame:02}.txt"
    title.write_text(
        f"{job['game']}  |  AI CONCEPT  |  NOT GAMEPLAY\n"
        f"Scene {frame + 1}/{FRAME_COUNTS[kind]}  |  Zara Gaming Cloud",
        encoding="utf-8",
    )
    # Deliberately no music or fake game sounds: human review is required.
    # The camera moves over original AI-generated stills, not official footage.
    filter_expression = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        "zoompan=z='min(zoom+0.0003,1.10)':"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        "d=1:s=1080x1920:fps=24,"
        "drawbox=x=0:y=0:w=iw:h=155:color=black@0.65:t=fill,"
        f"drawtext=fontfile={FONT}:textfile={title}:"
        "fontsize=28:fontcolor=white:x=35:y=28:line_spacing=12,"
        "format=yuv420p"
    )
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1",
        "-framerate", "24", "-i", str(input_path), "-t", str(seconds),
        "-vf", filter_expression, "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(segment),
    ]
    subprocess.run(command, check=True)
    return segment


def combine_segments(job: dict, segments: list[Path]) -> Path:
    concat_file = WORK / "sequence.txt"
    concat_file.write_text(
        "\n".join(f"file '{segment.name}'" for segment in segments) + "\n",
        encoding="utf-8",
    )
    filename = job["id"].replace(":", "-")
    # This plain edit is temporary: only the final enhanced export belongs in
    # the downloadable review artifact directory.
    result = WORK / f"zara-{filename}-TEMPORARY.mp4"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat",
         "-safe", "0", "-i", str(concat_file), "-c", "copy", "-movflags", "+faststart", str(result)],
        check=True,
    )
    return result


def render_smoke_test() -> None:
    """Verify FFmpeg and artifact delivery without calling a blocked Worker URL."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = OUTPUT / "zara-render-ENGINE-SMOKE-TEST.mp4"
    video_filter = (
        "drawbox=x=0:y=0:w=iw:h=240:color=0x122b53:t=fill,"
        f"drawtext=fontfile={FONT}:text='ZARA GAMING CLOUD':"
        "fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-120,"
        f"drawtext=fontfile={FONT}:text='FFmpeg RENDER ENGINE CHECK':"
        "fontsize=28:fontcolor=0x91eafa:x=(w-text_w)/2:y=(h-text_h)/2,"
        f"drawtext=fontfile={FONT}:text='TEST ONLY - NOT AI VIDEO - NOT UPLOADED':"
        "fontsize=23:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2+85,"
        "format=yuv420p"
    )
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
        "-i", "color=c=0x070b17:s=720x1280:r=24", "-t", "3",
        "-vf", video_filter, "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "23", "-movflags", "+faststart", str(result),
    ], check=True)
    print(f"Independent FFmpeg renderer passed: {result}. Cloudflare access still requires owner review.")


def main() -> None:
    if os.environ.get("ZARA_SMOKE_TEST") == "1":
        render_smoke_test()
        return
    try:
        jobs = request_json(f"{ORIGIN}/jobs").get("jobs", [])
    except urllib.error.HTTPError as exc:
        # Print only a public URL's non-sensitive error; never log the OIDC token.
        public_body = exc.read(450).decode("utf-8", errors="replace").replace("\n", " ")
        ray = exc.headers.get("CF-RAY", "not-provided")
        print(f"Public Worker /jobs returned HTTP {exc.code}, CF-RAY={ray}, body={public_body}")
        raise
    job = choose_job(jobs)
    if not job:
        return
    WORK.mkdir(parents=True, exist_ok=True)
    token = github_oidc_token()
    segments = []
    for frame in range(FRAME_COUNTS[job["format"]]):
        image = image_frame(job, frame, token)
        segments.append(render_segment(job, frame, image))
    rendered = combine_segments(job, segments)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    enhanced = OUTPUT / f"zara-{job['id'].replace(':', '-')}-CINEMATIC-FOR-REVIEW.mp4"
    cinematic_finish(
        rendered,
        enhanced,
        game=job["game"],
        scene_count=FRAME_COUNTS[job["format"]],
        scene_seconds=SEGMENT_SECONDS[job["format"]],
    )
    print(f"Cinematic review-only preview rendered: {enhanced}; no YouTube upload performed")


if __name__ == "__main__":
    main()
