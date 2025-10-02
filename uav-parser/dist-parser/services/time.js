import dayjs from "dayjs";
/** Преобразует DOF (например 240101 → 2024-01-01). Возвращает null при невалидной дате */
export function dof6ToISO(dof6) {
    if (!dof6)
        return null;
    const s = String(dof6).trim();
    if (!/^\d{6}$/.test(s))
        return null;
    const yy = Number(s.slice(0, 2));
    const year = 2000 + yy; // форматы в наших данных — XXI век
    const mm = s.slice(2, 4);
    const dd = s.slice(4, 6);
    const iso = `${year}-${mm}-${dd}`;
    const d = dayjs(iso);
    if (!d.isValid())
        return null; // отсекаем 2025-13-40 и т.д.
    return iso;
}
/**
 * Нормализация времени:
 * - принимает "HHMM", "HMM", "HH:MM" (лояльно к незначащим нулям)
 * - отдаёт строго "HH:MM:00"
 * - при мусоре/выходе за диапазон вернёт null
 */
export function hhmmToTime(hhmm) {
    if (!hhmm)
        return null;
    const minutes = parseTimeToMinutes(String(hhmm));
    if (minutes == null)
        return null;
    return minutesToHHMMSS(minutes);
}
/** Длительность в минутах между двумя временами (с учётом перехода через полночь) */
export function computeDurationMin(depTime, arrTime) {
    if (!depTime || !arrTime)
        return null;
    const depMin = parseTimeToMinutes(depTime);
    const arrMin = parseTimeToMinutes(arrTime);
    if (depMin == null || arrMin == null)
        return null;
    let diff = arrMin - depMin;
    if (diff < 0)
        diff += 24 * 60; // через полночь
    // Нормальные значения 0..1440 ("00:00→23:59" = 1439, "05:00→05:00" = 0)
    if (diff < 0 || diff > 24 * 60)
        return null;
    return diff;
}
// ────────────────────────────────────────────────────────────────────────────────
// Внутренние утилиты
/** Парсит время в минутах от полуночи. Принимает HHMM / HMM / HH:MM / H:MM. */
function parseTimeToMinutes(input) {
    const s = input.trim();
    // Пытаемся вытащить HH и MM. Поддерживаем как двоеточие, так и слитно.
    let h = null;
    let m = null;
    const colon = s.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) {
        h = Number(colon[1]);
        m = Number(colon[2]);
    }
    else {
        const digits = s.replace(/\D+/g, "");
        if (digits.length === 3) {
            // HMM → H,MM
            h = Number(digits.slice(0, 1));
            m = Number(digits.slice(1, 3));
        }
        else if (digits.length === 4) {
            // HHMM
            h = Number(digits.slice(0, 2));
            m = Number(digits.slice(2, 4));
        }
        else if (digits.length === 2) {
            // MM без часа не допускаем — слишком неоднозначно
            return null;
        }
        else {
            return null;
        }
    }
    if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m))
        return null;
    if (h < 0 || h > 23 || m < 0 || m > 59)
        return null;
    return h * 60 + m;
}
/** Форматирует минуты с начала суток в "HH:MM:00" */
function minutesToHHMMSS(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const HH = String(h).padStart(2, "0");
    const MM = String(m).padStart(2, "0");
    return `${HH}:${MM}:00`;
}
