const express = require("express");
const { randomUUID } = require("crypto");
const { HttpError } = require("./lib/errors");
const { normalizeDeployRequest } = require("./utils/requestValidation");
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

function createApp({ deploymentService, tokenRegistryService, envStatus, logger }) {
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
      },
    });
  });

  app.post("/api/tokens/deploy", async (req, res, next) => {
    const startedAt = Date.now();
    appLogger.info({
      operation: "api.tokens.deploy",
      stage: "start",
      status: "start",
      requestId: req.requestId,
      context: {
        payload: sanitizeForLogging(req.body),
      },
    });

    try {
      appLogger.info({
        operation: "api.tokens.deploy",
        stage: "validate.request",
        status: "start",
      });
      const { name, symbol, finalOwnerAddress } = normalizeDeployRequest(req.body);

      appLogger.info({
        operation: "api.tokens.deploy",
        stage: "validate.request",
        status: "success",
        context: {
          tokenName: name,
          tokenSymbol: symbol,
          finalOwnerAddress,
        },
      });

      appLogger.info({
        operation: "api.tokens.deploy",
        stage: "deploy.onchain",
        status: "start",
      });
      const deployed = await deploymentService.deployToken({
        name,
        symbol,
        finalOwnerAddress,
      });
      appLogger.info({
        operation: "api.tokens.deploy",
        stage: "deploy.onchain",
        status: "success",
        context: {
          tokenAddress: deployed.tokenAddress,
          network: deployed.network,
          transactions: deployed.transactions,
        },
      });

      appLogger.info({
        operation: "api.tokens.deploy",
        stage: "registry.persist",
        status: "start",
      });
      const launchRecord = await tokenRegistryService.createLaunchRecord({
        tokenAddress: deployed.tokenAddress,
        tokenName: name,
        tokenSymbol: symbol,
        ownerAddress: deployed.ownerAddress,
        launchedByAddress: deployed.launchedByAddress,
        chainId: deployed.network?.chainId,
        networkName: deployed.network?.name,
        totalSupply: deployed.totalSupply,
        decimals: deployed.decimals,
        launchStatus: "completed",
        deployTxHash: deployed.transactions.deploy,
        tokenTransferTxHash: deployed.transactions.tokenTransfer,
        ownershipTransferTxHash: deployed.transactions.ownershipTransfer,
      });
      appLogger.info({
        operation: "api.tokens.deploy",
        stage: "registry.persist",
        status: "success",
        context: {
          launchRecordId: launchRecord.id,
          tokenAddress: deployed.tokenAddress,
        },
      });

      res.status(201).json({
        ...deployed,
        launchRecordId: launchRecord.id,
      });
      appLogger.info({
        operation: "api.tokens.deploy",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          launchRecordId: launchRecord.id,
          tokenAddress: deployed.tokenAddress,
          ownerAddress: deployed.ownerAddress,
        },
      });
    } catch (error) {
      attachErrorContext(error, {
        operation: "api.tokens.deploy",
        stage: "handler",
      });
      appLogger.error({
        operation: "api.tokens.deploy",
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
