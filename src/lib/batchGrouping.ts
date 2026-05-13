export type HistoryRow = {
  id: string;
  batchId: string | null;
  status: string;
  createdAt: string | null;
  name: string;
  rowsReceived: number;
  validUnique: number;
  needsReview: number;
  outOfScope: number;
  skipped: number;
  duplicates: number;
  [key: string]: unknown;
};

export type GroupedEntry =
  | { type: 'standalone'; row: HistoryRow }
  | {
      type: 'batch-header';
      batchId: string;
      rows: HistoryRow[];
      totalRows: number;
      totalValid: number;
      totalReview: number;
      status: string;
      createdAt: string | null;
      name: string;
    };

export function groupJobsByBatch(rows: HistoryRow[]): GroupedEntry[] {
  const batchMap = new Map<string, HistoryRow[]>();
  const finalResult: GroupedEntry[] = [];
  const insertedBatches = new Set<string>();

  for (const row of rows) {
    if (row.batchId) {
      if (!batchMap.has(row.batchId)) batchMap.set(row.batchId, []);
      batchMap.get(row.batchId)!.push(row);
    }
  }

  for (const row of rows) {
    if (row.batchId) {
      if (!insertedBatches.has(row.batchId)) {
        insertedBatches.add(row.batchId);
        const batchRows = batchMap.get(row.batchId)!;
        const anyRunning = batchRows.some((batchRow) => batchRow.status === 'RUNNING');
        const anyFailed = batchRows.some((batchRow) => batchRow.status === 'FAILED');
        finalResult.push({
          type: 'batch-header',
          batchId: row.batchId,
          rows: batchRows,
          totalRows: batchRows.reduce((sum, batchRow) => sum + batchRow.rowsReceived, 0),
          totalValid: batchRows.reduce((sum, batchRow) => sum + batchRow.validUnique, 0),
          totalReview: batchRows.reduce((sum, batchRow) => sum + batchRow.needsReview, 0),
          status: anyRunning ? 'RUNNING' : anyFailed ? 'FAILED' : 'DONE',
          createdAt: batchRows[0].createdAt ?? '--',
          name: batchRows[0].name ?? 'Batch upload',
        });
      }
    } else {
      finalResult.push({ type: 'standalone', row });
    }
  }

  return finalResult;
}
