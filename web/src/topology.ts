export const API_PATH_PREFIX = "/api/v1";
export function forwardedApiPath(path: string) {
  if (!path.startsWith(API_PATH_PREFIX))
    throw new Error("Only versioned API paths may be forwarded");
  return path;
}
export function productionRoute(path: string) {
  return path.startsWith(API_PATH_PREFIX)
    ? "training-api"
    : "spa-index-fallback";
}
