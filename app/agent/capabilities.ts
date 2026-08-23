import { isPublicAnonymousMode } from "@/app/deployment-mode";

export const SITES_WORKSPACE_ORIGIN = "https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site";

export type AgentCapabilities = {
  schemaVersion: 1;
  profile: "sites" | "standalone-public";
  authentication: {
    mode: "sites-siwc" | "none";
    available: boolean;
    signInPath: string | null;
    authenticatedWorkspaceOrigin: string | null;
  };
  conversation: {
    continuous: true;
    persistence: "browser-local";
    streaming: false;
  };
  tools: {
    siteSearch: true;
    pageContext: true;
    modelGateway: boolean;
    imageInput: false;
    fileInput: false;
    externalUrlReader: false;
    canvas: "local-workspace";
  };
};

export function getAgentCapabilities(): AgentCapabilities {
  return buildAgentCapabilities(isPublicAnonymousMode());
}

export function buildAgentCapabilities(publicAnonymous: boolean): AgentCapabilities {
  return {
    schemaVersion: 1,
    profile: publicAnonymous ? "standalone-public" : "sites",
    authentication: {
      mode: publicAnonymous ? "none" : "sites-siwc",
      available: !publicAnonymous,
      signInPath: publicAnonymous ? null : "/signin-with-chatgpt",
      authenticatedWorkspaceOrigin: publicAnonymous ? SITES_WORKSPACE_ORIGIN : null,
    },
    conversation: {
      continuous: true,
      persistence: "browser-local",
      streaming: false,
    },
    tools: {
      siteSearch: true,
      pageContext: true,
      modelGateway: !publicAnonymous,
      imageInput: false,
      fileInput: false,
      externalUrlReader: false,
      canvas: "local-workspace",
    },
  };
}
