import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AsyncLocationSelect from './AsyncLocationSelect';

vi.mock('react-select/async', () => ({
  default: (props: { loadOptions?: (value: string) => Promise<unknown> }) => (
    <input aria-label='async-select-input' onChange={(e) => void props.loadOptions?.(e.target.value)} />
  ),
}));

vi.mock('react-select/async-creatable', () => ({
  default: (props: { loadOptions?: (value: string) => Promise<unknown> }) => (
    <input aria-label='async-select-input' onChange={(e) => void props.loadOptions?.(e.target.value)} />
  ),
}));

describe('AsyncLocationSelect', () => {
  it('does not leak orphaned promises when input is debounced (B65)', async () => {
    const tracked: Promise<string[]>[] = [];
    const loadOptions = vi.fn((q: string) => {
      const p = Promise.resolve([`${q}-result`]);
      tracked.push(p);
      return p;
    });

    render(<AsyncLocationSelect label='Test' value='' placeholder='type' loadOptions={loadOptions} onChange={() => {}} onClear={() => {}} />);
    const input = screen.getByLabelText('async-select-input');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });

    await waitFor(() => expect(loadOptions).toHaveBeenCalled());
    await expect(Promise.allSettled(tracked)).resolves.toBeTruthy();
  });

  it('passes a fresh AbortSignal to loadOptions on each debounced call (B67)', async () => {
    const captured: AbortSignal[] = [];
    const loadOptions = vi.fn(async (_q: string, signal?: AbortSignal) => {
      if (signal) captured.push(signal);
      return [];
    });

    render(<AsyncLocationSelect label='Test' value='' placeholder='type' loadOptions={loadOptions} onChange={() => {}} onClear={() => {}} />);
    fireEvent.change(screen.getByLabelText('async-select-input'), { target: { value: 'abc' } });

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    captured.forEach((signal) => expect(signal).toBeInstanceOf(AbortSignal));
  });
});
