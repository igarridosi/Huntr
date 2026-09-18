import type { DCFScenarioSet } from "@/lib/calculations";

/**
 * The three scenarios with one share price: the live one.
 *
 * The price is a fact about the market, not an assumption of a scenario,
 * yet each scenario carries its own copy in `inputs.currentPrice`. Copies
 * go stale on their own: a saved set is stored with the price zeroed, a
 * loaded set gets the quote only on the scenario it opens on, and a quote
 * that ticks after that leaves the other two behind. Stamping the live
 * price on all three before anything compares or exports them keeps the
 * upside of Bear and Bull on the same footing as Base.
 *
 * Returns the same object when there is no price to stamp, or when every
 * scenario already holds it.
 */
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
