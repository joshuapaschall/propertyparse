import type { CostPanelItem, CostPanelSection } from '../components/InternalCostPanel';
import type { UsageSummaryFlatFields } from '../types/parse';

const formatCurrency = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
};

const formatCount = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toLocaleString() : null;
};

const formatDateTime = (value: string | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

const formatSyncLag = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  return `${Math.round(value / 3600)}h`;
};

const titleCase = (value: string) => value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const buildAdminCostSections = ({
  usage,
  estimatedJobCost,
  estimatedMonthlyTotal,
  jobGeocodingCalls,
}: {
  usage: UsageSummaryFlatFields;
  estimatedJobCost?: unknown;
  estimatedMonthlyTotal?: unknown;
  jobGeocodingCalls?: unknown;
}): CostPanelSection[] => {
  const sections: CostPanelSection[] = [
    _buildThisJobSection({ usage, estimatedJobCost, jobGeocodingCalls }),
    {
      title: 'Month to date',
      items: [
        { label: 'Estimated monthly total', value: formatCurrency(usage.google_month_to_date_actual_or_estimated_cost_usd ?? usage.estimated_monthly_total_usd ?? estimatedMonthlyTotal) },
        { label: 'Month-to-date geocoding usage', value: formatCount(usage.month_to_date_geocoding_calls) },
        { label: 'Month-to-date autocomplete usage', value: formatCount(usage.month_to_date_autocomplete_calls) },
        { label: 'Month-to-date place details usage', value: formatCount(usage.month_to_date_place_details_calls) },
        { label: 'Remaining free cap (Geocoding)', value: formatCount(usage.remaining_free_cap_geocoding) },
        { label: 'Remaining free cap (Autocomplete)', value: formatCount(usage.remaining_free_cap_autocomplete) },
        { label: 'Remaining free cap (Place Details)', value: formatCount(usage.remaining_free_cap_place_details) },
        { label: 'Reconciliation / sync status', value: usage.reconciliation_status ?? null },
        { label: 'Pricing source / confidence', value: usage.pricing_accuracy ? titleCase(usage.pricing_accuracy) : null },
      ],
      metadata: [
        usage.provider_usage_source ? `Source: ${titleCase(usage.provider_usage_source)}` : '',
        usage.pricing_accuracy ? `Confidence: ${titleCase(usage.pricing_accuracy)}` : '',
        usage.billing_snapshot_as_of ? `Billing snapshot as of ${formatDateTime(usage.billing_snapshot_as_of)}` : '',
        usage.sync_lag_seconds !== undefined ? `Sync lag: ${formatSyncLag(usage.sync_lag_seconds)}` : '',
      ],
    },
  ];

  return sections;
};

const _buildThisJobSection = ({
  usage,
  estimatedJobCost,
  jobGeocodingCalls,
}: {
  usage: UsageSummaryFlatFields;
  estimatedJobCost?: unknown;
  jobGeocodingCalls?: unknown;
}): CostPanelSection => ({
  title: 'This job',
  items: [
    { label: 'Estimated job cost', value: formatCurrency(usage.estimated_job_cost_usd ?? estimatedJobCost) },
    { label: 'Job geocoding calls', value: formatCount(usage.job_geocoding_calls ?? jobGeocodingCalls) },
    { label: 'Job autocomplete calls', value: formatCount(usage.job_autocomplete_calls) },
    { label: 'Job place details calls', value: formatCount(usage.job_place_details_calls) },
    { label: 'Job input tokens', value: formatCount(usage.job_input_tokens) },
    { label: 'Job output tokens', value: formatCount(usage.job_output_tokens) },
  ],
});

export const buildJobOnlyCostSections = ({
  usage,
  estimatedJobCost,
  jobGeocodingCalls,
}: {
  usage: UsageSummaryFlatFields;
  estimatedJobCost?: unknown;
  jobGeocodingCalls?: unknown;
}): CostPanelSection[] => [_buildThisJobSection({ usage, estimatedJobCost, jobGeocodingCalls })];

export const buildProductSafeCostItems = ({
  usage,
  estimatedJobCost,
  creditsUsed,
}: {
  usage: UsageSummaryFlatFields;
  estimatedJobCost?: unknown;
  creditsUsed?: unknown;
}): CostPanelItem[] => [
  { label: 'Estimated cost', value: formatCurrency(usage.estimated_job_cost_usd ?? estimatedJobCost) },
  { label: 'Credits used', value: formatCount(usage.credits_used ?? creditsUsed) },
];

export const formatHistoryRowCost = (value: unknown) => formatCurrency(value);
