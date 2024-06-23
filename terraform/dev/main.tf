terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 5.0"
    }

    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }

    keycloak = {
      source  = "mrparkers/keycloak"
      version = "4.2.0"
    }

    kubectl = {
      source  = "gavinbunney/kubectl"
      version = "~> 1.0"
    }

    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }

    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.0"
    }
  }

  required_version = ">= 1.6"

  backend "s3" {
    bucket                      = "strategytool-terraform-state"
    key                         = "dev.tfstate"
    region                      = "fr-par"
    profile                     = "strategytool"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true

    endpoints = {
      s3 = "https://s3.fr-par.scw.cloud"
    }
  }
}

provider "helm" {
  kubernetes {
    host  = module.k8s_cluster.kubeconfig.host
    token = module.k8s_cluster.kubeconfig.token
    cluster_ca_certificate = base64decode(
      module.k8s_cluster.kubeconfig.cluster_ca_certificate
    )
  }
}

provider "keycloak" {
  client_id = "terraform"
  url       = "https://keycloak.dev.dotstory.de"
}

provider "kubectl" {
  load_config_file = false
  host             = module.k8s_cluster.kubeconfig.host
  token            = module.k8s_cluster.kubeconfig.token
  cluster_ca_certificate = base64decode(
    module.k8s_cluster.kubeconfig.cluster_ca_certificate
  )
}

provider "kubernetes" {
  host  = module.k8s_cluster.kubeconfig.host
  token = module.k8s_cluster.kubeconfig.token
  cluster_ca_certificate = base64decode(
    module.k8s_cluster.kubeconfig.cluster_ca_certificate
  )
}

provider "scaleway" {
  project_id = var.scaleway_project_id
  region     = "fr-par"
  zone       = "fr-par-1"
}

data "scaleway_iam_application" "kapsule" {
  application_id = "48b5a810-07bc-40b0-b208-ceb70c9f96fc"
}

resource "scaleway_iam_api_key" "registry_password" {
  application_id = data.scaleway_iam_application.kapsule.id
}

data "scaleway_iam_application" "cert_manager" {
  application_id = "d6b54a86-4e7b-49ad-805f-a0d8ab2bb564"
}

resource "scaleway_iam_api_key" "cert_manager" {
  application_id = data.scaleway_iam_application.cert_manager.id
}

data "scaleway_iam_application" "strategytool" {
  application_id = "fff61d3e-5eda-4feb-86fc-8e279f38f1b9"
}

resource "scaleway_iam_api_key" "strategytool" {
  application_id     = data.scaleway_iam_application.strategytool.id
  default_project_id = var.scaleway_project_id
}

resource "scaleway_tem_domain" "this" {
  accept_tos = true
  name       = data.scaleway_domain_zone.root.domain
}

data "scaleway_domain_zone" "root" {
  domain    = "dotstory.de"
  subdomain = ""
}

resource "scaleway_domain_record" "mail" {
  dns_zone = data.scaleway_domain_zone.root.domain
  name     = ""
  type     = "MX"
  data     = "blackhole.scw-tem.cloud."
  priority = 10
  ttl      = 3600
}

resource "scaleway_domain_record" "spf" {
  dns_zone = data.scaleway_domain_zone.root.domain
  type     = "TXT"
  data     = "v=spf1 ${scaleway_tem_domain.this.spf_config} -all"
}

resource "scaleway_domain_record" "dkim" {
  dns_zone = data.scaleway_domain_zone.root.domain
  name     = "${scaleway_tem_domain.this.project_id}._domainkey"
  type     = "TXT"
  data     = scaleway_tem_domain.this.dkim_config
}

resource "scaleway_domain_record" "dmarc" {
  dns_zone = data.scaleway_domain_zone.root.domain
  name     = scaleway_tem_domain.this.dmarc_name
  type     = "TXT"
  data     = scaleway_tem_domain.this.dmarc_config
}

resource "scaleway_domain_zone" "dev" {
  count = var.with_scaleway_lb ? 1 : 0

  domain    = "dotstory.de"
  subdomain = "dev"
}

resource "scaleway_domain_record" "strategytool" {
  count = var.with_scaleway_lb ? 1 : 0

  dns_zone = scaleway_domain_zone.dev[count.index].id
  name     = "strategytool"
  type     = "A"
  //noinspection HILUnresolvedReference
  data = module.k8s_deployments.load_balancer_ip
  ttl  = 3600
}

resource "scaleway_domain_record" "strategytool_wildcard" {
  count = var.with_scaleway_lb ? 1 : 0

  dns_zone = scaleway_domain_zone.dev[count.index].id
  name     = "*.strategytool"
  type     = "CNAME"
  //noinspection HILUnresolvedReference
  data = "${scaleway_domain_record.strategytool[count.index].name}.${scaleway_domain_zone.dev[count.index].subdomain}.${scaleway_domain_zone.dev[count.index].domain}."
  ttl  = 3600

  lifecycle {
    ignore_changes = [
      ttl,
    ]
  }
}

resource "scaleway_domain_record" "keycloak" {
  count = var.with_scaleway_lb ? 1 : 0

  dns_zone = scaleway_domain_zone.dev[count.index].id
  name     = "keycloak"
  type     = "A"
  //noinspection HILUnresolvedReference
  data = module.k8s_deployments.load_balancer_ip
  ttl  = 3600
}

resource "scaleway_rdb_instance" "dev" {
  name                      = "rdb-dev"
  node_type                 = "DB-DEV-S"
  engine                    = "PostgreSQL-14"
  is_ha_cluster             = false
  disable_backup            = false
  backup_same_region        = true
  backup_schedule_frequency = 24
  backup_schedule_retention = 7

  private_network {
    pn_id = module.k8s_cluster.private_network_id
  }

  tags = ["terraform"]
}

resource "scaleway_object_bucket" "upload" {
  name = "strategytool-upload"
}

resource "scaleway_object_bucket_acl" "upload" {
  bucket = scaleway_object_bucket.upload.name
  acl    = "private"
}

data "keycloak_openid_client" "strategytool" {
  realm_id  = "knot-dots"
  client_id = "strategytool"
}

module "rdb_databases" {
  source = "../modules/rdb_databases"

  for_each = toset(["keycloak", "strategytool"])

  name                  = each.key
  scaleway_rdb_instance = scaleway_rdb_instance.dev
}

module "k8s_cluster" {
  source = "../modules/k8s_cluster"

  cluster_name     = "k8s-dev"
  with_scaleway_lb = var.with_scaleway_lb
}

module "k8s_deployments" {
  source = "../modules/k8s_deployments"

  cockpit_token            = module.k8s_cluster.cockpit_token
  databases                = module.rdb_databases
  registry_password        = scaleway_iam_api_key.registry_password.secret_key
  registry_server          = "rg.fr-par.scw.cloud"
  registry_username        = "knot-dots"
  cert_manager_api_key     = scaleway_iam_api_key.cert_manager
  keycloak_host            = var.with_scaleway_lb ? "keycloak.dev.dotstory.de" : replace(module.k8s_cluster.wildcard_dns, "*", "keycloak")
  keycloak_image           = var.keycloak_image
  keycloak_realm           = "knot-dots"
  keycloak_client_id       = data.keycloak_openid_client.strategytool.client_id
  keycloak_client_secret   = data.keycloak_openid_client.strategytool.client_secret
  migrate_image            = var.migrate_image
  strategytool_api_key     = scaleway_iam_api_key.strategytool
  strategytool_bucket_name = scaleway_object_bucket.upload.name
  strategytool_host        = var.with_scaleway_lb ? "strategytool.dev.dotstory.de" : replace(module.k8s_cluster.wildcard_dns, "*", "strategytool")
  strategytool_image       = var.strategytool_image
  strategytool_region      = "fr-par"
  with_scaleway_lb         = var.with_scaleway_lb
}
