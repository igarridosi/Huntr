# ── Observability ────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "ingest" {
  name                = "log-huntr-sec-ingest"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.ingest.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  # A logging loop must not eat the credit: ingestion stops at 100 MB a day.
  daily_quota_gb = 0.1
  tags           = local.tags
}

resource "azurerm_application_insights" "ingest" {
  name                 = "appi-huntr-sec-ingest"
  location             = local.location
  resource_group_name  = data.azurerm_resource_group.ingest.name
  workspace_id         = azurerm_log_analytics_workspace.ingest.id
  application_type     = "Node.JS"
  retention_in_days    = 30
  daily_data_cap_in_gb = 0.1
  tags                 = local.tags
}

# ── The function ─────────────────────────────────────────

resource "azurerm_service_plan" "ingest" {
  name                = "asp-huntr-sec-ingest"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.ingest.name
  os_type             = "Linux"
  sku_name            = "FC1" # Flex Consumption: pay per execution, no always-ready instances
  tags                = local.tags
}

# The function app, as a plain Microsoft.Web/sites resource.
#
# Not azurerm_function_app_flex_consumption: azurerm 5.7 always writes an
# AzureWebJobsStorage connection string built from storage_access_key, even
# with storage_authentication_type = "UserAssignedIdentity" (it builds the
# string unconditionally and passes storageUsesMSI = false), and puts it
# back on every app-settings update. A plain AzureWebJobsStorage takes
# precedence over the AzureWebJobsStorage__* identity settings, so the host
# tried Shared Key against accounts that refuse it: 403 AuthenticationFailed
# on azure-webjobs-secrets. It also has no keyVaultReferenceIdentity.
#
# Here the app settings are exactly these and nothing else, the host
# storage and the deployment package go through the user-assigned identity,
# and Key Vault references resolve with it too. The Flex Consumption shape
# follows Microsoft's own templates (functionAppConfig).
locals {
  # In real mode the database URL is a Key Vault reference, resolved by the
  # platform with the user-assigned identity (keyVaultReferenceIdentity
  # below): the value is never in this configuration, its state or the
  # plan. The pooler presents a certificate from Supabase's own root CA,
  # which is not in the public trust stores; the pipeline verifies against
  # it (certs/, checked against the fingerprint in the Supabase dashboard).
  # The reference names the secret's version: a reference without one is
  # served from the platform's cache, which kept a stale version after a
  # rotation. With it, a rotation is a change to this setting, which makes
  # the platform read the secret again (see the README, "Rotating").
  mode_settings = var.ingest_mode == "real" ? {
    "SEC_INGEST_DATABASE_URL" = "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.ingest.name};SecretName=${var.database_url_secret_name};SecretVersion=${var.database_url_secret_version})"
    "SEC_INGEST_DATABASE_CA"  = filebase64("${path.module}/certs/supabase-root-2021-ca.pem")
    } : {
    "SEC_INGEST_TICKERS" = join(",", var.blob_only_tickers)
  }

  app_settings = merge(local.mode_settings, {
    # The host's own storage (timer leases, useMonitor, keys), through the
    # identity. No plain AzureWebJobsStorage: see above, and the test.
    "AzureWebJobsStorage__accountName" = azurerm_storage_account.func.name
    "AzureWebJobsStorage__credential"  = "managedidentity"
    "AzureWebJobsStorage__clientId"    = azurerm_user_assigned_identity.ingest.client_id
    # DefaultAzureCredential in the pipeline picks this identity for Blob.
    "AZURE_CLIENT_ID"                       = azurerm_user_assigned_identity.ingest.client_id
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.ingest.connection_string

    "SEC_INGEST_MODE"                  = var.ingest_mode
    "SEC_INGEST_SCHEDULE"              = var.schedule
    "SEC_USER_AGENT"                   = var.sec_user_agent
    "SEC_RAW_BLOB_ACCOUNT_URL"         = azurerm_storage_account.raw.primary_blob_endpoint
    "SEC_RAW_BLOB_CONTAINER"           = azurerm_storage_container.raw.name
    "AzureWebJobs.sec_ingest.Disabled" = var.ingest_enabled ? "false" : "true"
  })
}

resource "azapi_resource" "function_app" {
  type      = "Microsoft.Web/sites@2024-04-01"
  name      = "func-huntr-sec-ingest-${local.suffix}"
  parent_id = data.azurerm_resource_group.ingest.id
  location  = local.location
  tags      = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.ingest.id]
  }

  body = {
    kind = "functionapp,linux"
    properties = {
      # As Azure returns it: azurerm's id says serverFarms, the site reads
      # back serverfarms, and azapi compares case-sensitively, so the
      # provider's id would be a change in every plan. ARM ids are not
      # case-sensitive: this is the same plan. (No leading slash in the
      # pattern: replace() reads "/.../" as a regular expression.)
      serverFarmId = replace(azurerm_service_plan.ingest.id, "Microsoft.Web/serverFarms/", "Microsoft.Web/serverfarms/")
      # What azurerm sent for this app, kept as it was: the PUT replaces the
      # site, and anything left out would fall back to Azure's defaults.
      enabled             = true
      httpsOnly           = true
      clientCertEnabled   = false
      clientCertMode      = "Optional"
      publicNetworkAccess = "Enabled"
      # @Microsoft.KeyVault references resolve with this identity (PR 7).
      keyVaultReferenceIdentity = azurerm_user_assigned_identity.ingest.id

      functionAppConfig = {
        deployment = {
          storage = {
            type  = "blobContainer"
            value = "${azurerm_storage_account.func.primary_blob_endpoint}${azurerm_storage_container.deployment.name}"
            authentication = {
              type                           = "UserAssignedIdentity"
              userAssignedIdentityResourceId = azurerm_user_assigned_identity.ingest.id
            }
          }
        }
        runtime = {
          name    = "node"
          version = "22"
        }
        scaleAndConcurrency = {
          # One nightly run: never more than one instance.
          maximumInstanceCount = 1
          instanceMemoryMB     = 512
        }
      }

      siteConfig = {
        minTlsVersion    = "1.2"
        scmMinTlsVersion = "1.2"
        # The portal's Test/Run calls the app from the browser. The app has
        # no HTTP functions, so this opens nothing else.
        cors = {
          allowedOrigins     = ["https://portal.azure.com"]
          supportCredentials = false
        }
        appSettings = [for name in sort(keys(local.app_settings)) : { name = name, value = local.app_settings[name] }]
      }
    }
  }

  # The roles first: an app that starts without them cannot read its package.
  depends_on = [
    azurerm_role_assignment.func_storage,
    azurerm_role_assignment.raw_container,
    azurerm_role_assignment.key_vault,
  ]

  lifecycle {
    # Azure adds this tag when the app is linked to Application Insights
    # (the portal does it). Only that key is ignored; every other tag is
    # Terraform's.
    ignore_changes = [tags["hidden-link: /app-insights-resource-id"]]
  }
}

# Publishing goes through Entra ID (the deploy workflow), never through
# basic-auth credentials. These policies always exist on a site, so they
# are updated rather than created.
resource "azapi_update_resource" "no_basic_auth" {
  for_each  = toset(["scm", "ftp"])
  type      = "Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-04-01"
  name      = each.key
  parent_id = azapi_resource.function_app.id

  body = {
    properties = {
      allow = false
    }
  }
}
