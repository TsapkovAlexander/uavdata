import { z } from "zod";
import { parseMessagesUniversal } from "../services/parser.js";
const ParseRequest = z.object({
    messages: z.array(z.object({
        text: z.string()
    }))
});
export default async function parseRoutes(app) {
    app.post("/parse", async (req, reply) => {
        const parsed = ParseRequest.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: "Invalid request", details: parsed.error.format() });
        }
        const { messages } = parsed.data;
        const { flights, logs } = parseMessagesUniversal(messages);
        return {
            ok: true,
            count: flights.length,
            flights,
            logs
        };
    });
}
