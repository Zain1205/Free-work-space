"""Upload exactly one synthetic FFmpeg smoke clip as PRIVATE via Cloudflare.

Must run inside a manually dispatched GitHub Actions workflow. OIDC is never
printed, and neither Google OAuth credentials nor channel tokens are copied
to GitHub. A reviewed gameplay video uses a separate future approval path.
"""

import json
from pathlib import Path
import urllib.error
import urllib.request

from render_zara import ORIGIN, USER_AGENT, github_oidc_token


def main() -> None:
    file = Path('preview_output/zara-render-ENGINE-SMOKE-TEST.mp4')
    if not file.is_file():
        raise RuntimeError('Expected synthetic smoke test file not found')
    size = file.stat().st_size
    if not (1024 <= size <= 10 * 1024 * 1024):
        raise RuntimeError('Private upload smoke test size is out of range')
    identity = github_oidc_token()
    request = urllib.request.Request(
        f'{ORIGIN}/upload/private',
        data=file.read_bytes(), method='POST',
        headers={
            'Authorization': f'Bearer {identity}',
            'Content-Type': 'video/mp4',
            'Content-Length': str(size),
            'X-Zara-Video-Kind': 'synthetic-upload-test',
            'User-Agent': USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        # Public HTTP status only; no tokens, response body, or signed URLs.
        raise RuntimeError(f'Private YouTube upload failed: HTTP {error.code}') from error
    if result.get('privacy') != 'private' or result.get('status') not in ('uploaded_private', 'already_uploaded_private'):
        raise RuntimeError('YouTube did not confirm a private upload')
    print(f'YouTube private upload success: {result.get("watch_url") or result.get("youtube_id")}. Public publishing remains OFF.')


if __name__ == '__main__':
    main()
