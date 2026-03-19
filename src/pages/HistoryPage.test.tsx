import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import HistoryPage from './HistoryPage';

const getJobs = vi.fn();
const updateJobMetadata = vi.fn();
const readLocalParsePersistenceState = vi.fn();
const subscribeJobUpdates = vi.fn();
const authState = { role: 'admin' };

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../App', () => ({ useAuthControls: () => authState }));
const showToast = vi.fn();
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../lib/api', () => ({
  getJobs: (...args: unknown[]) => getJobs(...args),
  updateJobMetadata: (...args: unknown[]) => updateJobMetadata(...args),
  getJobExportCatalog: vi.fn(async () => []),
  downloadJobExport: vi.fn(async () => ({ blob: new Blob(['x']), filename: 'x.csv' })),
}));
vi.mock('../lib/persistenceStatus', () => ({
  readLocalParsePersistenceState: () => readLocalParsePersistenceState(),
}));
vi.mock('../lib/liveUpdates', () => ({
  subscribeJobUpdates: (...args: unknown[]) => subscribeJobUpdates(...args),
}));

describe('HistoryPage refresh behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'admin';
    readLocalParsePersistenceState.mockReturnValue(null);
    getJobs.mockResolvedValue([{ job_id: 'j1', status: 'DONE', display_name: 'Done Job', file_name: 'a.csv' }]);
    updateJobMetadata.mockResolvedValue({});
    subscribeJobUpdates.mockImplementation(() => () => undefined);
  });

  it('refreshes on invalidation events', async () => {
    let handler: ((event: { kind: string }) => void) | null = null;
    subscribeJobUpdates.mockImplementation((cb: (event: { kind: string }) => void) => {
      handler = cb;
      return () => undefined;
    });

    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    await act(async () => {
      await Promise.resolve();
    });
    const before = getJobs.mock.calls.length;

    await act(async () => {
      handler?.({ kind: 'job-updated' });
      await Promise.resolve();
    });

    expect(getJobs.mock.calls.length).toBeGreaterThan(before);
  });

  it('refreshes on window focus', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    await act(async () => {
      await Promise.resolve();
    });

    const focusHandler = addEventListenerSpy.mock.calls.find(([name]) => name === 'focus')?.[1] as
      | ((event: Event) => void)
      | undefined;
    const before = getJobs.mock.calls.length;

    await act(async () => {
      focusHandler?.(new Event('focus'));
      await Promise.resolve();
    });

    expect(getJobs.mock.calls.length).toBeGreaterThan(before);
    addEventListenerSpy.mockRestore();
  });

  it('keeps current rows visible while refreshing after first load', async () => {
    const user = userEvent.setup();
    let resolveRefresh: ((value: unknown) => void) | null = null;
    getJobs
      .mockResolvedValueOnce([{ job_id: 'j1', status: 'DONE', display_name: 'Done Job', file_name: 'a.csv' }])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));

    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    expect(await screen.findByText('Done Job')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(screen.getByText('Done Job')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Refreshing…')).toBeInTheDocument());

    await act(async () => {
      resolveRefresh?.([{ job_id: 'j1', status: 'DONE', display_name: 'Done Job', file_name: 'a.csv' }]);
      await Promise.resolve();
    });

    expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument();
  });

  it('edits campaign name from history', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    expect(await screen.findByText('Done Job')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    await user.clear(screen.getByLabelText('Campaign name'));
    await user.type(screen.getByLabelText('Campaign name'), 'Spring Buyers');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateJobMetadata).toHaveBeenCalledWith('j1', { campaignName: 'Spring Buyers' }));
    expect(screen.getByText('Spring Buyers')).toBeInTheDocument();
  });
});
