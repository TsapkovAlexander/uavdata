"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = exports.CONCURRENCY = exports.PARSER_ENTRY = exports.UPLOADS_DIR = exports.JOBS_DIR = exports.PORT = void 0;
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.PORT = Number(process.env.PORT || 8081);
exports.JOBS_DIR = process.env.JOBS_DIR || node_path_1.default.resolve(process.cwd(), "data/jobs");
exports.UPLOADS_DIR = process.env.UPLOADS_DIR || node_path_1.default.resolve(process.cwd(), "data/uploads");
// Путь до сборки парсера
exports.PARSER_ENTRY = process.env.PARSER_ENTRY || "/root/uav-parser/dist/parser.js";
// Ограничение параллелизма для файловой очереди
exports.CONCURRENCY = Number(process.env.CONCURRENCY || 2);
// ✅ Для обратной совместимости с существующими import { CONFIG } from "./config"
exports.CONFIG = {
    PORT: exports.PORT,
    JOBS_DIR: exports.JOBS_DIR,
    UPLOADS_DIR: exports.UPLOADS_DIR,
    PARSER_ENTRY: exports.PARSER_ENTRY,
    CONCURRENCY: exports.CONCURRENCY,
};
