import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { Script } from "../types.js";
import { probeDuration } from "./ffmpeg.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface SceneTiming {
  sceneId: string;
  startSec: number;
  endSec: number;
}

export async function timeScenes(
  script: Script,
  segmentPaths: string[],
): Promise<SceneTiming[]> {
  if (segmentPaths.length !== script.scenes.length) {
    throw new Error(
      `scene/segment count mismatch: ${script.scenes.length} vs ${segmentPaths.length}`,
    );
  }
  const timings: SceneTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    const dur = await probeDuration(segmentPaths[i]!);
    timings.push({
      sceneId: script.scenes[i]!.id,
      startSec: cursor,
      endSec: cursor + dur,
    });
    cursor += dur;
  }
  return timings;
}

export function buildSrt(script: Script, timings: SceneTiming[]): string {
  const lines: string[] = [];
  script.scenes.forEach((scene, i) => {
    const t = timings[i];
    if (!t) return;
    const chunks = chunkNarration(scene.narration);
    const span = t.endSec - t.startSec;
    const per = chunks.length > 0 ? span / chunks.length : span;
    chunks.forEach((chunk, j) => {
      const start = t.startSec + per * j;
      const end = t.startSec + per * (j + 1);
      lines.push(String(lines.length / 4 + 1));
      lines.push(`${formatTs(start)} --> ${formatTs(end)}`);
      lines.push(chunk);
      lines.push("");
    });
  });
  return lines.join("\n");
}

function chunkNarration(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length <= 90) {
      out.push(s);
    } else {
      const words = s.split(/\s+/);
      let buf: string[] = [];
      for (const w of words) {
        if ([...buf, w].join(" ").length > 80) {
          out.push(buf.join(" "));
          buf = [w];
        } else {
          buf.push(w);
        }
      }
      if (buf.length) out.push(buf.join(" "));
    }
  }
  return out;
}

function formatTs(sec: number): string {
  const ms = Math.floor((sec % 1) * 1000);
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n: number, len = 2): string {
  return n.toString().padStart(len, "0");
}

export async function writeSrt(
  script: Script,
  segmentPaths: string[],
  destPath: string,
): Promise<{ path: string; timings: SceneTiming[] }> {
  const timings = await timeScenes(script, segmentPaths);
  const srt = buildSrt(script, timings);
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, srt);
  return { path: destPath, timings };
}

export async function burnInCaptions(
  videoPath: string,
  srtPath: string,
  outPath: string,
): Promise<string> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .videoFilters(
        `subtitles='${escapedSrt}':force_style='FontName=Sans,FontSize=24,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'`,
      )
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-crf 20",
        "-pix_fmt yuv420p",
        "-c:a copy",
      ])
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}
