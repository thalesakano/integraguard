import type { ContractDrift, Evidence } from "@integraguard/schemas";

/**
 * Drift-type-specific predicates — HTTP evidence alone is not enough;
 * the observation must support the claimed drift type.
 */
export function evidenceSupportsDrift(
  drift: ContractDrift,
  evidences: Evidence[]
): { ok: boolean; reason: string } {
  const linked = evidences.filter((e) => drift.evidenceIds.includes(e.id));
  if (linked.length === 0) {
    return { ok: false, reason: "No evidence linked" };
  }

  const http = linked.filter((e) => e.type === "http_probe");
  const docs = linked.filter((e) => e.type === "document");

  switch (drift.type) {
    case "required-field-added":
    case "field-removed":
    case "field-renamed":
    case "type-changed":
    case "response-shape-changed": {
      if (http.length === 0) return { ok: false, reason: "Shape drift requires HTTP probe evidence" };
      const hasShapeSignal = http.some((e) => {
        const payload = e.payload as { statusCode?: number; body?: unknown } | undefined;
        return (
          payload?.statusCode === 400 ||
          e.observation.toLowerCase().includes("schema") ||
          e.observation.toLowerCase().includes("required") ||
          e.observation.toLowerCase().includes("shape")
        );
      });
      if (!hasShapeSignal && docs.length === 0) {
        return { ok: false, reason: "Shape drift needs schema/required signal or doc+probe pair" };
      }
      return { ok: true, reason: "Shape evidence present" };
    }

    case "idempotency-broken": {
      if (http.length < 2 && !http.some((e) => e.sourceReference.includes("idempotency"))) {
        return { ok: false, reason: "Idempotency drift requires a duplicate request pair" };
      }
      return { ok: true, reason: "Idempotency pair evidence present" };
    }

    case "status-semantics-changed": {
      const ok = http.some((e) => {
        const payload = e.payload as { statusCode?: number; body?: Record<string, unknown> } | undefined;
        const body = payload?.body;
        return (
          payload?.statusCode === 200 &&
          body &&
          (body.businessStatus === "error" || body.status === "rejected" || body.error)
        );
      });
      return ok
        ? { ok: true, reason: "HTTP 200 + business error observed" }
        : { ok: false, reason: "Status semantics requires 200+business-error observation" };
    }

    case "auth-changed": {
      // Isolated 401 is never enough. Require controlled comparison evidence:
      // (1) payload.controlledAuthComparison === true, OR
      // (2) failing documented-auth probe (401) AND a succeeding alternate (2xx).
      const controlled = linked.some(
        (e) =>
          (e.payload as { controlledAuthComparison?: boolean } | undefined)
            ?.controlledAuthComparison === true
      );
      if (controlled) {
        return { ok: true, reason: "Controlled auth comparison evidence present" };
      }

      const failingAuth = http.filter(
        (e) => (e.payload as { statusCode?: number } | undefined)?.statusCode === 401
      );
      const succeedingAlternate = http.filter((e) => {
        const sc = (e.payload as { statusCode?: number } | undefined)?.statusCode;
        return sc !== undefined && sc >= 200 && sc < 300;
      });

      if (failingAuth.length > 0 && succeedingAlternate.length > 0) {
        return {
          ok: true,
          reason: "Documented auth failed (401) while alternate probe succeeded",
        };
      }

      return {
        ok: false,
        reason:
          "Auth drift requires controlled comparison (failing documented auth + succeeding alternate), not isolated 401",
      };
    }

    case "pagination-changed": {
      const ok = http.some(
        (e) =>
          e.observation.toLowerCase().includes("pagination") ||
          e.observation.toLowerCase().includes("cursor")
      );
      return ok
        ? { ok: true, reason: "Pagination observation present" }
        : { ok: false, reason: "Pagination drift needs pagination observation" };
    }

    case "endpoint-missing": {
      const ok = http.some((e) => (e.payload as { statusCode?: number })?.statusCode === 404);
      return ok
        ? { ok: true, reason: "404 observed" }
        : { ok: false, reason: "Endpoint missing requires 404 probe" };
    }

    default:
      return { ok: false, reason: "Unknown drift type" };
  }
}

export function promoteContractDrifts(
  candidates: ContractDrift[],
  evidences: Evidence[]
): { verified: ContractDrift[]; rejected: ContractDrift[]; inconclusive: ContractDrift[] } {
  const verified: ContractDrift[] = [];
  const rejected: ContractDrift[] = [];
  const inconclusive: ContractDrift[] = [];

  for (const drift of candidates) {
    if (drift.status === "inconclusive") {
      inconclusive.push(drift);
      continue;
    }
    const check = evidenceSupportsDrift(drift, evidences);
    if (check.ok) {
      verified.push({ ...drift, status: "verified" });
    } else {
      rejected.push({ ...drift, status: "rejected" });
    }
  }

  return { verified, rejected, inconclusive };
}
