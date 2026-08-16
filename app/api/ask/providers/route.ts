import { NextResponse } from "next/server";
import { publicProviderEnvelope } from "../provider-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicProviderEnvelope(), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
