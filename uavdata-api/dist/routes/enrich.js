"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const node_path_1 = __importDefault(require("node:path"));
const config_js_1 = require("../config.js");
const queue_js_1 = require("../queue.js");
const upload = (0, multer_1.default)({ dest: config_js_1.UPLOADS_DIR });
const router = (0, express_1.Router)();
// POST /v1/enrich/single  {message:string}
router.post("/single", async (req, res) => {
    try {
        const message = String(req.body?.message || "");
        if (!message)
            return res.status(400).json({ ok: false, error: "message is required" });
        const job = await (0, queue_js_1.createJob)("single", { message });
        const base = `${req.protocol}://${req.get("host")}`;
        return res.json({ ok: true, ...(0, queue_js_1.jobURLs)(base, job.id) });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// POST /v1/enrich/batch  (multipart file)
router.post("/batch", upload.single("file"), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ ok: false, error: "file is required" });
        const uploadPath = node_path_1.default.resolve(req.file.path);
        const job = await (0, queue_js_1.createJob)("batch", { uploadPath });
        const base = `${req.protocol}://${req.get("host")}`;
        return res.json({ ok: true, ...(0, queue_js_1.jobURLs)(base, job.id) });
    }
    catch (e) {
        return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
// GET /v1/enrich/status/:id
router.get("/status/:id", async (req, res) => {
    const j = (0, queue_js_1.readJob)(req.params.id);
    if (!j)
        return res.status(404).json({ ok: false, error: "job not found" });
    return res.json({ ok: true, job: j });
});
// GET /v1/enrich/result/:id
router.get("/result/:id", async (req, res) => {
    const j = (0, queue_js_1.readJob)(req.params.id);
    if (!j)
        return res.status(404).json({ ok: false, error: "job not found" });
    if (j.status !== "done")
        return res.status(409).json({ ok: false, error: `job status: ${j.status}` });
    const r = (0, queue_js_1.readResult)(j.id);
    if (!r)
        return res.status(404).json({ ok: false, error: "result not found" });
    return res.json(r);
});
exports.default = router;
