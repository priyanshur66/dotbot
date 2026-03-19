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

function normalizeDeployRequest(body) {
  const startedAt = Date.now();
  const operation = "validation.normalizeDeployRequest";
  validationLogger.info({
    operation,
    stage: "start",
    status: "start",
    context: {
      body: sanitizeForLogging(body),
    },
  });

  function fail(message, stage, context = {}) {
    const validationError = new ValidationError(message);
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
  }

  if (!body || typeof body !== "object") {
    fail("Request body is required", "validate.body", {
      bodyType: typeof body,
    });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";

  if (!name) {
    fail("Field `name` is required", "validate.name");
  }
  if (!symbol) {
    fail("Field `symbol` is required", "validate.symbol");
  }

  const ownerAddressRaw = body.ownerAddress;
  const adminAddressRaw = body.adminAddress;

  if (!ownerAddressRaw && !adminAddressRaw) {
    fail(
      "Either `ownerAddress` or `adminAddress` must be provided",
      "validate.ownerOrAdminRequired"
    );
  }

  let ownerAddress;
  let adminAddress;

  try {
    ownerAddress = ownerAddressRaw ? getAddress(ownerAddressRaw) : undefined;
  } catch (_error) {
    fail("`ownerAddress` is not a valid Ethereum address", "validate.ownerAddress", {
      ownerAddressRaw,
    });
  }

  try {
    adminAddress = adminAddressRaw ? getAddress(adminAddressRaw) : undefined;
  } catch (_error) {
    fail("`adminAddress` is not a valid Ethereum address", "validate.adminAddress", {
      adminAddressRaw,
    });
  }

  if (ownerAddress && adminAddress && ownerAddress !== adminAddress) {
    fail(
      "`ownerAddress` and `adminAddress` must match when both are provided",
      "validate.ownerAdminMatch",
      {
        ownerAddress,
        adminAddress,
      }
    );
  }

  const finalOwnerAddress = ownerAddress || adminAddress;
  validationLogger.info({
    operation,
    stage: "success",
    status: "success",
    durationMs: Date.now() - startedAt,
    context: {
      name,
      symbol,
      finalOwnerAddress,
    },
  });
  return {
    name,
    symbol,
    finalOwnerAddress,
  };
}

function normalizeAgentChatRequest(body) {
  const startedAt = Date.now();
  const operation = "validation.normalizeAgentChatRequest";
  validationLogger.info({
    operation,
    stage: "start",
    status: "start",
    context: {
      body: sanitizeForLogging(body),
    },
  });

  function fail(message, stage, context = {}) {
    const validationError = new AgentBadRequestError(message, context);
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
  }

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

  let walletAddress;
  try {
    walletAddress = getAddress(body.walletAddress);
  } catch (_error) {
    fail("`walletAddress` must be a valid Ethereum address", "validate.walletAddress", {
      walletAddress: body.walletAddress,
    });
  }

  const chainId = Number(body.chainId);
  if (!Number.isFinite(chainId) || chainId < 1) {
    fail("`chainId` must be a positive integer", "validate.chainId", {
      chainId: body.chainId,
    });
  }

  validationLogger.info({
    operation,
    stage: "success",
    status: "success",
    durationMs: Date.now() - startedAt,
    context: {
      walletAddress,
      chainId: Math.floor(chainId),
      messageCount: messages.length,
    },
  });

  return {
    messages,
    walletAddress,
    chainId: Math.floor(chainId),
  };
}

function normalizeWalletAddress(value, fail) {
  try {
    return getAddress(value);
  } catch (_error) {
    fail("`walletAddress` must be a valid Ethereum address", "validate.walletAddress", {
      walletAddress: value,
    });
    return "";
  }
}

function normalizeChatThreadCreateRequest(body) {
  const startedAt = Date.now();
  const operation = "validation.normalizeChatThreadCreateRequest";

  function fail(message, stage, context = {}) {
    const validationError = new ValidationError(message, context);
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
  }

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

  function fail(message, stage, context = {}) {
    const validationError = new ValidationError(message, context);
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
  }

  const rawWallet =
    typeof query?.walletAddress === "string" ? query.walletAddress : String(query?.walletAddress || "");
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

  function fail(message, stage, context = {}) {
    const validationError = new ValidationError(message, context);
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
  }

  const threadId = typeof payload.threadId === "string" ? payload.threadId.trim() : "";
  if (!threadId) {
    fail("`threadId` is required", "validate.threadId");
  }

  const walletAddress = normalizeWalletAddress(payload.walletAddress, fail);
  return {
    threadId,
    walletAddress,
  };
}

function normalizeChatThreadReplyRequest(payload) {
  const startedAt = Date.now();
  const operation = "validation.normalizeChatThreadReplyRequest";

  function fail(message, stage, context = {}) {
    const validationError = new ValidationError(message, context);
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
  }

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
  normalizeDeployRequest,
  normalizeAgentChatRequest,
  normalizeChatThreadCreateRequest,
  normalizeChatThreadListRequest,
  normalizeChatThreadGetRequest,
  normalizeChatThreadReplyRequest,
};
