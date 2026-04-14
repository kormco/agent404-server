// Score request as human/agent based on weighted header signals.
// > 0.6 = agent, otherwise treat as human.

export interface AgentScore {
  isAgent: boolean;
  confidence: number;
  signals: string[];
}

const KNOWN_AGENT_UA_PATTERNS: readonly RegExp[] = [
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
  /\bgptbot\b/i,
  /\bclaude\b/i,
  /anthropic/i,
  /openai/i,
  /\bmariner\b/i,
  /\bperplexity\b/i,
  /\bbingbot\b/i,
  /googlebot/i,
  /\bagent\b/i,
];

const CLI_UA_PATTERNS: readonly RegExp[] = [
  /^curl\//i,
  /^wget\//i,
  /^python-requests\//i,
  /^httpie\//i,
  /^node-fetch\//i,
  /\baxios\b/i,
  /\bgo-http-client\b/i,
];

export function detectAgent(headers: Record<string, string | undefined>): AgentScore {
  const ua = headers["user-agent"] ?? "";
  const accept = headers["accept"] ?? "";
  const acceptLanguage = headers["accept-language"];
  const cookie = headers["cookie"];
  const referer = headers["referer"] ?? headers["referrer"];
  const secFetchMode = headers["sec-fetch-mode"];
  const secFetchSite = headers["sec-fetch-site"];

  let score = 0;
  const signals: string[] = [];

  if (KNOWN_AGENT_UA_PATTERNS.some((p) => p.test(ua))) {
    score += 0.5;
    signals.push("known-agent-ua");
  }
  if (CLI_UA_PATTERNS.some((p) => p.test(ua))) {
    score += 0.3;
    signals.push("cli-ua");
  }
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    score += 0.3;
    signals.push("json-only-accept");
  }
  if (!acceptLanguage) {
    score += 0.1;
    signals.push("no-accept-language");
  }
  if (!cookie) {
    score += 0.05;
    signals.push("no-cookie");
  }
  if (!referer) {
    score += 0.05;
    signals.push("no-referer");
  }
  if (secFetchMode || secFetchSite) {
    score -= 0.2;
    signals.push("has-sec-fetch");
  }
  if (accept.startsWith("text/html")) {
    score -= 0.2;
    signals.push("html-first-accept");
  }

  const confidence = Math.max(0, Math.min(1, score));
  return {
    isAgent: confidence > 0.6,
    confidence,
    signals,
  };
}
