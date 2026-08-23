import { PUBLIC_ANONYMOUS_MODE } from "@/app/deployment-mode";

export const IDENTITY_TRUST_PROFILE_ENV =
  "FUSIONDIGITAL_IDENTITY_TRUST_PROFILE" as const;

export const IDENTITY_TRUST_PROFILES = Object.freeze({
  anonymous: "anonymous",
  sitesSiwc: "sites-siwc",
});

export type IdentityTrustProfile =
  (typeof IDENTITY_TRUST_PROFILES)[keyof typeof IDENTITY_TRUST_PROFILES];

export type IdentityTrustEnvironment = {
  NEXT_PUBLIC_FUSIONDIGITAL_MODE?: string;
  FUSIONDIGITAL_IDENTITY_TRUST_PROFILE?: string;
};

export type IdentityTrustProfileOptions = {
  configuredProfile?: string | null;
  publicAnonymous?: boolean;
};

/**
 * Resolve a server-side identity trust boundary. Only the exact Sites SIWC
 * profile opts in; missing, misspelled, and future profiles all fail closed.
 * The standalone public mirror always wins and can never trust request headers.
 */
export function resolveIdentityTrustProfile({
  configuredProfile,
  publicAnonymous = false,
}: IdentityTrustProfileOptions = {}): IdentityTrustProfile {
  if (publicAnonymous) return IDENTITY_TRUST_PROFILES.anonymous;
  return configuredProfile === IDENTITY_TRUST_PROFILES.sitesSiwc
    ? IDENTITY_TRUST_PROFILES.sitesSiwc
    : IDENTITY_TRUST_PROFILES.anonymous;
}

/** Read the explicit server-side trust profile from the current environment. */
export function getIdentityTrustProfile(
  environment: IdentityTrustEnvironment = {
    NEXT_PUBLIC_FUSIONDIGITAL_MODE:
      process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE,
    FUSIONDIGITAL_IDENTITY_TRUST_PROFILE:
      process.env.FUSIONDIGITAL_IDENTITY_TRUST_PROFILE,
  },
): IdentityTrustProfile {
  return resolveIdentityTrustProfile({
    configuredProfile: environment[IDENTITY_TRUST_PROFILE_ENV],
    publicAnonymous:
      environment.NEXT_PUBLIC_FUSIONDIGITAL_MODE === PUBLIC_ANONYMOUS_MODE,
  });
}
