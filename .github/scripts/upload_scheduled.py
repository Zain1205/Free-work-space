"""Submit a rights-approved Game Xplorer edit to YouTube's scheduled-release API.

Intended only for the manually dispatched, signed GitHub Actions workflow.
The Worker checks the exact MP4 SHA-256 against its independent approved-media
register. No Google credentials are ever handled by this script or GitHub.
"""

import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

from render_zara import ORIGIN, USER_AGENT, github_oidc_token

MAX_VIDEO_SIZE = 35 * 1024 * 1024
MAX_THUMBNAIL_SIZE = 2 * 1024 * 1024


def approved_local_file(raw: str, *, max_bytes: int, extensions: set[str]) -> Path:
    """Only the checked-out approved_media tree may supply upload bytes."""
    root = (Path.cwd() / "approved_media").resolve()
    path = (Path.cwd() / raw).resolve()
    if root not in path.parents or not path.is_file() or path.suffix.lower() not in extensions:
        raise RuntimeError(f"Approved asset not present at the given path: {raw}")
    size = path.stat().st_size
    if not (1024 <= size <= max_bytes):
        raise RuntimeError("Approved asset is empty or exceeds the upload cap")
    return path


def future_utc_time(raw: str) -> str:
    try:
        moment = datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise RuntimeError("publish_at_utc must be YYYY-MM-DDTHH:MM:SSZ") from exc
    now = datetime.now(timezone.utc)
    if not now + timedelta(minutes=2) <= moment <= now + timedelta(days=365):
        raise RuntimeError("Publishing time must be 2 minutes to 365 days in the future")
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def call_worker(path: str, data: bytes, headers: dict, identity: str) -> dict:
    request = urllib.request.Request(
        f"{ORIGIN}{path}", method="POST", data=data,
        headers={
            "Authorization": f"Bearer {identity}",
            "Content-Length": str(len(data)),
            "User-Agent": USER_AGENT,
            **headers,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Never log bearer tokens, signed URLs or a raw upstream error body.
        raise RuntimeError(f"Game Xplorer upload failed: HTTP {exc.code}") from exc


def main() -> None:
    job_id = os.environ.get("ZARA_JOB_ID", "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}:(short|long)", job_id):
        raise RuntimeError("Invalid editorial job ID")
    publish_at = future_utc_time(os.environ.get("ZARA_PUBLISH_AT_UTC", ""))
    media = approved_local_file(
        os.environ.get("ZARA_VIDEO_PATH", ""),
        max_bytes=MAX_VIDEO_SIZE, extensions={".mp4"},
    )
    thumbnail = approved_local_file(
        os.environ.get("ZARA_THUMBNAIL_PATH", ""),
        max_bytes=MAX_THUMBNAIL_SIZE, extensions={".jpg", ".jpeg", ".png"},
    )
    identity = github_oidc_token()
    query = urllib.parse.urlencode({"job_id": job_id})
    result = call_worker(
        f"/upload/scheduled?{query}", media.read_bytes(),
        {"Content-Type": "video/mp4", "X-Zara-Video-Kind": "approved-editorial",
         "X-Zara-Publish-At": publish_at}, identity,
    )
    if result.get("status") != "scheduled" or result.get("publish_at_utc") != publish_at:
        raise RuntimeError("YouTube did not confirm scheduled publication")
    video_id = result.get("youtube_id", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,32}", video_id):
        raise RuntimeError("YouTube video ID missing")
    if not result.get("thumbnail_set"):
        image_mime = "image/png" if thumbnail.suffix.lower() == ".png" else "image/jpeg"
        image_query = urllib.parse.urlencode({"job_id": job_id, "video_id": video_id})
        image_result = call_worker(
            f"/upload/thumbnail?{image_query}", thumbnail.read_bytes(),
            {"Content-Type": image_mime}, identity,
        )
        if image_result.get("status") not in ("thumbnail_applied", "thumbnail_already_applied"):
            raise RuntimeError("Thumbnail not confirmed; retry this workflow before the scheduled release")
    print(f"Game Xplorer upload scheduled and thumbnail set: https://www.youtube.com/watch?v={video_id} at {publish_at} UTC")


if __name__ == "__main__":
    main()
