import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { request } from "undici";
import { config, requireKey } from "../config.js";

const API_BASE = "https://api.elevenlabs.io/v1";

interface NarrateInput {
  text: string;
  destPath: string;
  voiceId?: string;
  modelId?: string;
}

export async function narrate(input: NarrateInput): Promise<string> {
  const apiKey = requireKey("ELEVENLABS_API_KEY");
  const voiceId = input.voiceId ?? config.ELEVENLABS_VOICE_ID;
  const modelId = input.modelId ?? config.ELEVENLABS_MODEL_ID;

  const res = await request(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (res.statusCode >= 400) {
    const errText = await res.body.text();
    throw new Error(`ElevenLabs TTS failed: ${res.statusCode} ${errText}`);
  }

  const buf = Buffer.from(await res.body.arrayBuffer());
  await mkdir(path.dirname(input.destPath), { recursive: true });
  await writeFile(input.destPath, buf);
  return input.destPath;
}
