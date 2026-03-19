import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    return ctx.db.insert("tokenLaunches", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const listTokenLaunches = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("tokenLaunches")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});

export const listTokenLaunchesByOwner = query({
  args: { ownerAddress: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tokenLaunches")
      .withIndex("by_ownerAddress", (q) => q.eq("ownerAddress", args.ownerAddress))
      .order("desc")
      .collect();
  },
});
