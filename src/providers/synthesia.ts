import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { request } from "undici";
import { config, requireKey } from "../config.js";

const API_BASE = "https://api.synthesia.io/v2";

interface CreateVideoInput {
  scriptText: string;
  title: string;
  avatar?: string;
  background?: string;
}

interface SynthesiaVideo {
  id: string;
  status: "in_progress" | "complete" | "failed" | "rejected";
  download?: string;
}

async function api<T>(
  method: "GET" | "POST",
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const apiKey = requireKey("SYNTHESIA_API_KEY");
  const res = await request(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(
      `Synthesia ${method} ${endpoint} failed: ${res.statusCode} ${text}`,
    );
  }
  return JSON.parse(text) as T;
}

export async function createAvatarVideo(
  input: CreateVideoInput,
): Promise<SynthesiaVideo> {
  return api<SynthesiaVideo>("POST", "/videos", {
    test: config.SYNTHESIA_TEST_MODE,
    title: input.title,
    visibility: "private",
    input: [
      {
        scriptText: input.scriptText,
        avatar: input.avatar ?? config.SYNTHESIA_DEFAULT_AVATAR,
        background: input.background ?? config.SYNTHESIA_DEFAULT_BACKGROUND,
      },
    ],
  });
}

export async function getVideo(id: string): Promise<SynthesiaVideo> {
  return api<SynthesiaVideo>("GET", `/videos/${id}`);
}

export async function waitForVideo(
  id: string,
  { pollMs = 10_000, timeoutMs = 30 * 60_000 }: { pollMs?: number; timeoutMs?: number } = {},
): Promise<SynthesiaVideo> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await getVideo(id);
    if (v.status === "complete") return v;
    if (v.status === "failed" || v.status === "rejected") {
      throw new Error(`Synthesia video ${id} ${v.status}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Synthesia video ${id} timed out after ${timeoutMs}ms`);
}

export async function downloadVideo(url: string, destPath: string): Promise<string> {
  await mkdir(path.dirname(destPath), { recursive: true });
  const res = await request(url);
  if (res.statusCode >= 400) {
    throw new Error(`Download failed: ${res.statusCode}`);
  }
  const buf = Buffer.from(await res.body.arrayBuffer());
  await writeFile(destPath, buf);
  return destPath;
}

export async function renderAvatarSegment(
  scriptText: string,
  title: string,
  destPath: string,
): Promise<string> {
  const created = await createAvatarVideo({ scriptText, title });
  const finished = await waitForVideo(created.id);
  if (!finished.download) {
    throw new Error(`Synthesia video ${created.id} has no download URL`);
  }
  return downloadVideo(finished.download, destPath);
}
