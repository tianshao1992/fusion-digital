import {
  AGENT_CANVAS_LIMITS,
  type AgentCanvasArtifact,
} from "@/app/agent/contracts";

export const ASSISTANT_OUTPUT_LIMITS = Object.freeze({
  maxClaims: 12,
  maxClaimCharacters: 1_200,
  maxCitationRefsPerClaim: 8,
  maxCaveats: 5,
  maxCaveatCharacters: 500,
});

export type AssistantClaim = {
  text: string;
  citationRefs: string[];
};

export type AssistantStructuredOutput = {
  claims: AssistantClaim[];
  caveats: string[];
  canvas: AgentCanvasArtifact | null;
};

export type AssistantOutputValidation =
  | { valid: true; usedRefs: string[] }
  | { valid: false; reason: "missing_grounding" | "invalid_citation" | "invalid_canvas_citation" };

/**
 * Parse the provider's strict JSON without silently truncating an invalid
 * answer. Keeping this separate from provider parsing lets every supported
 * model protocol share the same post-generation security boundary.
 */
export function parseAssistantOutput(raw: string): AssistantStructuredOutput | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(value.claims) || !Array.isArray(value.caveats)) return null;
    if (value.claims.length < 1 || value.claims.length > ASSISTANT_OUTPUT_LIMITS.maxClaims) return null;
    if (value.caveats.length > ASSISTANT_OUTPUT_LIMITS.maxCaveats) return null;

    const claims = value.claims.map(parseClaim);
    if (claims.some((claim) => claim === null)) return null;
    const caveats = value.caveats.map((item) => cleanBoundedText(item, ASSISTANT_OUTPUT_LIMITS.maxCaveatCharacters, false));
    if (caveats.some((item) => item === null)) return null;

    const canvas = parseCanvas(value.canvas);
    if (canvas === undefined) return null;
    return {
      claims: claims as AssistantClaim[],
      caveats: caveats as string[],
      canvas,
    };
  } catch {
    return null;
  }
}

/**
 * A grounded response keeps the stronger invariant that every claim cites at
 * least one current-turn source. A no-evidence conversational response may be
 * uncited, but it cannot manufacture source identifiers.
 */
export function validateAssistantOutput(
  output: AssistantStructuredOutput,
  allowedRefs: ReadonlySet<string>,
  groundingRequired: boolean,
): AssistantOutputValidation {
  const claimRefs = output.claims.flatMap((claim) => claim.citationRefs);
  if (claimRefs.some((ref) => !allowedRefs.has(ref))) {
    return { valid: false, reason: "invalid_citation" };
  }
  if (groundingRequired && output.claims.some((claim) => claim.citationRefs.length === 0)) {
    return { valid: false, reason: "missing_grounding" };
  }
  if (!groundingRequired && claimRefs.length > 0) {
    return { valid: false, reason: "invalid_citation" };
  }

  const canvasRefs = output.canvas ? extractCitationRefs(output.canvas.content) : [];
  if (canvasRefs.some((ref) => !allowedRefs.has(ref))) {
    return { valid: false, reason: "invalid_canvas_citation" };
  }
  // A generated canvas is a second presentation of the answer, not a place to
  // bypass grounding. When the turn is grounded it must retain a source marker.
  if (groundingRequired && output.canvas && !groundedCanvasLinesAreCited(output.canvas.content)) {
    return { valid: false, reason: "invalid_canvas_citation" };
  }
  if (!groundingRequired && canvasRefs.length > 0) {
    return { valid: false, reason: "invalid_canvas_citation" };
  }

  return {
    valid: true,
    usedRefs: [...new Set([...claimRefs, ...canvasRefs])],
  };
}

export function formatAssistantAnswer(output: AssistantStructuredOutput): string {
  return output.claims
    .map((claim) => {
      const text = stripModelCitationMarkers(claim.text);
      const refs = claim.citationRefs.map((ref) => `[${ref}]`).join(" ");
      return refs ? `${text} ${refs}` : text;
    })
    .join("\n\n");
}

export function assistantAnswerSchema(citationCount: number, groundingRequired: boolean): Record<string, unknown> {
  const maxCitationRefs = Math.min(ASSISTANT_OUTPUT_LIMITS.maxCitationRefsPerClaim, Math.max(0, citationCount));
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      claims: {
        type: "array",
        minItems: 1,
        maxItems: ASSISTANT_OUTPUT_LIMITS.maxClaims,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string", minLength: 1, maxLength: ASSISTANT_OUTPUT_LIMITS.maxClaimCharacters },
            citationRefs: {
              type: "array",
              minItems: groundingRequired ? 1 : 0,
              maxItems: maxCitationRefs,
              items: { type: "string", pattern: "^S[0-9]+$" },
            },
          },
          required: ["text", "citationRefs"],
        },
      },
      caveats: {
        type: "array",
        items: { type: "string", maxLength: ASSISTANT_OUTPUT_LIMITS.maxCaveatCharacters },
        maxItems: ASSISTANT_OUTPUT_LIMITS.maxCaveats,
      },
      canvas: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", const: "markdown" },
              title: { type: "string", minLength: 1, maxLength: AGENT_CANVAS_LIMITS.maxTitleCharacters },
              content: { type: "string", minLength: 1, maxLength: AGENT_CANVAS_LIMITS.maxContentCharacters },
            },
            required: ["kind", "title", "content"],
          },
          { type: "null" },
        ],
      },
    },
    required: ["claims", "caveats", "canvas"],
  };
}

function parseClaim(value: unknown): AssistantClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const text = cleanBoundedText(candidate.text, ASSISTANT_OUTPUT_LIMITS.maxClaimCharacters, true);
  if (!text || !Array.isArray(candidate.citationRefs)
    || candidate.citationRefs.length > ASSISTANT_OUTPUT_LIMITS.maxCitationRefsPerClaim) return null;
  if (candidate.citationRefs.some((ref) => typeof ref !== "string" || !/^S\d+$/.test(ref))) return null;
  return { text, citationRefs: [...new Set(candidate.citationRefs as string[])] };
}

function parseCanvas(value: unknown): AgentCanvasArtifact | null | undefined {
  // `canvas` is optional at the transport boundary for backwards-compatible
  // providers, while the generated schema asks current providers to emit null.
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "markdown") return undefined;
  const allowedKeys = new Set(["kind", "title", "content"]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return undefined;
  const title = cleanBoundedText(candidate.title, AGENT_CANVAS_LIMITS.maxTitleCharacters, false);
  const content = cleanBoundedText(candidate.content, AGENT_CANVAS_LIMITS.maxContentCharacters, true);
  if (!title || !content) return undefined;
  return { kind: "markdown", title, content };
}

function extractCitationRefs(value: string): string[] {
  return [...new Set(Array.from(value.matchAll(/\[S\d+\]/gi), (match) => match[0].slice(1, -1).toUpperCase()))];
}

function groundedCanvasLinesAreCited(value: string): boolean {
  return value.split(/\r?\n/).every((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^#{1,6}(?:\s|$)/.test(trimmed) || /^(?:[-*_]\s*){3,}$/.test(trimmed)) return true;
    // Descriptive headings and separators do not make factual claims. Prose,
    // list items, diagram labels, and table rows still retain a current-turn
    // source marker so Canvas cannot bypass claim-level grounding.
    return /\[S\d+\]/i.test(trimmed);
  });
}

function stripModelCitationMarkers(value: string): string {
  return value.replace(/\s*\[S\d+\]/gi, "").trim();
}

function cleanBoundedText(value: unknown, limit: number, preserveLines: boolean): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .replace(preserveLines ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ")
    .trim();
  if (!normalized || Array.from(normalized).length > limit) return null;
  return normalized;
}
