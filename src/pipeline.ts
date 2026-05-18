import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { writeScript } from "./scriptwriter.js";
import { renderAvatarSegment } from "./providers/synthesia.js";
import { narrate } from "./providers/elevenlabs.js";
import {
  concatSegments,
  makeTitleCard,
  muxAudioOver,
  probeDuration,
} from "./compose/ffmpeg.js";
import { burnInCaptions, writeSrt } from "./compose/captions.js";
import { saveToDesktop } from "./storage/desktop.js";
import { Outline, type Script } from "./types.js";

export interface ProduceOptions {
  outline: Outline;
  jobId?: string;
  saveToDesktopOnFinish?: boolean;
  burnCaptions?: boolean;
}

export interface ProduceResult {
  jobId: string;
  scriptPath: string;
  finalVideoPath: string;
  srtPath?: string;
  desktopPath?: string;
}

export async function produceVideo(opts: ProduceOptions): Promise<ProduceResult> {
  const jobId = opts.jobId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const workDir = path.join(config.WORK_DIR, jobId);
  const segmentsDir = path.join(workDir, "segments");
  await mkdir(segmentsDir, { recursive: true });
  await mkdir(config.OUTPUT_DIR, { recursive: true });

  log(`[${jobId}] writing script`);
  const script = await writeScript(opts.outline);
  const scriptPath = path.join(workDir, "script.json");
  await writeFile(scriptPath, JSON.stringify(script, null, 2));

  log(`[${jobId}] rendering ${script.scenes.length} scene(s)`);
  const segmentPaths: string[] = [];
  for (const [index, scene] of script.scenes.entries()) {
    const stem = `${index.toString().padStart(3, "0")}_${scene.id}`;
    const segPath = path.join(segmentsDir, `${stem}.mp4`);
    log(`  scene ${stem} (${scene.kind})`);

    if (scene.kind === "avatar") {
      await renderAvatarSegment(scene.narration, `${script.title} — ${scene.id}`, segPath);
    } else if (scene.kind === "title_card") {
      const duration = scene.durationHintSec ?? 4;
      await makeTitleCard(script.title, scene.onScreenText ?? "", duration, segPath);
    } else if (scene.kind === "screen_capture" || scene.kind === "broll") {
      if (!scene.assetPath) {
        throw new Error(
          `Scene ${scene.id} (${scene.kind}) needs assetPath pointing to a local MP4. ` +
            `Record/source it and re-run, or pre-populate it on the script before pipeline run.`,
        );
      }
      const audioPath = path.join(segmentsDir, `${stem}.mp3`);
      await narrate({ text: scene.narration, destPath: audioPath });
      await muxAudioOver(scene.assetPath, audioPath, segPath);
    }

    const dur = await probeDuration(segPath).catch(() => 0);
    log(`    -> ${segPath} (${dur.toFixed(1)}s)`);
    segmentPaths.push(segPath);
  }

  log(`[${jobId}] composing final video`);
  const finalPath = path.join(config.OUTPUT_DIR, `${jobId}.mp4`);
  await concatSegments(segmentPaths, finalPath, path.join(workDir, "concat"));

  const result: ProduceResult = { jobId, scriptPath, finalVideoPath: finalPath };

  if (opts.burnCaptions !== false) {
    log(`[${jobId}] generating captions`);
    const srtDest = path.join(workDir, `${jobId}.srt`);
    const { path: srtPath } = await writeSrt(script, segmentPaths, srtDest);
    result.srtPath = srtPath;
    const captioned = path.join(workDir, `${jobId}.captioned.mp4`);
    await burnInCaptions(finalPath, srtPath, captioned);
    await rename(captioned, finalPath);
  }

  if (opts.saveToDesktopOnFinish !== false) {
    log(`[${jobId}] saving to desktop`);
    const saved = await saveToDesktop(finalPath, `${jobId}.mp4`);
    result.desktopPath = saved.destinationPath;
    log(`[${jobId}] -> ${saved.destinationPath}`);
  }

  log(`[${jobId}] done -> ${finalPath}`);
  return result;
}

export function summarizeScript(script: Script): string {
  const lines = [
    `Title: ${script.title}`,
    `Audience: ${script.audience}`,
    `Objectives:`,
    ...script.learningObjectives.map((o) => `  - ${o}`),
    `Scenes (${script.scenes.length}):`,
    ...script.scenes.map(
      (s, i) =>
        `  ${i.toString().padStart(2, "0")} [${s.kind}] ${s.id}: ${s.narration.slice(0, 80)}${s.narration.length > 80 ? "…" : ""}`,
    ),
  ];
  return lines.join("\n");
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}
