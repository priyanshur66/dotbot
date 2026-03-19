const { ConvexHttpClient } = require("convex/browser");
const { getAddress } = require("ethers");
const { ConfigError, DataStoreError, ValidationError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

function normalizeRecord(record) {
  return {
    id: String(record._id),
    tokenAddress: record.tokenAddress,
    tokenName: record.tokenName,
    tokenSymbol: record.tokenSymbol,
    ownerAddress: record.ownerAddress,
    launchedByAddress: record.launchedByAddress,
    chainId: record.chainId,
    networkName: record.networkName,
    totalSupply: record.totalSupply,
    decimals: record.decimals,
    launchStatus: record.launchStatus,
    deployTxHash: record.deployTxHash,
    tokenTransferTxHash: record.tokenTransferTxHash,
    ownershipTransferTxHash: record.ownershipTransferTxHash,
    createdAt: record.createdAt,
  };
}

function createTokenRegistryService({ convexUrl, convexClient, logger }) {
  const serviceLogger = logger || createNoopLogger();

  if (!convexUrl) {
    serviceLogger.error({
      operation: "service.registry.create",
      stage: "validate.config",
      status: "failure",
      context: {
        missing: "convexUrl",
      },
    });
    throw new ConfigError("CONVEX_URL is required for token registry service");
  }

  const client = convexClient || new ConvexHttpClient(convexUrl);

  async function createLaunchRecord(payload) {
    const startedAt = Date.now();
    serviceLogger.info({
      operation: "service.registry.createLaunchRecord",
      stage: "start",
      status: "start",
      context: {
        tokenAddress: payload.tokenAddress,
        ownerAddress: payload.ownerAddress,
        launchedByAddress: payload.launchedByAddress,
      },
    });
    try {
      const ownerAddress = getAddress(payload.ownerAddress);
      const tokenAddress = getAddress(payload.tokenAddress);
      const launchedByAddress = getAddress(payload.launchedByAddress);

      const createdId = await client.mutation("tokenLaunches:createLaunchRecord", {
        tokenAddress,
        tokenName: payload.tokenName,
        tokenSymbol: payload.tokenSymbol,
        ownerAddress,
        launchedByAddress,
        chainId: payload.chainId,
        networkName: payload.networkName,
        totalSupply: payload.totalSupply,
        decimals: payload.decimals,
        launchStatus: payload.launchStatus || "completed",
        deployTxHash: payload.deployTxHash || null,
        tokenTransferTxHash: payload.tokenTransferTxHash || null,
        ownershipTransferTxHash: payload.ownershipTransferTxHash || null,
      });

      serviceLogger.info({
        operation: "service.registry.createLaunchRecord",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          id: String(createdId),
          tokenAddress,
          ownerAddress,
        },
      });
      return { id: String(createdId) };
    } catch (error) {
      const wrappedError = new DataStoreError(
        "Token deployed but failed to persist launch metadata in Convex",
        {
          stage: "createLaunchRecord",
          tokenAddress: payload.tokenAddress,
          ownerAddress: payload.ownerAddress,
          launchedByAddress: payload.launchedByAddress,
        },
        error
      );
      wrappedError.operation = "service.registry.createLaunchRecord";
      wrappedError.stage = "failure";
      serviceLogger.error({
        operation: "service.registry.createLaunchRecord",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error: wrappedError,
      });
      throw wrappedError;
    }
  }

  async function listAllTokenLaunches() {
    const startedAt = Date.now();
    serviceLogger.info({
      operation: "service.registry.listAllTokenLaunches",
      stage: "start",
      status: "start",
    });
    try {
      const rows = await client.query("tokenLaunches:listTokenLaunches", {});
      const normalized = rows.map(normalizeRecord);
      serviceLogger.info({
        operation: "service.registry.listAllTokenLaunches",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          count: normalized.length,
        },
      });
      return normalized;
    } catch (error) {
      const wrappedError = new DataStoreError(
        "Failed to fetch launched tokens from Convex",
        undefined,
        error
      );
      wrappedError.operation = "service.registry.listAllTokenLaunches";
      wrappedError.stage = "failure";
      serviceLogger.error({
        operation: "service.registry.listAllTokenLaunches",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error: wrappedError,
      });
      throw wrappedError;
    }
  }

  async function listTokenLaunchesByOwner(ownerAddressRaw) {
    const startedAt = Date.now();
    serviceLogger.info({
      operation: "service.registry.listTokenLaunchesByOwner",
      stage: "start",
      status: "start",
      context: {
        ownerAddress: ownerAddressRaw,
      },
    });
    let ownerAddress;
    try {
      ownerAddress = getAddress(ownerAddressRaw);
    } catch (_error) {
      serviceLogger.warn({
        operation: "service.registry.listTokenLaunchesByOwner",
        stage: "validate.ownerAddress",
        status: "failure",
        durationMs: Date.now() - startedAt,
        context: {
          ownerAddress: ownerAddressRaw,
        },
      });
      throw new ValidationError("`ownerAddress` is not a valid Ethereum address");
    }

    try {
      const rows = await client.query("tokenLaunches:listTokenLaunchesByOwner", {
        ownerAddress,
      });
      const normalized = rows.map(normalizeRecord);
      serviceLogger.info({
        operation: "service.registry.listTokenLaunchesByOwner",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          ownerAddress,
          count: normalized.length,
        },
      });
      return normalized;
    } catch (error) {
      const wrappedError = new DataStoreError(
        "Failed to fetch launched tokens by owner from Convex",
        { stage: "listTokenLaunchesByOwner", ownerAddress },
        error
      );
      wrappedError.operation = "service.registry.listTokenLaunchesByOwner";
      wrappedError.stage = "failure";
      serviceLogger.error({
        operation: "service.registry.listTokenLaunchesByOwner",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error: wrappedError,
      });
      throw wrappedError;
    }
  }

  return {
    createLaunchRecord,
    listAllTokenLaunches,
    listTokenLaunchesByOwner,
  };
}

module.exports = {
  createTokenRegistryService,
};
