import { readFileSync } from "node:fs";
import { SITEMAP_PATH, SITE_BASE_URL } from "./config.js";

export interface ContentEntry {
  path: string;
  slug: string;
  title: string;
  keywords: string[];
  priority: number;
  lastmod?: string;
}

export interface ContentIndex {
  entries: ContentEntry[];
  allPaths: string[];
  slugMap: Map<string, ContentEntry>;
  keywordIndex: Map<string, ContentEntry[]>;
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "in", "to", "with", "my", "your",
  "is", "are", "be", "on", "at", "by", "as", "or",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s\-_./]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function deriveTitle(path: string): string {
  // "/media/ai-typing-tutor" -> "AI Typing Tutor"
  const last = path.split("/").filter(Boolean).pop() ?? "Home";
  return last
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace(/\bAi\b/g, "AI")
    .replace(/\bMcp\b/g, "MCP");
}

function parseSitemap(xml: string): Array<{ path: string; priority: number; lastmod?: string }> {
  // Trivial sitemap parser — extracts <loc>, <priority>, <lastmod> from <url> blocks.
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  const baseUrlPattern = SITE_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const baseRegex = new RegExp(`^${baseUrlPattern}`);

  return urlBlocks.flatMap((block) => {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
    if (!locMatch) return [];
    const url = locMatch[1]!.trim();
    const path = url.replace(baseRegex, "") || "/";

    const priorityMatch = block.match(/<priority>([^<]+)<\/priority>/);
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);

    return [{
      path: path.replace(/\/$/, "") || "/",
      priority: priorityMatch ? Number(priorityMatch[1]) : 0.5,
      lastmod: lastmodMatch?.[1]?.trim(),
    }];
  });
}

export function buildIndex(): ContentIndex {
  const xml = readFileSync(SITEMAP_PATH, "utf8");
  const parsed = parseSitemap(xml);

  const entries: ContentEntry[] = parsed.map(({ path, priority, lastmod }) => {
    const slug = path === "/" ? "home" : path.split("/").filter(Boolean).pop()!;
    const title = path === "/" ? "Home" : deriveTitle(path);
    const keywords = Array.from(new Set([
      ...tokenize(title),
      ...tokenize(slug),
      ...tokenize(path),
    ]));
    return { path, slug, title, keywords, priority, lastmod };
  });

  const allPaths = entries.map((e) => e.path);
  const slugMap = new Map<string, ContentEntry>();
  for (const e of entries) slugMap.set(e.slug, e);

  const keywordIndex = new Map<string, ContentEntry[]>();
  for (const e of entries) {
    for (const kw of e.keywords) {
      const list = keywordIndex.get(kw) ?? [];
      list.push(e);
      keywordIndex.set(kw, list);
    }
  }

  return { entries, allPaths, slugMap, keywordIndex };
}
