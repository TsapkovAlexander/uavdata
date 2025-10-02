import { promises as fs } from "fs";
import * as path from "path";

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJSON(filePath: string, data: any) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readText(filePath: string) {
  return fs.readFile(filePath, "utf8");
}
