import {
  useRef,
  useState,
  useCallback,
  type DragEvent,
  type ChangeEvent,
} from 'react';

/**
 * Phase B2a — multi-file image upload card for the batch flow.
 *
 * Mirrors FileUploadCard's visual style (drop zone, dark-mode classes,
 * inline error pattern) but takes a File[] and is locked to PNG/JPG/JPEG.
 * Selecting more files APPENDS to the existing list — users drop
 * screenshots in waves. There's a per-file remove + a "Remove all".
 */

const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');
const DEFAULT_MAX_FILES = 2000;
const COLLAPSE_LIST_THRESHOLD = 10;

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const hasAcceptedExtension = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

export type BatchUploadRejectionReason = 'type' | 'count';

export type BatchUploadRejection = {
  reason: BatchUploadRejectionReason;
  message: string;
  rejectedFiles: File[];
};

type BatchUploadCardProps = {
  files: File[];
  onChange: (files: File[]) => void;
  /** Max images per batch. Defaults to 2000. */
  maxFiles?: number;
  onReject?: (rejection: BatchUploadRejection) => void;
  /** When true, the card is in "processing" state: inputs disabled. */
  submitting?: boolean;
};

export default function BatchUploadCard({
  files,
  onChange,
  maxFiles = DEFAULT_MAX_FILES,
  onReject,
  submitting = false,
}: BatchUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const appendFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      // Partition into accepted + rejected by extension.
      const rejected: File[] = [];
      const accepted: File[] = [];
      for (const candidate of incoming) {
        if (hasAcceptedExtension(candidate.name)) {
          accepted.push(candidate);
        } else {
          rejected.push(candidate);
        }
      }
      if (rejected.length > 0) {
        const message = `Unsupported file type${rejected.length > 1 ? 's' : ''}. Batch upload accepts ${ACCEPTED_EXTENSIONS.join(', ')} only.`;
        setInlineError(message);
        onReject?.({ reason: 'type', message, rejectedFiles: rejected });
        if (accepted.length === 0) return;
      }
      if (files.length + accepted.length > maxFiles) {
        const message = `Batch limit is ${maxFiles} images; you have ${files.length} selected and tried to add ${accepted.length} more.`;
        setInlineError(message);
        onReject?.({ reason: 'count', message, rejectedFiles: accepted });
        return;
      }
      if (rejected.length === 0) setInlineError(null);
      onChange([...files, ...accepted]);
    },
    [files, maxFiles, onChange, onReject],
  );

  const removeAt = useCallback(
    (index: number) => {
      if (submitting) return;
      const next = files.slice();
      next.splice(index, 1);
      onChange(next);
      setInlineError(null);
    },
    [files, onChange, submitting],
  );

  const removeAll = useCallback(() => {
    if (submitting) return;
    onChange([]);
    setInlineError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [onChange, submitting]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(event.target.files ?? []);
    appendFiles(list);
    // Reset so the same files can be re-selected after a removal.
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (submitting) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    if (submitting) return;
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    appendFiles(dropped);
  };

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const showCollapsedSummary = files.length > COLLAPSE_LIST_THRESHOLD;
  const dropZoneClass = [
    'rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
    submitting
      ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-70 dark:border-slate-800 dark:bg-slate-900/40'
      : isDragOver
        ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-300 dark:bg-indigo-900/30'
        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60',
  ].join(' ');

  return (
    <div className="space-y-4">
      <div
        className={dropZoneClass}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="batch-upload-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="hidden"
          onChange={handleInputChange}
          disabled={submitting}
          data-testid="batch-upload-input"
        />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Drag &amp; drop screenshots here
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Or click to choose multiple images.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {files.length === 0 ? 'Choose Images' : 'Add more'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Drop screenshots — they&apos;ll be compressed and stitched into PDFs automatically. Up to {maxFiles} images per batch. PNG, JPG, JPEG only.
      </p>
      {inlineError ? (
        <p
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200"
          role="alert"
          data-testid="batch-upload-inline-error"
        >
          {inlineError}
        </p>
      ) : null}
      {files.length > 0 ? (
        <div
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950"
          data-testid="batch-upload-file-list"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                {files.length} image{files.length === 1 ? '' : 's'} selected
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total: {formatBytes(totalBytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={removeAll}
              disabled={submitting}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
              data-testid="batch-upload-remove-all"
            >
              Remove all
            </button>
          </div>
          {showCollapsedSummary ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {files.length} files selected ({formatBytes(totalBytes)}). Individual files will be processed in order.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}-${file.size}`}
                  data-testid={`batch-upload-file-${index}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                      {file.name}
                    </p>
                    <p className="text-[0.7rem] text-slate-500 dark:text-slate-400">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    disabled={submitting}
                    aria-label={`Remove ${file.name}`}
                    className="rounded-md px-2 py-0.5 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200 dark:hover:bg-rose-500/20"
                    data-testid={`batch-upload-remove-${index}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
