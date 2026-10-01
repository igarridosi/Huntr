# Runs with mocked providers: no credentials, nothing reaches Azure.
# `terraform test` in CI on every PR that touches the infrastructure.

mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id       = "00000000-0000-0000-0000-000000000001"
      subscription_id = "00000000-0000-0000-0000-000000000002"
      client_id       = "00000000-0000-0000-0000-000000000003"
      object_id       = "00000000-0000-0000-0000-000000000004"
    }
  }
  mock_data "azurerm_resource_group" {
    defaults = {
      id       = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest"
      location = "italynorth"
    }
  }
  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-huntr-sec-ingest"
      client_id    = "11111111-1111-1111-1111-111111111111"
      principal_id = "22222222-2222-2222-2222-222222222222"
    }
  }
  mock_resource "azurerm_storage_account" {
    defaults = {
      id                    = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Storage/storageAccounts/sthuntrsecmock"
      primary_blob_endpoint = "https://sthuntrsecmock.blob.core.windows.net/"
    }
  }
  mock_resource "azurerm_storage_container" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Storage/storageAccounts/sthuntrsecmock/blobServices/default/containers/mock"
    }
  }
  mock_resource "azurerm_key_vault" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.KeyVault/vaults/kv-huntr-sec-mock"
    }
  }
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.OperationalInsights/workspaces/log-huntr-sec-ingest"
    }
  }
  mock_resource "azurerm_application_insights" {
    defaults = {
      id                = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Insights/components/appi-huntr-sec-ingest"
      connection_string = "InstrumentationKey=00000000-0000-0000-0000-000000000000"
    }
  }
  mock_resource "azurerm_service_plan" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Web/serverFarms/asp-huntr-sec-ingest"
    }
  }
  mock_resource "azurerm_monitor_action_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Insights/actionGroups/ag-huntr-sec-ingest"
    }
  }
}

mock_provider "azapi" {
  mock_resource "azapi_resource" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Web/sites/func-huntr-sec-ingest-mock"
    }
  }
}


variables {
  sec_user_agent              = "Huntr huntrvalue.me contact@huntrvalue.me"
  alert_email                 = "alerts@example.com"
  database_url_secret_version = "0123456789abcdef0123456789abcdef"
}

run "first_stage_blob_only" {
  command = apply

  variables {
    ingest_mode = "blob-only"
  }

  assert {
    condition = alltrue([
      for r in [
        azurerm_user_assigned_identity.ingest, azurerm_storage_account.func, azurerm_storage_account.raw,
        azurerm_key_vault.ingest, azurerm_log_analytics_workspace.ingest, azurerm_application_insights.ingest,
        azurerm_service_plan.ingest, azapi_resource.function_app,
      ] : r.location == "italynorth"
    ])
    error_message = "Everything goes in italynorth, the resource group's region."
  }

  assert {
    condition     = !azurerm_storage_account.func.shared_access_key_enabled && !azurerm_storage_account.raw.shared_access_key_enabled
    error_message = "Shared keys must be disabled on both storage accounts."
  }

  assert {
    condition = (
      azapi_resource.function_app.body.properties.functionAppConfig.deployment.storage.authentication.type == "UserAssignedIdentity" &&
      azapi_resource.function_app.body.properties.functionAppConfig.deployment.storage.authentication.userAssignedIdentityResourceId == azurerm_user_assigned_identity.ingest.id &&
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["AzureWebJobsStorage__credential"] == "managedidentity" &&
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["AzureWebJobsStorage__clientId"] == azurerm_user_assigned_identity.ingest.client_id &&
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["AzureWebJobsStorage__accountName"] == azurerm_storage_account.func.name &&
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["AZURE_CLIENT_ID"] == azurerm_user_assigned_identity.ingest.client_id
    )
    error_message = "The function reaches every storage account through its user-assigned identity."
  }

  assert {
    # Exactly the settings the app had when azurerm managed it, minus the
    # plain AzureWebJobsStorage azurerm forced onto it: the PUT replaces the
    # list, so anything missing here would be lost.
    condition = sort([for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name]) == sort([
      "APPLICATIONINSIGHTS_CONNECTION_STRING",
      "AZURE_CLIENT_ID",
      "AzureWebJobs.sec_ingest.Disabled",
      "AzureWebJobsStorage__accountName",
      "AzureWebJobsStorage__clientId",
      "AzureWebJobsStorage__credential",
      "SEC_INGEST_MODE",
      "SEC_INGEST_SCHEDULE",
      "SEC_INGEST_TICKERS",
      "SEC_RAW_BLOB_ACCOUNT_URL",
      "SEC_RAW_BLOB_CONTAINER",
      "SEC_USER_AGENT",
    ])
    error_message = "The app settings are the twelve the app had, without the plain AzureWebJobsStorage."
  }

  assert {
    # A plain AzureWebJobsStorage takes precedence over the __ identity
    # settings and makes the host use Shared Key, which these accounts
    # refuse (403 AuthenticationFailed). Nor may any setting carry a key.
    condition = alltrue([
      for s in azapi_resource.function_app.body.properties.siteConfig.appSettings :
      lower(s.name) != "azurewebjobsstorage" && !strcontains(lower(s.value), "accountkey=") && lower(s.name) != "deployment_storage_connection_string"
    ])
    error_message = "No plain AzureWebJobsStorage and no storage connection string with a key: host storage goes through the identity only."
  }

  assert {
    condition     = azapi_resource.function_app.body.properties.keyVaultReferenceIdentity == azurerm_user_assigned_identity.ingest.id
    error_message = "Key Vault references must resolve with the user-assigned identity."
  }

  assert {
    condition = alltrue([
      for a in [azurerm_role_assignment.func_storage, azurerm_role_assignment.raw_container, azurerm_role_assignment.key_vault] :
      a.principal_type == "ServicePrincipal" && contains(["Storage Blob Data Owner", "Storage Blob Data Contributor", "Key Vault Secrets User"], a.role_definition_name)
    ])
    error_message = "Only the three roles the deploy identity's condition allows, to a service principal."
  }

  assert {
    condition     = azurerm_role_assignment.raw_container.scope == azurerm_storage_container.raw.id
    error_message = "Write access to the raw payloads is scoped to their container."
  }

  assert {
    condition = (
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_MODE"] == "blob-only" &&
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_TICKERS"] != "" &&
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["AzureWebJobs.sec_ingest.Disabled"] == "false" &&
      !contains(keys({ for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }), "SEC_INGEST_DATABASE_URL")
    )
    error_message = "The first stage writes Blob only: no database setting at all."
  }

  assert {
    condition = (
      azapi_resource.function_app.body.properties.functionAppConfig.scaleAndConcurrency.maximumInstanceCount == 1 &&
      azapi_resource.function_app.body.properties.functionAppConfig.scaleAndConcurrency.instanceMemoryMB == 512 &&
      azapi_resource.function_app.body.properties.functionAppConfig.runtime.name == "node" && azapi_resource.function_app.body.properties.functionAppConfig.runtime.version == "22"
    )
    error_message = "One 512 MB Node 22 instance at most."
  }

  assert {
    condition     = azapi_resource.function_app.body.properties.siteConfig.cors.allowedOrigins == ["https://portal.azure.com"]
    error_message = "CORS allows the Azure portal only (its Test/Run), nothing else."
  }

  assert {
    condition     = alltrue([for k in ["scm", "ftp"] : !azapi_update_resource.no_basic_auth[k].body.properties.allow])
    error_message = "Basic-auth publishing (SCM and FTP) stays off."
  }

  assert {
    condition     = azurerm_storage_management_policy.raw.rule[0].actions[0].base_blob[0].delete_after_days_since_creation_greater_than == 90
    error_message = "Raw payloads are deleted after 90 days."
  }

  assert {
    condition     = azurerm_log_analytics_workspace.ingest.daily_quota_gb == 0.1
    error_message = "Log ingestion is capped at 100 MB a day."
  }

  assert {
    condition     = azurerm_monitor_scheduled_query_rules_alert_v2.ingest.evaluation_frequency == "PT1H" && azurerm_monitor_scheduled_query_rules_alert_v2.ingest.enabled
    error_message = "One alert rule, evaluated hourly."
  }
}

run "real_mode" {
  command = apply

  assert {
    condition = sort([for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name]) == sort([
      "APPLICATIONINSIGHTS_CONNECTION_STRING",
      "AZURE_CLIENT_ID",
      "AzureWebJobs.sec_ingest.Disabled",
      "AzureWebJobsStorage__accountName",
      "AzureWebJobsStorage__clientId",
      "AzureWebJobsStorage__credential",
      "SEC_INGEST_DATABASE_CA",
      "SEC_INGEST_DATABASE_URL",
      "SEC_INGEST_MODE",
      "SEC_INGEST_SCHEDULE",
      "SEC_RAW_BLOB_ACCOUNT_URL",
      "SEC_RAW_BLOB_CONTAINER",
      "SEC_USER_AGENT",
    ])
    error_message = "Real mode: the blob-only settings minus the fixed tickers, plus the database URL and its CA."
  }

  assert {
    condition     = { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_MODE"] == "real"
    error_message = "real is the default mode."
  }

  assert {
    condition = (
      { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_DATABASE_URL"] == "@Microsoft.KeyVault(VaultName=${azurerm_key_vault.ingest.name};SecretName=sec-ingest-database-url;SecretVersion=0123456789abcdef0123456789abcdef)" &&
      !strcontains(lower({ for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_DATABASE_URL"]), "postgres")
    )
    error_message = "The database URL is a Key Vault reference to a pinned version, never a value in the configuration."
  }

  assert {
    condition     = azapi_resource.function_app.body.properties.keyVaultReferenceIdentity == azurerm_user_assigned_identity.ingest.id
    error_message = "The reference resolves with the user-assigned identity."
  }

  assert {
    condition = (
      azapi_resource.function_app.body.properties.serverFarmId == "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Web/serverfarms/asp-huntr-sec-ingest" &&
      lower(azapi_resource.function_app.body.properties.serverFarmId) == lower(azurerm_service_plan.ingest.id)
    )
    error_message = "The plan's id is written as Azure returns it (serverfarms), or every plan shows a change."
  }

  assert {
    condition = (
      startswith(base64decode({ for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_DATABASE_CA"]), "-----BEGIN CERTIFICATE-----") &&
      endswith(trimspace(base64decode({ for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_DATABASE_CA"])), "-----END CERTIFICATE-----") &&
      length(regexall("BEGIN CERTIFICATE", base64decode({ for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_DATABASE_CA"]))) == 1 &&
      !strcontains(base64decode({ for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["SEC_INGEST_DATABASE_CA"]), "\r")
    )
    error_message = "The pooler's root CA travels as base64 of one PEM certificate and nothing else: no text around it, no CRLF."
  }

  assert {
    condition = alltrue([
      for s in azapi_resource.function_app.body.properties.siteConfig.appSettings :
      lower(s.name) != "azurewebjobsstorage" && !strcontains(lower(s.value), "accountkey=") && !strcontains(lower(s.value), "password")
    ])
    error_message = "No storage key and no password in any setting."
  }
}

run "switched_off" {
  command = apply

  variables {
    ingest_enabled = false
  }

  assert {
    condition     = { for s in azapi_resource.function_app.body.properties.siteConfig.appSettings : s.name => s.value }["AzureWebJobs.sec_ingest.Disabled"] == "true"
    error_message = "ingest_enabled = false disables the timer."
  }
}

run "refuses_a_user_agent_without_contact" {
  command = plan

  variables {
    sec_user_agent = "Huntr"
  }

  expect_failures = [var.sec_user_agent]
}

run "refuses_a_secret_version_that_is_not_one" {
  command = plan

  variables {
    database_url_secret_version = "latest"
  }

  expect_failures = [var.database_url_secret_version]
}
