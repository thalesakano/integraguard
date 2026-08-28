import type { ScenarioHandler } from "../helpers.js";

/** HTTP 200 with business error */
export const authorization06: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body.beneficiary_id) {
      return reply.status(400).send({ error: "beneficiary_id required" });
    }
    return reply.status(200).send({
      authorizationId: null,
      status: "rejected",
      businessStatus: "error",
      errorCode: "INVALID_PROCEDURE",
      message: "Procedure not covered",
    });
  });
};
