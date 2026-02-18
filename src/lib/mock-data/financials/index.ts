import type { CompanyFinancials } from "@/types/financials";

import { aaplFinancials } from "./aapl";
import { msftFinancials } from "./msft";
import { googlFinancials } from "./googl";
import { amznFinancials } from "./amzn";
import { nvdaFinancials } from "./nvda";
import { metaFinancials } from "./meta";
import { tslaFinancials } from "./tsla";
import { jpmFinancials } from "./jpm";
import { jnjFinancials } from "./jnj";
import { koFinancials } from "./ko";
import { costFinancials } from "./cost";
import { vFinancials } from "./v";
import { oFinancials } from "./o";

/**
 * All company financials indexed by ticker symbol.
 * Single source of truth for financial statement mock data.
 */
export const financialsByTicker: Record<string, CompanyFinancials> = {
  AAPL: aaplFinancials,
  MSFT: msftFinancials,
  GOOGL: googlFinancials,
  AMZN: amznFinancials,
  NVDA: nvdaFinancials,
  META: metaFinancials,
  TSLA: tslaFinancials,
  JPM: jpmFinancials,
  JNJ: jnjFinancials,
  KO: koFinancials,
  COST: costFinancials,
  V: vFinancials,
  O: oFinancials,
};

// Re-export individual financials for direct imports
export {
  aaplFinancials,
  msftFinancials,
  googlFinancials,
  amznFinancials,
  nvdaFinancials,
  metaFinancials,
  tslaFinancials,
  jpmFinancials,
  jnjFinancials,
  koFinancials,
  costFinancials,
  vFinancials,
  oFinancials,
};
