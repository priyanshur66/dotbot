import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tokenLaunches: defineTable({
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
    createdAt: v.number(),
  })
    .index("by_ownerAddress", ["ownerAddress"])
    .index("by_createdAt", ["createdAt"]),
});
