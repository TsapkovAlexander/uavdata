// Общее: аккуратный мердж DEP/ARR + базовая фильтрация качества

export type Flight = {
  id?: string;
  dof?: string; // YYYY-MM-DD
  dep_time_utc?: string | null; // HH:MM:SS
  arr_time_utc?: string | null;
  dep_point?: { type: "Point"; coordinates: [number, number] } | null;
  arr_point?: { type: "Point"; coordinates: [number, number] } | null;
  dep_region_id?: number | null;
  arr_region_id?: number | null;
  reg?: string[] | null;
  uav_type?: string | null;
  status?: string | null;
  operator?: string | null;
  remarks?: string | null;
  tz_hint?: string | null;
  dedup_key?: string | null;
  batch_id?: string | null;
};

// Минимальные требования к «здоровому» полёту: дата + (любая точка) + (любой тайм)
export function isSane(f: Flight): boolean {
  const hasDof = !!f.dof;
  const hasAnyPoint = !!(f.dep_point || f.arr_point);
  const hasAnyTime = !!(f.dep_time_utc || f.arr_time_utc);
  return hasDof && hasAnyPoint && hasAnyTime;
}

// Ключ для объединения DEP/ARR одного полёта в пределах дня и района
function mergeKey(x: Flight): string {
  const lon = x.dep_point?.coordinates?.[0] ?? x.arr_point?.coordinates?.[0];
  const lat = x.dep_point?.coordinates?.[1] ?? x.arr_point?.coordinates?.[1];
  const latr = lat != null ? Number(lat).toFixed(4) : "na";
  const lonr = lon != null ? Number(lon).toFixed(4) : "na";
  const dof = x.dof ?? "na";
  // Регистрационный номер помогает не сливать соседние борта на одной площадке
  const reg = Array.isArray(x.reg) ? x.reg.join("|") : (x.reg ?? "");
  return `${dof}::${latr},${lonr}::${reg}`;
}

function mergeTwo(a: Flight, b: Flight): Flight {
  return {
    ...a,
    dep_time_utc: a.dep_time_utc || b.dep_time_utc || null,
    arr_time_utc: a.arr_time_utc || b.arr_time_utc || null,
    dep_point: a.dep_point || b.dep_point || null,
    arr_point: a.arr_point || b.arr_point || null,
    dep_region_id: a.dep_region_id || b.dep_region_id || null,
    arr_region_id: a.arr_region_id || b.arr_region_id || null,
    uav_type: a.uav_type || b.uav_type || null,
    status: a.status || b.status || null,
    operator: a.operator || b.operator || null,
    remarks: a.remarks || b.remarks || null,
    tz_hint: a.tz_hint || b.tz_hint || null,
    reg: (a.reg && a.reg.length ? a.reg : b.reg) || null,
  };
}

export function mergeDepArr(items: Flight[]): Flight[] {
  const map = new Map<string, Flight>();
  for (const x of items) {
    const k = mergeKey(x);
    const prev = map.get(k);
    if (!prev) { map.set(k, x); continue; }
    map.set(k, mergeTwo(prev, x));
  }
  return Array.from(map.values());
}