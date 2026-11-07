# One alert, one rule: the cheapest way to be told something is wrong.
#
# It fires when, in the last hour, a sec_ingest invocation failed (the
# function throws when a run raises alerts or cannot run), or when there has
# been no successful run for 26 hours (the timer stopped, the app is down,
# or every run fails before logging). Evaluated hourly, the lowest frequency
# that still reports a failed night the same morning.
#
# Success is the run.ok line the handler writes, not the host's request
# record: Flex Consumption can reclaim the instance before that record is
# sent, which made good nights read as missing (see src/azure.ts). A
# failure is run.failed, or a failed request when one does arrive.
#
# It also fires after the first deploy until the first run succeeds: run it
# once by hand.

resource "azurerm_monitor_action_group" "ingest" {
  name                = "ag-huntr-sec-ingest"
  resource_group_name = data.azurerm_resource_group.ingest.name
  short_name          = "secingest"

  email_receiver {
    name                    = "owner"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }

  tags = local.tags
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "ingest" {
  name                = "alert-huntr-sec-ingest"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.ingest.name
  description         = "sec_ingest failed in the last hour, or has not succeeded for 26 hours."
  enabled             = var.alert_enabled
  severity            = 2

  scopes                    = [azurerm_application_insights.ingest.id]
  evaluation_frequency      = "PT1H"
  window_duration           = "PT1H"
  query_time_range_override = "P2D"
  # At most one email a day for a problem that persists, not one an hour.
  mute_actions_after_alert_duration = "P1D"
  auto_mitigation_enabled           = false

  criteria {
    query                   = <<-QUERY
      let failed = toscalar(
        union
          (traces | where timestamp > ago(1h) and message has '"msg":"run.failed"'),
          (requests | where timestamp > ago(1h) and operation_Name == "sec_ingest" and success == false)
        | count);
      let lastSuccess = toscalar(
        traces
        | where timestamp > ago(2d) and message has '"msg":"run.ok"'
        | summarize max(timestamp));
      print problems = iff(failed > 0, 1, 0) + iff(isnull(lastSuccess) or lastSuccess < ago(26h), 1, 0)
      QUERY
    time_aggregation_method = "Maximum"
    metric_measure_column   = "problems"
    operator                = "GreaterThan"
    threshold               = 0

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.ingest.id]
  }

  tags = local.tags
}
