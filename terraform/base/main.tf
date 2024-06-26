terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 5.0"
    }
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.0"
    }
  }

  required_version = ">= 1.6"

  backend "s3" {
    bucket                      = "strategytool-terraform-state"
    key                         = "base.tfstate"
    region                      = "fr-par"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true

    endpoints = {
      s3 = "https://s3.fr-par.scw.cloud"
    }
  }
}

provider "github" {
  owner = "knot-dots"
}

provider "scaleway" {
  organization_id = var.scaleway_organization_id
  project_id      = var.scaleway_project_id
  region          = "fr-par"
  zone            = "fr-par-1"
}

resource "scaleway_registry_namespace" "this" {
  name      = "knot-dots"
  is_public = false
}

resource "scaleway_iam_application" "kapsule" {
  name        = "Kapsule"
  description = ""
}

resource "scaleway_iam_policy" "container_registry_readers" {
  name           = "Kapsule"
  application_id = scaleway_iam_application.kapsule.id

  rule {
    permission_set_names = ["ContainerRegistryReadOnly"]
    project_ids          = [var.scaleway_project_id]
  }
}

resource "scaleway_iam_application" "github" {
  name        = "GitHub"
  description = ""
}

resource "scaleway_iam_policy" "github" {
  name           = "GitHub"
  application_id = scaleway_iam_application.github.id

  rule {
    permission_set_names = [
      "ContainerRegistryFullAccess",
      "DomainsDNSReadOnly",
      "KubernetesFullAccess",
      "LoadBalancersReadOnly",
      "ObjectStorageBucketsRead",
      "ObjectStorageObjectsDelete",
      "ObjectStorageObjectsRead",
      "ObjectStorageObjectsWrite",
      "PrivateNetworksFullAccess",
      "RelationalDatabasesReadOnly",
      "TransactionalEmailDomainReadOnly"
    ]
    project_ids = [var.scaleway_project_id]
  }

  rule {
    permission_set_names = [
      "IAMReadOnly"
    ]
    organization_id = var.scaleway_organization_id
  }
}

resource "scaleway_iam_api_key" "github" {
  application_id     = scaleway_iam_application.github.id
  default_project_id = var.scaleway_project_id
}

resource "github_actions_secret" "scaleway_access_key" {
  repository      = "strategytool"
  secret_name     = "SCW_ACCESS_KEY"
  plaintext_value = scaleway_iam_api_key.github.access_key
}

resource "github_actions_secret" "scaleway_secret_key" {
  repository      = "strategytool"
  secret_name     = "SCW_SECRET_KEY"
  plaintext_value = scaleway_iam_api_key.github.secret_key
}

resource "scaleway_iam_application" "cert_manager" {
  name        = "cert-manager"
  description = ""
}

resource "scaleway_iam_policy" "cert_manager" {
  name           = "cert-manager"
  application_id = scaleway_iam_application.cert_manager.id

  rule {
    permission_set_names = [
      "DomainsDNSFullAccess",
    ]
    project_ids = [var.scaleway_project_id]
  }
}

resource "scaleway_iam_application" "strategytool" {
  name        = "StrategyTool"
  description = ""
}

resource "scaleway_iam_policy" "strategytool" {
  name           = "StrategyTool"
  application_id = scaleway_iam_application.strategytool.id

  rule {
    permission_set_names = [
      "ObjectStorageObjectsDelete",
      "ObjectStorageObjectsRead",
      "ObjectStorageObjectsWrite",
    ]
    project_ids = [var.scaleway_project_id]
  }
}

resource "scaleway_iam_application" "keycloak" {
  name = "Keycloak"
}

resource "scaleway_iam_policy" "keycloak" {
  name           = "Keycloak"
  application_id = scaleway_iam_application.keycloak.id

  rule {
    permission_set_names = [
      "TransactionalEmailEmailFullAccess"
    ]
    project_ids = [var.scaleway_project_id]
  }
}
