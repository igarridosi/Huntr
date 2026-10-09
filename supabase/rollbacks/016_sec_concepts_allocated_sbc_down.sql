-- Rollback for 016_sec_concepts_allocated_sbc.sql
BEGIN;
DELETE FROM public.sec_company_facts WHERE concept_id = 50;
DELETE FROM public.sec_concepts WHERE id = 50;
COMMIT;
