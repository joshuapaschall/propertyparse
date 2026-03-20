import type { ParseSummary, UsageSummaryFlatFields } from '../types/parse';

const toRecord = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const pickNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = toString(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

const pickBoolean = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = toBoolean(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

export const flattenUsageSummary = (input: Record<string, unknown>): UsageSummaryFlatFields => {
  const record = toRecord(input);
  const customerSafeUsage = toRecord(record.customer_safe_usage);
  const internalAdminUsage = toRecord(record.internal_admin_usage);
  const reconciliation = toRecord(record.reconciliation);
  const remainingFreeCap = toRecord(
    reconciliation.remaining_free_cap ??
      internalAdminUsage.remaining_free_cap ??
      customerSafeUsage.remaining_free_cap,
  );

  const flattened: UsageSummaryFlatFields = {};

  const assignNumber = (key: keyof UsageSummaryFlatFields, ...values: unknown[]) => {
    const value = pickNumber(...values);
    if (value !== undefined) {
      flattened[key] = value as never;
    }
  };

  const assignString = (key: keyof UsageSummaryFlatFields, ...values: unknown[]) => {
    const value = pickString(...values);
    if (value !== undefined) {
      flattened[key] = value as never;
    }
  };

  const assignBoolean = (key: keyof UsageSummaryFlatFields, ...values: unknown[]) => {
    const value = pickBoolean(...values);
    if (value !== undefined) {
      flattened[key] = value as never;
    }
  };

  const inputTokens = pickNumber(record.input_tokens, internalAdminUsage.input_tokens, customerSafeUsage.input_tokens);
  const outputTokens = pickNumber(record.output_tokens, internalAdminUsage.output_tokens, customerSafeUsage.output_tokens);

  assignNumber(
    'estimated_job_cost_usd',
    record.estimated_job_cost_usd,
    customerSafeUsage.estimated_job_cost_usd,
    customerSafeUsage.estimated_cost_usd,
    customerSafeUsage.job_cost_usd,
    internalAdminUsage.estimated_job_cost_usd,
    internalAdminUsage.estimated_cost_usd,
    internalAdminUsage.job_cost_usd,
  );
  assignNumber(
    'estimated_monthly_total_usd',
    record.estimated_monthly_total_usd,
    record.estimated_monthly_cost_usd,
    customerSafeUsage.estimated_monthly_total_usd,
    customerSafeUsage.estimated_monthly_cost_usd,
    internalAdminUsage.estimated_monthly_total_usd,
    internalAdminUsage.estimated_monthly_cost_usd,
  );
  assignNumber(
    'google_month_to_date_actual_or_estimated_cost_usd',
    record.google_month_to_date_actual_or_estimated_cost_usd,
    internalAdminUsage.google_month_to_date_actual_or_estimated_cost_usd,
    customerSafeUsage.google_month_to_date_actual_or_estimated_cost_usd,
  );
  assignNumber(
    'geocoding_calls',
    record.geocoding_calls,
    internalAdminUsage.geocoding_calls,
    customerSafeUsage.geocoding_calls,
    record.google_calls_used,
  );
  assignNumber('autocomplete_calls', record.autocomplete_calls, internalAdminUsage.autocomplete_calls, customerSafeUsage.autocomplete_calls);
  assignNumber('place_details_calls', record.place_details_calls, internalAdminUsage.place_details_calls, customerSafeUsage.place_details_calls);
  assignNumber('job_geocoding_calls', record.job_geocoding_calls, internalAdminUsage.job_geocoding_calls, customerSafeUsage.job_geocoding_calls, record.google_calls_used);
  assignNumber('job_autocomplete_calls', record.job_autocomplete_calls, internalAdminUsage.job_autocomplete_calls, customerSafeUsage.job_autocomplete_calls);
  assignNumber('job_place_details_calls', record.job_place_details_calls, internalAdminUsage.job_place_details_calls, customerSafeUsage.job_place_details_calls);
  assignNumber('month_to_date_geocoding_calls', record.month_to_date_geocoding_calls, internalAdminUsage.month_to_date_geocoding_calls, customerSafeUsage.month_to_date_geocoding_calls);
  assignNumber('month_to_date_autocomplete_calls', record.month_to_date_autocomplete_calls, internalAdminUsage.month_to_date_autocomplete_calls, customerSafeUsage.month_to_date_autocomplete_calls);
  assignNumber('month_to_date_place_details_calls', record.month_to_date_place_details_calls, internalAdminUsage.month_to_date_place_details_calls, customerSafeUsage.month_to_date_place_details_calls);
  assignNumber('input_tokens', inputTokens);
  assignNumber('output_tokens', outputTokens);
  assignNumber('job_input_tokens', record.job_input_tokens, internalAdminUsage.job_input_tokens, customerSafeUsage.job_input_tokens, record.input_tokens);
  assignNumber('job_output_tokens', record.job_output_tokens, internalAdminUsage.job_output_tokens, customerSafeUsage.job_output_tokens, record.output_tokens);
  assignNumber('month_to_date_input_tokens', record.month_to_date_input_tokens, internalAdminUsage.month_to_date_input_tokens, customerSafeUsage.month_to_date_input_tokens);
  assignNumber('month_to_date_output_tokens', record.month_to_date_output_tokens, internalAdminUsage.month_to_date_output_tokens, customerSafeUsage.month_to_date_output_tokens);
  assignNumber(
    'ai_token_usage',
    record.ai_token_usage,
    internalAdminUsage.ai_token_usage,
    customerSafeUsage.ai_token_usage,
    inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined,
  );
  assignNumber('credits_used', record.credits_used, customerSafeUsage.credits_used, internalAdminUsage.credits_used);
  assignString('reconciliation_status', record.reconciliation_status, reconciliation.status, reconciliation.reconciliation_status);
  assignString(
    'pricing_accuracy',
    record.pricing_accuracy,
    internalAdminUsage.pricing_accuracy,
    customerSafeUsage.pricing_accuracy,
    reconciliation.pricing_accuracy,
  );
  assignString(
    'provider_usage_source',
    record.provider_usage_source,
    internalAdminUsage.provider_usage_source,
    customerSafeUsage.provider_usage_source,
    reconciliation.provider_usage_source,
  );
  assignString(
    'billing_snapshot_as_of',
    record.billing_snapshot_as_of,
    internalAdminUsage.billing_snapshot_as_of,
    customerSafeUsage.billing_snapshot_as_of,
    reconciliation.billing_snapshot_as_of,
  );
  assignBoolean(
    'billing_snapshot_missing',
    record.billing_snapshot_missing,
    internalAdminUsage.billing_snapshot_missing,
    customerSafeUsage.billing_snapshot_missing,
    reconciliation.billing_snapshot_missing,
  );
  assignNumber(
    'google_snapshot_rows_count',
    record.google_snapshot_rows_count,
    internalAdminUsage.google_snapshot_rows_count,
    customerSafeUsage.google_snapshot_rows_count,
    reconciliation.google_snapshot_rows_count,
  );
  assignBoolean(
    'google_billing_sync_configured',
    record.google_billing_sync_configured,
    internalAdminUsage.google_billing_sync_configured,
    customerSafeUsage.google_billing_sync_configured,
    reconciliation.google_billing_sync_configured,
  );
  assignNumber(
    'sync_lag_seconds',
    record.sync_lag_seconds,
    internalAdminUsage.sync_lag_seconds,
    customerSafeUsage.sync_lag_seconds,
    reconciliation.sync_lag_seconds,
  );
  assignNumber('remaining_free_cap_geocoding', record.remaining_free_cap_geocoding, remainingFreeCap.geocoding, internalAdminUsage.remaining_free_cap_geocoding, customerSafeUsage.remaining_free_cap_geocoding);
  assignNumber('remaining_free_cap_autocomplete', record.remaining_free_cap_autocomplete, remainingFreeCap.autocomplete, internalAdminUsage.remaining_free_cap_autocomplete, customerSafeUsage.remaining_free_cap_autocomplete);
  assignNumber('remaining_free_cap_place_details', record.remaining_free_cap_place_details, remainingFreeCap.place_details, remainingFreeCap.placeDetails, internalAdminUsage.remaining_free_cap_place_details, customerSafeUsage.remaining_free_cap_place_details);

  return flattened;
};

export const mergeUsageSummary = <T extends Record<string, unknown>>(input: T): T & UsageSummaryFlatFields => ({
  ...input,
  ...flattenUsageSummary(input),
});

export const toUsageParseSummary = (input: Record<string, unknown>): Partial<ParseSummary> => flattenUsageSummary(input);
