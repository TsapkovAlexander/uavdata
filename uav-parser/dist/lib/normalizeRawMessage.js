// src/lib/normalizeRawMessage.ts
// распознаём короткую форму: DEP-<id>-ADEPHHMM-ADESHHMM, в т.ч. ADEP/ADES = ZZZZ
const shortFormRe = /^(DEP|ARR)\s*-\s*([A-Z0-9\-]+)\s*-\s*([A-Z]{4})(\d{4})\s*-\s*([A-Z]{4})(\d{4})(?:\s|$)/i;
function stripOuterParens(s) {
    const t = s.trim();
    if (t.startsWith("(") && t.endsWith(")"))
        return t.slice(1, -1).trim();
    return t;
}
function joinBrokenLines(s) {
    // склеиваем "\r?\n-" и просто переносы
    return s.replace(/\r?\n-\s*/g, "-").replace(/\r?\n+/g, " ");
}
function squishSpaces(s) {
    return s.replace(/\s+/g, " ").trim();
}
// Пытаемся вытащить устойчивый идентификатор, пригодный для ключа
function extractUID(s) {
    // 1) RMK/MRxxxxx | RMK/WRxxxxx | RMK/VRxxxxx
    const m1 = s.match(/\bRMK\/\s*((?:M|W|V)R\d{3,})\b/i);
    if (m1)
        return m1[1].toUpperCase();
    // 2) REG/<первый валидный токен> (могут быть списки через запятую)
    const m2 = s.match(/\bREG\/\s*([A-Z0-9\-]+)(?:[, \)])?/i);
    if (m2)
        return m2[1].toUpperCase();
    // 3) SID/числа
    const m3 = s.match(/\bSID\/\s*(\d{6,})\b/i);
    if (m3)
        return `SID${m3[1]}`;
    return null;
}
// Простая детерминированная «заглушка», если ничего не нашли
function fallbackUID(s) {
    // компактный контрольный код по символам
    let a = 0, b = 1;
    for (let i = 0; i < s.length; i++) {
        a = (a + s.charCodeAt(i)) % 65521;
        b = (b + a) % 65521;
    }
    const sum = ((b << 16) | a) >>> 0;
    return `AUTO${sum.toString(36).toUpperCase()}`;
}
// Убедимся, что DOF/ присутствует (иначе парсер обычно ругается ключом)
function hasDOF(s) {
    return /\bDOF\/\d{6}\b/.test(s);
}
// Добавить RMK/UID если его нет
function ensureUID(s) {
    if (/\bRMK\/UID\b/i.test(s))
        return s;
    const uid = extractUID(s) ?? fallbackUID(s);
    return `${s} RMK/UID ${uid}`;
}
export function normalizeRawMessage(raw) {
    // 1) снять скобки + склеить переносы + схлопнуть пробелы
    let s = squishSpaces(joinBrokenLines(stripOuterParens(raw)));
    // 2) короткая форма → длинная
    const m = s.match(shortFormRe);
    if (m) {
        const type = m[1].toUpperCase(); // DEP | ARR
        const flid = m[2]; // 007K347 и т.п.
        const adep = m[3].toUpperCase();
        const at = m[4]; // HHMM
        const ades = m[5].toUpperCase();
        const aa = m[6]; // HHMM
        // остаток после головы (обычно DOF/..., RMK/..., REG/...)
        const headLen = m[0].length;
        const tail = s.slice(headLen).trim();
        // кладём обе пары времён, чтобы парсер не терял инфу
        // и добавляем стаб. идентификатор на основе flid
        s = `${type} RMK/FLID ${flid} ADEP/${adep} ATD/${at} ADES/${ades} ATA/${aa} ${tail}`;
        s = squishSpaces(s);
    }
    // 3) гарантируем наличие UID (из RMK/.., REG/.., SID/.. или fallback)
    s = ensureUID(s);
    // 4) финальный трим
    s = squishSpaces(s);
    return s;
}
