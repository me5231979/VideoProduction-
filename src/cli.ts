import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { writeScript } from "./scriptwriter.js";
import { narrate } from "./providers/elevenlabs.js";
import { produceVideo, summarizeScript } from "./pipeline.js";
import { runBatch } from "./batch.js";
import { Ledger } from "./ledger.js";
import { uploadToBox } from "./storage/box.js";
import { Outline } from "./types.js";

function usage(): never {
  console.log(`Usage:
  npm run script   -- <outline.json> [--out script.json]
  npm run narrate  -- "Some narration text" --out work/clip.mp3
  npm run produce  -- <outline.json> [--upload] [--no-captions] [--job <id>]
  npm run batch    -- [--inbox inbox] [--upload] [--no-captions] [--concurrency N]
  npm run ledger
  npm run upload   -- <localFile> [--folder <boxFolderId>]
`);
  process.exit(1);
}

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (!command) usage();

  if (command === "script") {
    const outlinePath = rest.find((a) => !a.startsWith("--"));
    if (!outlinePath) usage();
    const outline = Outline.parse(JSON.parse(await readFile(outlinePath, "utf8")));
    const script = await writeScript(outline);
    const outPath = arg("--out") ?? path.join(config.WORK_DIR, "script.json");
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(script, null, 2));
    console.log(summarizeScript(script));
    console.log(`\nWrote ${outPath}`);
    return;
  }

  if (command === "narrate") {
    const text = rest.find((a) => !a.startsWith("--"));
    if (!text) usage();
    const out = arg("--out") ?? path.join(config.WORK_DIR, "narration.mp3");
    await narrate({ text, destPath: out });
    console.log(`Wrote ${out}`);
    return;
  }

  if (command === "produce") {
    const outlinePath = rest.find((a) => !a.startsWith("--"));
    if (!outlinePath) usage();
    const outline = Outline.parse(JSON.parse(await readFile(outlinePath, "utf8")));
    const result = await produceVideo({
      outline,
      jobId: arg("--job"),
      uploadToBoxOnFinish: hasFlag("--upload"),
      burnCaptions: !hasFlag("--no-captions"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "batch") {
    const inboxDir = arg("--inbox") ?? "inbox";
    const summary = await runBatch({
      inboxDir,
      uploadToBoxOnFinish: hasFlag("--upload"),
      burnCaptions: !hasFlag("--no-captions"),
      concurrency: Number(arg("--concurrency") ?? "1"),
    });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed.length > 0) process.exit(2);
    return;
  }

  if (command === "ledger") {
    const ledger = new Ledger(path.join(config.WORK_DIR, "ledger.json"));
    await ledger.load();
    const rows = ledger.list();
    if (rows.length === 0) {
      console.log("(no jobs yet)");
      return;
    }
    for (const r of rows) {
      const link = r.boxSharedLink ? ` ${r.boxSharedLink}` : "";
      const err = r.error ? ` :: ${r.error}` : "";
      console.log(`${r.status.padEnd(7)} ${r.jobId}${link}${err}`);
    }
    return;
  }

  if (command === "upload") {
    const file = rest.find((a) => !a.startsWith("--"));
    if (!file) usage();
    const folder = arg("--folder") ?? config.BOX_DESTINATION_FOLDER_ID;
    const result = await uploadToBox(file, folder);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
