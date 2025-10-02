import { parseCoord } from "./geo.js";
import { dof6ToISO, hhmmToTime, computeDurationMin } from "./time.js";
import { buildDedupKey, mergeFlights } from "./dedup.js";
/**
 * Универсальный парсер входных сообщений.
 * В этой версии:
 * - Сегментация на блоки (OPR/REG/TYP/STS/RMK/DOF/DEP/DEST/…).
 * - operator.name только из OPR/… или из префикса до первого тега.
 * - Телефоны нормализуются (7–15 цифр, формат E.164-подобный).
 * - REG берём строго из блока REG/… и чистим токены.
 * - Координаты: поддержка DMS, DM, decimal degrees.
 * - Время: только явные источники, никаких авто‑окон.
 * - tz_hint ставим только если явно встречен (UTC/Z/±HHMM).
 */
export function parseMessagesUniversal(messages) {
    const flights = new Map();
    const logs = [];
    for (const item of messages) {
        const raw = String(item.text || "").trim();
        if (!raw)
            continue;
        const f = parseSingle(raw, logs);
        const key = buildDedupKey(f);
        if (!key) {
            logs.push({ level: "warn", msg: "cannot_build_key", ctx: { raw: raw.slice(0, 200) } });
            continue;
        }
        const cur = flights.get(key);
        if (cur)
            flights.set(key, mergeFlights(cur, f));
        else
            flights.set(key, { ...f, dedup_key: key });
    }
    const out = [];
    for (const f of flights.values()) {
        if (f.dep_time_utc && f.arr_time_utc && !f.duration_min) {
            f.duration_min = computeDurationMin(f.dep_time_utc, f.arr_time_utc);
        }
        // tz_hint теперь не форсируем в UTC по умолчанию
        out.push(f);
    }
    return { flights: out, logs };
}
function parseSingle(raw, logs) {
    const text = normalizeRawOnce(raw);
    const f = {
        reg: [],
        source_refs: [{ message_type: inferType(text), snippet: text.slice(0, 200) }]
    };
    // ---- Сегментация тегов ----
    const tagRegex = /\b(?:REG|TYP|STS|OPR|RMK|DOF|DEP|DEST|ADEPZ|ADARRZ|SID|ZZZZ|ATD|ATA)\b/gi;
    const tagPositions = [];
    let mTag;
    while ((mTag = tagRegex.exec(text)) !== null) {
        tagPositions.push({ tag: mTag[0].toUpperCase(), index: mTag.index });
    }
    tagPositions.sort((a, b) => a.index - b.index);
    const getBlock = (tag) => {
        const idx = tagPositions.findIndex((t) => t.tag === tag);
        if (idx === -1)
            return null;
        const start = tagPositions[idx].index + tag.length;
        const end = tagPositions[idx + 1]?.index ?? text.length;
        return text.slice(start, end).replace(/^[\s:\/-]+/, "").trim();
    };
    // ---- SID ----
    const sid = findFirst(text, /\bSID[\/\s:-]*([0-9]{6,})/i) ||
        findFirst(text, /\bSID\b[^\d]*?(\d{6,})/i);
    if (sid)
        f.sid = sid;
    // ---- DOF ----
    const dof = findFirst(text, /\bDOF[\/\s:-]*([0-9]{6})/i) ||
        findFirst(text, /-ADD\s+([0-9]{6})/i) ||
        findFirst(text, /-ADA\s+([0-9]{6})/i);
    if (dof)
        f.dof = dof6ToISO(dof);
    // ---- Время ----
    const depTime = findFirst(text, /\bZZZZ\s*([0-9]{4})\b/i) ||
        findFirst(text, /\b-ATD\s+([0-9]{4})\b/i);
    if (depTime)
        f.dep_time_utc = hhmmToTime(depTime);
    const arrTime = findNth(text, /\bZZZZ\s*([0-9]{4})\b/gi, 2) ||
        findFirst(text, /\b-ATA\s+([0-9]{4})\b/i);
    if (arrTime)
        f.arr_time_utc = hhmmToTime(arrTime);
    // Заголовки вида -UUFO1007 -UUDG0815 -ZZZZ1200
    const headerTime1 = findNth(text, /-(?:ZZZZ|[A-Z]{4})(\d{4})/g, 1);
    if (!f.dep_time_utc && headerTime1)
        f.dep_time_utc = hhmmToTime(headerTime1);
    const headerTime2 = findNth(text, /-(?:ZZZZ|[A-Z]{4})(\d{4})/g, 2);
    if (!f.arr_time_utc && headerTime2)
        f.arr_time_utc = hhmmToTime(headerTime2);
    // ---- TZ hint ----
    const tz = findFirst(text, /\b(UTC|Z)\b/i) ||
        findFirst(text, /\b([+-]\d{2}):?(\d{2})\b/i);
    if (tz)
        f.tz_hint = tz.toUpperCase().replace(/:/g, "");
    // ---- DEP/DEST ----
    const depStrict = getBlock("DEP") || getBlock("ADEPZ") || findFirst(text, /\bDEP[\/\s:-]*([0-9NSEW]+)/i);
    if (depStrict) {
        const c = parseCoordSafe(depStrict);
        if (c)
            f.dep = c;
    }
    const destStrict = getBlock("DEST") || getBlock("ADARRZ") || findFirst(text, /\bDEST[\/\s:-]*([0-9NSEW]+)/i);
    if (destStrict) {
        const c = parseCoordSafe(destStrict);
        if (c)
            f.arr = c;
    }
    if (!f.dep) {
        const depWithWords = findFirst(text, /\bDEP[\/\s:-]*[A-Z0-9 .()_\-]*?(?:\.\s*)?(\d{4,6}[NS]\d{5,7}[EW])/i);
        if (depWithWords) {
            const c = parseCoordSafe(depWithWords);
            if (c)
                f.dep = c;
        }
    }
    if (!f.arr) {
        const destWithWords = findFirst(text, /\b(?:DEST|ADARRZ?)[\/\s:-]*[A-Z0-9 .()_\-]*?(?:\.\s*)?(\d{4,6}[NS]\d{5,7}[EW])/i);
        if (destWithWords) {
            const c = parseCoordSafe(destWithWords);
            if (c)
                f.arr = c;
        }
    }
    if (!f.dep || !f.arr) {
        const coordsDMS = extractAll(text, /(\d{4,6}[NS]\d{5,7}[EW])/g);
        const candidates = [...coordsDMS];
        const decPairRe = /([+-]?\d{1,2}\.\d{3,})\s*[ ,]\s*([+-]?\d{1,3}\.\d{3,})/g;
        let md;
        while ((md = decPairRe.exec(text)) !== null) {
            candidates.push(`${md[1]},${md[2]}`);
        }
        if (!f.dep && candidates[0]) {
            const c = parseCoordSafe(candidates[0]);
            if (c)
                f.dep = c;
        }
        if (!f.arr && candidates[1]) {
            const c = parseCoordSafe(candidates[1]);
            if (c)
                f.arr = c;
        }
    }
    // ---- REG ----
    const regsBlock = getBlock("REG") ||
        findFirst(text, /\bREG[\/\s:-]*([A-Z0-9 ,\-]+?)(?=\s+\b(?:DOF|DEP|DEST|ADEPZ|ADARRZ|TYP|STS|OPR|RMK|SID|ZZZZ|ATD|ATA)\b|[)\n]|$)/i);
    if (regsBlock) {
        f.reg = regsBlock
            .split(/[ ,]+/)
            .map((r) => r.trim().toUpperCase())
            .filter(Boolean)
            .filter((r) => validRegToken(r));
    }
    // ---- Тип/статус ----
    const typ = (getBlock("TYP") || findFirst(text, /\bTYP[\/\s:-]*([A-Z0-9]+)/i));
    if (typ)
        f.uav_type = typ.trim().toUpperCase();
    const sts = (getBlock("STS") || findFirst(text, /\bSTS[\/\s:-]*([A-Z]+)/i));
    if (sts)
        f.status = sts.trim().toUpperCase();
    // ---- Оператор ----
    const oprBlock = getBlock("OPR") || findFirst(text, /\bOPR[\/\s:-]*([^\n]+)/i);
    let operatorName = null;
    if (oprBlock) {
        operatorName = sanitizeOperatorName(oprBlock);
    }
    else {
        // Фоллбэк — префикс до первого тега
        if (tagPositions.length > 0) {
            const prefix = text.slice(0, tagPositions[0].index).trim();
            if (/[A-Za-zА-Яа-яЁё]/.test(prefix)) {
                operatorName = sanitizeOperatorName(prefix);
            }
        }
    }
    const phones = extractPhones(text);
    if (operatorName || phones.length) {
        f.operator = {
            ...(operatorName ? { name: operatorName } : {}),
            ...(phones.length ? { phones } : {})
        };
    }
    // ---- Примечания ----
    const rmk = getBlock("RMK") || findFirst(text, /\bRMK[\/\s:-]*([^\n]+)/i);
    if (rmk)
        f.remarks = rmk.trim();
    // ---- Зона ----
    const zona = findFirst(text, /\bZONA\s*R\s*([0-9.,]+)/i);
    const zonaCenter = findFirst(text, /\bZONA[^\n]*?(\d{4,6}[NS]\d{5,7}[EW])/i) ||
        findFirst(text, /\bZONA[^\n]*?([+-]?\d{1,2}\.\d{3,}\s*[ ,]\s*[+-]?\d{1,3}\.\d{3,})/i);
    if (zona || zonaCenter) {
        const zone = { source: "ZONA" };
        if (zona)
            zone.radius_km = Number(String(zona).replace(",", "."));
        if (zonaCenter) {
            const c = parseCoordSafe(zonaCenter);
            if (c)
                zone.center = c;
        }
        f.zone = zone;
    }
    return f;
}
// ---------------- helpers ----------------
function normalizeRawOnce(s) {
    return s
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]*\/[ \t]*/g, "/")
        .replace(/[ \t]*:[ \t]*/g, ":")
        .trim();
}
function inferType(text) {
    if (/^\(\s*SHR/i.test(text))
        return "SHR";
    if (/^\(\s*DEP/i.test(text) || /-ATD\s+/i.test(text))
        return "DEP";
    if (/^\(\s*ARR/i.test(text) || /-ATA\s+/i.test(text))
        return "ARR";
    return "UNKNOWN";
}
function findFirst(text, re) {
    const m = text.match(re);
    return m ? m[1].trim() : null;
}
function findNth(text, re, n) {
    let i = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        i++;
        if (i === n)
            return m[1];
    }
    return null;
}
function extractAll(text, re) {
    const res = [];
    let m;
    while ((m = re.exec(text)) !== null)
        res.push(m[1]);
    return res;
}
function parseCoordSafe(chunk) {
    try {
        return parseCoord(chunk);
    }
    catch {
        return null;
    }
}
function sanitizeOperatorName(s) {
    const cut = s.split(/\b(?:REG|TYP|STS|OPR|RMK|DOF|DEP|DEST|ADEPZ|ADARRZ|SID|ZZZZ|ATD|ATA)\b/i)[0];
    return cut.replace(/\s{2,}/g, " ").trim().replace(/[\/;:,. -]\s*$/, "");
}
function extractPhones(text) {
    const res = new Set();
    const re = /(\+?\d[\d\-\s()]{5,}\d)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        let raw = m[1].trim();
        let norm = raw.replace(/[^\d+]/g, "");
        norm = norm.replace(/(?!^)\+/g, "");
        const digits = norm.replace(/\D/g, "");
        if (digits.length < 7 || digits.length > 15)
            continue;
        if (!norm.startsWith("+") && digits.length >= 7 && digits.length <= 15) {
            res.add(digits);
        }
        else {
            res.add(norm);
        }
    }
    return Array.from(res);
}
function validRegToken(tok) {
    if (!/^[A-Z0-9-]{3,10}$/.test(tok))
        return false;
    if (!/[A-Z]/.test(tok))
        return false;
    if (/^\d{9,}$/.test(tok))
        return false;
    return true;
}
