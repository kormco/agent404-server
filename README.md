# agent404-server

Server-side companion to [agent404.dev](https://www.agent404.dev/) — a reverse-proxy 404 handler that returns intelligent, agent-friendly responses without requiring JavaScript execution.

## Why server-side?

[agent404.dev](https://www.agent404.dev/) is a great client-side library for transforming 404s into structured suggestions for AI agents. It's deployed via a `<script>` tag on your 404 page.

**The catch:** most AI agents (Claude, GPT, RAG pipelines, MCP clients, anything `curl`-based) don't execute JavaScript. They parse HTTP responses directly. A `<script>` tag on the 404 page means the very agents the project targets won't actually receive the suggestions.

`agent404-server` solves this by intercepting 404s at the reverse-proxy level (nginx, Caddy, etc.) and responding with **HTTP-native semantics**:

| Confidence | HTTP Status | What the agent gets |
|---|---|---|
| High (>0.85) | `302` + `Location` header | Follows the redirect automatically — zero parsing needed |
| Medium (0.5–0.85) | `300 Multiple Choices` | Ranked suggestions in JSON body, agent picks |
| Low (<0.5) | `404` | Suggestions list + pointer to site's MCP endpoint |

Every response includes an `X-Match-Confidence` header so agents can decide trust without parsing the body. Human visitors get an HTML page with a confidence-scaled redirect timer instead.

## Status

Early development. See [PLAN.md](./PLAN.md) for architecture and design.

## Relationship to agent404.dev

This project is designed to be **compatible** with [agent404.dev](https://www.agent404.dev/) — same JSON-LD response structure where applicable, complementary delivery mechanism. The two can run together (client-side enrichment + server-side delivery) or independently.

If you're using agent404.dev's hosted service, this gives you HTTP-native delivery for non-JS clients. If you're self-hosting, this can sit in front as the reverse-proxy layer.

## License

MIT
