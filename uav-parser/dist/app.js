import Fastify from "fastify";
import multipart from "@fastify/multipart";
// роуты
import flightsRoutes from "./routes/flights.js";
import exportsRoutes from "./routes/exports.js";
import healthRoutes from "./routes/health.js";
import parseRoutes from "./routes/parse.js";
import ingestRoutes from "./routes/ingest.js";
import ingestFileRoutes from "./routes/ingest-file.js";
const app = Fastify({
    logger: true,
    bodyLimit: 200 * 1024 * 1024 // 200 MB для JSON/form (страховка)
});
// плагины
app.register(multipart, {
    limits: {
        fileSize: 200 * 1024 * 1024, // до 200 MB на один файл
        files: 1 // максимум 1 файл за запрос
    }
});
// маршруты
app.register(healthRoutes, { prefix: "/" });
app.register(parseRoutes, { prefix: "/api/v1" });
app.register(ingestRoutes, { prefix: "/api/v1" });
app.register(flightsRoutes, { prefix: "/api/v1" });
app.register(exportsRoutes, { prefix: "/api/v1" });
app.register(ingestFileRoutes, { prefix: "/api/v1" });
export default app;
