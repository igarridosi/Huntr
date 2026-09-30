# One-off: the function app was first created by azurerm, which forced a
# Shared Key AzureWebJobsStorage onto it (see function.tf). It is adopted as
# it is by azapi_resource.function_app and updated in place; azurerm only
# forgets it. Nothing is destroyed.
#
# Once this has been applied, delete this file: an import block pointing at
# an app that no longer exists (after a destroy) fails the plan. The tests,
# whose mocked providers cannot import, set adopt_existing_function_app = false.

variable "adopt_existing_function_app" {
  description = "Import the function app azurerm created. One-off; see above."
  type        = bool
  default     = true
}

import {
  for_each = var.adopt_existing_function_app ? toset(["function_app"]) : toset([])
  to       = azapi_resource.function_app
  id       = "${data.azurerm_resource_group.ingest.id}/providers/Microsoft.Web/sites/func-huntr-sec-ingest-${local.suffix}"
}

removed {
  from = azurerm_function_app_flex_consumption.ingest

  lifecycle {
    destroy = false
  }
}

# The keyVaultReferenceIdentity patch is now part of the app itself.
# Removing an update resource never touches Azure; this only drops it from state.
removed {
  from = azapi_update_resource.key_vault_reference_identity

  lifecycle {
    destroy = false
  }
}
