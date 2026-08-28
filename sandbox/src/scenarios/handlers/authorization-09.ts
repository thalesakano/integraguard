import type { ScenarioHandler } from "../helpers.js";

const items = Array.from({ length: 25 }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}` }));

/** Pagination inconsistent — docs say page/limit, API uses cursor */
export const authorization09: ScenarioHandler = (app, prefix) => {
  app.get(`${prefix}/v1/authorizations`, async (req, reply) => {
    const query = req.query as Record<string, string>;
    const cursor = query.cursor ? parseInt(query.cursor, 10) : 0;
    const limit = parseInt(query.limit ?? "10", 10);
    const slice = items.slice(cursor, cursor + limit);
    return reply.send({
      data: slice,
      nextCursor: cursor + limit < items.length ? String(cursor + limit) : null,
      // Docs say totalPages but API doesn't return it
    });
  });
};
