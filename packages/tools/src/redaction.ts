const DEFAULT_SENSITIVE_KEYS =
  /^(authorization|x-api-key|api[_-]?key|apikey|token|secret|password|cookie|set-cookie|access_token|refresh_token|client_secret|private_key|session)$/i;

/** Keys ending in _token / containing secret (except authorizationId-like ids) */
const PATTERN_SENSITIVE_KEYS = /(_token$|secret)/i;

const EMAIL_LIKE_KEYS = /^(e[_-]?mail|email_address|user_email)$/i;

export interface RedactionOptions {
  extraFields?: string[];
}

function isSensitiveKey(key: string, extraFields: string[] = []): boolean {
  if (DEFAULT_SENSITIVE_KEYS.test(key)) return true;
  if (EMAIL_LIKE_KEYS.test(key)) return true;
  // Pattern match for *_token / *secret* but not resource ids like authorizationId
  if (PATTERN_SENSITIVE_KEYS.test(key) && !/^authorizationid$/i.test(key)) {
    return true;
  }
  return extraFields.some((f) => f.toLowerCase() === key.toLowerCase());
}

export function redactSecrets(obj: unknown, options: RedactionOptions = {}): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item, options));
  }
  if (typeof obj !== "object" || obj === null) return obj;

  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(k, options.extraFields)) {
      redacted[k] = "[REDACTED]";
    } else if (typeof v === "object") {
      redacted[k] = redactSecrets(v, options);
    } else {
      redacted[k] = v;
    }
  }
  return redacted;
}

export function redactHeaders(
  headers: Record<string, string>,
  options: RedactionOptions = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = isSensitiveKey(k, options.extraFields) ? "[REDACTED]" : v;
  }
  return out;
}
