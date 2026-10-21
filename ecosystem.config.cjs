// PM2 processes for production. Paths go through the `current` symlink, so a
// reload after deploy.sh switches the symlink starts the new release.
const root = "/home/deploy/diagnostic/current";

module.exports = {
  apps: [
    {
      name: "diagnostic-api",
      cwd: `${root}/apps/api`,
      script: "dist/src/server.js",
      env: { NODE_ENV: "production" },
      max_memory_restart: "800M",
      time: true
    },
    {
      name: "diagnostic-web",
      cwd: `${root}/apps/web`,
      // next is hoisted to the workspace root node_modules.
      script: `${root}/node_modules/next/dist/bin/next`,
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      max_memory_restart: "800M",
      time: true
    }
  ]
};
