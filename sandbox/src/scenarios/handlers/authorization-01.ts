import type { ScenarioHandler } from "../helpers.js";

/** Correct contract — READY */
export const authorization01: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body.beneficiary_id || !body.procedures) {
      return reply.status(400).send({ error: "beneficiary_id and procedures required" });
    }
    return reply.send({
      authorizationId: "AUTH-001",
      status: "approved",
      businessStatus: "success",
    });
  });

  app.get(`${prefix}/v1/pre-authorization/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ authorizationId: id, status: "approved", businessStatus: "success" });
  });
};
