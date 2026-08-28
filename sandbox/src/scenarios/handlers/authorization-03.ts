import type { ScenarioHandler } from "../helpers.js";

/** Schema divergent — docs say beneficiaryCard, API expects beneficiary_id + procedures array */
export const authorization03: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (body.beneficiaryCard && !body.beneficiary_id) {
      return reply.status(400).send({
        error: "Invalid schema",
        message: "Expected beneficiary_id (string) and procedures (array), got beneficiaryCard",
        expected: { beneficiary_id: "string", procedures: [{ code: "string" }] },
      });
    }
    if (!body.beneficiary_id || !Array.isArray(body.procedures)) {
      return reply.status(400).send({ error: "beneficiary_id and procedures required" });
    }
    return reply.send({ authorizationId: "AUTH-003", status: "approved", businessStatus: "success" });
  });
};
