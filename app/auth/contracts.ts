export type HeaderReader = Pick<Headers, "get">;

export type AnonymousRequestIdentity = {
  authenticated: false;
  source: "anonymous";
};

export type AuthenticatedRequestIdentity = {
  authenticated: true;
  source: "sites-siwc";
  subject: string;
  email: string;
  displayName: string;
  fullName: string | null;
};

export type RequestIdentity = AnonymousRequestIdentity | AuthenticatedRequestIdentity;

export const ANONYMOUS_REQUEST_IDENTITY: AnonymousRequestIdentity = Object.freeze({
  authenticated: false,
  source: "anonymous",
});
