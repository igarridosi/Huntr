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
  mock_resource "azurerm_function_app_flex_consumption" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Web/sites/func-huntr-sec-ingest-mock"
    }
  }
  mock_resource "azurerm_monitor_action_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-huntr-sec-ingest/providers/Microsoft.Insights/actionGroups/ag-huntr-sec-ingest"
    }
  }
}

mock_provider "azapi" {}

variables {
  sec_user_agent = "Huntr huntrvalue.me contact@huntrvalue.me"
  alert_email    = "alerts@example.com"
}

run "first_stage_blob_only" {
  command = apply

  assert {
    condition = alltrue([
      for r in [
        azurerm_user_assigned_identity.ingest, azurerm_storage_account.func, azurerm_storage_account.raw,
        azurerm_key_vault.ingest, azurerm_log_analytics_workspace.ingest, azurerm_application_insights.ingest,
        azurerm_service_plan.ingest, azurerm_function_app_flex_consumption.ingest,
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
      azurerm_function_app_flex_consumption.ingest.storage_authentication_type == "UserAssignedIdentity" &&
      azurerm_function_app_flex_consumption.ingest.app_settings["AzureWebJobsStorage__credential"] == "managedidentity" &&
      azurerm_function_app_flex_consumption.ingest.app_settings["AzureWebJobsStorage__clientId"] == azurerm_user_assigned_identity.ingest.client_id &&
      azurerm_function_app_flex_consumption.ingest.app_settings["AZURE_CLIENT_ID"] == azurerm_user_assigned_identity.ingest.client_id
    )
    error_message = "The function reaches every storage account through its user-assigned identity."
  }

  assert {
    condition     = azapi_update_resource.key_vault_reference_identity.body.properties.keyVaultReferenceIdentity == azurerm_user_assigned_identity.ingest.id
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
      azurerm_function_app_flex_consumption.ingest.app_settings["SEC_INGEST_MODE"] == "blob-only" &&
      azurerm_function_app_flex_consumption.ingest.app_settings["SEC_INGEST_TICKERS"] != "" &&
      azurerm_function_app_flex_consumption.ingest.app_settings["AzureWebJobs.sec_ingest.Disabled"] == "false" &&
      !contains(keys(azurerm_function_app_flex_consumption.ingest.app_settings), "SEC_INGEST_DATABASE_URL")
    )
    error_message = "The first stage writes Blob only: no database setting at all."
  }

  assert {
    condition = (
      azurerm_function_app_flex_consumption.ingest.maximum_instance_count == 1 &&
      azurerm_function_app_flex_consumption.ingest.instance_memory_in_mb == 512 &&
      azurerm_function_app_flex_consumption.ingest.runtime_version == "22"
    )
    error_message = "One 512 MB Node 22 instance at most."
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

run "switched_off" {
  command = apply

  variables {
    ingest_enabled = false
  }

  assert {
    condition     = azurerm_function_app_flex_consumption.ingest.app_settings["AzureWebJobs.sec_ingest.Disabled"] == "true"
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
