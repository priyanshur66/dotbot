const { ConfigError, HttpError } = require("../../lib/errors");
const { createNoopLogger } = require("../../lib/logging");

function parseJsonSafely(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getFirstObject(values) {
  for (const value of values) {
    if (value && typeof value === "object") {
      return value;
    }
  }
  return null;
}

function readPath(root, path) {
  let current = root;
  for (const part of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function pushUniqueTweet(tweets, seenIds, item) {
  if (!item || typeof item !== "object") {
    return;
  }

  const tweetId = extractTweetId(item);
  if (!tweetId || seenIds.has(tweetId)) {
    return;
  }

  seenIds.add(tweetId);
  tweets.push(item);
}

function extractHandleMentions(item) {
  const candidates = [
    readPath(item, ["entities", "mentions"]),
    readPath(item, ["entities", "user_mentions"]),
    readPath(item, ["legacy", "entities", "user_mentions"]),
    readPath(item, ["note_tweet", "note_tweet_results", "result", "entity_set", "mentions"]),
  ];

  return candidates
    .flatMap((entry) => toArray(entry))
    .map((mention) => {
      if (!mention || typeof mention !== "object") {
        return "";
      }
      return String(mention.username || mention.screen_name || mention.tag || "")
        .replace(/^@+/, "")
        .toLowerCase();
    })
    .filter(Boolean);
}

function extractTweetText(item) {
  const candidates = [
    item?.text,
    item?.full_text,
    readPath(item, ["legacy", "full_text"]),
    readPath(item, ["legacy", "text"]),
    readPath(item, ["note_tweet", "note_tweet_results", "result", "text"]),
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
}

function extractTweetId(item) {
  const candidates = [item?.id_str, item?.id, readPath(item, ["rest_id"]), item?.tweet_id];
  const value = candidates.find((entry) => entry !== undefined && entry !== null);
  return value !== undefined && value !== null ? String(value) : "";
}

function extractTweetCreatedAt(item) {
  const value = item?.created_at || readPath(item, ["legacy", "created_at"]);
  if (!value) {
    return null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function collectTweetCandidates(payload) {
  const tweets = [];
  const visited = new Set();
  const seenIds = new Set();

  function visit(node) {
    if (!node || typeof node !== "object" || visited.has(node)) {
      return;
    }

    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    const directTweet =
      node?.content?.itemContent?.tweet_results?.result ||
      node?.content?.items?.[0]?.item?.itemContent?.tweet_results?.result ||
      node?.itemContent?.tweet_results?.result ||
      node?.tweet_results?.result ||
      node?.tweet;

    if (directTweet && directTweet !== node) {
      pushUniqueTweet(tweets, seenIds, directTweet);
      visit(directTweet);
    }

    pushUniqueTweet(tweets, seenIds, node);

    visit(node.entries);
    visit(node.items);
    visit(node.instructions);
    visit(node.tweets);
    visit(node.results);
    visit(node.timeline);
    visit(node.data);
    visit(node.result);
    visit(node.content);
    visit(node.itemContent);
  }

  visit(payload);

  return tweets;
}

function normalizeTweet(item, username) {
  const tweetId = extractTweetId(item);
  const text = extractTweetText(item);
  const mentionedHandles = extractHandleMentions(item);

  return {
    id: tweetId,
    text,
    createdAt: extractTweetCreatedAt(item),
    url: tweetId && username ? `https://x.com/${username}/status/${tweetId}` : null,
    mentionedHandles,
    raw: item,
  };
}

function createTwitter241Client({ apiKey, apiHost, logger, baseUrl = "https://twitter241.p.rapidapi.com" }) {
  const clientLogger = logger || createNoopLogger();

  if (!apiKey) {
    throw new ConfigError("TWITTER241_RAPIDAPI_KEY is required for twitter241 client");
  }
  if (!apiHost) {
    throw new ConfigError("TWITTER241_RAPIDAPI_HOST is required for twitter241 client");
  }

  async function requestJson(path, query = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    clientLogger.info({
      operation: "service.twitter241.request",
      stage: "start",
      status: "start",
      context: {
        url: url.toString(),
      },
    });

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost,
      },
    });

    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = parseJsonSafely(text);
    }

    if (!response.ok) {
      throw new HttpError(
        `twitter241 request failed with status ${response.status}`,
        502,
        "TWITTER_PROVIDER_FAILED",
        {
          path,
          statusCode: response.status,
          response: typeof data === "object" && data ? data : text.slice(0, 500),
        }
      );
    }

    return data;
  }

  async function resolveHandle(handle) {
    const normalized = String(handle || "").trim().replace(/^@+/, "");
    const payload = await requestJson("/user", { username: normalized });
    const record = getFirstObject([
      readPath(payload, ["result", "data", "user", "result"]),
      readPath(payload, ["data", "user", "result"]),
      readPath(payload, ["user", "result"]),
      readPath(payload, ["result", "user", "result"]),
      payload?.data,
      payload?.user,
      payload?.result,
      payload,
    ]);
    return {
      id: String(
        record?.rest_id || record?.id || record?.user_id || normalized
      ),
      username: String(
        record?.screen_name ||
          readPath(record, ["core", "screen_name"]) ||
          readPath(record, ["legacy", "screen_name"]) ||
          record?.username ||
          record?.handle ||
          normalized
      ).replace(/^@+/, ""),
      raw: payload,
    };
  }

  async function listRecentTweets(handle, sinceTweetId) {
    const resolved = await resolveHandle(handle);
    const payload = await requestJson("/user-tweets", {
      user: resolved.id,
      count: 20,
    });

    const tweets = collectTweetCandidates(payload)
      .map((item) => normalizeTweet(item, resolved.username))
      .filter((tweet) => tweet.id && tweet.text)
      .filter((tweet) => !sinceTweetId || BigInt(tweet.id) > BigInt(sinceTweetId))
      .sort((left, right) => {
        try {
          return Number(BigInt(left.id) - BigInt(right.id));
        } catch {
          return 0;
        }
      });

    return {
      resolvedHandle: resolved.username,
      tweets,
      raw: payload,
    };
  }

  return {
    resolveHandle,
    listRecentTweets,
  };
}

module.exports = {
  createTwitter241Client,
};
