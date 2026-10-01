variable "resource_group_name" {
  description = "The resource group, created by hand; Terraform only reads it."
  type        = string
  default     = "rg-huntr-sec-ingest"
}

variable "sec_user_agent" {
  description = "Declared to EDGAR on every request (SEC fair access). From the GitHub environment variable SEC_USER_AGENT, never from code."
  type        = string

  validation {
    condition     = can(regex("@", var.sec_user_agent))
    error_message = "The SEC asks for a contact address in the User-Agent."
  }
}

variable "alert_email" {
  description = "Where the alert is sent. From the GitHub environment variable ALERT_EMAIL."
  type        = string
  sensitive   = true
}

variable "ingest_mode" {
  description = "real: Postgres and Blob, the universe from the tickers table. blob-only: raw payloads to Blob, no Postgres (the first stage, and a fallback)."
  type        = string
  default     = "real"

  validation {
    condition     = contains(["blob-only", "real"], var.ingest_mode)
    error_message = "ingest_mode must be blob-only or real."
  }
}

variable "database_url_secret_name" {
  description = "The Key Vault secret holding the pooler URL for huntr_sec_ingest, set by hand. Terraform only references it."
  type        = string
  default     = "sec-ingest-database-url"
}

variable "database_url_secret_version" {
  description = "The version of that secret the function reads (32 hex characters, in database-url.auto.tfvars). Pinned: a new version is used only through a reviewed change here, never picked up from a cache."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.database_url_secret_version))
    error_message = "database_url_secret_version is a Key Vault secret version: 32 lowercase hex characters, the last part of the secret's id."
  }
}

variable "blob_only_tickers" {
  description = "The universe in blob-only mode, where there is no tickers table to read."
  type        = list(string)
  default     = ["AAPL", "MSFT", "GOOG", "GOOGL", "V", "KO", "JPM", "NKE", "COST", "HLN"]
}

variable "schedule" {
  description = "NCRONTAB, UTC, six fields. 06:00 UTC: EDGAR has published the previous New York day."
  type        = string
  default     = "0 0 6 * * *"
}

variable "ingest_enabled" {
  description = "false switches the timer off (AzureWebJobs.sec_ingest.Disabled) without removing anything."
  type        = bool
  default     = true
}

variable "alert_enabled" {
  description = "false keeps the alert rule but stops it evaluating."
  type        = bool
  default     = true
}
