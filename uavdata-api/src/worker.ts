import path from "node:path";
import fs from "node:fs";
import { startWorker, JobFile } from "./queue.js";
import { PARSER_ENTRY } from "./config.js";

// Ленивая загрузка парсера без top-level await
let _parser: any | null = null;
async function getParser() {
  if (_parser) return _parser;
  const mod = await import(path.resolve(PARSER_ENTRY));
  if (typeof mod.parseMessagesUniversal !== "function") {
    throw new Error("Parser module must export parseMessagesUniversal(messages)");
  }
  _parser = mod;
  return _parser;
}

async function processSingle(j: JobFile) {
  const message: string = String(j.payload?.message || "");
  const parser = await getParser();
  const { flights, logs } = await parser.parseMessagesUniversal([{ text: message }]);
  return { ok: true, flights, logs };
}

async function processBatch(j: JobFile) {
  const uploadPath = String(j.payload?.uploadPath || "");
  if (!uploadPath || !fs.existsSync(uploadPath)) {
    throw new Error("Upload file not found");
  }
  const raw = fs.readFileSync(uploadPath, "utf8");
  let items: Array<{ text: string }>;
  try {
    items = JSON.parse(raw);
  } catch {
    throw new Error("Upload JSON is invalid");
  }
  const parser = await getParser();
  const { flights, logs } = await parser.parseMessagesUniversal(items);
  return { ok: true, flights, logs };
}

// Запускаем воркер очереди
startWorker(async (j) => {
  if (j.type === "single") return processSingle(j);
  if (j.type === "batch") return processBatch(j);
  throw new Error(`Unknown job type: ${j.type}`);
});

// Без import.meta: просто лог в момент подключения
console.log("[worker] file-queue worker started");