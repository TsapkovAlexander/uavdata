export default async function healthRoutes(app) {
    app.get("/health", async () => {
        return {
            ok: true,
            uptime_s: process.uptime()
        };
    });
}
