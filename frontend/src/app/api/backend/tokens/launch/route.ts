import { NextResponse } from "next/server";
import {
  buildProxyErrorDiagnostics,
  fetchBackendJson,
  getBackendCandidates,
} from "@/lib/backend";
import { createServerLogger, getRequestId, sanitizeForLogging } from "@/lib/logging";

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.tokens.launch", requestId);
  const operation = "proxy.tokens.launch";
  const startedAt = Date.now();
  const frontendOrigin = new URL(request.url).origin;

  try {
    const body = await request.json();
    logger.info({
      operation,
      stage: "start",
      status: "start",
      context: {
        frontendOrigin,
        payload: sanitizeForLogging(body),
      },
    });

    const { data, response, backendUrl } = await fetchBackendJson(
      "/api/tokens/launch",
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

    return NextResponse.json(
      {
        ...(data as object),
        backendUrl,
        frontendOrigin,
        requestId,
      },
      {
        status: response.status,
        headers: {
          "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Frontend proxy could not reach backend token launch endpoint.";
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
        message,
        operation,
        stage: "failure",
        requestId,
        frontendOrigin,
        backendCandidates: getBackendCandidates(),
        diagnostics,
      },
      {
        status: 502,
        headers: {
          "x-request-id": requestId,
        },
      }
    );
  }
}
