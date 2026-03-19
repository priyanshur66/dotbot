const { Wallet, isAddress } = require("ethers");
const { ConfigError } = require("../lib/errors");
const {
  getLogConfigFromEnv,
  sanitizeForLogging,
  createNoopLogger,
} = require("../lib/logging");

function getEnvStatus(env = process.env) {
  return {
    rpcUrlConfigured: Boolean(env.RPC_URL),
    backendPrivateKeyConfigured: Boolean(env.BACKEND_PRIVATE_KEY),
    convexUrlConfigured: Boolean(env.CONVEX_URL),
  };
}

function validateAndLoadEnv(env = process.env, options = { strict: true }) {
  const logger = options.logger || createNoopLogger();
  const status = getEnvStatus(env);
  const logConfig = getLogConfigFromEnv(env);

  const errors = [];
  logger.info({
    operation: "config.env.validate",
    stage: "start",
    status: "start",
    context: {
      strictMode: Boolean(options.strict),
      envStatus: sanitizeForLogging(status),
      logConfig,
    },
  });

  if (!env.RPC_URL) {
    errors.push("RPC_URL is required");
  }
  if (!env.BACKEND_PRIVATE_KEY) {
    errors.push("BACKEND_PRIVATE_KEY is required");
  } else {
    try {
      const wallet = new Wallet(env.BACKEND_PRIVATE_KEY);
      if (!isAddress(wallet.address)) {
        errors.push("BACKEND_PRIVATE_KEY does not resolve to a valid address");
      }
    } catch (_error) {
      errors.push("BACKEND_PRIVATE_KEY is invalid");
    }
  }
  if (!env.CONVEX_URL) {
    errors.push("CONVEX_URL is required");
  }

  if (options.strict && errors.length > 0) {
    logger.error({
      operation: "config.env.validate",
      stage: "failure",
      status: "failure",
      context: {
        errors,
        strictMode: true,
      },
    });
    throw new ConfigError("Invalid environment configuration", { errors });
  }

  logger.info({
    operation: "config.env.validate",
    stage: "success",
    status: "success",
    context: {
      strictMode: Boolean(options.strict),
      envStatus: sanitizeForLogging(status),
      port: Number(env.PORT || 3000),
      logConfig,
      validationErrors: errors,
    },
  });

  return {
    rpcUrl: env.RPC_URL || "",
    backendPrivateKey: env.BACKEND_PRIVATE_KEY || "",
    convexUrl: env.CONVEX_URL || "",
    port: Number(env.PORT || 3000),
    envStatus: status,
    logConfig,
  };
}

module.exports = {
  getEnvStatus,
  validateAndLoadEnv,
};
