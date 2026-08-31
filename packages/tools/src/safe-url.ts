/**
 * Fail-closed URL / egress validation for crawler and HTTP probes.
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export interface EgressPolicy {
  allowedHosts: string[];
  allowedProtocols?: string[];
  allowedPorts?: number[];
  allowPrivateNetwork?: boolean;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

const DEFAULT_PORTS = new Set([80, 443, 4000, 3000, 8080]);

function isMetadataIp(ip: string): boolean {
  return ip === "169.254.169.254" || ip.startsWith("169.254.");
}

function isPrivateOrBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    if (isMetadataIp(ip)) return true;
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.includes(".")) {
      const mapped = lower.split(":").pop();
      if (mapped && isPrivateOrBlockedIp(mapped)) return true;
    }
    return false;
  }
  return true;
}

export function validateTargetUrl(raw: string, policy: EgressPolicy): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  const protocols = (policy.allowedProtocols ?? ["http:", "https:"]).map((p) =>
    p.endsWith(":") ? p : `${p}:`
  );
  if (!protocols.includes(url.protocol)) {
    return { ok: false, reason: `Protocol ${url.protocol} not allowed` };
  }

  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  const allowedPorts = new Set(policy.allowedPorts ?? [...DEFAULT_PORTS]);
  if (!allowedPorts.has(port)) {
    return { ok: false, reason: `Port ${port} not allowed` };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "Missing host" };

  if (policy.allowedHosts.length === 0) {
    return { ok: false, reason: "allowedHosts is empty — fail-closed" };
  }

  const allowed = policy.allowedHosts.map((h) => h.toLowerCase());
  if (!allowed.includes(host) && !allowed.includes("*")) {
    return { ok: false, reason: `Host ${host} outside allowedHosts` };
  }

  // Literal IP in URL — cloud metadata always blocked, even in local-dev mode
  if (isIP(host)) {
    if (isMetadataIp(host)) {
      return { ok: false, reason: `Blocked metadata IP ${host}` };
    }
    if (!policy.allowPrivateNetwork && isPrivateOrBlockedIp(host)) {
      return { ok: false, reason: `Blocked IP target ${host}` };
    }
  }

  // Block obvious metadata hostnames
  if (
    host === "metadata.google.internal" ||
    host.endsWith(".internal") && !policy.allowPrivateNetwork
  ) {
    return { ok: false, reason: `Blocked metadata/internal host ${host}` };
  }

  return { ok: true, url };
}

export async function resolveAndValidateHost(
  host: string,
  policy: EgressPolicy
): Promise<UrlValidationResult> {
  if (isIP(host)) {
    if (isMetadataIp(host)) {
      return { ok: false, reason: `Blocked metadata IP ${host}` };
    }
    if (!policy.allowPrivateNetwork && isPrivateOrBlockedIp(host)) {
      return { ok: false, reason: `Blocked IP ${host}` };
    }
    return { ok: true, url: new URL(`http://${host}/`) };
  }

  try {
    const results = await lookup(host, { all: true });
    for (const r of results) {
      if (!policy.allowPrivateNetwork && isPrivateOrBlockedIp(r.address)) {
        return { ok: false, reason: `Host ${host} resolves to blocked IP ${r.address}` };
      }
    }
    return { ok: true, url: new URL(`http://${host}/`) };
  } catch {
    return { ok: false, reason: `DNS lookup failed for ${host}` };
  }
}

export async function fetchWithValidatedRedirects(
  input: string | URL | { url: string },
  init: RequestInit | undefined,
  policy: EgressPolicy
): Promise<Response> {
  const maxRedirects = policy.maxRedirects ?? 3;
  let current =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;

  for (let i = 0; i <= maxRedirects; i++) {
    const validated = validateTargetUrl(current, policy);
    if (!validated.ok) throw new Error(`SSRF blocked: ${validated.reason}`);

    const dns = await resolveAndValidateHost(validated.url.hostname, policy);
    if (!dns.ok) throw new Error(`SSRF blocked: ${dns.reason}`);

    const res = await fetch(validated.url.toString(), {
      ...init,
      redirect: "manual",
      signal: init?.signal,
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without Location");
      current = new URL(loc, validated.url).toString();
      continue;
    }

    const maxBytes = policy.maxResponseBytes ?? 2_000_000;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error(`Response exceeds maxResponseBytes (${maxBytes})`);
    }
    return new Response(buf, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }

  throw new Error(`Too many redirects (>${maxRedirects})`);
}
