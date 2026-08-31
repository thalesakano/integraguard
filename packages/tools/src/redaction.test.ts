import { describe, it, expect } from "vitest";
import { redactSecrets, redactHeaders } from "./redaction.js";

describe("redaction", () => {
  it("redacts auth headers", () => {
    const headers = redactHeaders({
      Authorization: "Bearer secret",
      "X-API-Key": "abc",
      "Content-Type": "application/json",
    });
    expect(headers.Authorization).toBe("[REDACTED]");
    expect(headers["X-API-Key"]).toBe("[REDACTED]");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("redacts sensitive body keys and configurable fields", () => {
    const body = redactSecrets(
      {
        token: "t",
        password: "p",
        email: "a@b.c",
        nested: { secret: "s", ok: 1 },
      },
      { extraFields: ["email"] }
    ) as Record<string, unknown>;

    expect(body.token).toBe("[REDACTED]");
    expect(body.password).toBe("[REDACTED]");
    expect(body.email).toBe("[REDACTED]");
    expect((body.nested as Record<string, unknown>).secret).toBe("[REDACTED]");
    expect((body.nested as Record<string, unknown>).ok).toBe(1);
  });

  it("does not redact authorizationId-like resource ids", () => {
    const body = redactSecrets({ authorizationId: "AUTH-1", status: "ok" }) as Record<
      string,
      unknown
    >;
    expect(body.authorizationId).toBe("AUTH-1");
  });

  it("redacts expanded token/secret/session/email canaries", () => {
    const body = redactSecrets({
      access_token: "CANARY_ACCESS_TOKEN_123",
      refresh_token: "CANARY_REFRESH_TOKEN_999",
      client_secret: "CANARY_CLIENT_SECRET_456",
      private_key: "-----BEGIN PRIVATE KEY-----\nCANARY\n",
      session: "CANARY_SESSION_ABC",
      email: "CANARY_EMAIL@example.com",
      id_token: "CANARY_ID_TOKEN",
      api_secret: "CANARY_API_SECRET",
      ok: true,
    }) as Record<string, unknown>;

    expect(body.access_token).toBe("[REDACTED]");
    expect(body.refresh_token).toBe("[REDACTED]");
    expect(body.client_secret).toBe("[REDACTED]");
    expect(body.private_key).toBe("[REDACTED]");
    expect(body.session).toBe("[REDACTED]");
    expect(body.email).toBe("[REDACTED]");
    expect(body.id_token).toBe("[REDACTED]");
    expect(body.api_secret).toBe("[REDACTED]");
    expect(body.ok).toBe(true);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("CANARY_ACCESS_TOKEN_123");
    expect(serialized).not.toContain("CANARY_CLIENT_SECRET_456");
    expect(serialized).not.toContain("CANARY_EMAIL@example.com");
  });

  it("redacts email-like keys via extraFields", () => {
    const body = redactSecrets(
      { user_email: "CANARY_EMAIL@example.com", note: "x" },
      { extraFields: ["user_email"] }
    ) as Record<string, unknown>;
    expect(body.user_email).toBe("[REDACTED]");
    expect(body.note).toBe("x");
  });
});
