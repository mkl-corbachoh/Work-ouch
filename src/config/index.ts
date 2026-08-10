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
});

export type AppConfig = {
  databasePath: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
};

export type ConfigEnvironment = Partial<
  Record<"DATABASE_PATH" | "PORT" | "NODE_ENV", string | undefined>
>;

export function parseConfig(environment: ConfigEnvironment): AppConfig {
  const parsed = configSchema.parse(environment);

  return {
    databasePath: parsed.DATABASE_PATH,
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
  };
}

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return parseConfig({
    DATABASE_PATH: environment.DATABASE_PATH,
    PORT: environment.PORT,
    NODE_ENV: environment.NODE_ENV,
  });
}
