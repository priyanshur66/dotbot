import { NextResponse } from "next/server";
import { getBackendCandidates } from "@/lib/backend";
import {
  createServerLogger,
  getRequestId,
  sanitizeForLogging,
} from "@/lib/logging";

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> }
) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const logger = createServerLogger("frontend.proxy.agent.thread.reply", requestId);
  const operation = "proxy.agent.thread.reply";
  const startedAt = Date.now();
  const frontendOrigin = new URL(request.url).origin;

  try {
    const body = await request.json();
    const { threadId } = await context.params;
    const candidates = getBackendCandidates().filter(
      (candidate) => candidate !== frontendOrigin
    );

    for (const backendUrl of candidates) {
      try {
        const response = await fetch(
          `${backendUrl}/api/agent/threads/${encodeURIComponent(threadId)}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-request-id": requestId,
            },
            body: JSON.stringify(body),
            cache: "no-store",
          }
        );

        logger.info({
          operation,
          stage: "attempt.response",
          status: response.ok ? "success" : "failure",
          durationMs: Date.now() - startedAt,
          context: {
            backendUrl,
            statusCode: response.status,
            payload: sanitizeForLogging(body),
          },
        });

        const contentType =
          response.headers.get("content-type") || "application/json; charset=utf-8";

        return new NextResponse(response.body, {
          status: response.status,
          headers: {
            "x-request-id": requestId,
            "content-type": contentType,
            "cache-control": response.headers.get("cache-control") || "no-cache",
            connection: response.headers.get("connection") || "keep-alive",
          },
        });
      } catch (attemptError) {
        logger.warn({
          operation,
          stage: "attempt.network_error",
          status: "failure",
          context: {
            backendUrl,
            reason:
              attemptError instanceof Error
                ? attemptError.message
                : "Unknown backend connection error",
          },
          error: attemptError,
        });
      }
    }

    throw new Error("Unable to reach backend thread reply endpoint");
  } catch (error) {
    logger.error({
      operation,
      stage: "failure",
      status: "failure",
      durationMs: Date.now() - startedAt,
      context: {
        error: sanitizeForLogging(error),
      },
      error,
    });

    return NextResponse.json(
      {
        error: "BACKEND_UNREACHABLE",
        message:
          error instanceof Error ? error.message : "Failed to stream thread reply.",
        requestId,
        operation,
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
