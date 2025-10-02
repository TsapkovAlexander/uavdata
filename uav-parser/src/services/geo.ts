// Универсальный парсинг координат.
// Поддерживаем форматы:
//  1) Слитные DMS: 440846N0430829E (lat: DDMMSS, lon: DDDMMSS)
//  2) Слитные DM:  5509N03737E    (lat: DDMM,   lon: DDDMM)
//  3) Раздельные с литералами: 55°09'00"N 037°37'00"E, 55 09 N, 037 37 E
//  4) Десятичные с полушариями: 55.1234N 037.5678E
//  5) Подписанные десятичные:   55.1234, 37.5678  (или с "," как дробным разделителем)
// Возвращаем { lat, lon, src } либо null.

export function parseCoord(token: string) {
  if (!token) return null;
  const src = token;
  // Нормализуем: убираем юникодные символы градусов/минут/секунд, переводим в верхний регистр
  const cleaned = token
    .replace(/[°º∘]/g, " ")
    .replace(/[′’']/g, " ")
    .replace(/[″"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  // Вариант A: слитные записи без разделителей, попробуем на абсолютно компактной строке
  const compact = cleaned.replace(/[^0-9NSEW+-.,]/g, "");

  // A1: DMS слитно: DDMMSSN DDDMMSS E
  let m = compact.match(/^(\d{2})(\d{2})(\d{2})([NS])(\d{3})(\d{2})(\d{2})([EW])$/);
  if (m) {
    const [, latD, latM, latS, latH, lonD, lonM, lonS, lonH] = m;
    const lat = dmsToDec(+latD, +latM, +latS, latH as Hemisphere);
    const lon = dmsToDec(+lonD, +lonM, +lonS, lonH as Hemisphere);
    if (isValidLat(lat) && isValidLon(lon)) return { lat, lon, src };
  }

  // A2: DM слитно: DDMMN DDDMM E
  m = compact.match(/^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])$/);
  if (m) {
    const [, latD, latM, latH, lonD, lonM, lonH] = m;
    const lat = dmsToDec(+latD, +latM, 0, latH as Hemisphere);
    const lon = dmsToDec(+lonD, +lonM, 0, lonH as Hemisphere);
    if (isValidLat(lat) && isValidLon(lon)) return { lat, lon, src };
  }

  // Вариант B: отдельные широта и долгота с N/S и E/W, произвольные пробелы/разделители
  const latToken = findFirst(
    cleaned,
    /(\d{1,2}(?:[\s:]*\d{1,2}){0,2}(?:[\s:]*\d{1,2})?)\s*([NS])\b/
  );
  const lonToken = findFirst(
    cleaned,
    /(\d{1,3}(?:[\s:]*\d{1,2}){0,2}(?:[\s:]*\d{1,2})?)\s*([EW])\b/
  );
  if (latToken && lonToken) {
    const lat = parseOneCoord(latToken.value, latToken.hemi as Hemisphere, /*isLat*/ true);
    const lon = parseOneCoord(lonToken.value, lonToken.hemi as Hemisphere, /*isLat*/ false);
    if (lat != null && lon != null && isValidLat(lat) && isValidLon(lon)) return { lat, lon, src };
  }

  // Вариант C: десятичные с полушариями — 55.123N 037.567E
  const latDec = cleaned.match(/([+-]?\d{1,2}(?:[.,]\d+)?)\s*([NS])\b/);
  const lonDec = cleaned.match(/([+-]?\d{1,3}(?:[.,]\d+)?)\s*([EW])\b/);
  if (latDec && lonDec) {
    const lat = applyHemisphere(parseFloat(latDec[1].replace(",", ".")), latDec[2] as Hemisphere);
    const lon = applyHemisphere(parseFloat(lonDec[1].replace(",", ".")), lonDec[2] as Hemisphere);
    if (isValidLat(lat) && isValidLon(lon)) return { lat, lon, src };
  }

  // Вариант D: пара подписанных десятичных — "55.1234, 37.5678" или "55,1234 37,5678"
  const signedPair = cleaned.match(/([+-]?\d{1,3}(?:[.,]\d+)?)[\s,;]+([+-]?\d{1,3}(?:[.,]\d+)?)/);
  if (signedPair) {
    const a = parseFloat(signedPair[1].replace(",", "."));
    const b = parseFloat(signedPair[2].replace(",", "."));
    // Пробуем как lat,lon
    if (isValidLat(a) && isValidLon(b)) return { lat: a, lon: b, src };
    // И как lon,lat (редко встречается, но перестрахуемся)
    if (isValidLat(b) && isValidLon(a)) return { lat: b, lon: a, src };
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────────

type Hemisphere = "N" | "S" | "E" | "W";

function dmsToDec(d: number, m: number, s: number, hemi: Hemisphere) {
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return NaN;
  if (m < 0 || m >= 60 || s < 0 || s >= 60) return NaN;
  const raw = d + m / 60 + s / 3600;
  return applyHemisphere(raw, hemi);
}

function applyHemisphere(value: number, hemi: Hemisphere) {
  const sign = hemi === "S" || hemi === "W" ? -1 : 1;
  return sign * value;
}

function isValidLat(lat: number) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}
function isValidLon(lon: number) {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/**
 * Парсит один токен широты/долготы без буквы полушария,
 * принимает "DD MM SS", "DD MM", "DD:MM:SS", "DD:MM" и т.п.
 */
function parseOneCoord(value: string, hemi: Hemisphere, isLat: boolean): number | null {
  const digits = value.trim().split(/[^0-9]+/).filter(Boolean).map((x) => Number(x));
  if (digits.length === 0) return null;

  let d = 0, m = 0, s = 0;
  if (digits.length === 3) {
    [d, m, s] = digits;
  } else if (digits.length === 2) {
    [d, m] = digits; s = 0;
  } else if (digits.length === 1) {
    // Возможно десятичные градусы без полушария-разделителя
    const dec = Number(value.replace(",", "."));
    if (!Number.isFinite(dec)) return null;
    const signed = applyHemisphere(dec, hemi);
    if (isLat ? isValidLat(signed) : isValidLon(signed)) return signed;
    return null;
  } else {
    return null;
  }

  // Валидация градусной части по типу координаты
  const maxD = isLat ? 90 : 180;
  if (d < 0 || d > maxD) return null;
  if (d === maxD && (m > 0 || s > 0)) return null; // 90°00'00"N допустимо, 90°10' — нет

  const dec = dmsToDec(d, m, s, hemi);
  if (!Number.isFinite(dec)) return null;
  return dec;
}

// Вытянуть первое совпадение, вернув как { value, hemi }
function findFirst(text: string, re: RegExp): { value: string; hemi: string } | null {
  const m = re.exec(text);
  if (!m) return null;
  return { value: m[1], hemi: m[2] };
}