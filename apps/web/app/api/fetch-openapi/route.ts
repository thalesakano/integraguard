import { NextResponse } from "next/server";

const MAX_BYTES = 512_000;

function isAllowedUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string };
  const url = body.url ? isAllowedUrl(body.url) : null;
  if (!url) {
    return NextResponse.json({ error: "Invalid URL — use http or https" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json, application/yaml, text/yaml, text/plain, */*" },
      signal: controller.signal,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch failed: HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "OpenAPI spec too large (max 512KB)" }, { status: 413 });
    }

    const spec = new TextDecoder().decode(buf);
    let title: string | undefined;
    let description: string | undefined;

    try {
      const json = JSON.parse(spec) as { info?: { title?: string; description?: string } };
      title = json.info?.title;
      description = json.info?.description;
    } catch {
      const titleMatch = spec.match(/^title:\s*(.+)$/m);
      const descMatch = spec.match(/^description:\s*(.+)$/m);
      title = titleMatch?.[1]?.trim();
      description = descMatch?.[1]?.trim();
    }

    return NextResponse.json({
      spec,
      title,
      description,
      fetchedFrom: url.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
