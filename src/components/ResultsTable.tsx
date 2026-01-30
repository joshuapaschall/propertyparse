import { ParsedRow } from './EditRowModal';

type ResultsTableProps = {
  rows: ParsedRow[];
  variant: 'matched' | 'unmatched';
  showRaw: boolean;
  onEdit: (row: ParsedRow) => void;
  onRetry?: (row: ParsedRow) => void;
};

export default function ResultsTable({
  rows,
  variant,
  showRaw,
  onEdit,
  onRetry,
}: ResultsTableProps) {
  const formatSourceRaw = (row: ParsedRow) => {
    return row.sourceRaw;
  };

  const renderSourceDetails = (row: ParsedRow) => {
    const details: Array<{ label: string; value: string }> = [
      {
        label: 'verification_source',
        value: row.verificationSource ? row.verificationSource : '--',
      },
      {
        label: 'from_cache',
        value: typeof row.fromCache === 'boolean' ? String(row.fromCache) : '--',
      },
    ];

    if (row.placeId) {
      details.push({ label: 'place_id', value: row.placeId });
    }

    if (variant === 'unmatched' && row.unmatchedReason) {
      details.push({ label: 'unmatched_reason', value: row.unmatchedReason });
    }

    return (
      <div className="mt-2 space-y-1 text-[11px] text-slate-500">
        {details.map((detail) => (
          <div key={detail.label}>
            <span className="font-semibold text-slate-600">{detail.label}:</span> {detail.value}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Full Address</th>
              <th className="px-4 py-3">Street Address</th>
              <th className="px-4 py-3">Address 2</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Zip Code</th>
              {showRaw ? <th className="px-4 py-3">Source / Raw</th> : null}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={showRaw ? 8 : 7}>
                  No results yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{row.fullAddress}</td>
                  <td className="px-4 py-3 text-slate-700">{row.streetAddress}</td>
                  <td className="px-4 py-3 text-slate-700">{row.address2}</td>
                  <td className="px-4 py-3 text-slate-700">{row.city}</td>
                  <td className="px-4 py-3 text-slate-700">{row.state}</td>
                  <td className="px-4 py-3 text-slate-700">{row.zipCode}</td>
                  {showRaw ? (
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div>{formatSourceRaw(row)}</div>
                      {renderSourceDetails(row)}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      {variant === 'unmatched' && onRetry ? (
                        <button
                          type="button"
                          onClick={() => onRetry(row)}
                          className={`rounded-md px-2 py-1 text-xs font-semibold ${
                            row.needsRetry
                              ? 'border border-amber-200 bg-amber-50 text-amber-700'
                              : 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {row.needsRetry ? 'Needs Retry' : 'Retry'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
