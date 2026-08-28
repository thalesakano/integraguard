import { NextResponse } from "next/server";
import { isLlmAvailable } from "@integraguard/agents";

export async function GET() {
  return NextResponse.json({
    available: isLlmAvailable(),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  });
}
