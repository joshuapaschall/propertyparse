import clsx from 'clsx';

type AccountedRowsIndicatorProps = {
  rowsReceived: number | null;
  accountedRows: number | null;
};

export default function AccountedRowsIndicator({
  rowsReceived,
  accountedRows,
}: AccountedRowsIndicatorProps) {
  if (rowsReceived === null || accountedRows === null) {
    return (
      <p className="mt-2 flex h-4 items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <span aria-hidden>—</span>
        Accounted rows: — / —
      </p>
    );
  }

  const isBalanced = rowsReceived === accountedRows;
  return (
    <p
      className={clsx(
        'mt-2 flex h-4 items-center gap-2 text-xs font-semibold',
        isBalanced
          ? 'text-emerald-600 dark:text-emerald-300'
          : 'text-rose-600 dark:text-rose-300',
      )}
      data-testid="accounted-rows-indicator"
    >
      <span aria-hidden>{isBalanced ? '✓' : '⚠'}</span>
      Accounted rows: {accountedRows} / {rowsReceived}
    </p>
  );
}
