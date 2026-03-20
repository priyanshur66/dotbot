const { ConvexHttpClient } = require("convex/browser");
const { getAddress } = require("ethers");
const { ConfigError, DataStoreError, ValidationError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

function normalizeWallet(walletAddressRaw) {
  try {
    return getAddress(walletAddressRaw);
  } catch (_error) {
    throw new ValidationError("`walletAddress` is not a valid Ethereum address");
  }
}

function normalizeHandle(handleRaw) {
  const handle = typeof handleRaw === "string" ? handleRaw.trim() : "";
  const stripped = handle.replace(/^@+/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(stripped)) {
    throw new ValidationError(
      "`twitterHandle` must be 1-15 characters and only contain letters, numbers, or underscores"
    );
  }

  return {
    twitterHandle: `@${stripped}`,
    twitterHandleNormalized: stripped.toLowerCase(),
  };
}

function normalizeConfig(record) {
  if (!record) {
    return null;
  }

  return {
    id: String(record.id || record._id),
    walletAddress: record.walletAddress,
    twitterHandle: record.twitterHandle,
    twitterHandleNormalized: record.twitterHandleNormalized,
    enabled: Boolean(record.enabled),
    lastSeenTweetId: record.lastSeenTweetId || null,
    lastSeenTweetAt: record.lastSeenTweetAt || null,
    lastPolledAt: record.lastPolledAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeEvent(record) {
  return {
    id: String(record.id || record._id),
    configId: String(record.configId),
    walletAddress: record.walletAddress,
    tweetId: record.tweetId,
    tweetUrl: record.tweetUrl || null,
    tweetText: record.tweetText,
    tweetCreatedAt: record.tweetCreatedAt || null,
    targetHandle: record.targetHandle,
    mentionMatched: Boolean(record.mentionMatched),
    classifierStatus: record.classifierStatus,
    classifierConfidence:
      typeof record.classifierConfidence === "number" ? record.classifierConfidence : null,
    extractedTokenName: record.extractedTokenName || null,
    extractedTokenSymbol: record.extractedTokenSymbol || null,
    launchStatus: record.launchStatus,
    launchRecordId: record.launchRecordId || null,
    errorMessage: record.errorMessage || null,
    providerPayloadJson: record.providerPayloadJson,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function createTwitterBotRegistryService({ convexUrl, convexClient, logger }) {
  const serviceLogger = logger || createNoopLogger();

  if (!convexUrl) {
    throw new ConfigError("CONVEX_URL is required for twitter bot registry service");
  }

  const client = convexClient || new ConvexHttpClient(convexUrl);

  async function upsertConfig({ walletAddress, twitterHandle, enabled }) {
    const normalizedWallet = normalizeWallet(walletAddress);
    const normalizedHandle = normalizeHandle(twitterHandle);

    try {
      const id = await client.mutation("twitterBot:upsertConfig", {
        walletAddress: normalizedWallet,
        twitterHandle: normalizedHandle.twitterHandle,
        twitterHandleNormalized: normalizedHandle.twitterHandleNormalized,
        enabled: Boolean(enabled),
      });

      return {
        id: String(id),
        walletAddress: normalizedWallet,
        ...normalizedHandle,
        enabled: Boolean(enabled),
      };
    } catch (error) {
      serviceLogger.error({
        operation: "service.twitterBotRegistry.upsertConfig",
        stage: "failure",
        status: "failure",
        error,
      });
      throw new DataStoreError(
        "Failed to save twitter bot config",
        {
          walletAddress: normalizedWallet,
          twitterHandle: normalizedHandle.twitterHandle,
        },
        error
      );
    }
  }

  async function getConfigByWallet(walletAddress) {
    const normalizedWallet = normalizeWallet(walletAddress);

    try {
      const record = await client.query("twitterBot:getConfigByWallet", {
        walletAddress: normalizedWallet,
      });
      return normalizeConfig(record);
    } catch (error) {
      throw new DataStoreError(
        "Failed to load twitter bot config",
        {
          walletAddress: normalizedWallet,
        },
        error
      );
    }
  }

  async function listEnabledConfigs() {
    try {
      const rows = await client.query("twitterBot:listEnabledConfigs", {});
      return rows.map(normalizeConfig);
    } catch (error) {
      throw new DataStoreError("Failed to list enabled twitter bot configs", undefined, error);
    }
  }

  async function updateConfigCursor({ configId, lastSeenTweetId, lastSeenTweetAt, lastPolledAt }) {
    try {
      await client.mutation("twitterBot:updateConfigCursor", {
        configId,
        lastSeenTweetId: lastSeenTweetId || null,
        lastSeenTweetAt: Number.isFinite(lastSeenTweetAt) ? lastSeenTweetAt : null,
        lastPolledAt: Number(lastPolledAt || Date.now()),
      });
    } catch (error) {
      throw new DataStoreError(
        "Failed to update twitter bot cursor",
        {
          configId,
          lastSeenTweetId: lastSeenTweetId || null,
        },
        error
      );
    }
  }

  async function recordEvent(payload) {
    const normalizedWallet = normalizeWallet(payload.walletAddress);
    try {
      const id = await client.mutation("twitterBot:recordEvent", {
        configId: payload.configId,
        walletAddress: normalizedWallet,
        tweetId: String(payload.tweetId),
        tweetUrl: payload.tweetUrl || null,
        tweetText: String(payload.tweetText || ""),
        tweetCreatedAt: Number.isFinite(payload.tweetCreatedAt) ? payload.tweetCreatedAt : null,
        targetHandle: payload.targetHandle,
        mentionMatched: Boolean(payload.mentionMatched),
        classifierStatus: payload.classifierStatus,
        classifierConfidence:
          typeof payload.classifierConfidence === "number" ? payload.classifierConfidence : null,
        extractedTokenName: payload.extractedTokenName || null,
        extractedTokenSymbol: payload.extractedTokenSymbol || null,
        launchStatus: payload.launchStatus,
        launchRecordId: payload.launchRecordId || null,
        errorMessage: payload.errorMessage || null,
        providerPayloadJson: JSON.stringify(payload.providerPayload || {}),
      });
      return String(id);
    } catch (error) {
      throw new DataStoreError(
        "Failed to record twitter bot event",
        {
          walletAddress: normalizedWallet,
          tweetId: payload.tweetId,
        },
        error
      );
    }
  }

  async function listEventsByWallet(walletAddress, limit = 20) {
    const normalizedWallet = normalizeWallet(walletAddress);

    try {
      const rows = await client.query("twitterBot:listEventsByWallet", {
        walletAddress: normalizedWallet,
        limit,
      });
      return rows.map(normalizeEvent);
    } catch (error) {
      throw new DataStoreError(
        "Failed to load twitter bot events",
        {
          walletAddress: normalizedWallet,
        },
        error
      );
    }
  }

  return {
    normalizeWallet,
    normalizeHandle,
    upsertConfig,
    getConfigByWallet,
    listEnabledConfigs,
    updateConfigCursor,
    recordEvent,
    listEventsByWallet,
  };
}

module.exports = {
  createTwitterBotRegistryService,
};
