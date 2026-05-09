import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useModalA11y } from './useModalA11y';

function ModalHarness({ initialOpen = true, onCloseMock }: { initialOpen?: boolean; onCloseMock: () => void }) {
  const [open, setOpen] = useState(initialOpen);
  const ref = useModalA11y<HTMLDivElement>(open, () => {
    onCloseMock();
    setOpen(false);
  });
  if (!open) return <button data-testid="trigger">Trigger</button>;

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="title" tabIndex={-1} data-testid="modal">
      <h2 id="title">Test Modal</h2>
      <button data-testid="first-button">First</button>
      <input data-testid="middle-input" />
      <button data-testid="last-button">Last</button>
    </div>
  );
}

describe('useModalA11y', () => {
  it('closes when Escape is pressed inside the modal', () => {
    const onClose = vi.fn();
    render(<ModalHarness onCloseMock={onClose} />);
    fireEvent.keyDown(screen.getByTestId('first-button'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on Escape fired outside the modal', () => {
    const onClose = vi.fn();
    render(<ModalHarness onCloseMock={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores on close', () => {
    const onClose = vi.fn();
    const previousOverflow = document.body.style.overflow;
    const { unmount } = render(<ModalHarness onCloseMock={onClose} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it('moves focus to the first focusable element after open', async () => {
    const onClose = vi.fn();
    render(<ModalHarness onCloseMock={onClose} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(document.activeElement).toBe(screen.getByTestId('first-button'));
  });

  it.skip('Shift+Tab on first element wraps to last (focus trap) — TODO: jsdom offsetParent visibility gap', async () => {
    const onClose = vi.fn();
    render(<ModalHarness onCloseMock={onClose} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const first = screen.getByTestId('first-button');
    const last = screen.getByTestId('last-button');
    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it.skip('Tab on last element wraps to first (focus trap) — TODO: jsdom offsetParent visibility gap', async () => {
    const onClose = vi.fn();
    render(<ModalHarness onCloseMock={onClose} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const first = screen.getByTestId('first-button');
    const last = screen.getByTestId('last-button');
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('does NOT close on Escape when not open', () => {
    const onClose = vi.fn();
    render(<ModalHarness initialOpen={false} onCloseMock={onClose} />);
    fireEvent.keyDown(screen.getByTestId('trigger'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
