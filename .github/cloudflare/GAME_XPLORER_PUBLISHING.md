# Game Xplorer — YouTube scheduled publishing

## Verified implementation (18 Nov 2026)

- Live Cloudflare Worker: `https://zara-gaming-cloud.z16958420.workers.dev/`.
- `GET /upload/status`: connected OAuth, scheduled-upload and thumbnail routes installed.
- `POST /upload/scheduled?job_id=YYYY-MM-DD:long`: accepts up to 35 MiB video/mp4, only with an owner GitHub Actions OIDC signature, a future UTC `X-Zara-Publish-At` timestamp, `X-Zara-Video-Kind: approved-editorial`, and an exact SHA-256 rights approval in D1.
- Validates YouTube's confirmation of `privacyStatus=private` **and** `status.publishAt` before reporting `scheduled`. The video is private until YouTube's scheduled release time; release is handled by YouTube, not an unreliable cron upload.
- `POST /upload/thumbnail`: checks the signed workflow, scheduled video's D1 job+YouTube ID match, JPEG/PNG signature and 2 MiB size cap, then applies the thumbnail to exactly that video.
- Duplicate media SHA-256 values do not trigger a second upload; an uncertain upload state stays reserved for owner reconciliation.
- The approved GitHub workflow is `.github/workflows/zara-render.yml`; invoke the `workflow_dispatch` **Schedule approved** option after adding rights-approved media to `approved_media/` in the repo.

## Live production state — do not misread this as a scheduled video

- Google OAuth connection: **YES**.
- YouTube scheduled-publication API: **DEPLOYED**.
- Exact reviewed `2026-11-18:long` MP4 rights approval: **MISSING**.
- The final MP4 and thumbnail: **NOT in the GitHub runner's `approved_media/`**.
- Actual YouTube video ID and confirmed `publishAt`: **NONE**.
- Automatic generation/ingestion of licensed media: **NOT deployed** (R2 account setup is currently blocked, and the project has no verified reusable gameplay/music asset pool).

No real Minecraft video has been scheduled. Do not claim it is scheduled until the workflow returns the actual YouTube video ID and release timestamp.

## Runbook for the owner after exact footage/music rights are verified

1. Record the approved MP4's SHA-256 and obtain proof for all gameplay, songs, performances, and publisher reuse terms. Check the edited final footage, not merely the source files. Never approve by assumption.
2. Add the matching `approved_video_media` record in D1 (`media_sha256`, `job_id`, detailed `rights_note`) **after** permission evidence is complete. This is the independent publishing gate.
3. Stage that exact reviewed MP4 and its custom JPG/PNG inside `approved_media/` on `Zain1205/Free-work-space`. Avoid publicly distributing third-party media without rights; use a private repository or another approved private asset transport when available.
4. In GitHub → Actions → `Zara Gaming Cloud - Review Render` → Run workflow, set `schedule_approved=true`, `job_id`, `publish_at_utc` in strict UTC, and the two staged relative asset paths. Leave `private_upload_test=false`.
5. Check Actions output for the public YouTube watch URL and scheduled UTC timestamp; inspect YouTube Studio → Content → Scheduled to verify title, thumbnail, and privacy. If thumbnail failed, rerun the workflow **before the publish time**; duplicate upload is prevented by SHA-256.

Pakistan time is UTC+05:00, so **21:00 Pakistan = 16:00 UTC**. For example, 19 Nov 2026 at 21:00 PK is `2026-11-19T16:00:00Z`. The 18 Nov 21:00 PK slot must not be retroactively scheduled: Google's `publishAt` in the past triggers immediate release.

## Production guarantees and limitations

- No direct third-party YouTube downloads or copyrighted song reuse is performed by the Worker.
- No Google access/refresh token is ever copied to GitHub logs; Cloudflare decrypts its stored owner refresh token at request time.
- Automatic release **after** accepted scheduling is provided by YouTube, subject to YouTube processing/restrictions.
- There is deliberately no unattended content approval. Media acquisition, editorial approval and publication submission still need a rights-cleared source, trusted runner assets, and an authorized GitHub workflow dispatch.
- An upload can succeed but fail to return confirmation, leaving a D1 reservation; a human must inspect YouTube Studio before retrying.
- This API does not guarantee custom thumbnails on Shorts until YouTube processing completes; retry after processing when relevant.
