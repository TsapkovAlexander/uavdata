"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = createJob;
exports.readJob = readJob;
exports.readResult = readResult;
exports.startWorker = startWorker;
exports.jobURLs = jobURLs;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const config_js_1 = require("./config.js");
function ensureDir(p) {
    node_fs_1.default.mkdirSync(p, { recursive: true });
}
function jobPath(id) {
    return node_path_1.default.join(config_js_1.JOBS_DIR, `${id}.json`);
}
function resultPathOf(id) {
    return node_path_1.default.join(config_js_1.JOBS_DIR, `${id}.result.json`);
}
async function createJob(type, payload) {
    ensureDir(config_js_1.JOBS_DIR);
    const id = (0, node_crypto_1.randomUUID)();
    const now = new Date().toISOString();
    const jf = {
        id,
        type,
        payload,
        status: "queued",
        createdAt: now,
        updatedAt: now
    };
    node_fs_1.default.writeFileSync(jobPath(id), JSON.stringify(jf, null, 2));
    return jf;
}
function readJob(id) {
    const p = jobPath(id);
    if (!node_fs_1.default.existsSync(p))
        return null;
    return JSON.parse(node_fs_1.default.readFileSync(p, "utf8"));
}
function readResult(id) {
    const rp = resultPathOf(id);
    if (!node_fs_1.default.existsSync(rp))
        return null;
    return JSON.parse(node_fs_1.default.readFileSync(rp, "utf8"));
}
function writeJob(j) {
    j.updatedAt = new Date().toISOString();
    node_fs_1.default.writeFileSync(jobPath(j.id), JSON.stringify(j, null, 2));
}
let running = 0;
let tickTimer = null;
function startWorker(processor, pollMs = 1000) {
    ensureDir(config_js_1.JOBS_DIR);
    const tick = async () => {
        if (running >= config_js_1.CONCURRENCY)
            return;
        // возьмём одну queued
        const files = node_fs_1.default.readdirSync(config_js_1.JOBS_DIR).filter(f => f.endsWith(".json") && !f.endsWith(".result.json"));
        const queued = files
            .map(f => JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(config_js_1.JOBS_DIR, f), "utf8")))
            .filter(j => j.status === "queued");
        if (queued.length === 0)
            return;
        const j = queued.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        j.status = "running";
        writeJob(j);
        running++;
        processor(j)
            .then((res) => {
            const rp = resultPathOf(j.id);
            node_fs_1.default.writeFileSync(rp, JSON.stringify(res, null, 2));
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
    if (tickTimer)
        clearInterval(tickTimer);
    tickTimer = setInterval(tick, pollMs);
}
function jobURLs(baseUrl, id) {
    return {
        job_id: id,
        status_url: `${baseUrl}/v1/enrich/status/${id}`,
        result_url: `${baseUrl}/v1/enrich/result/${id}`
    };
}
