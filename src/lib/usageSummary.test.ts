import { describe, expect, it } from 'vitest';
import { flattenUsageSummary } from './usageSummary';

describe('flattenUsageSummary', () => {
  it('preserves explicit job and month-to-date telemetry fields from backend payloads', () => {
    expect(
      flattenUsageSummary({
        job_geocoding_calls: 2,
        job_autocomplete_calls: 3,
        job_place_details_calls: 4,
        job_input_tokens: 120,
        job_output_tokens: 45,
        month_to_date_geocoding_calls: 22,
        month_to_date_autocomplete_calls: 33,
        month_to_date_place_details_calls: 44,
        month_to_date_input_tokens: 1_200,
        month_to_date_output_tokens: 450,
        google_month_to_date_actual_or_estimated_cost_usd: 18.75,
        billing_snapshot_missing: true,
        google_snapshot_rows_count: 9,
        google_billing_sync_configured: false,
        internal_admin_usage: {
          geocoding_calls: 99,
          autocomplete_calls: 88,
          place_details_calls: 77,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        job_geocoding_calls: 2,
        job_autocomplete_calls: 3,
        job_place_details_calls: 4,
        job_input_tokens: 120,
        job_output_tokens: 45,
        month_to_date_geocoding_calls: 22,
        month_to_date_autocomplete_calls: 33,
        month_to_date_place_details_calls: 44,
        month_to_date_input_tokens: 1_200,
        month_to_date_output_tokens: 450,
        google_month_to_date_actual_or_estimated_cost_usd: 18.75,
        billing_snapshot_missing: true,
        google_snapshot_rows_count: 9,
        google_billing_sync_configured: false,
        geocoding_calls: 99,
        autocomplete_calls: 88,
        place_details_calls: 77,
      }),
    );
  });
});
