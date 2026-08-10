import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";

export function createLogger(
  options: LoggerOptions = { level: "info" },
  destination?: DestinationStream,
): Logger {
  return pino(options, destination);
}
