module.exports = {
  apps: [
    {
      name: "guangzai-card-game",
      script: "backend/server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production"
      },
      time: true,
      max_memory_restart: "512M"
    }
  ]
};
