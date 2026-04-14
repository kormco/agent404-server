# Handoff — agent404-server

**Last session:** 2026-04-14
**Status:** Scaffolding complete, smoke-tested locally, pushed to GitHub. Not yet deployed to korm.co. No outreach to Bharath beyond the original email.

## What exists

Repo at `C:\Users\evank\agent404-server` (commit `78afd0b`).

- Working TypeScript implementation, compiles clean (`npx tsc`), zero runtime deps
- All 6 smoke tests pass against a local sitemap fixture (typo→redirect, agent JSON, /blog/* transform, scanner block, XSS escape, garbage path)
- pm2 ecosystem config ready for `/opt/agent404-server`
- README pitches the server-side angle and cross-links to [agent404.dev](https://www.agent404.dev/)
- MIT licensed

## Architecture (one-liner)

nginx `try_files ... @smart_404` → proxies to Node service on :3003 → matches request path against sitemap-derived index using deterministic algos (Levenshtein, slug, keyword, transforms) → detects human vs agent from headers → returns HTML redirect-timer page OR HTTP-native 302/300/404 + JSON.

Full design: [PLAN.md](./PLAN.md). Per-module notes in `src/`.

## Done in last session

- [x] Scaffolded full project: `src/{config,scanner-blocklist,agent-detector,content-index,matcher,response-builder,index}.ts` + `src/templates/404.html`
- [x] Compiled clean, ran end-to-end smoke tests with curl
- [x] Initial git commit
- [x] Pushed to GitHub (see Repo URL below — to be filled in by handoff push)

## Open tasks

1. **Deploy to korm.co**
   - `mkdir -p /opt/agent404-server /var/log/agent404-server`
   - `scp` the repo (or git pull on the box once it's public)
   - `npm install && npx tsc` on the server
   - `pm2 start ecosystem.config.cjs && pm2 save`
   - Modify `/etc/nginx/sites-available/korm.co` per PLAN.md nginx section — change `try_files ... =404` to `try_files ... @smart_404` and add the `location @smart_404 { ... }` block
   - `nginx -t && systemctl reload nginx`
   - Verify with `curl https://korm.co/media/ai-typing-tuter` (should redirect)

2. **Open draft PR stub on bharath31/agent-404**
   - Fork via `gh repo fork bharath31/agent-404`
   - Add a single file: `docs/server-side-mode.md` proposing the architecture and linking to this repo as reference implementation
   - Open as draft PR with a description framing it as "happy to upstream or maintain as sibling"
   - This generates a GitHub notification for Bharath that the original email didn't

3. **Source-side fix for typewithai honeypot** (separate work, on another machine)
   - The honeypot's `child_process.execSync` blocks the event loop when attackers send slow payloads. Already discussed earlier — the fix lands from your other dev machine. Not blocking on agent404-server but worth doing soon since the box keeps getting popped.

## Things to know if picking this up cold

- **Sitemap drives the index.** `/var/www/korm.co/sitemap.xml` is read once at startup. If you add pages, restart the service (`pm2 restart agent404-server`).
- **Match titles are auto-derived from slugs** (`/media/ai-typing-tutor` → "AI Typing Tutor"). If you want hand-written titles, the spot to add HTML `<title>` parsing is in `src/content-index.ts` (`buildIndex` function, after `parsed`).
- **HTML template uses `{{KEY}}` placeholders.** Currently 8 placeholders, all replaced via simple string substitution. No template engine.
- **Agent score >0.6 = agent.** Tunable in `src/agent-detector.ts`. Default-to-human is intentional — HTML with redirect timer is still useful for ambiguous cases.
- **Behind Cloudflare:** the nginx config sets `X-Real-IP $http_cf_connecting_ip` to get the actual client IP. Not currently used by the service (rate limiting is deferred to the LLM phase) but the header passes through.

## Future (in PLAN.md, not in scope for v1)

- LLM-enhanced matching when deterministic returns no confident result (Haiku-class, gated by per-IP rate limit, path cache, per-IP token budget)
- HTML title scraping for richer match titles
- Persistent 404 log → SQLite to find broken inbound links proactively

## Repo URL

https://github.com/kormco/agent404-server
