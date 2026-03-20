const { getAddress } = require("ethers");
const { ValidationError, AgentBadRequestError } = require("../lib/errors");
const {
  createLogger,
  getLogConfigFromEnv,
  sanitizeForLogging,
} = require("../lib/logging");

const validationLogger = createLogger({
  service: "backend.validation",
  ...getLogConfigFromEnv(process.env),
});

function createFail(operation, startedAt, ErrorType = ValidationError) {
  return (message, stage, context = {}) => {
    const validationError = new ErrorType(message, context);
    validationError.operation = operation;
    validationError.stage = stage;
    validationLogger.warn({
      operation,
      stage,
      status: "failure",
      durationMs: Date.now() - startedAt,
      context,
    });
    throw validationError;
  };
}

function normalizeAddress(value, fieldName, fail, stage = `validate.${fieldName}`) {
  try {
    return getAddress(value);
  } catch (_error) {
    fail(`\`${fieldName}\` is not a valid Ethereum address`, stage, {
      [fieldName]: value,
    });
    return "";
  }
}

function normalizeLaunchRequest(body) {
  const startedAt = Date.now();
  const operation = "validation.normalizeLaunchRequest";
  const fail = createFail(operation, startedAt);

  validationLogger.info({
    operation,
    stage: "start",
    status: "start",
    context: {
      body: sanitizeForLogging(body),
    },
  });

  if (!body || typeof body !== "object") {
    fail("Request body is required", "validate.body", { bodyType: typeof body });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!name) {
    fail("Field `name` is required", "validate.name");
  }
  if (!symbol) {
    fail("Field `symbol` is required", "validate.symbol");
  }

  const creatorAddressRaw =
    body.creatorAddress || body.ownerAddress || body.adminAddress || body.finalOwnerAddress;
  if (!creatorAddressRaw) {
    fail(
      "One of `creatorAddress`, `ownerAddress`, or `adminAddress` must be provided",
      "validate.creatorAddress.required"
    );
  }

  const creatorAddress = normalizeAddress(
    creatorAddressRaw,
    "creatorAddress",
    fail,
    "validate.creatorAddress"
  );

  validationLogger.info({
    operation,
    stage: "success",
    status: "success",
    durationMs: Date.now() - startedAt,
    context: {
      name,
      symbol,
      creatorAddress,
    },
  });

  return {
    name,
    symbol,
    creatorAddress,
  };
}

function normalizeDeployRequest(body) {
  const launch = normalizeLaunchRequest(body);
  return {
    name: launch.name,
    symbol: launch.symbol,
    finalOwnerAddress: launch.creatorAddress,
  };
}

function normalizeTokenAddress(value, fieldName = "tokenAddress") {
  const startedAt = Date.now();
  const operation = "validation.normalizeTokenAddress";
  const fail = createFail(operation, startedAt);
  return normalizeAddress(value, fieldName, fail, `validate.${fieldName}`);
}

function normalizeCandleInterval(value) {
  const startedAt = Date.now();
  const operation = "validation.normalizeCandleInterval";
  const fail = createFail(operation, startedAt);
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!["1m", "5m", "1h", "1d"].includes(normalized)) {
    fail("`interval` must be one of `1m`, `5m`, `1h`, `1d`", "validate.interval", {
      interval: value,
    });
  }
  return normalized;
}

function normalizeAgentChatRequest(body) {
  const startedAt = Date.now();
  const operation = "validation.normalizeAgentChatRequest";
  const fail = createFail(operation, startedAt, AgentBadRequestError);

  validationLogger.info({
    operation,
    stage: "start",
    status: "start",
    context: {
      body: sanitizeForLogging(body),
    },
  });

  if (!body || typeof body !== "object") {
    fail("Request body is required", "validate.body", {
      bodyType: typeof body,
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    fail("Field `messages` must be a non-empty array", "validate.messages");
  }

  const messages = body.messages
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        fail("Each message must be an object", "validate.messages.shape", { index });
      }

      const role = typeof item.role === "string" ? item.role.trim() : "";
      const content = typeof item.content === "string" ? item.content.trim() : "";

      if (!["user", "assistant"].includes(role)) {
        fail("Each message role must be `user` or `assistant`", "validate.messages.role", {
          index,
          role,
        });
      }

      if (!content) {
        fail("Each message content must be non-empty", "validate.messages.content", {
          index,
        });
      }

      return { role, content };
    })
    .slice(-20);

  const walletAddress = normalizeAddress(
    body.walletAddress,
    "walletAddress",
    fail,
    "validate.walletAddress"
  );

  const chainId = Number(body.chainId);
  if (!Number.isFinite(chainId) || chainId < 1) {
    fail("`chainId` must be a positive integer", "validate.chainId", {
      chainId: body.chainId,
    });
  }

  return {
    messages,
    walletAddress,
    chainId: Math.floor(chainId),
  };
}

function normalizeWalletAddress(value, fail) {
  return normalizeAddress(value, "walletAddress", fail, "validate.walletAddress");
}

function normalizeChatThreadCreateRequest(body) {
  const startedAt = Date.now();
  const operation = "validation.normalizeChatThreadCreateRequest";
  const fail = createFail(operation, startedAt);

  if (!body || typeof body !== "object") {
    fail("Request body is required", "validate.body", { bodyType: typeof body });
  }

  const walletAddress = normalizeWalletAddress(body.walletAddress, fail);
  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "New Chat";

  return {
    walletAddress,
    title,
  };
}

function normalizeChatThreadListRequest(query) {
  const startedAt = Date.now();
  const operation = "validation.normalizeChatThreadListRequest";
  const fail = createFail(operation, startedAt);

  const rawWallet =
    typeof query?.walletAddress === "string"
      ? query.walletAddress
      : String(query?.walletAddress || "");
  if (!rawWallet) {
    fail("`walletAddress` query param is required", "validate.walletAddress.required");
  }

  return {
    walletAddress: normalizeWalletAddress(rawWallet, fail),
  };
}

function normalizeChatThreadGetRequest(payload) {
  const startedAt = Date.now();
  const operation = "validation.normalizeChatThreadGetRequest";
  const fail = createFail(operation, startedAt);

  const threadId = typeof payload.threadId === "string" ? payload.threadId.trim() : "";
  if (!threadId) {
    fail("`threadId` is required", "validate.threadId");
  }

  return {
    threadId,
    walletAddress: normalizeWalletAddress(payload.walletAddress, fail),
  };
}

function normalizeChatThreadReplyRequest(payload) {
  const startedAt = Date.now();
  const operation = "validation.normalizeChatThreadReplyRequest";
  const fail = createFail(operation, startedAt);

  const threadId = typeof payload.threadId === "string" ? payload.threadId.trim() : "";
  if (!threadId) {
    fail("`threadId` is required", "validate.threadId");
  }

  const walletAddress = normalizeWalletAddress(payload.walletAddress, fail);
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!content) {
    fail("`content` must be a non-empty string", "validate.content");
  }

  return {
    threadId,
    walletAddress,
    content,
    stream: Boolean(payload.stream),
  };
}

module.exports = {
  normalizeLaunchRequest,
  normalizeDeployRequest,
  normalizeTokenAddress,
  normalizeCandleInterval,
  normalizeAgentChatRequest,
  normalizeChatThreadCreateRequest,
  normalizeChatThreadListRequest,
  normalizeChatThreadGetRequest,
  normalizeChatThreadReplyRequest,
};
