# Zara Gaming Cloud — Free Review Renderer

This repository contains a review-only GitHub Actions/FFmpeg runner for the
[Zara Gaming Cloud](https://zara-gaming-cloud.z16958420.workers.dev/) project.

## What happens

1. Cloudflare Worker Cron inserts draft jobs into its private D1 database.
2. GitHub Actions selects an existing draft at 19:20 PK daily, plus 21:20 PK
   on Wednesday and Sunday. GitHub schedules can be delayed.
3. The GitHub Action obtains a short-lived OIDC identity token. The Worker
   verifies its signature, repository, branch, and workflow before serving
   any AI-generated original concept JPEGs.
4. FFmpeg animates those images into a 1080×1920 silent draft MP4.
5. The result is held as a short-lived GitHub Actions artifact for Zain's
   review. **Nothing is uploaded to YouTube.** No third-party gameplay clips,
   copyrighted soundtrack, or actual game footage are downloaded.

## Review a video

Open **Actions → Zara Gaming Cloud - Review Render → Run workflow**. Provide
an existing job ID such as `2026-11-16:short` (optional for scheduled runs).
Download the `zara-ai-concept-for-review` artifact when the run succeeds.
Review whether the artwork is original, the title is accurate, and any voice,
music, and gameplay references have the right permissions before final upload.

The `.github/workflows/zara-render.yml` action is scheduled but is **not a
publishing workflow**. Public uploads require a separately reviewed and
explicitly enabled publishing feature.

## Free allowance and practical limits

- Workers AI image inference has a 10,000 Neurons/day free allowance. The Worker
  also caps runner frame attempts at 16/day and owner preview attempts at 3/day.
- GitHub Actions standard Linux runners are free for public repositories;
  review artifacts are retained only two days to conserve storage.
- Free FFmpeg camera motion over still images is **not native AI video** and
  does not recreate gameplay. There is no paid realistic video provider or
  ElevenLabs/custom voice connected here.
- Cloudflare R2 was not enabled on the account, so this workflow uses Actions
  artifacts for short-lived review output, not a permanent video library.

No GitHub PAT, Google OAuth Client Secret, YouTube token, or private setup key
is stored in this repository.
