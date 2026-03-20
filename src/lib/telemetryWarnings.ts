import type { UsageSummaryFlatFields } from '../types/parse';

export const LOCAL_ONLY_BILLING_WARNING =
  'Local estimate only — billing sync has not populated month-to-date provider totals yet.';

export const hasLocalOnlyBillingWarning = (usage: UsageSummaryFlatFields) =>
  usage.provider_usage_source === 'local_ledger_only' ||
  usage.pricing_accuracy === 'local_only' ||
  usage.billing_snapshot_missing === true;
