import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthControls } from '../App';
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
import ExportPanel from '../components/exports/ExportPanel';
import InternalCostPanel from '../components/InternalCostPanel';
import { useToast } from '../components/ui/ToastProvider';
import {
  getReasonMetadata,
  isErrorRow,
  isNeedsReviewRow,
  isOutOfScopeRow,
  isSkippedRow,
  isValidRow,
  stringifyPreview,
  getDisplaySafeMatchedAddress,
  getCompareInputDisplay,
  getApprovalCapabilities,
  getResolverDetails,
  getReviewDebugHint,
  getReviewExplanation,
  getReviewReasonBucket,
  shouldShowOneCandidateBadge,
  type ReviewReasonFilter,
  buildLocalCsvForExport,
  isHeaderOnlyCsv,
  hasHydratedResultsPayload,
  isTemporaryResultsUnavailableError,
} from '../lib/parseUtils';
import { canStartParse, hasValidLocation } from '../lib/parseValidation';
import { groupRows, type GroupedRow } from '../lib/groupRows';
import {
  downloadJobExport,
  getApiErrorInfo,
  getJobExportCatalog,
  getJobDetail,
  getAllJobRows,
  getJobResults,
  getJobWithStatus,
  JobExportType,
  JobRecord,
  parseFile,
  parseFileAsync,
  approveMatchedJobRow,
  approveMatchedJobRowsBatch,
  retryJobBatch,
  retryJobRow,
  retryParseBatch,
  retryParseRow,
  runAiFixFlaggedRows,
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
import { FALLBACK_EXPORT_CATALOG, normalizeExportCatalog } from '../lib/exportCatalog';
import { flattenUsageSummary, mergeUsageSummary } from '../lib/usageSummary';
import JobWarnings from '../components/JobWarnings';
import { deriveDisplayedParseSummary, deriveDisplayedRowsReceived, normalizeJobSummary, normalizeUpdatedJobPayload, toParseSummary } from '../lib/jobSummary';
import { writeLocalParsePersistenceState } from '../lib/persistenceStatus';
import { buildAdminCostSections, buildProductSafeCostItems } from '../lib/costTelemetry';
import { hasLocalOnlyBillingWarning, LOCAL_ONLY_BILLING_WARNING } from '../lib/telemetryWarnings';
import type { ExportCatalogItem } from '../types/exports';
import { publishJobUpdate } from '../lib/liveUpdates';

const PROGRESS_STEPS = ['Uploading', 'Extracting', 'Verifying', 'AI fixing', 'Finalizing'];

const RESULTS_HYDRATION_MAX_ATTEMPTS = 7;
const RESULTS_HYDRATION_BASE_DELAY_MS = 700;
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
  street1?: string;
  address2?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  zip_code?: string;
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

type ReviewTabKey = 'needs_review' | 'out_of_scope' | 'skipped';

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
  const street1 = row.street1 || components?.street_address || components?.street1 || '';
  const street2 = row.street2 || components?.address2 || components?.street2 || '';
  const city = row.city || components?.city || '';
  const state = row.state || components?.state || '';
  const zip = row.zip || components?.zip || (components as any)?.zip_code || '';

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

const CANONICAL_VALID_STATUSES = new Set(['VALID', 'VALID_OVERRIDE']);

const isCanonicalStatusEligible = (row: RowResult) =>
  CANONICAL_VALID_STATUSES.has(normalizeStatus(row.status));

const isRenderableCanonicalAddress = (address: NormalizedCanonicalAddress) => {
  const hasFullAddress = Boolean(address.fullAddress?.trim() || address.formatted_address?.trim());
  const hasStreet = Boolean(address.street1?.trim());
  const hasCity = Boolean(address.city?.trim());
  const hasState = Boolean(address.state?.trim());
  const hasZip = Boolean(address.zip?.trim());
  const hasIdentifier = Boolean(address.place_id?.trim() || address.canonical_id?.trim());
  return hasFullAddress && hasStreet && hasCity && hasState && hasZip && hasIdentifier;
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

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
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


const normalizeNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const formatCurrency = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
};

const formatCount = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toLocaleString() : null;
};

const normalizeStatus = (value?: string) => (value ?? '').toUpperCase();

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
  return toParseSummary(normalizeJobSummary(mergeUsageSummary(record)));
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
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
};

const normalizeComponentText = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value)
    .replace(/\s*,\s*/g, ', ')
    .replace(/^,+|,+$/g, '')
    .trim();
  return normalized.length > 0 ? normalized : undefined;
};

const extractCanonicalComponents = (row: JobRecord): CanonicalAddressComponents | undefined => {
  const fromComponents = toRecord(row.components);
  const fromStandardized =
    toRecord(row.standardized_address_components) ??
    toRecord(row.standardizedAddressComponents) ??
    toRecord(row.standardized_components) ??
    toRecord(row.standardizedComponents);
  const merged = {
    ...(fromComponents ?? {}),
    ...(fromStandardized ?? {}),
    street_address:
      normalizeComponentText((fromComponents ?? {}).street_address) ??
      normalizeComponentText((fromStandardized ?? {}).street_address) ??
      normalizeComponentText((fromStandardized ?? {}).street1) ??
      normalizeComponentText(row.street_address) ??
      normalizeComponentText(row.street1),
    address2:
      normalizeComponentText((fromComponents ?? {}).address2) ??
      normalizeComponentText((fromStandardized ?? {}).address2) ??
      normalizeComponentText((fromStandardized ?? {}).street2) ??
      normalizeComponentText(row.address2) ??
      normalizeComponentText(row.street2),
    city:
      normalizeComponentText((fromComponents ?? {}).city) ??
      normalizeComponentText((fromStandardized ?? {}).city) ??
      normalizeComponentText(row.city),
    state:
      normalizeComponentText((fromComponents ?? {}).state) ??
      normalizeComponentText((fromStandardized ?? {}).state) ??
      normalizeComponentText(row.state),
    zip:
      normalizeComponentText((fromComponents ?? {}).zip) ??
      normalizeComponentText((fromComponents ?? {}).zip_code) ??
      normalizeComponentText((fromStandardized ?? {}).zip) ??
      normalizeComponentText((fromStandardized ?? {}).zip_code) ??
      normalizeComponentText(row.zip) ??
      normalizeComponentText(row.zip_code),
  } as CanonicalAddressComponents;

  if (!Object.values(merged).some((value) => typeof value === 'string' && value.trim().length > 0)) {
    return undefined;
  }

  return merged;
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
      matched_address: pickStringValue(row, ['matched_address', 'matchedAddress']) || undefined,
      place_id: pickStringValue(row, ['place_id', 'placeId']),
      components: extractCanonicalComponents(row),
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
      verification_precision: pickStringValue(row, ['verification_precision', 'verificationPrecision']) || undefined,
      compare_debug: row.compare_debug ?? row.compareDebug ?? undefined,
      blocked_by: (row.blocked_by as string | string[] | undefined) ?? (row.blockedBy as string | string[] | undefined),
      decision_tier: pickStringValue(row, ['decision_tier', 'decisionTier']) || undefined,
      resolver_strategy: pickStringValue(row, ['resolver_strategy', 'resolverStrategy']) || undefined,
      candidate_count_in_scope: normalizeNumber(row.candidate_count_in_scope ?? row.candidateCountInScope) ?? undefined,
      converged_place_ids: Array.isArray(row.converged_place_ids) ? row.converged_place_ids.filter((value): value is string => typeof value === 'string') : Array.isArray(row.convergedPlaceIds) ? row.convergedPlaceIds.filter((value): value is string => typeof value === 'string') : undefined,
      competing_place_ids: Array.isArray(row.competing_place_ids) ? row.competing_place_ids.filter((value): value is string => typeof value === 'string') : Array.isArray(row.competingPlaceIds) ? row.competingPlaceIds.filter((value): value is string => typeof value === 'string') : undefined,
      ambiguity_reason: pickStringValue(row, ['ambiguity_reason', 'ambiguityReason']) || undefined,
      manual_actions: row.manual_actions ?? row.manualActions ?? undefined,
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
    matched_address: pickStringValue(row, ['matched_address', 'matchedAddress']) || undefined,
    address_raw: pickStringValue(row, ['address_raw', 'addressRaw']) || undefined,
    place_id: pickStringValue(row, ['place_id', 'placeId']) || undefined,
    components: extractCanonicalComponents(row),
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
    verification_precision: pickStringValue(row, ['verification_precision', 'verificationPrecision']) || undefined,
    compare_debug: row.compare_debug ?? row.compareDebug ?? undefined,
    blocked_by: (row.blocked_by as string | string[] | undefined) ?? (row.blockedBy as string | string[] | undefined),
    manual_actions: row.manual_actions ?? row.manualActions ?? undefined,
  };
};

const buildDuplicateGroupsFromRows = (rows: RowResult[]) => {
  const groups = new Map<string, DuplicateGroup>();
  rows.forEach((row) => {
    const key =
      row.canonical_id ??
      row.formatted_address ??
      row.matched_address ??
      row.address_raw ??
      row.detected_address ??
      row.source_row_id;
    if (!key) return;
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
    if (!isCanonicalStatusEligible(row)) return;
    const canonicalKey = row.canonical_id || row.place_id;
    if (!canonicalKey || canonicalMap.has(canonicalKey)) return;
    canonicalMap.set(canonicalKey, {
      canonical_id: row.canonical_id ?? canonicalKey,
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

const FINALIZATION_PHASES = new Set(['FINALIZING', 'FINALIZING_RESULTS', 'SAVING_RESULTS']);
const COMPLETED_PHASES = new Set(['DONE', 'COMPLETED', 'SUCCESS']);

const isCompletionLikePhase = (value: string | null) => Boolean(value && COMPLETED_PHASES.has(value));
const isFinalizationLikePhase = (value: string | null) => Boolean(value && FINALIZATION_PHASES.has(value));

const isSummaryReadyProgressState = (phase: string | null, status: string | null, done: number | null, total: number | null) => {
  const atHundredPercent = typeof done === 'number' && typeof total === 'number' && total > 0 && done >= total;
  return atHundredPercent || isFinalizationLikePhase(phase) || isFinalizationLikePhase(status);
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
    case 'AI_FIXING':
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
  if (phase === 'VERIFYING' || phase === 'VALIDATING' || phase === 'PARSING' || phase === 'AI_FIXING') {
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
  const { role } = useAuthControls();
  const isPrivileged = role === 'admin' || role === 'owner';
  const location = useLocation();
  const navigate = useNavigate();
  const [stateValue, setStateValue] = useState('');
  const [countyValue, setCountyValue] = useState('');
  const [cityValue, setCityValue] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [parseTimestamp, setParseTimestamp] = useState<string | null>(null);
  const [rowsReceived, setRowsReceived] = useState<number | null>(null);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);
  const [canonicalAddresses, setCanonicalAddresses] = useState<NormalizedCanonicalAddress[]>([]);
  const [deriveCanonicalsFromRows, setDeriveCanonicalsFromRows] = useState(false);
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
  const [reviewReasonFilter, setReviewReasonFilter] = useState<ReviewReasonFilter>('all');
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(10);
  const [progressStep, setProgressStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultsFinalizing, setResultsFinalizing] = useState(false);
  const [rehydrating, setRehydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [softProgressOutage, setSoftProgressOutage] = useState(false);
  const [persistenceWarningActive, setPersistenceWarningActive] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [editingRow, setEditingRow] = useState<ParsedRow | null>(null);
  const [retryAvailable, setRetryAvailable] = useState<'unknown' | 'available' | 'unavailable'>(
    'unknown',
  );
  const [forceRefresh, setForceRefresh] = useState(false);
  const [legacyMode, setLegacyMode] = useState(false);
  const [isJobReload, setIsJobReload] = useState(false);
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
  const [retryingRowIds, setRetryingRowIds] = useState<Set<string>>(new Set());
  const [approvingRowIds, setApprovingRowIds] = useState<Set<string>>(new Set());
  const [selectedNeedsReviewRowIds, setSelectedNeedsReviewRowIds] = useState<Set<string>>(new Set());
  const [selectedOutOfScopeRowIds, setSelectedOutOfScopeRowIds] = useState<Set<string>>(new Set());
  const [runningAiFixFlaggedRows, setRunningAiFixFlaggedRows] = useState(false);
  const [reviewAutoFocus, setReviewAutoFocus] = useState(false);
  const [pendingReviewNavigation, setPendingReviewNavigation] = useState<{
    tab: ReviewTabKey;
    groupKey: string | null;
  } | null>(null);
  const [activeDownloadType, setActiveDownloadType] = useState<JobExportType | null>(null);
  const [exportCatalog, setExportCatalog] = useState<ExportCatalogItem[]>(FALLBACK_EXPORT_CATALOG);
  const [downloadSuccessLabel, setDownloadSuccessLabel] = useState<string | null>(null);
  const [progressInfo, setProgressInfo] = useState<{
    phase: string | null;
    done: number | null;
    total: number | null;
    detail: string | null;
    cacheHits: number | null;
    googleCallsUsed: number | null;
    eta: string | null;
    unavailableReason: string | null;
  }>({
    phase: null,
    done: null,
    total: null,
    detail: null,
    cacheHits: null,
    googleCallsUsed: null,
    eta: null,
    unavailableReason: null,
  });
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<number | null>(null);
  const pollingInFlightRef = useRef(false);
  const summaryHydrationPromiseRef = useRef<Promise<ParseSummary | null> | null>(null);
  const resultsHydrationPromiseRef = useRef<Promise<boolean> | null>(null);
  const busyRef = useRef(busy);
  const progressSamplesRef = useRef<{ timestamp: number; done: number; total: number }[]>([]);
  const etaSecondsRef = useRef<number | null>(null);
  const activeProgressJobIdRef = useRef<string | null>(null);
  const resetInProgressRef = useRef(false);
  const reviewInputRef = useRef<HTMLInputElement | null>(null);
  const downloadSuccessTimerRef = useRef<number | null>(null);
  const rowResultsRef = useRef<RowResult[]>([]);
  const parseSummaryRef = useRef<ParseSummary | null>(null);

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
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    rowResultsRef.current = rowResults;
  }, [rowResults]);

  useEffect(() => {
    parseSummaryRef.current = parseSummary;
  }, [parseSummary]);

  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      pollingInFlightRef.current = false;
      summaryHydrationPromiseRef.current = null;
      resultsHydrationPromiseRef.current = null;
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

  const resetParseUi = useCallback(
    (options?: { showMissingJobToast?: boolean }) => {
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
      setIsJobReload(false);
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
        detail: null,
        cacheHits: null,
        googleCallsUsed: null,
        eta: null,
      });
      setError(null);
      setPollError(null);
      setPollErrorCount(0);
      setSoftProgressOutage(false);
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
      setEditingRow(null);
      setRetryAvailable('unknown');
      setRetryingRowIds(new Set());
      setApprovingRowIds(new Set());
      setSelectedNeedsReviewRowIds(new Set());
      setSelectedOutOfScopeRowIds(new Set());
      setRunningAiFixFlaggedRows(false);
      setPendingReviewNavigation(null);
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
      setResultsFinalizing(false);
      setRehydrating(false);
      progressSamplesRef.current = [];
      if (options?.showMissingJobToast) {
        showToast({
          title: 'Previous job not found — starting fresh',
          variant: 'info',
        });
      }
    },
    [clearJobQueryParam, showToast],
  );

  const loadJobResults = useCallback(
    async (
      jobIdToLoad: string,
      storedState: PersistedLastJobState | null,
      options?: { fresh?: boolean; syncUrlOnSuccess?: boolean },
    ) => {
      setRehydrating(true);
      setError(null);
      setPollError(null);
      setPollErrorCount(0);
      try {
        const [jobDetail, resultsResponse] = await Promise.all([
          getJobDetail(jobIdToLoad),
          getJobResults(jobIdToLoad, { fresh: options?.fresh }).catch(() => null),
        ]);
        const combinedJob: JobRecord = {
          ...(jobDetail.summary ?? {}),
          ...(resultsResponse?.summary ?? {}),
          ...(jobDetail.job ?? {}),
        };
        let normalizedRows: RowResult[] = [];
        if (resultsResponse?.row_results && Array.isArray(resultsResponse.row_results)) {
          normalizedRows = (resultsResponse.row_results as RowResult[]).map((row, index) =>
            normalizeJobRowResult(row as unknown as JobRecord, index),
          );
        } else {
          const jobRows = await getAllJobRows(jobIdToLoad);
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
        setIsJobReload(true);
        setFile(null);
        setFileId(pickString(combinedJob, ['file_id', 'fileId', 'fileID', 'file']));
        if (storedState) {
          setStateValue(storedState.stateValue);
          setCountyValue(storedState.countyValue);
          setCityValue(storedState.cityValue);
          setCampaignName(storedState.campaignName);
        }
        setParseTimestamp(createdAt);
        const displayedSummary = deriveDisplayedParseSummary(normalizedRows, summary);
        setRowsReceived(deriveDisplayedRowsReceived(normalizedRows, displayedSummary));
        setParseSummary(displayedSummary);
        const backendCanonicalRows =
          resultsResponse &&
          Array.isArray((resultsResponse as { canonical_addresses?: unknown }).canonical_addresses)
            ? ((resultsResponse as { canonical_addresses?: CanonicalAddress[] }).canonical_addresses ?? [])
            : null;
        if (backendCanonicalRows) {
          setCanonicalAddresses(backendCanonicalRows.map(normalizeCanonicalAddress));
          setDeriveCanonicalsFromRows(false);
        } else {
          setCanonicalAddresses(buildCanonicalAddressesFromRows(normalizedRows));
          setDeriveCanonicalsFromRows(true);
        }
        setRowResults(normalizedRows);
        setDuplicateGroups(buildDuplicateGroupsFromRows(normalizedRows));
        setDebugInfo((combinedJob.debug as ParseDebugInfo | null) ?? null);
        setLegacyMatchedRows([]);
        setLegacyUnmatchedRows([]);
        setMetadata(Object.keys(combinedJob).length ? (combinedJob as Record<string, unknown>) : null);
        setLegacyMode(false);
        setResultsFinalizing(false);
        setPersistenceWarningActive(false);
        writeLocalParsePersistenceState({ jobId: jobIdToLoad, persistenceWarning: false });
        setActiveTab('valid');
        setLegacyTab('matched');
        setShowRaw(false);
        setShowDebugMode(false);
        setParsePayload(null);
        setProgressStep(4);
        setProgressPercent(100);
        setProgressInfo({
          phase: 'DONE',
          done: deriveDisplayedRowsReceived(normalizedRows, displayedSummary),
          total: deriveDisplayedRowsReceived(normalizedRows, displayedSummary),
          detail: null,
          cacheHits: cacheHitsValue,
          googleCallsUsed: googleCallsValue,
          eta: null,
        });
        if (options?.syncUrlOnSuccess) {
          updateJobQueryParam(jobIdToLoad);
        }
      } catch (err) {
        const errorInfo = getApiErrorInfo(err);
        if (errorInfo?.status === 404) {
          resetParseUi({ showMissingJobToast: true });
          return;
        }
        setError((err as Error).message ?? 'Unable to load job results.');
      } finally {
        setRehydrating(false);
        setResultsFinalizing(false);
      }
    },
    [resetParseUi, updateJobQueryParam],
  );

  useEffect(() => {
    if (deriveCanonicalsFromRows) {
      setCanonicalAddresses(buildCanonicalAddressesFromRows(rowResults));
    }
    setDuplicateGroups(buildDuplicateGroupsFromRows(rowResults));
  }, [deriveCanonicalsFromRows, rowResults]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const jobParam = params.get('job');
    const stored = readLastJobState();
    const resolvedJobId = jobParam ?? stored?.jobId ?? null;
    if (!resolvedJobId || busy || rehydrating || resetInProgressRef.current) return;
    if (jobId === resolvedJobId && parseSummary) return;
    void loadJobResults(resolvedJobId, stored ?? null, {
      syncUrlOnSuccess: !jobParam && Boolean(stored?.jobId),
    });
  }, [busy, jobId, loadJobResults, location.search, parseSummary, rehydrating]);

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
      return warnings as Array<string | { code?: string; message?: string; detail?: unknown }>;
    }
    if (typeof warnings === 'string' && warnings.trim()) {
      return [warnings.trim()];
    }
    return [];
  }, [metadata]);

  const needsReviewRows = useMemo(
    () => rowResults.filter((row) => normalizeStatus(row.status) === 'UNMATCHED_NEEDS_REVIEW'),
    [rowResults],
  );
  const skippedRows = useMemo(
    () => rowResults.filter((row) => normalizeStatus(row.status).startsWith('SKIPPED')),
    [rowResults],
  );
  const outOfScopeRows = useMemo(
    () => rowResults.filter((row) => normalizeStatus(row.status).startsWith('OUT_OF_SCOPE')),
    [rowResults],
  );
  const needsReviewGroups = useMemo(() => groupRows(needsReviewRows), [needsReviewRows]);
  const filteredNeedsReviewGroups = useMemo(() => {
    if (reviewReasonFilter === 'all') return needsReviewGroups;
    return needsReviewGroups.filter((group) => getReviewReasonBucket(group.displayRow) === reviewReasonFilter);
  }, [needsReviewGroups, reviewReasonFilter]);
  const reviewBreakdown = useMemo(() => {
    const buckets = {
      route_alias: 0,
      missing_street_number: 0,
      house_number: 0,
      county_rescue: 0,
      low_precision: 0,
      other: 0,
    };
    needsReviewGroups.forEach((group) => {
      const bucket = getReviewReasonBucket(group.displayRow);
      if (bucket === 'all') buckets.other += group.count;
      else (buckets as Record<string, number>)[bucket] += group.count;
    });
    return buckets;
  }, [needsReviewGroups]);
  const outOfScopeGroups = useMemo(() => groupRows(outOfScopeRows), [outOfScopeRows]);
  const duplicateRowGroups = useMemo(
    () => groupRows(rowResults).filter((group) => group.count > 1),
    [rowResults],
  );
  const outOfScopeCityRowsCount = useMemo(
    () =>
      outOfScopeRows.filter((row) =>
        (row.reason_code || '').toUpperCase().includes('OUT_OF_SCOPE_CITY'),
      ).length,
    [outOfScopeRows],
  );
  const canRerunWithoutCityFilter = Boolean(cityValue) && outOfScopeCityRowsCount > 0;
  const errorRows = useMemo(() => rowResults.filter(isErrorRow), [rowResults]);

  const computedParseSummary = useMemo(
    () => deriveDisplayedParseSummary(rowResults, parseSummary),
    [parseSummary, rowResults],
  );

  const usageSummary = useMemo(
    () =>
      flattenUsageSummary({
        ...((((parsePayload as { summary?: Record<string, unknown> } | null)?.summary ?? {}) as Record<string, unknown>)),
        ...(((parseSummary ?? {}) as Record<string, unknown>)),
        ...(((computedParseSummary ?? {}) as Record<string, unknown>)),
      }),
    [computedParseSummary, parsePayload, parseSummary],
  );

  const costPanelSections = useMemo(
    () =>
      isPrivileged
        ? buildAdminCostSections({
            usage: usageSummary,
            estimatedJobCost: computedParseSummary?.spend_usd,
            estimatedMonthlyTotal: computedParseSummary?.estimated_monthly_cost_usd,
            jobGeocodingCalls: computedParseSummary?.job_geocoding_calls ?? googleCallsUsed,
          })
        : undefined,
    [computedParseSummary, googleCallsUsed, isPrivileged, usageSummary],
  );

  const showLocalOnlyBillingWarning = useMemo(
    () => hasLocalOnlyBillingWarning(usageSummary),
    [usageSummary],
  );

  const costPanelItems = useMemo(
    () => buildProductSafeCostItems({ usage: usageSummary, estimatedJobCost: computedParseSummary?.spend_usd }),
    [computedParseSummary?.spend_usd, usageSummary],
  );

  const canonicalAddressesForDisplay = useMemo(
    () => canonicalAddresses.filter(isRenderableCanonicalAddress),
    [canonicalAddresses],
  );

  const zeroStateHydrationPending = useMemo(() => {
    if (!parseSummary) return false;
    if (resultsFinalizing) return true;
    return parseSummary.rows_received > 0 && rowResults.length === 0 && canonicalAddressesForDisplay.length === 0;
  }, [canonicalAddressesForDisplay.length, parseSummary, resultsFinalizing, rowResults.length]);

  const noAddressesDetected = useMemo(() => {
    if (zeroStateHydrationPending) return false;
    if (debugInfo?.no_addresses_detected === true) return true;
    if (!parseSummary) return false;
    return (
      parseSummary.rows_received > 0 &&
      parseSummary.valid_total === 0 &&
      parseSummary.needs_review === 0
    );
  }, [debugInfo?.no_addresses_detected, parseSummary, zeroStateHydrationPending]);



  useEffect(() => {
    setResultsPage(1);
  }, [activeTab, legacyTab, resultsPageSize, parseSummary]);

  const totalResultsForActiveTab = useMemo(() => {
    if (!parseSummary) return 0;
    switch (activeTab) {
      case 'valid':
        return canonicalAddressesForDisplay.length;
      case 'needs_review':
        return filteredNeedsReviewGroups.length;
      case 'skipped':
        return skippedRows.length;
      case 'out_of_scope':
        return outOfScopeGroups.length;
      case 'duplicates':
        return duplicateRowGroups.length;
      default:
        return 0;
    }
  }, [
    activeTab,
    canonicalAddressesForDisplay.length,
    duplicateRowGroups.length,
    filteredNeedsReviewGroups.length,
    outOfScopeGroups.length,
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
    () => paginateRows(canonicalAddressesForDisplay),
    [canonicalAddressesForDisplay, paginateRows],
  );
  const paginatedNeedsReviewGroups = useMemo(
    () => paginateRows(filteredNeedsReviewGroups),
    [filteredNeedsReviewGroups, paginateRows],
  );
  const rowResultsById = useMemo(() => {
    const map = new Map<string, RowResult>();
    rowResults.forEach((row) => map.set(row.source_row_id, row));
    return map;
  }, [rowResults]);
  const getGroupApprovalCapabilities = useCallback(
    (group: GroupedRow) => {
      const memberRows = group.memberRowIds
        .map((rowId) => rowResultsById.get(rowId))
        .filter((member): member is RowResult => Boolean(member));
      const capabilities = memberRows.map((member) => getApprovalCapabilities(member));
      const canApproveMatched =
        capabilities.length > 0 && capabilities.every((capability) => capability.canApproveMatched);
      const canApproveWithScopeOverride =
        capabilities.length > 0 && capabilities.every((capability) => capability.canApproveWithScopeOverride);
      const canForceOverride =
        capabilities.length > 0 && capabilities.every((capability) => capability.canForceOverride);
      const blocker =
        capabilities.find(
          (capability) =>
            !capability.canApproveMatched &&
            !capability.canApproveWithScopeOverride &&
            !capability.canForceOverride,
        )?.blocker ?? null;
      return { canApproveMatched, canApproveWithScopeOverride, canForceOverride, blocker };
    },
    [rowResultsById],
  );
  const allNeedsReviewRowIds = useMemo(
    () =>
      filteredNeedsReviewGroups.flatMap((group) =>
        getGroupApprovalCapabilities(group).canApproveMatched ? group.memberRowIds : [],
      ),
    [filteredNeedsReviewGroups, getGroupApprovalCapabilities],
  );
  const allNeedsReviewSelected =
    allNeedsReviewRowIds.length > 0 &&
    allNeedsReviewRowIds.every((rowId) => selectedNeedsReviewRowIds.has(rowId));
  const selectedNeedsReviewCount = selectedNeedsReviewRowIds.size;
  const paginatedSkippedRows = useMemo(
    () => paginateRows(skippedRows),
    [paginateRows, skippedRows],
  );
  const paginatedOutOfScopeGroups = useMemo(
    () => paginateRows(outOfScopeGroups),
    [outOfScopeGroups, paginateRows],
  );
  const allOutOfScopeRowIds = useMemo(
    () =>
      outOfScopeGroups.flatMap((group) =>
        getGroupApprovalCapabilities(group).canApproveWithScopeOverride ? group.memberRowIds : [],
      ),
    [getGroupApprovalCapabilities, outOfScopeGroups],
  );
  const allOutOfScopeSelected =
    allOutOfScopeRowIds.length > 0 &&
    allOutOfScopeRowIds.every((rowId) => selectedOutOfScopeRowIds.has(rowId));
  const selectedOutOfScopeCount = selectedOutOfScopeRowIds.size;
  const paginatedDuplicateRowGroups = useMemo(
    () => paginateRows(duplicateRowGroups),
    [duplicateRowGroups, paginateRows],
  );

  useEffect(() => {
    const validIds = new Set(allNeedsReviewRowIds);
    setSelectedNeedsReviewRowIds((prev) => {
      if (prev.size === 0) return prev;
      const filtered = Array.from(prev).filter((rowId) => validIds.has(rowId));
      if (filtered.length === prev.size) return prev;
      return new Set(filtered);
    });
  }, [allNeedsReviewRowIds]);

  useEffect(() => {
    const validIds = new Set(allOutOfScopeRowIds);
    setSelectedOutOfScopeRowIds((prev) => {
      if (prev.size === 0) return prev;
      const filtered = Array.from(prev).filter((rowId) => validIds.has(rowId));
      if (filtered.length === prev.size) return prev;
      return new Set(filtered);
    });
  }, [allOutOfScopeRowIds]);

  const rowAccountingMismatch = useMemo(() => {
    if (!parseSummary || resultsFinalizing) return false;
    const responseRows =
      (metadata?.rows_received as number) ||
      (metadata?.rowsReceived as number) ||
      parseSummary.rows_received;
    return rowResults.length !== responseRows;
  }, [metadata, parseSummary, resultsFinalizing, rowResults.length]);

  const accountedRowsFromSummary = useMemo(() => {
    const accountedRows =
      (metadata?.accounted_rows as number) || (metadata?.accountedRows as number);
    if (typeof accountedRows === 'number') return accountedRows;
    if (!computedParseSummary) return null;
    return (
      computedParseSummary.valid_total +
      computedParseSummary.needs_review +
      computedParseSummary.skipped +
      (computedParseSummary.out_of_scope ?? 0)
    );
  }, [computedParseSummary, metadata]);

  const responseRowsReceived = useMemo(
    () => deriveDisplayedRowsReceived(rowResults, computedParseSummary),
    [computedParseSummary, rowResults],
  );

  const isStartingParse = busy && progressInfo.phase === null;
  const parseLifecycleStatus = useMemo(() => {
    if (busy) return 'Running…';
    if (resultsFinalizing) return 'Finalizing results…';
    if (parseSummary) return 'Ready';
    return null;
  }, [busy, parseSummary, resultsFinalizing]);

  const progressDetail = useMemo(() => {
    if (isStartingParse) {
      return 'Job running…';
    }
    if (softProgressOutage && busy) {
      return progressInfo.unavailableReason || 'Processing is still running. Live progress will appear when available.';
    }
    const done = progressInfo.done;
    const total = progressInfo.total;
    const backendDetail = progressInfo.detail;
    const cacheHitsValue = progressInfo.cacheHits;
    const googleCallsValue = progressInfo.googleCallsUsed;
    if (
      done === null &&
      total === null &&
      !backendDetail &&
      cacheHitsValue === null &&
      googleCallsValue === null &&
      !progressInfo.eta
    ) {
      return null;
    }
    const phaseLabel = progressInfo.phase === 'AI_FIXING' ? 'AI fixing' : progressInfo.phase === 'VERIFYING' || progressInfo.phase === 'VALIDATING' ? 'Verifying' : progressInfo.phase === 'EXTRACTING' ? 'Extracting' : progressInfo.phase === 'UPLOADING' ? 'Uploading' : progressInfo.phase === 'DONE' ? 'Finalizing' : 'Processing';
    const baseDetail = `${phaseLabel}: ${done ?? '--'}/${total ?? '--'} • Verification calls ${
      googleCallsValue ?? '--'
    } • Cache hits ${cacheHitsValue ?? '--'}`;
    const detailText = backendDetail || baseDetail;
    const hasReliableEta = Boolean(progressInfo.eta && progressInfo.eta !== '00:00' && progressInfo.phase !== 'DONE');
    return hasReliableEta ? `${detailText} • ETA ~ ${progressInfo.eta}` : detailText;
  }, [busy, isStartingParse, progressInfo, softProgressOutage]);

  const shouldShowProgress = useMemo(
    () => busy || resultsFinalizing || progressInfo.phase !== null || progressPercent !== null || parseSummary !== null,
    [busy, parseSummary, progressInfo.phase, progressPercent, resultsFinalizing],
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

  const getSkippedOriginalAddress = (row: RowResult) => {
    const inputAddress = getInputAddress(row).trim();
    return inputAddress ? inputAddress : '(blank)';
  };

  const getMatchedAddress = (row: RowResult) => {
    const rowRecord = row as Record<string, unknown>;
    const verificationRecord =
      rowRecord.verification && typeof rowRecord.verification === 'object'
        ? (rowRecord.verification as Record<string, unknown>)
        : null;
    const googleDisplayAddress = verificationRecord?.google_display_address;
    if (typeof googleDisplayAddress === 'string' && googleDisplayAddress.trim()) {
      return googleDisplayAddress.trim();
    }
    const googleFormattedAddress = verificationRecord?.google_formatted_address;
    if (typeof googleFormattedAddress === 'string' && googleFormattedAddress.trim()) {
      return googleFormattedAddress.trim();
    }
    return getDisplaySafeMatchedAddress(row);
  };

  const getScopeDebugGroup = (scopeDebug: unknown, key: 'selected' | 'matched') => {
    if (!scopeDebug || typeof scopeDebug !== 'object') return null;
    const scopeRecord = scopeDebug as Record<string, unknown>;
    const direct = scopeRecord[key];
    if (direct && typeof direct === 'object') {
      return direct as Record<string, unknown>;
    }
    const camel = scopeRecord[`${key}Scope`];
    if (camel && typeof camel === 'object') {
      return camel as Record<string, unknown>;
    }
    const snake = scopeRecord[`${key}_scope`];
    if (snake && typeof snake === 'object') {
      return snake as Record<string, unknown>;
    }
    return null;
  };

  const getScopeDebugValue = (
    row: RowResult,
    group: 'selected' | 'matched',
    field: 'state' | 'county' | 'city',
  ) => {
    const scopeGroup = getScopeDebugGroup(row.scope_debug, group);
    const direct = (row.scope_debug as Record<string, unknown> | undefined)?.[`${group}_${field}`];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    if (!scopeGroup) return '';
    const candidate = scopeGroup[field];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    return '';
  };

  const parseComponentsRecord = (components: unknown) => {
    if (!components) return null;
    if (typeof components === 'string') {
      try {
        const parsed = JSON.parse(components) as unknown;
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
      return null;
    }
    if (typeof components === 'object') {
      return components as Record<string, unknown>;
    }
    return null;
  };

  const getMatchedCounty = (row: RowResult) => {
    const scopeCounty = getScopeDebugValue(row, 'matched', 'county');
    if (scopeCounty) return scopeCounty;
    const componentsRecord = parseComponentsRecord(row.components);
    if (!componentsRecord) return '';
    const countyValue = componentsRecord.administrative_area_level_2;
    if (typeof countyValue === 'string') return countyValue;
    if (countyValue && typeof countyValue === 'object') {
      const countyRecord = countyValue as Record<string, unknown>;
      if (typeof countyRecord.long_name === 'string') return countyRecord.long_name;
      if (typeof countyRecord.short_name === 'string') return countyRecord.short_name;
      if (typeof countyRecord.name === 'string') return countyRecord.name;
    }
    return '';
  };

  const getMatchedCity = (row: RowResult) => {
    const scopeCity = getScopeDebugValue(row, 'matched', 'city');
    if (scopeCity) return scopeCity;
    const componentsRecord = parseComponentsRecord(row.components);
    if (!componentsRecord) return '';
    const cityCandidates = [
      componentsRecord.locality,
      componentsRecord.postal_town,
      componentsRecord.sublocality,
      componentsRecord.sublocality_level_1,
      componentsRecord.neighborhood,
      componentsRecord.administrative_area_level_3,
    ];

    for (const candidate of cityCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (candidate && typeof candidate === 'object') {
        const cityRecord = candidate as Record<string, unknown>;
        if (typeof cityRecord.long_name === 'string' && cityRecord.long_name.trim()) {
          return cityRecord.long_name.trim();
        }
        if (typeof cityRecord.short_name === 'string' && cityRecord.short_name.trim()) {
          return cityRecord.short_name.trim();
        }
        if (typeof cityRecord.name === 'string' && cityRecord.name.trim()) {
          return cityRecord.name.trim();
        }
      }
    }

    return '';
  };

  const getReasonSummary = (row: RowResult) => {
    if (row.public_reason_message?.trim()) return row.public_reason_message.trim();
    const reasonCode = row.reason_code?.toLowerCase() ?? '';
    const summaryByReason: Record<string, string> = {
      out_of_scope: 'The matched location falls outside your selected area.',
      city_mismatch: 'This record appears outside your selected area.',
      county_mismatch: 'This record appears outside your selected area.',
      state_mismatch: 'This record appears outside your selected area.',
      no_match: 'We could not confidently verify this as a complete property address.',
      low_confidence: 'The verifier returned a low-confidence result and needs your review.',
      po_box: 'This row was skipped because it appears to be a PO Box, not a property address.',
      missing_address: 'This row was skipped because no usable address was detected.',
      blank_address: 'This row was skipped because no usable address was detected.',
    };
    return summaryByReason[reasonCode] || getReasonMetadata(row).description;
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


  const tokenize = (value: string) =>
    value
      .split(/(\s+)/)
      .filter((token) => token.length > 0);

  const renderTokenDiff = (original: string, matched: string) => {
    const originalTokens = tokenize(original);
    const matchedTokens = tokenize(matched);
    const matchedSet = new Set(matchedTokens.map((token) => token.toLowerCase().trim()));
    const originalSet = new Set(originalTokens.map((token) => token.toLowerCase().trim()));

    return (
      <div className="space-y-2">
        <div className="text-xs uppercase text-slate-500 dark:text-slate-400">Original</div>
        <p className="text-sm">
          {originalTokens.map((token, index) => {
            const key = `orig-${index}-${token}`;
            const trimmed = token.trim().toLowerCase();
            const changed = trimmed.length > 0 && !matchedSet.has(trimmed);
            return (
              <span key={key} className={changed ? 'rounded bg-rose-100 px-0.5 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200' : ''}>
                {token}
              </span>
            );
          })}
        </p>
        <div className="text-xs uppercase text-slate-500 dark:text-slate-400">Matched</div>
        <p className="text-sm">
          {matchedTokens.map((token, index) => {
            const key = `match-${index}-${token}`;
            const trimmed = token.trim().toLowerCase();
            const changed = trimmed.length > 0 && !originalSet.has(trimmed);
            return (
              <span key={key} className={changed ? 'rounded bg-emerald-100 px-0.5 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' : ''}>
                {token}
              </span>
            );
          })}
        </p>
      </div>
    );
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
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
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
    if (row.public_action_hint?.trim()) return row.public_action_hint.trim();
    if (isOutOfScopeRow(row) && showDebugMode && row.scope_debug) {
      const scopeDetail = formatOutOfScopeDetail(row.scope_debug);
      if (scopeDetail) return scopeDetail;
    }
    return row.reason_detail ? humanizeReasonDetail(row.reason_detail) : '';
  };

  const renderReasonCell = (row: RowResult) => {
    const { label, description, fix_hint: fixHint } = getReasonMetadata(row);
    const explanation = getReviewExplanation(row);
    const reasonCode = row.reason_code?.trim();
    const normalizedReasonCode = reasonCode?.toUpperCase() ?? '';
    const isMarkerVerificationFailure =
      normalizedReasonCode === 'OUT_OF_SCOPE_MARKER_VERIFICATION_FAILED';
    const tooltip = `${description}${fixHint ? `
How to fix: ${fixHint}` : ''}`;
    const detailText = getReasonDetailText(row);
    const debugHint = getReviewDebugHint(row);
    const resolverDetails = getResolverDetails(row);
    const markerFailureSecondaryText =
      isMarkerVerificationFailure &&
      detailText &&
      !detailText.toLowerCase().includes('no plausible candidate found')
        ? 'Verification failed; no plausible candidate found.'
        : '';
    return (
      <div className="space-y-1">
        <span
          className="font-medium text-slate-700 underline decoration-dotted decoration-slate-300 underline-offset-4 dark:text-slate-200 dark:decoration-slate-600"
          title={tooltip}
        >
          {explanation || label}
        </span>
        {shouldShowOneCandidateBadge(row) ? (
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            One candidate found
          </span>
        ) : null}
        {isMarkerVerificationFailure && detailText ? (
          <div
            className="text-sm font-semibold text-rose-700 dark:text-rose-300"
            title={markerFailureSecondaryText || undefined}
          >
            {detailText}
          </div>
        ) : null}
        {markerFailureSecondaryText ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">{markerFailureSecondaryText}</div>
        ) : null}
        {!isMarkerVerificationFailure && detailText ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {detailText}
          </div>
        ) : null}
        {debugHint ? (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{debugHint}</p>
        ) : null}
        {showDebugMode && reasonCode ? (
          <div className="text-xs text-slate-400 dark:text-slate-500">{reasonCode}</div>
        ) : null}
        {resolverDetails.length ? (
          <details className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-[11px] text-slate-600 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-300">
            <summary className="cursor-pointer list-none font-medium text-slate-600 marker:hidden dark:text-slate-200">Internal diagnostics</summary>
            <div className="mt-2 grid gap-1.5">
              {resolverDetails.map((detail) => (
                <div key={`${detail.label}-${detail.value}`} className="flex flex-wrap gap-1">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">{detail.label}:</span>
                  <span>{detail.value}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    );
  };

  const renderOriginalAddressCell = (row: RowResult) => {
    const compareInput = getCompareInputDisplay(row);
    return (
      <div className="space-y-1">
        <div className="font-medium text-slate-700 dark:text-slate-200">
          {compareInput.original || '--'}
        </div>
        {compareInput.showNormalized ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Compared as:</span>{' '}
            {compareInput.normalized}
          </div>
        ) : null}
      </div>
    );
  };

  const mergeUpdatedRows = useCallback((currentRows: RowResult[], updatedRows: RowResult[]) => {
    if (!updatedRows.length) return currentRows;
    const updates = new Map<string, RowResult>();
    updatedRows.forEach((row) => {
      const id = getRowIdentifier(row as Record<string, unknown>);
      if (id) updates.set(id, row);
    });
    if (!updates.size) return currentRows;
    const nextRows = currentRows.map((row) => {
      const id = getRowIdentifier(row as Record<string, unknown>);
      if (!id || !updates.has(id)) return row;
      return { ...row, ...(updates.get(id) as RowResult) };
    });
    const existingIds = new Set(
      nextRows
        .map((row) => getRowIdentifier(row as Record<string, unknown>))
        .filter((value): value is string => Boolean(value)),
    );
    const appendedRows = updatedRows.filter((row) => {
      const id = getRowIdentifier(row as Record<string, unknown>);
      return Boolean(id && !existingIds.has(id));
    });
    return appendedRows.length ? [...nextRows, ...appendedRows] : nextRows;
  }, []);

  const queueReviewNavigation = useCallback((tab: ReviewTabKey, groupKey: string | null) => {
    setPendingReviewNavigation(groupKey ? { tab, groupKey } : null);
  }, []);

  const renderApprovalAction = (row: RowResult, outOfScopeOverride: boolean) => {
    const capabilities = getApprovalCapabilities(row);
    const canApprove = outOfScopeOverride
      ? capabilities.canApproveWithScopeOverride
      : capabilities.canApproveMatched;
    const isApproving = approvingRowIds.has(row.source_row_id);
    if (!canApprove && capabilities.canForceOverride) {
      return (
        <button
          type="button"
          onClick={() => void handleForceOverride(row)}
          disabled={isApproving}
          className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
        >
          {isApproving ? '⏳ Overriding…' : 'Override to Valid'}
        </button>
      );
    }
    if (!canApprove) {
      return (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <div className="font-semibold text-slate-600 dark:text-slate-200">Approval unavailable</div>
          <div className="mt-0.5">{capabilities.blocker ?? 'Manual approval is not safe for this review case.'}</div>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => void handleApproveMatched(row, outOfScopeOverride)}
        disabled={isApproving}
        className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
      >
        {isApproving ? '⏳ Approving…' : 'Approve matched'}
      </button>
    );
  };


  const findGroupForRow = (groups: GroupedRow[], row: RowResult) =>
    groups.find((group) => group.memberRowIds.includes(row.source_row_id)) ?? null;

  const activeReviewGroups =
    activeTab === 'out_of_scope'
      ? outOfScopeGroups
      : activeTab === 'skipped'
        ? groupRows(skippedRows)
        : needsReviewGroups;
  const activeReviewGroup = reviewRow ? findGroupForRow(activeReviewGroups, reviewRow) : null;

  const openReviewDrawer = (row: RowResult, focusEdit = false) => {
    const group = findGroupForRow(activeReviewGroups, row);
    const displayRow = group?.displayRow ?? row;
    const draft = reviewDrafts[displayRow.source_row_id];
    setReviewRow(displayRow);
    setReviewAddress(draft ?? getInputAddress(displayRow));
    setReviewError(null);
    setReviewAutoFocus(focusEdit);
  };

  const closeReviewDrawer = () => {
    setReviewRow(null);
    setReviewError(null);
    setReviewSaving(false);
  };

  useEffect(() => {
    if (!pendingReviewNavigation || reviewRow) return;
    if (activeTab !== pendingReviewNavigation.tab) return;
    const targetGroups =
      pendingReviewNavigation.tab === 'out_of_scope'
        ? outOfScopeGroups
        : pendingReviewNavigation.tab === 'skipped'
          ? groupRows(skippedRows)
          : needsReviewGroups;
    const targetGroup = targetGroups.find((group) => group.groupKey === pendingReviewNavigation.groupKey);
    setPendingReviewNavigation(null);
    if (targetGroup) {
      openReviewDrawer(targetGroup.displayRow);
    }
  }, [activeTab, needsReviewGroups, outOfScopeGroups, pendingReviewNavigation, reviewRow, skippedRows]);

  const getGroupMemberRows = (row: RowResult) => {
    const group = findGroupForRow(activeReviewGroups, row);
    if (!group) return [row];
    const members = group.memberRowIds
      .map((rowId) => rowResultsById.get(rowId))
      .filter((member): member is RowResult => Boolean(member));
    return members.length ? members : [row];
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
    () =>
      reviewRow && activeReviewGroup
        ? activeReviewGroups.findIndex((group) => group.groupKey === activeReviewGroup.groupKey)
        : -1,
    [activeReviewGroup, activeReviewGroups, reviewRow],
  );
  const canReviewPrev = activeReviewIndex > 0;
  const canReviewNext = activeReviewIndex > -1 && activeReviewIndex < activeReviewGroups.length - 1;

  const navigateReviewRow = useCallback(
    (direction: 'prev' | 'next') => {
      if (!reviewRow) return;
      if (direction === 'prev' && !canReviewPrev) return;
      if (direction === 'next' && !canReviewNext) return;
      const delta = direction === 'next' ? 1 : -1;
      const target = activeReviewGroups[activeReviewIndex + delta];
      if (target) {
        openReviewDrawer(target.displayRow);
      }
    },
    [activeReviewGroups, activeReviewIndex, canReviewNext, canReviewPrev, reviewRow],
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

  const handleCopyDebugInfo = async () => {
    const debugText = [
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

    try {
      await copyTextToClipboard(debugText);
      showToast({ title: 'Copied', variant: 'success' });
    } catch {
      showToast({ title: 'Unable to copy debug info', variant: 'error' });
    }
  };

  const stopPolling = () => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingInFlightRef.current = false;
  };

  const isSoftProgressStatus = (status?: number) => status === 404 || status === 503;

  const reconcileDurableJob = useCallback(
    async (completedJobId: string, attempts = 4) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const detail = await getJobDetail(completedJobId);
          const results = await getJobResults(completedJobId).catch(() => null);
          const hasDurableDetail = Boolean(detail?.job && Object.keys(detail.job).length);
          const hasRows = Boolean(results?.row_results && results.row_results.length > 0);
          if (hasDurableDetail || hasRows) {
            setPersistenceWarningActive(false);
            writeLocalParsePersistenceState({ jobId: completedJobId, persistenceWarning: false });
            await loadJobResults(
              completedJobId,
              {
                version: LAST_JOB_STORAGE_VERSION,
                jobId: completedJobId,
                stateValue,
                countyValue,
                cityValue,
                campaignName,
              },
              { fresh: true },
            );
            return;
          }
        } catch {
          // keep retrying in background
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200 * (attempt + 1)));
      }
      setPersistenceWarningActive(true);
      writeLocalParsePersistenceState({ jobId: completedJobId, persistenceWarning: true });
    },
    [campaignName, cityValue, countyValue, loadJobResults, stateValue],
  );

  const startPolling = (jobIdToWatch: string, options?: { onFinished?: () => Promise<void> | void }) => {
    stopPolling();
    activeProgressJobIdRef.current = jobIdToWatch;
    progressSamplesRef.current = [];
    etaSecondsRef.current = null;

    const runPoll = async () => {
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const { job } = await getJobWithStatus(jobIdToWatch);
        const phase = normalizePhase(job.phase);
        const status = normalizePhase(job.status);
        const done =
          normalizeNumber(job.progress_done) ?? normalizeNumber(job.progressDone) ?? null;
        const total =
          normalizeNumber(job.progress_total) ?? normalizeNumber(job.progressTotal) ?? null;
        const backendPercent =
          normalizeNumber((job as Record<string, unknown>).progress_percent) ??
          normalizeNumber((job as Record<string, unknown>).progressPercent) ??
          null;
        const backendEtaSeconds =
          normalizeNumber((job as Record<string, unknown>).progress_eta_seconds) ??
          normalizeNumber((job as Record<string, unknown>).progressEtaSeconds) ??
          null;
        const cacheHitsValue =
          normalizeNumber(job.cache_hits) ?? normalizeNumber(job.cacheHits) ?? null;
        const googleCallsValue =
          normalizeNumber(job.google_calls_used) ?? normalizeNumber(job.googleCallsUsed) ?? null;
        const progressDetail =
          (typeof job.progress_detail === 'string' && job.progress_detail) ||
          (typeof job.progressDetail === 'string' && job.progressDetail) ||
          null;
        const progressUnavailableReason =
          (typeof (job as Record<string, unknown>).progress_unavailable_reason === 'string' &&
            ((job as Record<string, unknown>).progress_unavailable_reason as string)) ||
          (typeof (job as Record<string, unknown>).progressUnavailableReason === 'string' &&
            ((job as Record<string, unknown>).progressUnavailableReason as string)) ||
          null;
        const updatedAtValue = job.updated_at ?? job.updatedAt;
        const updatedAt =
          typeof updatedAtValue === 'string' ? new Date(updatedAtValue).getTime() : Date.now();

        if (typeof done === 'number' && typeof total === 'number' && total > 0) {
          progressSamplesRef.current = [
            ...progressSamplesRef.current.slice(-14),
            { timestamp: updatedAt, done, total },
          ];
        }

        const samples = progressSamplesRef.current;
        let etaSeconds: number | null = backendEtaSeconds;
        if (etaSeconds === null && samples.length >= 5 && typeof done === 'number' && typeof total === 'number') {
          const first = samples[0];
          const last = samples[samples.length - 1];
          const timeDeltaMs = last.timestamp - first.timestamp;
          const doneDelta = last.done - first.done;
          if (timeDeltaMs >= 4000 && doneDelta > 0) {
            const ratePerSec = doneDelta / (timeDeltaMs / 1000);
            const remaining = Math.max(total - done, 0);
            etaSeconds = ratePerSec > 0 ? remaining / ratePerSec : null;
          }
        }

        if (etaSeconds !== null && Number.isFinite(etaSeconds)) {
          const prevEta = etaSecondsRef.current;
          const raw = Math.max(0, etaSeconds);
          if (prevEta === null) {
            etaSecondsRef.current = raw;
          } else {
            const clamped = Math.min(prevEta * 1.35 + 8, Math.max(prevEta * 0.7 - 8, raw));
            etaSecondsRef.current = prevEta * 0.7 + clamped * 0.3;
          }
        }

        const computedPercent = computeProgressPercent(phase, done, total);
        const hasLiveProgressSource =
          (typeof backendPercent === 'number' && Number.isFinite(backendPercent)) ||
          (typeof done === 'number' && typeof total === 'number' && total > 0);
        if (hasLiveProgressSource) {
          const rawPercent = typeof backendPercent === 'number' ? backendPercent : computedPercent;
          if (typeof rawPercent === 'number') {
            setProgressPercent((prev) => {
              const normalized = Math.max(0, Math.min(100, Math.round(rawPercent)));
              if (activeProgressJobIdRef.current !== jobIdToWatch) return normalized;
              if (prev === null) return normalized;
              return Math.max(prev, normalized);
            });
          }
        } else {
          setProgressPercent(null);
        }
        if (phase) {
          setProgressStep(mapPhaseToStep(phase));
        }

        const showEta = samples.length >= 5;
        setProgressInfo({
          phase,
          done,
          total,
          detail: progressDetail,
          cacheHits: cacheHitsValue,
          googleCallsUsed: googleCallsValue,
          eta: showEta && etaSecondsRef.current !== null ? formatEta(etaSecondsRef.current) : null,
          unavailableReason: progressUnavailableReason,
        });
        setSoftProgressOutage(false);
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
        const summaryReady = isSummaryReadyProgressState(phase, status, done, total);
        if (summaryReady && !summaryHydrationPromiseRef.current) {
          summaryHydrationPromiseRef.current = hydrateSummaryFromJobDetail(jobIdToWatch, total ?? done ?? null)
            .catch(() => null)
            .finally(() => {
              summaryHydrationPromiseRef.current = null;
            });
        }

        if (summaryReady && !resultsHydrationPromiseRef.current) {
          resultsHydrationPromiseRef.current = hydrateCompletedAsyncJob(jobIdToWatch, total ?? done ?? null, {
            maxAttempts: isCompletionLikePhase(status) || isCompletionLikePhase(phase) ? RESULTS_HYDRATION_MAX_ATTEMPTS : 1,
          })
            .then((hydrated) => {
              if (hydrated) {
                stopPolling();
                setBusy(false);
              }
              return hydrated;
            })
            .catch((resultsError) => {
              if (isCompletionLikePhase(status) || isCompletionLikePhase(phase)) {
                setResultsFinalizing(false);
                throw resultsError;
              }
              return false;
            })
            .finally(() => {
              resultsHydrationPromiseRef.current = null;
            });
        }

        if (isCompletionLikePhase(status) || isCompletionLikePhase(phase)) {
          setProgressPercent(100);
          setProgressStep(mapPhaseToStep('DONE'));
          stopPolling();
          await summaryHydrationPromiseRef.current;
          if (resultsHydrationPromiseRef.current) {
            await resultsHydrationPromiseRef.current;
          }
          if (options?.onFinished) {
            await options.onFinished();
          }
        }
      } catch (err) {
        const errorInfo = getApiErrorInfo(err);
        if (errorInfo?.status === 404 && !busyRef.current) {
          resetParseUi({ showMissingJobToast: true });
          return;
        }
        if (busyRef.current && isSoftProgressStatus(errorInfo?.status)) {
          setSoftProgressOutage(true);
          setProgressPercent(null);
          setProgressInfo((prev) => ({
            ...prev,
            unavailableReason:
              prev.unavailableReason ||
              'Processing is still running. Live progress will appear when available.',
          }));
          setPollErrorCount((prev) => prev + 1);
          setPollError((err as Error).message ?? 'Polling failed.');
          return;
        }
        const message = (err as Error).message ?? 'Polling failed.';
        setPollErrorCount((prev) => prev + 1);
        setPollError(message);
      } finally {
        pollingInFlightRef.current = false;
      }
    };

    void runPoll();
    pollingRef.current = window.setInterval(() => {
      void runPoll();
    }, 900);
  };

  const applyParsedResponse = useCallback(
    (parsed: Record<string, unknown>, fallbackRowsReceived: number | null) => {
      setParseTimestamp(new Date().toISOString());
      setIsJobReload(false);
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
      const responseMeta = (parseResponse.metadata as Record<string, unknown>) ?? {};
      const persistenceWarning = Boolean(
        responseMeta.persistence_warning === true ||
          responseMeta.source === 'memory' ||
          responseMeta.schema_health === 'degraded',
      );
      if (hasRowAccounting) {
        const summary = toParseSummary(normalizeJobSummary(parseResponse.summary));
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

        const parsedRows = ((parseResponse.row_results ?? []) as JobRecord[]).map((row, index) =>
          normalizeJobRowResult(row, index),
        );
        const displayedSummary = deriveDisplayedParseSummary(parsedRows, summary);
        setParseSummary(displayedSummary);
        setRowsReceived(deriveDisplayedRowsReceived(parsedRows, displayedSummary));
        const canonicalRows = (parseResponse.canonical_addresses ?? []) as CanonicalAddress[];
        setCanonicalAddresses(canonicalRows.map(normalizeCanonicalAddress));
        setDeriveCanonicalsFromRows(false);
        setRowResults(parsedRows);
        setDuplicateGroups(buildDuplicateGroupsFromRows(parsedRows));
        setDebugInfo((parseResponse.debug ?? null) as ParseDebugInfo | null);
        setMetadata(Object.keys(rowAccountingMetadata).length ? rowAccountingMetadata : null);
        setLegacyMode(false);
        if (persistenceWarning) {
          setPersistenceWarningActive(true);
          writeLocalParsePersistenceState({ persistenceWarning: true });
        } else {
          setPersistenceWarningActive(false);
          writeLocalParsePersistenceState({ persistenceWarning: false });
        }
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
      if (typeof progressMeta === 'number' && Number.isFinite(progressMeta) && progressMeta > 0) {
        setProgressPercent(progressMeta);
      } else if (typeof progressMeta === 'object' && progressMeta !== null) {
        const percent = (progressMeta as { percent?: number }).percent;
        if (typeof percent === 'number' && Number.isFinite(percent) && percent > 0) {
          setProgressPercent(percent);
        }
      }
    },
    [],
  );

  const hydrateSummaryFromJobDetail = useCallback(
    async (completedJobId: string, fallbackRowsReceived: number | null) => {
      const jobDetail = await getJobDetail(completedJobId);
      const mergedJob: JobRecord = {
        ...(jobDetail.summary ?? {}),
        ...(jobDetail.job ?? {}),
      };
      const summary = buildParseSummaryFromJob(mergedJob);
      const displayedSummary = deriveDisplayedParseSummary([], summary);
      const resolvedRowsReceived = displayedSummary?.rows_received ?? fallbackRowsReceived ?? null;
      setParseSummary(displayedSummary);
      setRowsReceived(resolvedRowsReceived);
      setMetadata(Object.keys(mergedJob).length ? mergedJob : null);
      setProgressInfo((prev) => ({
        ...prev,
        phase: prev.phase && !isCompletionLikePhase(prev.phase) ? prev.phase : 'DONE',
        done: resolvedRowsReceived,
        total: resolvedRowsReceived,
      }));
      setProgressPercent(100);
      publishJobUpdate({ kind: 'job-updated', jobId: completedJobId });
      publishJobUpdate({ kind: 'metrics-updated', jobId: completedJobId });
      return displayedSummary;
    },
    [],
  );

  const hydrateCompletedAsyncJob = useCallback(
    async (completedJobId: string, fallbackRowsReceived: number | null, options?: { maxAttempts?: number }) => {
      setResultsFinalizing(true);
      let lastError: unknown = null;
      const maxAttempts = options?.maxAttempts ?? RESULTS_HYDRATION_MAX_ATTEMPTS;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const results = await getJobResults(completedJobId, { fresh: true });
          if (!hasHydratedResultsPayload(results, { minimumRowsReceived: fallbackRowsReceived })) {
            throw new Error('Results not ready yet.');
          }
          applyParsedResponse(results as unknown as Record<string, unknown>, fallbackRowsReceived);
          setResultsFinalizing(false);
          publishJobUpdate({ kind: 'job-updated', jobId: completedJobId });
          publishJobUpdate({ kind: 'metrics-updated', jobId: completedJobId });
          return true;
        } catch (error) {
          lastError = error;
          if (!isTemporaryResultsUnavailableError(error) && (error as Error).message !== 'Results not ready yet.') {
            break;
          }
          if (attempt + 1 >= maxAttempts) {
            break;
          }
          const delayMs = RESULTS_HYDRATION_BASE_DELAY_MS * 2 ** attempt;
          await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
      }
      if (maxAttempts > 1) {
        setResultsFinalizing(false);
        throw lastError instanceof Error ? lastError : new Error('Finalizing results timed out.');
      }
      setResultsFinalizing(true);
      return false;
    },
    [applyParsedResponse],
  );

  const resetForFreshParse = () => {
    setError(null);
    setBusy(true);
    setResultsFinalizing(false);
    setRowsReceived(null);
    setParseSummary(null);
    setCanonicalAddresses([]);
    setDeriveCanonicalsFromRows(false);
    setRowResults([]);
    setDuplicateGroups([]);
    setDebugInfo(null);
    setParsePayload(null);
    setLegacyMatchedRows([]);
    setLegacyUnmatchedRows([]);
    setMetadata(null);
    setLegacyMode(false);
    setIsJobReload(false);
    setProgressStep(0);
    setProgressPercent(null);
    etaSecondsRef.current = null;
    setPollError(null);
    setPollErrorCount(0);
    setSoftProgressOutage(false);
    setPersistenceWarningActive(false);
    setProcessingReportFilter('all');
    setActiveTab('valid');
    setLegacyTab('matched');
    setReviewRow(null);
    setReviewError(null);
    setReviewSaving(false);
    setReviewDrafts({});
    setSelectedNeedsReviewRowIds(new Set());
    setSelectedOutOfScopeRowIds(new Set());
    setPendingReviewNavigation(null);
    setProgressInfo({
      phase: null,
      done: null,
      total: null,
      detail: null,
      cacheHits: null,
      googleCallsUsed: null,
      eta: null,
      unavailableReason: null,
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
      setIsJobReload(false);
      setFileId(uploadFileId);
      setParseTimestamp(new Date().toISOString());
      setParsePayload(parsedRecord);
      setProgressStep(4);
      setProgressPercent(100);
      const hasRowAccounting = Boolean(parsed.summary && parsed.row_results);
      if (hasRowAccounting) {
        const summary = toParseSummary(normalizeJobSummary(parsed.summary));
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

        const parsedRows = ((parsed.row_results ?? []) as JobRecord[]).map((row, index) =>
          normalizeJobRowResult(row, index),
        );
        const displayedSummary = deriveDisplayedParseSummary(parsedRows, summary);
        setParseSummary(displayedSummary);
        setRowsReceived(deriveDisplayedRowsReceived(parsedRows, displayedSummary));
        const canonicalRows = (parsed.canonical_addresses ?? []) as CanonicalAddress[];
        setCanonicalAddresses(canonicalRows.map(normalizeCanonicalAddress));
        setDeriveCanonicalsFromRows(false);
        setRowResults(parsedRows);
        setDuplicateGroups(buildDuplicateGroupsFromRows(parsedRows));
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
      setResultsFinalizing(false);
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
            try {
              await hydrateSummaryFromJobDetail(newJobId, upload.rowsReceived ?? null);
              publishLiveUpdate('job-updated', newJobId);
              publishLiveUpdate('metrics-updated', newJobId);
              setBusy(false);
              await hydrateCompletedAsyncJob(newJobId, upload.rowsReceived ?? null);
              publishLiveUpdate('job-updated', newJobId);
              publishLiveUpdate('metrics-updated', newJobId);
              void reconcileDurableJob(newJobId);
            } catch (hydrationError) {
              setBusy(false);
              setResultsFinalizing(false);
              setError((hydrationError as Error).message ?? 'Unable to finalize parse results.');
            }
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
        setResultsFinalizing(false);
        publishLiveUpdate('job-updated', newJobId);
        publishLiveUpdate('metrics-updated', newJobId);
        stopPolling();
        setBusy(false);
        void reconcileDurableJob(newJobId);
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
      showToast({ title: 'Row retried', variant: 'success' });
      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
    } catch {
      setRetryAvailable('unavailable');
      updateRetryStatus(row.id, true);
      showToast({ title: 'Retry failed', variant: 'error' });
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
      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
    } catch {
      setRetryAvailable('unavailable');
      showToast({ title: 'Retry failed', variant: 'error' });
    }
  };

  const handleRetryUpdates = async (payload: {
    updatedRows: RowResult[];
    updatedJob?: Record<string, unknown>;
    freshReload?: boolean;
  }) => {
    const { updatedRows, updatedJob, freshReload } = payload;
    const mergedRows =
      updatedRows?.length
        ? mergeUpdatedRows(rowResultsRef.current, updatedRows)
        : rowResultsRef.current;

    if (updatedRows?.length) {
      rowResultsRef.current = mergedRows;
      setDeriveCanonicalsFromRows(true);
      setRowResults(mergedRows);
      setCanonicalAddresses(buildCanonicalAddressesFromRows(mergedRows));
      setDuplicateGroups(buildDuplicateGroupsFromRows(mergedRows));
    }

    if (updatedJob) {
      const { job: normalizedUpdatedJob, parseSummary: normalizedSummary } = normalizeUpdatedJobPayload(updatedJob);
      if (!normalizedUpdatedJob && !normalizedSummary) return;
      const totalRows = pickNumberFromRecord((normalizedUpdatedJob ?? {}) as Record<string, unknown>, [
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

      const derivedSummary = deriveDisplayedParseSummary(
        mergedRows,
        normalizedSummary ?? parseSummaryRef.current,
        parseSummaryRef.current ?? undefined,
      );
      parseSummaryRef.current = derivedSummary;
      setRowsReceived(deriveDisplayedRowsReceived(mergedRows, derivedSummary));
      setMetadata((prev) => {
        const next = { ...(prev ?? {}), ...((normalizedUpdatedJob ?? {}) as Record<string, unknown>) };
        if (typeof totalRows === 'number') next.rows_received = totalRows;
        if (typeof matchedCount === 'number') next.matched_count = matchedCount;
        if (typeof unmatchedCount === 'number') next.unmatched_count = unmatchedCount;
        if (typeof dedupedCountValue === 'number') next.deduped_count = dedupedCountValue;
        if (typeof cacheHitsValue === 'number') next.cache_hits = cacheHitsValue;
        if (typeof googleCallsValue === 'number') next.google_calls_used = googleCallsValue;
        return next;
      });
      setParseSummary(derivedSummary);
    } else if (updatedRows?.length) {
      const derivedSummary = deriveDisplayedParseSummary(mergedRows, parseSummaryRef.current);
      parseSummaryRef.current = derivedSummary;
      setParseSummary(derivedSummary);
      setRowsReceived(deriveDisplayedRowsReceived(mergedRows, derivedSummary));
    }

    if (freshReload && jobId) {
      await loadJobResults(
        jobId,
        {
          version: LAST_JOB_STORAGE_VERSION,
          jobId,
          stateValue,
          countyValue,
          cityValue,
          campaignName,
        },
        { fresh: true },
      );
    }
  };

  const handleClearResults = () => {
    resetInProgressRef.current = true;
    resetParseUi();
    window.setTimeout(() => {
      resetInProgressRef.current = false;
    }, 0);
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
    const memberRows = getGroupMemberRows(reviewRow);
    setRetryingRowIds((prev) => {
      const next = new Set(prev);
      memberRows.forEach((memberRow) => next.add(memberRow.source_row_id));
      return next;
    });
    setReviewError(null);
    try {
      const response =
        memberRows.length > 1
          ? await retryJobBatch(
              jobId,
              memberRows.map((memberRow) => ({
                rowId: memberRow.source_row_id,
                fullAddress: trimmedAddress,
              })),
              forceRefresh,
            )
          : await retryJobRow(jobId, memberRows[0].source_row_id, trimmedAddress, forceRefresh);
      const updates = response.updated_row_results ?? response.updated_rows ?? [];
      const updatedJob = response.updated_job ?? (response as Record<string, unknown>).updated_job;
      await handleRetryUpdates({
        updatedRows: updates,
        updatedJob: (updatedJob ?? undefined) as Record<string, unknown> | undefined,
      });
      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
      setReviewDrafts((prev) => {
        const next = { ...prev };
        delete next[reviewRow.source_row_id];
        return next;
      });
      closeReviewDrawer();
      const hasDuplicate = updates.some((row) => normalizeStatus(row.status).includes('DUPLICATE'));
      const movedToValid = updates.some((row) => isValidRow(row));
      const stillNeedsReview = updates.some((row) => isNeedsReviewRow(row));
      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
      showToast({
        title: hasDuplicate
          ? 'Marked duplicate (check Duplicates tab)'
          : movedToValid
            ? 'Moved to Valid'
            : stillNeedsReview
              ? 'Still needs review'
              : 'Retry complete',
        variant: hasDuplicate || stillNeedsReview ? 'info' : 'success',
      });
      return true;
    } catch (err) {
      const message = (err as Error).message ?? 'Retry failed.';
      setReviewError(message);
      showToast({ title: message, variant: 'error' });
      return false;
    } finally {
      setReviewSaving(false);
      setRetryingRowIds((prev) => {
        const next = new Set(prev);
        memberRows.forEach((memberRow) => next.delete(memberRow.source_row_id));
        return next;
      });
    }
  };


  const handleApproveMatched = async (row: RowResult, allowScopeOverride = false) => {
    if (!jobId) {
      showToast({ title: 'Missing job ID', description: 'Please re-run the parse job.', variant: 'error' });
      return;
    }
    const capabilities = getApprovalCapabilities(row);
    const canApprove = allowScopeOverride
      ? capabilities.canApproveWithScopeOverride
      : capabilities.canApproveMatched;
    if (!canApprove) {
      showToast({ title: capabilities.blocker ?? 'Approval unavailable for this row.', variant: 'error' });
      return;
    }

    const memberRows = getGroupMemberRows(row);
    setApprovingRowIds((prev) => {
      const next = new Set(prev);
      memberRows.forEach((memberRow) => next.add(memberRow.source_row_id));
      return next;
    });

    try {
      const response = await approveMatchedJobRow(jobId, {
        rowId: row.source_row_id,
        applyToSameNormalizedInput: false,
        allowScopeOverride,
      });
      const updates = response.updated_row_results ?? response.updated_rows ?? [];
      const updatedJob = response.updated_job ?? (response as Record<string, unknown>).updated_job;
      await handleRetryUpdates({
        updatedRows: updates,
        updatedJob: (updatedJob ?? undefined) as Record<string, unknown> | undefined,
      });
      const hasDuplicate = updates.some((updatedRow) =>
        normalizeStatus(updatedRow.status).includes('DUPLICATE'),
      );
      const movedToValid = updates.some((updatedRow) => isValidRow(updatedRow));
      const stillNeedsReview = updates.some((updatedRow) => isNeedsReviewRow(updatedRow));
      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
      showToast({
        title: hasDuplicate
          ? 'Marked duplicate (check Duplicates tab)'
          : movedToValid
            ? 'Moved to Valid'
            : stillNeedsReview
              ? 'Still needs review'
              : 'Approve complete',
        variant: hasDuplicate || stillNeedsReview ? 'info' : 'success',
      });
      if (reviewRow?.source_row_id === row.source_row_id) {
        closeReviewDrawer();
      }
      return true;
    } catch (err) {
      const message = (err as Error).message ?? 'Approve matched failed.';
      showToast({ title: message, variant: 'error' });
      return false;
    } finally {
      setApprovingRowIds((prev) => {
        const next = new Set(prev);
        memberRows.forEach((memberRow) => next.delete(memberRow.source_row_id));
        return next;
      });
    }
  };

  const handleForceOverride = async (row: RowResult) => {
    if (!jobId) {
      showToast({ title: 'Missing job ID', description: 'Please re-run the parse job.', variant: 'error' });
      return false;
    }
    const capabilities = getApprovalCapabilities(row);
    if (!capabilities.canForceOverride) {
      showToast({ title: capabilities.blocker ?? 'Override unavailable for this row.', variant: 'error' });
      return false;
    }
    const confirmed = window.confirm(
      'Override to Valid bypasses the normal safety checks for this row. Continue only if you reviewed the matched address carefully.',
    );
    if (!confirmed) return false;
    const overrideReason = window.prompt('Enter an override reason for audit history:', 'Manual review confirmed')?.trim();
    if (!overrideReason) {
      showToast({ title: 'Override reason is required.', variant: 'error' });
      return false;
    }

    const memberRows = getGroupMemberRows(row);
    setApprovingRowIds((prev) => {
      const next = new Set(prev);
      memberRows.forEach((memberRow) => next.add(memberRow.source_row_id));
      return next;
    });

    try {
      const response = await approveMatchedJobRow(jobId, {
        rowId: row.source_row_id,
        applyToSameNormalizedInput: false,
        forceOverride: true,
        overrideReason,
      });
      const updates = response.updated_row_results ?? response.updated_rows ?? [];
      const updatedJob = response.updated_job ?? (response as Record<string, unknown>).updated_job;
      await handleRetryUpdates({
        updatedRows: updates,
        updatedJob: (updatedJob ?? undefined) as Record<string, unknown> | undefined,
      });
      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
      showToast({
        title: 'Override applied',
        description: 'This row was manually overridden to valid.',
        variant: 'success',
      });
      if (reviewRow?.source_row_id === row.source_row_id) {
        closeReviewDrawer();
      }
      return true;
    } catch (err) {
      showToast({ title: (err as Error).message ?? 'Override failed.', variant: 'error' });
      return false;
    } finally {
      setApprovingRowIds((prev) => {
        const next = new Set(prev);
        memberRows.forEach((memberRow) => next.delete(memberRow.source_row_id));
        return next;
      });
    }
  };

  const handleApproveSelectedNeedsReview = async () => {
    if (!jobId) {
      showToast({ title: 'Missing job ID', description: 'Please re-run the parse job.', variant: 'error' });
      return;
    }
    const rowIds = Array.from(selectedNeedsReviewRowIds).filter((rowId) => {
      const row = rowResultsById.get(rowId);
      return row ? getApprovalCapabilities(row).canApproveMatched : false;
    });
    if (!rowIds.length) return;
    setApprovingRowIds((prev) => {
      const next = new Set(prev);
      rowIds.forEach((rowId) => next.add(rowId));
      return next;
    });
    try {
      const response = await approveMatchedJobRowsBatch(jobId, rowIds, false);
      const updates = response.updated_row_results ?? response.updated_rows ?? [];
      const failedRows = response.failed_rows ?? [];
      const metadata = response.metadata;
      const approvedCount = metadata?.approved_count ?? updates.length;
      const failedCount = metadata?.failed_count ?? failedRows.length;
      const requestedCount = metadata?.requested_count ?? rowIds.length;
      const updatedJob = response.updated_job ?? (response as Record<string, unknown>).updated_job;
      await handleRetryUpdates({
        updatedRows: updates,
        updatedJob: (updatedJob ?? undefined) as Record<string, unknown> | undefined,
      });
      const duplicateCount = updates.filter((row) => normalizeStatus(row.status).includes('DUPLICATE')).length;

      const failedRowSummary = failedRows
        .slice(0, 3)
        .map((failure) => {
          const rowId = failure.row_id ?? 'unknown row';
          const message = failure.error ?? 'Unable to approve';
          return `${rowId}: ${message}`;
        })
        .join(' · ');

      const summaryParts = [
        `${approvedCount} approved`,
        `${failedCount} failed`,
        `${requestedCount} selected`,
      ];

      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
      showToast({
        title: failedCount > 0 ? 'Bulk approve completed with partial success' : `Approved ${approvedCount} rows`,
        description:
          [
            summaryParts.join(' · '),
            duplicateCount > 0 ? 'Some were marked duplicate (see Duplicates tab).' : null,
            failedRowSummary ? `Failed rows: ${failedRowSummary}` : null,
          ]
            .filter(Boolean)
            .join(' '),
        variant: failedCount > 0 || duplicateCount > 0 ? 'info' : 'success',
      });

      if (failedCount === 0) {
        setSelectedNeedsReviewRowIds(new Set());
      } else {
        const failedIdSet = new Set(
          failedRows
            .map((failure) => failure.row_id)
            .filter((rowId): rowId is string => Boolean(rowId)),
        );
        setSelectedNeedsReviewRowIds(failedIdSet);
      }
    } catch (err) {
      showToast({
        title: (err as Error).message ?? 'Bulk approve failed.',
        variant: 'error',
      });
    } finally {
      setApprovingRowIds((prev) => {
        const next = new Set(prev);
        rowIds.forEach((rowId) => next.delete(rowId));
        return next;
      });
    }
  };

  const handleApproveSelectedOutOfScope = async () => {
    if (!jobId) {
      showToast({ title: 'Missing job ID', description: 'Please re-run the parse job.', variant: 'error' });
      return;
    }
    const rowIds = Array.from(selectedOutOfScopeRowIds).filter((rowId) => {
      const row = rowResultsById.get(rowId);
      return row ? getApprovalCapabilities(row).canApproveWithScopeOverride : false;
    });
    if (!rowIds.length) return;
    setApprovingRowIds((prev) => {
      const next = new Set(prev);
      rowIds.forEach((rowId) => next.add(rowId));
      return next;
    });
    try {
      const response = await approveMatchedJobRowsBatch(jobId, rowIds, true);
      const updates = response.updated_row_results ?? response.updated_rows ?? [];
      const failedRows = response.failed_rows ?? [];
      const metadata = response.metadata;
      const approvedCount = metadata?.approved_count ?? updates.length;
      const failedCount = metadata?.failed_count ?? failedRows.length;
      const requestedCount = metadata?.requested_count ?? rowIds.length;
      const updatedJob = response.updated_job ?? (response as Record<string, unknown>).updated_job;
      await handleRetryUpdates({
        updatedRows: updates,
        updatedJob: (updatedJob ?? undefined) as Record<string, unknown> | undefined,
      });
      const failedRowSummary = failedRows
        .slice(0, 3)
        .map((failure) => `${failure.row_id ?? 'unknown row'}: ${failure.error ?? 'Unable to approve'}`)
        .join(' · ');
      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
      showToast({
        title: failedCount > 0 ? 'Bulk approve completed with partial success' : `Approved ${approvedCount} rows`,
        description: [
          `${approvedCount} approved · ${failedCount} failed · ${requestedCount} selected`,
          failedRowSummary ? `Failed rows: ${failedRowSummary}` : null,
        ]
          .filter(Boolean)
          .join(' '),
        variant: failedCount > 0 ? 'info' : 'success',
      });
      if (failedCount === 0) {
        setSelectedOutOfScopeRowIds(new Set());
      } else {
        const failedIdSet = new Set(
          failedRows.map((failure) => failure.row_id).filter((rowId): rowId is string => Boolean(rowId)),
        );
        setSelectedOutOfScopeRowIds(new Set(Array.from(failedIdSet)));
      }
    } catch (err) {
      showToast({
        title: (err as Error).message ?? 'Bulk approve failed.',
        variant: 'error',
      });
    } finally {
      setApprovingRowIds((prev) => {
        const next = new Set(prev);
        rowIds.forEach((rowId) => next.delete(rowId));
        return next;
      });
    }
  };

  const toggleDuplicateGroup = (groupKey: string) => {
    setExpandedDuplicateGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };


  const exportCatalogByType = useMemo(() => new Map(exportCatalog.map((item) => [item.type, item])), [exportCatalog]);
  const originalUploadItem = exportCatalogByType.get('original_file');
  const hasVisibleRows = rowResults.length > 0 || canonicalAddressesForDisplay.length > 0;
  const exportIntegrityWarningVisible = useMemo(() => {
    if (!hasVisibleRows) return false;
    const monitoredTypes: JobExportType[] = ['processing_report', 'unique_valid', 'needs_review', 'out_of_scope', 'duplicates', 'skipped'];
    return monitoredTypes.some((type) => (exportCatalogByType.get(type)?.rowCount ?? 1) === 0);
  }, [exportCatalogByType, hasVisibleRows]);

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
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
      const csvText =
        type === 'original_file' || type === 'propstream_import'
          ? ''
          : typeof blob.text === 'function'
            ? await blob.text()
            : '';
      const catalogItem = exportCatalogByType.get(type);
      const shouldFallback =
        (type === 'processing_report' ||
          type === 'unique_valid' ||
          type === 'needs_review' ||
          type === 'out_of_scope' ||
          type === 'duplicates' ||
          type === 'skipped') &&
        (isHeaderOnlyCsv(csvText) || ((catalogItem?.rowCount ?? 1) === 0 && hasVisibleRows));

      if (shouldFallback) {
        const fallbackBlob = buildLocalCsvForExport(type, {
          rowResults,
          canonicalAddresses: canonicalAddressesForDisplay,
        });
        triggerBlobDownload(fallbackBlob, `job-${jobId}-${type}-local-fallback.csv`);
        showToast({
          title: 'Used local export fallback',
          description: 'Backend export was incomplete for this dataset.',
          variant: 'info',
        });
      } else {
        triggerBlobDownload(blob, filename);
      }
      setDownloadSuccessLabel(`${label} downloaded`);
      publishLiveUpdate('job-exported');
      publishLiveUpdate('metrics-updated');
      showToast({ title: 'Export downloaded', variant: 'success' });
      if (downloadSuccessTimerRef.current !== null) {
        window.clearTimeout(downloadSuccessTimerRef.current);
      }
      downloadSuccessTimerRef.current = window.setTimeout(() => {
        setDownloadSuccessLabel(null);
        downloadSuccessTimerRef.current = null;
      }, 2000);
    } catch (err) {
      const message = (err as Error).message ?? 'Failed to download export.';
      setPollError(message);
      showToast({ title: message, variant: 'error' });
    } finally {
      setActiveDownloadType(null);
    }
  };


  const handleAutoFixFlaggedRows = async () => {
    if (!jobId) {
      showToast({ title: 'Missing job ID', description: 'Please re-run the parse job.', variant: 'error' });
      return;
    }

    setRunningAiFixFlaggedRows(true);
    try {
      const response = await runAiFixFlaggedRows(jobId, true);
      const attemptedCount = response.attempted_count ?? response.attempted ?? 0;
      const upgradedCount = response.upgraded_count ?? response.upgraded_to_valid ?? 0;
      const rewrittenCount = response.rewritten_count ?? response.rewritten ?? 0;

      const updates = response.updated_row_results ?? response.updated_rows ?? [];
      if (updates.length > 0 || response.updated_job) {
        await handleRetryUpdates({
          updatedRows: updates,
          updatedJob: response.updated_job as Record<string, unknown> | undefined,
        });
      }

      const acceptedAsync = attemptedCount === 0 && upgradedCount === 0 && rewrittenCount === 0;
      if (acceptedAsync) {
        setBusy(true);
        startPolling(jobId, {
          onFinished: async () => {
            await loadJobResults(
              jobId,
              {
                version: LAST_JOB_STORAGE_VERSION,
                jobId,
                stateValue,
                countyValue,
                cityValue,
                campaignName,
              },
              { fresh: true },
            );
            setBusy(false);
          },
        });
        showToast({
          title: 'AI auto-fix started',
          description: 'Progress and ETA will update while fixes run.',
          variant: 'info',
        });
        return;
      }

      if (attemptedCount === 0) {
        showToast({
          title: 'No eligible flagged rows to fix',
          variant: 'info',
        });
      } else {
        showToast({
          title: 'AI auto-fix completed',
          description: `Attempted ${attemptedCount} · Upgraded ${upgradedCount} · Rewritten ${rewrittenCount}`,
          variant: upgradedCount > 0 ? 'success' : 'info',
        });
      }

      publishLiveUpdate('job-updated');
      publishLiveUpdate('metrics-updated');
      await loadJobResults(jobId, {
        version: LAST_JOB_STORAGE_VERSION,
        jobId,
        stateValue,
        countyValue,
        cityValue,
        campaignName,
      }, { fresh: true });
    } catch (err) {
      setBusy(false);
      showToast({
        title: 'AI auto-fix failed',
        description: (err as Error).message ?? 'Unable to run AI auto-fix for flagged rows.',
        variant: 'error',
      });
    } finally {
      setRunningAiFixFlaggedRows(false);
    }
  };


  const publishLiveUpdate = useCallback(
    (kind: 'job-updated' | 'metrics-updated' | 'job-exported', targetJobId?: string) => {
      publishJobUpdate({ kind, jobId: targetJobId ?? jobId ?? undefined });
    },
    [jobId],
  );

  const aiFixInProgress =
    runningAiFixFlaggedRows || (busy && progressInfo.phase === 'AI_FIXING');


  useEffect(() => {
    if (!jobId) {
      setExportCatalog(FALLBACK_EXPORT_CATALOG);
      return;
    }
    let active = true;
    const loadCatalog = async () => {
      try {
        const catalog = await getJobExportCatalog(jobId);
        if (active) {
          setExportCatalog(normalizeExportCatalog(catalog));
        }
      } catch {
        if (active) {
          setExportCatalog(FALLBACK_EXPORT_CATALOG);
        }
      }
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, [jobId]);

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

  const renderDuplicateRows = (group: GroupedRow) => {
    const rows = group.memberRowIds
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
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
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
                          onClick={() => void handleCopyRowJson(row)}
                         
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
  const reviewCompareInput = reviewRow ? getCompareInputDisplay(reviewRow) : { original: '', normalized: '', showNormalized: false };
  const reviewRecordId = reviewRow ? getRecordId(reviewRow) : null;
  const reviewStatusLabel = reviewRow ? getStatusLabel(reviewRow) : '';
  const reviewDetectedAddress = reviewCompareInput.original || reviewRow?.formatted_address || '';
  const reviewVerifiedAddress = reviewRow
    ? getMatchedAddress(reviewRow)
    : '';
  const reviewSelectedState = reviewRow ? getScopeDebugValue(reviewRow, 'selected', 'state') : '';
  const reviewSelectedCounty = reviewRow ? getScopeDebugValue(reviewRow, 'selected', 'county') : '';
  const reviewSelectedCity = reviewRow ? getScopeDebugValue(reviewRow, 'selected', 'city') : '';
  const reviewMatchedState = reviewRow ? getScopeDebugValue(reviewRow, 'matched', 'state') : '';
  const reviewMatchedCounty = reviewRow ? getScopeDebugValue(reviewRow, 'matched', 'county') : '';
  const reviewMatchedCity = reviewRow ? getScopeDebugValue(reviewRow, 'matched', 'city') : '';
  const reviewMismatchField =
    (reviewRow as Record<string, unknown> | null)?.mismatch_field || '';
  const reviewNeedsReview = reviewRow ? isNeedsReviewRow(reviewRow) : false;
  const reviewOutOfScope = reviewRow ? isOutOfScopeRow(reviewRow) : false;
  const reviewSkipped = reviewRow ? isSkippedRow(reviewRow) : false;
  const reviewScopePass = !reviewOutOfScope;
  const canEditReview = reviewNeedsReview || reviewOutOfScope || reviewSkipped;
  const reviewApprovalCapabilities = reviewRow ? getApprovalCapabilities(reviewRow) : null;
  const canReviewApprove = reviewOutOfScope
    ? Boolean(reviewApprovalCapabilities?.canApproveWithScopeOverride)
    : Boolean(reviewApprovalCapabilities?.canApproveMatched);
  const canReviewForceOverride = Boolean(reviewApprovalCapabilities?.canForceOverride);
  const reviewApprovalBlocker = reviewApprovalCapabilities?.blocker ?? null;
  const scopeSummary = [
    stateValue || 'State not selected',
    countyValue ? `${countyValue} County` : 'County not selected',
    cityValue ? `${cityValue} only` : 'All localities in county',
  ].join(' • ');

  const handleCopyRowJson = async (payload: unknown) => {
    try {
      await copyTextToClipboard(JSON.stringify(payload, null, 2));
      showToast({ title: 'Copied', variant: 'success' });
    } catch {
      showToast({ title: 'Unable to copy row JSON', variant: 'error' });
    }
  };

  const handleCopyReviewAddress = async (address: string) => {
    if (!address) return;
    try {
      await copyTextToClipboard(address);
      showToast({ title: 'Copied', variant: 'success' });
    } catch {
      showToast({ title: 'Unable to copy address', variant: 'error' });
    }
  };

  return (
    <AppShell
      title="Address Parser"
      subtitle="Upload a file, set your location context, and parse addresses."
    >
      <div className="mx-auto w-full max-w-[1160px] space-y-8">
        <div className="grid gap-6 lg:grid-cols-2">
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
                  noOptionsMessage={() => 'Open the menu to browse states or type to filter.'}
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
                  noOptionsMessage={() =>
                    stateValue ? 'Open the menu to browse counties or type to filter.' : 'Select a state first.'
                  }
                  loadOptions={loadCountyOptions}
                  onChange={(value) => {
                    setCountyValue(value);
                    setCityValue('');
                  }}
                  onClear={() => setCountyValue('')}
                />
                <AsyncLocationSelect
                  label="City / locality (optional)"
                  value={cityValue}
                  placeholder={stateValue ? 'Search or type city/locality' : 'Select state first'}
                  disabled={!stateValue}
                  cacheScope={`cities:${stateValue}:${countyValue}`}
                  noOptionsMessage={() =>
                    stateValue
                      ? 'Open the menu to browse localities, or create a custom locality.'
                      : 'Select a state first.'
                  }
                  loadOptions={loadCityOptions}
                  allowCustomValue
                  formatCreateLabel={(inputValue) => `Use custom locality "${inputValue}"`}
                  onChange={(value) => setCityValue(value)}
                  onClear={() => setCityValue('')}
                  helperText="Select from search results or type a missing city/locality manually. State is required; choose either a County or a City (or both)."
                />
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <span className="font-semibold text-slate-700 dark:text-slate-100">Scope:</span> {scopeSummary}
                </div>
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
                      title="Uses more verification calls."
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-300"
                      aria-label="Uses more verification calls."
                    >
                      i
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Uses more verification calls. Enable only when cached verification may be outdated.
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
                  {hasPersistableResults ? (
                    <button
                      type="button"
                      onClick={handleClearResults}
                      className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      Clear
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

        {shouldShowProgress ? (
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Parsing Progress</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Live status updates while we process your file.
                </p>
              </div>
              {parseLifecycleStatus ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {parseLifecycleStatus}
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
              {softProgressOutage ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {progressInfo.unavailableReason || 'Live progress is reconnecting…'}
                  {pollErrorCount >= 8 && pollError ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] font-semibold">Technical details</summary>
                      <div className="mt-1 text-[11px]">{pollError}</div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {persistenceWarningActive && parseSummary ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            This run completed locally, but has not been saved to History yet.
          </div>
        ) : null}

        <div
          ref={resultsRef}
          className="w-full"
        >
          <div className="sticky top-16 z-20 mb-6 rounded-2xl border border-slate-200/80 bg-white/95 px-6 py-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Processing Results</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Review parsed rows, fix issues, and export results.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {parseSummary ? (
                  <button
                    type="button"
                    onClick={() => void handleAutoFixFlaggedRows()}
                    disabled={!jobId || aiFixInProgress}
                    className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-500/10"
                  >
                    {aiFixInProgress ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-700 dark:border-indigo-300/40 dark:border-t-indigo-100" aria-hidden="true" />
                        Auto-fixing flagged rows…
                      </span>
                    ) : 'Auto-fix flagged rows (AI)'}
                  </button>
                ) : null}
                {parseSummary ? (
                  <div className="flex flex-col items-end gap-2">
                    {exportIntegrityWarningVisible ? (
                      <p className="max-w-sm rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                        Saved export rows are unavailable for this run. Downloads may be incomplete until backend persistence is repaired.
                      </p>
                    ) : null}
                  {originalUploadItem ? (
              <div className="max-w-sm rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <p className="font-semibold text-slate-700 dark:text-slate-100">Original Upload</p>
                {originalUploadItem.available === false ? (
                  <p className="mt-1">{originalUploadItem.unavailableMessage || 'The original upload is unavailable for this job.'}</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {originalUploadItem.filename ? <span>Filename: {originalUploadItem.filename}</span> : null}
                    {originalUploadItem.contentType ? <span>Content type: {originalUploadItem.contentType}</span> : null}
                    {typeof originalUploadItem.sizeBytes === 'number' ? <span>Size: {originalUploadItem.sizeBytes.toLocaleString()} bytes</span> : null}
                  </div>
                )}
              </div>
            ) : null}
            <ExportPanel
                    triggerLabel="Export"
                    catalog={exportCatalog}
                    onDownload={(type, label) => {
                      void handleDownloadJobExport(type, label);
                    }}
                    activeDownloadType={activeDownloadType}
                    disabled={!jobId}
                  />
                  </div>
                ) : null}
                {downloadSuccessLabel ? (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Downloaded
                  </span>
                ) : null}
              </div>
            </div>


            {parseSummary ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleKpiTabClick('valid')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    activeTab === 'valid'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Valid (rows: {computedParseSummary?.valid_total ?? 0} · unique: {computedParseSummary?.valid_unique ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => openProcessingReport('all')}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Processing Report
                </button>
                <button
                  type="button"
                  onClick={() => handleKpiTabClick('needs_review')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    activeTab === 'needs_review'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Needs Review ({needsReviewGroups.length} issues · {computedParseSummary?.needs_review ?? 0} rows)
                </button>
                <button
                  type="button"
                  onClick={() => handleKpiTabClick('skipped')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    activeTab === 'skipped'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Skipped ({computedParseSummary?.skipped ?? 0} rows)
                </button>
                <button
                  type="button"
                  onClick={() => handleKpiTabClick('duplicates')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    activeTab === 'duplicates'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Duplicates ({computedParseSummary?.duplicates ?? 0})
                </button>
                {typeof computedParseSummary?.out_of_scope === 'number' ? (
                  <button
                    type="button"
                    onClick={() => handleKpiTabClick('out_of_scope')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      activeTab === 'out_of_scope'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    Out of Scope ({computedParseSummary?.out_of_scope} rows)
                  </button>
                ) : null}
              </div>
            ) : (
              <EmptyState
                className="mt-4 py-6"
                title="No parse results yet"
                description="Step 1 Upload • Step 2 Choose location • Step 3 Process & export"
                hint="State required. County or City recommended."
              />

            )}
          </div>

          {legacyMode ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
              Legacy parse response detected. Upgrade the API to enable the full processing report
              experience.
            </div>
          ) : null}
          {parseSummary && rowAccountingMismatch && !isJobReload ? (
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
          <JobWarnings warnings={metadataWarnings as Array<string | { code?: string; message?: string; detail?: unknown }>} />
          {cityValue && unmatchedCount > 0 ? (
            <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
              Some addresses failed because verification returned a different city. Leave City blank if
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
                  {computedParseSummary?.valid_unique ?? 0}
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleKpiTabClick('needs_review')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Needs Review Issues</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {needsReviewGroups.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{computedParseSummary?.needs_review ?? 0} rows</p>
              </button>
              <button
                type="button"
                onClick={() => handleKpiTabClick('skipped')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Skipped</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {computedParseSummary?.skipped ?? 0}
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleKpiTabClick('duplicates')}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              >
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Duplicates</p>
                <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {computedParseSummary?.duplicates ?? 0}
                </p>
              </button>
              {typeof computedParseSummary?.out_of_scope === 'number' ? (
                <button
                  type="button"
                  onClick={() => handleKpiTabClick('out_of_scope')}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                >
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    Out of Scope
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {computedParseSummary?.out_of_scope}
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
                    Verification Calls Used
                  </p>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {googleCallsUsed}
                  </p>
                </div>
              ) : null}
            </div>
          )}
          <div className="mt-6">
            {showLocalOnlyBillingWarning ? (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                {LOCAL_ONLY_BILLING_WARNING}
              </div>
            ) : null}
            <InternalCostPanel
              title={isPrivileged ? 'Internal cost transparency' : 'Usage estimate'}
              subtitle={isPrivileged ? 'Internal-only usage and reconciliation fields.' : 'Product-safe estimate only.'}
              items={costPanelItems}
              sections={costPanelSections}
              isPrivileged={isPrivileged}
            />
          </div>
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
              Verification calls used: {googleCallsUsed ?? 0} • Cache hits: {cacheHits ?? 0}
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
            {parseSummary && resultsFinalizing ? (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Finalizing results… tables will populate automatically.</p>
            ) : null}
            {parseSummary ? (
              <>
                {activeTab === 'valid' ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
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
                          {canonicalAddressesForDisplay.length === 0 && !zeroStateHydrationPending ? (
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
                      totalCount={canonicalAddressesForDisplay.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                    />
                  </div>
                ) : null}
                {activeTab === 'needs_review' ? (
                  <>
                  <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Route Alias / Route Mismatch: {reviewBreakdown.route_alias}</span>
                      <span>Street Number Not Verified: {reviewBreakdown.missing_street_number}</span>
                      <span>House Number Mismatch: {reviewBreakdown.house_number}</span>
                      <span>County Rescue Needed: {reviewBreakdown.county_rescue}</span>
                      <span>Low Precision: {reviewBreakdown.low_precision}</span>
                      <span>Other: {reviewBreakdown.other}</span>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Grouped by issue so repeated copies do not inflate workload.</p>
                    <select
                      aria-label="Needs review reason filter"
                      value={reviewReasonFilter}
                      onChange={(event) => setReviewReasonFilter(event.target.value as ReviewReasonFilter)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="all">All</option>
                      <option value="route_alias">Route Alias</option>
                      <option value="house_number">House Number</option>
                      <option value="low_precision">Low Precision</option>
                      <option value="county_rescue">County Rescue</option>
                      <option value="missing_street_number">Missing Street Number</option>
                    </select>
                  </div>
                  <div className="mb-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => void handleApproveSelectedNeedsReview()}
                      disabled={selectedNeedsReviewCount === 0}
                      className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                    >
                      Approve Selected
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label="Select all needs review rows"
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={allNeedsReviewSelected}
                                onChange={(event) => {
                                  setSelectedNeedsReviewRowIds(
                                    event.target.checked ? new Set(allNeedsReviewRowIds) : new Set(),
                                  );
                                }}
                              />
                            </th>
                            <th className="px-4 py-3">Record ID / Row</th>
                            <th className="px-4 py-3">Original Address</th>
                            <th className="px-4 py-3">Matched Address</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Reason</th>
                            {showDebugMode ? <th className="px-4 py-3">Raw Preview</th> : null}
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {needsReviewGroups.length === 0 ? (
                            <tr>
                              <td
                                className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                colSpan={showDebugMode ? 8 : 7}
                              >
                                No rows need review.
                              </td>
                            </tr>
                          ) : (
                            paginatedNeedsReviewGroups.map((group) => {
                              const row = group.displayRow;
                              const groupCapabilities = getGroupApprovalCapabilities(group);
                              const isRowBusy =
                                approvingRowIds.has(row.source_row_id) ||
                                retryingRowIds.has(row.source_row_id);
                              const groupSelected = group.memberRowIds.every((rowId) =>
                                selectedNeedsReviewRowIds.has(rowId),
                              );
                              return (
                                <Fragment key={group.groupKey}>
                                  <tr
                                    key={group.groupKey}
                                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                                    onClick={() => openReviewDrawer(row)}
                                  >
                                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        aria-label={`Select row group ${getRowDisplayId(row)}`}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        disabled={!groupCapabilities.canApproveMatched}
                                        checked={groupSelected}
                                        title={groupCapabilities.canApproveMatched ? 'Select for bulk approve' : groupCapabilities.blocker ?? 'Approval unavailable'}
                                        onChange={(event) => {
                                          setSelectedNeedsReviewRowIds((prev) => {
                                            const next = new Set(prev);
                                            if (event.target.checked) {
                                              group.memberRowIds.forEach((rowId) => next.add(rowId));
                                            } else {
                                              group.memberRowIds.forEach((rowId) => next.delete(rowId));
                                            }
                                            return next;
                                          });
                                        }}
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getRowDisplayId(row)}
                                      {group.count > 1 ? (
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{group.count} rows affected</p>
                                      ) : null}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{renderOriginalAddressCell(row)}</td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedAddress(row) || '--'}</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{getStatusLabel(row)}</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                      {renderReasonCell(row)}
                                    </td>
                                    {showDebugMode ? <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{stringifyPreview(row.raw_row)}</td> : null}
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex min-w-[170px] flex-col items-stretch gap-2" onClick={(event) => event.stopPropagation()} role="presentation">
                                        <button type="button" onClick={() => openReviewDrawer(row)} disabled={isRowBusy} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Review</button>
                                        {renderApprovalAction(row, false)}
                                      </div>
                                    </td>
                                  </tr>
                                </Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      totalCount={filteredNeedsReviewGroups.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                      perPageLabel="Issues per page"
                      rangeContext={`issues · ${needsReviewRows.length} rows`}
                    />
                  </div>
                  </>
                ) : null}
                {activeTab === 'skipped' ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                      Skipped rows were ignored because no usable property address could be detected.
                      Click Review to see full row data.
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Record ID / Row</th>
                            <th className="px-4 py-3">Detected Address</th>
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
                                colSpan={showDebugMode ? 7 : 6}
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
                                  {getSkippedOriginalAddress(row)}
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
                                        onClick={() => void handleCopyRowJson(row)}
                                       
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
                    {duplicateRowGroups.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        No duplicate groups detected.
                      </div>
                    ) : (
                      paginatedDuplicateRowGroups.map((group, index) => {
                        const isExpanded = expandedDuplicateGroups.has(group.groupKey);
                        const rowCount = group.count;
                        const duplicateCount = Math.max(0, rowCount - 1);
                        const displayRow = group.displayRow;
                        return (
                          <div
                            key={group.groupKey}
                            className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Group {(resultsPage - 1) * resultsPageSize + index + 1}
                                </p>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {getMatchedAddress(displayRow) || getInputAddress(displayRow) || '--'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Group key: {group.groupKey}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                  Rows: {rowCount} • Duplicates: {duplicateCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleDuplicateGroup(group.groupKey)}
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
                    <TablePagination
                      totalCount={duplicateRowGroups.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                    />
                  </div>
                ) : null}
                {activeTab === 'out_of_scope' ? (
                  <>
                  <div className="mb-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => void handleApproveSelectedOutOfScope()}
                      disabled={selectedOutOfScopeCount === 0}
                      className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                    >
                      Approve Selected
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label="Select all out of scope rows"
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={allOutOfScopeSelected}
                                onChange={(event) => {
                                  setSelectedOutOfScopeRowIds(
                                    event.target.checked ? new Set(allOutOfScopeRowIds) : new Set(),
                                  );
                                }}
                              />
                            </th>
                            <th className="px-4 py-3">Record ID / Row</th>
                            <th className="px-4 py-3">Original Address</th>
                            <th className="px-4 py-3">Matched Address</th>
                            <th className="px-4 py-3">Matched County</th>
                            <th className="px-4 py-3">Matched City</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Reason</th>
                            {showDebugMode ? <th className="px-4 py-3">Raw Preview</th> : null}
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {outOfScopeGroups.length === 0 ? (
                            <tr>
                              <td
                                className="px-4 py-6 text-center text-slate-500 dark:text-slate-400"
                                colSpan={showDebugMode ? 10 : 9}
                              >
                                No out-of-scope rows.
                              </td>
                            </tr>
                          ) : (
                            paginatedOutOfScopeGroups.map((group) => {
                              const row = group.displayRow;
                              const groupCapabilities = getGroupApprovalCapabilities(group);
                              const isRowBusy =
                                approvingRowIds.has(row.source_row_id) ||
                                retryingRowIds.has(row.source_row_id);
                              return (
                                <Fragment key={group.groupKey}>
                                  <tr className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => openReviewDrawer(row)}>
                                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        aria-label={`Select out of scope row group ${getRowDisplayId(row)}`}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        disabled={!groupCapabilities.canApproveWithScopeOverride}
                                        checked={group.memberRowIds.every((rowId) => selectedOutOfScopeRowIds.has(rowId))}
                                        title={groupCapabilities.canApproveWithScopeOverride ? 'Select for bulk approve' : groupCapabilities.blocker ?? 'Approval unavailable'}
                                        onChange={(event) => {
                                          setSelectedOutOfScopeRowIds((prev) => {
                                            const next = new Set(prev);
                                            if (event.target.checked) {
                                              group.memberRowIds.forEach((rowId) => next.add(rowId));
                                            } else {
                                              group.memberRowIds.forEach((rowId) => next.delete(rowId));
                                            }
                                            return next;
                                          });
                                        }}
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getRowDisplayId(row)}
                                      {group.count > 1 ? (
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{group.count} rows affected</p>
                                      ) : null}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{renderOriginalAddressCell(row)}</td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-normal break-words">{getMatchedAddress(row) || '—'}</td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedCounty(row) || '—'}</td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getMatchedCity(row) || '—'}</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{getStatusLabel(row)}</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                      {renderReasonCell(row)}
                                    </td>
                                    {showDebugMode ? <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{stringifyPreview(row.raw_row)}</td> : null}
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex min-w-[170px] flex-col items-stretch gap-2" onClick={(event) => event.stopPropagation()} role="presentation">
                                        <button type="button" onClick={() => openReviewDrawer(row)} disabled={isRowBusy} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Review</button>
                                        {renderApprovalAction(row, isOutOfScopeRow(row))}
                                      </div>
                                    </td>
                                  </tr>
                                </Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      totalCount={outOfScopeGroups.length}
                      page={resultsPage}
                      pageSize={resultsPageSize}
                      onPageChange={setResultsPage}
                      onPageSizeChange={setResultsPageSize}
                    />
                  </div>
                  </>
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
                Group {activeReviewIndex >= 0 ? `${activeReviewIndex + 1} of ${activeReviewGroups.length}` : 'row'}
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
                <div className="mt-1 flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {reviewDetectedAddress || '—'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyReviewAddress(reviewDetectedAddress)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    disabled={!reviewDetectedAddress}
                  >
                    Copy
                  </button>
                </div>
                {reviewCompareInput.showNormalized ? (
                  <>
                    <p className="mt-3 text-xs uppercase text-slate-500 dark:text-slate-400">
                      Compared as
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {reviewCompareInput.normalized}
                    </p>
                  </>
                ) : null}
                <p className="mt-3 text-xs uppercase text-slate-500 dark:text-slate-400">
                  Verified address
                </p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {reviewVerifiedAddress || '—'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyReviewAddress(reviewVerifiedAddress)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    disabled={!reviewVerifiedAddress}
                  >
                    Copy
                  </button>
                </div>
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Address diff</p>
                  {renderTokenDiff(reviewDetectedAddress || '', reviewVerifiedAddress || '')}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  Why this happened
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {reviewReason?.label || 'Needs review'}
                </p>
                <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  <p>{reviewRow ? getReasonSummary(reviewRow) : 'Review this row for more context.'}</p>
                  {showDebugMode && reviewRow?.reason_code ? (
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      Reason code: {reviewRow.reason_code}
                    </p>
                  ) : null}
                </div>
              </div>


              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3"><p className="text-xs uppercase text-slate-500 dark:text-slate-400">Location check</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${reviewScopePass ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200'}`}>{reviewScopePass ? 'In scope' : 'Out of scope'}</span></div>
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">Selected</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {[reviewSelectedCity || null, reviewSelectedCounty || null, reviewSelectedState || null].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-slate-400">Detected</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {[reviewMatchedCity || null, reviewMatchedCounty || null, reviewMatchedState || null].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  {reviewMismatchField ? (
                    <div className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                      Mismatch: {String(reviewMismatchField).replace(/_/g, ' ')}
                    </div>
                  ) : null}
                </div>
              </div>


              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Raw row JSON</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyRowJson(reviewRow?.raw_row ?? {})}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Copy JSON
                  </button>
                </div>
                <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
{JSON.stringify(reviewRow?.raw_row ?? {}, null, 2)}</pre>
              </div>

              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                {canEditReview ? (
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
                {!canReviewApprove && !canReviewForceOverride && reviewApprovalBlocker ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Approval unavailable.</span>{' '}
                    {reviewApprovalBlocker}
                  </div>
                ) : null}
                {canReviewForceOverride ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    Override to Valid bypasses the normal safety checks and always requires a reason.
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeReviewDrawer}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Close
                  </button>
                  <button type="button" onClick={() => navigateReviewRow('next')} disabled={!canReviewNext} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Skip & Next</button>
                  {canEditReview ? (
                    <button type="button" onClick={async () => { const nextGroup = canReviewNext ? activeReviewGroups[activeReviewIndex + 1] : null; queueReviewNavigation(activeTab === 'out_of_scope' ? 'out_of_scope' : activeTab === 'skipped' ? 'skipped' : 'needs_review', nextGroup?.groupKey ?? null); const succeeded = await handleReviewRetry(); if (!succeeded) { setPendingReviewNavigation(null); } }} disabled={!canEditReview || reviewSaving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-300">{reviewSaving ? 'Retrying...' : 'Retry & Next'}</button>
                  ) : null}
                  {canReviewForceOverride ? (
                    <button type="button" onClick={async () => { if (reviewRow) { const nextGroup = canReviewNext ? activeReviewGroups[activeReviewIndex + 1] : null; queueReviewNavigation(activeTab === 'out_of_scope' ? 'out_of_scope' : activeTab === 'skipped' ? 'skipped' : 'needs_review', nextGroup?.groupKey ?? null); const succeeded = await handleForceOverride(reviewRow); if (!succeeded) { setPendingReviewNavigation(null); } } }} disabled={!reviewRow || approvingRowIds.has(reviewRow.source_row_id)} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:bg-amber-300">Override & Next</button>
                  ) : (
                    <button type="button" onClick={async () => { if (reviewRow) { const nextGroup = canReviewNext ? activeReviewGroups[activeReviewIndex + 1] : null; queueReviewNavigation(activeTab === 'out_of_scope' ? 'out_of_scope' : activeTab === 'skipped' ? 'skipped' : 'needs_review', nextGroup?.groupKey ?? null); const succeeded = await handleApproveMatched(reviewRow, reviewOutOfScope); if (!succeeded) { setPendingReviewNavigation(null); } } }} disabled={!reviewRow || !canReviewApprove || approvingRowIds.has(reviewRow.source_row_id)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:bg-emerald-300">Approve & Next</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
