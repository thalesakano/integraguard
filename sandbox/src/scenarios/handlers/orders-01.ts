import type { ScenarioHandler } from "../helpers.js";

/** Holdout: orders API — docs omit required sku field that runtime enforces */
export const orders01: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/orders`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (!body.customerId) {
      return reply.status(400).send({ error: "customerId is required" });
    }
    if (!body.sku) {
      return reply.status(400).send({
        error: "sku is required",
        hint: "Documentation lists customerId only; runtime also requires sku",
      });
    }
    return reply.status(201).send({ orderId: "ORD-001", status: "created" });
  });

  app.get(`${prefix}/v1/orders/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ orderId: id, status: "created" });
  });
};
