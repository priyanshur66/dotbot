type LogLevel = "debug" | "info" | "warn" | "error";

type LogEvent = {
  requestId?: string;
  operation?: string;
  stage?: string;
  durationMs?: number;
  status?: string;
  context?: unknown;
  error?: unknown;
};

const LEVEL_RANK: Record<LogLevel, number> = {
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

function toBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function resolveLogLevel(): LogLevel {
  const defaultLevel: LogLevel =
    process.env.NODE_ENV === "production" ? "info" : "debug";
  const requested = (process.env.LOG_LEVEL || defaultLevel).toLowerCase();
  if (
    requested === "debug" ||
    requested === "info" ||
    requested === "warn" ||
    requested === "error"
  ) {
    return requested;
  }
  return defaultLevel;
}

function shouldIncludeStack() {
  return toBoolean(process.env.LOG_VERBOSE, process.env.NODE_ENV !== "production");
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYS.some((fragment) => normalized.includes(fragment));
}

function isHexAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function maskAddress(value: string) {
  if (!isHexAddress(value)) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function sanitizeForLogging(value: unknown, currentKey?: string): unknown {
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
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(input)) {
      output[key] = sanitizeForLogging(nestedValue, key);
    }
    return output;
  }

  return value;
}

export function serializeError(
  error: unknown,
  includeStack = shouldIncludeStack(),
  depth = 0
): unknown {
  if (!error) {
    return undefined;
  }

  if (depth >= 4) {
    return { message: "Error cause chain truncated" };
  }

  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    if (includeStack) {
      payload.stack = error.stack;
    }

    const maybeError = error as Error & {
      code?: unknown;
      statusCode?: unknown;
      details?: unknown;
      operation?: unknown;
      stage?: unknown;
      cause?: unknown;
    };

    if (maybeError.code !== undefined) {
      payload.code = maybeError.code;
    }
    if (maybeError.statusCode !== undefined) {
      payload.statusCode = maybeError.statusCode;
    }
    if (maybeError.details !== undefined) {
      payload.details = sanitizeForLogging(maybeError.details);
    }
    if (maybeError.operation !== undefined) {
      payload.operation = maybeError.operation;
    }
    if (maybeError.stage !== undefined) {
      payload.stage = maybeError.stage;
    }
    if (maybeError.cause) {
      payload.cause = serializeError(maybeError.cause, includeStack, depth + 1);
    }

    return payload;
  }

  return sanitizeForLogging({ nonErrorThrown: error });
}

function stripUndefined(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

export function createServerLogger(service: string, requestId?: string) {
  const level = resolveLogLevel();
  const threshold = LEVEL_RANK[level];
  const includeStack = shouldIncludeStack();

  function shouldLog(messageLevel: LogLevel) {
    return LEVEL_RANK[messageLevel] >= threshold;
  }

  function emit(messageLevel: LogLevel, event: LogEvent = {}) {
    if (!shouldLog(messageLevel)) {
      return;
    }

    const envelope = stripUndefined({
      timestamp: new Date().toISOString(),
      level: messageLevel,
      service,
      requestId: event.requestId || requestId,
      operation: event.operation,
      stage: event.stage,
      durationMs: event.durationMs,
      status: event.status,
      context: event.context ? sanitizeForLogging(event.context) : undefined,
      error: event.error ? serializeError(event.error, includeStack) : undefined,
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
    debug: (event: LogEvent) => emit("debug", event),
    info: (event: LogEvent) => emit("info", event),
    warn: (event: LogEvent) => emit("warn", event),
    error: (event: LogEvent) => emit("error", event),
  };
}

export function getRequestId(incomingRequestId?: string | null) {
  if (incomingRequestId && incomingRequestId.trim()) {
    return incomingRequestId;
  }

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
