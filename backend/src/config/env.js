const { Wallet, isAddress } = require("ethers");
const { ConfigError } = require("../lib/errors");

function getEnvStatus(env = process.env) {
  return {
    rpcUrlConfigured: Boolean(env.RPC_URL),
    backendPrivateKeyConfigured: Boolean(env.BACKEND_PRIVATE_KEY),
  };
}

function validateAndLoadEnv(env = process.env, options = { strict: true }) {
  const status = getEnvStatus(env);

  const errors = [];
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

  if (options.strict && errors.length > 0) {
    throw new ConfigError("Invalid environment configuration", { errors });
  }

  return {
    rpcUrl: env.RPC_URL || "",
    backendPrivateKey: env.BACKEND_PRIVATE_KEY || "",
    port: Number(env.PORT || 3000),
    envStatus: status,
  };
}

module.exports = {
  getEnvStatus,
  validateAndLoadEnv,
};
