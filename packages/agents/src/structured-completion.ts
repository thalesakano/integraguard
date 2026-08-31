import { z, type ZodTypeAny } from "zod";
import { chatCompletionDetailed, isLlmAvailable, type LlmMessage } from "./llm-client.js";

export type StructuredCompletionResult<T> =
  | { ok: true; data: T; source: "llm"; model: string; instructionVersion: string }
  | { ok: false; error: string; source: "llm" | "none"; fallback?: true };

/**
 * Reusable structured LLM completion validated with Zod.
 * Never persists raw prompts; returns typed errors for invalid JSON / schema / timeout / missing key.
 */
export async function structuredCompletion<T extends ZodTypeAny>(options: {
  schema: T;
  messages: LlmMessage[];
  instructionVersion: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<StructuredCompletionResult<z.infer<T>>> {
  if (!isLlmAvailable()) {
    return { ok: false, error: "OPENAI_API_KEY missing", source: "none", fallback: true };
  }

  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const { content, error } = await chatCompletionDetailed(options.messages, {
    model,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
  });

  if (!content) {
    return {
      ok: false,
      error: error ?? "Empty LLM response",
      source: "llm",
      fallback: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "Invalid JSON from LLM", source: "llm", fallback: true };
  }

  const validated = options.schema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      error: `Schema validation failed: ${validated.error.message}`,
      source: "llm",
      fallback: true,
    };
  }

  return {
    ok: true,
    data: validated.data,
    source: "llm",
    model,
    instructionVersion: options.instructionVersion,
  };
}
