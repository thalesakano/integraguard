import { NextResponse } from "next/server";
import { crawlApiDocs } from "@integraguard/tools";
import {
  extractApiDocsFromCrawl,
  isLlmAvailable,
  pickSamplePayloads,
  buildOpenApiFromExtraction,
} from "@integraguard/agents";

function isAllowedUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      if (host === "localhost" || host === "127.0.0.1") return url;
      return null;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      // block private IPs; allow only public
      const [a, b] = host.split(".").map(Number);
      if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && (b ?? 0) >= 16 && (b ?? 0) <= 31)) {
        return null;
      }
    }
    return url;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    url?: string;
    goal?: string;
    maxPages?: number;
  };

  const url = body.url ? isAllowedUrl(body.url) : null;
  if (!url) {
    return NextResponse.json(
      { error: "Invalid docs URL — use http(s) public URL or localhost" },
      { status: 400 }
    );
  }

  try {
    const crawl = await crawlApiDocs({
      seedUrl: url.toString(),
      maxPages: Math.min(Math.max(body.maxPages ?? 10, 1), 15),
    });

    const { extraction, usedLlm, llmError } = await extractApiDocsFromCrawl({
      seedUrl: crawl.seedUrl,
      combinedText: crawl.combinedText,
      openApiSpec: crawl.openApiSpec,
      sourceUrls: [
        crawl.seedUrl,
        ...crawl.pages.map((p) => p.url),
        ...crawl.openApiUrls,
      ].slice(0, 30),
      goal: body.goal,
      suggestedBaseUrl: crawl.suggestedBaseUrl,
    });

    const samples = pickSamplePayloads(extraction, body.goal);
    const baseUrl =
      (extraction.baseUrl?.replace(/\/+$/, "") ??
        crawl.suggestedBaseUrl?.replace(/\/+$/, "") ??
        crawl.origin) + "/";

    const openApiSpec = crawl.openApiSpec ?? buildOpenApiFromExtraction(extraction);

    const warnings = [...crawl.warnings];
    if (llmError) {
      warnings.push(usedLlm ? `LLM note: ${llmError}` : `LLM extraction failed: ${llmError}`);
    } else if (!usedLlm && !isLlmAvailable()) {
      warnings.push("OPENAI_API_KEY not loaded in server — heuristic extraction only");
    }
    if (!crawl.openApiSpec && extraction.endpoints.length) {
      warnings.push("Generated OpenAPI from extracted endpoints for probe mapping");
    }
    if (samples.primaryEndpoint) {
      warnings.push(
        `Primary probe target: ${samples.primaryEndpoint.method} ${samples.primaryEndpoint.path}`
      );
    }

    // Soft success: docs text without endpoints is still useful to edit & run
    if (!extraction.endpoints.length && !crawl.openApiSpec && !crawl.combinedText.trim()) {
      return NextResponse.json(
        {
          error:
            "Could not extract API documentation from that URL. Try an API reference page, /llms.txt, or a direct OpenAPI URL.",
          warnings,
          pagesCrawled: crawl.pages.length,
          llmAvailable: isLlmAvailable(),
        },
        { status: 422 }
      );
    }

    if (!extraction.endpoints.length) {
      warnings.push(
        "No concrete endpoints parsed yet — review the markdown below or try a more specific API reference URL (e.g. .../api/charges)."
      );
    }

    return NextResponse.json({
      extraction,
      documentation: extraction.documentationMarkdown || crawl.combinedText.slice(0, 20_000),
      openApiSpec,
      openApiUrls: crawl.openApiUrls,
      sampleRequest: samples.sampleRequest,
      sampleResponse: samples.sampleResponse ?? null,
      suggestedBaseUrl: baseUrl,
      suggestedGoal: extraction.title
        ? `Integrate with ${extraction.title} using documented endpoints (auth, create/list, error handling)`
        : null,
      primaryEndpoint: samples.primaryEndpoint ?? null,
      endpoints: extraction.endpoints.map((e) => ({
        method: e.method,
        path: e.path,
        summary: e.summary,
      })),
      pagesCrawled: crawl.pages.map((p) => ({
        url: p.url,
        title: p.title,
        contentType: p.contentType,
      })),
      warnings,
      usedLlm,
      llmError: llmError ?? null,
      llmAvailable: isLlmAvailable(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Docs crawl failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
