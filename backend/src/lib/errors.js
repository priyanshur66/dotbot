class HttpError extends Error {
  constructor(message, statusCode, code, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends HttpError {
  constructor(message, details) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

class ConfigError extends HttpError {
  constructor(message, details) {
    super(message, 500, "SERVER_MISCONFIGURATION", details);
  }
}

class CompileError extends HttpError {
  constructor(message, details) {
    super(message, 500, "CONTRACT_COMPILE_FAILED", details);
  }
}

class OnChainError extends HttpError {
  constructor(message, details, cause) {
    super(message, 502, "ON_CHAIN_TRANSACTION_FAILED", details);
    this.cause = cause;
  }
}

class DataStoreError extends HttpError {
  constructor(message, details, cause) {
    super(message, 500, "TOKEN_REGISTRY_WRITE_FAILED", details);
    this.cause = cause;
  }
}

class AgentBadRequestError extends HttpError {
  constructor(message, details) {
    super(message, 400, "AGENT_BAD_REQUEST", details);
  }
}

class AgentToolExecutionError extends HttpError {
  constructor(message, details, cause) {
    super(message, 502, "AGENT_TOOL_EXECUTION_FAILED", details);
    this.cause = cause;
  }
}

class AgentModelError extends HttpError {
  constructor(message, details, cause) {
    super(message, 502, "AGENT_MODEL_FAILED", details);
    this.cause = cause;
  }
}

module.exports = {
  HttpError,
  ValidationError,
  ConfigError,
  CompileError,
  OnChainError,
  DataStoreError,
  AgentBadRequestError,
  AgentToolExecutionError,
  AgentModelError,
};
