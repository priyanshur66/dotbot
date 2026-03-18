const express = require("express");
const { HttpError } = require("./lib/errors");
const { normalizeDeployRequest } = require("./utils/requestValidation");

function createApp({ deploymentService, envStatus }) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      env: {
        rpcUrlConfigured: envStatus?.rpcUrlConfigured ?? false,
        backendPrivateKeyConfigured:
          envStatus?.backendPrivateKeyConfigured ?? false,
      },
    });
  });

  app.post("/api/tokens/deploy", async (req, res, next) => {
    try {
      const { name, symbol, finalOwnerAddress } = normalizeDeployRequest(req.body);
      const result = await deploymentService.deployToken({
        name,
        symbol,
        finalOwnerAddress,
      });
      res.status(201).json(result);
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
