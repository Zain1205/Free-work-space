# Zara Gaming Cloud — Three demo reviews and stable workflow

Checked on 18 November 2026 (Pakistan time). Source MP4s came from the user's uploads; screenshots, demos, voice tracks, and logos remain the original creators' material. The videos are **reference material only**, not licensed footage for a Zara Gaming YouTube upload.

| Demo | What the video shows | Verified source | Cloud integration |
| --- | --- | --- | --- |
| 1 (47.13 s, 720×720) | Motion animation prompts / examples for producing coded graphics. This is not a one-click unlimited editing API. | [Codearia Motion Prompt Library](https://academy.codearia.com/en/apps/motion-prompts) shows 250+ examples; a free/pro mixture. | Use original FFmpeg motion and color-grade presets for Zara's ranked video edit; never copy their demo clips or pro prompt collection. |
| 2 (22.73 s, 720×1280) | GitHub repo `tashfeenahmed/freellmapi` promotes pooled free API tiers and smart routing. | [Original FreeLLMAPI repository](https://github.com/tashfeenahmed/freellmapi): the **7.4B** figure is aggregate advertised capacity across individual providers, not a free token balance supplied to Zara. Requires self-hosting and personal credentials, has no SLA, and warns it is for personal experimentation, **not production**. | Optional HTTPS OpenAI-compatible router adapter with a per-day fail-closed reservation budget. **Disabled by default** until owner sets up and authorizes a private router. |
| 3 (41.96 s, 720×1280) | Unnamed plugin promoted as "10B free tokens/month" with Claude Code auto-failover. Mocked-on-screen model names appear, but no verifiable GitHub source or provider terms in the clip. | **Unverified**; don't assume accounts or unlimited free API access exist. | Reuse the legitimate *idea* of fallback and token caps, without installing an unverified plugin. |

## Video editor workflow

1. Produce a ranked editorial outline: game, 5/10 ranks, title, and source fact checks; no fabricated cheat codes.
2. Acquire **self-recorded or expressly licensed** gameplay and record URL/creator/license in a rights manifest.
3. Render with `toplist_editor.py`: 9:16 Short or 16:9 longer list, animated titles, motion transitions, three color-grade presets, 0.5–1.5× speed, optional original/licensed poetry, and original synthesized instrumental music. Original soundtrack/voice can be omitted.
4. Use GitHub Actions to render an owner-review MP4. Current scheduler remains draft-only. Publish only with verified gameplay/music rights and owner review.

## API and token management

Endpoint `GET /integrations/status` reports the actual live configuration and aggregate budget. `POST /integrations/ideas` is owner-key-protected; if no approved router is configured, it returns **zero-token** outline templates. Optional external calls require all three private Worker environment values:

- `ZARA_LLM_ROUTER_ENABLED=true` (explicit opt-in, default false).
- `ZARA_LLM_ROUTER_BASE_URL=https://<owner-controlled-private-router-host>` (HTTPS, no request-supplied targets).
- `ZARA_LLM_ROUTER_API_KEY=<owner-issued-router-key>` (Cloudflare secret; never commit or display).

The optional integration has hard local limits: three attempts per UTC day; at most 2,400 *reserved* tokens/day (800 reserved/request); short responses; ten-second timeout; no automatic retries and safe zero-token fallback. This cap is a **Zara application safety cap**, not a provider billing guarantee. Provider usage/charges must also be limited in the upstream account. All draft ideas require rights and factual review.

## Current blockers

- Cloudflare R2 returned **403 code 10042, enable R2 in Dashboard**. We did not enable a potentially billable storage service. Video MP4 attachments were not copied to cloud object storage; their review metadata is stored in D1.
- No self-hosted FreeLLMAPI server or provider credentials have been supplied. Do not assume the advertised combined free tiers are available.
- The third demo's software/API identity remains unconfirmed; it was not installed.
- No YouTube public auto-upload has been enabled. The earlier reviewed public pilot is separate from scheduled publishing.

## Verification checklist

- `node --test integrations.test.mjs` — owner-auth gate, zero-token fallback, public status, unverified provider rejected.
- `python3 -m py_compile toplist_editor.py` — syntax.
- `python3 toplist_editor.py toplist-smoke.json preview_output/zara-top5-edited-2026-11-18.mp4 --width 360` — local synthetic test with valid clip rights, FFmpeg video/audio test.
- `ffprobe` checks resulting output H.264/AAC and expected duration.
- Cloud D1 migrations and public `GET /integrations/status` response after deploy.
