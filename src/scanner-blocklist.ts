// Known scanner/probe paths get an instant 404 with no matching logic invoked.
// Two checks: prefix match against well-known probe paths, and suffix match
// against script extensions that don't exist on a static site.

const PROBE_PREFIXES: ReadonlySet<string> = new Set([
  "/wp-admin",
  "/wp-login",
  "/wp-content",
  "/wp-includes",
  "/wordpress",
  "/wp-json",
  "/.env",
  "/.git",
  "/.svn",
  "/.htaccess",
  "/.htpasswd",
  "/.DS_Store",
  "/phpmyadmin",
  "/pma",
  "/mysql",
  "/myadmin",
  "/administrator",
  "/cgi-bin",
  "/shell",
  "/cmd",
  "/vendor",
  "/composer",
  "/xmlrpc.php",
  "/wp-cron.php",
  "/install.php",
  "/setup.php",
  "/config.php",
  "/configuration.php",
  "/config.yml",
  "/config.json",
  "/backup",
  "/database",
  "/dump",
  "/actuator",
  "/telescope",
  "/horizon",
  "/nova",
  "/server-status",
  "/server-info",
]);

const PROBE_SUFFIXES: readonly string[] = [
  ".php",
  ".asp",
  ".aspx",
  ".jsp",
  ".cgi",
  ".action",
  ".do",
];

export function isScannerPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const prefix of PROBE_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix + "/")) return true;
  }
  for (const suffix of PROBE_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }
  return false;
}
