import { useRef, useState, useCallback, type DragEvent, type ChangeEvent } from 'react';

const ACCEPTED_TYPES = [
  '.csv',
  '.xlsx',
  '.xls',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.docx',
  '.tsv',
  '.doc',
];

// Default 25 MiB to match PP_MAX_UPLOAD_MB on the API. Overridable via prop
// in case the deployment ever raises/lowers the limit.
const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const hasAcceptedExtension = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return ACCEPTED_TYPES.some((ext) => lower.endsWith(ext));
};

export type FileUploadRejectionReason = 'size' | 'type';

export type FileUploadRejection = {
  reason: FileUploadRejectionReason;
  message: string;
  file: File;
};

type FileUploadCardProps = {
  file: File | null;
  onChange: (file: File | null) => void;
  /**
   * Maximum file size in bytes. Defaults to 25 MiB.
   * Files exceeding this are rejected client-side before the upload starts.
   */
  maxSizeBytes?: number;
  /**
   * Called when a file is rejected client-side (size or type).
   * Optional — when omitted, the component still shows its own inline
   * error, but the parent can also surface the rejection in its own UI.
   */
  onReject?: (rejection: FileUploadRejection) => void;
};

export default function FileUploadCard({
  file,
  onChange,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  onReject,
}: FileUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const validateAndSet = useCallback(
    (candidate: File | null) => {
      if (!candidate) {
        setInlineError(null);
        onChange(null);
        return;
      }
      if (!hasAcceptedExtension(candidate.name)) {
        const message = `Unsupported file type. Supported: ${ACCEPTED_TYPES.join(', ')}.`;
        setInlineError(message);
        onReject?.({ reason: 'type', message, file: candidate });
        return;
      }
      if (candidate.size > maxSizeBytes) {
        const message = `File is ${formatBytes(candidate.size)}, exceeds the ${formatBytes(maxSizeBytes)} limit.`;
        setInlineError(message);
        onReject?.({ reason: 'size', message, file: candidate });
        return;
      }
      setInlineError(null);
      onChange(candidate);
    },
    [maxSizeBytes, onChange, onReject],
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    validateAndSet(nextFile);
    // If the same file is selected twice, the input doesn't fire 'change'
    // again — clear the value so the user can re-select after rejection.
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
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
    const droppedFile = event.dataTransfer?.files?.[0] ?? null;
    validateAndSet(droppedFile);
  };

  const dropZoneClass = [
    'rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
    isDragOver
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
        data-testid="file-upload-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={handleInputChange}
          data-testid="file-upload-input"
        />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Drag &amp; drop your file here
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Or click to browse from your computer.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Choose File
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Supported formats: CSV, TSV, XLSX, XLS, PDF, PNG, JPG, JPEG, DOC, DOCX. Max size: {formatBytes(maxSizeBytes)}.
      </p>
      {inlineError ? (
        <p
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200"
          role="alert"
          data-testid="file-upload-inline-error"
        >
          {inlineError}
        </p>
      ) : null}
      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">{file.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(file.size)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs font-semibold text-indigo-600 underline-offset-2 transition hover:text-indigo-700 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              Change file
            </button>
            <button
              type="button"
              onClick={() => {
                setInlineError(null);
                onChange(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
