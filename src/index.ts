import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildIndex, type ContentIndex } from "./content-index.js";
import { findMatches } from "./matcher.js";
import { detectAgent } from "./agent-detector.js";
import { isScannerPath } from "./scanner-blocklist.js";
import { buildHtmlResponse, buildJsonResponse } from "./response-builder.js";
import { PORT, MAX_PATH_LENGTH } from "./config.js";

let index: ContentIndex;
try {
  index = buildIndex();
  console.log(`[startup] indexed ${index.entries.length} pages`);
} catch (err) {
  console.error("[startup] failed to build content index:", err);
  process.exit(1);
}

// Sanitize a path-like string for safe inclusion in logs.
function sanitizeForLog(s: string): string {
  return s.replace(/[\r\n\t\0]/g, "?").slice(0, 200);
}

function staticNotFound(): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
    body: "Not Found",
  };
}

function getOriginalPath(req: IncomingMessage): string {
  const fromHeader = req.headers["x-original-uri"];
  if (typeof fromHeader === "string" && fromHeader.length > 0) return fromHeader;
  return req.url ?? "/";
}

function normalizeHeaders(req: IncomingMessage): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(",") : v;
  }
  return out;
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  try {
    const originalPath = getOriginalPath(req);
    const headers = normalizeHeaders(req);

    // Long paths: instant static 404
    if (originalPath.length > MAX_PATH_LENGTH) {
      const r = staticNotFound();
      res.writeHead(r.statusCode, r.headers);
      res.end(r.body);
      return;
    }

    // Scanner blocklist: instant static 404, no matching
    if (isScannerPath(originalPath)) {
      const r = staticNotFound();
      res.writeHead(r.statusCode, r.headers);
      res.end(r.body);
      return;
    }

    const agent = detectAgent(headers);
    const matches = findMatches(originalPath, index);

    const result = agent.isAgent
      ? buildJsonResponse({ matches, originalPath })
      : buildHtmlResponse({ matches, originalPath });

    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);

    console.log(
      `[lookup] ${sanitizeForLog(originalPath)} -> ${result.statusCode} ` +
        `(agent=${agent.isAgent} conf=${matches[0]?.score.toFixed(2) ?? "0.00"} ` +
        `method=${matches[0]?.method ?? "none"})`,
    );
  } catch (err) {
    console.error("[error]", err instanceof Error ? err.message : String(err));
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal Server Error");
    } else {
      res.end();
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[startup] agent404-server listening on 127.0.0.1:${PORT}`);
});

// Graceful shutdown
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`[shutdown] received ${sig}`);
    server.close(() => process.exit(0));
  });
}
