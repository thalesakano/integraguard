import { createHash } from "node:crypto";
import { normalizeToShape, redactSecrets } from "./index.js";

export interface ContractSnapshot {
  version: 1;
  createdAt: string;
  targetBaseUrl: string;
  endpoints: {
    method: string;
    path: string;
    requestShape?: unknown;
    responseShape?: unknown;
    statusCodes?: number[];
  }[];
  fingerprint: string;
}

export function buildContractSnapshot(input: {
  targetBaseUrl: string;
  endpoints: ContractSnapshot["endpoints"];
}): ContractSnapshot {
  const endpoints = input.endpoints
    .map((e) => ({
      method: e.method.toUpperCase(),
      path: e.path,
      requestShape: e.requestShape ? normalizeToShape(redactSecrets(e.requestShape)) : undefined,
      responseShape: e.responseShape
        ? normalizeToShape(redactSecrets(e.responseShape))
        : undefined,
      statusCodes: e.statusCodes ? [...e.statusCodes].sort((a, b) => a - b) : undefined,
    }))
    .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));

  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ base: input.targetBaseUrl, endpoints }))
    .digest("hex")
    .slice(0, 16);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    targetBaseUrl: input.targetBaseUrl,
    endpoints,
    fingerprint,
  };
}

export function diffContractSnapshots(
  baseline: ContractSnapshot,
  current: ContractSnapshot
): { changed: boolean; details: string[] } {
  const details: string[] = [];
  if (baseline.fingerprint === current.fingerprint) {
    return { changed: false, details: [] };
  }

  const baseMap = new Map(baseline.endpoints.map((e) => [`${e.method} ${e.path}`, e]));
  const curMap = new Map(current.endpoints.map((e) => [`${e.method} ${e.path}`, e]));

  for (const key of curMap.keys()) {
    if (!baseMap.has(key)) details.push(`added endpoint ${key}`);
  }
  for (const key of baseMap.keys()) {
    if (!curMap.has(key)) details.push(`removed endpoint ${key}`);
  }
  for (const [key, base] of baseMap) {
    const cur = curMap.get(key);
    if (!cur) continue;
    if (JSON.stringify(base.requestShape) !== JSON.stringify(cur.requestShape)) {
      details.push(`request shape changed for ${key}`);
    }
    if (JSON.stringify(base.responseShape) !== JSON.stringify(cur.responseShape)) {
      details.push(`response shape changed for ${key}`);
    }
    if (JSON.stringify(base.statusCodes ?? []) !== JSON.stringify(cur.statusCodes ?? [])) {
      details.push(
        `status codes changed for ${key}: [${(base.statusCodes ?? []).join(",")}] → [${(cur.statusCodes ?? []).join(",")}]`
      );
    }
  }

  return { changed: details.length > 0, details };
}
