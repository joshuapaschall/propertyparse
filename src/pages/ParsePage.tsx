import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import AccountedRowsIndicator from '../components/AccountedRowsIndicator';
import FileUploadCard from '../components/FileUploadCard';
import LocationSelect from '../components/LocationSelect';
import ProcessingReportModal, {
  ProcessingReportFilter,
} from '../components/ProcessingReportModal';
import ProgressIndicator from '../components/ProgressIndicator';
import ResultsTable from '../components/ResultsTable';
import EditRowModal, { ParsedRow } from '../components/EditRowModal';
import { downloadCsv } from '../lib/csv';
import {
  buildReasonLabel,
  isErrorRow,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSkippedRow,
  stringifyPreview,
} from '../lib/parseUtils';
import { parseFile, retryParseBatch, retryParseRow, uploadFile } from '../lib/api';
import { listCitiesByState, listCounties, listStates50 } from '../lib/locations';
import type {
  CanonicalAddress,
  DuplicateGroup,
  ParseDebugInfo,
  ParseSummary,
  RowResult,
} from '../types/parse';

const PROGRESS_STEPS = ['Uploading', 'Extracting', 'Parsing', 'Validating', 'Finalizing'];

const createId = (row: Record<string, unknown>, index: number) =>
  (row.id as string) || (row.uuid as string) || `${crypto.randomUUID?.() ?? `row-${index}`}`;

const stringifyValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
};

const normalizeRow = (row: Record<string, unknown>, index: number): ParsedRow => {
  const fullAddress = (row.full_address as string) || '';
  const streetAddress = (row.street_address as string) || '';
  const address2 = (row.address2 as string) || '';
  const city = (row.city as string) || '';
  const state = (row.state as string) || '';
  const zipCode = (row.zip_code as string) || '';
  const status = (row.status as string) || '';
  const sourceRaw = stringifyValue(row.raw ?? '');
  const unmatchedReason = (row.unmatched_reason as string) || '';
  const verificationSource = (row.verification_source as string) || '';
  const fromCacheValue = row.from_cache;
  const fromCache =
    typeof fromCacheValue === 'boolean'
      ? fromCacheValue
      : typeof fromCacheValue === 'string'
        ? fromCacheValue.toLowerCase() === 'true'
        : undefined;
  const placeId = (row.place_id as string) || '';

  return {
    id: createId(row, index),
    fullAddress,
    streetAddress,
    address2,
    city,
    state,
    zipCode,
    status,
    sourceRaw,
    unmatchedReason,
    verificationSource,
    fromCache,
    placeId,
    original: row,
  };
};

const normalizeRows = (items: unknown[]) =>
  items.map((item, index) => normalizeRow(item as Record<string, unknown>, index));

const buildKey = (row: ParsedRow) =>
  `${row.streetAddress} ${row.city} ${row.state} ${row.zipCode}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const dedupeRows = (rows: ParsedRow[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = buildKey(row) || row.fullAddress.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const copyJsonPayload = (payload: unknown) => {
  const text = JSON.stringify(payload, null, 2);
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const buildProcessingReportRows = (rows: RowResult[]) =>
  rows.map((row) => ({
    source_row_index: row.source_row_index,
    source_row_id: row.source_row_id,
    status: row.status,
    reason_code: row.reason_code ?? '',
    reason_detail: row.reason_detail ?? '',
    detected_address: row.detected_address ?? '',
    formatted_address: row.formatted_address ?? '',
    place_id: row.place_id ?? '',
    canonical_id: row.canonical_id ?? '',
    is_duplicate: row.is_duplicate ?? false,
    duplicate_of_source_row_id: row.duplicate_of_source_row_id ?? '',
    raw_row_json: row.raw_row ? JSON.stringify(row.raw_row) : '',
  }));

const buildCanonicalCsvRows = (rows: CanonicalAddress[]) =>
  rows.map((row) => ({
    canonical_id: row.canonical_id,
    formatted_address: row.formatted_address,
    street1: row.street1 ?? '',
    street2: row.street2 ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    zip: row.zip ?? '',
    place_id: row.place_id ?? '',
    components_json: row.components ? JSON.stringify(row.components) : '',
  }));

export default function ParsePage() {
  const [stateValue, setStateValue] = useState('');
  const [countyValue, setCountyValue] = useState('');
  const [cityValue, setCityValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [parseTimestamp, setParseTimestamp] = useState<string | null>(null);
  const [rowsReceived, setRowsReceived] = useState<number | null>(null);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);
  const [canonicalAddresses, setCanonicalAddresses] = useState<CanonicalAddress[]>([]);
  const [rowResults, setRowResults] = useState<RowResult[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [debugInfo, setDebugInfo] = useState<ParseDebugInfo | null>(null);
  const [legacyMatchedRows, setLegacyMatchedRows] = useState<ParsedRow[]>([]);
  const [legacyUnmatchedRows, setLegacyUnmatchedRows] = useState<ParsedRow[]>([]);
  const [activeTab, setActiveTab] = useState<
    'valid' | 'needs_review' | 'skipped' | 'duplicates' | 'out_of_scope'
  >('valid');
  const [legacyTab, setLegacyTab] = useState<'matched' | 'unmatched'>('matched');
  const [showRaw, setShowRaw] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [editingRow, setEditingRow] = useState<ParsedRow | null>(null);
  const [retryAvailable, setRetryAvailable] = useState<'unknown' | 'available' | 'unavailable'>(
    'unknown',
  );
  const [forceRefresh, setForceRefresh] = useState(false);
  const [legacyMode, setLegacyMode] = useState(false);
  const [processingReportOpen, setProcessingReportOpen] = useState(false);
  const [processingReportFilter, setProcessingReportFilter] = useState<ProcessingReportFilter>(
    'all',
  );
  const [expandedDuplicateGroups, setExpandedDuplicateGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [parsePayload, setParsePayload] = useState<Record<string, unknown> | null>(null);
  const didLogLocations = useRef(false);

  const canParse = Boolean(file && stateValue && countyValue);

  const dedupedMatched = useMemo(() => dedupeRows(legacyMatchedRows), [legacyMatchedRows]);
  const dedupedUnmatched = useMemo(() => dedupeRows(legacyUnmatchedRows), [legacyUnmatchedRows]);
  const states = useMemo(() => listStates50(), []);
  const counties = useMemo(() => (stateValue ? listCounties(stateValue) : []), [stateValue]);
  const cities = useMemo(() => (stateValue ? listCitiesByState(stateValue) : []), [stateValue]);

  useEffect(() => {
    if (!import.meta.env.DEV || didLogLocations.current) return;
    didLogLocations.current = true;
    const georgiaCounties = listCounties('Georgia');
    const georgiaCities = listCitiesByState('Georgia');
    console.info(
      `[locations] states=${states.length} (expected 50), GA counties=${georgiaCounties.length}, GA cities=${georgiaCities.length}`,
    );
  }, [states]);

  const apiCallsUsed = useMemo(() => {
    if (!metadata) return null;
    return (
      (metadata.apiCallsUsed as number) ||
      (metadata.api_calls_used as number) ||
      (metadata.api_calls as number) ||
      (metadata.callsUsed as number) ||
      null
    );
  }, [metadata]);

  const candidatesExtracted = useMemo(() => {
    if (!metadata) return null;
    return (metadata.candidates_extracted as number) || (metadata.candidatesExtracted as number) || null;
  }, [metadata]);

  const dedupedCount = useMemo(() => {
    if (!metadata) return null;
    return (metadata.deduped_count as number) || (metadata.dedupedCount as number) || null;
  }, [metadata]);

  const cacheHits = useMemo(() => {
    if (!metadata) return null;
    return (metadata.cache_hits as number) || (metadata.cacheHits as number) || null;
  }, [metadata]);

  const googleCallsUsed = useMemo(() => {
    if (!metadata) return null;
    return (metadata.google_calls_used as number) || (metadata.googleCallsUsed as number) || null;
  }, [metadata]);

  const verificationSourceCounts = useMemo(() => {
    if (!metadata) return null;
    return (metadata.verification_source_counts as Record<string, number>) || null;
  }, [metadata]);

  const verificationSourcesSummary = useMemo(() => {
    if (!verificationSourceCounts) return null;
    const preferredOrder = ['cache', 'geocoding', 'places', 'parser'];
    const entries = Object.entries(verificationSourceCounts).filter(([, value]) => typeof value === 'number');
    if (!entries.length) return null;
    const orderedEntries = [
      ...preferredOrder
        .map((key) => [key, verificationSourceCounts[key]] as const)
        .filter(([, value]) => typeof value === 'number'),
      ...entries.filter(([key]) => !preferredOrder.includes(key)),
    ];
    return orderedEntries.map(([key, value]) => `${key} ${value}`).join(' • ');
  }, [verificationSourceCounts]);

  const unmatchedCount = useMemo(() => {
    if (!metadata) return dedupedUnmatched.length;
    return (
      (metadata.unmatched_count as number) ||
      (metadata.unmatchedCount as number) ||
      dedupedUnmatched.length
    );
  }, [metadata, dedupedUnmatched.length]);

  const metadataWarnings = useMemo(() => {
    if (!metadata) return [];
    const warnings = metadata.warnings;
    if (Array.isArray(warnings)) {
      return warnings.map((warning) => stringifyValue(warning)).filter(Boolean);
    }
    if (typeof warnings === 'string' && warnings.trim()) {
      return [warnings.trim()];
    }
    return [];
  }, [metadata]);

  const noAddressesDetected = useMemo(() => {
    if (candidatesExtracted === 0) return true;
    if (!rowsReceived || rowsReceived <= 0) return false;
    return dedupedMatched.length + dedupedUnmatched.length === 0;
  }, [rowsReceived, candidatesExtracted, dedupedMatched.length, dedupedUnmatched.length]);

  const needsReviewRows = useMemo(() => rowResults.filter(isNeedsReviewRow), [rowResults]);
  const skippedRows = useMemo(() => rowResults.filter(isSkippedRow), [rowResults]);
  const outOfScopeRows = useMemo(() => rowResults.filter(isOutOfScopeRow), [rowResults]);
  const errorRows = useMemo(() => rowResults.filter(isErrorRow), [rowResults]);
  const rowResultsById = useMemo(() => {
    const map = new Map<string, RowResult>();
    rowResults.forEach((row) => map.set(row.source_row_id, row));
    return map;
  }, [rowResults]);

  const rowAccountingMismatch = useMemo(() => {
    if (!parseSummary) return false;
    return rowResults.length !== parseSummary.rows_received;
  }, [parseSummary, rowResults.length]);

  const handleCopyDebugInfo = () => {
    const debugInfo = [
      `Timestamp: ${parseTimestamp ?? new Date().toISOString()}`,
      `State: ${stateValue || '--'}`,
      `County: ${countyValue || '--'}`,
      `City: ${cityValue || '--'}`,
      `File: ${file?.name || '--'}`,
      `File ID: ${fileId ?? '--'}`,
      `Rows received: ${rowsReceived ?? '--'}`,
      `Summary: ${parseSummary ? JSON.stringify(parseSummary, null, 2) : '--'}`,
      `Row results count: ${rowResults.length}`,
      `Duplicate groups: ${duplicateGroups.length}`,
      `Debug: ${debugInfo ? JSON.stringify(debugInfo, null, 2) : '--'}`,
      `Response: ${parsePayload ? JSON.stringify(parsePayload, null, 2) : '--'}`,
      `Metadata: ${metadata ? JSON.stringify(metadata, null, 2) : '--'}`,
    ].join('\n');

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(debugInfo);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = debugInfo;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const handleParse = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setRowsReceived(null);
    setParseSummary(null);
    setCanonicalAddresses([]);
    setRowResults([]);
    setDuplicateGroups([]);
    setDebugInfo(null);
    setParsePayload(null);
    setLegacyMatchedRows([]);
    setLegacyUnmatchedRows([]);
    setMetadata(null);
    setLegacyMode(false);
    setProgressStep(0);
    setProgressPercent(null);
    setProcessingReportFilter('all');
    setActiveTab('valid');
    setLegacyTab('matched');
    try {
      const upload = await uploadFile(file);
      setFileId(upload.fileId);
      setRowsReceived(upload.rowsReceived ?? null);
      setProgressStep(1);
      setProgressStep(2);
      const parsed = await parseFile(upload.fileId, {
        state: stateValue,
        county: countyValue,
        city: cityValue || undefined,
        force_refresh: forceRefresh,
      });
      setParseTimestamp(new Date().toISOString());
      setParsePayload(parsed as Record<string, unknown>);
      setProgressStep(3);
      setProgressStep(4);
      const hasRowAccounting = Boolean(parsed.summary && parsed.row_results);
      if (hasRowAccounting) {
        const summary = parsed.summary as ParseSummary;
        setParseSummary(summary);
        setRowsReceived(summary.rows_received ?? upload.rowsReceived ?? null);
        setCanonicalAddresses((parsed.canonical_addresses ?? []) as CanonicalAddress[]);
        setRowResults((parsed.row_results ?? []) as RowResult[]);
        setDuplicateGroups((parsed.duplicate_groups ?? []) as DuplicateGroup[]);
        setDebugInfo((parsed.debug ?? null) as ParseDebugInfo | null);
        setLegacyMode(false);
      } else {
        setLegacyMode(true);
        const parsedHasBuckets = 'matched' in parsed || 'unmatched' in parsed;
        if (parsedHasBuckets) {
          const rawMatched = (parsed.matched || []) as unknown[];
          const rawUnmatched = (parsed.unmatched || []) as unknown[];
          setLegacyMatchedRows(normalizeRows(rawMatched));
          setLegacyUnmatchedRows(normalizeRows(rawUnmatched));
        } else {
          const rawItems = (parsed.items || []) as Record<string, unknown>[];
          const matchedItems = rawItems.filter((item) => item.status === 'Matched');
          const unmatchedItems = rawItems.filter((item) => item.status !== 'Matched');
          setLegacyMatchedRows(normalizeRows(matchedItems));
          setLegacyUnmatchedRows(normalizeRows(unmatchedItems));
        }
        setMetadata((parsed.metadata as Record<string, unknown>) || null);
      }
      const progressMeta = (parsed.metadata as Record<string, unknown> | undefined)?.progress;
      if (typeof progressMeta === 'number') {
        setProgressPercent(progressMeta);
      } else if (typeof progressMeta === 'object' && progressMeta !== null) {
        const percent = (progressMeta as { percent?: number }).percent;
        if (typeof percent === 'number') {
          setProgressPercent(percent);
        }
      }
    } catch (err) {
      setError((err as Error).message ?? 'Parsing failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleEditSave = (updated: ParsedRow) => {
    setLegacyMatchedRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    setLegacyUnmatchedRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    setEditingRow(null);
  };

  const updateRetryStatus = (rowId: string, needsRetry: boolean) => {
    setLegacyUnmatchedRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, needsRetry } : row)),
    );
  };

  const applyRetryResponse = (parsed: {
    matched?: unknown[];
    unmatched?: unknown[];
    items?: unknown[];
  }) => {
    const parsedHasBuckets = 'matched' in parsed || 'unmatched' in parsed;
    const items = (parsed.items ?? []) as Record<string, unknown>[];
    const newMatched = normalizeRows(
      (parsedHasBuckets
        ? parsed.matched ?? []
        : items.filter((item) => item.status === 'Matched')) as unknown[],
    );
    const newUnmatched = normalizeRows(
      (parsedHasBuckets
        ? parsed.unmatched ?? []
        : items.filter((item) => item.status !== 'Matched')) as unknown[],
    );
    if (newMatched.length) {
      setLegacyMatchedRows((prev) => dedupeRows([...prev, ...newMatched]));
    }
    if (newUnmatched.length) {
      setLegacyUnmatchedRows((prev) => dedupeRows([...prev, ...newUnmatched]));
    }
  };

  const handleRetryRow = async (row: ParsedRow) => {
    try {
      const response = await retryParseRow({
        row: row.original ?? row,
        location: { state: stateValue, county: countyValue, city: cityValue || undefined },
      });
      setRetryAvailable('available');
      updateRetryStatus(row.id, false);
      applyRetryResponse(response);
    } catch {
      setRetryAvailable('unavailable');
      updateRetryStatus(row.id, true);
    }
  };

  const handleRetryMarked = async () => {
    const marked = legacyUnmatchedRows.filter((row) => row.needsRetry);
    if (!marked.length) return;
    try {
      const response = await retryParseBatch({
        rows: marked.map((row) => row.original ?? row),
        location: { state: stateValue, county: countyValue, city: cityValue || undefined },
      });
      setRetryAvailable('available');
      setLegacyUnmatchedRows((prev) => prev.map((row) => ({ ...row, needsRetry: false })));
      applyRetryResponse(response);
    } catch {
      setRetryAvailable('unavailable');
    }
  };

  const toggleDuplicateGroup = (canonicalId: string) => {
    setExpandedDuplicateGroups((prev) => {
      const next = new Set(prev);
      if (next.has(canonicalId)) {
        next.delete(canonicalId);
      } else {
        next.add(canonicalId);
      }
      return next;
    });
  };

  const handleDownloadUnique = () => {
    downloadCsv('unique-valid-addresses.csv', buildCanonicalCsvRows(canonicalAddresses), {
      columns: [
        'canonical_id',
        'formatted_address',
        'street1',
        'street2',
        'city',
        'state',
        'zip',
        'place_id',
        'components_json',
      ],
    });
  };

  const handleDownloadProcessingReport = (rows: RowResult[], filename: string) => {
    downloadCsv(filename, buildProcessingReportRows(rows), {
      columns: [
        'source_row_index',
        'source_row_id',
        'status',
        'reason_code',
        'reason_detail',
        'detected_address',
        'formatted_address',
        'place_id',
        'canonical_id',
        'is_duplicate',
        'duplicate_of_source_row_id',
        'raw_row_json',
      ],
    });
  };

  const openProcessingReport = (filter: ProcessingReportFilter) => {
    setProcessingReportFilter(filter);
    setProcessingReportOpen(true);
  };

  const renderDuplicateRows = (group: DuplicateGroup) => {
    const rows = group.source_row_ids
      .map((id) => rowResultsById.get(id))
      .filter(Boolean) as RowResult[];
    if (!rows.length) {
      return (
        <div className="px-4 pb-4 text-xs text-slate-500 dark:text-slate-400">
          No row details available.
        </div>
      );
    }
    return (
      <div className="px-4 pb-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Row #</th>
                <th className="px-4 py-3">Detected Address</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Raw Preview</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => (
                <tr key={row.source_row_id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                    {row.source_row_index}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                    {row.detected_address || '--'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {buildReasonLabel(row)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {stringifyPreview(row.raw_row)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => copyJsonPayload(row)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Copy JSON
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <AppShell title="PropertyParse" subtitle="Address Parsing Workflow">
      <div className="grid w-full gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Location Context</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Select the required location fields to improve parsing accuracy.
                </p>
              </div>
              <LocationSelect
                label="State"
                value={stateValue}
                placeholder="Select state"
                required
                onChange={(value) => {
                  setStateValue(value);
                  setCountyValue('');
                  setCityValue('');
                }}
                onClear={() => {
                  setStateValue('');
                  setCountyValue('');
                  setCityValue('');
                }}
                options={states}
              />
              <LocationSelect
                label="County"
                value={countyValue}
                placeholder={stateValue ? 'Select county' : 'Select state first'}
                required
                disabled={!stateValue}
                onChange={(value) => {
                  setCountyValue(value);
                  setCityValue('');
                }}
                onClear={() => setCountyValue('')}
                options={counties}
              />
              <LocationSelect
                label="City (optional)"
                value={cityValue}
                placeholder={stateValue ? 'Select city' : 'Select state first'}
                disabled={!stateValue}
                onChange={(value) => setCityValue(value)}
                onClear={() => setCityValue('')}
                options={cities}
                helperText="Leave blank if the file spans multiple cities."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <FileUploadCard file={file} onChange={setFile} />
            <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Force re-verify (ignore cache)
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Uses more API calls. Only enable if you suspect cached results are stale.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForceRefresh((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition ${
                  forceRefresh
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                }`}
                role="switch"
                aria-checked={forceRefresh}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition dark:bg-slate-100 ${
                    forceRefresh ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={handleParse}
              disabled={!canParse || busy}
              className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                canParse && !busy
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              {busy ? 'Parsing...' : 'Parse Addresses'}
            </button>
            {error ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Parsing Status</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Track progress and review parsed results in real time.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {parseSummary ? (
                  <button
                    type="button"
                    onClick={() => openProcessingReport('all')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Processing Report
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleCopyDebugInfo}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Copy debug info
                </button>
                {legacyMode ? (
                  <button
                    type="button"
                    onClick={() => setShowRaw((prev) => !prev)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {showRaw ? 'Hide Source / Raw' : 'Show Source / Raw'}
                  </button>
                ) : null}
              </div>
            </div>
            {legacyMode ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                Legacy parse response detected. Upgrade the API to enable the full processing report
                experience.
              </div>
            ) : null}
            {parseSummary && rowAccountingMismatch ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>
                    Processing mismatch: received {parseSummary.rows_received} rows but only{' '}
                    {rowResults.length} were accounted for. Please retry. (This is a bug; contact
                    support.)
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyDebugInfo}
                    className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-400/40 dark:text-rose-200 dark:hover:bg-rose-500/20"
                  >
                    Copy Debug Info
                  </button>
                </div>
              </div>
            ) : null}
            {noAddressesDetected ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                No addresses were detected in this file. This usually means the file has unusual
                headers or split columns.
              </div>
            ) : null}
            {metadataWarnings.length ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-semibold text-amber-800 dark:text-amber-100">Warnings</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {metadataWarnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {cityValue && unmatchedCount > 0 ? (
              <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                Some addresses failed because Google returned a different city. Leave City blank if
                your file spans multiple cities.
              </div>
            ) : null}
            {parseSummary ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Rows Received
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {parseSummary.rows_received}
                  </p>
                  <AccountedRowsIndicator
                    rowsReceived={parseSummary.rows_received}
                    accountedRows={rowResults.length}
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Unique Valid Addresses
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {parseSummary.valid_unique}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Needs Review
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {parseSummary.unmatched}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Skipped</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {parseSummary.skipped}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Duplicates</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {parseSummary.duplicates}
                  </p>
                </div>
                {typeof parseSummary.out_of_scope === 'number' ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                      Out of Scope
                    </p>
                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                      {parseSummary.out_of_scope}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Rows Received</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {rowsReceived ?? '--'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Matched / Unmatched
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {dedupedMatched.length} / {dedupedUnmatched.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">API Calls Used</p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {apiCallsUsed ?? '--'}
                  </p>
                </div>
                {candidatesExtracted !== null ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                      Candidates Extracted
                    </p>
                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                      {candidatesExtracted}
                    </p>
                  </div>
                ) : null}
                {dedupedCount !== null ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                      Deduped Count
                    </p>
                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                      {dedupedCount}
                    </p>
                  </div>
                ) : null}
                {cacheHits !== null ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Cache Hits</p>
                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                      {cacheHits}
                    </p>
                  </div>
                ) : null}
                {googleCallsUsed !== null ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                      Google Calls Used
                    </p>
                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                      {googleCallsUsed}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
            {parseSummary ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Unique valid addresses are deduped. Use Processing Report to see every input row’s
                outcome.
              </p>
            ) : null}
            {verificationSourcesSummary ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Sources: {verificationSourcesSummary}
              </p>
            ) : null}
            {parseSummary && errorRows.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>
                    {errorRows.length} rows encountered errors. Review them in the Processing Report.
                  </p>
                  <button
                    type="button"
                    onClick={() => openProcessingReport('errors')}
                    className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-200 dark:hover:bg-amber-500/20"
                  >
                    View Errors
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-6">
              <ProgressIndicator
                steps={PROGRESS_STEPS}
                currentStep={progressStep}
                percent={progressPercent}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {parseSummary ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('valid')}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        activeTab === 'valid'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      Valid (Unique) ({parseSummary.valid_unique})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('needs_review')}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        activeTab === 'needs_review'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      Needs Review ({parseSummary.unmatched})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('skipped')}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        activeTab === 'skipped'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      Skipped ({parseSummary.skipped})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('duplicates')}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        activeTab === 'duplicates'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      Duplicates ({parseSummary.duplicates})
                    </button>
                    {typeof parseSummary.out_of_scope === 'number' ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('out_of_scope')}
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${
                          activeTab === 'out_of_scope'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        Out of Scope ({parseSummary.out_of_scope})
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadUnique}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Download Unique Valid CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadProcessingReport(rowResults, 'processing-report.csv')}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Download Full Processing Report CSV
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadProcessingReport(needsReviewRows, 'needs-review.csv')
                      }
                      disabled={needsReviewRows.length === 0}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:border-slate-700 dark:disabled:text-slate-500"
                    >
                      Download Needs Review CSV
                    </button>
                  </div>
                </div>
                <div className="mt-6">
                  {activeTab === 'valid' ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <div className="overflow-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Full Address</th>
                              <th className="px-4 py-3">Street Address</th>
                              <th className="px-4 py-3">Address 2</th>
                              <th className="px-4 py-3">City</th>
                              <th className="px-4 py-3">State</th>
                              <th className="px-4 py-3">Zip</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {canonicalAddresses.length === 0 ? (
                              <tr>
                                <td
                                  className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                  colSpan={6}
                                >
                                  No unique valid addresses yet.
                                </td>
                              </tr>
                            ) : (
                              canonicalAddresses.map((row) => (
                                <tr key={row.canonical_id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                                    {row.formatted_address}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.street1 ?? '--'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.street2 ?? '--'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.city ?? '--'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.state ?? '--'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.zip ?? '--'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {activeTab === 'needs_review' ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <div className="overflow-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Source Row #</th>
                              <th className="px-4 py-3">Detected Address</th>
                              <th className="px-4 py-3">Reason</th>
                              <th className="px-4 py-3">Raw Preview</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {needsReviewRows.length === 0 ? (
                              <tr>
                                <td
                                  className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                  colSpan={5}
                                >
                                  No rows need review.
                                </td>
                              </tr>
                            ) : (
                              needsReviewRows.map((row) => (
                                <tr key={row.source_row_id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.source_row_index}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.detected_address || '--'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                    {buildReasonLabel(row)}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                    {stringifyPreview(row.raw_row)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => copyJsonPayload(row)}
                                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Copy row JSON
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {activeTab === 'skipped' ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <div className="overflow-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Source Row #</th>
                              <th className="px-4 py-3">Detected Address</th>
                              <th className="px-4 py-3">Reason</th>
                              <th className="px-4 py-3">Raw Preview</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {skippedRows.length === 0 ? (
                              <tr>
                                <td
                                  className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                  colSpan={5}
                                >
                                  No rows were skipped.
                                </td>
                              </tr>
                            ) : (
                              skippedRows.map((row) => (
                                <tr key={row.source_row_id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.source_row_index}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.detected_address || '--'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                    {buildReasonLabel(row)}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                    {stringifyPreview(row.raw_row)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => copyJsonPayload(row)}
                                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Copy row JSON
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {activeTab === 'duplicates' ? (
                    <div className="space-y-4">
                      {duplicateGroups.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          No duplicate groups detected.
                        </div>
                      ) : (
                        duplicateGroups.map((group) => {
                          const isExpanded = expandedDuplicateGroups.has(group.canonical_id);
                          return (
                            <div
                              key={group.canonical_id}
                              className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {group.canonical_formatted_address}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Canonical ID: {group.canonical_id}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                    {group.source_row_ids.length} duplicates
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggleDuplicateGroup(group.canonical_id)}
                                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    {isExpanded ? 'Hide Rows' : 'Show Rows'}
                                  </button>
                                </div>
                              </div>
                              {isExpanded ? renderDuplicateRows(group) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                  {activeTab === 'out_of_scope' ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <div className="overflow-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Source Row #</th>
                              <th className="px-4 py-3">Detected Address</th>
                              <th className="px-4 py-3">Reason</th>
                              <th className="px-4 py-3">Raw Preview</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {outOfScopeRows.length === 0 ? (
                              <tr>
                                <td
                                  className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                  colSpan={5}
                                >
                                  No out-of-scope rows.
                                </td>
                              </tr>
                            ) : (
                              outOfScopeRows.map((row) => (
                                <tr key={row.source_row_id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.source_row_index}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                    {row.detected_address || '--'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                    {buildReasonLabel(row)}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                    {stringifyPreview(row.raw_row)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => copyJsonPayload(row)}
                                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Copy row JSON
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setLegacyTab('matched')}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        legacyTab === 'matched'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      Matched ({dedupedMatched.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLegacyTab('unmatched')}
                      className={`rounded-full px-4 py-2 text-xs font-semibold ${
                        legacyTab === 'unmatched'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      Unmatched ({dedupedUnmatched.length})
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {legacyTab === 'unmatched' ? (
                      <button
                        type="button"
                        onClick={handleRetryMarked}
                        disabled={!dedupedUnmatched.some((row) => row.needsRetry)}
                        className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 transition disabled:border-slate-200 disabled:text-slate-400 dark:border-amber-400/40 dark:text-amber-200 dark:disabled:border-slate-700 dark:disabled:text-slate-500"
                      >
                        Retry marked
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(
                          legacyTab === 'matched'
                            ? 'matched-addresses.csv'
                            : 'unmatched-addresses.csv',
                          (legacyTab === 'matched' ? dedupedMatched : dedupedUnmatched).map((row) => ({
                            full_address: row.fullAddress,
                            street_address: row.streetAddress,
                            address2: row.address2,
                            city: row.city,
                            state: row.state,
                            zip_code: row.zipCode,
                            source_raw: row.sourceRaw,
                          })),
                        )
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Download {legacyTab === 'matched' ? 'Matched' : 'Unmatched'} CSV
                    </button>
                  </div>
                </div>
                <div className="mt-6">
                  {legacyTab === 'matched' ? (
                    <ResultsTable
                      rows={dedupedMatched}
                      variant="matched"
                      showRaw={showRaw}
                      onEdit={(row) => setEditingRow(row)}
                    />
                  ) : (
                    <ResultsTable
                      rows={dedupedUnmatched}
                      variant="unmatched"
                      showRaw={showRaw}
                      onEdit={(row) => setEditingRow(row)}
                      onRetry={handleRetryRow}
                    />
                  )}
                  {retryAvailable === 'unavailable' ? (
                    <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">
                      Retry endpoint unavailable. Marked rows can be re-sent later using the Retry
                      marked button.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <EditRowModal
        open={Boolean(editingRow)}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={handleEditSave}
      />

      <ProcessingReportModal
        open={processingReportOpen}
        rows={rowResults}
        initialFilter={processingReportFilter}
        onClose={() => setProcessingReportOpen(false)}
      />
    </AppShell>
  );
}
