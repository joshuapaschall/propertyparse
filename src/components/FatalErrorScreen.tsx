import { useMemo, useState } from 'react';

type FatalErrorScreenProps = {
  errorMessage: string;
  stackTrace: string;
  isChunkLoadError: boolean;
};

export default function FatalErrorScreen({ errorMessage, stackTrace, isChunkLoadError }: FatalErrorScreenProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const errorDetails = useMemo(() => {
    const details = [
      `Message: ${errorMessage || 'Unknown error'}`,
      stackTrace ? `Stack:\n${stackTrace}` : 'Stack: unavailable',
    ];

    return details.join('\n\n');
  }, [errorMessage, stackTrace]);

  const handleReload = () => {
    window.location.reload();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorDetails);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-50">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl md:p-8">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-slate-300">
          We hit an unexpected error. You can reload the page or copy the details to share with support.
        </p>

        {isChunkLoadError ? (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Update detected. Please reload.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleReload}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Copy details
          </button>
          {copyStatus === 'copied' ? <span className="self-center text-xs text-emerald-300">Copied.</span> : null}
          {copyStatus === 'failed' ? (
            <span className="self-center text-xs text-rose-300">Unable to copy automatically.</span>
          ) : null}
        </div>

        <details className="mt-6 rounded-lg border border-slate-700 bg-slate-950/60">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200">Details</summary>
          <div className="border-t border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-300">{errorMessage || 'Unknown error message'}</p>
            <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap text-xs text-slate-400">
              {stackTrace || 'No component stack trace available.'}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}
