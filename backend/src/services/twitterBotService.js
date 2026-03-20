const { createNoopLogger, sanitizeForLogging } = require("../lib/logging");

const DEFAULT_TWITTER_BOT_POLL_MS = 30_000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

function normalizeHandle(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

function hasTextMention(tweetText, targetHandle) {
  const normalizedText = String(tweetText || "").toLowerCase();
  return normalizedText.includes(`@${normalizeHandle(targetHandle)}`);
}

function compareTweetIds(left, right) {
  try {
    const leftId = BigInt(String(left || "0"));
    const rightId = BigInt(String(right || "0"));
    if (leftId === rightId) {
      return 0;
    }
    return leftId > rightId ? 1 : -1;
  } catch {
    return 0;
  }
}

function createTwitterBotService({
  twitterBotRegistryService,
  twitterProviderClient,
  twitterBotClassifierService,
  launchOrchestrator,
  targetHandle,
  enabled,
  logger,
  pollMs = DEFAULT_TWITTER_BOT_POLL_MS,
}) {
  const serviceLogger = logger || createNoopLogger();
  const normalizedTargetHandle = normalizeHandle(targetHandle);

  let timer = null;
  let pollPromise = null;

  async function processTweet(config, tweet) {
    const mentionMatched =
      tweet.mentionedHandles.includes(normalizedTargetHandle) ||
      hasTextMention(tweet.text, normalizedTargetHandle);

    if (!mentionMatched) {
      await twitterBotRegistryService.recordEvent({
        configId: config.id,
        walletAddress: config.walletAddress,
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        tweetText: tweet.text,
        tweetCreatedAt: tweet.createdAt,
        targetHandle: `@${normalizedTargetHandle}`,
        mentionMatched: false,
        classifierStatus: "skipped_no_mention",
        classifierConfidence: null,
        extractedTokenName: null,
        extractedTokenSymbol: null,
        launchStatus: "skipped",
        launchRecordId: null,
        errorMessage: null,
        providerPayload: tweet.raw,
      });
      return;
    }

    let classification;
    try {
      classification = await twitterBotClassifierService.classifyTweet({
        tweetText: tweet.text,
        authorHandle: config.twitterHandleNormalized,
        targetHandle: normalizedTargetHandle,
      });
    } catch (error) {
      await twitterBotRegistryService.recordEvent({
        configId: config.id,
        walletAddress: config.walletAddress,
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        tweetText: tweet.text,
        tweetCreatedAt: tweet.createdAt,
        targetHandle: `@${normalizedTargetHandle}`,
        mentionMatched: true,
        classifierStatus: "classifier_failed",
        classifierConfidence: null,
        extractedTokenName: null,
        extractedTokenSymbol: null,
        launchStatus: "skipped",
        launchRecordId: null,
        errorMessage: error instanceof Error ? error.message : "Classifier failed",
        providerPayload: tweet.raw,
      });
      return;
    }

    const shouldLaunch =
      classification.shouldLaunch &&
      classification.confidence >= DEFAULT_CONFIDENCE_THRESHOLD &&
      classification.tokenName &&
      classification.tokenSymbol;

    if (!shouldLaunch) {
      await twitterBotRegistryService.recordEvent({
        configId: config.id,
        walletAddress: config.walletAddress,
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        tweetText: tweet.text,
        tweetCreatedAt: tweet.createdAt,
        targetHandle: `@${normalizedTargetHandle}`,
        mentionMatched: true,
        classifierStatus: "classified_no_launch",
        classifierConfidence: classification.confidence,
        extractedTokenName: classification.tokenName,
        extractedTokenSymbol: classification.tokenSymbol,
        launchStatus: "skipped",
        launchRecordId: null,
        errorMessage: classification.reason,
        providerPayload: tweet.raw,
      });
      return;
    }

    try {
      const result = await launchOrchestrator.deployAndPersistLaunch({
        name: classification.tokenName,
        symbol: classification.tokenSymbol,
        creatorAddress: config.walletAddress,
      });

      await twitterBotRegistryService.recordEvent({
        configId: config.id,
        walletAddress: config.walletAddress,
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        tweetText: tweet.text,
        tweetCreatedAt: tweet.createdAt,
        targetHandle: `@${normalizedTargetHandle}`,
        mentionMatched: true,
        classifierStatus: "classified_launch",
        classifierConfidence: classification.confidence,
        extractedTokenName: classification.tokenName,
        extractedTokenSymbol: classification.tokenSymbol,
        launchStatus: result.launchStatus || "completed",
        launchRecordId: result.launchRecordId || null,
        errorMessage: classification.reason,
        providerPayload: tweet.raw,
      });
    } catch (error) {
      await twitterBotRegistryService.recordEvent({
        configId: config.id,
        walletAddress: config.walletAddress,
        tweetId: tweet.id,
        tweetUrl: tweet.url,
        tweetText: tweet.text,
        tweetCreatedAt: tweet.createdAt,
        targetHandle: `@${normalizedTargetHandle}`,
        mentionMatched: true,
        classifierStatus: "classified_launch",
        classifierConfidence: classification.confidence,
        extractedTokenName: classification.tokenName,
        extractedTokenSymbol: classification.tokenSymbol,
        launchStatus: "failed",
        launchRecordId: error?.details?.launchRecordId || null,
        errorMessage: error instanceof Error ? error.message : "Launch failed",
        providerPayload: tweet.raw,
      });
    }
  }

  async function pollConfig(config) {
    const response = await twitterProviderClient.listRecentTweets(
      config.twitterHandleNormalized,
      config.lastSeenTweetId || null
    );

    let latestTweetId = config.lastSeenTweetId || null;
    let latestTweetAt = config.lastSeenTweetAt || null;

    for (const tweet of response.tweets) {
      await processTweet(config, tweet);

      if (!latestTweetId || compareTweetIds(tweet.id, latestTweetId) > 0) {
        latestTweetId = tweet.id;
        latestTweetAt = tweet.createdAt || latestTweetAt;
      }
    }

    await twitterBotRegistryService.updateConfigCursor({
      configId: config.id,
      lastSeenTweetId: latestTweetId,
      lastSeenTweetAt: latestTweetAt,
      lastPolledAt: Date.now(),
    });
  }

  async function syncOnce() {
    if (!enabled || !normalizedTargetHandle) {
      return { enabled: false, polledConfigs: 0 };
    }

    if (pollPromise) {
      return pollPromise;
    }

    pollPromise = (async () => {
      const configs = await twitterBotRegistryService.listEnabledConfigs();
      let polledConfigs = 0;

      for (const config of configs) {
        try {
          await pollConfig(config);
          polledConfigs += 1;
        } catch (error) {
          serviceLogger.error({
            operation: "service.twitterBot.pollConfig",
            stage: "failure",
            status: "failure",
            error,
            context: {
              config: sanitizeForLogging(config),
            },
          });
          await twitterBotRegistryService.updateConfigCursor({
            configId: config.id,
            lastSeenTweetId: config.lastSeenTweetId || null,
            lastSeenTweetAt: config.lastSeenTweetAt || null,
            lastPolledAt: Date.now(),
          });
        }
      }

      return {
        enabled: true,
        polledConfigs,
      };
    })();

    try {
      return await pollPromise;
    } finally {
      pollPromise = null;
    }
  }

  function start() {
    if (!enabled || timer) {
      return;
    }

    timer = setInterval(() => {
      void syncOnce();
    }, Number(pollMs || DEFAULT_TWITTER_BOT_POLL_MS));
  }

  function stop() {
    if (!timer) {
      return;
    }
    clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    syncOnce,
    isEnabled: () => Boolean(enabled && normalizedTargetHandle),
    getTargetHandle: () => (normalizedTargetHandle ? `@${normalizedTargetHandle}` : ""),
    getPollMs: () => Number(pollMs || DEFAULT_TWITTER_BOT_POLL_MS),
  };
}

module.exports = {
  createTwitterBotService,
};
