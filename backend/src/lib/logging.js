const { getRequestContext } = require("./requestContext");

const LEVEL_RANK = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEYS = [
  "privatekey",
  "secret",
  "password",
  "authorization",
  "cookie",
  "access_token",
  "refresh_token",
  "apikey",
  "api_key",
  "bearer",
];

function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function getLogConfigFromEnv(env = process.env) {
  const defaultLevel = env.NODE_ENV === "production" ? "info" : "debug";
  const requestedLevel = String(env.LOG_LEVEL || defaultLevel).toLowerCase();
  const level = LEVEL_RANK[requestedLevel] ? requestedLevel : defaultLevel;

  return {
    level,
    verbose: toBoolean(env.LOG_VERBOSE, env.NODE_ENV !== "production"),
  };
}

function isHexAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function maskAddress(value) {
  if (!isHexAddress(value)) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isSensitiveKey(key) {
  const normalized = String(key || "").toLowerCase();
  return SENSITIVE_KEYS.some((fragment) => normalized.includes(fragment));
}

function sanitizeForLogging(value, currentKey) {
  if (currentKey && isSensitiveKey(currentKey)) {
    return "[REDACTED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return maskAddress(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item));
  }

  if (typeof value === "object") {
    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = sanitizeForLogging(nestedValue, key);
    }
    return output;
  }

  return value;
}

function serializeError(error, options = {}, depth = 0) {
  if (!error) {
    return undefined;
  }

  const maxDepth = options.maxDepth || 4;
  if (depth >= maxDepth) {
    return { message: "Error cause chain truncated" };
  }

  if (error instanceof Error) {
    const payload = {
      name: error.name,
      message: error.message,
    };
    if (options.includeStack !== false) {
      payload.stack = error.stack;
    }

    if (error.code) {
      payload.code = error.code;
    }
    if (error.statusCode) {
      payload.statusCode = error.statusCode;
    }
    if (error.details !== undefined) {
      payload.details = sanitizeForLogging(error.details);
    }
    if (error.operation) {
      payload.operation = error.operation;
    }
    if (error.stage) {
      payload.stage = error.stage;
    }

    if (error.cause) {
      payload.cause = serializeError(error.cause, options, depth + 1);
    }

    return payload;
  }

  return sanitizeForLogging({ nonErrorThrown: error });
}

function stripUndefined(obj) {
  const output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function createNoopLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createLogger(options = {}) {
  const service = options.service || "backend";
  const level = options.level || "info";
  const verbose = options.verbose !== undefined ? options.verbose : true;
  const threshold = LEVEL_RANK[level] || LEVEL_RANK.info;

  function shouldLog(messageLevel) {
    return (LEVEL_RANK[messageLevel] || LEVEL_RANK.info) >= threshold;
  }

  function emit(messageLevel, event = {}) {
    if (!shouldLog(messageLevel)) {
      return;
    }

    const requestContext = getRequestContext();

    const envelope = stripUndefined({
      timestamp: new Date().toISOString(),
      level: messageLevel,
      service,
      requestId: event.requestId || requestContext.requestId,
      operation: event.operation,
      stage: event.stage,
      durationMs: event.durationMs,
      status: event.status,
      context: event.context ? sanitizeForLogging(event.context) : undefined,
      error: event.error
        ? serializeError(event.error, {
            includeStack: verbose,
          })
        : undefined,
    });

    const line = JSON.stringify(envelope);

    if (messageLevel === "error") {
      console.error(line);
      return;
    }
    if (messageLevel === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }

  return {
    debug: (event) => emit("debug", event),
    info: (event) => emit("info", event),
    warn: (event) => emit("warn", event),
    error: (event) => emit("error", event),
  };
}

module.exports = {
  createLogger,
  createNoopLogger,
  getLogConfigFromEnv,
  sanitizeForLogging,
  serializeError,
  maskAddress,
};
