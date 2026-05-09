import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 200));
    expect(result.current).toBe('initial');
  });

  it('does not update before the delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('a');
  });

  it('updates to the latest value after the delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('ab');
  });

  it('resets the timer when the value changes again before the delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('abc');
  });

  it('cancels pending update when the component unmounts', () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: 'a' } },
    );
    rerender({ value: 'ab' });
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('a');
  });
});
