import type { RowResult } from '../types/parse';

type GroupedRow = {
  groupKey: string;
  displayRow: RowResult;
  count: number;
  memberRowIds: string[];
};

const normalizeAddressValue = (value?: string | null) =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getNormalizedInput = (row: RowResult) => {
  const rowRecord = row as RowResult & { normalized_input?: string };
  return normalizeAddressValue(rowRecord.normalized_input);
};

const defaultGroupKey = (row: RowResult) => {
  return (
    getNormalizedInput(row) ||
    normalizeAddressValue(row.detected_address) ||
    normalizeAddressValue(row.matched_address) ||
    normalizeAddressValue(row.address_raw) ||
    row.source_row_id
  );
};

export const groupRows = (
  rows: RowResult[],
  keyFn: (row: RowResult) => string = defaultGroupKey,
): GroupedRow[] => {
  const groups = new Map<string, GroupedRow>();

  rows.forEach((row) => {
    const resolvedKey = keyFn(row) || row.source_row_id;
    const existing = groups.get(resolvedKey);
    if (!existing) {
      groups.set(resolvedKey, {
        groupKey: resolvedKey,
        displayRow: row,
        count: 1,
        memberRowIds: [row.source_row_id],
      });
      return;
    }
    existing.count += 1;
    existing.memberRowIds.push(row.source_row_id);
  });

  return Array.from(groups.values());
};

export type { GroupedRow };
