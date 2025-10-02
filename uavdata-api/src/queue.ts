import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { JOBS_DIR, CONCURRENCY } from "./config.js";

export type JobStatus = "queued" | "running" | "done" | "error";
export type JobType = "single" | "batch";

export interface JobFile {
  id: string;
  type: JobType;
  payload: any;
  status: JobStatus;
  resultPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function jobPath(id: string) {
  return path.join(JOBS_DIR, `${id}.json`);
}
function resultPathOf(id: string) {
  return path.join(JOBS_DIR, `${id}.result.json`);
}

export async function createJob(type: JobType, payload: any) {
  ensureDir(JOBS_DIR);
  const id = randomUUID();
  const now = new Date().toISOString();
  const jf: JobFile = {
    id,
    type,
    payload,
    status: "queued",
    createdAt: now,
    updatedAt: now
  };
  fs.writeFileSync(jobPath(id), JSON.stringify(jf, null, 2));
  return jf;
}

export function readJob(id: string): JobFile | null {
  const p = jobPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function readResult(id: string): any | null {
  const rp = resultPathOf(id);
  if (!fs.existsSync(rp)) return null;
  return JSON.parse(fs.readFileSync(rp, "utf8"));
}

function writeJob(j: JobFile) {
  j.updatedAt = new Date().toISOString();
  fs.writeFileSync(jobPath(j.id), JSON.stringify(j, null, 2));
}

type Processor = (j: JobFile) => Promise<any>;

let running = 0;
let tickTimer: NodeJS.Timeout | null = null;

export function startWorker(processor: Processor, pollMs = 1000) {
  ensureDir(JOBS_DIR);

  const tick = async () => {
    if (running >= CONCURRENCY) return;

    // возьмём одну queued
    const files = fs.readdirSync(JOBS_DIR).filter(f => f.endsWith(".json") && !f.endsWith(".result.json"));
    const queued = files
      .map(f => JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), "utf8")) as JobFile)
      .filter(j => j.status === "queued");

    if (queued.length === 0) return;

    const j = queued.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    j.status = "running";
    writeJob(j);

    running++;
    processor(j)
      .then((res) => {
        const rp = resultPathOf(j.id);
        fs.writeFileSync(rp, JSON.stringify(res, null, 2));
        const cur = readJob(j.id);
        if (cur) {
          cur.status = "done";
          cur.resultPath = rp;
          writeJob(cur);
        }
      })
      .catch((err) => {
        const cur = readJob(j.id);
        if (cur) {
          cur.status = "error";
          cur.error = String(err?.stack || err?.message || err);
          writeJob(cur);
        }
      })
      .finally(() => {
        running--;
      });
  };

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, pollMs);
}

export function jobURLs(baseUrl: string, id: string) {
  return {
    job_id: id,
    status_url: `${baseUrl}/v1/enrich/status/${id}`,
    result_url: `${baseUrl}/v1/enrich/result/${id}`
  };
}