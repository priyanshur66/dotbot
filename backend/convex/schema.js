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
  chatThreads: defineTable({
    walletAddress: v.string(),
    title: v.string(),
    lastMessageAt: v.number(),
    createdAt: v.number(),
  }).index("by_walletAddress_lastMessageAt", ["walletAddress", "lastMessageAt"]),
  chatMessages: defineTable({
    threadId: v.id("chatThreads"),
    walletAddress: v.string(),
    role: v.string(),
    content: v.string(),
    actionsJson: v.string(),
    requestId: v.union(v.string(), v.null()),
    createdAt: v.number(),
  }).index("by_threadId_createdAt", ["threadId", "createdAt"]),
});
