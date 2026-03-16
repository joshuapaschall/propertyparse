import type { JobExportType } from '../lib/api';

export type ExportIntentGroup = 'most_used' | 'fix_review' | 'audit_reference';

export type ExportCatalogItem = {
  type: JobExportType;
  label: string;
  description: string;
  intendedUse: string;
  group: ExportIntentGroup;
  filename?: string;
  fileType?: string;
  headers?: string[];
  rowCount?: number | null;
  available?: boolean;
};

export type ExportCatalogResponseItem = {
  type: string;
  label?: string;
  description?: string;
  filename?: string;
  file_type?: string;
  headers?: string[];
  intended_use?: string;
  row_count?: number;
  available?: boolean;
};
