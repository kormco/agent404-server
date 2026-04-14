import type { ContentEntry, ContentIndex } from "./content-index.js";

export interface MatchResult {
  entry: ContentEntry;
  score: number;
  method: "exact" | "transform" | "fuzzy-path" | "slug" | "keyword";
}

// Common URL pattern transforms — old-style URLs that map to current paths.
const TRANSFORMS: Array<{ from: RegExp; to: string }> = [
  { from: /^\/blog(\/.*)?$/, to: "/media$1" },
  { from: /^\/post(\/.*)?$/, to: "/media$1" },
  { from: /^\/posts(\/.*)?$/, to: "/media$1" },
  { from: /^\/articles(\/.*)?$/, to: "/media$1" },
  { from: /^\/about\/?$/, to: "/bio" },
  { from: /^\/en(\/.*)?$/, to: "$1" },
  { from: /^\/page(\/.*)?$/, to: "$1" },
  { from: /^\/pages(\/.*)?$/, to: "$1" },
];

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "in", "to", "with", "my", "your",
]);

export function normalizePath(input: string): string {
  let path = input;
  try {
    path = decodeURIComponent(path);
  } catch {
    // ignore decode errors, fall through with original
  }
  path = path.toLowerCase().replace(/\/+/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]!
          : 1 + Math.min(prev[j - 1]!, prev[j]!, curr[j - 1]!);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function findMatches(requestPath: string, index: ContentIndex): MatchResult[] {
  const normalized = normalizePath(requestPath);
  const candidates = new Map<string, MatchResult>();

  const upsert = (result: MatchResult) => {
    const existing = candidates.get(result.entry.path);
    if (!existing || result.score > existing.score) {
      candidates.set(result.entry.path, result);
    }
  };

  // 1. Exact match (after normalization handles case + trailing slash)
  for (const entry of index.entries) {
    if (entry.path.toLowerCase() === normalized) {
      upsert({ entry, score: 1.0, method: "exact" });
    }
  }

  // 2. Transform-based exact match
  for (const { from, to } of TRANSFORMS) {
    if (from.test(normalized)) {
      const transformed = normalizePath(normalized.replace(from, to));
      for (const entry of index.entries) {
        if (entry.path.toLowerCase() === transformed) {
          upsert({ entry, score: 0.95, method: "transform" });
        }
      }
    }
  }

  // 3. Fuzzy path (Levenshtein on full path)
  for (const entry of index.entries) {
    const score = similarity(normalized, entry.path.toLowerCase());
    if (score >= 0.4) {
      upsert({ entry, score, method: "fuzzy-path" });
    }
  }

  // 4. Slug match (last segment of request vs each entry's slug)
  const requestSlug = normalized.split("/").filter(Boolean).pop() ?? "";
  if (requestSlug.length >= 2) {
    for (const entry of index.entries) {
      const slugScore = similarity(requestSlug, entry.slug.toLowerCase()) * 0.9;
      if (slugScore >= 0.5) {
        upsert({ entry, score: slugScore, method: "slug" });
      }
    }
  }

  // 5. Keyword match (tokens in request path that hit the keyword index)
  const tokens = normalized
    .split(/[/\-_.]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (tokens.length > 0) {
    const hits = new Map<string, number>();
    for (const t of tokens) {
      const entries = index.keywordIndex.get(t) ?? [];
      for (const e of entries) {
        hits.set(e.path, (hits.get(e.path) ?? 0) + 1);
      }
    }
    for (const [path, count] of hits) {
      const entry = index.entries.find((e) => e.path === path);
      if (!entry) continue;
      const score = (count / tokens.length) * 0.8;
      if (score >= 0.3) {
        upsert({ entry, score, method: "keyword" });
      }
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.entry.priority - a.entry.priority;
    })
    .slice(0, 5);
}
