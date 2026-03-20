const { ConvexHttpClient } = require("convex/browser");
const { getAddress } = require("ethers");
const { ConfigError, DataStoreError, ValidationError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

function optionalAddress(value) {
  if (!value) {
    return null;
  }
  return getAddress(value);
}

function normalizeStats(record) {
  if (!record?.stats) {
    return null;
  }

  return {
    latestPrice: record.stats.latestPrice,
    liquidityQuote: record.stats.liquidityQuote,
    reserveToken: record.stats.reserveToken,
    reserveQuote: record.stats.reserveQuote,
    totalVolumeQuote: record.stats.totalVolumeQuote,
    volume24hQuote: record.stats.volume24hQuote,
    lastTradeAt: record.stats.lastTradeAt,
    tradeCount: record.stats.tradeCount,
    updatedAt: record.stats.updatedAt,
  };
}

function normalizeLaunchRecord(record) {
  if (!record) {
    return null;
  }

  return {
    id: String(record._id || record.id),
    tokenAddress: record.tokenAddress,
    tokenName: record.tokenName,
    tokenSymbol: record.tokenSymbol,
    creatorAddress: record.creatorAddress || record.ownerAddress,
    ownerAddress: record.ownerAddress || record.creatorAddress,
    launchedByAddress: record.launchedByAddress,
    chainId: record.chainId,
    networkName: record.networkName,
    totalSupply: record.totalSupply,
    decimals: record.decimals,
    launchStatus: record.launchStatus,
    deployTxHash: record.deployTxHash,
    tokenTransferTxHash: record.tokenTransferTxHash,
    ownershipTransferTxHash: record.ownershipTransferTxHash,
    poolAddress: record.poolAddress || null,
    quoteTokenAddress: record.quoteTokenAddress || null,
    eventHubAddress: record.eventHubAddress || null,
    creatorAllocation: record.creatorAllocation || null,
    poolTokenAllocation: record.poolTokenAllocation || null,
    poolUsdtAllocation: record.poolUsdtAllocation || null,
    initialPrice: record.initialPrice || null,
    launchTxHash: record.launchTxHash || null,
    swapFeeBps: typeof record.swapFeeBps === "number" ? record.swapFeeBps : null,
    creatorFeeShareBps:
      typeof record.creatorFeeShareBps === "number" ? record.creatorFeeShareBps : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    stats: normalizeStats(record),
  };
}

function normalizePoolEvent(record) {
  return {
    id: String(record._id || `${record.txHash}:${record.logIndex}`),
    chainId: record.chainId,
    tokenAddress: record.tokenAddress,
    poolAddress: record.poolAddress,
    eventType: record.eventType,
    txHash: record.txHash,
    logIndex: record.logIndex,
    blockNumber: record.blockNumber,
    blockTimestamp: record.blockTimestamp,
    trader: record.trader || null,
    side: record.side || null,
    feeAsset: record.feeAsset || null,
    amountIn: record.amountIn || null,
    amountOut: record.amountOut || null,
    feeAmount: record.feeAmount || null,
    creatorFeeAmount: record.creatorFeeAmount || null,
    protocolFeeAmount: record.protocolFeeAmount || null,
    creatorFeesTotal: record.creatorFeesTotal || null,
    protocolFeesTotal: record.protocolFeesTotal || null,
    priceQuoteE18: record.priceQuoteE18 || null,
    reserveTokenAfter: record.reserveTokenAfter || null,
    reserveUsdtAfter: record.reserveUsdtAfter || null,
    dataJson: record.dataJson,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeCandle(record) {
  return {
    bucketStart: record.bucketStart,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volumeToken: record.volumeToken,
    volumeQuote: record.volumeQuote,
    tradeCount: record.tradeCount,
    updatedAt: record.updatedAt,
  };
}

function normalizeAddress(value, fieldName) {
  try {
    return getAddress(value);
  } catch (_error) {
    throw new ValidationError(`\`${fieldName}\` is not a valid Ethereum address`);
  }
}

function wrapDataStoreError(message, details, error) {
  return new DataStoreError(message, details, error);
}

function createTokenRegistryService({ convexUrl, convexClient, logger }) {
  const serviceLogger = logger || createNoopLogger();

  if (!convexUrl) {
    throw new ConfigError("CONVEX_URL is required for token registry service");
  }

  const client = convexClient || new ConvexHttpClient(convexUrl);

  async function upsertLaunchRecord(payload) {
    try {
      const creatorAddress = normalizeAddress(
        payload.creatorAddress || payload.ownerAddress,
        "creatorAddress"
      );
      const ownerAddress = normalizeAddress(
        payload.ownerAddress || payload.creatorAddress,
        "ownerAddress"
      );
      const tokenAddress = normalizeAddress(payload.tokenAddress, "tokenAddress");
      const launchedByAddress = normalizeAddress(
        payload.launchedByAddress,
        "launchedByAddress"
      );

      const createdId = await client.mutation("tokenLaunches:upsertLaunchRecord", {
        tokenAddress,
        tokenName: payload.tokenName,
        tokenSymbol: payload.tokenSymbol,
        creatorAddress,
        ownerAddress,
        launchedByAddress,
        chainId: payload.chainId,
        networkName: payload.networkName,
        totalSupply: String(payload.totalSupply),
        decimals: payload.decimals,
        launchStatus: payload.launchStatus || "completed",
        deployTxHash: payload.deployTxHash || null,
        tokenTransferTxHash: payload.tokenTransferTxHash || null,
        ownershipTransferTxHash: payload.ownershipTransferTxHash || null,
        poolAddress: optionalAddress(payload.poolAddress),
        quoteTokenAddress: optionalAddress(payload.quoteTokenAddress),
        eventHubAddress: optionalAddress(payload.eventHubAddress),
        creatorAllocation: payload.creatorAllocation ? String(payload.creatorAllocation) : null,
        poolTokenAllocation: payload.poolTokenAllocation ? String(payload.poolTokenAllocation) : null,
        poolUsdtAllocation: payload.poolUsdtAllocation ? String(payload.poolUsdtAllocation) : null,
        initialPrice: payload.initialPrice ? String(payload.initialPrice) : null,
        launchTxHash: payload.launchTxHash || null,
        swapFeeBps: Number.isFinite(payload.swapFeeBps) ? payload.swapFeeBps : null,
        creatorFeeShareBps: Number.isFinite(payload.creatorFeeShareBps)
          ? payload.creatorFeeShareBps
          : null,
      });

      return { id: String(createdId) };
    } catch (error) {
      serviceLogger.error({
        operation: "service.registry.upsertLaunchRecord",
        stage: "failure",
        status: "failure",
        error,
      });
      throw wrapDataStoreError(
        "Failed to persist launch metadata in Convex",
        {
          tokenAddress: payload.tokenAddress,
          creatorAddress: payload.creatorAddress || payload.ownerAddress,
        },
        error
      );
    }
  }

  async function createLaunchRecord(payload) {
    return upsertLaunchRecord(payload);
  }

  async function listAllTokenLaunches() {
    try {
      const rows = await client.query("tokenLaunches:listTokenLaunches", {});
      return rows.map(normalizeLaunchRecord);
    } catch (error) {
      throw wrapDataStoreError("Failed to fetch launched tokens from Convex", undefined, error);
    }
  }

  async function listTokenLaunchesByOwner(ownerAddressRaw) {
    const ownerAddress = normalizeAddress(ownerAddressRaw, "ownerAddress");
    try {
      const rows = await client.query("tokenLaunches:listTokenLaunchesByOwner", {
        ownerAddress,
      });
      return rows.map(normalizeLaunchRecord);
    } catch (error) {
      throw wrapDataStoreError(
        "Failed to fetch launched tokens by owner from Convex",
        { ownerAddress },
        error
      );
    }
  }

  async function getTokenLaunchByAddress(tokenAddressRaw) {
    const tokenAddress = normalizeAddress(tokenAddressRaw, "tokenAddress");
    try {
      const record = await client.query("tokenLaunches:getTokenLaunchByAddress", {
        tokenAddress,
      });
      return normalizeLaunchRecord(record);
    } catch (error) {
      throw wrapDataStoreError(
        "Failed to fetch token launch details from Convex",
        { tokenAddress },
        error
      );
    }
  }

  async function upsertPoolEvents(events) {
    try {
      const payload = events.map((event) => ({
        chainId: event.chainId,
        tokenAddress: normalizeAddress(event.tokenAddress, "tokenAddress"),
        poolAddress: normalizeAddress(event.poolAddress, "poolAddress"),
        eventType: event.eventType,
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        blockTimestamp: event.blockTimestamp,
        trader: event.trader ? normalizeAddress(event.trader, "trader") : null,
        side: event.side || null,
        feeAsset: event.feeAsset ? normalizeAddress(event.feeAsset, "feeAsset") : null,
        amountIn: event.amountIn ? String(event.amountIn) : null,
        amountOut: event.amountOut ? String(event.amountOut) : null,
        feeAmount: event.feeAmount ? String(event.feeAmount) : null,
        creatorFeeAmount: event.creatorFeeAmount ? String(event.creatorFeeAmount) : null,
        protocolFeeAmount: event.protocolFeeAmount ? String(event.protocolFeeAmount) : null,
        creatorFeesTotal: event.creatorFeesTotal ? String(event.creatorFeesTotal) : null,
        protocolFeesTotal: event.protocolFeesTotal ? String(event.protocolFeesTotal) : null,
        priceQuoteE18: event.priceQuoteE18 ? String(event.priceQuoteE18) : null,
        reserveTokenAfter: event.reserveTokenAfter ? String(event.reserveTokenAfter) : null,
        reserveUsdtAfter: event.reserveUsdtAfter ? String(event.reserveUsdtAfter) : null,
        dataJson: JSON.stringify(event.data || {}),
      }));
      return client.mutation("tokenLaunches:upsertPoolEvents", { events: payload });
    } catch (error) {
      throw wrapDataStoreError("Failed to store pool events in Convex", undefined, error);
    }
  }

  async function listTokenEvents(tokenAddressRaw, limit = 100) {
    const tokenAddress = normalizeAddress(tokenAddressRaw, "tokenAddress");
    try {
      const rows = await client.query("tokenLaunches:listPoolEventsByToken", {
        tokenAddress,
        limit,
      });
      return rows.map(normalizePoolEvent);
    } catch (error) {
      throw wrapDataStoreError("Failed to fetch token events from Convex", { tokenAddress }, error);
    }
  }

  async function listAllTokenEvents(tokenAddressRaw) {
    const tokenAddress = normalizeAddress(tokenAddressRaw, "tokenAddress");
    try {
      const rows = await client.query("tokenLaunches:listAllPoolEventsByToken", {
        tokenAddress,
      });
      return rows.map(normalizePoolEvent);
    } catch (error) {
      throw wrapDataStoreError(
        "Failed to fetch all token events from Convex",
        { tokenAddress },
        error
      );
    }
  }

  async function upsertTokenCandles(tokenAddressRaw, interval, candles) {
    const tokenAddress = normalizeAddress(tokenAddressRaw, "tokenAddress");
    try {
      return client.mutation("tokenLaunches:upsertTokenCandles", {
        tokenAddress,
        interval,
        candles: candles.map((candle) => ({
          bucketStart: candle.bucketStart,
          open: String(candle.open),
          high: String(candle.high),
          low: String(candle.low),
          close: String(candle.close),
          volumeToken: String(candle.volumeToken),
          volumeQuote: String(candle.volumeQuote),
          tradeCount: candle.tradeCount,
        })),
      });
    } catch (error) {
      throw wrapDataStoreError("Failed to persist token candles in Convex", { tokenAddress }, error);
    }
  }

  async function listTokenCandles(tokenAddressRaw, interval) {
    const tokenAddress = normalizeAddress(tokenAddressRaw, "tokenAddress");
    try {
      const rows = await client.query("tokenLaunches:listTokenCandles", {
        tokenAddress,
        interval,
      });
      return rows.map(normalizeCandle);
    } catch (error) {
      throw wrapDataStoreError("Failed to fetch token candles from Convex", { tokenAddress }, error);
    }
  }

  async function upsertTokenStats(stats) {
    try {
      const tokenAddress = normalizeAddress(stats.tokenAddress, "tokenAddress");
      return client.mutation("tokenLaunches:upsertTokenStats", {
        tokenAddress,
        latestPrice: String(stats.latestPrice),
        liquidityQuote: String(stats.liquidityQuote),
        reserveToken: String(stats.reserveToken),
        reserveQuote: String(stats.reserveQuote),
        totalVolumeQuote: String(stats.totalVolumeQuote),
        volume24hQuote: String(stats.volume24hQuote),
        lastTradeAt: stats.lastTradeAt ?? null,
        tradeCount: Number(stats.tradeCount || 0),
      });
    } catch (error) {
      throw wrapDataStoreError("Failed to persist token stats in Convex", stats, error);
    }
  }

  async function getIndexerState(key) {
    try {
      return client.query("tokenLaunches:getIndexerState", { key });
    } catch (error) {
      throw wrapDataStoreError("Failed to fetch indexer state from Convex", { key }, error);
    }
  }

  async function setIndexerState(key, lastSyncedBlock) {
    try {
      return client.mutation("tokenLaunches:setIndexerState", {
        key,
        lastSyncedBlock,
      });
    } catch (error) {
      throw wrapDataStoreError(
        "Failed to persist indexer state in Convex",
        { key, lastSyncedBlock },
        error
      );
    }
  }

  return {
    createLaunchRecord,
    upsertLaunchRecord,
    listAllTokenLaunches,
    listTokenLaunchesByOwner,
    getTokenLaunchByAddress,
    upsertPoolEvents,
    listTokenEvents,
    listAllTokenEvents,
    upsertTokenCandles,
    listTokenCandles,
    upsertTokenStats,
    getIndexerState,
    setIndexerState,
  };
}

module.exports = {
  createTokenRegistryService,
};
