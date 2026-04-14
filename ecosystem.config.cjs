module.exports = {
  apps: [{
    name: "agent404-server",
    script: "./dist/index.js",
    cwd: "/opt/agent404-server",
    instances: 1,
    exec_mode: "fork",
    env: {
      NODE_ENV: "production",
      PORT: 3003,
      SITE_ROOT: "/var/www/korm.co",
      SITE_BASE_URL: "https://korm.co",
      MCP_ENDPOINT: "https://mcp.korm.co",
    },
    max_memory_restart: "100M",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "/var/log/agent404-server/error.log",
    out_file: "/var/log/agent404-server/access.log",
  }],
};
