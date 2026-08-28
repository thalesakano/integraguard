import type { ScenarioHandler } from "../helpers.js";

/** Endpoint documented but not implemented */
export const authorization08: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (_req, reply) => {
    return reply.send({ authorizationId: "AUTH-008", status: "approved" });
  });
  // GET /v1/pre-authorization/status documented but returns 404
  app.get(`${prefix}/v1/pre-authorization/status`, async (_req, reply) => {
    return reply.status(404).send({ error: "Endpoint not implemented" });
  });
};
