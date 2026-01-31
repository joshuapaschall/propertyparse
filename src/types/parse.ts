export type ParseSummary = {
  rows_received: number;
  valid_unique: number;
  valid_total: number;
  unmatched: number;
  skipped: number;
  duplicates: number;
  out_of_scope?: number;
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
  formatted_address?: string;
  place_id?: string;
  components?: unknown;
  canonical_id?: string;
  is_duplicate?: boolean;
  duplicate_of_source_row_id?: string;
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
