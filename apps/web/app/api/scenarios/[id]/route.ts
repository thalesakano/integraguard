import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dir = join(process.cwd(), "..", "..", "scenarios", id);
  if (!existsSync(dir)) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const documentation = readFileSync(join(dir, "api-docs.md"), "utf-8");
  const openApiSpec = existsSync(join(dir, "openapi.yaml"))
    ? readFileSync(join(dir, "openapi.yaml"), "utf-8")
    : undefined;
  const sampleRequest = JSON.parse(readFileSync(join(dir, "sample-request.json"), "utf-8"));
  const sampleResponse = existsSync(join(dir, "sample-response.json"))
    ? JSON.parse(readFileSync(join(dir, "sample-response.json"), "utf-8"))
    : undefined;

  return NextResponse.json({ id, documentation, openApiSpec, sampleRequest, sampleResponse });
}
