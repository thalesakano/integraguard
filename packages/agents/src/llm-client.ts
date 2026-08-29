import type { Requirement } from "@integraguard/schemas";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function isLlmAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function chatCompletion(
  messages: LlmMessage[],
  options?: { model?: string; temperature?: number; timeoutMs?: number }
): Promise<string | null> {
  const result = await chatCompletionDetailed(messages, options);
  return result.content;
}

export async function chatCompletionDetailed(
  messages: LlmMessage[],
  options?: { model?: string; temperature?: number; timeoutMs?: number }
): Promise<{ content: string | null; error?: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { content: null, error: "OPENAI_API_KEY missing" };

  const model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 30_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: options?.temperature ?? 0.2,
        messages,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      const error = `OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`;
      console.warn("[llm]", error);
      return { content: null, error };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? null;
    if (!content) return { content: null, error: "OpenAI returned empty content" };
    return { content };
  } catch (err) {
    const error =
      err instanceof Error
        ? err.name === "AbortError"
          ? `OpenAI request timed out after ${options?.timeoutMs ?? 30_000}ms`
          : err.message
        : String(err);
    console.warn("[llm] request failed:", error);
    return { content: null, error };
  } finally {
    clearTimeout(timeout);
  }
}

export interface LlmRequirementSuggestion {
  id: string;
  description: string;
  severity: "critical" | "major" | "minor";
}

export async function suggestRequirementsWithLlm(input: {
  goal: string;
  documentation: string;
  existing: Requirement[];
}): Promise<Requirement[]> {
  const content = await chatCompletion([
    {
      role: "system",
      content:
        "You extract integration requirements from API documentation. Return JSON: { \"requirements\": [{ \"id\": \"REQ-008\", \"description\": \"...\", \"severity\": \"critical|major|minor\" }] }. Only add NEW requirements not already listed. Max 3 additions. Focus on auth, idempotency, pagination, error semantics.",
    },
    {
      role: "user",
      content: `Goal: ${input.goal}\n\nExisting requirements:\n${input.existing.map((r) => `- ${r.id}: ${r.description}`).join("\n")}\n\nDocumentation:\n${input.documentation.slice(0, 6000)}`,
    },
  ]);

  if (!content) return input.existing;

  try {
    const parsed = JSON.parse(content) as { requirements?: LlmRequirementSuggestion[] };
    const existingIds = new Set(input.existing.map((r) => r.id));
    const merged = [...input.existing];

    for (const req of parsed.requirements ?? []) {
      if (!req.id || !req.description || existingIds.has(req.id)) continue;
      merged.push({
        id: req.id,
        description: req.description,
        severity: req.severity ?? "major",
      });
      existingIds.add(req.id);
    }
    return merged;
  } catch {
    return input.existing;
  }
}

export async function suggestContractHintsWithLlm(input: {
  documentation: string;
  requirements: Requirement[];
}): Promise<string | null> {
  return chatCompletion([
    {
      role: "system",
      content:
        "Summarize likely API endpoints and auth method from docs in one sentence for integration mapping. No markdown.",
    },
    {
      role: "user",
      content: input.documentation.slice(0, 4000),
    },
  ]);
}
