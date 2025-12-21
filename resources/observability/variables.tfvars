aws_region                              = "us-east-1"
ssm_parameter_name_grafana_metric_token = "/weft/oservability/grafana_metric_token" # cloud_provider_token, metrics_write_token
cloud_provider_url                      = "https://cloud-provider-api-prod-us-east-3.grafana.net"

// Metrics

# grafana_cloud_stack_slug = "atoumbre"
# include_namespaces = ["AWS/ECS"]

// Logs

ssm_parameter_name_grafana_log_token = "/weft/oservability/grafana_log_token" # Password

write_address = "https://logs-prod-042.grafana.net/loki/api/v1/push"
username      = "1432998"
s3_bucket     = "misc-admin-artefacts"
s3_key        = "lambda-promtail.zip"
keep_stream   = "false"
extra_labels  = "env,weft"
batch_size    = "8192"

log_group_names = [
  "/aws/lambda/weft-mainnet-dispatcher",
  "/aws/lambda/GrafanaCloudLambdaPromtail"
  "/aws/ecs/weft-mainnet-indexer",
  "/aws/ecs/weft-mainnet-liquidator",
]
