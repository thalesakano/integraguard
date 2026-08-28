import type { ScenarioHandler } from "../helpers.js";
import { requireHeader } from "../helpers.js";

/** Auth divergent — docs say Bearer, API requires X-API-Key */
export const authorization05: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const apiKey = requireHeader(req, "x-api-key", reply);
    if (!apiKey) return;
    const body = req.body as Record<string, unknown>;
    if (!body.beneficiary_id) {
      return reply.status(400).send({ error: "beneficiary_id required" });
    }
    return reply.send({ authorizationId: "AUTH-005", status: "approved" });
  });
};
