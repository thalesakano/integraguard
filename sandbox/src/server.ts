import Fastify from "fastify";
import { registerScenarioRoutes } from "./scenarios/index.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  registerScenarioRoutes(app);

  await app.listen({ port: PORT, host: HOST });
  console.log(`Sandbox listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
