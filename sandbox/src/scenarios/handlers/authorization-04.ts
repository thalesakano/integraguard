import type { ScenarioHandler } from "../helpers.js";

/** Undocumented required field */
export const authorization04: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body.providerTaxId) {
      return reply.status(400).send({ error: "providerTaxId is required but not in public docs" });
    }
    return reply.send({ authorizationId: "AUTH-004", status: "approved" });
  });
};
