import { NextResponse } from "next/server";
import {
  buildProxyErrorDiagnostics,
  fetchBackendJson,
  getBackendCandidates,
} from "@/lib/backend";
import {
  createServerLogger,
  getRequestId,
  sanitizeForLogging,
} from "@/lib/logging";

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.agent.threads", requestId);
  const operation = "proxy.agent.threads.list";
  const startedAt = Date.now();
  const frontendOrigin = new URL(request.url).origin;

  try {
    const requestUrl = new URL(request.url);
    const walletAddress = requestUrl.searchParams.get("walletAddress") || "";
    const { data, response, backendUrl } = await fetchBackendJson(
      `/api/agent/threads?walletAddress=${encodeURIComponent(walletAddress)}`,
      { method: "GET" },
      {
        excludeOrigins: [frontendOrigin],
        requestId,
        operation: `${operation}.backend`,
      }
    );

    logger.info({
      operation,
      stage: "success",
      status: response.ok ? "success" : "failure",
      durationMs: Date.now() - startedAt,
      context: {
        backendUrl,
        statusCode: response.status,
      },
    });

    return NextResponse.json(
      {
        ...(data as object),
        backendUrl,
        requestId,
      },
      {
        status: response.status,
        headers: { "x-request-id": requestId },
      }
    );
  } catch (error) {
    const diagnostics = buildProxyErrorDiagnostics(error);
    logger.error({
      operation,
      stage: "failure",
      status: "failure",
      durationMs: Date.now() - startedAt,
      error,
      context: diagnostics,
    });

    return NextResponse.json(
      {
        error: "BACKEND_UNREACHABLE",
        message:
          error instanceof Error ? error.message : "Failed to load chat threads.",
        operation,
        stage: "failure",
        requestId,
        backendCandidates: getBackendCandidates(),
        diagnostics,
      },
      {
        status: 502,
        headers: { "x-request-id": requestId },
      }
    );
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.agent.threads", requestId);
  const operation = "proxy.agent.threads.create";
  const startedAt = Date.now();
  const frontendOrigin = new URL(request.url).origin;

  try {
    const body = await request.json();
    const { data, response, backendUrl } = await fetchBackendJson(
      "/api/agent/threads",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      {
        excludeOrigins: [frontendOrigin],
        requestId,
        operation: `${operation}.backend`,
      }
    );

    logger.info({
      operation,
      stage: "success",
      status: response.ok ? "success" : "failure",
      durationMs: Date.now() - startedAt,
      context: {
        backendUrl,
        statusCode: response.status,
        payload: sanitizeForLogging(body),
      },
    });

    return NextResponse.json(
      {
        ...(data as object),
        backendUrl,
        requestId,
      },
      {
        status: response.status,
        headers: { "x-request-id": requestId },
      }
    );
  } catch (error) {
    const diagnostics = buildProxyErrorDiagnostics(error);
    logger.error({
      operation,
      stage: "failure",
      status: "failure",
      durationMs: Date.now() - startedAt,
      error,
      context: diagnostics,
    });

    return NextResponse.json(
      {
        error: "BACKEND_UNREACHABLE",
        message:
          error instanceof Error ? error.message : "Failed to create chat thread.",
        operation,
        stage: "failure",
        requestId,
        backendCandidates: getBackendCandidates(),
        diagnostics,
      },
      {
        status: 502,
        headers: { "x-request-id": requestId },
      }
    );
  }
}
