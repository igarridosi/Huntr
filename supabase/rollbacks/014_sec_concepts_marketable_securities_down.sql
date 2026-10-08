-- ─────────────────────────────────────────────────────────
-- 014 down — removes the four concepts 014 added and the facts stored
-- under them. Roll back the app first: a pipeline still shipping ids
-- 43-46 would fail its inserts once these rows are gone.
-- ─────────────────────────────────────────────────────────

BEGIN;

DELETE FROM public.sec_company_facts WHERE concept_id IN (43, 44, 45, 46);
DELETE FROM public.sec_concepts WHERE id IN (43, 44, 45, 46);

COMMIT;
