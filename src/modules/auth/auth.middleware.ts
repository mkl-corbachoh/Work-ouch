import type { RequestHandler } from "express";
import { HttpError } from "../../shared/http-errors";
import type { AuthProvider } from "./auth.provider";
import type { AuthRepository } from "./auth.repository";

export function requireAuth(
  provider: AuthProvider,
  repository: AuthRepository,
): RequestHandler {
  return async (request, _response, next) => {
    const header = request.get("authorization");
    const token = header?.match(/^Bearer ([^ ]+)$/i)?.[1];
    if (!token) {
      next(
        new HttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication required",
        ),
      );
      return;
    }
    try {
      const identity = await provider.verify(token);
      const user = repository.findByIdentity(identity);
      if (!user) {
        next(
          new HttpError(
            401,
            "AUTHENTICATION_REQUIRED",
            "Authentication required",
          ),
        );
        return;
      }
      request.externalIdentity = identity;
      request.currentUser = user;
      next();
    } catch (error) {
      next(
        new HttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication required",
          null,
          error,
        ),
      );
    }
  };
}

export function requireExternalAuth(provider: AuthProvider): RequestHandler {
  return async (request, _response, next) => {
    const token = request.get("authorization")?.match(/^Bearer ([^ ]+)$/i)?.[1];
    if (!token)
      return next(
        new HttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication required",
        ),
      );
    try {
      request.externalIdentity = await provider.verify(token);
      next();
    } catch (error) {
      next(
        new HttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication required",
          null,
          error,
        ),
      );
    }
  };
}

export const bindCurrentUser: RequestHandler = (request, _response, next) => {
  const userId = request.currentUser?.id;
  if (!userId) {
    next(
      new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication required"),
    );
    return;
  }
  if (request.body && typeof request.body === "object")
    request.body.userId = userId;
  if (request.query && typeof request.query === "object")
    request.query.userId = String(userId);
  if (request.params && typeof request.params === "object")
    request.params.userId = String(userId);
  next();
};
