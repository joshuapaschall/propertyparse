import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import AppShell from '../components/AppShell';
import FileUploadCard from '../components/FileUploadCard';
import LocationSelect from '../components/LocationSelect';
import ProgressIndicator from '../components/ProgressIndicator';
import ResultsTable from '../components/ResultsTable';
import EditRowModal, { ParsedRow } from '../components/EditRowModal';
import { parseFile, retryParseBatch, retryParseRow, uploadFile } from '../lib/api';
import { listCitiesByState, listCounties, listStates50 } from '../lib/locations';

const PROGRESS_STEPS = ['Uploading', 'Extracting', 'Parsing', 'Validating', 'Finalizing'];

const EXPORT_HEADERS = [
  'Full Address',
  'Street Address',
  'Address 2',
  'City',
  'State',
  'Zip Code',
  'Source / Raw',
];

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

const formatSourceRaw = (row: ParsedRow, includeReason: boolean) => {
  if (includeReason && row.unmatchedReason) {
    return `${row.sourceRaw} (reason: ${row.unmatchedReason})`.trim();
  }
  return row.sourceRaw;
};

const buildCsv = (rows: ParsedRow[], includeReason: boolean) =>
  Papa.unparse(
    rows.map((row) => ({
      'Full Address': row.fullAddress,
      'Street Address': row.streetAddress,
      'Address 2': row.address2,
      City: row.city,
      State: row.state,
      'Zip Code': row.zipCode,
      'Source / Raw': formatSourceRaw(row, includeReason),
    })),
    { columns: EXPORT_HEADERS },
  );

export default function ParsePage() {
  const [stateValue, setStateValue] = useState('');
  const [countyValue, setCountyValue] = useState('');
  const [cityValue, setCityValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rowsReceived, setRowsReceived] = useState<number | null>(null);
  const [matchedRows, setMatchedRows] = useState<ParsedRow[]>([]);
  const [unmatchedRows, setUnmatchedRows] = useState<ParsedRow[]>([]);
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatched'>('matched');
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
  const didLogLocations = useRef(false);

  const canParse = Boolean(file && stateValue && countyValue);

  const dedupedMatched = useMemo(() => dedupeRows(matchedRows), [matchedRows]);
  const dedupedUnmatched = useMemo(() => dedupeRows(unmatchedRows), [unmatchedRows]);
  const states = useMemo(() => listStates50(), []);
  const counties = useMemo(
    () => (stateValue ? listCounties(stateValue) : []),
    [stateValue],
  );
  const cities = useMemo(
    () => (stateValue ? listCitiesByState(stateValue) : []),
    [stateValue],
  );

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
    return (
      (metadata.candidates_extracted as number) ||
      (metadata.candidatesExtracted as number) ||
      null
    );
  }, [metadata]);

  const dedupedCount = useMemo(() => {
    if (!metadata) return null;
    return (
      (metadata.deduped_count as number) ||
      (metadata.dedupedCount as number) ||
      null
    );
  }, [metadata]);

  const cacheHits = useMemo(() => {
    if (!metadata) return null;
    return (
      (metadata.cache_hits as number) ||
      (metadata.cacheHits as number) ||
      null
    );
  }, [metadata]);

  const googleCallsUsed = useMemo(() => {
    if (!metadata) return null;
    return (
      (metadata.google_calls_used as number) ||
      (metadata.googleCallsUsed as number) ||
      null
    );
  }, [metadata]);

  const verificationSourceCounts = useMemo(() => {
    if (!metadata) return null;
    return (metadata.verification_source_counts as Record<string, number>) || null;
  }, [metadata]);

  const verificationSourcesSummary = useMemo(() => {
    if (!verificationSourceCounts) return null;
    const preferredOrder = ['cache', 'geocoding', 'places', 'parser'];
    const entries = Object.entries(verificationSourceCounts).filter(
      ([, value]) => typeof value === 'number',
    );
    if (!entries.length) return null;
    const orderedEntries = [
      ...preferredOrder
        .map((key) => [key, verificationSourceCounts[key]] as const)
        .filter(([, value]) => typeof value === 'number'),
      ...entries.filter(([key]) => !preferredOrder.includes(key)),
    ];
    return orderedEntries
      .map(([key, value]) => `${key} ${value}`)
      .join(' • ');
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

  const handleCopyDebugInfo = () => {
    const debugInfo = [
      `State: ${stateValue || '--'}`,
      `County: ${countyValue || '--'}`,
      `City: ${cityValue || '--'}`,
      `File: ${file?.name || '--'}`,
      `Rows received: ${rowsReceived ?? '--'}`,
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
    setMatchedRows([]);
    setUnmatchedRows([]);
    setMetadata(null);
    setProgressStep(0);
    setProgressPercent(null);
    try {
      const upload = await uploadFile(file);
      setRowsReceived(upload.rowsReceived ?? null);
      setProgressStep(1);
      setProgressStep(2);
      const parsed = await parseFile(upload.fileId, {
        state: stateValue,
        county: countyValue,
        city: cityValue || undefined,
        force_refresh: forceRefresh,
      });
      setProgressStep(3);
      setProgressStep(4);
      const parsedHasBuckets = 'matched' in parsed || 'unmatched' in parsed;
      if (parsedHasBuckets) {
        const rawMatched = (parsed.matched || []) as unknown[];
        const rawUnmatched = (parsed.unmatched || []) as unknown[];
        setMatchedRows(normalizeRows(rawMatched));
        setUnmatchedRows(normalizeRows(rawUnmatched));
      } else {
        const rawItems = (parsed.items || []) as Record<string, unknown>[];
        const matchedItems = rawItems.filter((item) => item.status === 'Matched');
        const unmatchedItems = rawItems.filter((item) => item.status !== 'Matched');
        setMatchedRows(normalizeRows(matchedItems));
        setUnmatchedRows(normalizeRows(unmatchedItems));
      }
      setMetadata((parsed.metadata as Record<string, unknown>) || null);
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
    setMatchedRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    setUnmatchedRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    setEditingRow(null);
  };

  const updateRetryStatus = (rowId: string, needsRetry: boolean) => {
    setUnmatchedRows((prev) =>
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
      setMatchedRows((prev) => dedupeRows([...prev, ...newMatched]));
    }
    if (newUnmatched.length) {
      setUnmatchedRows((prev) => dedupeRows([...prev, ...newUnmatched]));
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
    const marked = unmatchedRows.filter((row) => row.needsRetry);
    if (!marked.length) return;
    try {
      const response = await retryParseBatch({
        rows: marked.map((row) => row.original ?? row),
        location: { state: stateValue, county: countyValue, city: cityValue || undefined },
      });
      setRetryAvailable('available');
      setUnmatchedRows((prev) => prev.map((row) => ({ ...row, needsRetry: false })));
      applyRetryResponse(response);
    } catch {
      setRetryAvailable('unavailable');
    }
  };

  const downloadCsv = (rows: ParsedRow[], filename: string, includeReason: boolean) => {
    const csv = buildCsv(rows, includeReason);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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
                <button
                  type="button"
                  onClick={handleCopyDebugInfo}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Copy debug info
                </button>
                <button
                  type="button"
                  onClick={() => setShowRaw((prev) => !prev)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {showRaw ? 'Hide Source / Raw' : 'Show Source / Raw'}
                </button>
              </div>
            </div>
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
            {verificationSourcesSummary ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Sources: {verificationSourcesSummary}
              </p>
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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('matched')}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    activeTab === 'matched'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Matched ({dedupedMatched.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('unmatched')}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    activeTab === 'unmatched'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Unmatched ({dedupedUnmatched.length})
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {activeTab === 'unmatched' ? (
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
                      activeTab === 'matched' ? dedupedMatched : dedupedUnmatched,
                      activeTab === 'matched' ? 'matched-addresses.csv' : 'unmatched-addresses.csv',
                      activeTab === 'unmatched',
                    )
                  }
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Download {activeTab === 'matched' ? 'Matched' : 'Unmatched'} CSV
                </button>
              </div>
            </div>
            <div className="mt-6">
              {activeTab === 'matched' ? (
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
          </div>
        </div>
      </div>

      <EditRowModal
        open={Boolean(editingRow)}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={handleEditSave}
      />
    </AppShell>
  );
}
