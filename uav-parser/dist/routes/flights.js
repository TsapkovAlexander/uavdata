import { createClient } from "@supabase/supabase-js";
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, // серверный ключ
{ auth: { persistSession: false } });
export default async function flightsRoutes(app) {
    // GET /api/v1/flights?from=YYYY-MM-DD&to=YYYY-MM-DD&region_id=...&sid=...&limit=50&offset=0
    app.get("/flights", async (req, reply) => {
        const q = req.query;
        const limit = Math.min(Number(q.limit ?? 50), 500);
        const offset = Number(q.offset ?? 0);
        let query = supa.from("flights_norm")
            .select("id,sid,dof,dep_time_utc,arr_time_utc,duration_min,dep_region_id,arr_region_id,reg,uav_type,status,remarks,tz_hint,dedup_key", { count: "exact" })
            .order("dof", { ascending: false })
            .range(offset, offset + limit - 1);
        if (q.from)
            query = query.gte("dof", q.from);
        if (q.to)
            query = query.lte("dof", q.to);
        if (q.sid)
            query = query.eq("sid", q.sid);
        if (q.region_id) {
            // фильтруем по региону взлёта ИЛИ посадки
            query = query.or(`dep_region_id.eq.${q.region_id},arr_region_id.eq.${q.region_id}`);
        }
        const { data, error, count } = await query;
        if (error)
            return reply.code(500).send({ error: error.message });
        return { total: count ?? 0, limit, offset, items: data ?? [] };
    });
    // GET /api/v1/flights/:id
    app.get("/flights/:id", async (req, reply) => {
        const { id } = req.params;
        const { data, error } = await supa.from("flights_norm").select("*").eq("id", id).single();
        if (error?.code === "PGRST116")
            return reply.code(404).send({ error: "Not found" });
        if (error)
            return reply.code(500).send({ error: error.message });
        return data;
    });
}
