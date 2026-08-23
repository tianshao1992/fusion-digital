import { isPublicAnonymousMode } from "@/app/deployment-mode";
import {
  ANONYMOUS_REQUEST_IDENTITY,
  type HeaderReader,
  type RequestIdentity,
} from "./contracts";
import {
  getIdentityTrustProfile,
  IDENTITY_TRUST_PROFILES,
  resolveIdentityTrustProfile,
} from "./identity-trust-profile";
import { parseSitesSiwcIdentity } from "./sites-siwc";

export type IdentityResolutionOptions = {
  trustProfile?: string | null;
  publicAnonymous?: boolean;
};

/**
 * Resolve the request identity only after selecting a trusted deployment
 * boundary. The public-anonymous profile deliberately ignores identity-shaped
 * headers, including exact copies of Sites SIWC headers.
 */
export function resolveRequestIdentity(
  headers: HeaderReader,
  options: IdentityResolutionOptions = {},
): RequestIdentity {
  const hasExplicitOptions =
    options.trustProfile !== undefined || options.publicAnonymous !== undefined;
  const trustProfile = hasExplicitOptions
    ? resolveIdentityTrustProfile({
        configuredProfile: options.trustProfile,
        // Explicit options may tighten the boundary for tests/callers, but can
        // never weaken a real public-anonymous deployment.
        publicAnonymous:
          isPublicAnonymousMode() || options.publicAnonymous === true,
      })
    : getIdentityTrustProfile();
  if (trustProfile !== IDENTITY_TRUST_PROFILES.sitesSiwc) {
    return ANONYMOUS_REQUEST_IDENTITY;
  }
  return parseSitesSiwcIdentity(headers) ?? ANONYMOUS_REQUEST_IDENTITY;
}
