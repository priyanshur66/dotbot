import { NextResponse } from "next/server";
import {
  buildProxyErrorDiagnostics,
  fetchBackendJson,
  getBackendCandidates,
} from "@/lib/backend";
import { createServerLogger, getRequestId } from "@/lib/logging";

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.tokens.byOwner", requestId);
  const operation = "proxy.tokens.byOwner";
  const startedAt = Date.now();
  const frontendOrigin = new URL(request.url).origin;
  const requestUrl = new URL(request.url);
  const ownerAddress = requestUrl.searchParams.get("ownerAddress");
  logger.info({
    operation,
    stage: "start",
    status: "start",
    context: {
      frontendOrigin,
      ownerAddress,
    },
  });

  if (!ownerAddress) {
    logger.warn({
      operation,
      stage: "validate.ownerAddress",
      status: "failure",
      durationMs: Date.now() - startedAt,
      context: {
        query: requestUrl.search,
      },
    });
    return NextResponse.json(
      {
        error: "BAD_REQUEST",
        message: "`ownerAddress` query parameter is required",
        operation,
        stage: "validate.ownerAddress",
        requestId,
      },
      {
        status: 400,
        headers: {
          "x-request-id": requestId,
        },
      }
    );
  }

  try {
    const encodedOwnerAddress = encodeURIComponent(ownerAddress);
    const { data, response, backendUrl } = await fetchBackendJson(
      `/api/tokens/by-owner/${encodedOwnerAddress}`,
      {
        method: "GET",
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
        ownerAddress,
        statusCode: response.status,
      },
    });

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
        : "Frontend proxy could not fetch launched tokens by owner.";
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
