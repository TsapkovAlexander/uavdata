import { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseMessagesUniversal } from "../services/parser.js";
import { upsertFlights } from "../db/supa.js";
import { isSane, mergeDepArr } from "../lib/flight-clean.js";

const IngestRequest = z.object({
  messages: z.array(z.object({ text: z.string() }))
});

// null -> undefined для совместимости с типами upsert
function normalizeForUpsert(f: any): any {
  const g: any = { ...f };
  for (const k of [
    "dep_time_utc", "arr_time_utc",
    "dep_point", "arr_point",
    "dep_region_id", "arr_region_id",
    "reg", "uav_type", "status", "operator",
    "remarks", "tz_hint", "dedup_key", "batch_id",
  ]) {
    if (g[k] === null) delete g[k];
  }
  return g;
}

export default async function ingestRoutes(app: FastifyInstance) {
  app.post("/ingest", async (req, reply) => {
    const parsed = IngestRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", details: parsed.error.format() });
    }

    // 0) Санитизация входа: trim, фильтр пустых, дедуп по точному совпадению
    const seen = new Set<string>();
    const rawMessages = parsed.data.messages
      .map(m => ({ text: (m.text ?? "").replace(/\r\n/g, "\n").trim() }))
      .filter(m => {
        if (!m.text || m.text.length < 5) return false;
        if (seen.has(m.text)) return false;
        seen.add(m.text);
        return true;
      });

    if (!rawMessages.length) {
      return reply.code(400).send({ error: "No messages after sanitization" });
    }

    // 1) Обработка чанками — чтобы большие партии не ложили парсер/БД
    const CHUNK = Number(process.env.INGEST_CHUNK || 5000);

    let inserted = 0, updated = 0, duplicates = 0;
    let flightsCount = 0;
    let batchId: string | undefined;
    const allLogs: any[] = [];

    for (let i = 0; i < rawMessages.length; i += CHUNK) {
      const slice = rawMessages.slice(i, i + CHUNK);

      // 2) парсим сырые строки
      const { flights, logs } = parseMessagesUniversal(slice);
      if (logs?.length) allLogs.push(...logs);

      // 3) склеиваем DEP/ARR и отбрасываем мусор
      const merged = mergeDepArr(flights).filter(isSane);
      if (!merged.length) continue;

      flightsCount += merged.length;

      // 4) нормализация null -> undefined и запись
      const ready = merged.map(normalizeForUpsert);

      try {
        const res = await upsertFlights(ready);
        batchId = batchId || res.batch_id;
        inserted += res.inserted || 0;
        updated += res.updated || 0;
        duplicates += res.duplicates || 0;
      } catch (e: any) {
        // лог об ошибке upsert — возвращаем пользователю, но не падаем весь батч
        allLogs.push({
          level: "error",
          msg: "upsert_failed",
          ctx: { index_from: i, index_to: i + slice.length, error: e?.message || String(e) }
        });
      }
    }

    return {
      ok: true,
      batch_id: batchId,
      inserted,
      updated,
      duplicates,
      flights_count: flightsCount,
      messages_received: parsed.data.messages.length,
      messages_used: rawMessages.length,
      logs: allLogs.slice(0, 200), // не раздуваем ответ
    };
  });
}