// scripts/import_regions.ts
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import wk from "wellknown"; // WKT <-> GeoJSON конвертер
type FeatureCollection = any;
type Feature = any;
type Geometry = any;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// минимальный словарь “трудных” имён -> каноническое
const CANON_MAP: Record<string, string> = {
  "москва": "Город Москва",
  "санкт-петербург": "Город Санкт-Петербург",
  "севастополь": "Севастополь",
  "крым": "Республика Крым",
  "чувашия": "Чувашская Республика",
  "северная осетия - алания": "Республика Северная Осетия — Алания",
  "марий эл": "Республика Марий Эл",
  "тыва": "Республика Тыва",
  "калмыкия": "Республика Калмыкия",
  "мордовия": "Республика Мордовия",
  "татарстан": "Республика Татарстан",
  "башкортостан": "Республика Башкортостан",
  "дагестан": "Республика Дагестан",
  "ингушетия": "Республика Ингушетия",
  "кабардино-балкарская республика": "Кабардино-Балкарская Республика",
  "карачево-черкесская республика": "Карачаево-Черкесская Республика",
  "карачаево-черкесская республика": "Карачаево-Черкесская Республика",
  "алтай": "Республика Алтай",
  "якутия": "Республика Саха (Якутия)",
  "саха": "Республика Саха (Якутия)",
  "ханты-мансийский автономный округ": "Ханты-Мансийский автономный округ — Югра",
  "я-мало-ненецкий автономный округ": "Ямало-Ненецкий автономный округ",
  "ямало-ненецкий автономный округ": "Ямало-Ненецкий автономный округ",
  "ненецкий автономный округ": "Ненецкий автономный округ",
};

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[«»"()]/g, "")
    .replace(/\s+—\s+/g, " - ")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripGenericWords(s: string) {
  return s
    .replace(/\b(область|край|республика|город)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

type RegionRow = {
  id: number;
  region_code: number;
  name: string | null;
  short_name: string | null;
  aliases: string[] | null;
};

async function loadRegions(): Promise<RegionRow[]> {
  const { data, error } = await supa
    .from("regions")
    .select("id, region_code, name, short_name, aliases");
  if (error) throw error;
  return data as RegionRow[];
}

function buildIndex(rows: RegionRow[]) {
  const byKey = new Map<string, RegionRow>();
  for (const r of rows) {
    const candidates = new Set<string>();
    if (r.name) {
      candidates.add(norm(r.name));
      candidates.add(norm(stripGenericWords(r.name)));
    }
    if (r.short_name) {
      candidates.add(norm(r.short_name));
      candidates.add(norm(stripGenericWords(r.short_name)));
    }
    if (Array.isArray(r.aliases)) {
      for (const a of r.aliases) {
        candidates.add(norm(a));
        candidates.add(norm(stripGenericWords(a)));
      }
    }
    for (const k of candidates) byKey.set(k, r);
  }
  return byKey;
}

function canonName(raw: string) {
  const n = norm(raw);
  return CANON_MAP[n] ?? raw;
}

async function upsertGeomByCode(region_code: number, geom: Geometry) {
  // Преобразуем GeoJSON -> WKT
  const wkt = wk.stringify(geom as any);
  const { data, error } = await supa.rpc("upsert_region_geom", {
    p_region_code: region_code,
    p_wkt: wkt,
  });
  if (error) throw error;
  return data;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/import_regions.ts /path/to/RF_subjects.geojson");
    process.exit(1);
  }
  const fc = JSON.parse(fs.readFileSync(path, "utf8")) as FeatureCollection;

  const regions = await loadRegions();
  const idx = buildIndex(regions);

  let ok = 0, skip = 0;
  for (const f of fc.features as Feature[]) {
    const props = (f.properties || {}) as any;
    // в click_that_hood поле называется "name"
    let name: string =
      props.name_ru || props.name || props.NAME || props.fullname || props.admin || "";

    if (!name) { skip++; continue; }

    // привести к канону (Москва/СПб/Чувашия/Алтай и т.п.)
    name = canonName(name);

    // пробуем матчинг по нескольким ключам
    const keys = [
      norm(name),
      norm(stripGenericWords(name)),
    ];

    let matched: RegionRow | undefined;
    for (const k of keys) {
      matched = idx.get(k);
      if (matched) break;
    }

    if (!matched) {
      // Доп. попытка: если в исходном name было “республика <X>”
      const alt = name.replace(/^Республика\s+/i, "").trim();
      const k2 = norm(alt);
      matched = idx.get(k2) || idx.get(norm(stripGenericWords(alt)));
    }

    if (!matched) {
      console.warn("Skip (no match):", name);
      skip++;
      continue;
    }

    if (!f.geometry) {
      console.warn("Skip (no geometry):", name);
      skip++;
      continue;
    }

    try {
      await upsertGeomByCode(matched.region_code, f.geometry as Geometry);
      ok++;
    } catch (e: any) {
      console.error("Fail:", name, e.message || e);
      skip++;
    }
  }

  console.log({ ok, fail: skip });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});