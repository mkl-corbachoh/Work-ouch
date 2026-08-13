import { Router } from "express";
import type { SqliteDatabase } from "../../db/connection";
import { HttpError } from "../../shared/http-errors";
import { requireExternalAuth } from "./auth.middleware";
import type { AuthProvider } from "./auth.provider";
import { AuthRepository } from "./auth.repository";

export function createAuthRouter(
  database: SqliteDatabase,
  provider: AuthProvider,
): Router {
  const router = Router();
  const repository = new AuthRepository(database);
  router.post(
    "/bootstrap",
    requireExternalAuth(provider),
    (request, response) => {
      const identity = request.externalIdentity;
      if (!identity) {
        throw new HttpError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication required",
        );
      }
      response.status(200).json(repository.bootstrap(identity));
    },
  );
  return router;
}

export function createMeRouter(): Router {
  const router = Router();
  router.get("/", (request, response) =>
    response.status(200).json(request.currentUser),
  );
  return router;
}
