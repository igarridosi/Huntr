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

resource "azurerm_function_app_flex_consumption" "ingest" {
  name                = "func-huntr-sec-ingest-${local.suffix}"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.ingest.name
  service_plan_id     = azurerm_service_plan.ingest.id

  runtime_name          = "node"
  runtime_version       = "22"
  instance_memory_in_mb = 512
  # One nightly run: never more than one instance.
  maximum_instance_count = 1

  # The deployment package, read with the identity.
  storage_container_type            = "blobContainer"
  storage_container_endpoint        = "${azurerm_storage_account.func.primary_blob_endpoint}${azurerm_storage_container.deployment.name}"
  storage_authentication_type       = "UserAssignedIdentity"
  storage_user_assigned_identity_id = azurerm_user_assigned_identity.ingest.id

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.ingest.id]
  }

  https_only                                     = true
  webdeploy_publish_basic_authentication_enabled = false

  site_config {
    application_insights_connection_string = azurerm_application_insights.ingest.connection_string
  }

  app_settings = {
    # The host's own storage (timer leases, useMonitor), through the identity.
    "AzureWebJobsStorage__accountName" = azurerm_storage_account.func.name
    "AzureWebJobsStorage__credential"  = "managedidentity"
    "AzureWebJobsStorage__clientId"    = azurerm_user_assigned_identity.ingest.client_id
    # DefaultAzureCredential in the pipeline picks this identity for Blob.
    "AZURE_CLIENT_ID" = azurerm_user_assigned_identity.ingest.client_id

    "SEC_INGEST_MODE"                  = var.ingest_mode
    "SEC_INGEST_TICKERS"               = var.ingest_mode == "blob-only" ? join(",", var.blob_only_tickers) : ""
    "SEC_INGEST_SCHEDULE"              = var.schedule
    "SEC_USER_AGENT"                   = var.sec_user_agent
    "SEC_RAW_BLOB_ACCOUNT_URL"         = azurerm_storage_account.raw.primary_blob_endpoint
    "SEC_RAW_BLOB_CONTAINER"           = azurerm_storage_container.raw.name
    "AzureWebJobs.sec_ingest.Disabled" = var.ingest_enabled ? "false" : "true"
  }

  tags = local.tags

  # The roles first: an app that starts without them fails to read its package.
  depends_on = [
    azurerm_role_assignment.func_storage,
    azurerm_role_assignment.raw_container,
    azurerm_role_assignment.key_vault,
  ]
}

# azurerm does not expose keyVaultReferenceIdentity on Flex Consumption apps,
# and without it Azure resolves @Microsoft.KeyVault references with a
# system-assigned identity this app does not have. Set on the site itself,
# and set again whenever the app is replaced or updated, since an update
# through azurerm could reset it. PR 7 checks the reference resolves.
resource "azapi_update_resource" "key_vault_reference_identity" {
  type        = "Microsoft.Web/sites@2024-04-01"
  resource_id = azurerm_function_app_flex_consumption.ingest.id

  body = {
    properties = {
      keyVaultReferenceIdentity = azurerm_user_assigned_identity.ingest.id
    }
  }

  lifecycle {
    replace_triggered_by = [azurerm_function_app_flex_consumption.ingest]
  }
}
