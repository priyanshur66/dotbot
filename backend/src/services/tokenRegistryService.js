const { ConvexHttpClient } = require("convex/browser");
const { getAddress } = require("ethers");
const { ConfigError, DataStoreError, ValidationError } = require("../lib/errors");

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

function createTokenRegistryService({ convexUrl, convexClient }) {
  if (!convexUrl) {
    throw new ConfigError("CONVEX_URL is required for token registry service");
  }

  const client = convexClient || new ConvexHttpClient(convexUrl);

  async function createLaunchRecord(payload) {
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

      return { id: String(createdId) };
    } catch (error) {
      throw new DataStoreError(
        "Token deployed but failed to persist launch metadata in Convex",
        {
          tokenAddress: payload.tokenAddress,
          ownerAddress: payload.ownerAddress,
          launchedByAddress: payload.launchedByAddress,
        },
        error
      );
    }
  }

  async function listAllTokenLaunches() {
    try {
      const rows = await client.query("tokenLaunches:listTokenLaunches", {});
      return rows.map(normalizeRecord);
    } catch (error) {
      throw new DataStoreError(
        "Failed to fetch launched tokens from Convex",
        undefined,
        error
      );
    }
  }

  async function listTokenLaunchesByOwner(ownerAddressRaw) {
    let ownerAddress;
    try {
      ownerAddress = getAddress(ownerAddressRaw);
    } catch (_error) {
      throw new ValidationError("`ownerAddress` is not a valid Ethereum address");
    }

    try {
      const rows = await client.query("tokenLaunches:listTokenLaunchesByOwner", {
        ownerAddress,
      });
      return rows.map(normalizeRecord);
    } catch (error) {
      throw new DataStoreError(
        "Failed to fetch launched tokens by owner from Convex",
        { ownerAddress },
        error
      );
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
