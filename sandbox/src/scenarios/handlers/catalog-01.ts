import type { ScenarioHandler } from "../helpers.js";

/** Holdout: catalog — docs promise page/totalPages; runtime returns cursor */
export const catalog01: ScenarioHandler = (app, prefix) => {
  app.get(`${prefix}/v1/catalog`, async (req, reply) => {
    const q = req.query as Record<string, string>;
    void q;
    return reply.send({
      items: [{ id: "SKU-1", name: "Widget" }],
      nextCursor: "cursor-abc",
      hasMore: true,
    });
  });
};
