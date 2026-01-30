import { useEffect, useState } from 'react';

export type ParsedRow = {
  id: string;
  fullAddress: string;
  streetAddress: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  status: string;
  sourceRaw: string;
  unmatchedReason?: string;
  needsRetry?: boolean;
  original?: unknown;
};

type EditRowModalProps = {
  open: boolean;
  row: ParsedRow | null;
  onClose: () => void;
  onSave: (row: ParsedRow) => void;
};

export default function EditRowModal({ open, row, onClose, onSave }: EditRowModalProps) {
  const [draft, setDraft] = useState<ParsedRow | null>(row);

  useEffect(() => {
    setDraft(row);
  }, [row]);

  if (!open || !draft) {
    return null;
  }

  const update = (key: keyof ParsedRow, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Edit Parsed Row</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-600">
            <span>Full Address</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              value={draft.fullAddress}
              onChange={(event) => update('fullAddress', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>Street Address</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              value={draft.streetAddress}
              onChange={(event) => update('streetAddress', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>Address 2</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              value={draft.address2}
              onChange={(event) => update('address2', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>City</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              value={draft.city}
              onChange={(event) => update('city', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>State</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              value={draft.state}
              onChange={(event) => update('state', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>Zip Code</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              value={draft.zipCode}
              onChange={(event) => update('zipCode', event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600 md:col-span-2">
            <span>Source / Raw</span>
            <textarea
              className="min-h-[90px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              value={draft.sourceRaw}
              onChange={(event) => update('sourceRaw', event.target.value)}
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Save Row
          </button>
        </div>
      </div>
    </div>
  );
}
