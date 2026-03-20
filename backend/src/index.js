require("dotenv").config();

const { createApp } = require("./app");
const { validateAndLoadEnv } = require("./config/env");
const { createTokenRegistryService } = require("./services/tokenRegistryService");
const { createTokenLaunchOrchestrator } = require("./services/tokenLaunchOrchestrator");
const { createLaunchpadDeploymentService } = require("./services/launchpadDeploymentService");
const { createEventIndexerService } = require("./services/indexer/eventIndexerService");
const { createChatHistoryService } = require("./services/chatHistoryService");
const { createTwitterBotRegistryService } = require("./services/twitterBotRegistryService");
const { createTwitter241Client } = require("./services/twitter/twitter241Client");
const { createTwitterBotClassifierService } = require("./services/twitterBotClassifierService");
const { createTwitterBotService } = require("./services/twitterBotService");
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

  const tokenRegistryService = createTokenRegistryService({
    convexUrl: config.convexUrl,
    logger: createLogger({
      service: "backend.registry",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const launchpadDeploymentService = createLaunchpadDeploymentService({
    rpcUrl: config.rpcUrl,
    rpcWriteUrl: config.rpcWriteUrl,
    backendPrivateKey: config.backendPrivateKey,
    protocolTreasuryAddress: config.protocolTreasuryAddress,
    eventHubAddress: config.eventHubAddress,
    quoteTokenAddress: config.quoteTokenAddress,
    launchpadAddress: config.launchpadAddress,
    logger: createLogger({
      service: "backend.launchpad",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const launchOrchestrator = createTokenLaunchOrchestrator({
    launchpadDeploymentService,
    tokenRegistryService,
    logger: createLogger({
      service: "backend.launchOrchestrator",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const eventIndexerService = createEventIndexerService({
    launchpadDeploymentService,
    tokenRegistryService,
    logger: createLogger({
      service: "backend.indexer",
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
  const twitterBotRegistryService = createTwitterBotRegistryService({
    convexUrl: config.convexUrl,
    logger: createLogger({
      service: "backend.twitterBotRegistry",
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
    launchOrchestrator,
    logger: createLogger({
      service: "backend.agent",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });
  const twitterBotEnabled =
    config.twitterBotEnabled &&
    Boolean(config.twitterBotTargetHandle) &&
    Boolean(config.twitter241RapidApiKey) &&
    Boolean(config.twitter241RapidApiHost);
  const twitterProviderClient = twitterBotEnabled
    ? createTwitter241Client({
        apiKey: config.twitter241RapidApiKey,
        apiHost: config.twitter241RapidApiHost,
        logger: createLogger({
          service: "backend.twitter241",
          level: config.logConfig.level,
          verbose: config.logConfig.verbose,
        }),
      })
    : {
        resolveHandle: async (handle) => ({ id: String(handle || ""), username: String(handle || "") }),
        listRecentTweets: async () => ({ resolvedHandle: "", tweets: [], raw: {} }),
      };
  const twitterBotClassifierService = twitterBotEnabled
    ? createTwitterBotClassifierService({
        openRouterApiKey: config.openRouterApiKey,
        openRouterModel: config.openRouterModel,
        openRouterSiteUrl: config.openRouterSiteUrl,
        openRouterSiteName: config.openRouterSiteName,
        logger: createLogger({
          service: "backend.twitterBotClassifier",
          level: config.logConfig.level,
          verbose: config.logConfig.verbose,
        }),
      })
    : {
        classifyTweet: async () => ({
          shouldLaunch: false,
          confidence: 0,
          tokenName: null,
          tokenSymbol: null,
          reason: "Twitter bot is disabled",
        }),
      };
  const twitterBotService = createTwitterBotService({
    twitterBotRegistryService,
    twitterProviderClient,
    twitterBotClassifierService,
    launchOrchestrator,
    targetHandle: config.twitterBotTargetHandle,
    enabled: twitterBotEnabled,
    pollMs: config.twitterBotPollMs,
    logger: createLogger({
      service: "backend.twitterBot",
      level: config.logConfig.level,
      verbose: config.logConfig.verbose,
    }),
  });

  rootLogger.info({
    operation: "backend.startup",
    stage: "launchpad.init",
    status: "start",
  });
  await launchpadDeploymentService.init();
  rootLogger.info({
    operation: "backend.startup",
    stage: "launchpad.init",
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

  eventIndexerService.start();
  await eventIndexerService.syncOnce();
  twitterBotService.start();
  await twitterBotService.syncOnce();

  const app = createApp({
    tokenRegistryService,
    launchOrchestrator,
    eventIndexerService,
    chatHistoryService,
    agentService,
    twitterBotRegistryService,
    twitterBotService,
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
