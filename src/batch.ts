import { createHash } from "node:crypto";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { config } from "./config.js";
import { Ledger } from "./ledger.js";
import { produceVideo } from "./pipeline.js";
import { Outline } from "./types.js";

export interface BatchOptions {
  inboxDir: string;
  ledgerPath?: string;
  uploadToBoxOnFinish?: boolean;
  burnCaptions?: boolean;
  concurrency?: number;
}

export interface BatchSummary {
  produced: string[];
  skipped: string[];
  failed: { jobId: string; outlinePath: string; error: string }[];
}

export async function runBatch(opts: BatchOptions): Promise<BatchSummary> {
  if (!existsSync(opts.inboxDir)) {
    await mkdir(opts.inboxDir, { recursive: true });
  }

  const ledgerPath = opts.ledgerPath ?? path.join(config.WORK_DIR, "ledger.json");
  const ledger = new Ledger(ledgerPath);
  await ledger.load();

  const files = (await readdir(opts.inboxDir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(opts.inboxDir, f))
    .sort();

  log(`batch: ${files.length} outline(s) in ${opts.inboxDir}`);
  const summary: BatchSummary = { produced: [], skipped: [], failed: [] };

  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const queue = [...files];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return summary;

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const outlinePath = queue.shift();
      if (!outlinePath) return;
      await processOne(outlinePath);
    }
  }

  async function processOne(outlinePath: string): Promise<void> {
    const raw = await readFile(outlinePath, "utf8");
    const hash = createHash("sha256").update(raw).digest("hex").slice(0, 16);

    const prior = ledger.findByHash(hash);
    if (prior) {
      log(`skip ${path.basename(outlinePath)} -> already done as ${prior.jobId}`);
      summary.skipped.push(outlinePath);
      return;
    }

    const outline = Outline.parse(JSON.parse(raw));
    const jobId = `${slug(outline.title)}__${hash}`;
    const startedAt = new Date().toISOString();

    await ledger.upsert({
      jobId,
      outlinePath,
      outlineHash: hash,
      status: "running",
      startedAt,
    });

    try {
      const result = await produceVideo({
        outline,
        jobId,
        uploadToBoxOnFinish: opts.uploadToBoxOnFinish,
        burnCaptions: opts.burnCaptions,
      });
      await ledger.upsert({
        jobId,
        outlinePath,
        outlineHash: hash,
        status: "done",
        startedAt,
        finishedAt: new Date().toISOString(),
        finalVideoPath: result.finalVideoPath,
        boxFileId: result.boxFileId,
        boxSharedLink: result.boxSharedLink,
      });
      summary.produced.push(jobId);
      log(`done ${jobId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ledger.upsert({
        jobId,
        outlinePath,
        outlineHash: hash,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: msg,
      });
      summary.failed.push({ jobId, outlinePath, error: msg });
      log(`fail ${jobId}: ${msg}`);
    }
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}
