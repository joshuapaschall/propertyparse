import { describe, expect, it } from 'vitest';
import { FALLBACK_EXPORT_CATALOG, getExportGroups, normalizeExportCatalog } from './exportCatalog';

describe('export catalog utilities', () => {
  it('uses fallback catalog with PropStream when API catalog is unavailable', () => {
    const catalog = normalizeExportCatalog(undefined);
    expect(catalog).toEqual(FALLBACK_EXPORT_CATALOG);
    expect(catalog.some((item) => item.type === 'propstream_import')).toBe(true);
  });

  it('normalizes API catalog and keeps fallback entries', () => {
    const catalog = normalizeExportCatalog([
      {
        type: 'unique_valid',
        label: 'Unique Valid',
        description: 'API description',
        intended_use: 'API intended use',
        file_type: 'CSV',
      },
    ]);

    expect(catalog.find((item) => item.type === 'unique_valid')?.description).toBe('API description');
    expect(catalog.some((item) => item.type === 'original_file')).toBe(true);
    expect(catalog.some((item) => item.type === 'propstream_import')).toBe(true);
  });

  it('returns grouped export sections', () => {
    const groups = getExportGroups(FALLBACK_EXPORT_CATALOG);
    expect(groups.map((group) => group.title)).toEqual(['Most Used', 'Fix / Review', 'Audit / Reference']);
    expect(groups[0].items.some((item) => item.label === 'PropStream Import')).toBe(true);
  });
});
