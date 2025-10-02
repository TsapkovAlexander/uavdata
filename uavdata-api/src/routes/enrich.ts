import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { UPLOADS_DIR } from "../config.js";
import { createJob, readJob, readResult, jobURLs } from "../queue.js";

const upload = multer({ dest: UPLOADS_DIR });
const router = Router();

// POST /v1/enrich/single  {message:string}
router.post("/single", async (req, res) => {
  try {
    const message = String(req.body?.message || "");
    if (!message) return res.status(400).json({ ok: false, error: "message is required" });

    const job = await createJob("single", { message });
    const base = `${req.protocol}://${req.get("host")}`;
    return res.json({ ok: true, ...jobURLs(base, job.id) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /v1/enrich/batch  (multipart file)
router.post("/batch", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "file is required" });
    const uploadPath = path.resolve(req.file.path);
    const job = await createJob("batch", { uploadPath });
    const base = `${req.protocol}://${req.get("host")}`;
    return res.json({ ok: true, ...jobURLs(base, job.id) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /v1/enrich/status/:id
router.get("/status/:id", async (req, res) => {
  const j = readJob(req.params.id);
  if (!j) return res.status(404).json({ ok: false, error: "job not found" });
  return res.json({ ok: true, job: j });
});

// GET /v1/enrich/result/:id
router.get("/result/:id", async (req, res) => {
  const j = readJob(req.params.id);
  if (!j) return res.status(404).json({ ok: false, error: "job not found" });
  if (j.status !== "done") return res.status(409).json({ ok: false, error: `job status: ${j.status}` });
  const r = readResult(j.id);
  if (!r) return res.status(404).json({ ok: false, error: "result not found" });
  return res.json(r);
});

export default router;