import { NextResponse } from "next/server";
import { fetchBackendJson, getBackendCandidates } from "@/lib/backend";

export async function GET(request: Request) {
  const frontendOrigin = new URL(request.url).origin;
  const requestUrl = new URL(request.url);
  const ownerAddress = requestUrl.searchParams.get("ownerAddress");

  if (!ownerAddress) {
    return NextResponse.json(
      {
        error: "BAD_REQUEST",
        message: "`ownerAddress` query parameter is required",
      },
      { status: 400 }
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
        : "Frontend proxy could not fetch launched tokens by owner.";

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
