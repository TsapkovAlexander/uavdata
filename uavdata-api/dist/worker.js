"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const queue_js_1 = require("./queue.js");
const config_js_1 = require("./config.js");
// Ленивая загрузка парсера без top-level await
let _parser = null;
async function getParser() {
    if (_parser)
        return _parser;
    const mod = await Promise.resolve(`${node_path_1.default.resolve(config_js_1.PARSER_ENTRY)}`).then(s => __importStar(require(s)));
    if (typeof mod.parseMessagesUniversal !== "function") {
        throw new Error("Parser module must export parseMessagesUniversal(messages)");
    }
    _parser = mod;
    return _parser;
}
async function processSingle(j) {
    const message = String(j.payload?.message || "");
    const parser = await getParser();
    const { flights, logs } = await parser.parseMessagesUniversal([{ text: message }]);
    return { ok: true, flights, logs };
}
async function processBatch(j) {
    const uploadPath = String(j.payload?.uploadPath || "");
    if (!uploadPath || !node_fs_1.default.existsSync(uploadPath)) {
        throw new Error("Upload file not found");
    }
    const raw = node_fs_1.default.readFileSync(uploadPath, "utf8");
    let items;
    try {
        items = JSON.parse(raw);
    }
    catch {
        throw new Error("Upload JSON is invalid");
    }
    const parser = await getParser();
    const { flights, logs } = await parser.parseMessagesUniversal(items);
    return { ok: true, flights, logs };
}
// Запускаем воркер очереди
(0, queue_js_1.startWorker)(async (j) => {
    if (j.type === "single")
        return processSingle(j);
    if (j.type === "batch")
        return processBatch(j);
    throw new Error(`Unknown job type: ${j.type}`);
});
// Без import.meta: просто лог в момент подключения
console.log("[worker] file-queue worker started");
