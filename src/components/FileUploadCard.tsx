import { useRef } from 'react';

const ACCEPTED_TYPES = [
  '.csv',
  '.xlsx',
  '.xls',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.docx',
];

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

type FileUploadCardProps = {
  file: File | null;
  onChange: (file: File | null) => void;
};

export default function FileUploadCard({ file, onChange }: FileUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Upload File</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            CSV, XLSX, XLS, PDF, PNG, JPG, JPEG, DOCX
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {file ? 'Replace' : 'Select'}
        </button>
      </div>
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-900/60">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            onChange(nextFile);
          }}
        />
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{file.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(file.size)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Drag a file here or click “Select” to browse.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Choose File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
