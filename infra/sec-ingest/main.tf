# The SEC ingest in Azure: one Flex Consumption function that runs nightly,
# its storage, its secrets and what watches it. Everything authenticates as
# one user-assigned identity; no storage account key and no secret is ever
# in this configuration or in its state.

data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "ingest" {
  name = var.resource_group_name
}

locals {
  location = data.azurerm_resource_group.ingest.location # italynorth
  # Storage accounts, the Key Vault and the function's hostname are global
  # names. A short, stable suffix from the subscription keeps them unique
  # without a random provider, and the same on every plan.
  suffix = substr(sha1(data.azurerm_client_config.current.subscription_id), 0, 4)
  tags = {
    app        = "huntr"
    component  = "sec-ingest"
    managed_by = "terraform"
  }
}

# ── Identity ─────────────────────────────────────────────

# Created before the app, and granted its roles first, so the app never
# starts without them (a system-assigned identity only exists after).
resource "azurerm_user_assigned_identity" "ingest" {
  name                = "id-huntr-sec-ingest"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.ingest.name
  tags                = local.tags
}

# ── Storage: the function's own ──────────────────────────

# The deployment package and the timer's leases. Entra ID only.
resource "azurerm_storage_account" "func" {
  name                            = "sthuntrsecfunc${local.suffix}"
  location                        = local.location
  resource_group_name             = data.azurerm_resource_group.ingest.name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  local_user_enabled              = false
  min_tls_version                 = "TLS1_2"
  tags                            = local.tags
}

resource "azurerm_storage_container" "deployment" {
  name                  = "deployment"
  storage_account_id    = azurerm_storage_account.func.id
  container_access_type = "private"
}

# ── Storage: the raw SEC payloads ────────────────────────

# Separate from the function's account so the identity's write access is
# scoped to one container and nothing else.
resource "azurerm_storage_account" "raw" {
  name                            = "sthuntrsecraw${local.suffix}"
  location                        = local.location
  resource_group_name             = data.azurerm_resource_group.ingest.name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  local_user_enabled              = false
  min_tls_version                 = "TLS1_2"
  tags                            = local.tags
}

resource "azurerm_storage_container" "raw" {
  name                  = "sec-raw"
  storage_account_id    = azurerm_storage_account.raw.id
  container_access_type = "private"
}

# Raw payloads are for reprocessing and debugging, not an archive.
resource "azurerm_storage_management_policy" "raw" {
  storage_account_id = azurerm_storage_account.raw.id

  rule {
    name    = "delete-raw-after-90-days"
    enabled = true
    filters {
      prefix_match = ["${azurerm_storage_container.raw.name}/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        delete_after_days_since_creation_greater_than = 90
      }
    }
  }
}

# ── Secrets ──────────────────────────────────────────────

# Will hold the pooler URL for huntr_sec_ingest (PR 7). The secret is set
# by hand in the portal; this configuration never sees its value.
resource "azurerm_key_vault" "ingest" {
  name                          = "kv-huntr-sec-${local.suffix}"
  location                      = local.location
  resource_group_name           = data.azurerm_resource_group.ingest.name
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  soft_delete_retention_days    = 7
  purge_protection_enabled      = false
  public_network_access_enabled = true
  tags                          = local.tags
}

# ── Roles: the three the deploy identity may assign ──────

resource "azurerm_role_assignment" "func_storage" {
  scope                            = azurerm_storage_account.func.id
  role_definition_name             = "Storage Blob Data Owner"
  principal_id                     = azurerm_user_assigned_identity.ingest.principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "raw_container" {
  scope                            = azurerm_storage_container.raw.id
  role_definition_name             = "Storage Blob Data Contributor"
  principal_id                     = azurerm_user_assigned_identity.ingest.principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "key_vault" {
  scope                            = azurerm_key_vault.ingest.id
  role_definition_name             = "Key Vault Secrets User"
  principal_id                     = azurerm_user_assigned_identity.ingest.principal_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}
