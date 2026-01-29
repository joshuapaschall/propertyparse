import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import AppShell from '../components/AppShell';
import LocationSearchField from '../components/LocationSearchField';
import FileUploadCard from '../components/FileUploadCard';
import ProgressIndicator from '../components/ProgressIndicator';
import ResultsTable from '../components/ResultsTable';
import EditRowModal, { ParsedRow } from '../components/EditRowModal';
import {
  parseFile,
  retryParseBatch,
  retryParseRow,
  searchCities,
  searchCounties,
  searchStates,
  uploadFile,
} from '../lib/api';

const PROGRESS_STEPS = ['Uploading', 'Extracting', 'Parsing', 'Validating', 'Finalizing'];

const EXPORT_HEADERS = [
  'Full Address',
  'Street Address',
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
  const fullAddress =
    (row.full_address as string) ||
    (row.fullAddress as string) ||
    (row.address_full as string) ||
    (row.address as string) ||
    (row.address_raw as string) ||
    '';
  const streetAddress =
    (row.street_address as string) ||
    (row.streetAddress as string) ||
    (row.address_line1 as string) ||
    (row.street as string) ||
    '';
  const city = (row.city as string) || (row.city_raw as string) || '';
  const state = (row.state as string) || (row.state_raw as string) || '';
  const zipCode =
    (row.zip as string) ||
    (row.zip_code as string) ||
    (row.zipCode as string) ||
    (row.zip_raw as string) ||
    '';
  const sourceRaw =
    (row.source_raw as string) ||
    (row.raw as string) ||
    (row.source as string) ||
    (row.address_raw as string) ||
    stringifyValue(row);

  return {
    id: createId(row, index),
    fullAddress,
    streetAddress,
    city,
    state,
    zipCode,
    sourceRaw,
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

const buildCsv = (rows: ParsedRow[]) =>
  Papa.unparse(
    rows.map((row) => ({
      'Full Address': row.fullAddress,
      'Street Address': row.streetAddress,
      City: row.city,
      State: row.state,
      'Zip Code': row.zipCode,
      'Source / Raw': row.sourceRaw,
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

  const canParse = Boolean(file && stateValue && countyValue);

  const dedupedMatched = useMemo(() => dedupeRows(matchedRows), [matchedRows]);
  const dedupedUnmatched = useMemo(() => dedupeRows(unmatchedRows), [unmatchedRows]);

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
      });
      setProgressStep(3);
      setProgressStep(4);
      const rawMatched = (parsed.matched || parsed.items || []) as unknown[];
      const rawUnmatched = (parsed.unmatched || []) as unknown[];
      setMatchedRows(normalizeRows(rawMatched));
      setUnmatchedRows(normalizeRows(rawUnmatched));
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

  const applyRetryResponse = (parsed: { matched?: unknown[]; unmatched?: unknown[]; items?: unknown[] }) => {
    const newMatched = normalizeRows((parsed.matched ?? parsed.items ?? []) as unknown[]);
    const newUnmatched = normalizeRows((parsed.unmatched ?? []) as unknown[]);
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

  const downloadCsv = (rows: ParsedRow[], filename: string) => {
    const csv = buildCsv(rows);
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
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Location Context</h2>
                <p className="text-sm text-slate-500">
                  Select the required location fields to improve parsing accuracy.
                </p>
              </div>
              <LocationSearchField
                label="State"
                value={stateValue}
                placeholder="Search state"
                required
                onChange={(value) => {
                  setStateValue(value);
                  setCountyValue('');
                  setCityValue('');
                }}
                onSearch={(query, signal) => searchStates(query, signal)}
              />
              <LocationSearchField
                label="County"
                value={countyValue}
                placeholder={stateValue ? 'Search county' : 'Select state first'}
                required
                disabled={!stateValue}
                onChange={(value) => {
                  setCountyValue(value);
                  setCityValue('');
                }}
                onSearch={(query, signal) => searchCounties(stateValue, query, signal)}
              />
              <LocationSearchField
                label="City (optional)"
                value={cityValue}
                placeholder={stateValue ? 'Search city' : 'Select state first'}
                disabled={!stateValue}
                onChange={(value) => setCityValue(value)}
                onSearch={(query, signal) => searchCities(stateValue, countyValue, query, signal)}
                helperText="Leave blank if the file spans multiple cities."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <FileUploadCard file={file} onChange={setFile} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <button
              type="button"
              onClick={handleParse}
              disabled={!canParse || busy}
              className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                canParse && !busy
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {busy ? 'Parsing...' : 'Parse Addresses'}
            </button>
            {error ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Parsing Status</h2>
                <p className="text-sm text-slate-500">
                  Track progress and review parsed results in real time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRaw((prev) => !prev)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {showRaw ? 'Hide Source / Raw' : 'Show Source / Raw'}
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase text-slate-500">Rows Received</p>
                <p className="text-lg font-semibold text-slate-800">
                  {rowsReceived ?? '--'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase text-slate-500">Matched / Unmatched</p>
                <p className="text-lg font-semibold text-slate-800">
                  {dedupedMatched.length} / {dedupedUnmatched.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase text-slate-500">API Calls Used</p>
                <p className="text-lg font-semibold text-slate-800">
                  {apiCallsUsed ?? '--'}
                </p>
              </div>
            </div>
            <div className="mt-6">
              <ProgressIndicator
                steps={PROGRESS_STEPS}
                currentStep={progressStep}
                percent={progressPercent}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('matched')}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    activeTab === 'matched'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
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
                      : 'bg-slate-100 text-slate-600'
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
                    className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 disabled:border-slate-200 disabled:text-slate-400"
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
                    )
                  }
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
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
                <p className="mt-3 text-xs text-amber-600">
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
