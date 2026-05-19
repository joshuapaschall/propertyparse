import { useEffect, useState } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';
import type { SmartExtractPreviewItem } from '../lib/api';

type SmartExtractPreviewModalProps = {
  open: boolean;
  items: SmartExtractPreviewItem[];
  onClose: () => void;
  onContinue: (skipFileIds: Set<string>) => void;
  loading?: boolean;
};

export default function SmartExtractPreviewModal({ open, items, onClose, onContinue, loading = false }: SmartExtractPreviewModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(open, onClose);
  const [skipSet, setSkipSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSkipSet(new Set());
  }, [open]);

  if (!open) return null;
  const recommended = items.filter((it) => it.recommended);
  const skippedAuto = items.filter((it) => !it.recommended);

  const toggleSkip = (fileId: string) => {
    setSkipSet((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
  };
  const willUseCount = recommended.filter((it) => !skipSet.has(it.file_id)).length;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 dark:bg-slate-950/70" onClick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }} data-testid="smart-extract-preview-backdrop">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="smart-extract-preview-title" tabIndex={-1} className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950 dark:shadow-slate-950/50 focus:outline-none">
      <div className="flex items-start justify-between gap-4"><div><h3 id="smart-extract-preview-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">Smart Extract preview</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Smart Extract will be used on {willUseCount} of {items.length} file{items.length === 1 ? '' : 's'}. Spot-check the samples below before continuing.</p></div><button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Close</button></div>
      {recommended.length === 0 ? <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">None of these files need Smart Extract. They will all be processed normally.</div> : <ul className="mt-6 space-y-3">{recommended.map((item) => { const skipped = skipSet.has(item.file_id); return <li key={item.file_id} className={`rounded-xl border p-4 transition ${skipped ? 'border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900' : 'border-indigo-200 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10'}`} data-testid="smart-extract-preview-item"><label className="flex items-start gap-3"><input type="checkbox" checked={!skipped} onChange={() => toggleSkip(item.file_id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" aria-label={`Use Smart Extract for ${item.file_name}`} /><div className="flex-1 min-w-0"><p className="font-semibold text-slate-800 dark:text-slate-100 break-all">{item.file_name}</p>{item.profile ? <><p className="mt-1 text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Type:</span> {item.profile.kind.replace(/_/g, ' ')}</p><p className="text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Will extract:</span> {item.profile.address_zone}</p>{item.profile.exclude.length > 0 ? <p className="text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Will ignore:</span> {item.profile.exclude.join('; ')}</p> : null}<div className="mt-2"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Sample addresses:</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">{item.profile.sample_addresses.map((addr, i) => <li key={i}>{addr}</li>)}</ul></div></> : <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Could not classify this file. It will be processed normally.</p>}</div></label></li>; })}</ul>}
      {skippedAuto.length > 0 ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><p className="font-semibold">Skipped automatically (already clean):</p><ul className="mt-1 list-disc space-y-0.5 pl-5">{skippedAuto.map((it) => <li key={it.file_id} className="break-all">{it.file_name} <span className="text-slate-500 dark:text-slate-400">({it.reason})</span></li>)}</ul></div> : null}
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" disabled={loading}>Cancel</button><button type="button" onClick={() => onContinue(skipSet)} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60" data-testid="smart-extract-preview-continue">{loading ? 'Processing…' : `Continue with ${willUseCount} file${willUseCount === 1 ? '' : 's'}`}</button></div>
    </div>
  </div>;
}
