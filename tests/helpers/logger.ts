import { Writable } from "node:stream";
import type { Logger } from "pino";
import { createLogger } from "../../src/shared/logger";

export type CapturedLogger = {
  logger: Logger;
  records: Array<Record<string, unknown>>;
};

export function createCapturedLogger(): CapturedLogger {
  const records: Array<Record<string, unknown>> = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      records.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });

  return {
    logger: createLogger(
      { level: "info", base: null, timestamp: false },
      destination,
    ),
    records,
  };
}
