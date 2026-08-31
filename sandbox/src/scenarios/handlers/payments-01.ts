import type { ScenarioHandler } from "../helpers.js";

/** Holdout: payments — HTTP 200 with novel business error shape */
export const payments01: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/payments`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body.amount || !body.currency) {
      return reply.status(400).send({ error: "amount and currency required" });
    }
    // Docs claim 4xx for declines; runtime uses 200 + settlementState
    return reply.status(200).send({
      paymentId: null,
      settlementState: "DECLINED",
      reasonCode: "INSUFFICIENT_FUNDS",
    });
  });
};
