-- ─────────────────────────────────────────────────────────
-- 014 — the marketable securities the DCF counts as cash, and the
-- redeemable preferred it can count as debt
--
-- Net cash left out the securities companies hold as a reserve beside
-- their cash: Reddit's $1.3B beside $1.5B, Instacart's $93M. And the
-- balance sheet never showed redeemable preferred (Instacart's $200M
-- Series A). The app now reads both, so the ingest pipeline has to be
-- allowed to store them.
--
-- Apply BEFORE approving the sec-ingest deploy that ships these ids:
-- sec_company_facts.concept_id references sec_concepts, and the pipeline
-- writes every id in src/lib/sec/concept-ids.ts.
-- ─────────────────────────────────────────────────────────

BEGIN;

INSERT INTO public.sec_concepts (id, taxonomy, name) VALUES
  (43, 'us-gaap', 'ShortTermInvestments'),
  (44, 'us-gaap', 'MarketableSecuritiesCurrent'),
  (45, 'us-gaap', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'),
  (46, 'us-gaap', 'TemporaryEquityCarryingAmountAttributableToParent')
ON CONFLICT (id) DO NOTHING;

COMMIT;
