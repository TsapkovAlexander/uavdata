"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const enrich_1 = __importDefault(require("./routes/enrich")); // default export
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const openapi_1 = __importDefault(require("./openapi")); // ✅ default import
const fs_1 = require("./utils/fs");
// Корневая директория данных: ENV или ./data
const DATA_ROOT = process.env.DATA_DIR
    ? path_1.default.resolve(process.env.DATA_DIR)
    : path_1.default.resolve("data");
const app = (0, express_1.default)();
// базовые middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
// health
app.get("/", (_req, res) => res.json({ ok: true, service: "uavdata-api" }));
app.get("/v1/health", (_req, res) => res.json({ ok: true }));
// роуты API
app.use("/v1/enrich", enrich_1.default);
// OpenAPI JSON (дублируем по двум путям — удобно для клиентов/интеграций)
app.get("/openapi.json", (_req, res) => res.json(openapi_1.default));
app.get("/.well-known/openapi.json", (_req, res) => res.json(openapi_1.default));
// Swagger UI
app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapi_1.default, {
    explorer: true,
    swaggerOptions: {
        displayRequestDuration: true,
        docExpansion: "none",
    },
}));
// 404 JSON
app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
});
const PORT = Number(process.env.PORT || 8081);
async function main() {
    // гарантируем папки данных
    await (0, fs_1.ensureDir)(path_1.default.join(DATA_ROOT, "jobs"));
    await (0, fs_1.ensureDir)(path_1.default.join(DATA_ROOT, "uploads"));
    app.listen(PORT, () => {
        console.log(`[uavdata-api] listening on :${PORT}`);
    });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
