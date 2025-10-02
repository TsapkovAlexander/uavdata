import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.PG_URL
});
export async function upsertFlights(flights) {
    const client = await pool.connect();
    try {
        const batch_id = crypto.randomUUID();
        let inserted = 0, updated = 0, duplicates = 0;
        for (const f of flights) {
            // пример upsert — можно заменить вызовом RPC в Supabase
            const res = await client.query(`
        insert into flights_norm (sid, dof, dep_time_utc, arr_time_utc, duration_min, dep_point, arr_point, reg, uav_type, status, operator, remarks, dedup_key, batch_id)
        values ($1,$2,$3,$4,$5,
                ST_SetSRID(ST_MakePoint($6,$7),4326),
                ST_SetSRID(ST_MakePoint($8,$9),4326),
                $10,$11,$12,$13,$14,$15,$16)
        on conflict (dedup_key) do update
        set arr_time_utc = excluded.arr_time_utc,
            duration_min = excluded.duration_min,
            updated_at = now()
        returning xmax = 0 as inserted
        `, [
                f.sid,
                f.dof,
                f.dep_time_utc,
                f.arr_time_utc,
                f.duration_min,
                f.dep?.lon ?? null,
                f.dep?.lat ?? null,
                f.arr?.lon ?? null,
                f.arr?.lat ?? null,
                f.reg ?? [],
                f.uav_type,
                f.status,
                f.operator ? JSON.stringify(f.operator) : null,
                f.remarks,
                f.dedup_key,
                batch_id
            ]);
            if (res.rows[0]?.inserted)
                inserted++;
            else
                updated++;
        }
        return { batch_id, inserted, updated, duplicates };
    }
    finally {
        client.release();
    }
}
