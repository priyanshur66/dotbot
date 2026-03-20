import { NextResponse } from "next/server";
import {
  buildProxyErrorDiagnostics,
  fetchBackendJson,
  getBackendCandidates,
} from "@/lib/backend";
import { createServerLogger, getRequestId } from "@/lib/logging";

export async function GET(
  request: Request,
  context: { params: Promise<{ walletAddress: string }> }
) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.twitterBot.events", requestId);
  const operation = "proxy.twitterBot.events.get";
  const frontendOrigin = new URL(request.url).origin;

  try {
    const { walletAddress } = await context.params;
    const { data, response, backendUrl } = await fetchBackendJson(
      `/api/twitter-bot/events/${encodeURIComponent(walletAddress)}`,
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
          error instanceof Error ? error.message : "Failed to load twitter bot activity.",
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
