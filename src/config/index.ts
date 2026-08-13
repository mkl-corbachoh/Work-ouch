import { z } from "zod";

const configSchema = z.object({
  DATABASE_PATH: z
    .string()
    .min(1, "DATABASE_PATH must not be empty")
    .default("./data/training.db"),
  PORT: z
    .string()
    .regex(/^\d+$/, "PORT must be a decimal integer")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65_535))
    .default(3000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  AUTH_ISSUER: z.string().url().min(1).optional(),
  AUTH_AUDIENCE: z.string().trim().min(1).optional(),
  AUTH_JWKS_URL: z.string().url().min(1).optional(),
});

export type AppConfig = {
  databasePath: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  auth?: { issuer: string; audience: string; jwksUrl: string };
};

export type ConfigEnvironment = Partial<
  Record<
    | "DATABASE_PATH"
    | "PORT"
    | "NODE_ENV"
    | "AUTH_ISSUER"
    | "AUTH_AUDIENCE"
    | "AUTH_JWKS_URL",
    string | undefined
  >
>;

export function parseConfig(environment: ConfigEnvironment): AppConfig {
  const parsed = configSchema.parse(environment);

  const authValues = [
    parsed.AUTH_ISSUER,
    parsed.AUTH_AUDIENCE,
    parsed.AUTH_JWKS_URL,
  ];
  if (
    authValues.some((value) => value !== undefined) &&
    authValues.some((value) => value === undefined)
  ) {
    throw new Error(
      "AUTH_ISSUER, AUTH_AUDIENCE and AUTH_JWKS_URL must be configured together",
    );
  }

  return {
    databasePath: parsed.DATABASE_PATH,
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    auth: parsed.AUTH_ISSUER
      ? {
          issuer: parsed.AUTH_ISSUER,
          audience: parsed.AUTH_AUDIENCE as string,
          jwksUrl: parsed.AUTH_JWKS_URL as string,
        }
      : undefined,
  };
}

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return parseConfig({
    DATABASE_PATH: environment.DATABASE_PATH,
    PORT: environment.PORT,
    NODE_ENV: environment.NODE_ENV,
    AUTH_ISSUER: environment.AUTH_ISSUER,
    AUTH_AUDIENCE: environment.AUTH_AUDIENCE,
    AUTH_JWKS_URL: environment.AUTH_JWKS_URL,
  });
}
