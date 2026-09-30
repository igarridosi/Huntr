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
  description = "blob-only: raw payloads to Blob, no Postgres (the first stage). real: Postgres and Blob (PR 7)."
  type        = string
  default     = "blob-only"

  validation {
    condition     = contains(["blob-only", "real"], var.ingest_mode)
    error_message = "ingest_mode must be blob-only or real."
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
