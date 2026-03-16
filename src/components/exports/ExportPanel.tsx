import { useMemo, useRef } from 'react';
import type { JobExportType } from '../../lib/api';
import { getExportGroups } from '../../lib/exportCatalog';
import type { ExportCatalogItem } from '../../types/exports';
import ExportCard from './ExportCard';

type ExportPanelProps = {
  catalog: ExportCatalogItem[];
  onDownload: (type: JobExportType, label: string) => void;
  activeDownloadType: JobExportType | null;
  disabled?: boolean;
  triggerLabel?: string;
  className?: string;
  excludeTypes?: JobExportType[];
};

export default function ExportPanel({
  catalog,
  onDownload,
  activeDownloadType,
  disabled = false,
  triggerLabel = 'Export',
  className,
  excludeTypes = [],
}: ExportPanelProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const filteredCatalog = useMemo(() => catalog.filter((item) => !excludeTypes.includes(item.type)), [catalog, excludeTypes]);
  const groups = useMemo(() => getExportGroups(filteredCatalog), [filteredCatalog]);

  return (
    <details ref={detailsRef} className={className ?? 'relative inline-block text-left'}>
      <summary className="list-none rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
        {triggerLabel}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[28rem] max-w-[95vw] rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-4">
          {groups.map((group) =>
            group.items.length ? (
              <section key={group.id}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{group.title}</h3>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{group.description}</p>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <ExportCard
                      key={item.type}
                      item={item}
                      onDownload={(type, label) => {
                        onDownload(type, label);
                        detailsRef.current?.removeAttribute('open');
                      }}
                      disabled={disabled}
                      loading={activeDownloadType === item.type}
                      compact
                    />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      </div>
    </details>
  );
}
