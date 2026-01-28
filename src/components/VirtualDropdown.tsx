import { useEffect, useRef, useState } from 'react';
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
          <List height={260} itemCount={items.length} itemSize={38} width="100%">
            {({ index, style }) => {
              const item = items[index];
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
