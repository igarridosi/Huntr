/** One JSON object per line: what Application Insights and GitHub Actions both read. */

export type Level = "info" | "warn" | "error";

export interface Logger {
  (level: Level, msg: string, fields?: Record<string, unknown>): void;
}

export function jsonLogger(write: (line: string) => void = (line) => process.stdout.write(line + "\n")): Logger {
  return (level, msg, fields = {}) => write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }));
}

export const silentLogger: Logger = () => {};
