const { ConvexHttpClient } = require("convex/browser");
const { getAddress } = require("ethers");
const { ConfigError, DataStoreError, ValidationError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

function normalizeThread(record) {
  return {
    id: String(record._id),
    walletAddress: record.walletAddress,
    title: record.title,
    lastMessageAt: record.lastMessageAt,
    createdAt: record.createdAt,
  };
}

function parseActionsJson(actionsJson) {
  if (!actionsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(actionsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function normalizeMessage(record) {
  return {
    id: String(record._id),
    threadId: String(record.threadId),
    walletAddress: record.walletAddress,
    role: record.role,
    content: record.content,
    actions: parseActionsJson(record.actionsJson),
    createdAt: record.createdAt,
    requestId: record.requestId || null,
  };
}

function createChatHistoryService({ convexUrl, convexClient, logger }) {
  const serviceLogger = logger || createNoopLogger();

  if (!convexUrl) {
    throw new ConfigError("CONVEX_URL is required for chat history service");
  }

  const client = convexClient || new ConvexHttpClient(convexUrl);

  function normalizeWallet(walletAddressRaw) {
    try {
      return getAddress(walletAddressRaw);
    } catch (_error) {
      throw new ValidationError("`walletAddress` is not a valid Ethereum address");
    }
  }

  async function createThread({ walletAddress, title }) {
    const normalizedWallet = normalizeWallet(walletAddress);

    try {
      const created = await client.mutation("chatHistory:createThread", {
        walletAddress: normalizedWallet,
        title: title || "New Chat",
      });

      return {
        thread: normalizeThread(created),
      };
    } catch (error) {
      throw new DataStoreError(
        "Failed to create chat thread",
        {
          walletAddress: normalizedWallet,
        },
        error
      );
    }
  }

  async function listThreadsByWallet(walletAddress) {
    const normalizedWallet = normalizeWallet(walletAddress);

    try {
      const rows = await client.query("chatHistory:listThreadsByWallet", {
        walletAddress: normalizedWallet,
      });

      return {
        walletAddress: normalizedWallet,
        threads: rows.map(normalizeThread),
      };
    } catch (error) {
      throw new DataStoreError(
        "Failed to list chat threads",
        {
          walletAddress: normalizedWallet,
        },
        error
      );
    }
  }

  async function getThreadWithMessages({ threadId, walletAddress }) {
    const normalizedWallet = normalizeWallet(walletAddress);

    try {
      const payload = await client.query("chatHistory:getThreadWithMessages", {
        threadId,
        walletAddress: normalizedWallet,
      });

      if (!payload?.thread) {
        if (payload?.error === "WALLET_MISMATCH") {
          throw new ValidationError("Thread does not belong to this wallet address");
        }
        throw new ValidationError("Thread not found");
      }

      return {
        thread: normalizeThread(payload.thread),
        messages: (payload.messages || []).map(normalizeMessage),
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new DataStoreError(
        "Failed to fetch chat thread",
        {
          threadId,
          walletAddress: normalizedWallet,
        },
        error
      );
    }
  }

  async function appendMessage({
    threadId,
    walletAddress,
    role,
    content,
    actions,
    requestId,
  }) {
    const normalizedWallet = normalizeWallet(walletAddress);

    try {
      const saved = await client.mutation("chatHistory:appendMessage", {
        threadId,
        walletAddress: normalizedWallet,
        role,
        content,
        actionsJson: JSON.stringify(actions || []),
        requestId: requestId || null,
      });

      return {
        message: normalizeMessage(saved.message),
        thread: normalizeThread(saved.thread),
      };
    } catch (error) {
      throw new DataStoreError(
        "Failed to append chat message",
        {
          threadId,
          walletAddress: normalizedWallet,
          role,
        },
        error
      );
    }
  }

  return {
    createThread,
    listThreadsByWallet,
    getThreadWithMessages,
    appendMessage,
  };
}

module.exports = {
  createChatHistoryService,
};
