import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export interface LedgerEntry {
  jobId: string;
  outlinePath: string;
  outlineHash: string;
  status: "pending" | "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  finalVideoPath?: string;
  boxFileId?: string;
  boxSharedLink?: string;
  error?: string;
}

export class Ledger {
  private entries: Record<string, LedgerEntry> = {};

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.entries = {};
      return;
    }
    const raw = await readFile(this.filePath, "utf8");
    this.entries = JSON.parse(raw);
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.entries, null, 2));
  }

  get(jobId: string): LedgerEntry | undefined {
    return this.entries[jobId];
  }

  findByHash(hash: string): LedgerEntry | undefined {
    return Object.values(this.entries).find(
      (e) => e.outlineHash === hash && e.status === "done",
    );
  }

  async upsert(entry: LedgerEntry): Promise<void> {
    this.entries[entry.jobId] = entry;
    await this.save();
  }

  list(): LedgerEntry[] {
    return Object.values(this.entries).sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
  }
}
