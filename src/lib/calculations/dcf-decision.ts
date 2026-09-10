import type { DCFInputs, DCFResult, MonteCarloResult } from "./dcf";
import { runDCF } from "./dcf";

/**
 * The stress case, and which of its two candidates is binding.
 *
 * The engine used to take the worst cell of a WACC x terminal-growth grid
 * drawn tightly around the current inputs. That is a financial-sensitivity
 * range, not a stress case: it never leaves the operating assumptions of the
 * active scenario, so it routinely landed above the hand-built bear. A worst
 * case that is better than your pessimistic scenario is not a worst case.
 *
 * It is now the lower of the bear scenario and the simulation's 5th
 * percentile, and it reports which one is binding so the interface can say so
 * rather than presenting a bare number.
 */
export interface StressCase {
  value: number;
  source: "bear-scenario" | "simulation-p5";
  bearValue: number;
  simulationP5: number;
}

export function resolveStressCase(
  bearValue: number,
  simulationP5: number
): StressCase {
  const candidates: Array<{ value: number; source: StressCase["source"] }> = [];
  if (Number.isFinite(bearValue) && bearValue > 0) {
    candidates.push({ value: bearValue, source: "bear-scenario" });
  }
  if (Number.isFinite(simulationP5) && simulationP5 > 0) {
    candidates.push({ value: simulationP5, source: "simulation-p5" });
  }

  if (candidates.length === 0) {
    return { value: 0, source: "bear-scenario", bearValue, simulationP5 };
  }

  const binding = candidates.reduce((lowest, candidate) =>
    candidate.value < lowest.value ? candidate : lowest
  );

  return {
    value: binding.value,
    source: binding.source,
    bearValue,
    simulationP5,
  };
}

/**
 * One contributor to the conviction score.
 *
 * `raw` is the underlying measurement in its own units, `points` is what it
 * contributed after weighting, and `maxPoints` is the most it could have
 * contributed. Together they make the score inspectable: a 0-100 number that
 * recommends how much capital to commit invites more trust than it has earned
 * if you cannot see what produced it.
 */
export interface ConvictionFactor {
  key: "upside" | "probability" | "resilience" | "terminalReliance";
  label: string;
  /** What is being measured, in plain language. */
  description: string;
  /** The measurement, as a decimal (e.g. 0.32 = 32% upside). */
  raw: number;
  /** Normalised 0-1 contribution before weighting. */
  normalised: number;
  /** Points contributed to the final score. Negative for penalties. */
  points: number;
  /** The most this factor could contribute, given its weight. */
  maxPoints: number;
  /** Share of the total budget, 0-1. */
  weight: number;
  /** True when the factor subtracts rather than adds. */
  isPenalty: boolean;
}

export interface ConvictionWeights {
  upside: number;
  probability: number;
  resilience: number;
  terminalReliance: number;
}

/**
 * Default weights, expressed as points out of 100.
 *
 * These are a starting point, not a truth. They are exposed so the user can
 * disagree with them, which is the whole reason the breakdown exists.
 */
export const DEFAULT_CONVICTION_WEIGHTS: ConvictionWeights = {
  upside: 40,
  probability: 35,
  resilience: 25,
  terminalReliance: 20,
};

export interface ConvictionBreakdown {
  score: number;
  factors: ConvictionFactor[];
  signal: "Strong Buy" | "Buy" | "Watch" | "Avoid";
  positionSize: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface ConvictionInput {
  /** Upside to intrinsic value, as a decimal. */
  upside: number;
  /** Probability the value lands above today's price, 0-1. */
  probabilityAbovePrice: number;
  /** Stress value relative to price, as a decimal. Negative means a loss. */
  stressVsPrice: number;
  /** Share of enterprise value coming from the terminal value, 0-1. */
  terminalWeight: number;
}

/**
 * Builds the conviction score and the audit trail behind it.
 *
 * Every factor is normalised to 0-1 against an explicit band, then multiplied
 * by its weight, so changing a weight has a legible effect and the points
 * always add up to the score shown.
 */
export function buildConvictionBreakdown(
  input: ConvictionInput,
  weights: ConvictionWeights = DEFAULT_CONVICTION_WEIGHTS
): ConvictionBreakdown {
  // Upside is capped at +100%: beyond that the score should not keep climbing,
  // because an implausible upside usually means an implausible assumption.
  const upsideNormalised = clamp(input.upside, 0, 1);

  // Below a coin flip the probability contributes nothing; the band runs from
  // 50% to 90%, above which extra confidence is mostly model artefact.
  const probabilityNormalised = clamp(
    (input.probabilityAbovePrice - 0.5) / 0.4,
    0,
    1
  );

  // Full marks when the stress case still sits above today's price; zero when
  // it implies losing half your capital.
  const resilienceNormalised = clamp((input.stressVsPrice + 0.5) / 0.5, 0, 1);

  // A penalty rather than a reward: it starts biting past 60% of value sitting
  // beyond the projection horizon, and maxes out at 90%.
  const terminalNormalised = clamp((input.terminalWeight - 0.6) / 0.3, 0, 1);

  const factors: ConvictionFactor[] = [
    {
      key: "upside",
      label: "Upside to fair value",
      description:
        "How far today's price sits below the intrinsic value this model produces. Capped at +100%.",
      raw: input.upside,
      normalised: upsideNormalised,
      points: upsideNormalised * weights.upside,
      maxPoints: weights.upside,
      weight: weights.upside / 100,
      isPenalty: false,
    },
    {
      key: "probability",
      label: "Odds of beating the price",
      description:
        "Share of simulated outcomes landing above today's price. Scored from a coin flip up to 90%.",
      raw: input.probabilityAbovePrice,
      normalised: probabilityNormalised,
      points: probabilityNormalised * weights.probability,
      maxPoints: weights.probability,
      weight: weights.probability / 100,
      isPenalty: false,
    },
    {
      key: "resilience",
      label: "Downside protection",
      description:
        "Where the stress case leaves you against today's price. Full marks if even the worst case holds above it.",
      raw: input.stressVsPrice,
      normalised: resilienceNormalised,
      points: resilienceNormalised * weights.resilience,
      maxPoints: weights.resilience,
      weight: weights.resilience / 100,
      isPenalty: false,
    },
    {
      key: "terminalReliance",
      label: "Reliance on the terminal value",
      description:
        "How much of the valuation rests on assumptions beyond the projection horizon. Penalised past 60%.",
      raw: input.terminalWeight,
      normalised: terminalNormalised,
      points: -terminalNormalised * weights.terminalReliance,
      maxPoints: weights.terminalReliance,
      weight: weights.terminalReliance / 100,
      isPenalty: true,
    },
  ];

  const rewardTotal = weights.upside + weights.probability + weights.resilience;
  const rawScore = factors.reduce((sum, factor) => sum + factor.points, 0);
  // Rescaled so the score keeps meaning "out of 100" whatever weights the user
  // sets, instead of silently changing what an 80 means.
  const score = clamp(
    rewardTotal > 0 ? (rawScore / rewardTotal) * 100 : 0,
    0,
    100
  );

  let signal: ConvictionBreakdown["signal"] = "Watch";
  if (score >= 75) signal = "Strong Buy";
  else if (score >= 55) signal = "Buy";
  else if (score < 35) signal = "Avoid";

  let positionSize = "1% - 2%";
  if (score >= 80) positionSize = "8% - 10%";
  else if (score >= 65) positionSize = "5% - 7%";
  else if (score >= 50) positionSize = "3% - 5%";
  else if (score < 35) positionSize = "0% - 1%";

  return { score, factors, signal, positionSize };
}

/**
 * Everything both the simulation panel and the decision engine need, computed
 * once.
 *
 * The two panels used to each run their own simulation, with different seeds
 * and different iteration counts, and then display the resulting probabilities
 * side by side as though they were the same figure. They were not, and they
 * disagreed on screen.
 */
/**
 * The valuation the conviction score is measured against.
 *
 * It must not be the scenario that happens to be selected. The score used to
 * read `result.upside`, and `result` is whatever the interface is showing, so
 * opening the Bull tab on S&P Global scored the upside at +23.8% and opening
 * Bear scored it at -41.8% - the same company, the same assumptions, a
 * different recommendation depending on which tab was last clicked. A signal
 * that changes when you look at it is not a signal.
 *
 * So the reference is the probability-weighted blend of all three, using the
 * same weights the simulation samples with. That keeps one number behind the
 * score, keeps it consistent with the distribution beside it, and still lets
 * the user move it - by changing the weights, which is an argument about how
 * likely each case is, rather than by clicking a tab.
 */
export interface WeightedReference {
  intrinsicValuePerShare: number;
  upside: number;
  terminalWeight: number;
  /** Which scenarios contributed, and how much each one did. */
  contributions: Array<{ key: "bear" | "base" | "bull"; weight: number; value: number }>;
}

const SCENARIO_KEYS = ["bear", "base", "bull"] as const;

export function buildWeightedReference(params: {
  scenarios: { bear: DCFInputs; base: DCFInputs; bull: DCFInputs };
  weights: { bear: number; base: number; bull: number };
  currentPrice: number;
}): WeightedReference {
  const { scenarios, weights, currentPrice } = params;

  const runs = SCENARIO_KEYS.map((key) => {
    const result = runDCF(scenarios[key]);
    return {
      key,
      weight: Math.max(0, weights[key]),
      result,
    };
  });

  const totalWeight = runs.reduce((sum, run) => sum + run.weight, 0);
  // Equal weighting rather than a division by zero. Someone who has zeroed
  // every scenario has said nothing about which is likely, not that the
  // company is worth nothing.
  const normalise = (weight: number) =>
    totalWeight > 0 ? weight / totalWeight : 1 / runs.length;

  const intrinsicValuePerShare = runs.reduce(
    (sum, run) => sum + normalise(run.weight) * run.result.intrinsicValuePerShare,
    0
  );

  const terminalWeight = runs.reduce((sum, run) => {
    const share =
      run.result.enterpriseValue > 0
        ? run.result.pvTerminalValue / run.result.enterpriseValue
        : 0;
    return sum + normalise(run.weight) * share;
  }, 0);

  return {
    intrinsicValuePerShare,
    upside:
      currentPrice > 0 ? intrinsicValuePerShare / currentPrice - 1 : 0,
    terminalWeight,
    contributions: runs.map((run) => ({
      key: run.key,
      weight: normalise(run.weight),
      value: run.result.intrinsicValuePerShare,
    })),
  };
}

export interface DCFSimulationBundle {
  monteCarlo: MonteCarloResult;
  stress: StressCase;
  conviction: ConvictionBreakdown;
  /** Entry and trim levels, taken from the distribution rather than fair value. */
  zones: TradingZones;
  /** The one probability both panels quote. */
  probabilityAbovePrice: number;
  /**
   * The scenario-independent valuation the score was built on. Null when no
   * scenario set was supplied and the active result had to stand in.
   */
  reference: WeightedReference | null;
}

export function buildSimulationBundle(params: {
  result: DCFResult;
  monteCarlo: MonteCarloResult;
  bearInputs?: DCFInputs;
  weights?: ConvictionWeights;
  /** All three cases, so the score does not depend on the visible one. */
  scenarios?: { bear: DCFInputs; base: DCFInputs; bull: DCFInputs };
  /** How likely each case is. The same weights the simulation samples with. */
  scenarioWeights?: { bear: number; base: number; bull: number };
}): DCFSimulationBundle {
  const { result, monteCarlo, bearInputs, weights, scenarios, scenarioWeights } =
    params;

  const reference =
    scenarios && scenarioWeights
      ? buildWeightedReference({
          scenarios,
          weights: scenarioWeights,
          currentPrice: result.currentPrice,
        })
      : null;

  const bearValue = bearInputs
    ? runDCF(bearInputs).intrinsicValuePerShare
    : (monteCarlo.coherence?.bearValue ?? monteCarlo.p5);

  const stress = resolveStressCase(bearValue, monteCarlo.p5);

  // Both from the blend when there is one. Falling back to the active result
  // keeps older callers working, and is still better than nothing - but it is
  // the path where the score moves with the open tab.
  const terminalWeight =
    reference?.terminalWeight ??
    (result.enterpriseValue > 0
      ? result.pvTerminalValue / result.enterpriseValue
      : 0);

  const stressVsPrice =
    result.currentPrice > 0
      ? (stress.value - result.currentPrice) / result.currentPrice
      : 0;

  const conviction = buildConvictionBreakdown(
    {
      upside: reference?.upside ?? result.upside,
      probabilityAbovePrice: monteCarlo.probabilityAbovePrice,
      stressVsPrice,
      terminalWeight,
    },
    weights
  );

  return {
    monteCarlo,
    stress,
    conviction,
    zones: buildTradingZones({
      monteCarlo,
      stress,
      signal: conviction.signal,
      currentPrice: result.currentPrice,
    }),
    probabilityAbovePrice: monteCarlo.probabilityAbovePrice,
    reference,
  };
}

/**
 * Where to buy and where to trim, taken from the distribution rather than from
 * the central estimate.
 *
 * The zones used to be arithmetic on the base-case fair value - 80%, 90% and
 * 115% of it - which meant they never learned anything from the simulation.
 * On a name the engine scored 29/100 and labelled Avoid, the entry band still
 * came out containing the current price, so the one box a reader is most
 * likely to act on said the opposite of every other box beside it.
 *
 * Anchoring on percentiles fixes the cause rather than the symptom: an entry
 * range whose ceiling is the 25th percentile is, by construction, a price at
 * which three quarters of simulated outcomes are better. The invariant below
 * then catches anything the arithmetic still lets through.
 */
export interface TradingZones {
  entryLow: number;
  entryHigh: number;
  trim: number;
  /**
   * True when the entry ceiling had to be pulled under the current price to
   * stay coherent with an Avoid verdict. A flag rather than a silent clamp:
   * if this fires often, the components have drifted apart again.
   */
  clampedForSignal: boolean;
  /**
   * False when the band sits so far under the price that quoting it as a range
   * misleads.
   *
   * A price range reads as a target you wait for. That is true at -15%; at
   * -70% it is not a target, it is the model saying the shares are worth much
   * less than they cost, and dressing that up as two numbers invites someone
   * to sit on a limit order that will only fill if the thesis has already
   * broken. Past the threshold the interface states the gap instead.
   */
  relevant: boolean;
  /** How far the entry ceiling sits below the price, as a positive decimal. */
  gapToPrice: number;
}

/**
 * Beyond this distance a band stops being a level to wait for.
 */
export const ENTRY_ZONE_RELEVANCE_THRESHOLD = 0.4;

export function buildTradingZones(params: {
  monteCarlo: MonteCarloResult;
  stress: StressCase;
  signal: ConvictionBreakdown["signal"];
  currentPrice: number;
}): TradingZones {
  const { monteCarlo, stress, signal, currentPrice } = params;

  // The floor is the more pessimistic of the simulation's tenth percentile and
  // the hand-built bear case, for the same reason the stress case is: a floor
  // above your own pessimistic scenario is not a floor.
  const entryLow = Math.min(monteCarlo.p10, stress.value);
  let entryHigh = monteCarlo.p25;

  // Trim where the distribution runs out of upside, not at a fixed markup on
  // the central estimate.
  const trim = monteCarlo.p75;

  let clampedForSignal = false;
  if (signal === "Avoid" && currentPrice > 0 && entryHigh >= currentPrice) {
    // 5% under, so the band reads as "not here" rather than "just about here".
    entryHigh = currentPrice * 0.95;
    clampedForSignal = true;
  }

  const gapToPrice =
    currentPrice > 0 ? Math.max(0, (currentPrice - entryHigh) / currentPrice) : 0;

  return {
    entryLow: Math.min(entryLow, entryHigh),
    entryHigh,
    trim: Math.max(trim, entryHigh),
    clampedForSignal,
    relevant: gapToPrice <= ENTRY_ZONE_RELEVANCE_THRESHOLD,
    gapToPrice,
  };
}
