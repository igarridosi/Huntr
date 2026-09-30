# Supabase Root 2021 CA

`supabase-root-2021-ca.pem` is the root of the certificate chain Supabase's
connection pooler presents (`*.pooler.supabase.com`, issued by *Supabase
Intermediate 2021 CA*). It is not in the public trust stores, so the
pipeline verifies the database connection against it
(`SEC_INGEST_DATABASE_CA`, base64 of this file). It is a public
certificate, not a secret.

- SHA-256 fingerprint:
  `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`
- Valid until 2031-04-26.

To check it against the one Supabase publishes: *Project Settings →
Database → SSL Configuration → Download certificate*, then compare the
fingerprints:

```bash
openssl x509 -in prod-ca-2021.crt -noout -fingerprint -sha256
```
