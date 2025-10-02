import { parseMessagesUniversal } from "../services/parser.js";
import { upsertFlights } from "../db/supa.js";
import AdmZip from "adm-zip";
import { isSane, mergeDepArr } from "../lib/flight-clean.js";
/** ---------- utils: чтение файлов ---------- */
function splitLines(buf) {
    return buf.toString("utf8").replace(/\r\n/g, "\n").split("\n").map(s => s.trim()).filter(Boolean);
}
async function extractTextsFromXlsx(buf) {
    const { read, utils } = await import("xlsx");
    const wb = read(buf, { type: "buffer" });
    const out = [];
    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows = utils.sheet_to_json(ws, { header: 1, raw: false });
        for (const row of rows)
            for (const cell of row) {
                if (typeof cell === "string") {
                    const s = cell.replace(/\r\n/g, "\n").trim();
                    if (s)
                        out.push(s);
                }
            }
    }
    return out;
}
/** ---------- фильтр кандидатов ---------- */
function filterLikelyMessages(texts) {
    const re = /(^\(?SHR-\b)|(^-?TITLE\s+I(?:DEP|ARR)\b)|(^\(?DEP-\b)|(^\(?ARR-\b)/im;
    return texts.filter(t => re.test(t));
}
function parseKVs(block) {
    const kv = {};
    const lines = block.replace(/\r\n/g, "\n").split("\n");
    for (const raw of lines) {
        const s = raw.trim();
        const m = /^-\s*([A-Z]+)\s+(.*)$/i.exec(s);
        if (m)
            kv[m[1].toUpperCase()] = m[2].trim();
    }
    return kv;
}
// координаты могут содержать русские С/В — приводим к C/B
function sanitizeApt(s) {
    if (!s)
        return undefined;
    return s.toUpperCase().replace(/С/g, "C").replace(/В/g, "B");
}
function pseudoCodeFromCoords(coords) {
    if (!coords)
        return;
    const m = /(\d{2,4}[NS]\d{3,5}[EW])/i.exec(coords.replace(/\s+/g, ""));
    return m ? `P${m[1].toUpperCase()}` : undefined;
}
function adaptIdepIarr(texts) {
    const out = [];
    for (const t of texts) {
        if (/^-?\s*TITLE\s+IDEP\b/i.test(t)) {
            const kv = parseKVs(t);
            const sid = kv["SID"];
            const add = kv["ADD"]; // YYMMDD
            const atd = kv["ATD"] || "0000";
            const adepZ = sanitizeApt(kv["ADEPZ"]);
            const adep = (kv["ADEP"] && kv["ADEP"].toUpperCase()) || pseudoCodeFromCoords(adepZ) || "ZZZZ";
            const reg = (kv["REG"] && kv["REG"].toUpperCase()) || "ZZZZZ";
            const depMsg = [
                `(DEP-${reg}-${adep}${atd}-ZZZZ`,
                `-DOF/${add || ""} RMK/SID ${sid || ""}`,
                `DEP/${adepZ || adep} DEST/${adepZ || adep})`
            ].join("\n");
            out.push(depMsg);
            continue;
        }
        if (/^-?\s*TITLE\s+IARR\b/i.test(t)) {
            const kv = parseKVs(t);
            const sid = kv["SID"];
            const ada = kv["ADA"]; // YYMMDD
            const ata = kv["ATA"] || "0000";
            const adarrZ = sanitizeApt(kv["ADARRZ"]);
            const adarr = (kv["ADARR"] && kv["ADARR"].toUpperCase()) || pseudoCodeFromCoords(adarrZ) || "ZZZZ";
            const reg = (kv["REG"] && kv["REG"].toUpperCase()) || "ZZZZZ";
            const arrMsg = [
                `(ARR-${reg}-${adarr}${ata}-ZZZZ`,
                `-DOF/${ada || ""} RMK/SID ${sid || ""}`,
                `DEP/${adarrZ || adarr} DEST/${adarrZ || adarr})`
            ].join("\n");
            out.push(arrMsg);
            continue;
        }
        out.push(t);
    }
    return out;
}
/** ---------- нормализация под upsert ---------- */
function normalizeForUpsert(f) {
    const g = { ...f };
    for (const k of [
        "dep_time_utc", "arr_time_utc",
        "dep_point", "arr_point",
        "dep_region_id", "arr_region_id",
        "reg", "uav_type", "status", "operator",
        "remarks", "tz_hint", "dedup_key", "batch_id",
    ]) {
        if (g[k] === null)
            delete g[k];
    }
    return g;
}
/** ---------- ГИДРАТАЦИЯ: подставляем dep_point/arr_point из dep/arr ---------- */
function coordsToStr(obj) {
    if (!obj || typeof obj.lat !== "number" || typeof obj.lon !== "number")
        return undefined;
    // формат «lat,lon» на всякий — если нет исходной строки
    return `${obj.lat},${obj.lon}`;
}
function ensurePoints(f) {
    if (!f.dep_point) {
        f.dep_point = f.dep?.src || coordsToStr(f.dep);
    }
    if (!f.arr_point) {
        f.arr_point = f.arr?.src || coordsToStr(f.arr);
    }
    return f;
}
// небольшой помощник для дебага
function missingFieldsSummary(f) {
    const required = ["reg", "dep_point", "arr_point", "dep_time_utc", "dof"];
    const missing = required.filter(k => f[k] == null);
    return { id: f?.id || null, missing, pick: {
            reg: f.reg, dof: f.dof, dep_point: f.dep_point, arr_point: f.arr_point,
            dep_time_utc: f.dep_time_utc, arr_time_utc: f.arr_time_utc, tz_hint: f.tz_hint
        } };
}
/** ---------- основной маршрут ---------- */
export default async function ingestFileRoutes(app) {
    app.post("/ingest-file", async (req, reply) => {
        const mp = await req.file();
        if (!mp)
            return reply.code(400).send({ error: "file is required" });
        const filename = (mp.filename || "upload").toLowerCase();
        const buf = await mp.toBuffer();
        if (!buf?.length)
            return reply.code(400).send({ error: "empty file" });
        const q = (req.query || {});
        const limit = q?.limit ? Number(q.limit) : Infinity;
        const debug = q?.debug === "1" || q?.debug === "true";
        let texts = [];
        try {
            if (filename.endsWith(".txt") || filename.endsWith(".csv") || filename.endsWith(".log")) {
                texts = splitLines(buf);
            }
            else if (filename.endsWith(".xlsx")) {
                texts = await extractTextsFromXlsx(buf);
            }
            else if (filename.endsWith(".zip")) {
                const zip = new AdmZip(buf);
                for (const entry of zip.getEntries()) {
                    if (entry.isDirectory)
                        continue;
                    const name = entry.entryName.toLowerCase();
                    const eb = entry.getData();
                    if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".log")) {
                        texts.push(...splitLines(eb));
                    }
                    else if (name.endsWith(".xlsx")) {
                        texts.push(...await extractTextsFromXlsx(eb));
                    }
                }
            }
            else {
                texts = splitLines(buf);
            }
        }
        catch (e) {
            return reply.code(400).send({ error: `failed to read file: ${e?.message || String(e)}` });
        }
        // 1) кандидаты
        const candidates = filterLikelyMessages(texts);
        const sliced = candidates.slice(0, isFinite(limit) ? limit : candidates.length);
        if (!sliced.length)
            return reply.code(400).send({ error: "no recognizable messages in file" });
        // 2) адаптация IDEP/IARR
        const adapted = adaptIdepIarr(sliced);
        // 3) парсинг и запись chunk-ами
        const CHUNK = Number(process.env.INGEST_CHUNK || 5000);
        let inserted = 0, updated = 0, duplicates = 0;
        let batchId;
        const allLogs = [];
        let flightsRawTotal = 0;
        let flightsMergedTotal = 0;
        let flightsSaneTotal = 0;
        const previewMerged = [];
        const previewSane = [];
        const previewMissing = [];
        for (let i = 0; i < adapted.length; i += CHUNK) {
            const slice = adapted.slice(i, i + CHUNK).map(t => ({ text: t }));
            const { flights, logs } = parseMessagesUniversal(slice);
            if (logs?.length)
                allLogs.push(...logs);
            flightsRawTotal += flights?.length || 0;
            // merge
            const merged = mergeDepArr(flights).filter(Boolean);
            flightsMergedTotal += merged.length;
            // ГИДРАТАЦИЯ ТОЧЕК — ДО isSane!
            const hydrated = merged.map(ensurePoints);
            if (previewMerged.length < 5)
                previewMerged.push(...hydrated.slice(0, 5 - previewMerged.length));
            // sanity
            const sane = hydrated.filter((f) => {
                const ok = isSane(f);
                if (!ok && previewMissing.length < 12)
                    previewMissing.push(missingFieldsSummary(f));
                return ok;
            });
            flightsSaneTotal += sane.length;
            if (previewSane.length < 5)
                previewSane.push(...sane.slice(0, 5 - previewSane.length));
            if (!sane.length)
                continue;
            const ready = sane.map(normalizeForUpsert);
            const res = await upsertFlights(ready);
            batchId = batchId || res.batch_id;
            inserted += res.inserted;
            updated += res.updated;
            duplicates += res.duplicates;
        }
        if (debug) {
            return {
                ok: true,
                filename: mp.filename,
                size: buf.length,
                messages_total: texts.length,
                candidates_total: candidates.length,
                used_total: sliced.length,
                flights_raw_total: flightsRawTotal,
                flights_merged_total: flightsMergedTotal,
                flights_sane_total: flightsSaneTotal,
                inserted, updated, duplicates,
                batch_id: batchId,
                sample_candidates: sliced.slice(0, 5),
                sample_adapted: adapted.slice(0, 5),
                preview_merged: previewMerged,
                preview_sane: previewSane,
                preview_missing_fields: previewMissing,
                logs: allLogs.slice(0, 120),
            };
        }
        return {
            ok: true,
            filename: mp.filename,
            size: buf.length,
            messages_total: texts.length,
            messages_used: adapted.length,
            flights_count: inserted + updated,
            batch_id: batchId,
            inserted, updated, duplicates,
            logs: allLogs.slice(0, 200),
        };
    });
}
