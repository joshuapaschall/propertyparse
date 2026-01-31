type ProgressIndicatorProps = {
  steps: string[];
  currentStep: number;
  percent?: number | null;
};

export default function ProgressIndicator({ steps, currentStep, percent }: ProgressIndicatorProps) {
  const clampedPercent =
    typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : null;

  return (
    <div className="space-y-4">
      {clampedPercent !== null ? (
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Progress</span>
            <span>{clampedPercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${clampedPercent}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-5">
          {steps.map((step, index) => {
            const isActive = index <= currentStep;
            return (
              <div
                key={step}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  isActive
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'
                    : 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500'
                }`}
              >
                {step}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
