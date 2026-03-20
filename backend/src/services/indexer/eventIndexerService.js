const ethers = require("ethers");
const { buildCandles, buildStats } = require("./candleUtils");
const { createNoopLogger } = require("../../lib/logging");

const INDEXER_KEY_PREFIX = "eventHub";
const DEFAULT_POLL_MS = 5_000;
const DEFAULT_BLOCK_CHUNK = 1_000;
const INTERVALS = ["1m", "5m", "1h", "1d"];

function toNumber(value) {
  return Number(value);
}

function createEventIndexerService({
  launchpadDeploymentService,
  tokenRegistryService,
  logger,
}) {
  const serviceLogger = logger || createNoopLogger();
  const pollMs = Number(process.env.EVENT_INDEXER_POLL_MS || DEFAULT_POLL_MS);
  const blockChunk = Number(process.env.EVENT_INDEXER_BLOCK_CHUNK || DEFAULT_BLOCK_CHUNK);

  let timer = null;
  let syncPromise = null;

  async function buildParsedEvents(logs, eventHubAbi, provider, chainId) {
    const iface = new ethers.Interface(eventHubAbi);
    const blockTimestamps = new Map();
    const events = [];

    for (const log of logs) {
      let parsed;
      try {
        parsed = iface.parseLog(log);
      } catch (_error) {
        continue;
      }
      if (!parsed) {
        continue;
      }

      if (!blockTimestamps.has(log.blockNumber)) {
        const block = await provider.getBlock(log.blockNumber);
        blockTimestamps.set(log.blockNumber, Number(block?.timestamp || 0));
      }
      const blockTimestamp = blockTimestamps.get(log.blockNumber) || 0;

      if (parsed.name === "TokenLaunched") {
        events.push({
          chainId,
          tokenAddress: parsed.args.token,
          poolAddress: parsed.args.pool,
          eventType: parsed.name,
          txHash: log.transactionHash,
          logIndex: toNumber(log.index),
          blockNumber: toNumber(log.blockNumber),
          blockTimestamp,
          trader: parsed.args.creator,
          side: null,
          feeAsset: null,
          amountIn: null,
          amountOut: null,
          feeAmount: null,
          creatorFeeAmount: null,
          protocolFeeAmount: null,
          creatorFeesTotal: null,
          protocolFeesTotal: null,
          priceQuoteE18: parsed.args.initialPriceQuoteE18.toString(),
          reserveTokenAfter: parsed.args.poolTokenAllocation.toString(),
          reserveUsdtAfter: parsed.args.poolUsdtAllocation.toString(),
          data: {
            creator: parsed.args.creator,
            totalSupply: parsed.args.totalSupply.toString(),
            creatorAllocation: parsed.args.creatorAllocation.toString(),
            poolTokenAllocation: parsed.args.poolTokenAllocation.toString(),
            poolUsdtAllocation: parsed.args.poolUsdtAllocation.toString(),
          },
        });
        continue;
      }

      if (parsed.name === "LiquidityInitialized") {
        events.push({
          chainId,
          tokenAddress: parsed.args.token,
          poolAddress: parsed.args.pool,
          eventType: parsed.name,
          txHash: log.transactionHash,
          logIndex: toNumber(log.index),
          blockNumber: toNumber(log.blockNumber),
          blockTimestamp,
          trader: null,
          side: null,
          feeAsset: null,
          amountIn: null,
          amountOut: null,
          feeAmount: null,
          creatorFeeAmount: null,
          protocolFeeAmount: null,
          creatorFeesTotal: null,
          protocolFeesTotal: null,
          priceQuoteE18: parsed.args.initialPriceQuoteE18.toString(),
          reserveTokenAfter: parsed.args.reserveToken.toString(),
          reserveUsdtAfter: parsed.args.reserveUsdt.toString(),
          data: {},
        });
        continue;
      }

      if (parsed.name === "SwapExecuted") {
        events.push({
          chainId,
          tokenAddress: parsed.args.token,
          poolAddress: parsed.args.pool,
          eventType: parsed.name,
          txHash: log.transactionHash,
          logIndex: toNumber(log.index),
          blockNumber: toNumber(log.blockNumber),
          blockTimestamp,
          trader: parsed.args.trader,
          side: parsed.args.isBuy ? "buy" : "sell",
          feeAsset: null,
          amountIn: parsed.args.amountIn.toString(),
          amountOut: parsed.args.amountOut.toString(),
          feeAmount: parsed.args.feeAmount.toString(),
          creatorFeeAmount: null,
          protocolFeeAmount: null,
          creatorFeesTotal: null,
          protocolFeesTotal: null,
          priceQuoteE18: parsed.args.priceQuoteE18.toString(),
          reserveTokenAfter: parsed.args.reserveTokenAfter.toString(),
          reserveUsdtAfter: parsed.args.reserveUsdtAfter.toString(),
          data: {},
        });
        continue;
      }

      if (parsed.name === "FeesDistributed") {
        events.push({
          chainId,
          tokenAddress: parsed.args.token,
          poolAddress: parsed.args.pool,
          eventType: parsed.name,
          txHash: log.transactionHash,
          logIndex: toNumber(log.index),
          blockNumber: toNumber(log.blockNumber),
          blockTimestamp,
          trader: null,
          side: null,
          feeAsset: parsed.args.feeAsset,
          amountIn: null,
          amountOut: null,
          feeAmount: null,
          creatorFeeAmount: parsed.args.creatorFeeAmount.toString(),
          protocolFeeAmount: parsed.args.protocolFeeAmount.toString(),
          creatorFeesTotal: parsed.args.creatorFeesTotal.toString(),
          protocolFeesTotal: parsed.args.protocolFeesTotal.toString(),
          priceQuoteE18: null,
          reserveTokenAfter: null,
          reserveUsdtAfter: null,
          data: {},
        });
      }
    }

    return events;
  }

  async function rebuildDerivedData(tokenAddress) {
    const events = await tokenRegistryService.listAllTokenEvents(tokenAddress);
    for (const interval of INTERVALS) {
      const candles = buildCandles(events, interval);
      await tokenRegistryService.upsertTokenCandles(tokenAddress, interval, candles);
    }
    const stats = buildStats(events);
    await tokenRegistryService.upsertTokenStats({
      tokenAddress,
      ...stats,
    });
  }

  async function syncOnce() {
    if (syncPromise) {
      return syncPromise;
    }

    syncPromise = (async () => {
      const infrastructure = await launchpadDeploymentService.getInfrastructure();
      const provider = launchpadDeploymentService.getProvider();
      const artifacts = await launchpadDeploymentService.getArtifacts();
      const chainId = Number(infrastructure.network.chainId);
      const stateKey = `${INDEXER_KEY_PREFIX}:${chainId}:${infrastructure.eventHubAddress}`;
      const cursor = await tokenRegistryService.getIndexerState(stateKey);
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = cursor?.lastSyncedBlock
        ? cursor.lastSyncedBlock + 1
        : Number(process.env.EVENT_INDEXER_START_BLOCK || infrastructure.deploymentBlock || latestBlock);

      if (fromBlock > latestBlock) {
        return {
          indexedEvents: 0,
          fromBlock,
          toBlock: latestBlock,
          tokensUpdated: 0,
        };
      }

      const affectedTokens = new Set();
      let indexedEvents = 0;

      for (let startBlock = fromBlock; startBlock <= latestBlock; startBlock += blockChunk) {
        const endBlock = Math.min(startBlock + blockChunk - 1, latestBlock);
        const logs = await provider.getLogs({
          address: infrastructure.eventHubAddress,
          fromBlock: startBlock,
          toBlock: endBlock,
        });
        const parsedEvents = await buildParsedEvents(
          logs,
          artifacts.eventHub.abi,
          provider,
          chainId
        );
        if (parsedEvents.length > 0) {
          await tokenRegistryService.upsertPoolEvents(parsedEvents);
          for (const event of parsedEvents) {
            affectedTokens.add(event.tokenAddress);
          }
          indexedEvents += parsedEvents.length;
        }
      }

      for (const tokenAddress of affectedTokens) {
        await rebuildDerivedData(tokenAddress);
      }

      await tokenRegistryService.setIndexerState(stateKey, latestBlock);

      const summary = {
        indexedEvents,
        fromBlock,
        toBlock: latestBlock,
        tokensUpdated: affectedTokens.size,
      };
      serviceLogger.info({
        operation: "service.indexer.syncOnce",
        stage: "success",
        status: "success",
        context: summary,
      });
      return summary;
    })().finally(() => {
      syncPromise = null;
    });

    return syncPromise;
  }

  function start() {
    if (timer) {
      return;
    }
    void syncOnce().catch((error) => {
      serviceLogger.error({
        operation: "service.indexer.start",
        stage: "initialSync.failure",
        status: "failure",
        error,
      });
    });
    timer = setInterval(() => {
      void syncOnce().catch((error) => {
        serviceLogger.error({
          operation: "service.indexer.poll",
          stage: "failure",
          status: "failure",
          error,
        });
      });
    }, pollMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  return {
    start,
    syncOnce,
    rebuildDerivedData,
  };
}

module.exports = {
  createEventIndexerService,
};
