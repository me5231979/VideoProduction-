import { copyFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";

export interface DesktopSaveResult {
  destinationPath: string;
}

export function resolveDesktopDir(): string {
  if (config.DESKTOP_DIR && config.DESKTOP_DIR.length > 0) {
    return expandHome(config.DESKTOP_DIR);
  }
  return path.join(os.homedir(), "Desktop");
}

export async function saveToDesktop(
  localPath: string,
  fileName?: string,
): Promise<DesktopSaveResult> {
  const dir = resolveDesktopDir();
  await mkdir(dir, { recursive: true });
  const destinationPath = path.join(dir, fileName ?? path.basename(localPath));
  await copyFile(localPath, destinationPath);
  return { destinationPath };
}

function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
