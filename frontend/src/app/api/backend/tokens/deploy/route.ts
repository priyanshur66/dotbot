import { NextResponse } from "next/server";
import { fetchBackendJson, getBackendCandidates } from "@/lib/backend";

export async function POST(request: Request) {
  const frontendOrigin = new URL(request.url).origin;

  try {
    const body = await request.json();
    const { data, response, backendUrl } = await fetchBackendJson(
      "/api/tokens/deploy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      {
        excludeOrigins: [frontendOrigin],
      }
    );

    return NextResponse.json(
      {
        ...(data as object),
        backendUrl,
        frontendOrigin,
      },
      { status: response.status }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Frontend proxy could not reach backend token deploy endpoint.";

    return NextResponse.json(
      {
        error: "BACKEND_UNREACHABLE",
        message,
        frontendOrigin,
        backendCandidates: getBackendCandidates(),
      },
      { status: 502 }
    );
  }
}
