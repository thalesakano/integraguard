import type { ScenarioHandler } from "../helpers.js";

/** Idempotency claimed but not enforced */
export const authorization10: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body.beneficiary_id) {
      return reply.status(400).send({ error: "beneficiary_id required" });
    }
    // Always creates new ID even with same Idempotency-Key
    return reply.send({
      authorizationId: "AUTH-" + Math.random().toString(36).slice(2, 8),
      status: "approved",
      duplicate: false,
    });
  });
};
