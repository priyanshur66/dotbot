const { ChatOpenAI } = require("@langchain/openai");

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";

function createOpenRouterModel({
  apiKey,
  model,
  siteUrl,
  siteName,
  temperature = 0,
  maxTokens = 900,
}) {
  const defaultHeaders = {};

  if (siteUrl) {
    defaultHeaders["HTTP-Referer"] = siteUrl;
  }
  if (siteName) {
    defaultHeaders["X-Title"] = siteName;
  }

  return new ChatOpenAI({
    apiKey,
    model: model || DEFAULT_OPENROUTER_MODEL,
    temperature,
    maxTokens,
    configuration: {
      baseURL: DEFAULT_OPENROUTER_BASE_URL,
      defaultHeaders,
    },
  });
}

module.exports = {
  DEFAULT_OPENROUTER_MODEL,
  createOpenRouterModel,
};
