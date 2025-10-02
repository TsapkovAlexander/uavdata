import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";

async function main() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 UAV Parser listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();