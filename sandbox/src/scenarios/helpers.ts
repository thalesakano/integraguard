import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export type ScenarioHandler = (app: FastifyInstance, prefix: string) => void;

export function requireHeader(
  req: FastifyRequest,
  header: string,
  reply: FastifyReply
): string | null {
  const val = req.headers[header.toLowerCase()];
  if (!val || typeof val !== "string") {
    reply.status(401).send({ error: `Missing header: ${header}` });
    return null;
  }
  return val;
}
