import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface YfinanceQuarterlyMetricRow {
  close_date: string;
  quarter: string;
  revenue: number | null;
  eps: number | null;
  eps_estimate: number | null;
  eps_reported: number | null;
}

export interface YfinanceQuarterlyMetrics {
  ticker: string;
  history_incomplete: boolean;
  available_quarters: number;
  next_earnings_date: string | null;
  rows: YfinanceQuarterlyMetricRow[];
}

const DEFAULT_TIMEOUT_MS = 15_000;

function resolvePythonBin(): string {
  return process.env.PYTHON_BIN?.trim() || "python";
}

function resolveScriptPath(): string {
  return path.join(process.cwd(), "scripts", "yfinance-quarterly-metrics.py");
}

export async function getQuarterlyMetricsFromYfinance(
  ticker: string,
  limit = 16
): Promise<YfinanceQuarterlyMetrics | null> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return null;

  const scriptPath = resolveScriptPath();
  const pythonBin = resolvePythonBin();

  try {
    const { stdout } = await execFileAsync(
      pythonBin,
      [scriptPath, "--ticker", normalized, "--limit", String(limit)],
      {
        timeout: DEFAULT_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }
    );

    const trimmed = stdout.trim();
    if (!trimmed) return null;

    const payload = JSON.parse(trimmed) as YfinanceQuarterlyMetrics & { error?: string };
    if (payload.error) {
      return null;
    }

    if (!Array.isArray(payload.rows)) return null;
    return payload;
  } catch {
    return null;
  }
}
