-- ─────────────────────────────────────────────────────────
-- 015 — the IFRS lease principal the DCF takes out of free cash flow
--
-- Under IFRS 16 the principal paid on leases is a financing cash flow, so
-- an IFRS filer's operating cash flow is struck before rent, unlike a US
-- GAAP filer's. On paid CHF 69.9M in 2025 and Haleon £60M; leaving it in
-- overstated their free cash flow by the rent. The app now reads it from
-- the ifrs-full taxonomy, so the pipeline has to be allowed to store a
-- concept from that taxonomy.
--
-- Apply BEFORE approving the sec-ingest deploy that ships concepts 48-49.
-- ─────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.sec_concepts DROP CONSTRAINT IF EXISTS sec_concepts_taxonomy_check;
ALTER TABLE public.sec_concepts
  ADD CONSTRAINT sec_concepts_taxonomy_check CHECK (taxonomy IN ('us-gaap', 'dei', 'ifrs-full'));

-- 49: share-based payments added back in an IFRS filer's operating cash
-- flow, the counterpart of us-gaap ShareBasedCompensation (On CHF 66.6M).
INSERT INTO public.sec_concepts (id, taxonomy, name) VALUES
  (48, 'ifrs-full', 'PaymentsOfLeaseLiabilitiesClassifiedAsFinancingActivities'),
  (49, 'ifrs-full', 'AdjustmentsForSharebasedPayments')
ON CONFLICT (id) DO NOTHING;

COMMIT;
