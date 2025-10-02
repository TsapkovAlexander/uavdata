import path from "node:path";
import dotenv from "dotenv";
dotenv.config();

export const PORT = Number(process.env.PORT || 8081);

export const JOBS_DIR = process.env.JOBS_DIR || path.resolve(process.cwd(), "data/jobs");
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), "data/uploads");

// Путь до сборки парсера
export const PARSER_ENTRY = process.env.PARSER_ENTRY || "/root/uav-parser/dist/parser.js";

// Ограничение параллелизма для файловой очереди
export const CONCURRENCY = Number(process.env.CONCURRENCY || 2);

// ✅ Для обратной совместимости с существующими import { CONFIG } from "./config"
export const CONFIG = {
  PORT,
  JOBS_DIR,
  UPLOADS_DIR,
  PARSER_ENTRY,
  CONCURRENCY,
};