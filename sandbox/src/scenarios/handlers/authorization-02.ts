import type { ScenarioHandler } from "../helpers.js";

/** Second correct contract variant */
export const authorization02: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/claims`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body.patientId || !body.serviceCode) {
      return reply.status(422).send({ errors: ["patientId and serviceCode required"] });
    }
    return reply.send({ claimId: "CLM-001", status: "submitted" });
  });
};
