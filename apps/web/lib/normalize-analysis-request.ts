export type AnalysisTargetMode = "sandbox" | "custom" | "real-api" | "docs-url";

export interface NormalizeAnalysisRequestBody {
  targetMode?: AnalysisTargetMode;
  sandboxUrl: string;
  allowedHosts?: string[];
  autoApproveProbes?: boolean;
  scenarioId?: string;
}

export type NormalizeAnalysisRequestResult =
  | { ok: true; allowedHosts: string[]; autoApproveProbes: boolean }
  | { ok: false; error: string; status: 400 };

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Safe defaults for analysis create:
 * - real-api / docs-url: autoApproveProbes defaults false; allowedHosts required
 * - sandbox (and local custom): autoApproveProbes defaults true unless explicitly false;
 *   allowedHosts may be derived from sandboxUrl hostname
 */
export function normalizeAnalysisRequest(
  body: NormalizeAnalysisRequestBody
): NormalizeAnalysisRequestResult {
  const mode: AnalysisTargetMode = body.targetMode ?? "sandbox";
  const isStrictTarget = mode === "real-api" || mode === "docs-url";

  const autoApproveProbes = isStrictTarget
    ? body.autoApproveProbes === true
    : body.autoApproveProbes !== false;

  const provided = (body.allowedHosts ?? []).map((h) => h.trim()).filter(Boolean);
  if (provided.length > 0) {
    return { ok: true, allowedHosts: provided, autoApproveProbes };
  }

  const hostname = hostnameFromUrl(body.sandboxUrl);
  if (!hostname) {
    return { ok: false, error: "Invalid sandboxUrl", status: 400 };
  }

  if (isStrictTarget) {
    return {
      ok: false,
      error: "allowedHosts is required for real-api and docs-url targets",
      status: 400,
    };
  }

  // Derive only for sandbox / local custom targets
  if (mode === "sandbox" || isLocalHostname(hostname)) {
    return { ok: true, allowedHosts: [hostname], autoApproveProbes };
  }

  return {
    ok: false,
    error: "allowedHosts is required for non-local custom targets",
    status: 400,
  };
}
