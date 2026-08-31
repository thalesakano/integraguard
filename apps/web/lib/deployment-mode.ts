/**
 * Demo / replay-only deployment mode.
 * When enabled, live egress is restricted to localhost / bundled scenarios.
 */
export function isDemoMode(): boolean {
  const keys = ["DEMO_MODE", "INTEGRAGUARD_DEMO_MODE", "INTEGRAGUARD_DEMO_ONLY"];
  return keys.some((k) => {
    const v = process.env[k];
    return v === "1" || v === "true" || v === "yes";
  });
}

export function isLocalOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/** Returns an error message if the target URL is forbidden in demo mode. */
export function demoModeTargetViolation(sandboxUrl: string, scenarioId?: string): string | null {
  if (!isDemoMode()) return null;
  try {
    const host = new URL(sandboxUrl).hostname;
    if (isLocalOrLoopbackHost(host)) return null;
    if (scenarioId) {
      return "Demo mode only allows localhost sandbox targets (bundled scenarios use localhost:4000)";
    }
    return "Demo mode rejects non-localhost targets";
  } catch {
    return "Demo mode: invalid sandboxUrl";
  }
}

/** Returns an error message if the docs URL is forbidden in demo mode. */
export function demoModeDocsUrlViolation(docsUrl: string): string | null {
  if (!isDemoMode()) return null;
  try {
    const host = new URL(docsUrl).hostname;
    if (isLocalOrLoopbackHost(host)) return null;
    return "Demo mode rejects external documentation URLs";
  } catch {
    return "Demo mode: invalid docs URL";
  }
}
