# Zara Gaming — footage and music rights review (2026-11-17)

This is a source-policy review, **not** a license for a particular video clip or song. No third-party clips or popular-song MP3s have been obtained or cleared. Uploading or monetizing a specific file remains blocked until the file, owner, permission and applicable game/publisher terms are reviewed.

| Requested source | Verified publisher/source guidance | Editorial decision |
| --- | --- | --- |
| GTA VI / Rockstar gameplay or official trailers | Rockstar's [copyright-material policy](https://support.rockstargames.com/articles/7bNaeoMFTV0iUDGhStTXvz/policy-on-posting-copyrighted-rockstar-games-material) covers occasional **non-commercial** fan gameplay, prohibits leaks and various spoilers, and explicitly says it does not extend to music videos or some commercial uses. Licensing requests: `copyright@take2games.com`. | **BLOCKED for monetized Zara Gaming videos** without case-specific rights. Official trailers and other YouTubers' clips are not automatically reusable. Do not claim AI fiction is real GTA VI gameplay. |
| Minecraft gameplay | [Mojang/Microsoft creator guidelines](https://www.minecraft.net/en-us/usage-guidelines) permit YouTube ad revenue for own gameplay with enough genuinely unique content; logo/overlays alone do not satisfy this requirement. | **CONDITIONAL**: only self-recorded capture, accurate ranking/explanation with substantive original creative input, no incidental licensed music, individual file evidence recorded. |
| Counter-Strike 2 / Valve gameplay | [Valve Video Policy](https://store.steampowered.com/video_policy) permits gameplay videos on YouTube and monetization with YouTube Partner Program; it does **not** grant rights to separately redistribute game music/voices or third-party tracks. | **CONDITIONAL**: use self-recorded gameplay with original rankings/explanations; mute in-game soundtrack; track each file's provenance. |
| Clips from unrelated gaming YouTube channels | A public video, game-publisher allowance or Content ID silence does not grant the channel owner's film/recording rights. | **BLOCKED** unless clip owner grants a suitable written license **and** underlying publisher rules permit the proposed use. |
| Famous songs, remixes, commercial poetry recitations | Rights to recording, composition and performance can belong to different owners; muting game audio does not grant rights to a replacement song. | **BLOCKED** until explicit permission/license for YouTube video use and monetization is documented. |
| YouTube Studio Audio Library | [Google help](https://support.google.com/youtube/answer/3376882) explains usage, licensing and attribution. Some tracks require attribution, others not. | **ELIGIBLE after track selection**: download inside owner account, record exact track title, artist, license/attribution text and permitted use. Do not treat arbitrary internet 'no copyright' songs as equivalent. |
| Original code-generated instrumental | `.github/scripts/cinematic_finish.py` synthesizes new instrumental audio locally instead of using a third-party sound recording. | **READY** for pilot background music, subject to final listen and originality/quality review. No vocal track or external song needed. |
| Original on-screen Roman Urdu shayari | User-written or newly composed original text, with no copied verses/performances. | **READY with verification** of authorship. No third-party singing or recitation. |

## Evidence required for every real uploaded edit

1. Local footage filenames with SHA-256 hashes; game, platform, owner/recorder, capture date, duration and capture proof.
2. If the recorder isn't the channel owner, a written re-use license specifying editing, upload, worldwide public visibility, monetization, and derivatives; publisher terms must separately allow the use.
3. For each music track, exact title/artist/file hash, license source and effective terms, attribution as needed. Prefer original synthesized instrumental or YouTube Audio Library.
4. A human reviews the finished MP4 for factual claims, spoilers, offensive content, third-party background music, privacy, copyright and YouTube reused-content standards.
5. Only then add an `approved_video_media` record for the exact MP4 SHA-256 and matching editorial job. The Worker only accepts matching SHA-256 approval for `approved-editorial` and always sets YouTube `privacyStatus=private`. Public release is a separate, still-disabled step.

### Actual test result

- Google YouTube OAuth token exchange and media upload: **PASS** (synthetic, original FFmpeg 3-second MP4).
- [GitHub Actions private upload test #9](https://github.com/Zain1205/Free-work-space/actions/runs/44097457598): **PASS**.
- D1 stored a single private test upload ID `wlz5R2rG85M` on 2026-11-17 13:55 UTC; it is a diagnostic, **not a gameplay post**.
- Public and scheduled publishing: **OFF**.
- Actual third-party game clips: **NOT CLEARED** (no licensed files/permission evidence provided).
- Actual copyrighted songs: **NOT CLEARED** (no selected, documented track). Original soundtrack fallback is available.
