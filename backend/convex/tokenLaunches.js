import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function maskAddress(value) {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function logEvent(level, event) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "convex.tokenLaunches",
    ...event,
  });

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

async function loadStatsMap(ctx, tokenAddresses) {
  const entries = [];
  for (const tokenAddress of tokenAddresses) {
    const stat = await ctx.db
      .query("tokenStats")
      .withIndex("by_tokenAddress", (q) => q.eq("tokenAddress", tokenAddress))
      .unique();
    entries.push([tokenAddress, stat]);
  }
  return new Map(entries);
}

function attachStats(launch, stats) {
  return {
    ...launch,
    stats: stats
      ? {
          latestPrice: stats.latestPrice,
          liquidityQuote: stats.liquidityQuote,
          reserveToken: stats.reserveToken,
          reserveQuote: stats.reserveQuote,
          totalVolumeQuote: stats.totalVolumeQuote,
          volume24hQuote: stats.volume24hQuote,
          lastTradeAt: stats.lastTradeAt,
          tradeCount: stats.tradeCount,
          updatedAt: stats.updatedAt,
        }
      : null,
  };
}

export const upsertLaunchRecord = mutation({
  args: {
    tokenAddress: v.string(),
    tokenName: v.string(),
    tokenSymbol: v.string(),
    creatorAddress: v.string(),
    ownerAddress: v.string(),
    launchedByAddress: v.string(),
    chainId: v.number(),
    networkName: v.string(),
    totalSupply: v.string(),
    decimals: v.number(),
    launchStatus: v.string(),
    deployTxHash: v.union(v.string(), v.null()),
    tokenTransferTxHash: v.union(v.string(), v.null()),
    ownershipTransferTxHash: v.union(v.string(), v.null()),
    poolAddress: v.union(v.string(), v.null()),
    quoteTokenAddress: v.union(v.string(), v.null()),
    eventHubAddress: v.union(v.string(), v.null()),
    creatorAllocation: v.union(v.string(), v.null()),
    poolTokenAllocation: v.union(v.string(), v.null()),
    poolUsdtAllocation: v.union(v.string(), v.null()),
    initialPrice: v.union(v.string(), v.null()),
    launchTxHash: v.union(v.string(), v.null()),
    swapFeeBps: v.union(v.number(), v.null()),
    creatorFeeShareBps: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    logEvent("info", {
      operation: "convex.upsertLaunchRecord",
      stage: "start",
      status: "start",
      context: {
        tokenAddress: maskAddress(args.tokenAddress),
        creatorAddress: maskAddress(args.creatorAddress),
      },
    });

    const now = Date.now();
    const existing = await ctx.db
      .query("tokenLaunches")
      .withIndex("by_tokenAddress", (q) => q.eq("tokenAddress", args.tokenAddress))
      .unique();

    const payload = {
      ...args,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      logEvent("info", {
        operation: "convex.upsertLaunchRecord",
        stage: "success.patch",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          tokenAddress: maskAddress(args.tokenAddress),
        },
      });
      return existing._id;
    }

    const id = await ctx.db.insert("tokenLaunches", payload);
    logEvent("info", {
      operation: "convex.upsertLaunchRecord",
      stage: "success.insert",
      status: "success",
      durationMs: Date.now() - startedAt,
      context: {
        id: String(id),
        tokenAddress: maskAddress(args.tokenAddress),
      },
    });
    return id;
  },
});

export const listTokenLaunches = query({
  args: {},
  handler: async (ctx) => {
    const launches = await ctx.db
      .query("tokenLaunches")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
    const statsMap = await loadStatsMap(
      ctx,
      launches.map((launch) => launch.tokenAddress)
    );
    return launches.map((launch) => attachStats(launch, statsMap.get(launch.tokenAddress)));
  },
});

export const listTokenLaunchesByOwner = query({
  args: { ownerAddress: v.string() },
  handler: async (ctx, args) => {
    const launches = await ctx.db
      .query("tokenLaunches")
      .withIndex("by_ownerAddress", (q) => q.eq("ownerAddress", args.ownerAddress))
      .order("desc")
      .collect();
    const statsMap = await loadStatsMap(
      ctx,
      launches.map((launch) => launch.tokenAddress)
    );
    return launches.map((launch) => attachStats(launch, statsMap.get(launch.tokenAddress)));
  },
});

export const getTokenLaunchByAddress = query({
  args: { tokenAddress: v.string() },
  handler: async (ctx, args) => {
    const launch = await ctx.db
      .query("tokenLaunches")
      .withIndex("by_tokenAddress", (q) => q.eq("tokenAddress", args.tokenAddress))
      .unique();
    if (!launch) {
      return null;
    }
    const stats = await ctx.db
      .query("tokenStats")
      .withIndex("by_tokenAddress", (q) => q.eq("tokenAddress", args.tokenAddress))
      .unique();
    return attachStats(launch, stats);
  },
});

export const upsertPoolEvents = mutation({
  args: {
    events: v.array(
      v.object({
        chainId: v.number(),
        tokenAddress: v.string(),
        poolAddress: v.string(),
        eventType: v.string(),
        txHash: v.string(),
        logIndex: v.number(),
        blockNumber: v.number(),
        blockTimestamp: v.number(),
        trader: v.union(v.string(), v.null()),
        side: v.union(v.string(), v.null()),
        feeAsset: v.union(v.string(), v.null()),
        amountIn: v.union(v.string(), v.null()),
        amountOut: v.union(v.string(), v.null()),
        feeAmount: v.union(v.string(), v.null()),
        creatorFeeAmount: v.union(v.string(), v.null()),
        protocolFeeAmount: v.union(v.string(), v.null()),
        creatorFeesTotal: v.union(v.string(), v.null()),
        protocolFeesTotal: v.union(v.string(), v.null()),
        priceQuoteE18: v.union(v.string(), v.null()),
        reserveTokenAfter: v.union(v.string(), v.null()),
        reserveUsdtAfter: v.union(v.string(), v.null()),
        dataJson: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let touched = 0;

    for (const event of args.events) {
      const existing = await ctx.db
        .query("poolEvents")
        .withIndex("by_txHash_logIndex", (q) =>
          q.eq("txHash", event.txHash).eq("logIndex", event.logIndex)
        )
        .unique();

      const payload = {
        ...event,
        updatedAt: now,
        createdAt: existing?.createdAt || now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("poolEvents", payload);
      }
      touched += 1;
    }

    return { count: touched };
  },
});

export const listPoolEventsByToken = query({
  args: {
    tokenAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    return ctx.db
      .query("poolEvents")
      .withIndex("by_tokenAddress_blockNumber_logIndex", (q) =>
        q.eq("tokenAddress", args.tokenAddress)
      )
      .order("desc")
      .take(limit);
  },
});

export const listAllPoolEventsByToken = query({
  args: { tokenAddress: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("poolEvents")
      .withIndex("by_tokenAddress_blockNumber_logIndex", (q) =>
        q.eq("tokenAddress", args.tokenAddress)
      )
      .order("asc")
      .collect();
  },
});

export const upsertTokenCandles = mutation({
  args: {
    tokenAddress: v.string(),
    interval: v.string(),
    candles: v.array(
      v.object({
        bucketStart: v.number(),
        open: v.string(),
        high: v.string(),
        low: v.string(),
        close: v.string(),
        volumeToken: v.string(),
        volumeQuote: v.string(),
        tradeCount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let count = 0;
    for (const candle of args.candles) {
      const existing = await ctx.db
        .query("tokenCandles")
        .withIndex("by_tokenAddress_interval_bucketStart", (q) =>
          q.eq("tokenAddress", args.tokenAddress)
            .eq("interval", args.interval)
            .eq("bucketStart", candle.bucketStart)
        )
        .unique();

      const payload = {
        tokenAddress: args.tokenAddress,
        interval: args.interval,
        bucketStart: candle.bucketStart,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volumeToken: candle.volumeToken,
        volumeQuote: candle.volumeQuote,
        tradeCount: candle.tradeCount,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("tokenCandles", payload);
      }
      count += 1;
    }
    return { count };
  },
});

export const listTokenCandles = query({
  args: {
    tokenAddress: v.string(),
    interval: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tokenCandles")
      .withIndex("by_tokenAddress_interval_bucketStart", (q) =>
        q.eq("tokenAddress", args.tokenAddress).eq("interval", args.interval)
      )
      .order("asc")
      .collect();
  },
});

export const upsertTokenStats = mutation({
  args: {
    tokenAddress: v.string(),
    latestPrice: v.string(),
    liquidityQuote: v.string(),
    reserveToken: v.string(),
    reserveQuote: v.string(),
    totalVolumeQuote: v.string(),
    volume24hQuote: v.string(),
    lastTradeAt: v.union(v.number(), v.null()),
    tradeCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tokenStats")
      .withIndex("by_tokenAddress", (q) => q.eq("tokenAddress", args.tokenAddress))
      .unique();
    const payload = {
      ...args,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return ctx.db.insert("tokenStats", payload);
  },
});

export const getIndexerState = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("indexerState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

export const setIndexerState = mutation({
  args: {
    key: v.string(),
    lastSyncedBlock: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("indexerState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    const payload = {
      key: args.key,
      lastSyncedBlock: args.lastSyncedBlock,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return ctx.db.insert("indexerState", payload);
  },
});
