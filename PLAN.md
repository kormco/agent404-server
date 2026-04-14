# Smart 404 Handler for korm.co

## Context

korm.co returns a bare nginx 404 for missing pages. On the agentic internet, a 404 is a missed opportunity — the server knows what content it has and can deterministically figure out what the visitor meant. This service intercepts 404s, matches the requested path against the site's content index, detects whether the visitor is human or agent, and returns the appropriate response format with redirect/suggestion behavior.

## Architecture

**Standalone Node.js/TypeScript service** at `/opt/smart-404`, port 3003, managed by pm2. Zero runtime dependencies — just `node:http`, `node:fs`, `node:url`. TypeScript as dev dependency only.

nginx's `try_files` fallback changes from `=404` to `@smart_404`, which proxies to the service with original request headers.

## Project Structure

```
/opt/smart-404/
├── package.json
├── tsconfig.json
├── ecosystem.config.js        # pm2
├── src/
│   ├── index.ts               # HTTP server + request orchestration
│   ├── config.ts              # constants, thresholds, paths
│   ├── content-index.ts       # parse sitemap.xml + HTML titles on startup
│   ├── matcher.ts             # Levenshtein, slug match, keyword match, transforms
│   ├── agent-detector.ts      # score request as human/agent from headers
│   ├── scanner-blocklist.ts   # instant-reject known probe paths
│   └── response-builder.ts    # HTML (redirect timer page) + JSON responses
└── dist/
```

## Request Flow

```
nginx 404 -> proxy to :3003/lookup with X-Original-URI + forwarded headers
  -> input validation (length check, sanitize)
  -> scanner blocklist check (static 404 if match)
  -> agent detection (score headers)
  -> matcher pipeline (normalize -> transforms -> fuzzy path -> slug -> keyword)
  -> response builder (HTML or JSON based on agent score)
  -> return
```

## Matching Pipeline (deterministic, no LLM)

All scoring is 0.0–1.0. Runs against 11 known pages from sitemap.xml.

1. **Normalize** — lowercase, strip trailing slash, URL-decode, collapse slashes
2. **Transforms** (score 0.95) — `/blog/*`→`/media/*`, `/about`→`/bio`, `/articles/*`→`/media/*`, strip `/en/`, `/page/` prefixes
3. **Fuzzy path** — Levenshtein distance against all known paths. Score = `1 - (distance / max(len_a, len_b))`
4. **Slug match** — extract last path segment, fuzzy match against article slugs
5. **Keyword match** (score * 0.8 cap) — split path on `-/_/.`, remove stopwords, look up keyword index built from titles/slugs

Deduplicate by path, keep highest score per path, return top 5 sorted descending. Tiebreak by sitemap priority.

## Agent Detection

Weighted signal scoring:

| Signal | Weight |
|---|---|
| Bot/agent/Claude/GPT/Mariner in UA | +0.5 |
| curl/wget/httpie UA | +0.3 |
| Accept: application/json (no text/html) | +0.3 |
| No Accept-Language | +0.1 |
| No Cookie | +0.05 |
| No Referer | +0.05 |
| Has Sec-Fetch headers (real browser) | -0.2 |
| Accept: text/html first | -0.2 |

Score > 0.6 = agent. Default to human when uncertain.

## Response Strategy

### Human (HTML)

| Confidence | Timer | Behavior |
|---|---|---|
| > 0.85 | 3s | "Redirecting to [Title]..." + meta refresh + JS redirect |
| 0.5–0.85 | 10s | "Did you mean [Title]?" + countdown + suggestions + cancel link |
| < 0.5 | none | Suggestions list, no redirect. Standard 404. |

Single HTML template with placeholder replacement. Dark styling matching korm.co.

### Agent (JSON)

| Confidence | HTTP Status | Body |
|---|---|---|
| > 0.85 | 302 + Location | `{ match, alternatives, mcp_endpoint }` |
| 0.5–0.85 | 300 Multiple Choices | `{ matches[], mcp_endpoint }` |
| < 0.5 | 404 | `{ error, suggestions[], mcp_endpoint }` |

All responses include `X-Match-Confidence` header.

## Input Sanitization

- **Scanner blocklist**: ~60 prefixes (`/wp-admin`, `/.env`, `*.php`, etc.) → instant static 404, zero processing
- **Long paths** (>500 chars): instant static 404
- **HTML escaping**: all user-controlled strings (requested path, query params) must be HTML-entity-escaped before template insertion to prevent reflected XSS
- **Location header validation**: 302 redirects must only target relative paths — enforce starts with `/`, reject `//`, protocol schemes, and control characters (`\r`, `\n`) to prevent CRLF injection and open redirects
- **Error handler**: top-level uncaught exception handler returns generic 500 with no stack traces, file paths, or Node internals
- **Log sanitization**: encode/strip control characters from paths before writing to logs

## nginx Changes

In `/etc/nginx/sites-available/korm.co`, change:
```nginx
location / {
    try_files $uri $uri.html $uri/ @smart_404;
}

location @smart_404 {
    internal;
    proxy_pass http://127.0.0.1:3003/lookup;
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $http_cf_connecting_ip;  # real client IP behind Cloudflare
    proxy_set_header X-Original-Host $host;
    proxy_set_header User-Agent $http_user_agent;
    proxy_set_header Accept $http_accept;
    proxy_set_header Accept-Language $http_accept_language;
    proxy_set_header Referer $http_referer;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Sec-Fetch-Mode $http_sec_fetch_mode;
    proxy_intercept_errors off;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
}
```

## Deployment

```bash
mkdir -p /opt/smart-404 /var/log/smart-404
cd /opt/smart-404
npm install --save-dev typescript @types/node
npx tsc
pm2 start ecosystem.config.js
pm2 save
nginx -t && systemctl reload nginx
```

## Verification

1. `curl -s http://127.0.0.1:3003/lookup -H 'X-Original-URI: /media/ai-typing-tuter'` — should return HTML with redirect to `/media/ai-typing-tutor`
2. `curl -s http://127.0.0.1:3003/lookup -H 'X-Original-URI: /blog/welcome' -H 'Accept: application/json'` — should return 302 JSON with Location
3. `curl -s http://127.0.0.1:3003/lookup -H 'X-Original-URI: /wp-admin'` — should return instant static 404
4. After nginx reload: `curl -sI https://korm.co/media/ai-typing-tuter` — should get redirect page
5. XSS test: `curl -s 'http://127.0.0.1:3003/lookup' -H 'X-Original-URI: /media/<script>alert(1)</script>'` — should show escaped `&lt;script&gt;` in HTML, never raw tags
6. Agent JSON test: `curl -s 'http://127.0.0.1:3003/lookup' -H 'X-Original-URI: /media/ai-typing-tuter' -H 'User-Agent: Claude-Agent/1.0' -H 'Accept: application/json'` — should return JSON with 302 + Location

---

## Future: LLM-Enhanced Matching

When deterministic matching returns no confident results (all scores < 0.5), a future version could invoke a small LLM (Haiku-class) to interpret the semantic intent of the URL path against the content index.

**Prompt design:**
- System: "Given this URL path someone tried to visit on korm.co, and this list of actual pages with titles/descriptions, which page were they most likely looking for? If none match, say so."
- User: the normalized path + compact content index (titles + paths only)
- Max tokens: ~100 (just need a path + reasoning)

**Flood protection (required before enabling LLM):**
- **Per-IP rate limiting**: 30 req/IP/min using `CF-Connecting-IP` for real client IP behind Cloudflare. In-memory Map with lazy cleanup.
- **Path-keyed result cache**: hash normalized path, cache LLM response for 4h. Same 404 path = same answer, zero repeat inference.
- **Per-IP token budget**: cap at 10 LLM invocations per IP per hour via SQLite or in-memory tracker. Beyond that, return deterministic-only results.
- **Skip LLM for scanner paths**: already handled by blocklist — no tokens wasted on `/wp-admin` probes.
