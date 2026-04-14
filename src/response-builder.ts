import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { MatchResult } from "./matcher.js";
import { MCP_ENDPOINT, SITE_BASE_URL, THRESHOLDS, TIMERS } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, "../src/templates/404.html");

let cachedTemplate: string | null = null;
function loadTemplate(): string {
  if (cachedTemplate === null) {
    cachedTemplate = readFileSync(TEMPLATE_PATH, "utf8");
  }
  return cachedTemplate;
}

// HTML-escape user-controlled strings before template insertion. Critical:
// the requested path is attacker-controlled and gets reflected in the page.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Validate a redirect target — must be a relative path on this host.
// Rejects: protocol schemes, protocol-relative URLs, control characters.
// Returns null if invalid.
export function safeRedirect(target: string): string | null {
  if (!target || target.length > 500) return null;
  if (/[\r\n\t\0]/.test(target)) return null;
  if (!target.startsWith("/")) return null;
  if (target.startsWith("//")) return null;
  if (/^[a-z]+:/i.test(target)) return null;
  return target;
}

interface BuildArgs {
  matches: MatchResult[];
  originalPath: string;
}

interface BuildResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function buildHtmlResponse({ matches, originalPath }: BuildArgs): BuildResult {
  const template = loadTemplate();
  const top = matches[0];
  const safePath = escapeHtml(originalPath);

  const baseHeaders = {
    "content-type": "text/html; charset=utf-8",
    "x-match-confidence": top ? top.score.toFixed(2) : "0.00",
    "cache-control": "no-store",
  };

  // Low confidence: just suggestions, no auto-redirect
  if (!top || top.score < THRESHOLDS.MEDIUM) {
    return {
      statusCode: 404,
      headers: baseHeaders,
      body: render(template, {
        ORIGINAL_PATH: safePath,
        HEADING: "Page not found",
        REDIRECT_URL: "",
        REDIRECT_TITLE: "",
        TIMER_SECONDS: "0",
        AUTO_REDIRECT: "false",
        SUGGESTIONS_HTML: renderSuggestions(matches),
        META_REFRESH: "",
      }),
    };
  }

  const redirectUrl = safeRedirect(top.entry.path) ?? "/";
  const redirectTitle = escapeHtml(top.entry.title);
  const timer =
    top.score >= THRESHOLDS.HIGH
      ? TIMERS.HIGH_CONFIDENCE_SECONDS
      : TIMERS.MEDIUM_CONFIDENCE_SECONDS;

  return {
    statusCode: 200,
    headers: baseHeaders,
    body: render(template, {
      ORIGINAL_PATH: safePath,
      HEADING:
        top.score >= THRESHOLDS.HIGH ? "Redirecting…" : "Did you mean…?",
      REDIRECT_URL: redirectUrl,
      REDIRECT_TITLE: redirectTitle,
      TIMER_SECONDS: String(timer),
      AUTO_REDIRECT: "true",
      SUGGESTIONS_HTML: renderSuggestions(matches.slice(1)),
      META_REFRESH: `<meta http-equiv="refresh" content="${timer};url=${redirectUrl}">`,
    }),
  };
}

function renderSuggestions(matches: MatchResult[]): string {
  if (matches.length === 0) return "";
  const items = matches
    .map((m) => {
      const url = safeRedirect(m.entry.path) ?? "/";
      return `<li><a href="${url}">${escapeHtml(m.entry.title)}</a> <span class="hint">${(m.score * 100).toFixed(0)}% match</span></li>`;
    })
    .join("");
  return `<div class="suggestions"><p>Other possibilities:</p><ul>${items}</ul></div>`;
}

function render(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export function buildJsonResponse({ matches, originalPath }: BuildArgs): BuildResult {
  const top = matches[0];
  const confidence = top ? top.score : 0;

  const baseHeaders: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "x-match-confidence": confidence.toFixed(2),
    "cache-control": "no-store",
  };

  // High confidence: 302 with Location
  if (top && top.score >= THRESHOLDS.HIGH) {
    const validated = safeRedirect(top.entry.path);
    if (validated) {
      return {
        statusCode: 302,
        headers: {
          ...baseHeaders,
          location: validated,
        },
        body: JSON.stringify({
          requested: originalPath,
          match: serializeMatch(top),
          alternatives: matches.slice(1, 5).map(serializeMatch),
          mcp_endpoint: MCP_ENDPOINT,
        }),
      };
    }
  }

  // Medium confidence: 300 Multiple Choices
  if (top && top.score >= THRESHOLDS.MEDIUM) {
    return {
      statusCode: 300,
      headers: baseHeaders,
      body: JSON.stringify({
        requested: originalPath,
        matches: matches.slice(0, 5).map(serializeMatch),
        mcp_endpoint: MCP_ENDPOINT,
      }),
    };
  }

  // Low confidence: 404
  return {
    statusCode: 404,
    headers: baseHeaders,
    body: JSON.stringify({
      error: "not_found",
      requested: originalPath,
      suggestions: matches.slice(0, 5).map(serializeMatch),
      mcp_endpoint: MCP_ENDPOINT,
    }),
  };
}

function serializeMatch(m: MatchResult) {
  return {
    path: m.entry.path,
    url: `${SITE_BASE_URL}${m.entry.path}`,
    title: m.entry.title,
    confidence: Number(m.score.toFixed(3)),
    method: m.method,
  };
}
