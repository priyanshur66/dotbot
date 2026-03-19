import {
  createServerLogger,
  sanitizeForLogging,
  serializeError,
} from "@/lib/logging";

export type BackendAttemptDiagnostic = {
  backendUrl: string;
  stage: string;
  elapsedMs: number;
  status?: number;
  statusText?: string;
  contentType?: string;
  reason?: string;
  responseSnippet?: string;
};

type ProxyFetchResult = {
  data: unknown;
  response: Response;
  backendUrl: string;
  attempts: BackendAttemptDiagnostic[];
};

type BackendFetchOptions = {
  excludeOrigins?: string[];
  requestId?: string;
  operation?: string;
};

type BackendProxyErrorDetails = {
  code: string;
  requestId?: string;
  operation?: string;
  stage?: string;
  path: string;
  candidates: string[];
  attempts: BackendAttemptDiagnostic[];
};

export class BackendProxyError extends Error {
  code: string;
  requestId?: string;
  operation?: string;
  stage?: string;
  path: string;
  candidates: string[];
  attempts: BackendAttemptDiagnostic[];

  constructor(message: string, details: BackendProxyErrorDetails, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "BackendProxyError";
    this.code = details.code;
    this.requestId = details.requestId;
    this.operation = details.operation;
    this.stage = details.stage;
    this.path = details.path;
    this.candidates = details.candidates;
    this.attempts = details.attempts;
  }
}

function normalizeUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isSameLocalOriginAlias(leftOrigin: string, rightOrigin: string) {
  try {
    const left = new URL(leftOrigin);
    const right = new URL(rightOrigin);
    return (
      left.protocol === right.protocol &&
      left.port === right.port &&
      isLocalHostname(left.hostname) &&
      isLocalHostname(right.hostname)
    );
  } catch {
    return false;
  }
}

function toHeaders(headers?: HeadersInit) {
  const normalized = new Headers(headers || {});
  return normalized;
}

function toSnippet(input: string, size = 512) {
  if (input.length <= size) {
    return input;
  }
  return `${input.slice(0, size)}...(truncated)`;
}

export function getBackendCandidates() {
  const candidates = [
    process.env.BACKEND_BASE_URL,
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeUrl(value));

  return Array.from(new Set(candidates));
}

export async function fetchBackendJson(
  path: string,
  init?: RequestInit,
  options: BackendFetchOptions = {}
): Promise<ProxyFetchResult> {
  const operation = options.operation || "proxy.backend.fetch";
  const requestId = options.requestId;
  const logger = createServerLogger("frontend.proxy.backend", requestId);
  const startedAt = Date.now();

  const excluded = (options.excludeOrigins || []).map((origin) =>
    normalizeUrl(origin)
  );
  const candidates = getBackendCandidates().filter((candidate) => {
    return !excluded.some(
      (excludedOrigin) =>
        candidate === excludedOrigin ||
        isSameLocalOriginAlias(candidate, excludedOrigin)
    );
  });
  const attempts: BackendAttemptDiagnostic[] = [];

  logger.info({
    operation,
    stage: "candidateSelection",
    status: "start",
    context: {
      path,
      candidates,
      excluded,
    },
  });

  if (candidates.length === 0) {
    const proxyError = new BackendProxyError(
      "No backend candidates available after self-origin filtering.",
      {
        code: "BACKEND_CANDIDATES_EMPTY",
        requestId,
        operation,
        stage: "candidateSelection",
        path,
        candidates,
        attempts,
      }
    );
    logger.error({
      operation,
      stage: "candidateSelection",
      status: "failure",
      durationMs: Date.now() - startedAt,
      error: proxyError,
    });
    throw proxyError;
  }

  for (const baseUrl of candidates) {
    const attemptStartedAt = Date.now();
    const headers = toHeaders(init?.headers);
    if (requestId) {
      headers.set("x-request-id", requestId);
    }

    logger.info({
      operation,
      stage: "attempt.start",
      status: "start",
      context: {
        path,
        baseUrl,
      },
    });

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") || "";
      const elapsedMs = Date.now() - attemptStartedAt;

      if (!contentType.includes("application/json")) {
        const responseSnippet = await response.text().then((value) => toSnippet(value));
        const diagnostic: BackendAttemptDiagnostic = {
          backendUrl: baseUrl,
          stage: "attempt.non_json_response",
          elapsedMs,
          status: response.status,
          statusText: response.statusText,
          contentType,
          responseSnippet,
          reason: "Received non-JSON response from backend.",
        };
        attempts.push(diagnostic);

        logger.warn({
          operation,
          stage: "attempt.non_json_response",
          status: "failure",
          durationMs: elapsedMs,
          context: sanitizeForLogging(diagnostic),
        });
        continue;
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        const diagnostic: BackendAttemptDiagnostic = {
          backendUrl: baseUrl,
          stage: "attempt.json_parse_error",
          elapsedMs,
          status: response.status,
          statusText: response.statusText,
          contentType,
          reason: error instanceof Error ? error.message : "JSON parse failed",
        };
        attempts.push(diagnostic);

        logger.warn({
          operation,
          stage: "attempt.json_parse_error",
          status: "failure",
          durationMs: elapsedMs,
          context: sanitizeForLogging(diagnostic),
          error,
        });
        continue;
      }

      logger.info({
        operation,
        stage: "attempt.response",
        status: response.ok ? "success" : "failure",
        durationMs: elapsedMs,
        context: {
          backendUrl: baseUrl,
          statusCode: response.status,
          statusText: response.statusText,
        },
      });

      return { data, response, backendUrl: baseUrl, attempts };
    } catch (error) {
      const diagnostic: BackendAttemptDiagnostic = {
        backendUrl: baseUrl,
        stage: "attempt.network_error",
        elapsedMs: Date.now() - attemptStartedAt,
        reason: error instanceof Error ? error.message : "unknown connection error",
      };
      attempts.push(diagnostic);

      logger.warn({
        operation,
        stage: "attempt.network_error",
        status: "failure",
        durationMs: diagnostic.elapsedMs,
        context: sanitizeForLogging(diagnostic),
        error,
      });
    }
  }

  const backendError = new BackendProxyError("Unable to reach backend", {
    code: "BACKEND_UNREACHABLE",
    requestId,
    operation,
    stage: "attempts_exhausted",
    path,
    candidates,
    attempts,
  });

  logger.error({
    operation,
    stage: "attempts_exhausted",
    status: "failure",
    durationMs: Date.now() - startedAt,
    context: {
      path,
      candidates,
      attempts,
    },
    error: backendError,
  });

  throw backendError;
}

export function buildProxyErrorDiagnostics(error: unknown) {
  if (error instanceof BackendProxyError) {
    return sanitizeForLogging({
      requestId: error.requestId,
      operation: error.operation,
      stage: error.stage,
      code: error.code,
      path: error.path,
      candidates: error.candidates,
      attempts: error.attempts,
      error: serializeError(error),
    });
  }

  return sanitizeForLogging({
    error: serializeError(error),
  });
}
