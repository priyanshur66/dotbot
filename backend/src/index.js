require("dotenv").config();

const { createApp } = require("./app");
const { validateAndLoadEnv } = require("./config/env");
const { createTokenDeploymentService } = require("./services/tokenDeploymentService");
const { createTokenRegistryService } = require("./services/tokenRegistryService");
const { createTokenLaunchOrchestrator } = require("./services/tokenLaunchOrchestrator");
const { createChatHistoryService } = require("./services/chatHistoryService");
const { createAgentService } = require("./agent");
const { createLogger, getLogConfigFromEnv, sanitizeForLogging } = require("./lib/logging");
const { ConfigError } = require("./lib/errors");

const bootstrapLogConfig = getLogConfigFromEnv(process.env);
const bootstrapLogger = createLogger({
  service: "backend.bootstrap",
  ...bootstrapLogConfig,
});

async function start() {
  const startedAt = Date.now();
  bootstrapLogger.info({
    operation: "backend.startup",
    stage: "start",
    status: "start",
    context: {
      nodeEnv: process.env.NODE_ENV || "development",
      logConfig: bootstrapLogConfig,
    },
  });

  const config = validateAndLoadEnv(process.env, {
    strict: true,
    logger: bootstrapLogger,
  });
  const rootLogger = createLogger({
    service: "backend",
    level: config.logConfig.level,
    verbose: config.logConfig.verbose,
  });

  const deploymentService = createTokenDeploymentService({
    rpcUrl: config.rpcUrl,
    rpcWriteUrl: config.rpcWriteUrl,
    backendPrivateKey: config.backendPrivateKey,
    logger: createLogger({
      service: "backend.deployment",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const tokenRegistryService = createTokenRegistryService({
    convexUrl: config.convexUrl,
    logger: createLogger({
      service: "backend.registry",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const launchOrchestrator = createTokenLaunchOrchestrator({
    deploymentService,
    tokenRegistryService,
    logger: createLogger({
      service: "backend.launchOrchestrator",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const chatHistoryService = createChatHistoryService({
    convexUrl: config.convexUrl,
    logger: createLogger({
      service: "backend.chatHistory",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const agentService = createAgentService({
    rpcUrl: config.rpcUrl,
    rpcWriteUrl: config.rpcWriteUrl,
    backendPrivateKey: config.backendPrivateKey,
    openRouterApiKey: config.openRouterApiKey,
    openRouterModel: config.openRouterModel,
    openRouterSiteUrl: config.openRouterSiteUrl,
    openRouterSiteName: config.openRouterSiteName,
    deploymentService,
    launchOrchestrator,
    logger: createLogger({
      service: "backend.agent",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });

  rootLogger.info({
    operation: "backend.startup",
    stage: "deploymentService.init",
    status: "start",
  });
  await deploymentService.init();
  rootLogger.info({
    operation: "backend.startup",
    stage: "deploymentService.init",
    status: "success",
  });

  const connectedNetwork = await agentService.getNetworkInfo();
  if (Number(connectedNetwork.chainId) !== Number(agentService.expectedChainId)) {
    throw new ConfigError("Agent backend must be connected to Polkadot Hub TestNet RPC", {
      expectedChainId: Number(agentService.expectedChainId),
      connectedChainId: Number(connectedNetwork.chainId),
      connectedNetworkName: connectedNetwork.name,
    });
  }

  const app = createApp({
    deploymentService,
    tokenRegistryService,
    launchOrchestrator,
    chatHistoryService,
    agentService,
    envStatus: config.envStatus,
    logger: createLogger({
      service: "backend.http",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });

  app.listen(config.port, () => {
    rootLogger.info({
      operation: "backend.startup",
      stage: "listen",
      status: "success",
      durationMs: Date.now() - startedAt,
      context: sanitizeForLogging({
        port: config.port,
        envStatus: config.envStatus,
      }),
    });
  });
}

start().catch((error) => {
  bootstrapLogger.error({
    operation: "backend.startup",
    stage: "failure",
    status: "failure",
    error,
    context: {
      logConfig: bootstrapLogConfig,
    },
  });
  process.exit(1);
});
