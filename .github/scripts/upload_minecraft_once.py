"""Publish one owner-approved CC BY Minecraft Short, never other drafts.

The Cloudflare Worker double-checks the exact approved SHA256, editorial job,
license record, verified GitHub OIDC identity, and one-time DB upload marker.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.request

from render_zara import ORIGIN, USER_AGENT, github_oidc_token


EXPECTED_SHA256 = "b3a4d819183f51b3ea61d7d86b1d53938513b27830eb44fdcde3d7580cdd35cf"
JOB_ID = "2026-11-17:short"
PATH = Path("preview_output/minecraft-five-eras-2026-11-17.mp4")


def main() -> None:
    media = PATH.read_bytes()
    if not 1024 <= len(media) <= 35 * 1024 * 1024:
        raise RuntimeError("Reviewed Short has unexpected file size")
    if hashlib.sha256(media).hexdigest() != EXPECTED_SHA256:
        raise RuntimeError("Media differs from the visual-reviewed, approved Short")

    token = github_oidc_token()
    request = urllib.request.Request(
        f"{ORIGIN}/upload/public-once?job_id={JOB_ID}",
        data=media,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "video/mp4",
            "Content-Length": str(len(media)),
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        # Avoid printing OAuth tokens, signed upload URLs, and response bodies.
        raise RuntimeError(f"One-time reviewed YouTube upload failed: HTTP {error.code}") from error

    print(f"Reviewed Minecraft Short upload result: {result.get('status')}, "
          f"privacy={result.get('privacy')}, video={result.get('watch_url')}")
    if result.get("privacy") != "public" or result.get("status") not in ("uploaded_public", "already_uploaded"):
        raise RuntimeError("YouTube did not confirm PUBLIC visibility; check channel settings")


if __name__ == "__main__":
    main()
