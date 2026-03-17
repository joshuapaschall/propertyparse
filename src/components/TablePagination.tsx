type TablePaginationProps = {
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  perPageLabel?: string;
  rangeContext?: string;
};

export default function TablePagination({
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  perPageLabel = "Rows per page",
  rangeContext,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const start = totalCount === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const end = totalCount === 0 ? 0 : Math.min(totalCount, clampedPage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <div className="flex items-center gap-2">
        <span>{perPageLabel}</span>
        <select
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span>
          {start}–{end} of {totalCount}{rangeContext ? ` ${rangeContext}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(clampedPage - 1)}
            disabled={clampedPage <= 1}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900 dark:disabled:border-slate-800 dark:disabled:text-slate-600"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => onPageChange(clampedPage + 1)}
            disabled={clampedPage >= totalPages}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900 dark:disabled:border-slate-800 dark:disabled:text-slate-600"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
