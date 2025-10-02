// src/worker.ts
import "dotenv/config";
import fsp from "fs/promises";
import path from "path";
import { listQueued, loadJob, saveJob } from "./queue";
import { ensureDir } from "./utils/fs";
import { upsertFlights } from "./db/supa";

// === Конфиг ===
const DATA_ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve("data");

const JOBS_DIR = path.join(DATA_ROOT, "jobs");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");

// путь к собранному парсеру фронта
const PARSER_ENTRY =
  process.env.PARSER_ENTRY || "/root/uav-parser/dist-parser/index.js";

// === Утилиты ===
async function getParser() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(path.resolve(PARSER_ENTRY));
  const fn = mod.parseMessagesUniversal || mod.default?.parseMessagesUniversal;
  if (typeof fn !== "function") {
    throw new Error("parseMessagesUniversal not found in parser entry");
  }
  return fn as (messages: Array<{ text: string }>) => { flights: any[]; logs: any[] };
}

async function writeResult(jobId: string, payload: any) {
  const resultPath = path.join(JOBS_DIR, `${jobId}.result.json`);
  await fsp.writeFile(resultPath, JSON.stringify(payload, null, 2), "utf8");
  return resultPath;
}

function normalizeMessagesFromJson(json: any): Array<{ text: string }> {
  const base = Array.isArray(json) ? json : Array.isArray(json?.messages) ? json.messages : [];
  const out: Array<{ text: string }> = [];
  for (const item of base) {
    if (!item) continue;
    if (typeof item === "string") out.push({ text: item });
    else if (typeof item?.text === "string") out.push({ text: item.text });
  }
  return out;
}

async function readMessagesFromUpload(uploadPath: string, mimeType?: string): Promise<Array<{ text: string }>> {
  const buf = await fsp.readFile(uploadPath);
  const text = buf.toString("utf8").trim();

  // JSON
  if ((mimeType && mimeType.includes("json")) || text.startsWith("[") || text.startsWith("{")) {
    try {
      const json = JSON.parse(text);
      const msgs = normalizeMessagesFromJson(json);
      if (msgs.length > 0) return msgs;
    } catch {
      // если не распарсили — идем дальше
    }
  }

  // NDJSON
  if (text.includes("\n") && text.split("\n").some((l) => l.trim().startsWith("{"))) {
    const msgs: Array<{ text: string }> = [];
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (!l) continue;
      try {
        const obj = JSON.parse(l);
        if (typeof obj === "string") msgs.push({ text: obj });
        else if (obj && typeof obj.text === "string") msgs.push({ text: obj.text });
      } catch {
        msgs.push({ text: l });
      }
    }
    if (msgs.length > 0) return msgs;
  }

  // Plain: по строкам
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ text: l }));
}

// === Обработчики типов задач ===
async function handleSingle(job: any) {
  const parseMessagesUniversal = await getParser();
  const message = String((job.payload && job.payload.message) || "");
  const { flights, logs } = parseMessagesUniversal([{ text: message }]);

  let db = null;
  if (process.env.SUPA_ENABLED === "1") {
    try {
      db = await upsertFlights(flights);
    } catch (e: any) {
      logs.push({ level: "error", msg: "supa_upsert_failed", ctx: { error: String(e?.message || e) } });
    }
  }

  const result = { ok: true, flights, logs, _db: db };
  const resultPath = await writeResult(job.id, result);

  job.status = "done";
  job.updatedAt = new Date().toISOString();
  job.resultPath = resultPath;
  await saveJob(job);
}

async function handleBatch(job: any) {
  throw new Error("batch job type not implemented");
}

async function handleFile(job: any) {
  const parseMessagesUniversal = await getParser();

  const uploadPath = String(job.payload?.uploadPath || "");
  const mimeType = String(job.payload?.mimeType || "");
  if (!uploadPath || !(await fsp.stat(uploadPath).then(() => true).catch(() => false))) {
    throw new Error("uploadPath not found");
  }

  const messages = await readMessagesFromUpload(uploadPath, mimeType);
  if (!messages.length) {
    throw new Error("no messages in uploaded file");
  }

  const { flights, logs } = parseMessagesUniversal(messages);

  let db = null;
  if (process.env.SUPA_ENABLED === "1") {
    try {
      db = await upsertFlights(flights);
    } catch (e: any) {
      logs.push({ level: "error", msg: "supa_upsert_failed", ctx: { error: String(e?.message || e) } });
    }
  }

  const result = {
    ok: true,
    flights,
    logs,
    _stats: { count_in: messages.length, count_out: flights.length },
    _db: db,
  };
  const resultPath = await writeResult(job.id, result);

  job.status = "done";
  job.updatedAt = new Date().toISOString();
  job.resultPath = resultPath;
  await saveJob(job);
}

// === Цикл воркера ===
async function tick() {
  const queued = await listQueued();
  if (!queued.length) return;

  for (const id of queued) {
    const job = await loadJob(id);
    if (!job || job.status !== "queued") continue;

    job.status = "processing";
    job.updatedAt = new Date().toISOString();
    await saveJob(job);

    try {
      switch (job.type) {
        case "single":
          await handleSingle(job);
          break;
        case "file":
          await handleFile(job);
          break;
        case "batch":
          await handleBatch(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
    } catch (e: any) {
      job.status = "error";
      job.updatedAt = new Date().toISOString();
      job.error = String(e?.stack || e?.message || e);
      await saveJob(job);
    }
  }
}

async function main() {
  await ensureDir(JOBS_DIR);
  await ensureDir(UPLOADS_DIR);

  console.log("[worker] file-queue worker started");
  setInterval(tick, 500); // 2 раза в секунду
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
