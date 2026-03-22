export type UsageSummaryFlatFields = {
  geocoding_calls?: number;
  autocomplete_calls?: number;
  place_details_calls?: number;
  job_geocoding_calls?: number;
  job_autocomplete_calls?: number;
  job_place_details_calls?: number;
  ai_token_usage?: number;
  input_tokens?: number;
  output_tokens?: number;
  job_input_tokens?: number;
  job_output_tokens?: number;
  month_to_date_geocoding_calls?: number;
  month_to_date_autocomplete_calls?: number;
  month_to_date_place_details_calls?: number;
  month_to_date_input_tokens?: number;
  month_to_date_output_tokens?: number;
  estimated_job_cost_usd?: number;
  estimated_monthly_total_usd?: number;
  estimated_monthly_cost_usd?: number;
  google_month_to_date_actual_or_estimated_cost_usd?: number;
  remaining_free_cap_estimate?: number;
  remaining_free_cap_estimate_usd?: number;
  remaining_free_cap_geocoding?: number;
  remaining_free_cap_autocomplete?: number;
  remaining_free_cap_place_details?: number;
  credits_used?: number;
  reconciliation_status?: string;
  pricing_accuracy?: string;
  provider_usage_source?: string;
  billing_snapshot_as_of?: string;
  billing_snapshot_missing?: boolean;
  google_snapshot_rows_count?: number;
  google_billing_sync_configured?: boolean;
  billing_sync_configured?: boolean;
  sync_lag_seconds?: number;
};

export type UsageSummaryNestedFields = {
  customer_safe_usage?: Record<string, unknown>;
  internal_admin_usage?: Record<string, unknown>;
  reconciliation?: Record<string, unknown>;
};

export type ParseSummary = UsageSummaryFlatFields & UsageSummaryNestedFields & {
  rows_received: number;
  valid_total: number;
  valid_unique: number;
  needs_review: number;
  out_of_scope: number;
  skipped: number;
  duplicates: number;
  matched: number;
  attention_total: number;
  google_calls_used?: number;
  openai_ocr_calls_used?: number;
  spend_usd?: number;
  unmatched?: number;
};

export type CanonicalAddress = {
  canonical_id: string;
  formatted_address: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  place_id?: string;
  components?: unknown;
};

export type RowResult = {
  source_row_index: number;
  source_row_id: string;
  raw_row?: Record<string, unknown>;
  detected_address?: string;
  status: string;
  reason_code?: string;
  reason_detail?: string;
  scope_debug?: unknown;
  formatted_address?: string;
  matched_address?: string;
  matched_address_display?: string;
  google_display_address?: string;
  google_formatted_address?: string;
  address_raw?: string;
  normalized_compare_input?: string;
  place_id?: string;
  components?: unknown;
  canonical_id?: string;
  is_duplicate?: boolean;
  duplicate_of_source_row_id?: string;
  verification_precision?: string;
  decision_tier?: string;
  resolver_strategy?: string;
  candidate_count_in_scope?: number;
  converged_place_ids?: string[];
  competing_place_ids?: string[];
  ambiguity_reason?: string;
  compare_debug?: unknown;
  blocked_by?: string | string[];
  public_reason_label?: string;
  public_reason_message?: string;
  public_action_hint?: string;
  manual_actions?: unknown;
};

export type ManualActions = {
  can_approve_matched?: boolean;
  can_scope_override?: boolean;
  can_force_override?: boolean;
  blocker?: string | null;
  blocker_message?: string | null;
  [key: string]: unknown;
};

export type DuplicateGroup = {
  canonical_id: string;
  canonical_formatted_address: string;
  source_row_ids: string[];
  duplicate_rows_count?: number;
};

export type ParseDebugInfo = {
  detected_address_column?: string;
  detection_method?: 'header_match' | 'content_scoring' | 'fallback';
  no_addresses_detected?: boolean;
};

export type ParseResponseV2 = {
  summary: ParseSummary;
  canonical_addresses: CanonicalAddress[];
  row_results: RowResult[];
  duplicate_groups: DuplicateGroup[];
  debug?: ParseDebugInfo;
  metadata?: Record<string, unknown>;
};
