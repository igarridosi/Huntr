import type { DCFScenarioSet } from "@/lib/calculations";
import { COMPANY_FACT_KEYS, readCompanyFacts, type CompanyFacts } from "@/lib/calculations/dcf-inputs-source";

/**
 * The three scenarios with one set of company facts: revenue base, debt,
 * cash, share count and share price.
 *
 * None of these is an assumption of a scenario, yet each scenario carries
 * its own copy in its inputs, and copies go stale on their own: a saved
 * set is stored with the price zeroed, a loaded set gets the quote only
 * on the scenario it opens on, a balance sheet that arrives from EDGAR
 * after the scenarios were generated reaches the live inputs and, through
 * the write-back, the active scenario alone. Uber's bear case kept $7.1B
 * of cash against the $4.9B its base and bull held. Stamping the facts on
 * all three before anything compares or exports them keeps Bear and Bull
 * on the same balance sheet as Base.
 *
 * Returns the same object when every scenario already holds the facts.
 */
export function withCompanyFacts(scenarios: DCFScenarioSet, facts: CompanyFacts): DCFScenarioSet {
  const keys = ["bear", "base", "bull"] as const;
  const holds = (k: (typeof keys)[number]) => COMPANY_FACT_KEYS.every((f) => scenarios[k].inputs[f] === facts[f]);
  if (keys.every(holds)) return scenarios;
  const next = { ...scenarios };
  for (const k of keys) {
    if (!holds(k)) next[k] = { ...scenarios[k], inputs: { ...scenarios[k].inputs, ...facts } };
  }
  return next;
}

/**
 * The facts of the live inputs, with the share price taken from the quote
 * when there is one: the price is never a stored snapshot.
 */
export function liveFacts(inputs: CompanyFacts, price: number | null | undefined): CompanyFacts {
  return readCompanyFacts(price !== null && price !== undefined && price > 0 ? { ...inputs, currentPrice: price } : inputs);
}

/** The three scenarios with the live share price alone stamped on. */
export function withLivePrice(scenarios: DCFScenarioSet, price: number): DCFScenarioSet {
  if (!(price > 0)) return scenarios;
  const keys = ["bear", "base", "bull"] as const;
  if (keys.every((k) => scenarios[k].inputs.currentPrice === price)) return scenarios;
  const next = { ...scenarios };
  for (const k of keys) {
    if (scenarios[k].inputs.currentPrice !== price) {
      next[k] = { ...scenarios[k], inputs: { ...scenarios[k].inputs, currentPrice: price } };
    }
  }
  return next;
}
