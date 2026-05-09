import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AsyncLocationMultiSelect from './AsyncLocationMultiSelect';

vi.mock('react-select/async-creatable', () => ({
  default: (props: { loadOptions?: (value: string) => Promise<unknown> }) => (
    <input aria-label='async-multi-select-input' onChange={(e) => void props.loadOptions?.(e.target.value)} />
  ),
}));

describe('AsyncLocationMultiSelect', () => {
  it('does not leak orphaned promises when input is debounced (B65)', async () => {
    const tracked: Promise<string[]>[] = [];
    const loadOptions = vi.fn((q: string) => {
      const p = Promise.resolve([`${q}-result`]);
      tracked.push(p);
      return p;
    });

    render(<AsyncLocationMultiSelect label='Test' values={[]} placeholder='type' loadOptions={loadOptions} onChange={() => {}} />);
    const input = screen.getByLabelText('async-multi-select-input');
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

    render(<AsyncLocationMultiSelect label='Test' values={[]} placeholder='type' loadOptions={loadOptions} onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('async-multi-select-input'), { target: { value: 'abc' } });

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    captured.forEach((signal) => expect(signal).toBeInstanceOf(AbortSignal));
  });
});
