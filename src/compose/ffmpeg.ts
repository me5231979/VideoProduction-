import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const d = data?.format?.duration;
      if (typeof d !== "number") return reject(new Error("no duration"));
      resolve(d);
    });
  });
}

export async function muxAudioOver(
  videoPath: string,
  audioPath: string,
  outPath: string,
): Promise<string> {
  await mkdir(path.dirname(outPath), { recursive: true });
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-map 0:v:0",
        "-map 1:a:0",
        "-c:v copy",
        "-c:a aac",
        "-shortest",
      ])
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}

export async function makeTitleCard(
  title: string,
  subtitle: string,
  durationSec: number,
  outPath: string,
  { width = 1920, height = 1080 }: { width?: number; height?: number } = {},
): Promise<string> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const safeTitle = escapeDrawText(title);
  const safeSub = escapeDrawText(subtitle);
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=black:s=${width}x${height}:d=${durationSec}`)
      .inputFormat("lavfi")
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            text: safeTitle,
            fontcolor: "white",
            fontsize: 72,
            x: "(w-text_w)/2",
            y: "(h-text_h)/2 - 60",
          },
        },
        {
          filter: "drawtext",
          options: {
            text: safeSub,
            fontcolor: "0xCCCCCC",
            fontsize: 36,
            x: "(w-text_w)/2",
            y: "(h-text_h)/2 + 40",
          },
        },
      ])
      .outputOptions(["-pix_fmt yuv420p", "-r 30"])
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}

function escapeDrawText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function concatSegments(
  videoPaths: string[],
  outPath: string,
  workDir: string,
): Promise<string> {
  if (videoPaths.length === 0) throw new Error("no segments to concat");
  await mkdir(workDir, { recursive: true });
  await mkdir(path.dirname(outPath), { recursive: true });

  // Re-encode to a common format first so concat demuxer doesn't choke on mismatched streams.
  const normalized: string[] = [];
  for (let i = 0; i < videoPaths.length; i++) {
    const src = videoPaths[i]!;
    const dest = path.join(workDir, `norm_${i.toString().padStart(3, "0")}.mp4`);
    await normalize(src, dest);
    normalized.push(dest);
  }

  const listPath = path.join(workDir, "concat.txt");
  await writeFile(
    listPath,
    normalized.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .save(outPath)
      .on("end", () => resolve(outPath))
      .on("error", reject);
  });
}

async function normalize(src: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(src)
      .outputOptions([
        "-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-r 30",
        "-c:v libx264",
        "-preset veryfast",
        "-crf 20",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-ar 48000",
        "-ac 2",
      ])
      .save(dest)
      .on("end", () => resolve(dest))
      .on("error", reject);
  });
}
