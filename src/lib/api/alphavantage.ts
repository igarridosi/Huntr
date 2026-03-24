import type {
  BalanceSheet,
  CashFlowStatement,
  CompanyFinancials,
  IncomeStatement,
} from "@/types/financials";

type AlphaFunction =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW"
  | "EARNINGS"
  | "EARNINGS_CALL_TRANSCRIPT";
const ALPHA_MIN_INTERVAL_MS = 13_000;
const ALPHA_THROTTLE_RETRY_MS = 2_000;
const ALPHA_MAX_RETRIES = 2;

let alphaQueue: Promise<void> = Promise.resolve();
let alphaNextAllowedAt = 0;

interface AlphaFinancialReport {
  fiscalDateEnding?: string;
  [key: string]: string | undefined;
}

interface AlphaFinancialResponse {
  symbol?: string;
  annualReports?: AlphaFinancialReport[];
  quarterlyReports?: AlphaFinancialReport[];
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
}

interface AlphaEarningsPoint {
  fiscalDateEnding?: string;
  reportedEPS?: string;
  reportedDate?: string;
  estimatedEPS?: string;
  surprisePercentage?: string;
}

interface AlphaEarningsResponse {
  symbol?: string;
  annualEarnings?: AlphaEarningsPoint[];
  quarterlyEarnings?: AlphaEarningsPoint[];
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
}

interface AlphaTranscriptResponse {
  symbol?: string;
  quarter?: string;
  year?: string;
  date?: string;
  content?: string;
  transcript?: string;
  Note?: string;
  Information?: string;
  ErrorMessage?: string;
}

export interface AlphaTranscriptDocument {
  ticker: string;
  year: number;
  quarter: number;
  published_at: string | null;
  content: string;
}

interface AlphaBundle {
  income: AlphaFinancialResponse;
  balance: AlphaFinancialResponse;
  cash: AlphaFinancialResponse;
  earnings: AlphaEarningsResponse;
}

export interface AlphaEarningsInsight {
  history: Array<{
    quarter: string;
    report_date: string | null;
    eps_actual: number | null;
    eps_estimate: number | null;
    surprise_percent: number | null;
  }>;
  est_eps: number | null;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase() === "none") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDate(value: string | undefined): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function toPeriodLabel(date: Date, kind: "annual" | "quarterly"): string {
  const year = date.getUTCFullYear();
  if (kind === "annual") return `FY${year}`;
  const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
  return `Q${quarter} ${year}`;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

async function fetchAlphaFunction(
  symbol: string,
  fn: AlphaFunction,
  apiKey: string,
  extraParams?: Record<string, string>
): Promise<AlphaFinancialResponse | AlphaEarningsResponse | AlphaTranscriptResponse> {
  const serializedParams = extraParams
    ? Object.entries(extraParams)
        .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("")
    : "";

  const url =
    `https://www.alphavantage.co/query?function=${fn}` +
    `&symbol=${encodeURIComponent(symbol)}` +
    serializedParams +
    `&apikey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "Huntr/1.0" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`AlphaVantage ${fn} failed with status ${response.status}`);
  }

  const payload = (await response.json()) as AlphaFinancialResponse;
  if (payload.ErrorMessage) {
    throw new Error(`AlphaVantage ${fn}: ${payload.ErrorMessage}`);
  }
  if (payload.Note || payload.Information) {
    throw new Error(`AlphaVantage throttled on ${fn}`);
  }
  return payload;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAlphaRateLimited<T>(operation: () => Promise<T>): Promise<T> {
  const task = alphaQueue.then(async () => {
    const waitMs = Math.max(0, alphaNextAllowedAt - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    try {
      return await operation();
    } finally {
      alphaNextAllowedAt = Date.now() + ALPHA_MIN_INTERVAL_MS;
    }
  });

  alphaQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

async function fetchWithRetry(
  symbol: string,
  fn: AlphaFunction,
  apiKey: string,
  extraParams?: Record<string, string>
): Promise<AlphaFinancialResponse | AlphaEarningsResponse | AlphaTranscriptResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ALPHA_MAX_RETRIES; attempt += 1) {
    try {
      return await runAlphaRateLimited(() => fetchAlphaFunction(symbol, fn, apiKey, extraParams));
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isThrottled = /throttled/i.test(message);
      if (!isThrottled || attempt === ALPHA_MAX_RETRIES - 1) {
        throw error;
      }
      await sleep(ALPHA_THROTTLE_RETRY_MS);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`AlphaVantage ${fn} failed`);
}

async function fetchBundle(symbol: string, apiKey: string): Promise<AlphaBundle> {
  const income = (await fetchWithRetry(
    symbol,
    "INCOME_STATEMENT",
    apiKey
  )) as AlphaFinancialResponse;
  const balance = (await fetchWithRetry(
    symbol,
    "BALANCE_SHEET",
    apiKey
  )) as AlphaFinancialResponse;
  const cash = (await fetchWithRetry(
    symbol,
    "CASH_FLOW",
    apiKey
  )) as AlphaFinancialResponse;

  const hasEpsInIncome = (rows?: AlphaFinancialReport[]) =>
    (rows ?? []).some((row) => parseNumber(row.dilutedEPS) !== 0 || parseNumber(row.reportedEPS) !== 0);

  const needEarningsFallback =
    !hasEpsInIncome(income.annualReports) || !hasEpsInIncome(income.quarterlyReports);

  let earnings: AlphaEarningsResponse = {};
  if (needEarningsFallback) {
    try {
      earnings = (await fetchWithRetry(
        symbol,
        "EARNINGS",
        apiKey
      )) as AlphaEarningsResponse;
    } catch {
      earnings = {};
    }
  }

  return { income, balance, cash, earnings };
}

function toPeriodKey(date: Date, kind: "annual" | "quarterly"): string {
  const year = date.getUTCFullYear();
  if (kind === "annual") return `${year}`;
  const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
  return `${year}-Q${quarter}`;
}

function buildEpsMaps(
  rows: AlphaEarningsPoint[] | undefined,
  kind: "annual" | "quarterly"
): { byDate: Map<string, number>; byPeriod: Map<string, number> } {
  const byDate = new Map<string, number>();
  const byPeriod = new Map<string, number>();
  for (const row of rows ?? []) {
    const date = getDate(row.fiscalDateEnding);
    const dateKey = toDateString(date);
    const periodKey = toPeriodKey(date, kind);
    const value = parseNumber(row.reportedEPS);
    byDate.set(dateKey, value);
    byPeriod.set(periodKey, value);
  }
  return { byDate, byPeriod };
}

function buildSharesPeriodMap(
  rows: BalanceSheet[],
  kind: "annual" | "quarterly"
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const periodDate = getDate(row.date);
    map.set(toPeriodKey(periodDate, kind), row.shares_outstanding);
  }
  return map;
}

function mapIncome(
  rows: AlphaFinancialReport[] | undefined,
  kind: "annual" | "quarterly",
  epsByDate: Map<string, number>,
  epsByPeriod: Map<string, number>,
  sharesByDate: Map<string, number>,
  sharesByPeriod: Map<string, number>
): IncomeStatement[] {
  return (rows ?? [])
    .map((row) => {
      const date = getDate(row.fiscalDateEnding);
      const dateKey = toDateString(date);
      const periodKey = toPeriodKey(date, kind);
      const netIncome = parseNumber(row.netIncome);
      const sharesRaw = parseNumber(row.commonStockSharesOutstanding);
      const shares =
        sharesRaw ||
        sharesByDate.get(dateKey) ||
        sharesByPeriod.get(periodKey) ||
        0;
      const epsFromIncome = parseNumber(row.dilutedEPS);
      const epsFromEarnings = epsByDate.get(dateKey) ?? epsByPeriod.get(periodKey) ?? 0;
      const epsDiluted = epsFromIncome || epsFromEarnings || 0;
      const epsBasic = parseNumber(row.reportedEPS) || epsDiluted;
      const inferredShares =
        shares > 0 ? shares : epsDiluted !== 0 ? Math.abs(netIncome / epsDiluted) : 0;

      return {
        period: toPeriodLabel(date, kind),
        date: dateKey,
        currency: "USD",
        revenue: parseNumber(row.totalRevenue),
        cost_of_revenue: parseNumber(row.costOfRevenue),
        gross_profit: parseNumber(row.grossProfit),
        operating_expenses: parseNumber(row.operatingExpenses),
        operating_income: parseNumber(row.operatingIncome),
        interest_expense: parseNumber(row.interestExpense),
        pre_tax_income: parseNumber(row.incomeBeforeTax),
        income_tax: parseNumber(row.incomeTaxExpense),
        net_income: netIncome,
        eps_basic: epsBasic,
        eps_diluted: epsDiluted,
        shares_outstanding_basic: inferredShares,
        shares_outstanding_diluted: inferredShares,
        ebitda: parseNumber(row.ebitda),
      } satisfies IncomeStatement;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function mapBalance(
  rows: AlphaFinancialReport[] | undefined,
  kind: "annual" | "quarterly"
): BalanceSheet[] {
  return (rows ?? [])
    .map((row) => {
      const date = getDate(row.fiscalDateEnding);
      return {
        period: toPeriodLabel(date, kind),
        date: toDateString(date),
        currency: "USD",
        cash_and_equivalents: parseNumber(row.cashAndCashEquivalentsAtCarryingValue),
        short_term_investments: parseNumber(row.shortTermInvestments),
        total_current_assets: parseNumber(row.totalCurrentAssets),
        total_non_current_assets: parseNumber(row.totalNonCurrentAssets),
        total_assets: parseNumber(row.totalAssets),
        total_current_liabilities: parseNumber(row.totalCurrentLiabilities),
        long_term_debt: parseNumber(row.longTermDebt),
        total_non_current_liabilities: parseNumber(row.totalNonCurrentLiabilities),
        total_liabilities: parseNumber(row.totalLiabilities),
        total_equity: parseNumber(row.totalShareholderEquity),
        retained_earnings: parseNumber(row.retainedEarnings),
        shares_outstanding: parseNumber(row.commonStockSharesOutstanding),
      } satisfies BalanceSheet;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function mapCashFlow(
  rows: AlphaFinancialReport[] | undefined,
  kind: "annual" | "quarterly"
): CashFlowStatement[] {
  return (rows ?? [])
    .map((row) => {
      const date = getDate(row.fiscalDateEnding);
      const operatingCashFlow = parseNumber(row.operatingCashflow);
      const capex = parseNumber(row.capitalExpenditures);

      return {
        period: toPeriodLabel(date, kind),
        date: toDateString(date),
        currency: "USD",
        operating_cash_flow: operatingCashFlow,
        capital_expenditures: capex,
        free_cash_flow: operatingCashFlow + capex,
        dividends_paid: parseNumber(row.dividendPayout),
        share_repurchases: parseNumber(row.paymentsForRepurchaseOfCommonStock),
        net_investing: parseNumber(row.cashflowFromInvestment),
        net_financing: parseNumber(row.cashflowFromFinancing),
        net_change_in_cash: parseNumber(row.changeInCashAndCashEquivalents),
      } satisfies CashFlowStatement;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getFinancialsFromAlphaVantage(
  ticker: string,
  apiKey: string
): Promise<CompanyFinancials | null> {
  const symbol = ticker.toUpperCase();
  const bundle = await fetchBundle(symbol, apiKey);

  const balanceAnnual = mapBalance(bundle.balance.annualReports, "annual");
  const balanceQuarterly = mapBalance(bundle.balance.quarterlyReports, "quarterly");
  const annualSharesByDate = new Map(balanceAnnual.map((row) => [row.date, row.shares_outstanding]));
  const quarterlySharesByDate = new Map(
    balanceQuarterly.map((row) => [row.date, row.shares_outstanding])
  );
  const annualSharesByPeriod = buildSharesPeriodMap(balanceAnnual, "annual");
  const quarterlySharesByPeriod = buildSharesPeriodMap(balanceQuarterly, "quarterly");

  const annualEpsMaps = buildEpsMaps(bundle.earnings.annualEarnings, "annual");
  const quarterlyEpsMaps = buildEpsMaps(bundle.earnings.quarterlyEarnings, "quarterly");

  const incomeAnnual = mapIncome(
    bundle.income.annualReports,
    "annual",
    annualEpsMaps.byDate,
    annualEpsMaps.byPeriod,
    annualSharesByDate,
    annualSharesByPeriod
  );
  const incomeQuarterly = mapIncome(
    bundle.income.quarterlyReports,
    "quarterly",
    quarterlyEpsMaps.byDate,
    quarterlyEpsMaps.byPeriod,
    quarterlySharesByDate,
    quarterlySharesByPeriod
  );
  const cashAnnual = mapCashFlow(bundle.cash.annualReports, "annual");
  const cashQuarterly = mapCashFlow(bundle.cash.quarterlyReports, "quarterly");

  const hasData =
    incomeAnnual.length +
      incomeQuarterly.length +
      balanceAnnual.length +
      balanceQuarterly.length +
      cashAnnual.length +
      cashQuarterly.length >
    0;

  if (!hasData) return null;

  return {
    ticker: symbol,
    income_statement: {
      annual: incomeAnnual,
      quarterly: incomeQuarterly,
    },
    balance_sheet: {
      annual: balanceAnnual,
      quarterly: balanceQuarterly,
    },
    cash_flow: {
      annual: cashAnnual,
      quarterly: cashQuarterly,
    },
  };
}

export async function getEarningsInsightFromAlphaVantage(
  ticker: string,
  apiKey: string
): Promise<AlphaEarningsInsight | null> {
  const symbol = ticker.toUpperCase();

  const parseNullable = (value: string | undefined): number | null => {
    if (!value) return null;
    const cleaned = value.trim();
    if (!cleaned || cleaned.toLowerCase() === "none") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  let earnings: AlphaEarningsResponse;
  try {
    earnings = (await fetchWithRetry(symbol, "EARNINGS", apiKey)) as AlphaEarningsResponse;
  } catch {
    return null;
  }

  const history = (earnings.quarterlyEarnings ?? [])
    .map((row) => {
      const fiscalDate = getDate(row.fiscalDateEnding);
      const reportDate = row.reportedDate ? getDate(row.reportedDate) : null;
      const validFiscal = !Number.isNaN(fiscalDate.getTime());
      const parsedActual = parseNullable(row.reportedEPS);
      const parsedEstimate = parseNullable(row.estimatedEPS);
      const isFutureReport =
        !!reportDate && !Number.isNaN(reportDate.getTime()) && reportDate.getTime() > Date.now();

      // Alpha can emit placeholder 0.00 for not-yet-reported quarters.
      const epsActual = isFutureReport && parsedActual === 0 && parsedEstimate !== null
        ? null
        : parsedActual;

      return {
        quarter: validFiscal ? toPeriodLabel(fiscalDate, "quarterly") : "Unknown",
        report_date:
          reportDate && !Number.isNaN(reportDate.getTime())
            ? toDateString(reportDate)
            : null,
        eps_actual: epsActual,
        eps_estimate: parsedEstimate,
        surprise_percent: parseNullable(row.surprisePercentage),
      };
    })
    .filter((row) => row.eps_actual !== null || row.eps_estimate !== null)
    .sort((a, b) => {
      const da = a.report_date ? new Date(a.report_date).getTime() : 0;
      const db = b.report_date ? new Date(b.report_date).getTime() : 0;
      return db - da;
    })
    .slice(0, 16);

  if (history.length === 0) return null;

  const nextWithEstimate = history.find(
    (row) => row.eps_estimate !== null && row.report_date && new Date(row.report_date).getTime() >= Date.now()
  );
  const latestWithEstimate = history.find((row) => row.eps_estimate !== null);

  return {
    history,
    est_eps: nextWithEstimate?.eps_estimate ?? latestWithEstimate?.eps_estimate ?? null,
  };
}

export async function getEarningsCallTranscriptFromAlphaVantage(
  ticker: string,
  year: number,
  quarter: number,
  apiKey: string
): Promise<AlphaTranscriptDocument | null> {
  const symbol = ticker.toUpperCase();
  const normalizedQuarter = Math.min(Math.max(Math.trunc(quarter), 1), 4);
  const variants: Array<Record<string, string>> = [
    { quarter: `${year}Q${normalizedQuarter}` },
    { quarter: `Q${normalizedQuarter}`, year: String(year) },
    { quarter: String(normalizedQuarter), year: String(year) },
  ];

  for (const params of variants) {
    try {
      const raw = (await fetchWithRetry(
        symbol,
        "EARNINGS_CALL_TRANSCRIPT",
        apiKey,
        params
      )) as AlphaTranscriptResponse | AlphaTranscriptResponse[];

      const payload = Array.isArray(raw) ? raw[0] : raw;
      if (!payload) continue;

      const rawContent = payload.content ?? payload.transcript ?? "";
      const content = rawContent.trim();
      if (!content) continue;

      const parsedDate = payload.date ? getDate(payload.date) : null;
      const publishedAt =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? toDateString(parsedDate)
          : null;

      return {
        ticker: symbol,
        year,
        quarter: normalizedQuarter,
        published_at: publishedAt,
        content,
      };
    } catch {
      continue;
    }
  }

  return null;
}
