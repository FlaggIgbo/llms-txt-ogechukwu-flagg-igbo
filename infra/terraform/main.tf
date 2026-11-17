terraform {
  required_version = ">= 1.5.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API Token with R2 permissions"
  sensitive   = true
}

resource "cloudflare_r2_bucket" "llms_txt_storage" {
  account_id = var.cloudflare_account_id
  name       = "llmstxt-files-bucket"
}
