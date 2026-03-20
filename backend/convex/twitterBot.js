import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function normalizeConfig(record) {
  if (!record) {
    return null;
  }

  return {
    ...record,
    id: String(record._id),
  };
}

function normalizeEvent(record) {
  return {
    ...record,
    id: String(record._id),
    configId: String(record.configId),
  };
}

export const upsertConfig = mutation({
  args: {
    walletAddress: v.string(),
    twitterHandle: v.string(),
    twitterHandleNormalized: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("twitterBotConfigs")
      .withIndex("by_walletAddress", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();
    const now = Date.now();
    const payload = {
      walletAddress: args.walletAddress,
      twitterHandle: args.twitterHandle,
      twitterHandleNormalized: args.twitterHandleNormalized,
      enabled: args.enabled,
      lastSeenTweetId: existing?.lastSeenTweetId || null,
      lastSeenTweetAt: existing?.lastSeenTweetAt || null,
      lastPolledAt: existing?.lastPolledAt || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("twitterBotConfigs", payload);
  },
});

export const getConfigByWallet = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("twitterBotConfigs")
      .withIndex("by_walletAddress", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();
    return normalizeConfig(record);
  },
});

export const listEnabledConfigs = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("twitterBotConfigs")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    return rows.map(normalizeConfig);
  },
});

export const updateConfigCursor = mutation({
  args: {
    configId: v.id("twitterBotConfigs"),
    lastSeenTweetId: v.union(v.string(), v.null()),
    lastSeenTweetAt: v.union(v.number(), v.null()),
    lastPolledAt: v.number(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.configId);
    if (!record) {
      return null;
    }
    await ctx.db.patch(args.configId, {
      lastSeenTweetId: args.lastSeenTweetId,
      lastSeenTweetAt: args.lastSeenTweetAt,
      lastPolledAt: args.lastPolledAt,
      updatedAt: Date.now(),
    });
    return args.configId;
  },
});

export const recordEvent = mutation({
  args: {
    configId: v.id("twitterBotConfigs"),
    walletAddress: v.string(),
    tweetId: v.string(),
    tweetUrl: v.union(v.string(), v.null()),
    tweetText: v.string(),
    tweetCreatedAt: v.union(v.number(), v.null()),
    targetHandle: v.string(),
    mentionMatched: v.boolean(),
    classifierStatus: v.string(),
    classifierConfidence: v.union(v.number(), v.null()),
    extractedTokenName: v.union(v.string(), v.null()),
    extractedTokenSymbol: v.union(v.string(), v.null()),
    launchStatus: v.string(),
    launchRecordId: v.union(v.string(), v.null()),
    errorMessage: v.union(v.string(), v.null()),
    providerPayloadJson: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("twitterBotEvents")
      .withIndex("by_tweetId", (q) => q.eq("tweetId", args.tweetId))
      .unique();
    const now = Date.now();
    const payload = {
      ...args,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("twitterBotEvents", payload);
  },
});

export const listEventsByWallet = query({
  args: {
    walletAddress: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const rows = await ctx.db
      .query("twitterBotEvents")
      .withIndex("by_walletAddress_createdAt", (q) => q.eq("walletAddress", args.walletAddress))
      .order("desc")
      .take(limit);
    return rows.map(normalizeEvent);
  },
});
