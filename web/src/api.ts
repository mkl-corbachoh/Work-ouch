export type ApiError = { code?: string; message?: string; details?: unknown };
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: ApiError = {},
  ) {
    super(body.message || `Request failed (${status})`);
  }
}
export class RequestCancelledError extends Error {
  constructor() {
    super("Request cancelled");
    this.name = "AbortError";
  }
}
export function errorMessage(
  error: unknown,
  fallback = "The request could not be completed.",
) {
  if (error instanceof HttpError) {
    if (error.status === 404) return "Resource not found.";
    if (error.status === 409)
      return "This resource changed. Your draft was kept.";
    if (error.status === 0)
      return "You appear to be offline. Nothing was saved.";
    if (error.status === 401)
      return "Your session expired. Please sign in again.";
  }
  return fallback;
}
export type TokenSource = () => Promise<string | null>;
export function createApi(
  getToken: TokenSource,
  onUnauthorized?: () => Promise<boolean>,
  onTerminalUnauthorized?: () => Promise<void>,
) {
  async function request<T>(
    path: string,
    init: RequestInit = {},
    retried = false,
  ): Promise<T> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await fetch(`/api/v1${path}`, { ...init, headers });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw new RequestCancelledError();
      throw new HttpError(0, {
        code: "OFFLINE",
        message: "Unable to reach Training API.",
      });
    }
    if (
      response.status === 401 &&
      !retried &&
      onUnauthorized &&
      (await onUnauthorized())
    )
      return request<T>(path, init, true);
    if (response.status === 401 && retried) {
      await onTerminalUnauthorized?.();
    }
    let body: unknown = null;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        body = {};
      }
    }
    if (!response.ok)
      throw new HttpError(response.status, (body || {}) as ApiError);
    return body as T;
  }
  return {
    request,
    get: <T>(path: string, signal?: AbortSignal) =>
      request<T>(path, { signal }),
    post: <T>(path: string, body: unknown, signal?: AbortSignal) =>
      request<T>(path, { method: "POST", body: JSON.stringify(body), signal }),
    put: <T>(path: string, body: unknown, signal?: AbortSignal) =>
      request<T>(path, { method: "PUT", body: JSON.stringify(body), signal }),
  };
}
export const id = (value: string | undefined) => {
  if (!value || !/^[1-9]\d*$/.test(value))
    throw new Error("Invalid resource id");
  return value;
};
