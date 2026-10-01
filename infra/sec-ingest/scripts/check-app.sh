#!/usr/bin/env bash
# Checks on the live function app, shared by the apply and publish jobs of
# .github/workflows/sec-ingest-deploy.yml. Names and statuses only: no
# setting value is ever printed.
#
#   check-app.sh storage            host storage through the identity only
#   check-app.sh keyvault [VERSION] the database URL's Key Vault reference
#                                   resolves, to VERSION when given
#   check-app.sh settings EXPECTED  the live settings are exactly EXPECTED
#                                   (a JSON array of names, from the plan)
#
# Environment: RG, FUNCTION_APP; GITHUB_STEP_SUMMARY when run in Actions.
set -euo pipefail
fail() { echo "::error::$1"; exit 1; }
summary() { echo "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"; }

: "${RG:?}" "${FUNCTION_APP:?}"
names() { az functionapp config appsettings list -g "$RG" -n "$FUNCTION_APP" --query "[].name" -o tsv | sort; }

# Which secret version a Resolved reference resolved to. App Service may
# report it (secretVersion, activeVersion: today neither is filled in), and
# the reference itself names it (SecretVersion=..., an identifier, not a
# secret). A reported version must match; with none reported, a Resolved
# reference pinned to a version can only have resolved that version.
check_version() {
  local url="$1" expected="$2" reported_secret reported_active reference pinned
  # One field per call: a null comes back as "None" or as nothing, which a
  # tab-separated read of all three would misplace.
  field() { # field PROPERTY VARIABLE, in this shell so that fail() stops the script
    local v
    v=$(az rest --method get --url "$url" --query "properties.$1" -o tsv) || fail "could not read $1 of SEC_INGEST_DATABASE_URL's Key Vault reference"
    [ "$v" = "None" ] && v=""
    printf -v "$2" '%s' "$v"
  }
  field secretVersion reported_secret
  field activeVersion reported_active
  field reference reference
  if [ -n "$reported_secret" ] && [ "$reported_secret" != "$expected" ]; then
    fail "SEC_INGEST_DATABASE_URL resolved to secret version $reported_secret (secretVersion), not $expected"
  fi
  if [ -n "$reported_active" ] && [ "$reported_active" != "$expected" ]; then
    fail "SEC_INGEST_DATABASE_URL resolved to secret version $reported_active (activeVersion), not $expected"
  fi
  if [ -n "$reported_secret$reported_active" ]; then
    summary "### Key Vault reference SEC_INGEST_DATABASE_URL: Resolved, version $expected (reported by App Service)"
    return 0
  fi
  [ -n "$reference" ] || fail "SEC_INGEST_DATABASE_URL is Resolved but App Service reports neither the secret version nor the reference: cannot tell which version it read"
  pinned=$(echo "$reference" | sed -nE 's/.*SecretVersion=([0-9A-Fa-f]+).*/\1/p')
  [ -n "$pinned" ] || fail "SEC_INGEST_DATABASE_URL's reference names no SecretVersion: it is not pinned, so its version cannot be checked"
  [ "$pinned" = "$expected" ] || fail "SEC_INGEST_DATABASE_URL's reference is pinned to secret version $pinned, not $expected"
  summary "### Key Vault reference SEC_INGEST_DATABASE_URL: Resolved, pinned to version $expected"
}

case "${1:-}" in
  # A plain AzureWebJobsStorage overrides the AzureWebJobsStorage__* settings
  # and makes the host use Shared Key, which the accounts refuse.
  storage)
    live=$(names)
    if echo "$live" | grep -qiE '^(AzureWebJobsStorage|DEPLOYMENT_STORAGE_CONNECTION_STRING)$'; then
      fail "a storage connection string is set on $FUNCTION_APP; host storage must use the identity only"
    fi
    for required in AzureWebJobsStorage__accountName AzureWebJobsStorage__credential AzureWebJobsStorage__clientId; do
      echo "$live" | grep -qx "$required" || fail "$required is missing on $FUNCTION_APP"
    done
    echo "host storage: identity only"
    ;;

  # App Service reports whether a reference resolved (status and reason,
  # never the value). Anything but Resolved means the function would start
  # without a database.
  keyvault)
    live=$(names) # not inside the if: a failed listing must fail, not read as blob-only
    if ! echo "$live" | grep -qx SEC_INGEST_DATABASE_URL; then
      echo "blob-only mode: no Key Vault reference to check"
      exit 0
    fi
    id=$(az functionapp show -g "$RG" -n "$FUNCTION_APP" --query id -o tsv)
    url="https://management.azure.com${id}/config/configreferences/appsettings/SEC_INGEST_DATABASE_URL?api-version=2024-04-01"
    status=""
    for attempt in $(seq 1 12); do
      status=$(az rest --method get --url "$url" --query "properties.status" -o tsv 2>/dev/null || true)
      echo "attempt $attempt: ${status:-no status yet}"
      if [ "$status" = "Resolved" ]; then
        expected="${2:-}"
        if [ -n "$expected" ]; then
          check_version "$url" "$expected"
        else
          summary "### Key Vault reference SEC_INGEST_DATABASE_URL: Resolved"
        fi
        exit 0
      fi
      case "$status" in
        ""|Initialized) sleep 15 ;;
        *) break ;;
      esac
    done
    az rest --method get --url "$url" --query "{status: properties.status, details: properties.details, secretName: properties.secretName, secretVersion: properties.secretVersion, vaultName: properties.vaultName, identityType: properties.identityType}" -o json || true
    fail "SEC_INGEST_DATABASE_URL did not resolve (status: ${status:-none}). Check the secret exists in the vault and the identity has Key Vault Secrets User."
    ;;

  # Terraform owns the whole list of app settings. One added in the portal
  # (or by anything else) is not seen by the plan; it is caught here.
  settings)
    expected=$(echo "${2:?expected names}" | jq -r '.[]' | sort)
    live=$(names)
    extra=$(comm -23 <(echo "$live" | sed '/^$/d') <(echo "$expected" | sed '/^$/d'))
    missing=$(comm -13 <(echo "$live" | sed '/^$/d') <(echo "$expected" | sed '/^$/d'))
    if [ -n "$extra$missing" ]; then
      {
        echo "### App settings that differ from Terraform"
        if [ -n "$extra" ]; then echo "$extra" | sed 's/^/- not managed by Terraform: /'; fi
        if [ -n "$missing" ]; then echo "$missing" | sed 's/^/- missing: /'; fi
      } | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
      fail "the app settings of $FUNCTION_APP differ from Terraform's. Remove what Terraform does not manage, or make it Terraform's, then run the workflow again."
    fi
    echo "app settings: exactly Terraform's ($(echo "$expected" | wc -l) names)"
    ;;

  *)
    fail "usage: check-app.sh storage | keyvault [VERSION] | settings EXPECTED_JSON"
    ;;
esac
