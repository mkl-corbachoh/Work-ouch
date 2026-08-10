import { describe, expect, it } from "vitest";
import { parseConfig, readConfig } from "../../src/config";

describe("configuration", () => {
  it("uses local defaults only for undefined values", () => {
    expect(parseConfig({})).toEqual({
      databasePath: "./data/training.db",
      port: 3000,
      nodeEnv: "development",
    });
  });

  it("parses explicit values", () => {
    expect(
      parseConfig({
        DATABASE_PATH: "/tmp/training.sqlite",
        PORT: "4321",
        NODE_ENV: "production",
      }),
    ).toEqual({
      databasePath: "/tmp/training.sqlite",
      port: 4321,
      nodeEnv: "production",
    });
  });

  it.each([
    ["DATABASE_PATH", { DATABASE_PATH: "" }],
    ["PORT", { PORT: "" }],
    ["NODE_ENV", { NODE_ENV: "" }],
  ])("rejects an empty %s", (variable, environment) => {
    expect(() => parseConfig(environment)).toThrow(variable);
  });

  it.each(["0", "65536", "1.5", "abc", " 3000", "3000 "])(
    "rejects invalid port %s",
    (port) => {
      expect(() => parseConfig({ PORT: port })).toThrow("PORT");
    },
  );

  it("rejects an unknown environment", () => {
    expect(() => parseConfig({ NODE_ENV: "staging" })).toThrow("NODE_ENV");
  });

  it("reads only supported variables from a process environment", () => {
    expect(
      readConfig({
        DATABASE_PATH: ":memory:",
        PORT: "3001",
        NODE_ENV: "test",
        UNRELATED: "ignored",
      }),
    ).toEqual({
      databasePath: ":memory:",
      port: 3001,
      nodeEnv: "test",
    });
  });
});
