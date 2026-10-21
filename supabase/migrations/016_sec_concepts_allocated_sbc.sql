-- ─────────────────────────────────────────────────────────
-- 016 — stock compensation filed only as an expense
--
-- Some filers tag stock compensation only as the expense, not as the
-- cash-flow add-back the app read: Shopify, AT&T and Caterpillar file
-- AllocatedShareBasedCompensationExpense alone, so their SBC read as zero
-- and was never deducted (Shopify's is about 5% of revenue).
--
-- Apply BEFORE approving the sec-ingest deploy that ships concept 50.
-- ─────────────────────────────────────────────────────────

BEGIN;

INSERT INTO public.sec_concepts (id, taxonomy, name) VALUES
  (50, 'us-gaap', 'AllocatedShareBasedCompensationExpense')
ON CONFLICT (id) DO NOTHING;

COMMIT;
