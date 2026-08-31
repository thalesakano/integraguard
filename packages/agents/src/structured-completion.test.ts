import { describe, it, expect } from "vitest";
import { z } from "zod";
import { structuredCompletion } from "./structured-completion.js";

describe("structuredCompletion", () => {
  it("returns typed fallback when API key is missing", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await structuredCompletion({
      schema: z.object({ hello: z.string() }),
      messages: [{ role: "user", content: "hi" }],
      instructionVersion: "v2-test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback).toBe(true);
      expect(result.error).toMatch(/OPENAI_API_KEY/);
    }
    if (prev) process.env.OPENAI_API_KEY = prev;
  });
});
