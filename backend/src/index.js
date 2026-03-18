require("dotenv").config();

const { createApp } = require("./app");
const { validateAndLoadEnv } = require("./config/env");
const { createTokenDeploymentService } = require("./services/tokenDeploymentService");

async function start() {
  const config = validateAndLoadEnv(process.env, { strict: true });

  const deploymentService = createTokenDeploymentService({
    rpcUrl: config.rpcUrl,
    backendPrivateKey: config.backendPrivateKey,
  });

  await deploymentService.init();

  const app = createApp({
    deploymentService,
    envStatus: config.envStatus,
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on port ${config.port}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", error);
  process.exit(1);
});
