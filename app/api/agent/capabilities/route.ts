import { NextResponse } from "next/server";
import { getAgentCapabilities } from "@/app/agent/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getAgentCapabilities(), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
