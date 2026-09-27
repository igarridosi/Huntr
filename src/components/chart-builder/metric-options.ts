import { METRIC_GROUPS, metricsInGroup, type MetricId } from "@/lib/chart-builder";
import type { SelectMenuGroup } from "@/components/ui/select-menu";

/** Every metric, grouped, with its short label as a search keyword ("NM", "P/E"). */
export const METRIC_GROUP_OPTIONS: ReadonlyArray<SelectMenuGroup<MetricId>> = METRIC_GROUPS.map((group) => ({
  label: group,
  options: metricsInGroup(group).map((m) => ({ value: m.id, label: m.label, keywords: m.short })),
}));

export const METRIC_SEARCH_PLACEHOLDER = "Search metrics";
