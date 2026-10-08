-- ─────────────────────────────────────────────────────────
-- 015 down — removes concepts 48-49 and their facts, and narrows the taxonomy
-- check back to us-gaap and dei. Roll back the app first: a pipeline still
-- shipping ids 48-49 would fail its inserts once the row is gone.
-- ─────────────────────────────────────────────────────────

BEGIN;

DELETE FROM public.sec_company_facts WHERE concept_id IN (48, 49);
DELETE FROM public.sec_concepts WHERE id IN (48, 49);

ALTER TABLE public.sec_concepts DROP CONSTRAINT IF EXISTS sec_concepts_taxonomy_check;
ALTER TABLE public.sec_concepts
  ADD CONSTRAINT sec_concepts_taxonomy_check CHECK (taxonomy IN ('us-gaap', 'dei'));

COMMIT;
