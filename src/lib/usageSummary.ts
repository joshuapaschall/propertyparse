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
    'geocoding_calls',
    record.geocoding_calls,
    internalAdminUsage.geocoding_calls,
    customerSafeUsage.geocoding_calls,
    record.google_calls_used,
  );
  assignNumber('autocomplete_calls', record.autocomplete_calls, internalAdminUsage.autocomplete_calls, customerSafeUsage.autocomplete_calls);
  assignNumber('place_details_calls', record.place_details_calls, internalAdminUsage.place_details_calls, customerSafeUsage.place_details_calls);
  assignNumber('input_tokens', inputTokens);
  assignNumber('output_tokens', outputTokens);
  assignNumber(
    'ai_token_usage',
    record.ai_token_usage,
    internalAdminUsage.ai_token_usage,
    customerSafeUsage.ai_token_usage,
    inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined,
  );
  assignNumber('credits_used', record.credits_used, customerSafeUsage.credits_used, internalAdminUsage.credits_used);
  assignString('reconciliation_status', record.reconciliation_status, reconciliation.status, reconciliation.reconciliation_status);
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
