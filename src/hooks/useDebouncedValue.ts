import { useEffect, useState } from 'react';

/**
 * Returns `value` debounced by `delayMs`. The returned value updates
 * only after `value` has been stable for at least `delayMs`. Typing
 * fast resets the timer.
 *
 * Use the raw input value as the controlled input's `value` so typing
 * feels instant; use the debounced value for downstream effects (API
 * calls, URL sync, expensive filters).
 *
 * Closes audit B50.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
