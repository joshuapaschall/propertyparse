import Button from '../ui/Button';
import type { ExportCatalogItem } from '../../types/exports';

type ExportCardProps = {
  item: ExportCatalogItem;
  onDownload: (type: ExportCatalogItem['type'], label: string) => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
};

export default function ExportCard({ item, onDownload, disabled = false, loading = false, compact = false }: ExportCardProps) {
  const unavailable = item.available === false;
  const isDisabled = disabled || unavailable || loading;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.label}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
          {!compact ? <p className="text-xs text-slate-500 dark:text-slate-400">{item.intendedUse}</p> : null}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            {item.fileType ? <span>{item.fileType}</span> : null}
            {item.filename ? <span>Example: {item.filename}</span> : null}
            {typeof item.rowCount === 'number' ? <span>{item.rowCount.toLocaleString()} rows</span> : null}
            {!item.filename && item.headers?.length ? <span>Includes {item.headers.length} columns</span> : null}
            {unavailable ? <span className="text-amber-600 dark:text-amber-300">Unavailable for this job</span> : null}
          </div>
        </div>
        <Button
          type="button"
          onClick={() => onDownload(item.type, item.label)}
          disabled={isDisabled}
          size="sm"
          variant={compact ? 'ghost' : 'secondary'}
          className="whitespace-nowrap"
        >
          {loading ? 'Downloading…' : 'Download'}
        </Button>
      </div>
    </div>
  );
}
