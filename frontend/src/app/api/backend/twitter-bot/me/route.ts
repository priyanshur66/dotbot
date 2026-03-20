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
  const logger = createServerLogger("frontend.proxy.twitterBot.me", requestId);
  const operation = "proxy.twitterBot.me.get";
  const frontendOrigin = new URL(request.url).origin;

  try {
    const requestUrl = new URL(request.url);
    const walletAddress = requestUrl.searchParams.get("walletAddress") || "";
    const { data, response, backendUrl } = await fetchBackendJson(
      `/api/twitter-bot/me?walletAddress=${encodeURIComponent(walletAddress)}`,
      { method: "GET" },
      {
        excludeOrigins: [frontendOrigin],
        requestId,
        operation: `${operation}.backend`,
      }
    );

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
      error,
      context: diagnostics,
    });
    return NextResponse.json(
      {
        error: "BACKEND_UNREACHABLE",
        message:
          error instanceof Error ? error.message : "Failed to load twitter bot settings.",
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

export async function PUT(request: Request) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.twitterBot.me", requestId);
  const operation = "proxy.twitterBot.me.put";
  const frontendOrigin = new URL(request.url).origin;

  try {
    const body = await request.json();
    const { data, response, backendUrl } = await fetchBackendJson(
      "/api/twitter-bot/me",
      {
        method: "PUT",
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
      context: {
        backendUrl,
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
      error,
      context: diagnostics,
    });
    return NextResponse.json(
      {
        error: "BACKEND_UNREACHABLE",
        message:
          error instanceof Error ? error.message : "Failed to save twitter bot settings.",
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
