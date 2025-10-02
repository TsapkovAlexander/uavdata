import { Router } from "express";
import multer from "multer";
import fs from "fs/promises";
import fscb from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

const DATA_ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve("data");
const JOBS_DIR = path.join(DATA_ROOT, "jobs");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");

// кладём сразу в UPLOADS_DIR (multer сам создаёт temp файл там)
const upload = multer({ dest: UPLOADS_DIR });

// ---- utils ----
async function ensureDir(dir: string) { await fs.mkdir(dir, { recursive: true }); }
function uuid() { return crypto.randomUUID(); }
async function writeJSON(filePath: string, obj: any) { await fs.writeFile(filePath, JSON.stringify(obj), "utf8"); }
async function readJSON<T=any>(filePath: string): Promise<T> { return JSON.parse(await fs.readFile(filePath, "utf8")); }
function jobFile(id: string) { return path.join(JOBS_DIR, `${id}.json`); }
function resultFile(id: string) { return path.join(JOBS_DIR, `${id}.result.json`); }
async function createJob<TPayload=any>(type: "single"|"file", payload: TPayload) {
  await ensureDir(JOBS_DIR);
  const id = uuid();
  const now = new Date().toISOString();
  const job = { id, type, payload, status: "queued" as const, createdAt: now, updatedAt: now };
  await writeJSON(jobFile(id), job);
  return job;
}

// ---- health ----
router.get("/health", (_req, res) => res.json({ ok: true }));

// ---- single ----
router.post("/single", async (req, res) => {
  try {
    const message = String(req.body?.message || "");
    if (!message.trim()) return res.status(400).json({ ok:false, error:"message_required" });
    const job = await createJob("single", { message });
    const base = `${req.protocol}://${req.get("host")}/v1/enrich`;
    res.json({ ok:true, job_id: job.id, status_url: `${base}/status/${job.id}`, result_url: `${base}/result/${job.id}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:"internal_error" });
  }
});

// ---- file (НОВАЯ) ----
router.post("/file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:"file_required" });
    await ensureDir(UPLOADS_DIR);
    const safeOriginal = (req.file.originalname || "upload.bin").replace(/[^\w.\-]+/g, "_");
    const finalName = `${uuid()}__${safeOriginal}`;
    const finalPath = path.join(UPLOADS_DIR, finalName);
    // req.file.path уже указывает на temp-файл от multer в UPLOADS_DIR — переименуем для стабильного имени
    await fs.rename(req.file.path, finalPath);
    const job = await createJob("file", {
      uploadPath: finalPath,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
    const base = `${req.protocol}://${req.get("host")}/v1/enrich`;
    res.json({ ok:true, job_id: job.id, status_url: `${base}/status/${job.id}`, result_url: `${base}/result/${job.id}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:"internal_error" });
  }
});

// ---- status ----
router.get("/status/:id", async (req, res) => {
  try {
    const jf = jobFile(req.params.id);
    if (!fscb.existsSync(jf)) return res.status(404).json({ ok:false, error:"job not found" });
    const job = await readJSON(jf);
    res.json({ ok:true, job });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:"internal_error" });
  }
});

// ---- result ----
router.get("/result/:id", async (req, res) => {
  try {
    const rf = resultFile(req.params.id);
    if (!fscb.existsSync(rf)) {
      const jf = jobFile(req.params.id);
      if (fscb.existsSync(jf)) {
        const job = await readJSON(jf);
        return res.status(409).json({ ok:false, error:`job status: ${job.status}` });
      }
      return res.status(404).json({ ok:false, error:"job not found" });
    }
    const result = await readJSON(rf);
    res.json({ ok:true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:"internal_error" });
  }
});

export default router;
