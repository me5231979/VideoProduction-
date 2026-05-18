# Training Video Pipeline

Programmatic production of training videos. End-to-end: outline → script → avatar/narration → composed MP4 → Box.

## Stack

| Stage | Tool | Why |
| --- | --- | --- |
| Scriptwriting | Claude API (`@anthropic-ai/sdk`) | Turns a 5-line outline into a structured scene-by-scene script. |
| Avatar segments | Synthesia API | Talking-head narration without a studio. Requires Enterprise/Creator API access. |
| Narration TTS | ElevenLabs API | Voiceover for screen-capture and b-roll segments where no avatar appears. |
| Composition | FFmpeg (`@ffmpeg-installer/ffmpeg` + `fluent-ffmpeg`) | Concatenation, audio mux, title cards. Static binary — no system FFmpeg needed. |
| Storage | Box (`box-node-sdk`) | Delivery of finished videos with shareable links. |

## Setup

```bash
npm install
cp .env.example .env
# fill in API keys
```

Required keys to actually produce a video end-to-end:

- `ANTHROPIC_API_KEY` — https://console.anthropic.com/settings/keys
- `SYNTHESIA_API_KEY` — request from your Synthesia account manager (API access is gated)
- `ELEVENLABS_API_KEY` — https://elevenlabs.io/app/settings/api-keys
- `BOX_DEVELOPER_TOKEN` — https://app.box.com/developers/console → your app → Developer Token (60-min expiry; swap to JWT/OAuth for production)

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
final.mp4
   │
   ▼  uploadToBox()        → Box folder + shared link
```

## Usage

Generate a script from an outline (no rendering yet):

```bash
npm run script -- examples/sample-outline.json --out work/script.json
```

Produce a finished video end-to-end:

```bash
npm run produce -- examples/sample-outline.json --upload
```

For scenes of kind `screen_capture` or `broll`, the pipeline expects an `assetPath` on each
scene pointing to a local MP4. Workflow: run `script` first, hand-edit `work/script.json` to
add `assetPath` for those scenes (and re-record narration if needed), then pass that edited
script through `produceVideo` programmatically — or wire a `--script` flag into `cli.ts produce`.

One-off narration clip:

```bash
npm run narrate -- "Welcome to the CRM tutorial." --out work/intro.mp3
```

Manual upload:

```bash
npm run upload -- output/some-video.mp4 --folder 0
```

## Cost ballpark (3-minute video)

- Claude script: ~$0.02
- Synthesia avatar (2 min, non-test): one credit/minute, ~$0.50–$2 depending on plan
- ElevenLabs TTS (1 min): ~$0.05 on the Creator plan
- Total: well under $5/video at typical training-content lengths.

Set `SYNTHESIA_TEST_MODE=true` while iterating — test renders are watermarked but don't consume credits.

## Next things you might add

- Captions/subtitles from the script (already structured per scene — straightforward to burn in).
- Background music bed (mix at -22 LUFS under narration).
- Brand intro/outro bumpers as fixed clips concatenated in `pipeline.ts`.
- Replace Box Developer Token with JWT auth in `src/storage/box.ts` for unattended runs.
