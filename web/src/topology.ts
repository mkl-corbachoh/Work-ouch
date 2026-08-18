export const API_PATH_PREFIX = "/api/v1";

function isApiPath(path: string) {
  return path === API_PATH_PREFIX || path.startsWith(`${API_PATH_PREFIX}/`);
}

export function forwardedApiPath(path: string) {
  if (!isApiPath(path))
    throw new Error("Only versioned API paths may be forwarded");
  return path;
}

export function productionRoute(path: string) {
  return isApiPath(path) || path === "/health"
    ? "training-api"
    : "spa-index-fallback";
}
