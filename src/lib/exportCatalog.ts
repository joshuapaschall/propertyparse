import type { JobExportType } from './api';
import type { ExportCatalogItem, ExportCatalogResponseItem, ExportIntentGroup } from '../types/exports';

export type ExportGroup = {
  id: ExportIntentGroup;
  title: string;
  description: string;
  items: ExportCatalogItem[];
};

const GROUP_META: Record<ExportIntentGroup, { title: string; description: string }> = {
  most_used: {
    title: 'Most Used',
    description: 'Best options for immediate CRM import and follow-up workflows.',
  },
  fix_review: {
    title: 'Fix / Review',
    description: 'Use these files to investigate exceptions and clean unresolved rows.',
  },
  audit_reference: {
    title: 'Audit / Reference',
    description: 'Reference files for traceability, QA, and original-source review.',
  },
};

export const FALLBACK_EXPORT_CATALOG: ExportCatalogItem[] = [
  {
    type: 'propstream_import',
    label: 'PropStream Import',
    description: '8-column PropStream import file using preferred PropStream street formatting.',
    intendedUse: 'Best for uploading directly into PropStream.',
    group: 'most_used',
    fileType: 'CSV',
  },
  {
    type: 'unique_valid',
    label: 'Unique Valid',
    description: 'Deduplicated, verified addresses ready for marketing and list workflows.',
    intendedUse: 'Use for clean downstream mailing and outreach lists.',
    group: 'most_used',
    fileType: 'CSV',
  },
  {
    type: 'needs_review',
    label: 'Needs Review',
    description: 'Rows that could not be confidently matched and need manual correction.',
    intendedUse: 'Fix address issues before re-running or importing.',
    group: 'fix_review',
    fileType: 'CSV',
  },
  {
    type: 'out_of_scope',
    label: 'Out of Scope',
    description: 'Rows outside your selected state/county/city constraints.',
    intendedUse: 'Validate list targeting and remove geography mismatches.',
    group: 'fix_review',
    fileType: 'CSV',
  },
  {
    type: 'duplicates',
    label: 'Duplicates',
    description: 'Rows detected as duplicates of another input row.',
    intendedUse: 'Review duplicate handling and source list quality.',
    group: 'fix_review',
    fileType: 'CSV',
  },
  {
    type: 'skipped',
    label: 'Skipped',
    description: 'Rows intentionally skipped because usable address content was not found.',
    intendedUse: 'Audit incomplete source records and data extraction issues.',
    group: 'fix_review',
    fileType: 'CSV',
  },
  {
    type: 'processing_report',
    label: 'Processing Report',
    description: 'Full status report with reason codes and row-level parsing outcomes.',
    intendedUse: 'Operational QA, troubleshooting, and accountability.',
    group: 'audit_reference',
    fileType: 'CSV',
  },
  {
    type: 'original_file',
    label: 'Original Upload',
    description: 'Exact file that was originally uploaded for this job.',
    intendedUse: 'Use as source-of-truth reference for audits and backtracking.',
    group: 'audit_reference',
  },
];

const FALLBACK_BY_TYPE = new Map(FALLBACK_EXPORT_CATALOG.map((item) => [item.type, item]));

const isJobExportType = (value: string): value is JobExportType => FALLBACK_BY_TYPE.has(value as JobExportType);

export const normalizeExportCatalog = (catalog: ExportCatalogResponseItem[] | null | undefined): ExportCatalogItem[] => {
  if (!catalog?.length) {
    return FALLBACK_EXPORT_CATALOG;
  }

  const merged: ExportCatalogItem[] = [];

  for (const item of catalog) {
    if (typeof item.type !== 'string' || !isJobExportType(item.type)) {
      continue;
    }
    const fallback = FALLBACK_BY_TYPE.get(item.type);
    if (!fallback) {
      continue;
    }

    merged.push({
      ...fallback,
      label: item.label?.trim() || fallback.label,
      description: item.description?.trim() || fallback.description,
      filename: item.filename || fallback.filename,
      fileType: item.file_type || fallback.fileType,
      headers: Array.isArray(item.column_headers)
        ? item.column_headers
        : Array.isArray(item.headers)
          ? item.headers
          : fallback.headers,
      intendedUse: item.intended_use?.trim() || fallback.intendedUse,
      rowCount:
        typeof item.row_count_estimate === 'number'
          ? item.row_count_estimate
          : typeof item.row_count === 'number'
            ? item.row_count
            : fallback.rowCount,
      available: typeof item.available === 'boolean' ? item.available : true,
      contentType: item.content_type || fallback.contentType,
      sizeBytes: typeof item.size_bytes === 'number' ? item.size_bytes : fallback.sizeBytes,
      unavailableMessage: item.unavailable_message || fallback.unavailableMessage,
    });
  }

  for (const fallback of FALLBACK_EXPORT_CATALOG) {
    if (!merged.some((entry) => entry.type === fallback.type)) {
      merged.push(fallback);
    }
  }

  return merged;
};

export const getExportGroups = (catalog: ExportCatalogItem[]): ExportGroup[] => {
  return (Object.keys(GROUP_META) as ExportIntentGroup[]).map((groupId) => ({
    id: groupId,
    title: GROUP_META[groupId].title,
    description: GROUP_META[groupId].description,
    items: catalog.filter((item) => item.group === groupId),
  }));
};

export const getPrimaryExport = (catalog: ExportCatalogItem[], type: JobExportType) =>
  catalog.find((item) => item.type === type) ?? FALLBACK_BY_TYPE.get(type);
