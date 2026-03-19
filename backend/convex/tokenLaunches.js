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

export const createLaunchRecord = mutation({
  args: {
    tokenAddress: v.string(),
    tokenName: v.string(),
    tokenSymbol: v.string(),
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
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    logEvent("info", {
      operation: "convex.createLaunchRecord",
      stage: "start",
      status: "start",
      context: {
        tokenAddress: maskAddress(args.tokenAddress),
        ownerAddress: maskAddress(args.ownerAddress),
      },
    });

    try {
      const id = await ctx.db.insert("tokenLaunches", {
        ...args,
        createdAt: Date.now(),
      });
      logEvent("info", {
        operation: "convex.createLaunchRecord",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          id: String(id),
          tokenAddress: maskAddress(args.tokenAddress),
          ownerAddress: maskAddress(args.ownerAddress),
        },
      });
      return id;
    } catch (error) {
      logEvent("error", {
        operation: "convex.createLaunchRecord",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        context: {
          tokenAddress: maskAddress(args.tokenAddress),
          ownerAddress: maskAddress(args.ownerAddress),
        },
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : { nonErrorThrown: error },
      });
      throw error;
    }
  },
});

export const listTokenLaunches = query({
  args: {},
  handler: async (ctx) => {
    const startedAt = Date.now();
    logEvent("info", {
      operation: "convex.listTokenLaunches",
      stage: "start",
      status: "start",
    });
    try {
      const rows = await ctx.db
        .query("tokenLaunches")
        .withIndex("by_createdAt")
        .order("desc")
        .collect();
      logEvent("info", {
        operation: "convex.listTokenLaunches",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          count: rows.length,
        },
      });
      return rows;
    } catch (error) {
      logEvent("error", {
        operation: "convex.listTokenLaunches",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : { nonErrorThrown: error },
      });
      throw error;
    }
  },
});

export const listTokenLaunchesByOwner = query({
  args: { ownerAddress: v.string() },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    logEvent("info", {
      operation: "convex.listTokenLaunchesByOwner",
      stage: "start",
      status: "start",
      context: {
        ownerAddress: maskAddress(args.ownerAddress),
      },
    });
    try {
      const rows = await ctx.db
        .query("tokenLaunches")
        .withIndex("by_ownerAddress", (q) => q.eq("ownerAddress", args.ownerAddress))
        .order("desc")
        .collect();
      logEvent("info", {
        operation: "convex.listTokenLaunchesByOwner",
        stage: "success",
        status: "success",
        durationMs: Date.now() - startedAt,
        context: {
          ownerAddress: maskAddress(args.ownerAddress),
          count: rows.length,
        },
      });
      return rows;
    } catch (error) {
      logEvent("error", {
        operation: "convex.listTokenLaunchesByOwner",
        stage: "failure",
        status: "failure",
        durationMs: Date.now() - startedAt,
        context: {
          ownerAddress: maskAddress(args.ownerAddress),
        },
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : { nonErrorThrown: error },
      });
      throw error;
    }
  },
});
