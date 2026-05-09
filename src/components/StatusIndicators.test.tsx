import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusIndicators from './StatusIndicators';

const getHealth = vi.fn();
const validateApiKeys = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getHealth: (...args: unknown[]) => getHealth(...args),
    validateApiKeys: (...args: unknown[]) => validateApiKeys(...args),
  };
});

const okValidateResponse = {
  google_key_present: true,
  openai: true,
  cache_enabled: true,
  cache_backend: 'supabase' as const,
};

const degradedValidateResponse = {
  google_key_present: true,
  openai: true,
  cache_enabled: false,
  cache_backend: 'unavailable' as const,
  cache_warning: {
    code: 'CACHE_UNAVAILABLE',
    message:
      'Both Supabase and SQLite verification caches are unavailable. Cache hit rate is 0% until ops resolves the underlying issue.',
  },
};

const buildApiError = (message: string, status: number) => {
  const err = new Error(message) as Error & {
    apiErrorInfo?: { message: string; endpoint: string; status?: number };
  };
  err.apiErrorInfo = { message, endpoint: '/validate-api-keys', status };
  return err;
};

describe('StatusIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHealth.mockResolvedValue({ ok: true });
    validateApiKeys.mockResolvedValue(okValidateResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows both pills as ok when both calls succeed cleanly', async () => {
    render(<StatusIndicators />);
    await waitFor(() => {
      expect(screen.getByTestId('status-pill-api-health')).toHaveAttribute('data-state', 'ok');
      expect(screen.getByTestId('status-pill-api-keys')).toHaveAttribute('data-state', 'ok');
    });
  });

  it('shows API Keys as warning when validateApiKeys returns cache_warning (B77 + B78)', async () => {
    validateApiKeys.mockResolvedValue(degradedValidateResponse);
    render(<StatusIndicators />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill-api-keys');
      expect(pill).toHaveAttribute('data-state', 'warning');
      const title = pill.getAttribute('title') ?? '';
      expect(title).toContain('CACHE_UNAVAILABLE');
      expect(title).toContain('Cache hit rate is 0%');
    });
  });

  it('shows API Keys as error with status code in tooltip when call throws (B78)', async () => {
    validateApiKeys.mockRejectedValue(buildApiError('Internal Server Error', 500));
    render(<StatusIndicators />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill-api-keys');
      expect(pill).toHaveAttribute('data-state', 'error');
      expect(pill.getAttribute('title') ?? '').toContain('500');
      expect(pill.getAttribute('title') ?? '').toContain('Internal Server Error');
    });
  });

  it('shows API Health as error when /health throws', async () => {
    getHealth.mockRejectedValue(buildApiError('Network error', 0));
    render(<StatusIndicators />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill-api-health');
      expect(pill).toHaveAttribute('data-state', 'error');
    });
  });

  it('falls back to a generic detail when error has no apiErrorInfo', async () => {
    validateApiKeys.mockRejectedValue(new Error('opaque'));
    render(<StatusIndicators />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill-api-keys');
      expect(pill).toHaveAttribute('data-state', 'error');
      expect(pill.getAttribute('title')).toBeTruthy();
    });
  });

  it('Refresh button re-runs both checks', async () => {
    render(<StatusIndicators />);
    await waitFor(() => {
      expect(getHealth).toHaveBeenCalledTimes(1);
      expect(validateApiKeys).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(getHealth).toHaveBeenCalledTimes(2);
      expect(validateApiKeys).toHaveBeenCalledTimes(2);
    });
  });
});
