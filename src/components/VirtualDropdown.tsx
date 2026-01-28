import { useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';

type Props = {
  label: string;
  value: string;
  placeholder?: string;
  items: string[];
  disabled?: boolean;
  onChange: (next: string) => void;
};

export default function VirtualDropdown({ label, value, placeholder, items, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (boxRef.current && !boxRef.current.contains(t)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Filter is optional; scroll works even with empty filter
  const filtered = useMemo(() => {
    const q = (filter || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.toLowerCase().includes(q));
  }, [items, filter]);

  return (
    <div ref={boxRef} style={{ width: '100%' }}>
      <div style={{ fontSize: 14, marginBottom: 6, textAlign: 'center' }}>{label}</div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 8,
          border: '1px solid #d1d5db',
          background: disabled ? '#f3f4f6' : 'white',
          padding: '0 12px',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ color: value ? '#111827' : '#9ca3af' }}>
          {value || placeholder || 'Select...'}
        </span>
        <span style={{ opacity: 0.6 }}>▾</span>
      </button>

      {open && !disabled && (
        <div
          style={{
            marginTop: 8,
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            background: 'white',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 10, borderBottom: '1px solid #f3f4f6' }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="(optional) type to filter…"
              style={{
                width: '100%',
                height: 36,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                padding: '0 10px',
              }}
            />
          </div>

          <List height={280} itemCount={filtered.length} itemSize={38} width="100%">
            {({ index, style }) => {
              const item = filtered[index];
              return (
                <div
                  style={{
                    ...style,
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f9fafb',
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                    setFilter('');
                  }}
                >
                  {item}
                </div>
              );
            }}
          </List>
        </div>
      )}
    </div>
  );
}
