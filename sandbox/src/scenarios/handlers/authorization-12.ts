import type { ScenarioHandler } from "../helpers.js";
import { requireHeader } from "../helpers.js";

/** Hard multi-blocker case */
export const authorization12: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const apiKey = requireHeader(req, "x-api-key", reply);
    if (!apiKey) return;

    const body = req.body as Record<string, unknown>;

    if (!body.beneficiary_id) {
      return reply.status(400).send({ error: "beneficiary_id required" });
    }

    if (!body.providerTaxId) {
      return reply.status(400).send({ error: "providerTaxId required" });
    }

    if (body.effectiveDate && typeof body.effectiveDate === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveDate)) {
        return reply.status(400).send({ error: "effectiveDate must be YYYY-MM-DD, not DD/MM/YYYY" });
      }
    }

    return reply.status(200).send({
      authorizationId: null,
      status: "rejected",
      businessStatus: "error",
      errorCode: "MULTI_POLICY_VIOLATION",
    });
  });
};
