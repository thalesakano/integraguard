import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export async function GET() {
  const scenariosDir = join(process.cwd(), "..", "..", "scenarios");
  if (!existsSync(scenariosDir)) {
    return NextResponse.json({ scenarios: [] });
  }

  const scenarios = readdirSync(scenariosDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("authorization-"))
    .map((d) => d.name)
    .sort();

  return NextResponse.json({ scenarios });
}
