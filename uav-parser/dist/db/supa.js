import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required");
}
const supa = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
});
export async function upsertFlights(flights) {
    const batch_id = randomUUID();
    let ok = 0, fail = 0;
    for (const f of flights) {
        const payload = { ...f, batch_id };
        // ВАЖНО: используем RPC, чтобы внутри PG выполнить ST_SetSRID/ST_MakePoint и дедуп.
        const { data, error } = await supa.rpc("upsert_flight_norm", { f: payload });
        if (error) {
            fail++;
            // можно логировать: console.error(error.message, { f });
        }
        else {
            ok++;
        }
    }
    return { batch_id, inserted: ok, updated: 0, duplicates: 0, failed: fail };
}
