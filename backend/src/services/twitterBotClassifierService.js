const { SystemMessage, HumanMessage } = require("@langchain/core/messages");
const { z } = require("zod");
const { createOpenRouterModel, DEFAULT_OPENROUTER_MODEL } = require("../agent/llm/openRouterModel");
const { AgentModelError, ConfigError } = require("../lib/errors");
const { createNoopLogger } = require("../lib/logging");

const classifierSchema = z.object({
  shouldLaunch: z.boolean(),
  confidence: z.number().min(0).max(1),
  tokenName: z.string().nullable(),
  tokenSymbol: z.string().nullable(),
  reason: z.string(),
});

const HEURISTIC_CONFIDENCE = 0.9;
const TOKEN_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "coin",
  "deploy",
  "for",
  "launch",
  "make",
  "me",
  "my",
  "now",
  "please",
  "project",
  "the",
  "this",
  "token",
]);

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function parseJsonOutput(text) {
  const trimmed = String(text || "").trim();
  const candidates = [trimmed];
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    candidates.push(match[0]);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      continue;
    }
  }

  throw new Error("Model did not return valid JSON");
}

function deriveSymbolFromName(name) {
  const normalizedName = String(name || "").trim();
  const compact = normalizedName.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) {
    return "TOKEN";
  }

  const words = normalizedName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const acronym = words.map((word) => word[0]).join("");
  if (acronym.length >= 2) {
    return acronym.slice(0, 8);
  }

  return compact.slice(0, 8);
}

function cleanNullableString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/^["'`(]+|["'`),.!?:;]+$/g, "");
  return cleaned ? cleaned : null;
}

function stripUrlsAndMentions(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeLaunchInstruction(tweetText) {
  return /\b(?:launch|deploy|create|make)\b/i.test(String(tweetText || ""));
}

function normalizeExtractedTokenName(candidate) {
  const cleaned = cleanNullableString(candidate);
  if (!cleaned) {
    return null;
  }

  const normalized = cleaned.replace(/^[#$]+/, "").trim();
  if (!normalized) {
    return null;
  }

  if (TOKEN_STOPWORDS.has(normalized.toLowerCase())) {
    return null;
  }

  return normalized;
}

function extractTokenNameFromTweet(tweetText) {
  const sanitized = stripUrlsAndMentions(tweetText);
  const patterns = [
    /\b(?:launch|deploy|create|make)\s+token\s+([A-Za-z0-9#$][A-Za-z0-9._$#-]{1,31})\b/i,
    /\b(?:launch|deploy|create|make)\s+([A-Za-z0-9#$][A-Za-z0-9._$#-]{1,31})\b/i,
  ];

  for (const pattern of patterns) {
    const match = sanitized.match(pattern);
    if (!match) {
      continue;
    }

    const tokenName = normalizeExtractedTokenName(match[1]);
    if (tokenName) {
      return tokenName;
    }
  }

  return null;
}

function finalizeClassification(parsed, tweetText) {
  let tokenName = normalizeExtractedTokenName(parsed.tokenName);
  let tokenSymbol = cleanNullableString(parsed.tokenSymbol);
  let shouldLaunch = parsed.shouldLaunch;
  let confidence = parsed.confidence;
  let reason = cleanNullableString(parsed.reason) || "";

  const heuristicTokenName =
    looksLikeLaunchInstruction(tweetText) && !tokenName
      ? extractTokenNameFromTweet(tweetText)
      : null;

  if (heuristicTokenName) {
    tokenName = heuristicTokenName;
    shouldLaunch = true;
    confidence = Math.max(confidence, HEURISTIC_CONFIDENCE);
    reason = reason
      ? `${reason} Heuristic extraction matched a launch command and inferred the token name.`
      : "Heuristic extraction matched a launch command and inferred the token name.";
  }

  if (shouldLaunch && tokenName && !tokenSymbol) {
    tokenSymbol = deriveSymbolFromName(tokenName);
  }

  if (shouldLaunch && tokenName) {
    confidence = Math.max(confidence, HEURISTIC_CONFIDENCE);
  }

  return {
    shouldLaunch: Boolean(shouldLaunch && tokenName),
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0,
    tokenName,
    tokenSymbol,
    reason,
  };
}

function createTwitterBotClassifierService({
  openRouterApiKey,
  openRouterModel,
  openRouterSiteUrl,
  openRouterSiteName,
  logger,
}) {
  const serviceLogger = logger || createNoopLogger();

  if (!openRouterApiKey) {
    throw new ConfigError("OPENROUTER_API_KEY is required for twitter bot classifier");
  }

  const model = createOpenRouterModel({
    apiKey: openRouterApiKey,
    model: openRouterModel || DEFAULT_OPENROUTER_MODEL,
    siteUrl: openRouterSiteUrl,
    siteName: openRouterSiteName,
    temperature: 0,
    maxTokens: 300,
  });

  async function classifyTweet({ tweetText, authorHandle, targetHandle }) {
    const prompt = [
      "You classify whether a tweet is asking for a token launch.",
      "Return JSON only with keys: shouldLaunch, confidence, tokenName, tokenSymbol, reason.",
      "Use the same launch extraction standard as chat: the only required input is token name.",
      "If the tweet asks to launch or deploy a token and the token name is present, set shouldLaunch true.",
      "Derive tokenSymbol from tokenName when symbol is not explicitly provided.",
      "Short launch commands are valid. Example: 'launch msk @dotbot' should produce tokenName 'msk' and tokenSymbol 'MSK'.",
      "Set shouldLaunch false only when the tweet is not actually asking to launch/deploy a token or when no token name can be identified.",
      `Author handle: @${authorHandle}`,
      `Mention target: @${targetHandle}`,
      `Tweet: ${tweetText}`,
    ].join("\n");

    try {
      const response = await model.invoke([
        new SystemMessage(
          "You are a JSON extractor for token launch triggers. Follow the same behavior as the chat launch flow: token name is sufficient and token symbol should be derived from the name when omitted."
        ),
        new HumanMessage(prompt),
      ]);
      const parsed = classifierSchema.parse(parseJsonOutput(extractTextContent(response.content)));
      return finalizeClassification(parsed, tweetText);
    } catch (error) {
      serviceLogger.error({
        operation: "service.twitterBotClassifier.classifyTweet",
        stage: "failure",
        status: "failure",
        error,
      });
      throw new AgentModelError(
        "Twitter bot classifier invocation failed",
        {
          stage: "twitterBot.classifier",
        },
        error
      );
    }
  }

  return {
    classifyTweet,
  };
}

module.exports = {
  createTwitterBotClassifierService,
  deriveSymbolFromName,
  extractTokenNameFromTweet,
};
