import { FastifyInstance } from "fastify";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export default async function exportsRoutes(app: FastifyInstance) {
  // GET /api/v1/exports/region-heatmap?metric=flights_count|duration_min|density_per_1000km2
  app.get("/exports/region-heatmap", async (req, reply) => {
    const q = req.query as any;
    const metric = (q.metric ?? "flights_count") as "flights_count" | "duration_min" | "density_per_1000km2";

    // v_region_metrics содержит flights_count, duration_min, density_per_1000km2
    const { data, error } = await supa
      .from("v_region_metrics")
      .select("region_id,region_code,name,flights_count,duration_min,density_per_1000km2");

    if (error) return reply.code(500).send({ error: error.message });

    const values = (data ?? []).map(r => r[metric]).filter((x: any) => x !== null) as number[];
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;

    return {
      as_of: new Date().toISOString().slice(0, 10),
      metric,
      data: (data ?? []).map(r => ({ region_id: r.region_id, region_code: r.region_code, name: r.name, value: r[metric] })),
      legend: { min, max }
    };
  });
}