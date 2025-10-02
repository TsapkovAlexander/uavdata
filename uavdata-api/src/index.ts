import express from "express";
import cors from "cors";
import path from "path";

import enrichRouter from "./routes/enrich";
import swaggerUi from "swagger-ui-express";
import openapiDocument from "./openapi"; 
import { ensureDir } from "./utils/fs";

// Корневая директория данных: ENV или ./data
const DATA_ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve("data");

const app = express();

// базовые middlewares
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// health
app.get("/", (_req, res) => res.json({ ok: true, service: "uavdata-api" }));
app.get("/v1/health", (_req, res) => res.json({ ok: true }));

// роуты API
app.use("/v1/enrich", enrichRouter);

// OpenAPI JSON (дублируем по двум путям — удобно для клиентов/интеграций)
app.get("/openapi.json", (_req, res) => res.json(openapiDocument));
app.get("/.well-known/openapi.json", (_req, res) => res.json(openapiDocument));

// Swagger UI
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapiDocument, {
    explorer: true,
    swaggerOptions: {
      displayRequestDuration: true,
      docExpansion: "none",
    },
  })
);

// 404 JSON
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

const PORT = Number(process.env.PORT || 8081);

async function main() {
  // гарантируем папки данных
  await ensureDir(path.join(DATA_ROOT, "jobs"));
  await ensureDir(path.join(DATA_ROOT, "uploads"));

  app.listen(PORT, () => {
    console.log(`[uavdata-api] listening on :${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
