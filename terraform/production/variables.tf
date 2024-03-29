variable "keycloak_image" {
  default = "rg.fr-par.scw.cloud/knot-dots/keycloak:latest"
  type    = string
}

variable "migrate_image" {
  default = "rg.fr-par.scw.cloud/knot-dots/migrate:latest"
  type    = string
}

variable "scaleway_organization_id" {
  default = "8b915777-a8ba-4fa0-8193-fda1211c424b"
  type    = string
}

variable "scaleway_project_id" {
  default = "41b5c043-ce43-4431-a671-8ce6774d61ff"
  type    = string
}

variable "strategytool_image" {
  default = "rg.fr-par.scw.cloud/knot-dots/strategytool:latest"
  type    = string
}

variable "with_scaleway_lb" {
  default = true
  type    = bool
}
