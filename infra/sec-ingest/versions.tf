terraform {
  required_version = "~> 1.16"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.7"
    }
    # For the one property azurerm does not expose on Flex Consumption apps:
    # which identity resolves @Microsoft.KeyVault references (see function.tf).
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.13"
    }
  }

  # Partial configuration: the workflow passes the rest with -backend-config
  # (rg-huntr-sec-ingest / sthuntrtfstate / tfstate / sec-ingest.tfstate).
  # Entra ID only, through OIDC: no storage account key anywhere. The blob
  # lease is the lock.
  backend "azurerm" {
    use_oidc         = true
    use_azuread_auth = true
  }
}

provider "azurerm" {
  # The deploy identity cannot register resource providers in the
  # subscription; they were registered by hand.
  resource_provider_registrations = "none"
  # Shared keys are disabled on every storage account: data-plane calls go
  # through Entra ID.
  storage_use_azuread = true

  features {
    storage {
      # The accounts use neither queue_properties nor static_website, and
      # the deploy identity has no data-plane role on them.
      data_plane_available = false
    }
    key_vault {
      # Purging needs a subscription-scope permission the deploy identity
      # does not have; a destroyed vault stays soft-deleted for 7 days.
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
}

provider "azapi" {}
