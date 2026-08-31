"use client";

import { useState } from "react";

export function InvestigationActions({
  reproduction,
  vendorQuestion,
}: {
  reproduction: string;
  vendorQuestion: string;
}) {
  const [copied, setCopied] = useState<"repro" | "vendor" | null>(null);

  async function copy(kind: "repro" | "vendor", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => copy("repro", reproduction)}
        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
      >
        {copied === "repro" ? "Copied reproduction" : "Copy minimal reproduction"}
      </button>
      <button
        type="button"
        onClick={() => copy("vendor", vendorQuestion)}
        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
      >
        {copied === "vendor" ? "Copied question" : "Copy vendor question"}
      </button>
    </div>
  );
}

export function buildMinimalReproduction(input: {
  method: string;
  endpoint: string;
  baseUrl: string;
  body?: unknown;
  finding: string;
}): string {
  const url = `${input.baseUrl.replace(/\/?$/, "/")}${input.endpoint.replace(/^\//, "")}`;
  const lines = [
    `# Minimal reproduction — contract drift`,
    `# Finding: ${input.finding}`,
    ``,
    `curl -i -X ${input.method} '${url}' \\`,
    `  -H 'Content-Type: application/json'${input.body ? " \\" : ""}`,
  ];
  if (input.body) {
    lines.push(`  -d '${JSON.stringify(input.body)}'`);
  }
  return lines.join("\n");
}

export function buildVendorQuestion(input: {
  finding: string;
  blockerType?: string;
  method?: string;
  endpoint?: string;
}): string {
  const ep = input.method && input.endpoint ? `${input.method} ${input.endpoint}` : "the documented endpoint";
  return [
    `We observed a contract mismatch on ${ep}.`,
    ``,
    `Observed: ${input.finding}`,
    input.blockerType ? `Classifier: ${input.blockerType}` : null,
    ``,
    `Question: What is the canonical contract we should implement, and should the public docs/OpenAPI be updated to match?`,
  ]
    .filter(Boolean)
    .join("\n");
}
