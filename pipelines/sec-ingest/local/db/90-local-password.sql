-- LOCAL ONLY: a throwaway password for the pipeline's role in the test
-- container. In production the password is set by hand and lives only in
-- Key Vault; nothing here is used outside docker compose.
ALTER ROLE huntr_sec_ingest PASSWORD 'local-only-not-a-secret';
