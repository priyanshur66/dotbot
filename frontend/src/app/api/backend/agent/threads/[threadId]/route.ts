import { NextResponse } from "next/server";
import {
  buildProxyErrorDiagnostics,
  fetchBackendJson,
  getBackendCandidates,
} from "@/lib/backend";
import { createServerLogger, getRequestId } from "@/lib/logging";

export async function GET(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.agent.thread", requestId);
  const operation = "proxy.agent.thread.get";
  const startedAt = Date.now();
  const frontendOrigin = new URL(request.url).origin;

  try {
    const { threadId } = await context.params;
    const requestUrl = new URL(request.url);
    const walletAddress = requestUrl.searchParams.get("walletAddress") || "";

    const { data, response, backendUrl } = await fetchBackendJson(
      `/api/agent/threads/${encodeURIComponent(
        threadId
      )}?walletAddress=${encodeURIComponent(walletAddress)}`,
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
        threadId,
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
        message: error instanceof Error ? error.message : "Failed to load thread.",
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
