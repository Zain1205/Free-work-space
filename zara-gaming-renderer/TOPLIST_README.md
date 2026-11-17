# Zara Gaming — Top 5 / Top 10 Gameplay Editor

This editor builds 2–3-minute, 16:9 gameplay countdowns or 9:16 Shorts without voiceover. It adds:

- Opening title template, numbered ranking overlays, scene transitions, colour grading, ending card.
- Optional 0.5–1.5× clip speed for genuine gameplay slow-motion/time-lapse (not fake AI motion).
- Optional on-screen, original or licensed shayari.
- A background song only if you supply a local track **and document its rights**; otherwise an original synthesized instrumental plays.
- Original game audio is muted to avoid accidentally including licensed in-game music or voices.

It **never downloads from YouTube** or other channels and it **never publishes** to YouTube. You must provide local footage you own or are allowed to reuse, complying with the game publisher's rules. Substantial original analysis and accurate facts are recommended for monetization; adding a logo or song alone does not make reused footage original.

## Usage

1. Put your own/licensed MP4s in a local `media/` directory beside the JSON manifest.
2. Make a copy of `toplist-example.json`; update game, title, all source paths, ranks, durations, music and evidence.
3. For a no-song version, remove the `music` object to use the built-in original instrumental.
4. Run:

   `python3 .github/scripts/toplist_editor.py zara-gaming-renderer/toplist-example.json preview_output/top5-review.mp4`

   Preview: add `--width 640`. For Shorts, set `format` to `short` and use 5–10 clips with 3–6 second durations.

5. Review accuracy, game/publisher policy, music rights, framing and metadata before uploading.

### Planned editorial format

- **Mon/Fri Shorts:** GTA VI facts or footage when genuinely available and rights-cleared. Before launch, only official confirmed details or clearly labelled original concepts; do not call AI scenery actual GTA VI gameplay.
- **Tue/Wed/Thu/Sat/Sun Shorts:** one of the remaining five selected/trending games, rotating fighting, driving, explosions, exploration and clutch scenes.
- **Wed/Sun long videos:** Top 5 or Top 10 rankings for one game (places, danger zones, weapons, tips, secrets), only with verified in-game facts. Two videos weekly, no voiceover.

**YouTube connection and publishing:** OAuth is connected, but no verified upload pipeline is deployed yet. Publishing stays OFF until the upload implementation, rights-cleared sources, first private test and owner review are all complete.
