import type { FastifyInstance } from "fastify";
import { authorization01 } from "./handlers/authorization-01.js";
import { authorization03 } from "./handlers/authorization-03.js";
import { authorization07 } from "./handlers/authorization-07.js";
import { authorization02 } from "./handlers/authorization-02.js";
import { authorization04 } from "./handlers/authorization-04.js";
import { authorization05 } from "./handlers/authorization-05.js";
import { authorization06 } from "./handlers/authorization-06.js";
import { authorization08 } from "./handlers/authorization-08.js";
import { authorization09 } from "./handlers/authorization-09.js";
import { authorization10 } from "./handlers/authorization-10.js";
import { authorization11 } from "./handlers/authorization-11.js";
import { authorization12 } from "./handlers/authorization-12.js";
import { orders01 } from "./handlers/orders-01.js";
import { payments01 } from "./handlers/payments-01.js";
import { catalog01 } from "./handlers/catalog-01.js";

const handlers: Record<string, (app: FastifyInstance, prefix: string) => void> = {
  "authorization-01": authorization01,
  "authorization-02": authorization02,
  "authorization-03": authorization03,
  "authorization-04": authorization04,
  "authorization-05": authorization05,
  "authorization-06": authorization06,
  "authorization-07": authorization07,
  "authorization-08": authorization08,
  "authorization-09": authorization09,
  "authorization-10": authorization10,
  "authorization-11": authorization11,
  "authorization-12": authorization12,
  "orders-01": orders01,
  "payments-01": payments01,
  "catalog-01": catalog01,
};

export function registerScenarioRoutes(app: FastifyInstance) {
  for (const [scenarioId, register] of Object.entries(handlers)) {
    const prefix = `/scenarios/${scenarioId}`;
    register(app, prefix);
  }
}
