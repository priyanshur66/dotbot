const express = require("express");
const { HttpError } = require("./lib/errors");
const { normalizeDeployRequest } = require("./utils/requestValidation");

function createApp({ deploymentService, tokenRegistryService, envStatus }) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      env: {
        rpcUrlConfigured: envStatus?.rpcUrlConfigured ?? false,
        backendPrivateKeyConfigured:
          envStatus?.backendPrivateKeyConfigured ?? false,
        convexUrlConfigured: envStatus?.convexUrlConfigured ?? false,
      },
    });
  });

  app.post("/api/tokens/deploy", async (req, res, next) => {
    try {
      const { name, symbol, finalOwnerAddress } = normalizeDeployRequest(req.body);
      const deployed = await deploymentService.deployToken({
        name,
        symbol,
        finalOwnerAddress,
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

      res.status(201).json({
        ...deployed,
        launchRecordId: launchRecord.id,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tokens/launched", async (_req, res, next) => {
    try {
      const tokens = await tokenRegistryService.listAllTokenLaunches();
      res.json({
        count: tokens.length,
        tokens,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tokens/by-owner/:ownerAddress", async (req, res, next) => {
    try {
      const tokens = await tokenRegistryService.listTokenLaunchesByOwner(
        req.params.ownerAddress
      );
      res.json({
        ownerAddress: req.params.ownerAddress,
        count: tokens.length,
        tokens,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
      const payload = {
        error: error.code,
        message: error.message,
      };
      if (error.details) {
        Object.assign(payload, error.details);
      }
      return res.status(error.statusCode).json(payload);
    }

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
    });
  });

  return app;
}

module.exports = {
  createApp,
};
