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
  const [search, setSearch] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.toLowerCase().includes(query));
  }, [items, search]);

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

  useEffect(() => {
    if (open) {
      searchInputRef.current?.focus();
    }
  }, [open]);

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
        <span style={{ color: value ? '#111827' : '#9ca3af' }}>{value || placeholder || 'Select...'}</span>
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
          <div style={{ padding: 10, borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              style={{
                width: '100%',
                height: 34,
                borderRadius: 8,
                border: '1px solid #d1d5db',
                padding: '0 10px',
                fontSize: 14,
              }}
            />
          </div>
          <List height={260} itemCount={filteredItems.length} itemSize={38} width="100%">
            {({ index, style }) => {
              const item = filteredItems[index];
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
                    setSearch('');
                    setOpen(false);
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
