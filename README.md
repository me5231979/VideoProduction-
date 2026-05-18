# Training Video Pipeline

Programmatic production of training videos. End-to-end: outline → script → avatar/narration → composed MP4 → Box.

## Stack

| Stage | Tool | Why |
| --- | --- | --- |
| Scriptwriting | Claude API (`@anthropic-ai/sdk`) | Turns a 5-line outline into a structured scene-by-scene script. |
| Avatar segments | Synthesia API | Talking-head narration without a studio. Requires Enterprise/Creator API access. |
| Narration TTS | ElevenLabs API | Voiceover for screen-capture and b-roll segments where no avatar appears. |
| Composition | FFmpeg (`@ffmpeg-installer/ffmpeg` + `fluent-ffmpeg`) | Concatenation, audio mux, title cards. Static binary — no system FFmpeg needed. |
| Delivery | Local copy to `~/Desktop` | Finished MP4 lands on your desktop. Override with `DESKTOP_DIR` if your Desktop lives elsewhere. |

## Setup

```bash
npm install
cp .env.example .env
# fill in API keys
```

Required keys to actually produce a video end-to-end:

- `ANTHROPIC_API_KEY` — https://console.anthropic.com/settings/keys
- `SYNTHESIA_API_KEY` — request from your Synthesia account manager (API access is gated)
- `ELEVENLABS_API_KEY` — https://elevenlabs.io/app/settings/api-keys (only needed for screen-capture / b-roll narration)

Optional:

- `DESKTOP_DIR` — leave blank to use `~/Desktop`. Set if your Desktop lives elsewhere (e.g. OneDrive-synced: `~/OneDrive/Desktop`).

## Pipeline shape

```
outline.json
   │
   ▼  writeScript()        ┌─ Claude (claude-sonnet-4-6)
script.json ───────────────┤
   │                        └─ scenes: [{ kind: avatar | screen_capture | broll | title_card, narration, ... }]
   ▼  produceVideo()
   │
   ├─ avatar scenes        → Synthesia (create → poll → download)
   ├─ screen_capture/broll → ElevenLabs TTS + FFmpeg audio mux over your local MP4
   └─ title_card           → FFmpeg lavfi solid color + drawtext
   │
   ▼  concatSegments()     → normalize each clip to 1920x1080@30fps, then concat demuxer
   ▼  burnInCaptions()     → SRT from script narration, burned into MP4
final.mp4
   │
   ▼  saveToDesktop()      → copy MP4 to ~/Desktop (or DESKTOP_DIR)
```

## Usage

### Automated batch mode (recommended)

Drop outline JSONs into `inbox/` and run:

```bash
npm run batch
```

The batch processor:
- Walks every `*.json` in `inbox/`
- Computes a hash of each outline; **skips** any that already produced a `done` job in the ledger (idempotent — safe to re-run)
- Generates the script, renders all segments, burns in captions, concatenates, and copies the final MP4 to your Desktop
- Records every attempt in `work/ledger.json` (status, timestamps, desktop path, error if any)
- Exits with code 2 if any job failed

Optional flags: `--concurrency N` (parallel jobs), `--no-captions`, `--no-desktop`, `--inbox <dir>`.

Inspect what's been produced:

```bash
npm run ledger
```

### Single-shot commands

```bash
# Script only (no rendering, no API cost for video providers)
npm run script -- examples/sample-outline.json --out work/script.json

# Full produce with captions, copied to your Desktop
npm run produce -- examples/sample-outline.json

# Standalone TTS
npm run narrate -- "Welcome to the CRM tutorial." --out work/intro.mp3

# Copy any finished MP4 to your Desktop
npm run save -- output/some-video.mp4
```

### Captions

Captions are generated from the script (per-scene narration) and burned in by default.
Disable with `--no-captions`. The pipeline writes a sidecar `.srt` to `work/<jobId>/`.

### Screen-capture / b-roll scenes

For `screen_capture` and `broll` scenes, the script must include an `assetPath`
pointing to a local MP4. Workflow: run `npm run script` first, hand-edit the
generated script to add `assetPath`, then call `produceVideo({ outline, ... })`
programmatically with the edited script — or extend `cli.ts` to accept a
pre-built script via `--script`.

## Cost ballpark (3-minute video)

- Claude script: ~$0.02
- Synthesia avatar (2 min, non-test): one credit/minute, ~$0.50–$2 depending on plan
- ElevenLabs TTS (1 min): ~$0.05 on the Creator plan
- Total: well under $5/video at typical training-content lengths.

Set `SYNTHESIA_TEST_MODE=true` while iterating — test renders are watermarked but don't consume credits.

## Next things you might add

- Background music bed (mix at -22 LUFS under narration).
- Brand intro/outro bumpers as fixed clips concatenated in `pipeline.ts`.
- Folder watcher on `inbox/` so new outlines auto-trigger `batch`.

## Note on remote sessions

If you run this from a cloud sandbox (e.g. Claude Code on the web), `~/Desktop`
inside the container does not sync to your laptop. Either:

- Run the pipeline locally on your laptop (recommended for "on my desktop")
- Or, after a sandbox run, pull `output/` back to your machine via `git`/`scp`
