import { NextResponse } from "next/server";
import { optionalPrincipal } from "../../_lib/auth";
import { publicProviderEnvelope } from "../provider-registry";
import { userProviderEnvelope } from "../user-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  let envelope;
  try {
    const principal = await optionalPrincipal();
    envelope = await userProviderEnvelope(
      principal?.user.status === "active" ? principal : null,
    );
  } catch {
    // Provider discovery must remain available when identity/D1 is degraded;
    // never expose the underlying account or secret error to the browser.
    envelope = { authenticated: false, ...publicProviderEnvelope() };
  }
  return NextResponse.json(envelope, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
