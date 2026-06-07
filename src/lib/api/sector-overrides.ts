/**
 * Hardcoded sector fallback for tickers whose sector field is missing,
 * malformed ("Unknown"), or accidentally contains a company-name fragment
 * (e.g. "Inc." from a bad parse of the full legal name).
 *
 * Applied in:
 *   - tickers.ts  → tickerRowsToProfiles  (Supabase tickers table path)
 *   - mappers.ts  → mapToStockProfile     (Yahoo quoteSummary path)
 *
 * Source: GICS classification as of 2025.
 */
export const SECTOR_OVERRIDES: Record<string, string> = {
  // ── Consumer Discretionary ────────────────────────────────────────────────
  TSLA:  "Consumer Discretionary",
  AMZN:  "Consumer Discretionary",
  HD:    "Consumer Discretionary",
  MCD:   "Consumer Discretionary",
  NKE:   "Consumer Discretionary",
  SBUX:  "Consumer Discretionary",
  TGT:   "Consumer Discretionary",
  LOW:   "Consumer Discretionary",
  BKNG:  "Consumer Discretionary",
  ABNB:  "Consumer Discretionary",
  GM:    "Consumer Discretionary",
  F:     "Consumer Discretionary",
  RVLV:  "Consumer Discretionary",
  LULU:  "Consumer Discretionary",
  AMGN:  "Consumer Discretionary",
  RCL:   "Consumer Discretionary",
  CCL:   "Consumer Discretionary",
  MAR:   "Consumer Discretionary",

  // ── Information Technology ────────────────────────────────────────────────
  TSM:   "Information Technology",
  AAPL:  "Information Technology",
  MSFT:  "Information Technology",
  NVDA:  "Information Technology",
  AVGO:  "Information Technology",
  ORCL:  "Information Technology",
  CRM:   "Information Technology",
  CSCO:  "Information Technology",
  QCOM:  "Information Technology",
  AMD:   "Information Technology",
  MU:    "Information Technology",
  INTC:  "Information Technology",
  TXN:   "Information Technology",
  AMAT:  "Information Technology",
  LRCX:  "Information Technology",
  KLAC:  "Information Technology",
  ADI:   "Information Technology",
  MCHP:  "Information Technology",
  IBM:   "Information Technology",
  HPQ:   "Information Technology",
  HPE:   "Information Technology",
  ACN:   "Information Technology",
  FIS:   "Information Technology",
  FISV:  "Information Technology",
  GPN:   "Information Technology",
  SNPS:  "Information Technology",
  CDNS:  "Information Technology",
  ANSS:  "Information Technology",
  PANW:  "Information Technology",
  FTNT:  "Information Technology",
  CRWD:  "Information Technology",
  ZS:    "Information Technology",
  OKTA:  "Information Technology",
  NOW:   "Information Technology",
  WDAY:  "Information Technology",
  ADBE:  "Information Technology",
  INTU:  "Information Technology",

  // ── Financials ────────────────────────────────────────────────────────────
  "BRK-B": "Financials",
  "BRK.B": "Financials",
  "BRK-A": "Financials",
  "BRK.A": "Financials",
  JPM:   "Financials",
  BAC:   "Financials",
  WFC:   "Financials",
  GS:    "Financials",
  MS:    "Financials",
  BLK:   "Financials",
  SCHW:  "Financials",
  AXP:   "Financials",
  C:     "Financials",
  USB:   "Financials",
  PNC:   "Financials",
  TFC:   "Financials",
  COF:   "Financials",
  AFL:   "Financials",
  MET:   "Financials",
  PRU:   "Financials",
  AIG:   "Financials",
  ICE:   "Financials",
  CME:   "Financials",
  SPGI:  "Financials",
  MCO:   "Financials",
  MA:    "Financials",
  V:     "Financials",
  PYPL:  "Financials",
  SQ:    "Financials",

  // ── Communication Services ────────────────────────────────────────────────
  GOOG:  "Communication Services",
  GOOGL: "Communication Services",
  META:  "Communication Services",
  NFLX:  "Communication Services",
  DIS:   "Communication Services",
  CMCSA: "Communication Services",
  T:     "Communication Services",
  VZ:    "Communication Services",
  TMUS:  "Communication Services",
  SNAP:  "Communication Services",
  PINS:  "Communication Services",
  SPOT:  "Communication Services",
  TTWO:  "Communication Services",
  EA:    "Communication Services",
  ATVI:  "Communication Services",

  // ── Consumer Staples ─────────────────────────────────────────────────────
  KO:    "Consumer Staples",
  PEP:   "Consumer Staples",
  PG:    "Consumer Staples",
  COST:  "Consumer Staples",
  WMT:   "Consumer Staples",
  MO:    "Consumer Staples",
  PM:    "Consumer Staples",
  CL:    "Consumer Staples",
  KMB:   "Consumer Staples",
  GIS:   "Consumer Staples",
  KHC:   "Consumer Staples",
  MDLZ:  "Consumer Staples",
  STZ:   "Consumer Staples",
  TAP:   "Consumer Staples",

  // ── Health Care ──────────────────────────────────────────────────────────
  JNJ:   "Health Care",
  UNH:   "Health Care",
  LLY:   "Health Care",
  PFE:   "Health Care",
  ABT:   "Health Care",
  ABBV:  "Health Care",
  MRK:   "Health Care",
  TMO:   "Health Care",
  DHR:   "Health Care",
  BMY:   "Health Care",
  GILD:  "Health Care",
  BIIB:  "Health Care",
  ISRG:  "Health Care",
  SYK:   "Health Care",
  MDT:   "Health Care",
  CI:    "Health Care",
  CVS:   "Health Care",
  HUM:   "Health Care",
  ELV:   "Health Care",
  VRTX:  "Health Care",
  REGN:  "Health Care",
  MRNA:  "Health Care",
  ILMN:  "Health Care",
  ZBH:   "Health Care",
  BAX:   "Health Care",

  // ── Energy ───────────────────────────────────────────────────────────────
  XOM:   "Energy",
  CVX:   "Energy",
  COP:   "Energy",
  SLB:   "Energy",
  EOG:   "Energy",
  MPC:   "Energy",
  PSX:   "Energy",
  VLO:   "Energy",
  OXY:   "Energy",
  HAL:   "Energy",
  PXD:   "Energy",
  DVN:   "Energy",
  FANG:  "Energy",

  // ── Industrials ──────────────────────────────────────────────────────────
  BA:    "Industrials",
  CAT:   "Industrials",
  GE:    "Industrials",
  HON:   "Industrials",
  RTX:   "Industrials",
  LMT:   "Industrials",
  NOC:   "Industrials",
  GD:    "Industrials",
  UPS:   "Industrials",
  FDX:   "Industrials",
  DE:    "Industrials",
  MMM:   "Industrials",
  EMR:   "Industrials",
  PH:    "Industrials",
  ITW:   "Industrials",
  CMI:   "Industrials",
  ETN:   "Industrials",
  CARR:  "Industrials",
  OTIS:  "Industrials",
  WM:    "Industrials",
  RSG:   "Industrials",

  // ── Materials ────────────────────────────────────────────────────────────
  LIN:   "Materials",
  APD:   "Materials",
  SHW:   "Materials",
  FCX:   "Materials",
  NEM:   "Materials",
  AA:    "Materials",
  NUE:   "Materials",

  // ── Real Estate ──────────────────────────────────────────────────────────
  AMT:   "Real Estate",
  PLD:   "Real Estate",
  EQIX:  "Real Estate",
  CCI:   "Real Estate",
  WELL:  "Real Estate",
  SPG:   "Real Estate",
  O:     "Real Estate",

  // ── Utilities ────────────────────────────────────────────────────────────
  NEE:   "Utilities",
  DUK:   "Utilities",
  SO:    "Utilities",
  AEP:   "Utilities",
  D:     "Utilities",
  EXC:   "Utilities",
  PCG:   "Utilities",
  XEL:   "Utilities",
  AWK:   "Utilities",

  // ── International ADRs — Financials ──────────────────────────────────────
  HSBC:  "Financials",   // HSBC Holdings plc (1 ADR = 5 ordinary shares, London)
  UBS:   "Financials",   // UBS Group AG
  CS:    "Financials",   // Credit Suisse (delisted, kept for history)
  DB:    "Financials",   // Deutsche Bank AG
  ING:   "Financials",   // ING Groep N.V.
  BBVA:  "Financials",   // Banco Bilbao Vizcaya Argentaria
  SAN:   "Financials",   // Banco Santander
  SMFG:  "Financials",   // Sumitomo Mitsui Financial Group
  MFG:   "Financials",   // Mizuho Financial Group
  MTU:   "Financials",   // Mitsubishi UFJ Financial Group (also MUFG)
  MUFG:  "Financials",   // Mitsubishi UFJ Financial Group
  ITUB:  "Financials",   // Itaú Unibanco
  BSBR:  "Financials",   // Banco Bradesco
  WBK:   "Financials",   // Westpac Banking (delisted, kept for history)
  LYG:   "Financials",   // Lloyds Banking Group (1 ADR = 10 ordinary shares)
  BCS:   "Financials",   // Barclays PLC (1 ADR = 4 ordinary shares)
  NWG:   "Financials",   // NatWest Group
  RY:    "Financials",   // Royal Bank of Canada
  TD:    "Financials",   // Toronto-Dominion Bank
  BNS:   "Financials",   // Bank of Nova Scotia
  BMO:   "Financials",   // Bank of Montreal
  CM:    "Financials",   // CIBC

  // ── International ADRs — Information Technology ──────────────────────────
  // TSM already above
  ASML:  "Information Technology",  // ASML Holding (Netherlands)
  SAP:   "Information Technology",  // SAP SE (Germany)
  ERIC:  "Information Technology",  // Ericsson
  NOK:   "Information Technology",  // Nokia
  INFY:  "Information Technology",  // Infosys (India)
  WIT:   "Information Technology",  // Wipro
  HCL:   "Information Technology",  // HCL Technologies
  TCS:   "Information Technology",  // Tata Consultancy Services

  // ── International ADRs — Consumer Discretionary ──────────────────────────
  TM:    "Consumer Discretionary",  // Toyota Motor Corporation
  HMC:   "Consumer Discretionary",  // Honda Motor Company
  NSANY: "Consumer Discretionary",  // Nissan Motor (OTC)
  SONY:  "Consumer Discretionary",  // Sony Group Corporation
  LVS:   "Consumer Discretionary",  // Las Vegas Sands (cross-border)
  BABA:  "Consumer Discretionary",  // Alibaba Group

  // ── International ADRs — Consumer Staples ────────────────────────────────
  UL:    "Consumer Staples",   // Unilever PLC (1 ADR = 1 ordinary share)
  DEO:   "Consumer Staples",   // Diageo plc (1 ADR = 4 ordinary shares)
  BTI:   "Consumer Staples",   // British American Tobacco (1 ADR = 1 ordinary)

  // ── International ADRs — Energy ──────────────────────────────────────────
  BP:    "Energy",   // BP plc (1 ADR = 6 ordinary shares)
  SHEL:  "Energy",   // Shell plc (1 ADR = 2 ordinary shares, formerly RDS.A)
  TTE:   "Energy",   // TotalEnergies SE
  E:     "Energy",   // Eni S.p.A.
  EQNR:  "Energy",   // Equinor ASA (Norway)
  PBR:   "Energy",   // Petróleo Brasileiro (Petrobras)

  // ── International ADRs — Health Care ─────────────────────────────────────
  AZN:   "Health Care",  // AstraZeneca PLC
  NVO:   "Health Care",  // Novo Nordisk A/S (1 ADR = 1 ordinary share)
  NVS:   "Health Care",  // Novartis AG
  RHHBY: "Health Care",  // Roche Holding AG (OTC)
  SNY:   "Health Care",  // Sanofi
  GSK:   "Health Care",  // GSK plc (1 ADR = 2 ordinary shares)
  TAK:   "Health Care",  // Takeda Pharmaceutical

  // ── International ADRs — Industrials ─────────────────────────────────────
  SIEGY: "Industrials",  // Siemens AG (OTC)
  ABB:   "Industrials",  // ABB Ltd
  ATLKY: "Industrials",  // Atlas Copco (OTC)

  // ── International ADRs — Communication Services ──────────────────────────
  TCEHY: "Communication Services",  // Tencent Holdings (OTC)
  NTES:  "Communication Services",  // NetEase
  WPP:   "Communication Services",  // WPP plc

  // ── International ADRs — Materials ───────────────────────────────────────
  RIO:   "Materials",  // Rio Tinto plc (1 ADR = 1 ordinary share)
  BHP:   "Materials",  // BHP Group (1 ADR = 2 ordinary shares)
  VALE:  "Materials",  // Vale S.A. (Brazil)
  GOLD:  "Materials",  // Barrick Gold Corporation
};

/**
 * Returns the canonical GICS sector for a ticker, or null if not in the override map.
 * The caller should fall back to its primary data source when this returns null.
 */
export function getSectorOverride(ticker: string): string | null {
  return SECTOR_OVERRIDES[ticker.toUpperCase()] ?? null;
}

/** Validate that a sector string looks like a real GICS sector (not a company name fragment). */
const VALID_GICS_SECTORS = new Set([
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
]);

export function sanitizeSector(raw: string | null | undefined, ticker: string): string {
  if (!raw || raw === "Unknown") return getSectorOverride(ticker) ?? "Unknown";
  if (VALID_GICS_SECTORS.has(raw)) return raw;
  // Heuristic: if the raw value contains a legal-name fragment ("Inc.", "Corp.", "Ltd.")
  // it was parsed from the company name instead of the sector field — use override or Unknown.
  if (/\b(inc\.?|corp\.?|ltd\.?|llc\.?|plc\.?|co\.?)\b/i.test(raw)) {
    return getSectorOverride(ticker) ?? "Unknown";
  }
  return getSectorOverride(ticker) ?? raw;
}
