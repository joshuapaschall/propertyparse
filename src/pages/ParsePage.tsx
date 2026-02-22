import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import AccountedRowsIndicator from '../components/AccountedRowsIndicator';
import FileUploadCard from '../components/FileUploadCard';
import AsyncLocationSelect from '../components/AsyncLocationSelect';
import ProcessingReportModal, {
  ProcessingReportFilter,
} from '../components/ProcessingReportModal';
import ProgressIndicator from '../components/ProgressIndicator';
import ResultsTable from '../components/ResultsTable';
import TablePagination from '../components/TablePagination';
import EditRowModal, { ParsedRow } from '../components/EditRowModal';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { downloadCsv } from '../lib/csv';
import {
  getReasonMetadata,
  isErrorRow,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSkippedRow,
  isValidRow,
  stringifyPreview,
} from '../lib/parseUtils';
import { canStartParse, hasValidLocation } from '../lib/parseValidation';
import {
  downloadJobExport,
  getJobDetail,
  getJobRows,
  getJobResults,
  getJobWithStatus,
  JobExportType,
  JOB_EXPORT_TYPES,
  JobRecord,
  parseFile,
  parseFileAsync,
  retryJobRow,
  retryParseBatch,
  retryParseRow,
  uploadFile,
} from '../lib/api';
import { searchCities, searchCounties, searchStates } from '../lib/locationApi';
import type {
  CanonicalAddress,
  DuplicateGroup,
  ParseDebugInfo,
  ParseSummary,
  RowResult,
} from '../types/parse';

const PROGRESS_STEPS = ['Uploading', 'Extracting', 'Parsing', 'Validating', 'Finalizing'];
const ASYNC_PARSE_FILE_SIZE_THRESHOLD = 5 * 1024 * 1024;
const ASYNC_PARSE_MIME_PREFIXES = ['application/pdf', 'image/'];
const ASYNC_PARSE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'tif', 'bmp', 'heic', 'heif'];

const ResultsTableSkeleton = () => (
  <Card className="overflow-hidden p-4">
    <div className="space-y-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 rounded-lg bg-slate-100 dark:bg-slate-900" />
      <Skeleton className="h-10 rounded-lg bg-slate-100 dark:bg-slate-900" />
      <Skeleton className="h-10 rounded-lg bg-slate-100 dark:bg-slate-900" />
      <Skeleton className="h-10 rounded-lg bg-slate-100 dark:bg-slate-900" />
    </div>
  </Card>
);
const LAST_JOB_STORAGE_KEY = 'pp-parse-last-job';
const LAST_JOB_STORAGE_VERSION = 1;

type CanonicalAddressComponents = {
  street_address?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type NormalizedCanonicalAddress = CanonicalAddress & {
  fullAddress: string;
};

type PersistedLastJobState = {
  version: number;
  jobId: string;
  stateValue: string;
  countyValue: string;
  cityValue: string;
  campaignName: string;
};

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

const normalizeCanonicalAddress = (row: CanonicalAddress): NormalizedCanonicalAddress => {
  const components = row.components as CanonicalAddressComponents | undefined;
  const fullAddress =
    (row as { full_address?: string }).full_address || row.formatted_address || '';
  const street1 = row.street1 || components?.street_address || '';
  const street2 = row.street2 || components?.address2 || '';
  const city = row.city || components?.city || '';
  const state = row.state || components?.state || '';
  const zip = row.zip || components?.zip || '';

  return {
    ...row,
    formatted_address: row.formatted_address || fullAddress,
    fullAddress,
    street1,
    street2,
    city,
    state,
    zip,
  };
};

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

const buildCanonicalCsvRows = (rows: NormalizedCanonicalAddress[]) =>
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

const normalizeNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const pickValue = (record: JobRecord, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
};

const pickString = (record: JobRecord, keys: string[]) => {
  const value = pickValue(record, keys);
  return typeof value === 'string' ? value : value != null ? String(value) : null;
};

const pickNumber = (record: JobRecord, keys: string[]) => {
  const value = pickValue(record, keys);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const buildParseSummaryFromJob = (record: JobRecord | null) => {
  if (!record) return null;
  const rowsReceived = pickNumber(record, [
    'rows_received',
    'rowsReceived',
    'total_rows',
    'rows',
    'rowCount',
  ]);
  const validTotal = pickNumber(record, ['valid_total', 'validTotal', 'matched', 'matched_count', 'matchedCount']);
  const validUnique = pickNumber(record, [
    'valid_unique',
    'validUnique',
    'deduped_count',
    'dedupedCount',
    'unique_valid',
  ]);
  const unmatched = pickNumber(record, ['unmatched', 'unmatched_count', 'unmatchedCount']);
  const skipped = pickNumber(record, ['skipped', 'skipped_count', 'skippedCount']) ?? 0;
  const duplicates = pickNumber(record, ['duplicates', 'duplicates_count', 'duplicate_count']) ?? 0;
  const outOfScope = pickNumber(record, ['out_of_scope', 'outOfScope']);
  if (
    typeof rowsReceived !== 'number' ||
    typeof validTotal !== 'number' ||
    typeof validUnique !== 'number' ||
    typeof unmatched !== 'number'
  ) {
    return null;
  }
  return {
    rows_received: rowsReceived,
    valid_total: validTotal,
    valid_unique: validUnique,
    unmatched,
    skipped,
    duplicates,
    out_of_scope: outOfScope ?? undefined,
  };
};

const getRowIdValue = (row: JobRecord, index: number) => {
  const candidate =
    row.source_row_id ??
    row.sourceRowId ??
    row.row_id ??
    row.rowId ??
    row.id ??
    row.uuid ??
    row.record_id ??
    row.recordId ??
    row.recordID;
  if (candidate === null || candidate === undefined) return `row-${index}`;
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : `row-${index}`;
};

const toRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { value };
    }
  }
  return undefined;
};

const pickStringValue = (row: JobRecord, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
};

const isRowResultDtoShape = (row: JobRecord) =>
  (typeof row.source_row_id === 'string' || typeof row.sourceRowId === 'string') &&
  (typeof row.source_row_index === 'number' || typeof row.sourceRowIndex === 'number');

const normalizeJobRowResult = (row: JobRecord, index: number): RowResult => {
  if (isRowResultDtoShape(row)) {
    const rawRow =
      toRecord(row.raw_row) ??
      toRecord(row.rawRow) ??
      toRecord(row.source) ??
      toRecord(row.source_raw) ??
      toRecord(row.sourceRaw);
    return {
      source_row_index:
        normalizeNumber(row.source_row_index ?? row.sourceRowIndex) ?? index,
      source_row_id: getRowIdValue(row, index),
      raw_row: rawRow,
      detected_address: pickStringValue(row, [
        'detected_address',
        'detectedAddress',
        'address_raw',
        'addressRaw',
      ]),
      status: pickStringValue(row, ['status']) ?? 'Unknown',
      reason_code: pickStringValue(row, ['reason_code', 'reasonCode']),
      reason_detail: pickStringValue(row, ['reason_detail', 'reasonDetail']),
      scope_debug: row.scope_debug ?? row.scopeDebug ?? undefined,
      formatted_address: pickStringValue(row, [
        'formatted_address',
        'formattedAddress',
        'matched_address',
        'matchedAddress',
      ]),
      place_id: pickStringValue(row, ['place_id', 'placeId']),
      components: row.components ?? undefined,
      canonical_id: pickStringValue(row, ['canonical_id', 'canonicalId']),
      is_duplicate:
        typeof row.is_duplicate === 'boolean'
          ? row.is_duplicate
          : typeof row.isDuplicate === 'boolean'
            ? row.isDuplicate
            : undefined,
      duplicate_of_source_row_id: pickStringValue(row, [
        'duplicate_of_source_row_id',
        'duplicateOfSourceRowId',
      ]),
    };
  }

  const rowIndexValue =
    row.source_row_index ??
    row.sourceRowIndex ??
    row.row_index ??
    row.rowIndex ??
    row.index ??
    row.row_number ??
    row.rowNumber;
  const rowIndex = normalizeNumber(rowIndexValue) ?? index;
  const status =
    (row.status as string) ||
    (row.match_status as string) ||
    (row.matchStatus as string) ||
    (row.result_status as string) ||
    'Unknown';
  return {
    source_row_index: rowIndex,
    source_row_id: getRowIdValue(row, index),
    raw_row:
      toRecord(row.raw_row) ||
      toRecord(row.rawRow) ||
      toRecord(row.raw) ||
      toRecord(row.source) ||
      toRecord(row.source_raw) ||
      toRecord(row.sourceRaw) ||
      undefined,
    detected_address:
      pickStringValue(row, [
        'detected_address',
        'detectedAddress',
        'address_raw',
        'addressRaw',
        'address',
        'full_address',
        'fullAddress',
      ]) ||
      undefined,
    status,
    reason_code: pickStringValue(row, ['reason_code', 'reasonCode']) || undefined,
    reason_detail: pickStringValue(row, ['reason_detail', 'reasonDetail']) || undefined,
    scope_debug: row.scope_debug ?? row.scopeDebug ?? undefined,
    formatted_address:
      pickStringValue(row, [
        'formatted_address',
        'formattedAddress',
        'matched_address',
        'matchedAddress',
      ]) ||
      undefined,
    place_id: pickStringValue(row, ['place_id', 'placeId']) || undefined,
    components: (row.components as unknown) || undefined,
    canonical_id: pickStringValue(row, ['canonical_id', 'canonicalId']) || undefined,
    is_duplicate:
      typeof row.is_duplicate === 'boolean'
        ? row.is_duplicate
        : typeof row.isDuplicate === 'boolean'
          ? row.isDuplicate
          : undefined,
    duplicate_of_source_row_id:
      pickStringValue(row, ['duplicate_of_source_row_id', 'duplicateOfSourceRowId']) ||
      undefined,
  };
};

const buildDuplicateGroupsFromRows = (rows: RowResult[]) => {
  const groups = new Map<string, DuplicateGroup>();
  rows.forEach((row) => {
    if (!row.canonical_id) return;
    const key = row.canonical_id;
    const existing = groups.get(key);
    if (existing) {
      existing.source_row_ids.push(row.source_row_id);
      existing.duplicate_rows_count = existing.source_row_ids.length;
    } else {
      groups.set(key, {
        canonical_id: key,
        canonical_formatted_address: row.formatted_address ?? row.detected_address ?? '',
        source_row_ids: [row.source_row_id],
        duplicate_rows_count: 1,
      });
    }
  });
  return Array.from(groups.values()).filter((group) => group.source_row_ids.length > 1);
};

const buildCanonicalAddressesFromRows = (rows: RowResult[]) => {
  const canonicalMap = new Map<string, CanonicalAddress>();
  rows.forEach((row) => {
    if (!row.canonical_id || canonicalMap.has(row.canonical_id)) return;
    canonicalMap.set(row.canonical_id, {
      canonical_id: row.canonical_id,
      formatted_address: row.formatted_address ?? row.detected_address ?? '',
      place_id: row.place_id,
      components: row.components,
    });
  });
  return Array.from(canonicalMap.values()).map(normalizeCanonicalAddress);
};

const getRowIdentifier = (row: Record<string, unknown>) => {
  const candidate = row.id ?? row.source_row_id ?? row.row_id;
  return typeof candidate === 'string' ? candidate : null;
};

const pickNumberFromRecord = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = normalizeNumber(record[key]);
    if (typeof value === 'number') return value;
  }
  return null;
};

const normalizePhase = (value: unknown) => {
  if (typeof value === 'string') return value.toUpperCase();
  return null;
};

const shouldUseAsyncParse = (selectedFile: File | null) => {
  if (!selectedFile) return false;
  if (selectedFile.size > ASYNC_PARSE_FILE_SIZE_THRESHOLD) return true;
  const mimeType = selectedFile.type.toLowerCase();
  if (ASYNC_PARSE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }
  const extension = selectedFile.name.split('.').pop()?.toLowerCase() ?? '';
  return ASYNC_PARSE_EXTENSIONS.includes(extension);
};

const mapPhaseToStep = (phase: string | null) => {
  switch (phase) {
    case 'UPLOADING':
      return 0;
    case 'EXTRACTING':
      return 1;
    case 'PARSING':
      return 2;
    case 'VERIFYING':
    case 'VALIDATING':
      return 3;
    case 'DONE':
      return 4;
    default:
      return 0;
  }
};

const computeProgressPercent = (phase: string | null, done: number | null, total: number | null) => {
  if (phase === 'DONE') return 100;
  if (phase === 'EXTRACTING') {
    if (typeof done === 'number' && typeof total === 'number' && total > 0) {
      return Math.min(10, Math.max(0, (done / total) * 10));
    }
    return 5;
  }
  if (phase === 'VERIFYING' || phase === 'VALIDATING' || phase === 'PARSING') {
    if (typeof done === 'number' && typeof total === 'number' && total > 0) {
      return 10 + Math.min(85, Math.max(0, (done / total) * 85));
    }
    return 10;
  }
  if (phase === 'UPLOADING') {
    return 0;
  }
  return null;
};

const formatEta = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
};

const readLastJobState = () => {
  try {
    const stored = window.localStorage.getItem(LAST_JOB_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PersistedLastJobState;
    if (!parsed || parsed.version !== LAST_JOB_STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeLastJobState = (state: PersistedLastJobState) => {
  try {
    window.localStorage.setItem(LAST_JOB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
};

const clearLastJobState = () => {
  try {
    window.localStorage.removeItem(LAST_JOB_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

export default function ParsePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [stateValue, setStateValue] = useState('');
  const [countyValue, setCountyValue] = useState('');
  const [cityValue, setCityValue] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [parseTimestamp, setParseTimestamp] = useState<string | null>(null);
  const [rowsReceived, setRowsReceived] = useState<number | null>(null);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);
  const [canonicalAddresses, setCanonicalAddresses] = useState<NormalizedCanonicalAddress[]>([]);
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
  const [showDebugMode, setShowDebugMode] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(10);
  const [progressStep, setProgressStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [rehydrating, setRehydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollErrorCount, setPollErrorCount] = useState(0);
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
  const [reviewRow, setReviewRow] = useState<RowResult | null>(null);
  const [reviewAddress, setReviewAddress] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewAutoFocus, setReviewAutoFocus] = useState(false);
  const [activeDownloadType, setActiveDownloadType] = useState<JobExportType | null>(null);
  const [downloadSuccessLabel, setDownloadSuccessLabel] = useState<string | null>(null);
  const [progressInfo, setProgressInfo] = useState<{
    phase: string | null;
    done: number | null;
    total: number | null;
    cacheHits: number | null;
    googleCallsUsed: number | null;
    eta: string | null;
  }>({
    phase: null,
    done: null,
    total: null,
    cacheHits: null,
    googleCallsUsed: null,
    eta: null,
  });
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<number | null>(null);
  const progressSamplesRef = useRef<{ timestamp: number; done: number }[]>([]);
  const reviewInputRef = useRef<HTMLInputElement | null>(null);
  const downloadSuccessTimerRef = useRef<number | null>(null);

  const hasFileSelected = Boolean(file);
  const hasLocation = hasValidLocation(stateValue, countyValue, cityValue);
  const canRerunSameUpload = Boolean(fileId) && hasLocation && !busy && !rehydrating;
  const showLocationValidation = Boolean(stateValue && !countyValue && !cityValue);
  const canParse = canStartParse(file, stateValue, countyValue, cityValue) && !busy;
  const parseCtaLabel = useMemo(() => {
    if (busy) return 'Processing…';
    if (!hasFileSelected) return 'Select a file to process';
    return 'Process File';
  }, [busy, hasFileSelected]);

  const dedupedMatched = useMemo(() => dedupeRows(legacyMatchedRows), [legacyMatchedRows]);
  const dedupedUnmatched = useMemo(() => dedupeRows(legacyUnmatchedRows), [legacyUnmatchedRows]);
  const loadStateOptions = useCallback(async (inputValue: string) => searchStates(inputValue), []);

  const loadCountyOptions = useCallback(
    async (inputValue: string) => {
      if (!stateValue) return [];
      return searchCounties(stateValue, inputValue);
    },
    [stateValue],
  );

  const loadCityOptions = useCallback(
    async (inputValue: string) => {
      if (!stateValue) return [];
      return searchCities(stateValue, inputValue, countyValue || undefined);
    },
    [countyValue, stateValue],
  );

  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (downloadSuccessTimerRef.current !== null) {
        window.clearTimeout(downloadSuccessTimerRef.current);
        downloadSuccessTimerRef.current = null;
      }
    };
  }, []);

  const updateJobQueryParam = useCallback(
    (nextJobId: string) => {
      const params = new URLSearchParams(location.search);
      params.set('job', nextJobId);
      const search = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : '',
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const clearJobQueryParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('job')) return;
    params.delete('job');
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : '',
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  const loadJobResults = useCallback(
    async (jobIdToLoad: string, storedState: PersistedLastJobState | null) => {
      setRehydrating(true);
      setError(null);
      setPollError(null);
      setPollErrorCount(0);
      try {
        const [jobDetail, resultsResponse] = await Promise.all([
          getJobDetail(jobIdToLoad),
          getJobResults(jobIdToLoad).catch(() => null),
        ]);
        const combinedJob: JobRecord = {
          ...(jobDetail.summary ?? {}),
          ...(jobDetail.job ?? {}),
        };
        let normalizedRows: RowResult[] = [];
        if (resultsResponse?.row_results && Array.isArray(resultsResponse.row_results)) {
          normalizedRows = (resultsResponse.row_results as RowResult[]).map((row, index) =>
            normalizeJobRowResult(row as unknown as JobRecord, index),
          );
        } else {
          const jobRows = await getJobRows(jobIdToLoad);
          normalizedRows = (jobRows ?? []).map((row, index) =>
            normalizeJobRowResult(row as JobRecord, index),
          );
        }
        const summary = buildParseSummaryFromJob(combinedJob);
        const createdAt = pickString(combinedJob, [
          'created_at',
          'createdAt',
          'created',
          'timestamp',
          'date',
          'updated_at',
          'updatedAt',
        ]);
        const cacheHitsValue = pickNumber(combinedJob, [
          'cache_hits',
          'cacheHits',
          'cache_hit_count',
        ]);
        const googleCallsValue = pickNumber(combinedJob, [
          'google_calls_used',
          'googleCallsUsed',
          'googleCalls',
          'apiCallsUsed',
        ]);
        setJobId(jobIdToLoad);
        setFile(null);
        setFileId(pickString(combinedJob, ['file_id', 'fileId', 'fileID', 'file']));
        if (storedState) {
          setStateValue(storedState.stateValue);
          setCountyValue(storedState.countyValue);
          setCityValue(storedState.cityValue);
          setCampaignName(storedState.campaignName);
        }
        setParseTimestamp(createdAt);
        setRowsReceived(
          summary?.rows_received ??
            pickNumber(combinedJob, ['rows_received', 'rowsReceived', 'total_rows', 'rows', 'rowCount']) ??
            normalizedRows.length,
        );
        setParseSummary(summary);
        setCanonicalAddresses(buildCanonicalAddressesFromRows(normalizedRows));
        setRowResults(normalizedRows);
        setDuplicateGroups(buildDuplicateGroupsFromRows(normalizedRows));
        setDebugInfo((combinedJob.debug as ParseDebugInfo | null) ?? null);
        setLegacyMatchedRows([]);
        setLegacyUnmatchedRows([]);
        setMetadata(Object.keys(combinedJob).length ? (combinedJob as Record<string, unknown>) : null);
        setLegacyMode(false);
        setActiveTab('valid');
        setLegacyTab('matched');
        setShowRaw(false);
        setShowDebugMode(false);
        setParsePayload(null);
        setProgressStep(4);
        setProgressPercent(100);
        setProgressInfo({
          phase: 'DONE',
          done: summary?.rows_received ?? normalizedRows.length,
          total: summary?.rows_received ?? normalizedRows.length,
          cacheHits: cacheHitsValue,
          googleCallsUsed: googleCallsValue,
          eta: null,
        });
      } catch (err) {
        setError((err as Error).message ?? 'Unable to load job results.');
      } finally {
        setRehydrating(false);
      }
    },
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const jobParam = params.get('job');
    const stored = readLastJobState();
    const resolvedJobId = jobParam ?? stored?.jobId ?? null;
    if (!resolvedJobId || busy || rehydrating) return;
    if (jobId === resolvedJobId && parseSummary) return;
    if (!jobParam && stored?.jobId) {
      updateJobQueryParam(stored.jobId);
    }
    void loadJobResults(resolvedJobId, stored ?? null);
  }, [busy, jobId, loadJobResults, location.search, parseSummary, rehydrating, updateJobQueryParam]);

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

  const hasPersistableResults = useMemo(() => {
    return Boolean(
      parseSummary ||
        legacyMatchedRows.length > 0 ||
        legacyUnmatchedRows.length > 0 ||
        rowResults.length > 0,
    );
  }, [legacyMatchedRows.length, legacyUnmatchedRows.length, parseSummary, rowResults.length]);

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

  const cacheBackend = useMemo(() => {
    if (!metadata) return null;
    return (metadata.cache_backend as string) || (metadata.cacheBackend as string) || null;
  }, [metadata]);

  const extractionMethod = useMemo(() => {
    if (!metadata) return null;
    return (
      (metadata.extraction_method as string) ||
      (metadata.extractionMethod as string) ||
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
    if (debugInfo?.no_addresses_detected === true) return true;
    if (!parseSummary) return false;
    return (
      parseSummary.rows_received > 0 &&
      parseSummary.valid_total === 0 &&
      parseSummary.unmatched === 0
    );
  }, [debugInfo?.no_addresses_detected, parseSummary]);

  const needsReviewRows = useMemo(() => rowResults.filter(isNeedsReviewRow), [rowResults]);
  const skippedRows = useMemo(() => rowResults.filter(isSkippedRow), [rowResults]);
  const outOfScopeRows = useMemo(() => rowResults.filter(isOutOfScopeRow), [rowResults]);
  const outOfScopeCityRowsCount = useMemo(
    () =>
      outOfScopeRows.filter((row) =>
        (row.reason_code || '').toUpperCase().includes('OUT_OF_SCOPE_CITY'),
      ).length,
    [outOfScopeRows],
  );
  const canRerunWithoutCityFilter = Boolean(cityValue) && outOfScopeCityRowsCount > 0;
  const errorRows = useMemo(() => rowResults.filter(isErrorRow), [rowResults]);

  useEffect(() => {
    setResultsPage(1);
  }, [activeTab, legacyTab, resultsPageSize, parseSummary]);

  const totalResultsForActiveTab = useMemo(() => {
    if (!parseSummary) return 0;
    switch (activeTab) {
      case 'valid':
        return canonicalAddresses.length;
      case 'needs_review':
        return needsReviewRows.length;
      case 'skipped':
        return skippedRows.length;
      case 'out_of_scope':
        return outOfScopeRows.length;
      case 'duplicates':
        return duplicateGroups.filter((group) => (group.source_row_ids?.length || 0) > 1).length;
      default:
        return 0;
    }
  }, [
    activeTab,
    canonicalAddresses.length,
    needsReviewRows.length,
    outOfScopeRows.length,
    duplicateGroups,
    parseSummary,
    skippedRows.length,
  ]);

  useEffect(() => {
    if (!totalResultsForActiveTab) return;
    const totalPages = Math.max(1, Math.ceil(totalResultsForActiveTab / resultsPageSize));
    if (resultsPage > totalPages) {
      setResultsPage(totalPages);
    }
  }, [resultsPage, resultsPageSize, totalResultsForActiveTab]);

  const paginateRows = useCallback(
    <T,>(items: T[]) => {
      const start = (resultsPage - 1) * resultsPageSize;
      return items.slice(start, start + resultsPageSize);
    },
    [resultsPage, resultsPageSize],
  );

  const paginatedCanonicalAddresses = useMemo(
    () => paginateRows(canonicalAddresses),
    [canonicalAddresses, paginateRows],
  );
  const paginatedNeedsReviewRows = useMemo(
    () => paginateRows(needsReviewRows),
    [needsReviewRows, paginateRows],
  );
  const paginatedSkippedRows = useMemo(
    () => paginateRows(skippedRows),
    [paginateRows, skippedRows],
  );
  const paginatedOutOfScopeRows = useMemo(
    () => paginateRows(outOfScopeRows),
    [outOfScopeRows, paginateRows],
  );
  const rowResultsById = useMemo(() => {
    const map = new Map<string, RowResult>();
    rowResults.forEach((row) => map.set(row.source_row_id, row));
    return map;
  }, [rowResults]);

  const filteredDuplicateGroups = useMemo(
    () => duplicateGroups.filter((group) => (group.source_row_ids?.length || 0) > 1),
    [duplicateGroups],
  );

  const rowAccountingMismatch = useMemo(() => {
    if (!parseSummary) return false;
    const responseRows =
      (metadata?.rows_received as number) ||
      (metadata?.rowsReceived as number) ||
      parseSummary.rows_received;
    return rowResults.length !== responseRows;
  }, [metadata, parseSummary, rowResults.length]);

  const accountedRowsFromSummary = useMemo(() => {
    const accountedRows =
      (metadata?.accounted_rows as number) || (metadata?.accountedRows as number);
    if (typeof accountedRows === 'number') return accountedRows;
    if (!parseSummary) return null;
    return (
      parseSummary.valid_total +
      parseSummary.unmatched +
      parseSummary.skipped +
      (parseSummary.out_of_scope ?? 0)
    );
  }, [metadata, parseSummary]);

  const responseRowsReceived = useMemo(() => {
    const metaRows =
      (metadata?.rows_received as number) || (metadata?.rowsReceived as number) || null;
    if (typeof metaRows === 'number') return metaRows;
    if (parseSummary) return parseSummary.rows_received;
    return rowsReceived;
  }, [metadata, parseSummary, rowsReceived]);

  const isStartingParse = busy && progressInfo.phase === null;

  const progressDetail = useMemo(() => {
    if (isStartingParse) {
      return 'Job running…';
    }
    const done = progressInfo.done;
    const total = progressInfo.total;
    const cacheHitsValue = progressInfo.cacheHits;
    const googleCallsValue = progressInfo.googleCallsUsed;
    if (
      done === null &&
      total === null &&
      cacheHitsValue === null &&
      googleCallsValue === null &&
      !progressInfo.eta
    ) {
      return null;
    }
    const detail = `Validating addresses: ${done ?? '--'}/${total ?? '--'} • Google calls ${
      googleCallsValue ?? '--'
    } • Cache hits ${cacheHitsValue ?? '--'}`;
    return progressInfo.eta ? `${detail} • ETA ~ ${progressInfo.eta}` : detail;
  }, [isStartingParse, progressInfo]);

  const shouldShowProgress = useMemo(
    () => busy || progressInfo.phase !== null || progressPercent !== null || parseSummary !== null,
    [busy, parseSummary, progressInfo.phase, progressPercent],
  );

  const getRecordId = (row: RowResult) => {
    const rawRow = row.raw_row as Record<string, unknown> | undefined;
    const candidate = rawRow?.record_id ?? rawRow?.recordId ?? rawRow?.recordID;
    if (candidate === null || candidate === undefined) return null;
    return typeof candidate === 'string' || typeof candidate === 'number'
      ? String(candidate)
      : null;
  };

  const getRowDisplayId = (row: RowResult) => {
    const recordId = getRecordId(row);
    if (recordId) return recordId;
    if (typeof row.source_row_index === 'number') {
      return String(row.source_row_index + 1);
    }
    const parsedIndex = normalizeNumber(row.source_row_index);
    if (typeof parsedIndex === 'number') {
      return String(parsedIndex + 1);
    }
    return row.source_row_id;
  };

  const getInputAddress = (row: RowResult) => {
    const rawRow = row.raw_row as Record<string, unknown> | undefined;
    const candidate =
      row.detected_address ??
      rawRow?.address ??
      rawRow?.full_address ??
      rawRow?.fullAddress ??
      rawRow?.property_address ??
      rawRow?.propertyAddress ??
      rawRow?.address_raw ??
      rawRow?.addressRaw ??
      (rawRow?.source as string | undefined) ??
      (rawRow?.source_raw as string | undefined) ??
      (rawRow?.sourceRaw as string | undefined);
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'number') return candidate.toString();
    return row.detected_address ?? row.formatted_address ?? '';
  };

  const getDebugLocation = (row: RowResult) => {
    const rawRow = row.raw_row as Record<string, unknown> | undefined;
    const candidate =
      (row as Record<string, unknown>).debug_location ??
      rawRow?.debug_location ??
      rawRow?.detected_location;
    if (!candidate) return null;
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'object') {
      const location = candidate as Record<string, unknown>;
      const parts = [
        location.city,
        location.county,
        location.state,
        location.zip,
        location.zip_code,
      ]
        .map((value) => (typeof value === 'string' ? value : null))
        .filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    return null;
  };

  const getMismatchActual = (row: RowResult) => {
    const rowRecord = row as Record<string, unknown>;
    const rawRow = row.raw_row as Record<string, unknown> | undefined;
    const candidate =
      rowRecord.mismatch_actual ??
      rowRecord.mismatchActual ??
      rawRow?.mismatch_actual ??
      rawRow?.mismatchActual;
    if (!candidate) return null;
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'object') {
      const mismatch = candidate as Record<string, unknown>;
      const parts = [
        mismatch.city,
        mismatch.county,
        mismatch.state,
        mismatch.zip,
        mismatch.zip_code,
      ]
        .map((value) => (typeof value === 'string' ? value : null))
        .filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    return null;
  };

  const getOriginalRowFields = (row: RowResult) => {
    const rawRow = row.raw_row as Record<string, unknown> | undefined;
    const originalCity =
      (rawRow?.city as string) ||
      (rawRow?.property_city as string) ||
      (rawRow?.propertyCity as string) ||
      null;
    const originalState =
      (rawRow?.state as string) ||
      (rawRow?.property_state as string) ||
      (rawRow?.propertyState as string) ||
      null;
    const originalZip =
      (rawRow?.zip as string) ||
      (rawRow?.zip_code as string) ||
      (rawRow?.postal_code as string) ||
      null;
    return [
      { label: 'ID', value: getRowDisplayId(row) },
      { label: 'Original address', value: getInputAddress(row) || '—' },
      { label: 'City', value: originalCity ?? '—' },
      { label: 'State', value: originalState ?? '—' },
      { label: 'ZIP', value: originalZip ?? '—' },
    ];
  };

  const getStatusLabel = (row: RowResult) => {
    if (isValidRow(row)) return 'Valid';
    if (isNeedsReviewRow(row)) return 'Needs Review';
    if (isOutOfScopeRow(row)) return 'Out of Scope';
    if (isSkippedRow(row)) return 'Skipped';
    return row.status || 'Unknown';
  };

  const humanizeReasonDetail = (detail: string) => {
    const trimmed = detail.trim();
    if (!trimmed) return '';
    if (/^[A-Z0-9_]+$/.test(trimmed)) {
      const spaced = trimmed.replace(/_/g, ' ').toLowerCase();
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }
    return trimmed;
  };

  const pickScopeValue = (scope: Record<string, unknown> | null, keys: string[]) => {
    if (!scope) return null;
    for (const key of keys) {
      const value = scope[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };

  const pickScopeGroup = (scope: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      const value = scope[key];
      if (value && typeof value === 'object') {
        return value as Record<string, unknown>;
      }
    }
    return null;
  };

  const formatOutOfScopeDetail = (scopeDebug: unknown) => {
    if (typeof scopeDebug === 'string') return scopeDebug.trim();
    if (!scopeDebug || typeof scopeDebug !== 'object') return null;
    const scopeRecord = scopeDebug as Record<string, unknown>;
    const detectedGroup = pickScopeGroup(scopeRecord, [
      'detected',
      'detected_scope',
      'detectedScope',
      'detected_location',
      'detectedLocation',
    ]);
    const selectedGroup = pickScopeGroup(scopeRecord, [
      'selected',
      'selected_scope',
      'selectedScope',
      'selected_location',
      'selectedLocation',
      'requested',
      'input',
      'target',
      'target_scope',
    ]);
    const readPair = (key: 'county' | 'city' | 'state') => {
      const capitalized = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      const detected =
        pickScopeValue(scopeRecord, [`detected_${key}`, `detected${capitalized}`]) ||
        pickScopeValue(detectedGroup, [key, `${key}_name`, `${key}_value`]);
      const selected =
        pickScopeValue(scopeRecord, [`selected_${key}`, `selected${capitalized}`]) ||
        pickScopeValue(selectedGroup, [key, `${key}_name`, `${key}_value`]);
      return { detected, selected };
    };
    const candidates: Array<{ label: string; detected: string | null; selected: string | null }> =
      [
        { label: 'County', ...readPair('county') },
        { label: 'City', ...readPair('city') },
        { label: 'State', ...readPair('state') },
      ];
    const match = candidates.find((candidate) => candidate.detected && candidate.selected);
    if (match?.detected && match.selected) {
      return `Detected ${match.detected} ${match.label}, but you selected ${match.selected} ${match.label}.`;
    }
    const fallback = candidates.find((candidate) => candidate.detected || candidate.selected);
    if (fallback?.detected) {
      return `Detected ${fallback.detected} ${fallback.label}, but it is outside your selection.`;
    }
    return null;
  };

  const getReasonDetailText = (row: RowResult) => {
    if (isOutOfScopeRow(row) && showDebugMode && row.scope_debug) {
      const scopeDetail = formatOutOfScopeDetail(row.scope_debug);
      if (scopeDetail) return scopeDetail;
    }
    return row.reason_detail ? humanizeReasonDetail(row.reason_detail) : '';
  };

  const renderReasonCell = (row: RowResult) => {
    const { label, description, fix_hint: fixHint } = getReasonMetadata(row);
    const reasonCode = row.reason_code?.trim();
    const tooltip = `${description}${fixHint ? `\nHow to fix: ${fixHint}` : ''}`;
    const detailText = getReasonDetailText(row);
    return (
      <div className="space-y-1">
        <span
          className="font-medium text-slate-700 underline decoration-dotted decoration-slate-300 underline-offset-4 dark:text-slate-200 dark:decoration-slate-600"
          title={tooltip}
        >
          {label}
        </span>
        {detailText ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isOutOfScopeRow(row) ? `Why? ${detailText}` : detailText}
          </div>
        ) : null}
        {showDebugMode && reasonCode ? (
          <div className="text-xs text-slate-400 dark:text-slate-500">{reasonCode}</div>
        ) : null}
      </div>
    );
  };

  const openReviewDrawer = (row: RowResult, focusEdit = false) => {
    const draft = reviewDrafts[row.source_row_id];
    setReviewRow(row);
    setReviewAddress(draft ?? getInputAddress(row));
    setReviewError(null);
    setReviewAutoFocus(focusEdit);
  };

  const closeReviewDrawer = () => {
    setReviewRow(null);
    setReviewError(null);
    setReviewSaving(false);
  };

  useEffect(() => {
    if (!reviewRow || !reviewAutoFocus) return;
    reviewInputRef.current?.focus();
    setReviewAutoFocus(false);
  }, [reviewRow, reviewAutoFocus]);

  useEffect(() => {
    if (!showDebugMode) {
      setShowRaw(false);
    }
  }, [showDebugMode]);

  const activeReviewIndex = useMemo(
    () => (reviewRow ? needsReviewRows.findIndex((row) => row.source_row_id === reviewRow.source_row_id) : -1),
    [needsReviewRows, reviewRow],
  );
  const canReviewPrev = activeReviewIndex > 0;
  const canReviewNext = activeReviewIndex > -1 && activeReviewIndex < needsReviewRows.length - 1;

  const navigateReviewRow = useCallback(
    (direction: 'prev' | 'next') => {
      if (!reviewRow) return;
      if (direction === 'prev' && !canReviewPrev) return;
      if (direction === 'next' && !canReviewNext) return;
      const delta = direction === 'next' ? 1 : -1;
      const target = needsReviewRows[activeReviewIndex + delta];
      if (target) {
        openReviewDrawer(target);
      }
    },
    [activeReviewIndex, canReviewNext, canReviewPrev, needsReviewRows, reviewRow],
  );

  useEffect(() => {
    if (!reviewRow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeReviewDrawer();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'j') {
        event.preventDefault();
        navigateReviewRow('next');
      }
      if (key === 'k') {
        event.preventDefault();
        navigateReviewRow('prev');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigateReviewRow, reviewRow]);

  const handleCopyDebugInfo = () => {
    const debugInfo = [
      `Timestamp: ${parseTimestamp ?? new Date().toISOString()}`,
      `State: ${stateValue || '--'}`,
      `County: ${countyValue || '--'}`,
      `City: ${cityValue || '--'}`,
      `Campaign name: ${campaignName || '--'}`,
      `File: ${file?.name || '--'}`,
      `File ID: ${fileId ?? '--'}`,
      `Job ID: ${jobId ?? '--'}`,
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

  const stopPolling = () => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = (jobIdToWatch: string, options?: { onFinished?: () => Promise<void> | void }) => {
    stopPolling();
    progressSamplesRef.current = [];
    pollingRef.current = window.setInterval(async () => {
      try {
        const { job } = await getJobWithStatus(jobIdToWatch);
        const phase = normalizePhase(job.phase);
        const status = normalizePhase(job.status);
        const done =
          normalizeNumber(job.progress_done) ?? normalizeNumber(job.progressDone) ?? null;
        const total =
          normalizeNumber(job.progress_total) ?? normalizeNumber(job.progressTotal) ?? null;
        const cacheHitsValue =
          normalizeNumber(job.cache_hits) ?? normalizeNumber(job.cacheHits) ?? null;
        const googleCallsValue =
          normalizeNumber(job.google_calls_used) ?? normalizeNumber(job.googleCallsUsed) ?? null;
        const updatedAtValue = job.updated_at ?? job.updatedAt;
        const updatedAt =
          typeof updatedAtValue === 'string' ? new Date(updatedAtValue).getTime() : Date.now();
        if (typeof done === 'number' && typeof total === 'number' && total > 0) {
          progressSamplesRef.current = [
            ...progressSamplesRef.current.slice(-2),
            { timestamp: updatedAt, done },
          ];
        }
        const samples = progressSamplesRef.current;
        let eta = null;
        if (samples.length >= 2 && typeof done === 'number' && typeof total === 'number') {
          const first = samples[0];
          const last = samples[samples.length - 1];
          const timeDelta = last.timestamp - first.timestamp;
          const doneDelta = last.done - first.done;
          if (timeDelta > 0 && doneDelta > 0) {
            const ratePerMs = doneDelta / timeDelta;
            const remaining = total - done;
            const etaSeconds = remaining > 0 ? remaining / ratePerMs / 1000 : 0;
            eta = formatEta(etaSeconds);
          }
        }
        const percent = computeProgressPercent(phase, done, total);
        if (typeof percent === 'number') {
          setProgressPercent(Math.round(percent));
        }
        if (phase) {
          setProgressStep(mapPhaseToStep(phase));
        }
        setProgressInfo({
          phase,
          done,
          total,
          cacheHits: cacheHitsValue,
          googleCallsUsed: googleCallsValue,
          eta,
        });
        setPollErrorCount(0);
        setPollError(null);
        if (status === 'FAILED' || phase === 'FAILED') {
          const errorMessage =
            (typeof job.error_message === 'string' && job.error_message) ||
            (typeof job.errorMessage === 'string' && job.errorMessage) ||
            'Parse job failed.';
          setError(errorMessage);
          stopPolling();
          setBusy(false);
          return;
        }
        if (status === 'DONE' || phase === 'DONE' || status === 'COMPLETED') {
          setProgressPercent(100);
          setProgressStep(mapPhaseToStep('DONE'));
          stopPolling();
          if (options?.onFinished) {
            await options.onFinished();
          }
        }
      } catch (err) {
        const message = (err as Error).message ?? 'Polling failed.';
        setPollErrorCount((prev) => prev + 1);
        setPollError(message);
      }
    }, 900);
  };

  const applyParsedResponse = useCallback(
    (parsed: Record<string, unknown>, fallbackRowsReceived: number | null) => {
      setParseTimestamp(new Date().toISOString());
      setParsePayload(parsed);
      setProgressStep(3);
      setProgressStep(4);
      const parseResponse = parsed as unknown as {
        summary?: ParseSummary;
        row_results?: RowResult[];
        canonical_addresses?: CanonicalAddress[];
        duplicate_groups?: DuplicateGroup[];
        debug?: ParseDebugInfo;
        matched?: unknown[];
        unmatched?: unknown[];
        items?: unknown[];
        metadata?: Record<string, unknown>;
      };
      const hasRowAccounting = Boolean(parseResponse.summary && parseResponse.row_results);
      if (hasRowAccounting) {
        const summary = parseResponse.summary as ParseSummary;
        const rowAccountingMetadata: Record<string, unknown> = {
          ...((parsed.metadata as Record<string, unknown>) ?? {}),
        };
        const responseRowsReceived =
          typeof parsed.rows_received === 'number'
            ? parsed.rows_received
            : summary.rows_received ?? fallbackRowsReceived ?? null;

        rowAccountingMetadata.rows_received = responseRowsReceived;
        if (typeof parsed.accounted_rows === 'number') {
          rowAccountingMetadata.accounted_rows = parsed.accounted_rows;
        }
        if (typeof parsed.extraction_method === 'string') {
          rowAccountingMetadata.extraction_method = parsed.extraction_method;
        }
        if (parsed.warnings) {
          rowAccountingMetadata.warnings = parsed.warnings;
        }
        if (typeof parsed.google_calls_used === 'number') {
          rowAccountingMetadata.google_calls_used = parsed.google_calls_used;
        }
        if (typeof parsed.cache_hits === 'number') {
          rowAccountingMetadata.cache_hits = parsed.cache_hits;
        }

        setParseSummary(summary);
        setRowsReceived(responseRowsReceived);
        const canonicalRows = (parseResponse.canonical_addresses ?? []) as CanonicalAddress[];
        setCanonicalAddresses(canonicalRows.map(normalizeCanonicalAddress));
        setRowResults((parseResponse.row_results ?? []) as RowResult[]);
        setDuplicateGroups((parseResponse.duplicate_groups ?? []) as DuplicateGroup[]);
        setDebugInfo((parseResponse.debug ?? null) as ParseDebugInfo | null);
        setMetadata(Object.keys(rowAccountingMetadata).length ? rowAccountingMetadata : null);
        setLegacyMode(false);
      } else {
        setLegacyMode(true);
        const parsedHasBuckets = 'matched' in parseResponse || 'unmatched' in parseResponse;
        if (parsedHasBuckets) {
          const rawMatched = (parseResponse.matched || []) as unknown[];
          const rawUnmatched = (parseResponse.unmatched || []) as unknown[];
          setLegacyMatchedRows(normalizeRows(rawMatched));
          setLegacyUnmatchedRows(normalizeRows(rawUnmatched));
        } else {
          const rawItems = (parseResponse.items || []) as Record<string, unknown>[];
          const matchedItems = rawItems.filter((item) => item.status === 'Matched');
          const unmatchedItems = rawItems.filter((item) => item.status !== 'Matched');
          setLegacyMatchedRows(normalizeRows(matchedItems));
          setLegacyUnmatchedRows(normalizeRows(unmatchedItems));
        }
        setMetadata((parseResponse.metadata as Record<string, unknown>) || null);
      }
      const progressMeta = (parseResponse.metadata as Record<string, unknown> | undefined)?.progress;
      if (typeof progressMeta === 'number') {
        setProgressPercent(progressMeta);
      } else if (typeof progressMeta === 'object' && progressMeta !== null) {
        const percent = (progressMeta as { percent?: number }).percent;
        if (typeof percent === 'number') {
          setProgressPercent(percent);
        }
      }
    },
    [],
  );

  const hydrateCompletedAsyncJob = useCallback(
    async (completedJobId: string, fallbackRowsReceived: number | null) => {
      const results = await getJobResults(completedJobId);
      applyParsedResponse(results as unknown as Record<string, unknown>, fallbackRowsReceived);
    },
    [applyParsedResponse],
  );

  const resetForFreshParse = () => {
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
    setProgressPercent(5);
    setPollError(null);
    setPollErrorCount(0);
    setProcessingReportFilter('all');
    setActiveTab('valid');
    setLegacyTab('matched');
    setReviewRow(null);
    setReviewError(null);
    setReviewSaving(false);
    setReviewDrafts({});
    setProgressInfo({
      phase: null,
      done: null,
      total: null,
      cacheHits: null,
      googleCallsUsed: null,
      eta: null,
    });
  };

  const runParseWithExistingUpload = async (uploadFileId: string, cityOverride?: string) => {
    resetForFreshParse();
    try {
      const trimmedCampaignName = campaignName.trim();
      const cityToUse = cityOverride ?? cityValue;
      const parsed = await parseFile(uploadFileId, {
        state: stateValue,
        county: countyValue,
        city: cityToUse,
        force_refresh: forceRefresh,
        jobName: trimmedCampaignName || undefined,
      });
      const parsedRecord = parsed as Record<string, unknown>;
      const createdJobId =
        pickString(parsedRecord as JobRecord, ['job_id', 'jobId', 'id']) ??
        pickString((parsedRecord.metadata as JobRecord) ?? {}, ['job_id', 'jobId', 'id']) ??
        crypto.randomUUID();
      setJobId(createdJobId);
      setFileId(uploadFileId);
      setParseTimestamp(new Date().toISOString());
      setParsePayload(parsedRecord);
      setProgressStep(4);
      setProgressPercent(100);
      const hasRowAccounting = Boolean(parsed.summary && parsed.row_results);
      if (hasRowAccounting) {
        const summary = parsed.summary as ParseSummary;
        const rowAccountingMetadata: Record<string, unknown> = {
          ...((parsedRecord.metadata as Record<string, unknown>) ?? {}),
        };
        const responseRowsReceived =
          typeof parsedRecord.rows_received === 'number'
            ? parsedRecord.rows_received
            : summary.rows_received ?? null;

        rowAccountingMetadata.rows_received = responseRowsReceived;
        if (typeof parsedRecord.accounted_rows === 'number') {
          rowAccountingMetadata.accounted_rows = parsedRecord.accounted_rows;
        }
        if (typeof parsedRecord.extraction_method === 'string') {
          rowAccountingMetadata.extraction_method = parsedRecord.extraction_method;
        }
        if (parsedRecord.warnings) {
          rowAccountingMetadata.warnings = parsedRecord.warnings;
        }
        if (typeof parsedRecord.google_calls_used === 'number') {
          rowAccountingMetadata.google_calls_used = parsedRecord.google_calls_used;
        }
        if (typeof parsedRecord.cache_hits === 'number') {
          rowAccountingMetadata.cache_hits = parsedRecord.cache_hits;
        }

        setParseSummary(summary);
        setRowsReceived(responseRowsReceived);
        const canonicalRows = (parsed.canonical_addresses ?? []) as CanonicalAddress[];
        setCanonicalAddresses(canonicalRows.map(normalizeCanonicalAddress));
        setRowResults((parsed.row_results ?? []) as RowResult[]);
        setDuplicateGroups((parsed.duplicate_groups ?? []) as DuplicateGroup[]);
        setDebugInfo((parsed.debug ?? null) as ParseDebugInfo | null);
        setMetadata(Object.keys(rowAccountingMetadata).length ? rowAccountingMetadata : null);
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
      if (cityOverride !== undefined) {
        setCityValue(cityOverride);
      }
      updateJobQueryParam(createdJobId);
      writeLastJobState({
        version: LAST_JOB_STORAGE_VERSION,
        jobId: createdJobId,
        stateValue,
        countyValue,
        cityValue: cityToUse,
        campaignName: trimmedCampaignName,
      });
    } catch (err) {
      setError((err as Error).message ?? 'Parsing failed.');
    } finally {
      stopPolling();
      setBusy(false);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    resetForFreshParse();
    try {
      const newJobId = crypto.randomUUID();
      setJobId(newJobId);
      const trimmedCampaignName = campaignName.trim();
      const upload = await uploadFile(file, trimmedCampaignName || undefined);
      setFileId(upload.fileId);
      setRowsReceived(upload.rowsReceived ?? null);
      setProgressStep(1);
      setProgressStep(2);

      const useAsyncMode = shouldUseAsyncParse(file);
      if (useAsyncMode) {
        setProgressInfo((prev) => ({
          ...prev,
          phase: 'PARSING',
        }));
        startPolling(newJobId, {
          onFinished: async () => {
            await hydrateCompletedAsyncJob(newJobId, upload.rowsReceived ?? null);
            setBusy(false);
          },
        });
        await parseFileAsync(upload.fileId, {
          state: stateValue,
          county: countyValue,
          city: cityValue,
          force_refresh: forceRefresh,
          jobId: newJobId,
          jobName: trimmedCampaignName || undefined,
        });
      } else {
        startPolling(newJobId);
        const parsed = await parseFile(upload.fileId, {
          state: stateValue,
          county: countyValue,
          city: cityValue,
          force_refresh: forceRefresh,
          jobId: newJobId,
          jobName: trimmedCampaignName || undefined,
        });
        applyParsedResponse(parsed as unknown as Record<string, unknown>, upload.rowsReceived ?? null);
        stopPolling();
        setBusy(false);
      }

      updateJobQueryParam(newJobId);
      writeLastJobState({
        version: LAST_JOB_STORAGE_VERSION,
        jobId: newJobId,
        stateValue,
        countyValue,
        cityValue,
        campaignName: trimmedCampaignName,
      });
    } catch (err) {
      setError((err as Error).message ?? 'Parsing failed.');
      stopPolling();
      setBusy(false);
      return;
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
        location: { state: stateValue, county: countyValue, city: cityValue },
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
        location: { state: stateValue, county: countyValue, city: cityValue },
      });
      setRetryAvailable('available');
      setLegacyUnmatchedRows((prev) => prev.map((row) => ({ ...row, needsRetry: false })));
      applyRetryResponse(response);
    } catch {
      setRetryAvailable('unavailable');
    }
  };

  const handleRetryUpdates = (payload: {
    updatedRows: RowResult[];
    updatedJob?: Record<string, unknown>;
  }) => {
    const { updatedRows, updatedJob } = payload;
    if (updatedRows?.length) {
      setRowResults((prev) => {
        const updates = new Map<string, RowResult>();
        updatedRows.forEach((row) => {
          const id = getRowIdentifier(row as Record<string, unknown>);
          if (id) {
            updates.set(id, row);
          }
        });
        if (!updates.size) return prev;
        return prev.map((row) => {
          const id = getRowIdentifier(row as Record<string, unknown>);
          if (!id || !updates.has(id)) return row;
          const updatedRow = updates.get(id) as RowResult;
          return { ...row, ...updatedRow };
        });
      });
    }

    if (updatedJob) {
      const totalRows = pickNumberFromRecord(updatedJob, [
        'rows_received',
        'rowsReceived',
        'total_rows',
        'rows',
        'rowCount',
      ]);
      const matchedCount = pickNumberFromRecord(updatedJob, [
        'matched_count',
        'matched',
        'matchedCount',
      ]);
      const unmatchedCount = pickNumberFromRecord(updatedJob, [
        'unmatched_count',
        'unmatched',
        'unmatchedCount',
      ]);
      const dedupedCountValue = pickNumberFromRecord(updatedJob, [
        'deduped_count',
        'dedupedCount',
      ]);
      const cacheHitsValue = pickNumberFromRecord(updatedJob, [
        'cache_hits',
        'cacheHits',
        'cache_hit_count',
      ]);
      const googleCallsValue = pickNumberFromRecord(updatedJob, [
        'google_calls_used',
        'googleCallsUsed',
        'googleCalls',
        'apiCallsUsed',
      ]);

      setRowsReceived((prev) =>
        typeof totalRows === 'number' ? totalRows : prev,
      );
      setMetadata((prev) => {
        const next = { ...(prev ?? {}) };
        if (typeof totalRows === 'number') next.rows_received = totalRows;
        if (typeof matchedCount === 'number') next.matched_count = matchedCount;
        if (typeof unmatchedCount === 'number') next.unmatched_count = unmatchedCount;
        if (typeof dedupedCountValue === 'number') next.deduped_count = dedupedCountValue;
        if (typeof cacheHitsValue === 'number') next.cache_hits = cacheHitsValue;
        if (typeof googleCallsValue === 'number') next.google_calls_used = googleCallsValue;
        return next;
      });
      setParseSummary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows_received: typeof totalRows === 'number' ? totalRows : prev.rows_received,
          valid_total: typeof matchedCount === 'number' ? matchedCount : prev.valid_total,
          valid_unique:
            typeof dedupedCountValue === 'number' ? dedupedCountValue : prev.valid_unique,
          unmatched: typeof unmatchedCount === 'number' ? unmatchedCount : prev.unmatched,
        };
      });
    }
  };

  const handleClearResults = () => {
    stopPolling();
    clearLastJobState();
    clearJobQueryParam();
    setFile(null);
    setFileId(null);
    setJobId(null);
    setParseTimestamp(null);
    setRowsReceived(null);
    setParseSummary(null);
    setCanonicalAddresses([]);
    setRowResults([]);
    setDuplicateGroups([]);
    setDebugInfo(null);
    setLegacyMatchedRows([]);
    setLegacyUnmatchedRows([]);
    setMetadata(null);
    setLegacyMode(false);
    setActiveTab('valid');
    setLegacyTab('matched');
    setShowRaw(false);
    setShowDebugMode(false);
    setProgressStep(0);
    setProgressPercent(null);
    setProgressInfo({
      phase: null,
      done: null,
      total: null,
      cacheHits: null,
      googleCallsUsed: null,
      eta: null,
    });
    setError(null);
    setPollError(null);
    setPollErrorCount(0);
    setParsePayload(null);
    setProcessingReportOpen(false);
    setProcessingReportFilter('all');
    setExpandedDuplicateGroups(new Set());
    setReviewRow(null);
    setReviewAddress('');
    setReviewError(null);
    setReviewSaving(false);
    setReviewAutoFocus(false);
    setReviewDrafts({});
    if (downloadSuccessTimerRef.current !== null) {
      window.clearTimeout(downloadSuccessTimerRef.current);
      downloadSuccessTimerRef.current = null;
    }
    setActiveDownloadType(null);
    setDownloadSuccessLabel(null);
    setStateValue('');
    setCountyValue('');
    setCityValue('');
    setCampaignName('');
    setForceRefresh(false);
    setBusy(false);
  };

  const handleReviewRetry = async () => {
    if (!reviewRow) return;
    const trimmedAddress = reviewAddress.trim();
    if (!trimmedAddress) {
      setReviewError('Address is required.');
      return;
    }
    if (!jobId) {
      setReviewError('Missing job ID. Please re-run the parse job.');
      return;
    }
    setReviewSaving(true);
    setReviewError(null);
    try {
      const response = await retryJobRow(jobId, reviewRow.source_row_id, trimmedAddress, forceRefresh);
      handleRetryUpdates({
        updatedRows: response.updated_row_results ?? response.updated_rows ?? [],
        updatedJob: response.updated_job as Record<string, unknown> | undefined,
      });
      setReviewDrafts((prev) => {
        const next = { ...prev };
        delete next[reviewRow.source_row_id];
        return next;
      });
      closeReviewDrawer();
    } catch (err) {
      setReviewError((err as Error).message ?? 'Retry failed.');
    } finally {
      setReviewSaving(false);
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

  const handleDownloadJobExport = async (type: JobExportType, label: string) => {
    if (!jobId) {
      setError('Missing job ID. Please re-run the parse job.');
      return;
    }
    setActiveDownloadType(type);
    setPollError(null);
    try {
      const { blob, filename } = await downloadJobExport(jobId, type);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setDownloadSuccessLabel(`${label} downloaded`);
      if (downloadSuccessTimerRef.current !== null) {
        window.clearTimeout(downloadSuccessTimerRef.current);
      }
      downloadSuccessTimerRef.current = window.setTimeout(() => {
        setDownloadSuccessLabel(null);
        downloadSuccessTimerRef.current = null;
      }, 2000);
    } catch (err) {
      setPollError((err as Error).message ?? 'Failed to download export.');
    } finally {
      setActiveDownloadType(null);
    }
  };

  const downloadLabels: Record<JobExportType, string> = {
    unique_valid: 'Unique Valid CSV',
    needs_review: 'Needs Review CSV',
    processing_report: 'Processing Report CSV',
    matched: 'Valid CSV',
    unmatched: 'Needs Review CSV',
  };

  const openProcessingReport = (filter: ProcessingReportFilter) => {
    setProcessingReportFilter(filter);
    setProcessingReportOpen(true);
  };

  const scrollToResults = () => {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleKpiTabClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
    scrollToResults();
  };

  const handleRowsReceivedClick = () => {
    openProcessingReport('all');
    scrollToResults();
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
                <th className="px-4 py-3">Record ID / Row (data)</th>
                <th className="px-4 py-3">Detected Address</th>
                <th className="px-4 py-3">Reason</th>
                {showDebugMode ? <th className="px-4 py-3">Raw Preview</th> : null}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => (
                <tr key={row.source_row_id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                    {getRowDisplayId(row)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                    {row.detected_address || '--'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {renderReasonCell(row)}
                  </td>
                  {showDebugMode ? (
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {stringifyPreview(row.raw_row)}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openReviewDrawer(row)}
                       
                      >
                        Review
                      </button>
                      {showDebugMode ? (
                        <button
                          type="button"
                          onClick={() => copyJsonPayload(row)}
                         
                        >
                          Copy Row JSON
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const reviewReason = reviewRow ? getReasonMetadata(reviewRow) : null;
  const reviewRecordId = reviewRow ? getRecordId(reviewRow) : null;
  const reviewDetectedLocation = reviewRow ? getDebugLocation(reviewRow) : null;
  const reviewMismatchActual = reviewRow ? getMismatchActual(reviewRow) : null;
  const reviewStatusLabel = reviewRow ? getStatusLabel(reviewRow) : '';
  const reviewDetectedAddress = reviewRow?.detected_address ?? reviewRow?.formatted_address ?? '';
  const reviewVerifiedAddress = reviewRow?.formatted_address ?? '';
  const reviewNeedsReview = reviewRow ? isNeedsReviewRow(reviewRow) : false;
  const reviewOutOfScope = reviewRow ? isOutOfScopeRow(reviewRow) : false;
  const reviewSkipped = reviewRow ? isSkippedRow(reviewRow) : false;
  const selectedLocationSummary = [countyValue || cityValue || null, stateValue || null]
    .filter(Boolean)
    .join(', ');
  const canEditReview = reviewNeedsReview;

  return (
    <AppShell
      title="Address Parser"
      subtitle="Upload a file, set your location context, and parse addresses."
    >
      <div className="space-y-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Upload file</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Add a file to start parsing addresses.
                </p>
              </div>
              <FileUploadCard file={file} onChange={setFile} />
            </div>
            <div className="flex flex-col gap-4">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Location context</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Select the required location fields to improve parsing accuracy.
                  </p>
                </div>
                <AsyncLocationSelect
                  label="State"
                  value={stateValue}
                  placeholder="Search state"
                  required
                  loadOptions={loadStateOptions}
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
                />
                <AsyncLocationSelect
                  label="County (optional)"
                  value={countyValue}
                  placeholder={stateValue ? 'Search county' : 'Select state first'}
                  disabled={!stateValue}
                  cacheScope={`counties:${stateValue}`}
                  loadOptions={loadCountyOptions}
                  onChange={(value) => {
                    setCountyValue(value);
                    setCityValue('');
                  }}
                  onClear={() => setCountyValue('')}
                />
                <AsyncLocationSelect
                  label="City (optional)"
                  value={cityValue}
                  placeholder={stateValue ? 'Search city' : 'Select state first'}
                  disabled={!stateValue}
                  cacheScope={`cities:${stateValue}:${countyValue}`}
                  loadOptions={loadCityOptions}
                  onChange={(value) => setCityValue(value)}
                  onClear={() => setCityValue('')}
                  helperText="Select a State, and then either a County or a City (or both)."
                />
                {showLocationValidation ? (
                  <p className="text-xs text-rose-600 dark:text-rose-300">
                    Select a State, and then either a County or a City (or both).
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="campaign-name"
                  className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                >
                  Campaign name (optional)
                </label>
                <input
                  id="campaign-name"
                  type="text"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="e.g. April absentee owners"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Shown in History so you can find this job later.
                </p>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Force re-verify addresses
                    </p>
                    <span
                      title="Uses more Google calls."
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-300"
                      aria-label="Uses more Google calls."
                    >
                      i
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Uses more Google calls. Enable only when cached verification may be outdated.
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
              <div className="mt-2 flex items-center justify-end">
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleParse}
                    disabled={!canParse || busy || rehydrating}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${
                      canParse && !busy && !rehydrating
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    }`}
                  >
                    {parseCtaLabel}
                  </button>
                  {fileId && hasLocation ? (
                    <button
                      type="button"
                      onClick={() => void runParseWithExistingUpload(fileId)}
                      disabled={!canRerunSameUpload}
                      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                        canRerunSameUpload
                          ? 'border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-500/10'
                          : 'border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
                      }`}
                    >
                      Re-run (use same upload)
                    </button>
                  ) : null}
                </div>
              </div>
              {error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {shouldShowProgress ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Parsing Progress</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Live status updates while we process your file.
                </p>
              </div>
              {isStartingParse ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  Job running…
                </span>
              ) : null}
            </div>
            <div className="mt-4">
              <ProgressIndicator
                steps={PROGRESS_STEPS}
                currentStep={progressStep}
                percent={progressPercent}
              />
              {progressDetail ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {isStartingParse ? (
                    <span className="inline-flex h-3 w-3 items-center justify-center">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500 dark:border-slate-700 dark:border-t-indigo-400" />
                    </span>
                  ) : null}
                  <span>{progressDetail}</span>
                </div>
              ) : null}
              {pollErrorCount >= 8 && pollError ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                  Still working, but live progress is unavailable. Last error: {pollError}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          ref={resultsRef}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="sticky top-16 z-20 -mx-6 mb-6 border-b border-slate-200/80 bg-white/95 px-6 py-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Processing Results</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Review parsed rows, fix issues, and export results.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <span>Debug mode</span>
                  <button
                    type="button"
                    onClick={() => setShowDebugMode((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
                      showDebugMode
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                    }`}
                    role="switch"
                    aria-checked={showDebugMode}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition dark:bg-slate-100 ${
                        showDebugMode ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {parseSummary ? (
                  <button
                    type="button"
                    onClick={() => openProcessingReport('all')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Processing Report
                  </button>
                ) : null}
                {parseSummary ? (
                  <button
                    type="button"
                    onClick={handleDownloadUnique}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Download Unique Valid CSV
                  </button>
                ) : null}
                {parseSummary ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadProcessingReport(rowResults, 'processing-report.csv')
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Download Full Processing Report CSV
                  </button>
                ) : null}
                {parseSummary ? (
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
                ) : null}
                {hasPersistableResults ? (
                  <button
                    type="button"
                    onClick={handleClearResults}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Clear results / Start new parse
                  </button>
                ) : null}
                {showDebugMode ? (
                  <button
                    type="button"
                    onClick={handleCopyDebugInfo}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Copy debug info
                  </button>
                ) : null}
                {showDebugMode && legacyMode ? (
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

            {parseSummary ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Downloads</h3>
                  {downloadSuccessLabel ? (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Downloaded
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Export parse results directly from this page.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {JOB_EXPORT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleDownloadJobExport(type, downloadLabels[type])}
                      disabled={!jobId || activeDownloadType !== null}
                     
                    >
                      {activeDownloadType === type ? 'Downloading…' : `Download ${downloadLabels[type]}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {parseSummary ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleKpiTabClick('valid')}
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
                  onClick={() => handleKpiTabClick('needs_review')}
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
                  onClick={() => handleKpiTabClick('skipped')}
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
                  onClick={() => handleKpiTabClick('duplicates')}
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
                    onClick={() => handleKpiTabClick('out_of_scope')}
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
            ) : (
              <EmptyState className="mt-4 py-6" title="No parse results" description="Run a parse to see results." />
            )}
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
                  Processing mismatch: received {responseRowsReceived ?? parseSummary.rows_received}{' '}
                  rows but only {rowResults.length} were accounted for. Please retry. (This is a
                  bug; contact support.)
                </p>
                {showDebugMode ? (
                  <button
                    type="button"
                    onClick={handleCopyDebugInfo}
                   
                  >
                    Copy Debug Info
                  </button>
                ) : null}
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
          {canRerunWithoutCityFilter && fileId ? (
            <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>Many rows are out-of-scope due to city mismatch. Rerun without city filter.</p>
                <button
                  type="button"
                  disabled={!canRerunSameUpload}
                  onClick={() => void runParseWithExistingUpload(fileId, '')}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  Rerun without city filter
                </button>
              </div>
            </div>
          ) : null}
          {parseSummary ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleRowsReceivedClick}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Rows Received</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {responseRowsReceived ?? parseSummary.rows_received}
                </p>
                <AccountedRowsIndicator
                  rowsReceived={responseRowsReceived}
                  accountedRows={accountedRowsFromSummary ?? 0}
                />
              </button>
              <button
                type="button"
                onClick={() => handleKpiTabClick('valid')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  Unique Valid Addresses
                </p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {parseSummary.valid_unique}
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleKpiTabClick('needs_review')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Needs Review</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {parseSummary.unmatched}
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleKpiTabClick('skipped')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Skipped</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {parseSummary.skipped}
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleKpiTabClick('duplicates')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Duplicates</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {parseSummary.duplicates}
                </p>
              </button>
              {typeof parseSummary.out_of_scope === 'number' ? (
                <button
                  type="button"
                  onClick={() => handleKpiTabClick('out_of_scope')}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                >
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Out of Scope
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {parseSummary.out_of_scope}
                  </p>
                </button>
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
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Valid (Unique)</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{dedupedMatched.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Needs Review</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{dedupedUnmatched.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Skipped</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">0</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Duplicates</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">0</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Out of Scope</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">0</p>
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
          {parseSummary && extractionMethod ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Extraction method: {extractionMethod}
            </p>
          ) : null}
          {parseSummary && (googleCallsUsed !== null || cacheHits !== null || cacheBackend) ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Google calls used: {googleCallsUsed ?? 0} • Cache hits: {cacheHits ?? 0}
              {cacheBackend ? ` • Cache backend: ${cacheBackend}` : ''}
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
            {busy && !parseSummary ? <ResultsTableSkeleton /> : null}
            {parseSummary ? (
              <>
                {activeTab === 'valid' ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">#</th>
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
                                colSpan={7}
                              >
                                No unique valid addresses yet.
                              </td>
                            </tr>
                          ) : (
                            paginatedCanonicalAddresses.map((row, index) => (
                              <tr
                                key={row.canonical_id}
                                className="hover:bg-slate-50 dark:hover:bg-slate-900"
                              >
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {(resultsPage - 1) * resultsPageSize + index + 1}
                                </td>
                                <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                                  {row.fullAddress || row.formatted_address || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {row.street1 || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {row.street2 || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {row.city || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {row.state || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {row.zip || '--'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      totalCount={canonicalAddresses.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                    />
                  </div>
                ) : null}
                {activeTab === 'needs_review' ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Record ID / Row</th>
                            <th className="px-4 py-3">Original Address</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Reason</th>
                            {showDebugMode ? <th className="px-4 py-3">Raw Preview</th> : null}
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {needsReviewRows.length === 0 ? (
                            <tr>
                              <td
                                className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                colSpan={showDebugMode ? 6 : 5}
                              >
                                No rows need review.
                              </td>
                            </tr>
                          ) : (
                            paginatedNeedsReviewRows.map((row) => (
                              <tr
                                key={row.source_row_id}
                                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                                onClick={() => openReviewDrawer(row)}
                              >
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {getRowDisplayId(row)}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {getInputAddress(row) || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {getStatusLabel(row)}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {renderReasonCell(row)}
                                </td>
                                {showDebugMode ? (
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                    {stringifyPreview(row.raw_row)}
                                  </td>
                                ) : null}
                                <td className="px-4 py-3 text-right">
                                  <div
                                    className="flex flex-wrap justify-end gap-2"
                                    onClick={(event) => event.stopPropagation()}
                                    role="presentation"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openReviewDrawer(row)}
                                     
                                    >
                                      Review
                                    </button>
                                    {showDebugMode ? (
                                      <button
                                        type="button"
                                        onClick={() => copyJsonPayload(row)}
                                       
                                      >
                                        Copy Row JSON
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      totalCount={needsReviewRows.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                    />
                  </div>
                ) : null}
                {activeTab === 'skipped' ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Record ID / Row</th>
                            <th className="px-4 py-3">Original Address</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Reason</th>
                            {showDebugMode ? <th className="px-4 py-3">Raw Preview</th> : null}
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {skippedRows.length === 0 ? (
                            <tr>
                              <td
                                className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                colSpan={showDebugMode ? 6 : 5}
                              >
                                No rows were skipped.
                              </td>
                            </tr>
                          ) : (
                            paginatedSkippedRows.map((row) => (
                              <tr
                                key={row.source_row_id}
                                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                                onClick={() => openReviewDrawer(row)}
                              >
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {getRowDisplayId(row)}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {getInputAddress(row) || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {getStatusLabel(row)}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {renderReasonCell(row)}
                                </td>
                                {showDebugMode ? (
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                    {stringifyPreview(row.raw_row)}
                                  </td>
                                ) : null}
                                <td className="px-4 py-3 text-right">
                                  <div
                                    className="flex flex-wrap justify-end gap-2"
                                    onClick={(event) => event.stopPropagation()}
                                    role="presentation"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openReviewDrawer(row)}
                                     
                                    >
                                      Review
                                    </button>
                                    {showDebugMode ? (
                                      <button
                                        type="button"
                                        onClick={() => copyJsonPayload(row)}
                                       
                                      >
                                        Copy Row JSON
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      totalCount={skippedRows.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                    />
                  </div>
                ) : null}
                {activeTab === 'duplicates' ? (
                  <div className="space-y-4">
                    {filteredDuplicateGroups.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        No duplicate groups detected.
                      </div>
                    ) : (
                      filteredDuplicateGroups.map((group, index) => {
                        const isExpanded = expandedDuplicateGroups.has(group.canonical_id);
                        const rowCount = group.source_row_ids.length;
                        const duplicateCount =
                          group.duplicate_rows_count ?? Math.max(0, rowCount - 1);
                        return (
                          <div
                            key={group.canonical_id}
                            className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Group {index + 1}
                                </p>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {group.canonical_formatted_address}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Canonical ID: {group.canonical_id}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                  Rows: {rowCount} • Duplicates: {duplicateCount}
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
                            <th className="px-4 py-3">Record ID / Row</th>
                            <th className="px-4 py-3">Original Address</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Reason</th>
                            {showDebugMode ? <th className="px-4 py-3">Raw Preview</th> : null}
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {outOfScopeRows.length === 0 ? (
                            <tr>
                              <td
                                className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                colSpan={showDebugMode ? 6 : 5}
                              >
                                No out-of-scope rows.
                              </td>
                            </tr>
                          ) : (
                            paginatedOutOfScopeRows.map((row) => (
                              <tr
                                key={row.source_row_id}
                                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                                onClick={() => openReviewDrawer(row)}
                              >
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {getRowDisplayId(row)}
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                  {getInputAddress(row) || '--'}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {getStatusLabel(row)}
                                </td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                  {renderReasonCell(row)}
                                </td>
                                {showDebugMode ? (
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                    {stringifyPreview(row.raw_row)}
                                  </td>
                                ) : null}
                                <td className="px-4 py-3 text-right">
                                  <div
                                    className="flex flex-wrap justify-end gap-2"
                                    onClick={(event) => event.stopPropagation()}
                                    role="presentation"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openReviewDrawer(row)}
                                     
                                    >
                                      Review
                                    </button>
                                    {showDebugMode ? (
                                      <button
                                        type="button"
                                        onClick={() => copyJsonPayload(row)}
                                       
                                      >
                                        Copy Row JSON
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      totalCount={outOfScopeRows.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                    />
                  </div>
                ) : null}
              </>
            ) : busy ? null : (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
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
                            ? 'valid-addresses.csv'
                            : 'needs-review-addresses.csv',
                          (legacyTab === 'matched' ? dedupedMatched : dedupedUnmatched).map(
                            (row) => ({
                              full_address: row.fullAddress,
                              street_address: row.streetAddress,
                              address2: row.address2,
                              city: row.city,
                              state: row.state,
                              zip_code: row.zipCode,
                              source_raw: row.sourceRaw,
                            }),
                          ),
                        )
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Download {legacyTab === 'matched' ? 'Valid' : 'Needs Review'} CSV
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
        jobId={jobId}
        initialFilter={processingReportFilter}
        onClose={() => setProcessingReportOpen(false)}
        onApplyUpdates={handleRetryUpdates}
        forceReverify={forceRefresh}
        showDebugMode={showDebugMode}
      />

      {reviewRow ? (
        <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/60 px-4 py-6 dark:bg-slate-950/80">
          <div className="flex h-full w-full max-w-xl flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  Review &amp; Fix
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Understand what happened and correct the row if needed.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewDrawer}
                className="text-sm font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Needs Review {activeReviewIndex >= 0 ? `${activeReviewIndex + 1} of ${needsReviewRows.length}` : 'row'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigateReviewRow('prev')}
                  disabled={!canReviewPrev}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => navigateReviewRow('next')}
                  disabled={!canReviewNext}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Status</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {reviewStatusLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                      Record ID
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {reviewRecordId ?? '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  Original row (key fields)
                </p>
                <div className="mt-3 grid gap-3 text-sm text-slate-700 dark:text-slate-200">
                  {reviewRow
                    ? getOriginalRowFields(reviewRow).map((field) => (
                        <div key={field.label} className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">{field.label}</span>
                          <span className="text-right font-medium text-slate-800 dark:text-slate-100">
                            {field.value}
                          </span>
                        </div>
                      ))
                    : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  Detected address
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {reviewDetectedAddress || '—'}
                </p>
                <p className="mt-3 text-xs uppercase text-slate-500 dark:text-slate-400">
                  Verified address
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {reviewVerifiedAddress || '—'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  Why this happened
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {reviewRow?.reason_code || reviewReason?.label || 'Needs review'}
                </p>
                <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  {reviewOutOfScope ? (
                    <div className="space-y-3">
                      <p>Out of scope for selected location.</p>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500 dark:text-slate-400">Selected</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {selectedLocationSummary || '—'}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-slate-500 dark:text-slate-400">Detected</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {reviewMismatchActual ?? reviewDetectedLocation ?? '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : reviewSkipped ? (
                    <p>P.O. Boxes are skipped because they aren’t physical property addresses.</p>
                  ) : (
                    <p>{reviewRow?.reason_detail || reviewReason?.description || 'Review this row for more context.'}</p>
                  )}
                </div>
              </div>


              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Raw row JSON</p>
                <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
{JSON.stringify(reviewRow?.raw_row ?? {}, null, 2)}</pre>
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                {reviewNeedsReview ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Edit address &amp; retry
                      </p>
                    </div>
                    <div className="mt-3 space-y-2">
                      <label className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        Address
                      </label>
                      <input
                        ref={reviewInputRef}
                        value={reviewAddress}
                        onChange={(event) => {
                          const value = event.target.value;
                          setReviewAddress(value);
                          if (reviewRow) {
                            setReviewDrafts((prev) => ({ ...prev, [reviewRow.source_row_id]: value }));
                          }
                        }}
                        disabled={!canEditReview}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-900/40"
                      />
                      {reviewError ? (
                        <p className="text-xs text-rose-600 dark:text-rose-300">{reviewError}</p>
                      ) : null}
                    </div>
                  </>
                ) : reviewOutOfScope ? (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                    Change location context and re-run.
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    No action available for this row.
                  </div>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeReviewDrawer}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Close
                  </button>
                  {reviewNeedsReview ? (
                    <button
                      type="button"
                      onClick={handleReviewRetry}
                      disabled={!canEditReview || reviewSaving}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-300"
                    >
                      {reviewSaving ? 'Retrying...' : 'Edit & Retry'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
