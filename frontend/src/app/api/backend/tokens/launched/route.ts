import { NextResponse } from "next/server";
import { fetchBackendJson, getBackendCandidates } from "@/lib/backend";

export async function GET(request: Request) {
  const frontendOrigin = new URL(request.url).origin;

  try {
    const { data, response, backendUrl } = await fetchBackendJson(
      "/api/tokens/launched",
      {
        method: "GET",
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
        : "Frontend proxy could not fetch launched tokens.";

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
