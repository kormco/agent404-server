export const PORT = Number(process.env.PORT ?? 3003);
export const SITE_ROOT = process.env.SITE_ROOT ?? "/var/www/korm.co";
export const SITEMAP_PATH = `${SITE_ROOT}/sitemap.xml`;
export const SITE_BASE_URL = process.env.SITE_BASE_URL ?? "https://korm.co";
export const MCP_ENDPOINT = process.env.MCP_ENDPOINT ?? "https://mcp.korm.co";

export const THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.5,
} as const;

export const TIMERS = {
  HIGH_CONFIDENCE_SECONDS: 3,
  MEDIUM_CONFIDENCE_SECONDS: 10,
} as const;

export const MAX_PATH_LENGTH = 500;
