"""Submit a rights-approved Game Xplorer edit to YouTube's scheduled-release API.

Intended only for the signed GitHub Actions workflow, manually dispatched or
running its rights-approved daily queue.
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


def submit_one(job_id: str, publish_at: str, video_path: str, thumbnail_path: str, identity: str) -> None:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}:(short|long)", job_id):
        raise RuntimeError("Invalid editorial job ID")
    publish_at = future_utc_time(publish_at)
    media = approved_local_file(
        video_path,
        max_bytes=MAX_VIDEO_SIZE, extensions={".mp4"},
    )
    thumbnail = approved_local_file(
        thumbnail_path,
        max_bytes=MAX_THUMBNAIL_SIZE, extensions={".jpg", ".jpeg", ".png"},
    )
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


def main() -> None:
    if os.environ.get("ZARA_AUTO_QUEUE") != "1":
        identity = github_oidc_token()
        submit_one(
            os.environ.get("ZARA_JOB_ID", "").strip(),
            os.environ.get("ZARA_PUBLISH_AT_UTC", ""),
            os.environ.get("ZARA_VIDEO_PATH", ""),
            os.environ.get("ZARA_THUMBNAIL_PATH", ""), identity,
        )
        return

    queue = Path("approved_media/publishing_queue.json")
    if not queue.is_file():
        print("No owner-approved publishing queue exists; no video uploaded.")
        return
    if queue.stat().st_size > 50_000:
        raise RuntimeError("Publishing queue exceeds the manifest size limit")
    entries = json.loads(queue.read_text(encoding="utf-8"))
    if not isinstance(entries, list) or len(entries) > 20:
        raise RuntimeError("Publishing queue must contain at most 20 entries")
    now = datetime.now(timezone.utc)
    selected = []
    for entry in entries:
        if not isinstance(entry, dict) or not all(isinstance(entry.get(key), str)
               for key in ("job_id", "publish_at_utc", "video_path", "thumbnail_path")):
            raise RuntimeError("Invalid entry in owner-approved publishing queue")
        try:
            moment = datetime.strptime(entry["publish_at_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise RuntimeError("Invalid UTC timestamp in publishing queue") from exc
        if now + timedelta(minutes=2) <= moment <= now + timedelta(hours=48):
            selected.append(entry)
    if not selected:
        print("No approved queue items due within 48 hours; no video uploaded.")
        return
    identity = github_oidc_token()
    for entry in selected:
        submit_one(entry["job_id"], entry["publish_at_utc"],
                   entry["video_path"], entry["thumbnail_path"], identity)


if __name__ == "__main__":
    main()
