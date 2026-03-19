const { getAddress } = require("ethers");
const { ValidationError } = require("../lib/errors");
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

module.exports = {
  normalizeDeployRequest,
};
