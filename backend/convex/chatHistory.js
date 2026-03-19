import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function trimTitleFromContent(content) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New Chat";
  }
  if (normalized.length <= 64) {
    return normalized;
  }
  return `${normalized.slice(0, 61)}...`;
}

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
    service: "convex.chatHistory",
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

export const createThread = mutation({
  args: {
    walletAddress: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const title = trimTitleFromContent(args.title);

    const id = await ctx.db.insert("chatThreads", {
      walletAddress: args.walletAddress,
      title,
      lastMessageAt: now,
      createdAt: now,
    });

    const thread = await ctx.db.get(id);
    return thread;
  },
});

export const listThreadsByWallet = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("chatThreads")
      .withIndex("by_walletAddress_lastMessageAt", (q) =>
        q.eq("walletAddress", args.walletAddress)
      )
      .order("desc")
      .collect();
  },
});

export const getThreadWithMessages = query({
  args: {
    threadId: v.id("chatThreads"),
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      return {
        thread: null,
        messages: [],
        error: "THREAD_NOT_FOUND",
      };
    }

    if (thread.walletAddress !== args.walletAddress) {
      return {
        thread: null,
        messages: [],
        error: "WALLET_MISMATCH",
      };
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();

    return {
      thread,
      messages,
      error: null,
    };
  },
});

export const appendMessage = mutation({
  args: {
    threadId: v.id("chatThreads"),
    walletAddress: v.string(),
    role: v.string(),
    content: v.string(),
    actionsJson: v.string(),
    requestId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    logEvent("info", {
      operation: "convex.chat.appendMessage",
      stage: "start",
      status: "start",
      context: {
        threadId: String(args.threadId),
        walletAddress: maskAddress(args.walletAddress),
        role: args.role,
      },
    });

    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("THREAD_NOT_FOUND");
    }
    if (thread.walletAddress !== args.walletAddress) {
      throw new Error("WALLET_MISMATCH");
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("chatMessages", {
      threadId: args.threadId,
      walletAddress: args.walletAddress,
      role: args.role,
      content: args.content,
      actionsJson: args.actionsJson,
      requestId: args.requestId,
      createdAt: now,
    });

    const nextTitle =
      args.role === "user" &&
      (!thread.title || thread.title.toLowerCase() === "new chat")
        ? trimTitleFromContent(args.content)
        : thread.title;

    await ctx.db.patch(args.threadId, {
      lastMessageAt: now,
      title: nextTitle,
    });

    const message = await ctx.db.get(messageId);
    const updatedThread = await ctx.db.get(args.threadId);

    logEvent("info", {
      operation: "convex.chat.appendMessage",
      stage: "success",
      status: "success",
      durationMs: Date.now() - startedAt,
      context: {
        threadId: String(args.threadId),
        messageId: String(messageId),
        role: args.role,
      },
    });

    return {
      message,
      thread: updatedThread,
    };
  },
});
