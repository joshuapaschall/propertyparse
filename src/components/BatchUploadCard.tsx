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

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const;
const DOCUMENT_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls', '.pdf', '.doc', '.docx'] as const;
const ALL_ACCEPTED = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS] as const;
const ACCEPT_ATTRIBUTE = ALL_ACCEPTED.join(',');
const DEFAULT_MAX_IMAGES = 2000;
const DEFAULT_MAX_DOCUMENTS = 100;
const DEFAULT_MAX_DOC_SIZE_BYTES = 25 * 1024 * 1024;
const COLLAPSE_LIST_THRESHOLD = 10;

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const getLowerExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
};

const isImageExtension = (ext: string): boolean =>
  (IMAGE_EXTENSIONS as readonly string[]).includes(ext);

const isDocumentExtension = (ext: string): boolean =>
  (DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);

const hasAcceptedExtension = (fileName: string): boolean => {
  const lowerExt = getLowerExtension(fileName);
  return (ALL_ACCEPTED as readonly string[]).includes(lowerExt);
};

export type BatchUploadRejectionReason = 'type' | 'count' | 'size' | 'empty';

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
  maxImages?: number;
  maxDocuments?: number;
  maxDocumentSizeBytes?: number;
  onReject?: (rejection: BatchUploadRejection) => void;
  /** When true, the card is in "processing" state: inputs disabled. */
  submitting?: boolean;
};

export default function BatchUploadCard({
  files,
  onChange,
  maxFiles,
  maxImages,
  maxDocuments = DEFAULT_MAX_DOCUMENTS,
  maxDocumentSizeBytes = DEFAULT_MAX_DOC_SIZE_BYTES,
  onReject,
  submitting = false,
}: BatchUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolvedMaxImages = maxImages ?? maxFiles ?? DEFAULT_MAX_IMAGES;
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const appendFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const accepted: File[] = [];
      const rejectedType: File[] = [];
      const rejectedSize: File[] = [];
      const rejectedZeroByte: File[] = [];

      for (const candidate of incoming) {
        const ext = getLowerExtension(candidate.name);
        if (!hasAcceptedExtension(candidate.name)) {
          rejectedType.push(candidate);
          continue;
        }
        if (candidate.size === 0) {
          rejectedZeroByte.push(candidate);
          continue;
        }
        if (isDocumentExtension(ext) && candidate.size > maxDocumentSizeBytes) {
          rejectedSize.push(candidate);
          continue;
        }
        accepted.push(candidate);
      }

      if (rejectedType.length > 0) {
        const message = `Unsupported file type${rejectedType.length > 1 ? 's' : ''}. Batch upload accepts ${ALL_ACCEPTED.join(', ')} only.`;
        setInlineError(message);
        onReject?.({ reason: 'type', message, rejectedFiles: rejectedType });
      }

      if (rejectedZeroByte.length > 0) {
        const message = `${rejectedZeroByte.length} file(s) skipped because they are 0 bytes (empty). Check that your files are saved correctly and try again.`;
        setInlineError(message);
        onReject?.({ reason: 'empty', message, rejectedFiles: rejectedZeroByte });
      }

      if (rejectedSize.length > 0) {
        const first = rejectedSize[0];
        const message = `${first.name} is ${formatBytes(first.size)}, exceeds the ${formatBytes(maxDocumentSizeBytes)} limit.`;
        setInlineError(message);
        onReject?.({ reason: 'size', message, rejectedFiles: rejectedSize });
      }

      const existingImageCount = files.filter((file) => isImageExtension(getLowerExtension(file.name))).length;
      const existingDocumentCount = files.length - existingImageCount;
      const incomingImages = accepted.filter((file) => isImageExtension(getLowerExtension(file.name)));
      
      const acceptedAfterLimits = accepted.slice();
      if (existingImageCount + incomingImages.length > resolvedMaxImages) {
        const allowed = Math.max(0, resolvedMaxImages - existingImageCount);
        const rejectedImageCount = incomingImages.length - allowed;
        const message = `Image limit is ${resolvedMaxImages} per batch; you have ${existingImageCount} images selected and tried to add ${incomingImages.length} more.`;
        setInlineError(message);
        onReject?.({ reason: 'count', message, rejectedFiles: incomingImages.slice(allowed) });
        let removed = 0;
        for (let i = acceptedAfterLimits.length - 1; i >= 0 && removed < rejectedImageCount; i -= 1) {
          if (isImageExtension(getLowerExtension(acceptedAfterLimits[i].name))) {
            acceptedAfterLimits.splice(i, 1);
            removed += 1;
          }
        }
      }

      const acceptedDocumentFiles = acceptedAfterLimits.filter((file) => !isImageExtension(getLowerExtension(file.name)));
      if (existingDocumentCount + acceptedDocumentFiles.length > maxDocuments) {
        const allowed = Math.max(0, maxDocuments - existingDocumentCount);
        const message = `Document limit is ${maxDocuments} per batch; you have ${existingDocumentCount} documents selected and tried to add ${acceptedDocumentFiles.length} more.`;
        setInlineError(message);
        onReject?.({ reason: 'count', message, rejectedFiles: acceptedDocumentFiles.slice(allowed) });
        let keptDocs = 0;
        const nextAccepted: File[] = [];
        for (const file of acceptedAfterLimits) {
          if (isImageExtension(getLowerExtension(file.name))) {
            nextAccepted.push(file);
            continue;
          }
          if (keptDocs < allowed) {
            nextAccepted.push(file);
            keptDocs += 1;
          }
        }
        if (nextAccepted.length === 0) return;
        onChange([...files, ...nextAccepted]);
        return;
      }

      if (acceptedAfterLimits.length === 0) return;
      if (rejectedType.length === 0 && rejectedSize.length === 0 && rejectedZeroByte.length === 0) {
        const countRejected =
          existingImageCount + incomingImages.length > resolvedMaxImages ||
          existingDocumentCount + acceptedDocumentFiles.length > maxDocuments;
        if (!countRejected) setInlineError(null);
      }
      onChange([...files, ...acceptedAfterLimits]);
    },
    [files, maxDocumentSizeBytes, maxDocuments, onChange, onReject, resolvedMaxImages],
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
            Drag &amp; drop files here
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Or click to choose multiple files.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {files.length === 0 ? 'Choose files' : 'Add more'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Mix images and documents in one batch. Images (PNG, JPG, JPEG) are compressed and stitched into PDFs automatically — up to {resolvedMaxImages} per batch. Documents (CSV, TSV, XLSX, XLS, PDF, DOC, DOCX) upload as-is, up to {maxDocuments} per batch, {formatBytes(maxDocumentSizeBytes)} each.
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
                {files.length} file{files.length === 1 ? '' : 's'} selected ({(() => {
                  const imageCount = files.filter((file) => isImageExtension(getLowerExtension(file.name))).length;
                  const documentCount = files.length - imageCount;
                  const parts = [
                    imageCount > 0 ? `${imageCount} image${imageCount === 1 ? '' : 's'}` : null,
                    documentCount > 0 ? `${documentCount} document${documentCount === 1 ? '' : 's'}` : null,
                  ].filter(Boolean);
                  return parts.join(', ');
                })()})
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
              {files.length} file{files.length === 1 ? '' : 's'} selected ({(() => {
              const imageCount = files.filter((file) => isImageExtension(getLowerExtension(file.name))).length;
              const documentCount = files.length - imageCount;
              const parts = [
                imageCount > 0 ? `${imageCount} image${imageCount === 1 ? '' : 's'}` : null,
                documentCount > 0 ? `${documentCount} document${documentCount === 1 ? '' : 's'}` : null,
              ].filter(Boolean);
              return parts.join(', ');
            })()}).
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
