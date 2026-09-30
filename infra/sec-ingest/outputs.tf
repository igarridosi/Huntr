output "function_app_name" {
  description = "Where the deploy workflow publishes the package."
  value       = azapi_resource.function_app.name
}

output "identity_client_id" {
  description = "The user-assigned identity the function runs as."
  value       = azurerm_user_assigned_identity.ingest.client_id
}

output "key_vault_name" {
  description = "Where the database URL goes before PR 7 (secret sec-ingest-database-url)."
  value       = azurerm_key_vault.ingest.name
}

output "raw_blob_container_url" {
  description = "The raw payloads."
  value       = "${azurerm_storage_account.raw.primary_blob_endpoint}${azurerm_storage_container.raw.name}"
}
