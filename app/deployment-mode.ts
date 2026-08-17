export const PUBLIC_ANONYMOUS_MODE = "public-anonymous";

export function isPublicAnonymousMode(): boolean {
  return process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE === PUBLIC_ANONYMOUS_MODE;
}
