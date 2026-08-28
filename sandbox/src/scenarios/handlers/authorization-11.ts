import type { ScenarioHandler } from "../helpers.js";

let requestCount = 0;

/** Rate limit not documented */
export const authorization11: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    requestCount++;
    if (requestCount > 3) {
      return reply.status(429).send({
        error: "Rate limit exceeded",
        retryAfter: 60,
      });
    }
    const body = req.body as Record<string, unknown>;
    if (!body.beneficiary_id) {
      return reply.status(400).send({ error: "beneficiary_id required" });
    }
    return reply.send({ authorizationId: "AUTH-011", status: "approved" });
  });
};
