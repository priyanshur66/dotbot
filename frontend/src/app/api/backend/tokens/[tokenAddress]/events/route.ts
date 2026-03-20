import { NextResponse } from "next/server";
import {
  buildProxyErrorDiagnostics,
  fetchBackendJson,
  getBackendCandidates,
} from "@/lib/backend";
import { createServerLogger, getRequestId } from "@/lib/logging";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenAddress: string }> }
) {
  const { tokenAddress } = await params;
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.tokens.events", requestId);
  const operation = "proxy.tokens.events";
  const frontendOrigin = new URL(request.url).origin;
  const requestUrl = new URL(request.url);
  const limit = requestUrl.searchParams.get("limit") || "100";

  try {
    const { data, response, backendUrl } = await fetchBackendJson(
      `/api/tokens/${encodeURIComponent(tokenAddress)}/events?limit=${encodeURIComponent(limit)}`,
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
        frontendOrigin,
        requestId,
      },
      {
        status: response.status,
        headers: { "x-request-id": requestId },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch token events.";
    const diagnostics = buildProxyErrorDiagnostics(error);
    logger.error({ operation, stage: "failure", status: "failure", error, context: diagnostics });
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
      { status: 502, headers: { "x-request-id": requestId } }
    );
  }
}
