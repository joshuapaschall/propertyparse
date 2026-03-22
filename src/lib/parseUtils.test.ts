import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RowResult } from '../types/parse';
import AsyncLocationSelect, { normalizeLocalityInput } from '../components/AsyncLocationSelect';
import AsyncLocationMultiSelect from '../components/AsyncLocationMultiSelect';
import {
  buildLocalCsvForExport,
  computeParseSummaryFromRowResults,
  getApprovalCapabilities,
  getDisplaySafeMatchedAddress,
  getManualApprovalBlocker,
  getReasonMetadata,
  getResolverDetails,
  getReviewDebugHint,
  getReviewExplanation,
  getReviewReasonBucket,
  isHeaderOnlyCsv,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSafeManualApprovalCandidate,
  isSkippedRow,
  isValidRow,
  shouldShowOneCandidateBadge,
} from './parseUtils';

vi.mock('react-select/async', () => ({
  default: ({ defaultOptions, loadOptions, onChange, noOptionsMessage }: any) => {
    const options = Array.isArray(defaultOptions)
      ? defaultOptions.flatMap((group: any) => group.options ?? [])
      : [];
    return React.createElement(
      'div',
      null,
      React.createElement('button', { type: 'button', onClick: () => void loadOptions('') }, 'open-menu'),
      ...(options.length
        ? options.map((option: any) =>
            React.createElement('button', { key: option.value, type: 'button', onClick: () => onChange(option) }, option.label),
          )
        : [React.createElement('div', { key: 'empty' }, noOptionsMessage?.({ inputValue: '' }))]),
    );
  },
}));

vi.mock('react-select/async-creatable', () => ({
  default: ({ defaultOptions, loadOptions, onChange, onCreateOption, formatCreateLabel }: any) => {
    const options = Array.isArray(defaultOptions)
      ? defaultOptions.flatMap((group: any) => group.options ?? [])
      : [];
    return React.createElement(
      'div',
      null,
      React.createElement('button', { type: 'button', onClick: () => void loadOptions('') }, 'open-menu'),
      React.createElement('button', { type: 'button', onClick: () => onCreateOption('  stone   crest  ') }, formatCreateLabel('Stonecrest')),
      ...options.map((option: any) =>
        React.createElement('button', { key: option.value, type: 'button', onClick: () => onChange(option) }, option.label),
      ),
    );
  },
}));

const buildRow = (overrides: Partial<RowResult>): RowResult => ({
  source_row_index: 1,
  source_row_id: 'row-1',
  status: 'VALID',
  ...overrides,
});

describe('parseUtils filters', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('flags needs review rows by status or reason', () => {
    expect(isNeedsReviewRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ status: 'unmatched_other' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ reason_code: 'needs_review' }))).toBe(true);

    expect(isNeedsReviewRow(buildRow({ status: 'NEEDS_REVIEW' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ status: 'REVIEW_REQUIRED' }))).toBe(true);
    expect(isNeedsReviewRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('flags skipped rows by status prefix or skipped reason code', () => {
    expect(isSkippedRow(buildRow({ status: 'SKIPPED' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'SKIPPED_NO_ADDRESS_FOUND' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'NON_ADDRESS_TEXT' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'VALID', reason_code: 'PO_BOX' }))).toBe(true);
    expect(isSkippedRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('keeps skipped non-address rows out of needs review', () => {
    expect(isNeedsReviewRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'NON_ADDRESS_TEXT' }))).toBe(false);
    expect(isNeedsReviewRow(buildRow({ status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'PO_BOX' }))).toBe(false);
  });

  it('flags matched rows as valid', () => {
    expect(isValidRow(buildRow({ status: 'MATCHED' }))).toBe(true);
  });

  it('treats VALID_OVERRIDE rows as valid', () => {
    expect(isValidRow(buildRow({ status: 'VALID_OVERRIDE' }))).toBe(true);
  });

  it('treats duplicate rows as valid', () => {
    expect(isValidRow(buildRow({ status: 'DUPLICATE' }))).toBe(true);
    expect(isValidRow(buildRow({ status: 'UNMATCHED', is_duplicate: true }))).toBe(true);
  });

  it('computes duplicate counts from row results', () => {
    const rows: RowResult[] = [
      buildRow({ source_row_id: 'row-1', status: 'VALID', canonical_id: 'canon-1', formatted_address: '123 Main St' }),
      buildRow({ source_row_id: 'row-2', status: 'DUPLICATE', canonical_id: 'canon-1', is_duplicate: true, duplicate_of_source_row_id: 'row-1' }),
      buildRow({ source_row_id: 'row-3', status: 'UNMATCHED_NEEDS_REVIEW' }),
    ];

    const summary = computeParseSummaryFromRowResults(rows);

    expect(summary.rows_received).toBe(3);
    expect(summary.valid_total).toBe(2);
    expect(summary.valid_unique).toBe(1);
    expect(summary.duplicates).toBeGreaterThan(0);
    expect(summary.needs_review).toBe(1);
    expect(summary.attention_total).toBe(1);
  });

  it('prefers google display fields over matched_address for display-safe matched address text', () => {
    const row = buildRow({
      matched_address: '4785 Georgia, 5, Douglasville, Georgia 30135',
      matched_address_display: '4785 Hwy 5, Douglasville, GA 30135',
      google_formatted_address: '4785 Highway 5, Douglasville, GA 30135',
      google_display_address: '4785 Highway 5, Douglasville, GA 30135',
      formatted_address: 'fallback',
    });

    expect(getDisplaySafeMatchedAddress(row)).toBe('4785 Highway 5, Douglasville, GA 30135');
  });

  it('flags out of scope rows by status or reason', () => {
    expect(isOutOfScopeRow(buildRow({ status: 'SKIPPED_OUT_OF_SCOPE' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ reason_code: 'OUT_OF_SCOPE' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ status: 'VALID' }))).toBe(false);
  });

  it('treats out-of-scope marker rows as out of scope', () => {
    expect(isOutOfScopeRow(buildRow({ status: 'OUT_OF_SCOPE_MARKER' }))).toBe(true);
    expect(isOutOfScopeRow(buildRow({ reason_code: 'OUT_OF_SCOPE_MARKER' }))).toBe(true);
  });

  it('maps review reason buckets and debug hints', () => {
    expect(getReviewReasonBucket(buildRow({ reason_code: 'ROUTE_ALIAS' }))).toBe('route_alias');
    expect(getReviewReasonBucket(buildRow({ reason_code: 'HOUSE_NUMBER_MISMATCH' }))).toBe('house_number');
    expect(getReviewReasonBucket(buildRow({ reason_code: 'LOW_PRECISION' }))).toBe('low_precision');
    expect(getReviewDebugHint(buildRow({ blocked_by: 'directional conflict' }))).toBe('Blocked by directional conflict');
    expect(getReviewDebugHint(buildRow({ verification_precision: 'county' }))).toBe('Candidate is county-level only');
  });

  it('prefers resolver metadata for explanations and approval gating while preserving legacy fallbacks', () => {
    const resolverRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      resolver_strategy: 'wrapper_text_single_candidate',
      decision_tier: 'manual_confirm',
      candidate_count_in_scope: 1,
      matched_address: '12 Main St',
      normalized_compare_input: '12 MAIN ST',
    });
    const ambiguousRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      candidate_count_in_scope: 2,
      ambiguity_reason: 'Two similar street names remain',
      matched_address: '12 Main St',
      competing_place_ids: ['p1', 'p2'],
    });
    const blockedLowPrecisionRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      candidate_count_in_scope: 1,
      matched_address: '12 Main St',
      decision_tier: 'low_precision',
      blocked_by: ['low_precision_match'],
    });
    const legacyRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      reason_code: 'LOW_PRECISION',
      verification_precision: 'county',
    });

    expect(getReviewExplanation(resolverRow)).toBe('Wrapper text removed; one in-scope candidate found');
    expect(isSafeManualApprovalCandidate(resolverRow)).toBe(true);
    expect(getReviewExplanation(ambiguousRow)).toBe('Multiple in-scope candidates remain');
    expect(getManualApprovalBlocker(ambiguousRow)).toBe('Multiple in-scope candidates remain');
    expect(getReviewExplanation(blockedLowPrecisionRow)).toBe('County-only candidate after rescue');
    expect(getManualApprovalBlocker(blockedLowPrecisionRow)).toBe('County-only candidate after rescue');
    expect(getReviewExplanation(legacyRow)).toBe('We could not confirm a full street address');
    expect(getReviewDebugHint(legacyRow)).toBe('Candidate is county-level only');
  });

  it('shows subtle badge and resolver details for single-candidate reviews that still need confirmation', () => {
    const row = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      detected_address: '123 Main St',
      normalized_compare_input: '123 MAIN ST',
      candidate_count_in_scope: 1,
      resolver_strategy: 'route_only_fallback',
      verification_precision: 'route',
      ambiguity_reason: 'Second-pass rescue failed',
      compare_debug: { candidate: 'route' },
      blocked_by: ['missing street number'],
    });

    expect(shouldShowOneCandidateBadge(row)).toBe(true);
    expect(isSafeManualApprovalCandidate(row)).toBe(false);
    expect(getResolverDetails(row)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Resolver', value: 'route_only_fallback' }),
        expect.objectContaining({ label: 'Original', value: '123 Main St' }),
        expect.objectContaining({ label: 'Compared as', value: '123 MAIN ST' }),
        expect.objectContaining({ label: 'In-scope candidates', value: '1' }),
        expect.objectContaining({ label: 'Blocked by', value: 'missing street number' }),
      ]),
    );
  });

  it('keeps legacy rows backwards-compatible without resolver metadata', () => {
    const row = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      detected_address: '789 Oak Ave',
      reason_code: 'ROUTE_ALIAS',
    });

    expect(getReviewExplanation(row)).toBe('Street details need confirmation');
    expect(getResolverDetails(row)).toEqual([{ label: 'Original', value: '789 Oak Ave' }]);
    expect(getManualApprovalBlocker(row)).toBe('No street-level candidate was resolved');
  });

  it('builds local csv exports and detects header-only csv', async () => {
    const blob = buildLocalCsvForExport('needs_review', {
      rowResults: [buildRow({ source_row_id: 'r1', status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'LOW_PRECISION' })],
      canonicalAddresses: [],
    });
    expect(blob).toBeDefined();
    expect(isHeaderOnlyCsv('a,b\n')).toBe(true);
    expect(isHeaderOnlyCsv('a,b\n1,2')).toBe(false);
  });

  it('hides provider jargon in public review and out-of-scope wording', () => {
    const googleErrorRow = buildRow({ status: 'UNMATCHED_NEEDS_REVIEW', reason_code: 'GOOGLE_ERROR', reason_detail: 'Google error: bad token' });
    const countyMismatchRow = buildRow({ status: 'OUT_OF_SCOPE', reason_code: 'county_mismatch', reason_detail: 'county_mismatch' });
    const publicFieldRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      reason_code: 'LOW_PRECISION_MATCH',
      public_reason_label: 'Street details need confirmation',
      public_reason_message: 'We could not confirm this address automatically.',
      public_action_hint: 'Check the full street address and retry.',
    });

    expect(getReasonMetadata(googleErrorRow).label).toBe('We could not verify this address automatically');
    expect(getReasonMetadata(countyMismatchRow).label).toBe('Outside your selected county');
    expect(getReasonMetadata(countyMismatchRow).description).toBe('This record appears outside your selected area.');
    expect(getReasonMetadata(publicFieldRow)).toEqual({
      label: 'Street details need confirmation',
      description: 'We could not confirm this address automatically.',
      fix_hint: 'Check the full street address and retry.',
    });
  });

  it('prefers backend approval capabilities and falls back to safe frontend gating', () => {
    const backendOverrideRow = buildRow({
      status: 'OUT_OF_SCOPE',
      place_id: 'p1',
      manual_actions: { can_scope_override: true, blocker_message: 'Scope override required' },
    });
    const fallbackSafeRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      place_id: 'p2',
      matched_address: '12 Main St',
      resolver_strategy: 'wrapper_text_single_candidate',
      decision_tier: 'manual_confirm',
      candidate_count_in_scope: 1,
      normalized_compare_input: '12 MAIN ST',
    });
    const blockedRow = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      place_id: 'p3',
      matched_address: '14 Main St',
      candidate_count_in_scope: 1,
      blocked_by: ['house_number_mismatch'],
      resolver_strategy: 'wrapper_text_single_candidate',
    });

    expect(getApprovalCapabilities(backendOverrideRow)).toEqual({
      canApproveMatched: false,
      canApproveWithScopeOverride: true,
      canForceOverride: false,
      blocker: 'Scope override required',
      source: 'backend',
    });
    expect(getApprovalCapabilities(fallbackSafeRow)).toEqual({
      canApproveMatched: true,
      canApproveWithScopeOverride: false,
      canForceOverride: false,
      blocker: null,
      source: 'fallback',
    });
    expect(getApprovalCapabilities(blockedRow)).toEqual({
      canApproveMatched: false,
      canApproveWithScopeOverride: false,
      canForceOverride: false,
      blocker: 'House number conflict',
      source: 'fallback',
    });
  });

  it('surfaces backend blocker and force override capability', () => {
    const row = buildRow({
      status: 'UNMATCHED_NEEDS_REVIEW',
      manual_actions: {
        can_approve_matched: false,
        can_scope_override: false,
        can_force_override: true,
        blocker: 'Route mismatch requires explicit override',
      },
    });

    expect(getApprovalCapabilities(row)).toEqual({
      canApproveMatched: false,
      canApproveWithScopeOverride: false,
      canForceOverride: true,
      blocker: 'Route mismatch requires explicit override',
      source: 'backend',
    });
  });

  it('normalizes custom locality input for deliberate reuse', () => {
    expect(normalizeLocalityInput('  stone   crest  ')).toBe('Stone Crest');
  });

  it('shows empty-query options and stores recent custom localities by scope', async () => {
    const user = userEvent.setup();
    const loadOptions = vi.fn().mockResolvedValue(['Atlanta', 'Decatur']);
    const onChange = vi.fn();

    const { rerender } = render(React.createElement(AsyncLocationSelect, {
      label: 'City / locality',
      value: '',
      placeholder: 'Search',
      cacheScope: 'cities:GA:DeKalb',
      allowCustomValue: true,
      loadOptions,
      onChange,
      onClear: () => undefined,
    }));

    await waitFor(() => expect(loadOptions).toHaveBeenCalledWith(''));
    expect(screen.getByText('Atlanta')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Use custom locality/i }));
    expect(onChange).toHaveBeenCalledWith('Stone Crest');

    rerender(React.createElement(AsyncLocationSelect, {
      label: 'City / locality',
      value: '',
      placeholder: 'Search',
      cacheScope: 'cities:GA:DeKalb',
      allowCustomValue: true,
      loadOptions,
      onChange,
      onClear: () => undefined,
    }));

    expect(window.localStorage.getItem('pp-recent-custom-localities')).toContain('Stone Crest');
  });
});


describe('locality select helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('normalizes custom locality values before saving', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      React.createElement(AsyncLocationSelect, {
        label: 'City / locality',
        value: '',
        placeholder: 'Search',
        cacheScope: 'cities:GA:Dekalb',
        allowCustomValue: true,
        loadOptions: vi.fn().mockResolvedValue(['Stone Mountain']),
        onChange,
        onClear: () => {},
      }),
    );

    await user.click(screen.getByRole('button', { name: /Use custom locality/i }));

    expect(onChange).toHaveBeenCalledWith('Stone Crest');
  });

  it('stores recent custom localities by scoped county and shows them above official results', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      React.createElement(AsyncLocationMultiSelect, {
        label: 'Localities',
        values: [],
        placeholder: 'Search',
        cacheScope: 'cities:GA:Dekalb',
        loadOptions: vi.fn().mockResolvedValue(['Lithonia']),
        onChange,
      }),
    );

    await user.click(screen.getByRole('button', { name: /Use custom locality/i }));
    const stored = JSON.parse(window.localStorage.getItem('pp-recent-custom-localities') ?? '{}');
    expect(stored['cities:GA:Dekalb']).toEqual(['Stone Crest']);

    render(
      React.createElement(AsyncLocationMultiSelect, {
        label: 'Localities',
        values: [],
        placeholder: 'Search',
        cacheScope: 'cities:GA:Dekalb',
        loadOptions: vi.fn().mockResolvedValue(['Lithonia']),
        onChange: vi.fn(),
      }),
    );

    await user.click(screen.getAllByRole('button', { name: 'open-menu' })[1]);
    expect(window.localStorage.getItem('pp-recent-custom-localities')).toContain('cities:GA:Dekalb');
    expect(screen.getAllByRole('button', { name: /Use custom locality "Stonecrest"/i }).length).toBeGreaterThan(0);
  });
});
