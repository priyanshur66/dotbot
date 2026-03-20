const express = require("express");
const { randomUUID } = require("crypto");
const { HttpError } = require("./lib/errors");
const {
  normalizeDeployRequest,
  normalizeLaunchRequest,
  normalizeTokenAddress,
  normalizeCandleInterval,
  normalizeAgentChatRequest,
  normalizeChatThreadCreateRequest,
  normalizeChatThreadListRequest,
  normalizeChatThreadGetRequest,
  normalizeChatThreadReplyRequest,
  normalizeTwitterBotUpsertRequest,
  normalizeTwitterBotGetRequest,
} = require("./utils/requestValidation");
const {
  createNoopLogger,
  sanitizeForLogging,
  serializeError,
} = require("./lib/logging");
const { runWithRequestContext } = require("./lib/requestContext");

function attachErrorContext(error, context) {
  if (!error || typeof error !== "object") {
    return error;
  }

  if (!error.operation) {
    error.operation = context.operation;
  }
  if (!error.stage) {
    error.stage = context.stage;
  }
  return error;
}

function chunkText(input, chunkSize = 32) {
  const text = typeof input === "string" ? input : "";
  if (!text) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
}

function isMeaningfulAssistantText(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && normalized !== "done.";
}

function getLatestLaunchAction(actions) {
  if (!Array.isArray(actions)) {
    return null;
  }
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (action?.tool === "launch_token") {
      return action;
    }
  }
  return null;
}

function buildLaunchAssistantMessage(action, fallbackMessage) {
  const result = action && typeof action.result === "object" ? action.result : {};
  const launchStatus =
    typeof result.launchStatus === "string" && result.launchStatus
      ? result.launchStatus
      : action?.status === "completed"
        ? "completed"
        : action?.status === "failed"
          ? "failed"
          : "unknown";

  const lines = [];

  if (launchStatus === "completed") {
    lines.push("Token launch successful.");
  } else if (launchStatus === "launch_pending") {
    lines.push("Token launch is pending.");
  } else {
    lines.push("Token launch failed.");
  }

  if (typeof result.name === "string" && result.name.trim()) {
    lines.push(`Name: ${result.name.trim()}`);
  }
  if (typeof result.symbol === "string" && result.symbol.trim()) {
    lines.push(`Symbol: ${result.symbol.trim()}`);
  }
  if (typeof result.tokenAddress === "string" && result.tokenAddress.trim()) {
    lines.push(`Token: ${result.tokenAddress.trim()}`);
  }
  if (typeof result.poolAddress === "string" && result.poolAddress.trim()) {
    lines.push(`Pool: ${result.poolAddress.trim()}`);
  }

  const txHash =
    (typeof action?.txHash === "string" && action.txHash.trim()) ||
    (result.transactions &&
    typeof result.transactions === "object" &&
    typeof result.transactions.launch === "string" &&
    result.transactions.launch.trim()
      ? result.transactions.launch.trim()
      : null) ||
    (result.transactions &&
    typeof result.transactions === "object" &&
    typeof result.transactions.deploy === "string" &&
    result.transactions.deploy.trim()
      ? result.transactions.deploy.trim()
      : null);

  if (txHash) {
    lines.push(`Transaction: ${txHash}`);
  }

  if (typeof result.launchRecordId === "string" && result.launchRecordId.trim()) {
    lines.push(`Launch record: ${result.launchRecordId.trim()}`);
  }

  if (typeof result.errorMessage === "string" && result.errorMessage.trim()) {
    lines.push(`Reason: ${result.errorMessage.trim()}`);
  }

  if (isMeaningfulAssistantText(fallbackMessage) && !fallbackMessage.startsWith(lines[0])) {
    lines.push("");
    lines.push(fallbackMessage.trim());
  }

  return lines.join("\n");
}

function isLaunchToolFailure(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const details = error.details && typeof error.details === "object" ? error.details : {};
  return (
    details.tool === "launch_token" ||
    (error.code === "ON_CHAIN_TRANSACTION_FAILED" &&
      typeof details.name === "string" &&
      typeof details.symbol === "string") ||
    (error.code === "AGENT_TOOL_EXECUTION_FAILED" && details.tool === "launch_token")
  );
}

function buildLaunchFailureAgentResult(error, network, agentService) {
  const details = error && typeof error === "object" && error.details ? error.details : {};
  const action = {
    id: `act_launch_failure_${randomUUID()}`,
    type: "backend_tx_submitted",
    tool: "launch_token",
    status: "failed",
    txHash:
      (details.transactions &&
      typeof details.transactions === "object" &&
      (details.transactions.launch || details.transactions.deploy)) ||
      null,
    result: {
      success: false,
      launchStatus:
        typeof details.launchStatus === "string" && details.launchStatus
          ? details.launchStatus
          : "failed",
      name:
        (typeof details.name === "string" && details.name) ||
        (details.args && typeof details.args === "object" && details.args.name) ||
        "Token",
      symbol:
        (typeof details.symbol === "string" && details.symbol) ||
        (details.args && typeof details.args === "object" && details.args.symbol) ||
        "",
      creatorAddress:
        typeof details.creatorAddress === "string" ? details.creatorAddress : null,
      tokenAddress: typeof details.tokenAddress === "string" ? details.tokenAddress : null,
      poolAddress: typeof details.poolAddress === "string" ? details.poolAddress : null,
      quoteTokenAddress:
        typeof details.quoteTokenAddress === "string" ? details.quoteTokenAddress : null,
      transactions:
        details.transactions && typeof details.transactions === "object"
          ? details.transactions
          : {
              launch: null,
              deploy: null,
              tokenTransfer: null,
              ownershipTransfer: null,
            },
      network:
        details.network && typeof details.network === "object" ? details.network : network || null,
      launchRecordId:
        typeof details.launchRecordId === "string" ? details.launchRecordId : null,
      errorCode:
        typeof error.code === "string" ? error.code : "TOKEN_LAUNCH_FAILED",
      errorMessage:
        typeof details.recovery === "string" && details.recovery
          ? details.recovery
          : error instanceof Error && error.message
            ? error.message
            : "Token launch failed.",
    },
  };

  return {
    message: buildLaunchAssistantMessage(action),
    actions: [action],
    backendWalletAddress:
      typeof agentService?.getBackendWalletAddress === "function"
        ? agentService.getBackendWalletAddress()
        : undefined,
    network: network || null,
    model: null,
  };
}

function resolveAssistantMessage(agentResult) {
  const launchAction = getLatestLaunchAction(agentResult?.actions);
  if (!launchAction) {
    return agentResult?.message || "Done.";
  }
  return buildLaunchAssistantMessage(launchAction, agentResult?.message);
}

function createApp({
  tokenRegistryService,
  launchOrchestrator,
  eventIndexerService,
  chatHistoryService,
  agentService,
  twitterBotRegistryService,
  twitterBotService,
  envStatus,
  logger,
}) {
  const app = express();
  const appLogger = logger || createNoopLogger();

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    const startedAt = Date.now();
    runWithRequestContext({ requestId }, () => {
      appLogger.info({
        operation: "http.request",
        stage: "start",
        status: "start",
        requestId,
        context: {
          method: req.method,
          path: req.originalUrl,
          query: req.query,
        },
      });

      res.on("finish", () => {
        appLogger.info({
          operation: "http.request",
          stage: "finish",
          status: res.statusCode >= 500 ? "failure" : "success",
          requestId,
          durationMs: Date.now() - startedAt,
          context: {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
          },
        });
      });

      next();
    });
  });

  app.use(express.json());

  app.get("/health", (_req, res) => {
    appLogger.info({
      operation: "api.health",
      stage: "success",
      status: "success",
      context: {
        envStatus,
      },
    });
    res.json({
      status: "ok",
      env: {
        rpcUrlConfigured: envStatus?.rpcUrlConfigured ?? false,
        rpcWriteUrlConfigured: envStatus?.rpcWriteUrlConfigured ?? false,
        backendPrivateKeyConfigured:
          envStatus?.backendPrivateKeyConfigured ?? false,
        convexUrlConfigured: envStatus?.convexUrlConfigured ?? false,
        launchpadAddressConfigured: envStatus?.launchpadAddressConfigured ?? false,
        eventHubAddressConfigured: envStatus?.eventHubAddressConfigured ?? false,
        quoteTokenAddressConfigured: envStatus?.quoteTokenAddressConfigured ?? false,
        twitterBotEnabled: envStatus?.twitterBotEnabled ?? false,
        twitterBotTargetHandleConfigured:
          envStatus?.twitterBotTargetHandleConfigured ?? false,
        twitter241ApiKeyConfigured: envStatus?.twitter241ApiKeyConfigured ?? false,
        twitter241ApiHostConfigured: envStatus?.twitter241ApiHostConfigured ?? false,
      },
    });
  });

  app.get("/api/twitter-bot/me", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.twitterBot.me";

    if (
      !twitterBotRegistryService ||
      typeof twitterBotRegistryService.getConfigByWallet !== "function" ||
      typeof twitterBotRegistryService.listEventsByWallet !== "function"
    ) {
      const error = new HttpError(
        "Twitter bot service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const payload = normalizeTwitterBotGetRequest(req.query);
      const [config, events] = await Promise.all([
        twitterBotRegistryService.getConfigByWallet(payload.walletAddress),
        twitterBotRegistryService.listEventsByWallet(payload.walletAddress, 20),
      ]);

      return res.json({
        walletAddress: payload.walletAddress,
        targetHandle: twitterBotService?.getTargetHandle?.() || "",
        pollMs: twitterBotService?.getPollMs?.() || null,
        config,
        events,
        requestId: req.requestId,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          query: sanitizeForLogging(req.query),
        },
      });
      return next(error);
    }
  });

  app.put("/api/twitter-bot/me", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.twitterBot.me.upsert";

    if (
      !twitterBotRegistryService ||
      typeof twitterBotRegistryService.upsertConfig !== "function" ||
      typeof twitterBotRegistryService.getConfigByWallet !== "function" ||
      typeof twitterBotRegistryService.listEventsByWallet !== "function"
    ) {
      const error = new HttpError(
        "Twitter bot service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const payload = normalizeTwitterBotUpsertRequest(req.body);
      await twitterBotRegistryService.upsertConfig(payload);
      const [config, events] = await Promise.all([
        twitterBotRegistryService.getConfigByWallet(payload.walletAddress),
        twitterBotRegistryService.listEventsByWallet(payload.walletAddress, 20),
      ]);

      return res.json({
        walletAddress: payload.walletAddress,
        targetHandle: twitterBotService?.getTargetHandle?.() || "",
        pollMs: twitterBotService?.getPollMs?.() || null,
        config,
        events,
        requestId: req.requestId,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          payload: sanitizeForLogging(req.body),
        },
      });
      return next(error);
    }
  });

  app.get("/api/twitter-bot/events/:walletAddress", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.twitterBot.events";

    if (
      !twitterBotRegistryService ||
      typeof twitterBotRegistryService.listEventsByWallet !== "function" ||
      typeof twitterBotRegistryService.normalizeWallet !== "function"
    ) {
      const error = new HttpError(
        "Twitter bot service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const walletAddress = twitterBotRegistryService.normalizeWallet(
        req.params.walletAddress
      );
      const events = await twitterBotRegistryService.listEventsByWallet(walletAddress, 50);
      return res.json({
        walletAddress,
        targetHandle: twitterBotService?.getTargetHandle?.() || "",
        pollMs: twitterBotService?.getPollMs?.() || null,
        count: events.length,
        events,
        requestId: req.requestId,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          walletAddress: req.params.walletAddress,
        },
      });
      return next(error);
    }
  });

  async function handleTokenLaunch(req, res, next, routeOperation) {
    const startedAt = Date.now();
    appLogger.info({
      operation: routeOperation,
      stage: "start",
      status: "start",
      requestId: req.requestId,
      context: {
        payload: sanitizeForLogging(req.body),
      },
    });

    try {
      appLogger.info({
        operation: routeOperation,
        stage: "validate.request",
        status: "start",
      });
      const { name, symbol, creatorAddress } = normalizeLaunchRequest(req.body);

      appLogger.info({
        operation: routeOperation,
        stage: "validate.request",
        status: "success",
        context: {
          tokenName: name,
          tokenSymbol: symbol,
          creatorAddress,
        },
      });

      appLogger.info({
        operation: routeOperation,
        stage: "launch.onchain",
        status: "start",
      });
      const orchestrated = await launchOrchestrator.deployAndPersistLaunch({
        name,
        symbol,
        creatorAddress,
      });
      const deployed = orchestrated.deployed;
      const launchRecordId = orchestrated.launchRecordId;
      const launchStatus = orchestrated.launchStatus || "completed";

      appLogger.info({
        operation: routeOperation,
        stage: "launch.onchain",
        status: "success",
        context: {
          tokenAddress: deployed.tokenAddress,
          poolAddress: deployed.poolAddress,
          network: deployed.network,
          transactions: deployed.transactions,
        },
      });

      if (
        eventIndexerService &&
        typeof eventIndexerService.syncOnce === "function"
      ) {
        appLogger.info({
          operation: routeOperation,
          stage: "indexer.sync",
          status: "start",
        });
        await eventIndexerService.syncOnce();
        appLogger.info({
          operation: routeOperation,
          stage: "indexer.sync",
          status: "success",
          context: {
            tokenAddress: deployed.tokenAddress,
          },
        });
      }

      res.status(201).json({
        ...deployed,
        launchRecordId,
        launchStatus,
      });
      appLogger.info({
        operation: routeOperation,
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          launchRecordId,
          launchStatus,
          tokenAddress: deployed.tokenAddress,
          creatorAddress: deployed.ownerAddress,
        },
      });
      return undefined;
    } catch (error) {
      attachErrorContext(error, {
        operation: routeOperation,
        stage: "handler",
      });
      appLogger.error({
        operation: routeOperation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          payload: sanitizeForLogging(req.body),
        },
      });
      return next(error);
    }
  }

  app.post("/api/tokens/launch", async (req, res, next) => {
    return handleTokenLaunch(req, res, next, "api.tokens.launch");
  });

  app.post("/api/tokens/deploy", async (req, res, next) => {
    return handleTokenLaunch(req, res, next, "api.tokens.deploy");
  });

  app.get("/api/tokens/launched", async (req, res, next) => {
    const startedAt = Date.now();
    appLogger.info({
      operation: "api.tokens.launched.list",
      stage: "start",
      status: "start",
      requestId: req.requestId,
    });
    try {
      const tokens = await tokenRegistryService.listAllTokenLaunches();
      res.json({
        count: tokens.length,
        tokens,
      });
      appLogger.info({
        operation: "api.tokens.launched.list",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: { count: tokens.length },
      });
    } catch (error) {
      attachErrorContext(error, {
        operation: "api.tokens.launched.list",
        stage: "handler",
      });
      appLogger.error({
        operation: "api.tokens.launched.list",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
      });
      next(error);
    }
  });

  app.get("/api/tokens/by-owner/:ownerAddress", async (req, res, next) => {
    const startedAt = Date.now();
    appLogger.info({
      operation: "api.tokens.owner.list",
      stage: "start",
      status: "start",
      requestId: req.requestId,
      context: {
        ownerAddress: req.params.ownerAddress,
      },
    });
    try {
      const tokens = await tokenRegistryService.listTokenLaunchesByOwner(
        req.params.ownerAddress
      );
      res.json({
        ownerAddress: req.params.ownerAddress,
        count: tokens.length,
        tokens,
      });
      appLogger.info({
        operation: "api.tokens.owner.list",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          ownerAddress: req.params.ownerAddress,
          count: tokens.length,
        },
      });
    } catch (error) {
      attachErrorContext(error, {
        operation: "api.tokens.owner.list",
        stage: "handler",
      });
      appLogger.error({
        operation: "api.tokens.owner.list",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          ownerAddress: req.params.ownerAddress,
        },
      });
      next(error);
    }
  });

  app.get("/api/tokens/:tokenAddress/events", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.tokens.events.list";

    try {
      const tokenAddress = normalizeTokenAddress(req.params.tokenAddress);
      const limit = Number(req.query.limit || 100);
      const events = await tokenRegistryService.listTokenEvents(tokenAddress, limit);
      return res.json({
        tokenAddress,
        count: events.length,
        events,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          tokenAddress: req.params.tokenAddress,
          query: sanitizeForLogging(req.query),
        },
      });
      return next(error);
    }
  });

  app.get("/api/tokens/:tokenAddress/candles", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.tokens.candles.list";

    try {
      const tokenAddress = normalizeTokenAddress(req.params.tokenAddress);
      const interval = normalizeCandleInterval(req.query.interval || "1h");
      const candles = await tokenRegistryService.listTokenCandles(tokenAddress, interval);
      return res.json({
        tokenAddress,
        interval,
        count: candles.length,
        candles,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          tokenAddress: req.params.tokenAddress,
          query: sanitizeForLogging(req.query),
        },
      });
      return next(error);
    }
  });

  app.get("/api/tokens/:tokenAddress", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.tokens.detail";

    try {
      const tokenAddress = normalizeTokenAddress(req.params.tokenAddress);
      const token = await tokenRegistryService.getTokenLaunchByAddress(tokenAddress);
      if (!token) {
        throw new HttpError("Token launch not found", 404, "NOT_FOUND", {
          tokenAddress,
        });
      }
      return res.json({
        token,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          tokenAddress: req.params.tokenAddress,
        },
      });
      return next(error);
    }
  });

  app.post("/api/agent/chat", async (req, res, next) => {
    const startedAt = Date.now();
    appLogger.info({
      operation: "api.agent.chat",
      stage: "start",
      status: "start",
      requestId: req.requestId,
      context: {
        payload: sanitizeForLogging(req.body),
      },
    });

    if (!agentService || typeof agentService.chat !== "function") {
      const error = new HttpError(
        "Agent service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = "api.agent.chat";
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const payload = normalizeAgentChatRequest(req.body);
      const result = await agentService.chat(payload);

      appLogger.info({
        operation: "api.agent.chat",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          walletAddress: payload.walletAddress,
          chainId: payload.chainId,
          actionCount: result.actions?.length || 0,
        },
      });

      res.json({
        ...result,
        requestId: req.requestId,
      });
    } catch (error) {
      attachErrorContext(error, {
        operation: "api.agent.chat",
        stage: "handler",
      });
      appLogger.error({
        operation: "api.agent.chat",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          payload: sanitizeForLogging(req.body),
        },
      });
      next(error);
    }
  });

  app.post("/api/agent/threads", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.agent.threads.create";

    if (!chatHistoryService || typeof chatHistoryService.createThread !== "function") {
      const error = new HttpError(
        "Chat history service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const payload = normalizeChatThreadCreateRequest(req.body);
      const created = await chatHistoryService.createThread(payload);

      appLogger.info({
        operation,
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          walletAddress: payload.walletAddress,
          threadId: created.thread?.id,
        },
      });

      return res.status(201).json({
        ...created,
        requestId: req.requestId,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          payload: sanitizeForLogging(req.body),
        },
      });
      return next(error);
    }
  });

  app.get("/api/agent/threads", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.agent.threads.list";

    if (!chatHistoryService || typeof chatHistoryService.listThreadsByWallet !== "function") {
      const error = new HttpError(
        "Chat history service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const payload = normalizeChatThreadListRequest(req.query);
      const listed = await chatHistoryService.listThreadsByWallet(payload.walletAddress);

      appLogger.info({
        operation,
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          walletAddress: payload.walletAddress,
          count: listed.threads?.length || 0,
        },
      });

      return res.json({
        ...listed,
        count: listed.threads?.length || 0,
        requestId: req.requestId,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          query: sanitizeForLogging(req.query),
        },
      });
      return next(error);
    }
  });

  app.get("/api/agent/threads/:threadId", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.agent.threads.get";

    if (
      !chatHistoryService ||
      typeof chatHistoryService.getThreadWithMessages !== "function"
    ) {
      const error = new HttpError(
        "Chat history service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const payload = normalizeChatThreadGetRequest({
        threadId: req.params.threadId,
        walletAddress: req.query.walletAddress,
      });
      const loaded = await chatHistoryService.getThreadWithMessages(payload);

      appLogger.info({
        operation,
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          threadId: payload.threadId,
          walletAddress: payload.walletAddress,
          messageCount: loaded.messages?.length || 0,
        },
      });

      return res.json({
        ...loaded,
        requestId: req.requestId,
      });
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          threadId: req.params.threadId,
          walletAddress: req.query.walletAddress,
        },
      });
      return next(error);
    }
  });

  app.post("/api/agent/threads/:threadId/reply", async (req, res, next) => {
    const startedAt = Date.now();
    const operation = "api.agent.threads.reply";

    if (!agentService || typeof agentService.chat !== "function") {
      const error = new HttpError(
        "Agent service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }
    if (
      !chatHistoryService ||
      typeof chatHistoryService.getThreadWithMessages !== "function" ||
      typeof chatHistoryService.appendMessage !== "function"
    ) {
      const error = new HttpError(
        "Chat history service is not configured",
        500,
        "SERVER_MISCONFIGURATION"
      );
      error.operation = operation;
      error.stage = "service.unavailable";
      return next(error);
    }

    try {
      const payload = normalizeChatThreadReplyRequest({
        threadId: req.params.threadId,
        ...req.body,
      });

      const savedUser = await chatHistoryService.appendMessage({
        threadId: payload.threadId,
        walletAddress: payload.walletAddress,
        role: "user",
        content: payload.content,
        actions: [],
        requestId: req.requestId,
      });

      const threadData = await chatHistoryService.getThreadWithMessages({
        threadId: payload.threadId,
        walletAddress: payload.walletAddress,
      });
      const history = (threadData.messages || []).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const network = await agentService.getNetworkInfo();
      let agentResult;
      try {
        agentResult = await agentService.chat({
          messages: history,
          walletAddress: payload.walletAddress,
          chainId: network.chainId,
        });
      } catch (error) {
        if (!isLaunchToolFailure(error)) {
          throw error;
        }
        agentResult = buildLaunchFailureAgentResult(error, network, agentService);
      }

      const assistantMessage = resolveAssistantMessage(agentResult);

      const savedAssistant = await chatHistoryService.appendMessage({
        threadId: payload.threadId,
        walletAddress: payload.walletAddress,
        role: "assistant",
        content: assistantMessage,
        actions: agentResult.actions || [],
        requestId: req.requestId,
      });

      const completePayload = {
        thread: savedAssistant.thread,
        userMessage: savedUser.message,
        message: savedAssistant.message,
        actions: savedAssistant.message.actions || [],
        backendWalletAddress: agentResult.backendWalletAddress,
        network: agentResult.network,
        model: agentResult.model,
        requestId: req.requestId,
      };

      if (!payload.stream) {
        appLogger.info({
          operation,
          stage: "success",
          status: "success",
          durationMs: Date.now() - startedAt,
          context: {
            threadId: payload.threadId,
            walletAddress: payload.walletAddress,
            userMessageId: savedUser.message?.id,
            assistantMessageId: savedAssistant.message?.id,
            actionCount: savedAssistant.message?.actions?.length || 0,
          },
        });

        return res.json(completePayload);
      }

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const writeSse = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      for (const delta of chunkText(savedAssistant.message.content || "", 36)) {
        writeSse("assistant.delta", {
          threadId: payload.threadId,
          messageId: savedAssistant.message.id,
          delta,
        });
      }

      writeSse("assistant.complete", completePayload);
      writeSse("done", {
        requestId: req.requestId,
        threadId: payload.threadId,
        messageId: savedAssistant.message.id,
      });
      res.end();

      appLogger.info({
        operation,
        stage: "success.stream",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          threadId: payload.threadId,
          walletAddress: payload.walletAddress,
          userMessageId: savedUser.message?.id,
          assistantMessageId: savedAssistant.message?.id,
        },
      });
      return undefined;
    } catch (error) {
      attachErrorContext(error, { operation, stage: "handler" });
      appLogger.error({
        operation,
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error,
        context: {
          threadId: req.params.threadId,
          payload: sanitizeForLogging(req.body),
        },
      });
      return next(error);
    }
  });

  app.use((error, req, res, _next) => {
    const requestId = req.requestId;
    const operation = error?.operation || "http.error";
    const stage = error?.stage || "handler";

    if (error instanceof HttpError) {
      appLogger.error({
        operation,
        stage,
        status: "failure",
        requestId,
        error,
        context: {
          method: req.method,
          path: req.originalUrl,
          statusCode: error.statusCode,
        },
      });

      const payload = {
        error: error.code,
        message: error.message,
        requestId,
        operation,
        stage,
        diagnostics: {
          requestId,
          operation,
          stage,
          details: sanitizeForLogging(error.details),
          error: serializeError(error),
        },
      };
      if (error.details) {
        Object.assign(payload, error.details);
      }
      return res.status(error.statusCode).json(payload);
    }

    appLogger.error({
      operation,
      stage,
      status: "failure",
      requestId,
      error,
      context: {
        method: req.method,
        path: req.originalUrl,
      },
    });

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
      requestId,
      operation,
      stage,
      diagnostics: {
        requestId,
        operation,
        stage,
        error: serializeError(error),
      },
    });
  });

  return app;
}

module.exports = {
  createApp,
};
