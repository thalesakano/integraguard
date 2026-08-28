import type { ScenarioHandler } from "../helpers.js";

const idempotencyStore = new Map<string, string>();

/** Multi-blocker demo: undocumented field + HTTP 200 business error + false idempotency */
export const authorization07: ScenarioHandler = (app, prefix) => {
  app.post(`${prefix}/v1/pre-authorization`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;

    // Undocumented: requires beneficiary_id not beneficiaryCard
    if (!body.beneficiary_id) {
      return reply.status(400).send({
        error: "beneficiary_id is required",
        hint: "Documentation shows beneficiaryCard but API expects beneficiary_id",
      });
    }

    if (!Array.isArray(body.procedures)) {
      return reply.status(400).send({ error: "procedures must be an array" });
    }

    // Undocumented header
    if (!req.headers["x-provider-id"]) {
      return reply.status(400).send({ error: "X-Provider-Id header required" });
    }

    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    let authorizationId = "AUTH-007";

    if (idempotencyKey) {
      if (idempotencyStore.has(idempotencyKey)) {
        // Docs claim idempotency but API creates duplicate with new ID
        authorizationId = "AUTH-007-DUP-" + Date.now();
        idempotencyStore.set(idempotencyKey, authorizationId);
      } else {
        authorizationId = "AUTH-007-" + Date.now();
        idempotencyStore.set(idempotencyKey, authorizationId);
      }
    }

    // HTTP 200 with business rejection for invalid procedure
    const codes = (body.procedures as { code: string }[]).map((p) => p.code);
    if (codes.includes("INVALID")) {
      return reply.status(200).send({
        authorizationId: null,
        status: "rejected",
        businessStatus: "error",
        errorCode: "PROCEDURE_DENIED",
      });
    }

    return reply.status(200).send({
      authorizationId,
      status: "approved",
      businessStatus: "success",
    });
  });

  app.get(`${prefix}/v1/pre-authorization/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ authorizationId: id, status: "approved", businessStatus: "success" });
  });
};
