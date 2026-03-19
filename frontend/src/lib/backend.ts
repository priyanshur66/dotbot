type ProxyFetchResult = {
  data: unknown;
  response: Response;
  backendUrl: string;
};

type BackendFetchOptions = {
  excludeOrigins?: string[];
};

function normalizeUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isSameLocalOriginAlias(leftOrigin: string, rightOrigin: string) {
  try {
    const left = new URL(leftOrigin);
    const right = new URL(rightOrigin);
    return (
      left.protocol === right.protocol &&
      left.port === right.port &&
      isLocalHostname(left.hostname) &&
      isLocalHostname(right.hostname)
    );
  } catch {
    return false;
  }
}

export function getBackendCandidates() {
  const candidates = [
    process.env.BACKEND_BASE_URL,
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeUrl(value));

  return Array.from(new Set(candidates));
}

export async function fetchBackendJson(
  path: string,
  init?: RequestInit,
  options: BackendFetchOptions = {}
): Promise<ProxyFetchResult> {
  const excluded = (options.excludeOrigins || []).map((origin) =>
    normalizeUrl(origin)
  );
  const candidates = getBackendCandidates().filter((candidate) => {
    return !excluded.some(
      (excludedOrigin) =>
        candidate === excludedOrigin ||
        isSameLocalOriginAlias(candidate, excludedOrigin)
    );
  });
  const errors: string[] = [];

  if (candidates.length === 0) {
    throw new Error("No backend candidates available after self-origin filtering.");
  }

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        errors.push(
          `${baseUrl}: non-JSON response (${response.status} ${response.statusText})`
        );
        continue;
      }

      const data = await response.json();
      return { data, response, backendUrl: baseUrl };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "unknown connection error";
      errors.push(`${baseUrl}: ${reason}`);
    }
  }

  throw new Error(`Unable to reach backend. Attempts: ${errors.join(" | ")}`);
}
