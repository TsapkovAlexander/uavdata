function round6(v) {
    return Math.round(v * 1e6) / 1e6;
}
function firstReg(f) {
    const r = Array.isArray(f.reg)
        ? f.reg.find((x) => x && x !== "ZZZZZ")
        : null;
    return r || null;
}
// Построение ключа дедупликации.
// Приоритеты:
// 1) SID + DOF
// 2) DEP(lat/lon) + DOF + dep_time
// 3) DEP(lat/lon) + DOF + arr_time
// 4) ARR(lat/lon) + DOF + (dep_time || arr_time)
// 5) REG + DOF + (dep_time || arr_time)
// Все значения нормализуются для стабильности.
export function buildDedupKey(f) {
    const normSid = f.sid ? String(f.sid).trim().toUpperCase() : null;
    const normDof = f.dof ? String(f.dof).trim() : null;
    if (normSid && normDof)
        return `${normSid}_${normDof}`;
    if (f.dep?.lat != null && f.dep?.lon != null && normDof && f.dep_time_utc) {
        return `${round6(f.dep.lat)}_${round6(f.dep.lon)}_${normDof}_${f.dep_time_utc}`;
    }
    if (f.dep?.lat != null && f.dep?.lon != null && normDof && f.arr_time_utc) {
        return `${round6(f.dep.lat)}_${round6(f.dep.lon)}_${normDof}_${f.arr_time_utc}`;
    }
    if (f.arr?.lat != null && f.arr?.lon != null && normDof && (f.dep_time_utc || f.arr_time_utc)) {
        const t = f.dep_time_utc ?? f.arr_time_utc;
        return `${round6(f.arr.lat)}_${round6(f.arr.lon)}_${normDof}_${t}`;
    }
    const reg = firstReg(f);
    const time = f.dep_time_utc ?? f.arr_time_utc;
    if (reg && normDof && time) {
        return `${reg}_${normDof}_${time}`;
    }
    return null;
}
export function mergeFlights(a, b) {
    // Берём x если он есть, иначе y
    const pick = (x, y) => (x != null ? x : y);
    // Мерж массивов с нормализацией и uniq
    const uniqArray = (arr = []) => Array.from(new Set(arr.map((x) => (typeof x === "string" ? x.trim() : x)))).filter(Boolean);
    // Для оператора мержим name и телефоны, если оба есть
    const mergeOperator = (op1, op2) => {
        if (!op1 && !op2)
            return undefined;
        if (!op1)
            return op2;
        if (!op2)
            return op1;
        return {
            name: op1.name || op2.name,
            phones: uniqArray([...(op1.phones || []), ...(op2.phones || [])])
        };
    };
    // Берём наиболее подробные координаты (DMS > DM > decimal), иначе первый попавшийся
    const pickCoord = (c1, c2) => {
        if (!c1)
            return c2;
        if (!c2)
            return c1;
        if (c1.src && c2.src) {
            if (c1.src.length > c2.src.length)
                return c1;
            if (c2.src.length > c1.src.length)
                return c2;
        }
        return c1 || c2;
    };
    return {
        sid: pick(a.sid, b.sid),
        dof: pick(a.dof, b.dof),
        dep_time_utc: pick(a.dep_time_utc, b.dep_time_utc),
        arr_time_utc: pick(a.arr_time_utc, b.arr_time_utc),
        dep: pickCoord(a.dep, b.dep),
        arr: pickCoord(a.arr, b.arr),
        reg: uniqArray([...(a.reg || []), ...(b.reg || [])]),
        uav_type: pick(a.uav_type, b.uav_type),
        status: pick(a.status, b.status),
        operator: mergeOperator(a.operator, b.operator),
        remarks: uniqArray([a.remarks, b.remarks]).join("; ") || undefined,
        zone: pick(a.zone, b.zone),
        tz_hint: pick(a.tz_hint, b.tz_hint),
        duration_min: pick(a.duration_min, b.duration_min),
        source_refs: [...(a.source_refs || []), ...(b.source_refs || [])].slice(0, 20),
        dedup_key: a.dedup_key || b.dedup_key
    };
}
