import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import HistoryPage from './HistoryPage';

const getJobs = vi.fn();
const updateJobMetadata = vi.fn();
const readLocalParsePersistenceState = vi.fn();
const subscribeJobUpdates = vi.fn();
const downloadJobExport = vi.fn();
const authState = { role: 'admin' };

const buildJob = (index: number, status: 'DONE' | 'RUNNING' | 'FAILED' = 'DONE') => ({
  job_id: `job-${index}`,
  status,
  display_name: `Job ${index}`,
  file_name: `file-${index}.csv`,
  created_at: `2026-03-${String((index % 28) + 1).padStart(2, '0')}T12:00:00Z`,
});

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../App', () => ({ useAuthControls: () => authState }));
const showToast = vi.fn();
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../components/exports/ExportPanel', () => ({
  default: ({ disabled, onDownload }: { disabled?: boolean; onDownload: (type: 'unique_valid', label: string) => void }) => (
    <button type="button" disabled={disabled} onClick={() => onDownload('unique_valid', 'Unique Valid')}>
      Export
    </button>
  ),
}));
vi.mock('../lib/api', () => ({
  getJobs: (...args: unknown[]) => getJobs(...args),
  updateJobMetadata: (...args: unknown[]) => updateJobMetadata(...args),
  getJobExportCatalog: vi.fn(async () => []),
  downloadJobExport: (...args: unknown[]) => downloadJobExport(...args),
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
    getJobs.mockResolvedValue({ items: [buildJob(1)], totalCount: 1 });
    updateJobMetadata.mockResolvedValue({});
    downloadJobExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'x.csv' });
    subscribeJobUpdates.mockImplementation(() => () => undefined);
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(() => undefined), writable: true });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
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
      .mockResolvedValueOnce({ items: [buildJob(1)], totalCount: 1 })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));

    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    expect(await screen.findByText('Job 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(screen.getByText('Job 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Refreshing…')).toBeInTheDocument());

    await act(async () => {
      resolveRefresh?.({ items: [buildJob(1)], totalCount: 1 });
      await Promise.resolve();
    });

    expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument();
  });

  it('edits campaign name from history', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    expect(await screen.findByText('Job 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    await user.clear(screen.getByLabelText('Campaign name'));
    await user.type(screen.getByLabelText('Campaign name'), 'Spring Buyers');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateJobMetadata).toHaveBeenCalledWith('job-1', { campaignName: 'Spring Buyers' }));
    expect(screen.getByText('Spring Buyers')).toBeInTheDocument();
  });

  it('shows estimated job cost from nested usage data per row', async () => {
    getJobs.mockResolvedValue({
      items: [
        {
          ...buildJob(1),
          spend_usd: 1.25,
          customer_safe_usage: { estimated_job_cost_usd: 2.5 },
        },
      ],
      totalCount: 1,
    });

    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    expect(await screen.findByText('Job 1')).toBeInTheDocument();
    expect(screen.getByText('$2.50')).toBeInTheDocument();
  });

  it('renders pagination controls and requests the selected page for 50+ jobs', async () => {
    const user = userEvent.setup();
    const pageOneJobs = Array.from({ length: 20 }, (_, index) => buildJob(index + 1));
    const pageTwoJobs = Array.from({ length: 20 }, (_, index) => buildJob(index + 21));

    getJobs
      .mockResolvedValueOnce({ items: pageOneJobs, totalCount: 55 })
      .mockResolvedValueOnce({ items: pageTwoJobs, totalCount: 55 });

    render(<MemoryRouter><HistoryPage /></MemoryRouter>);

    expect(await screen.findByText('Job 1')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–20 of 55 jobs')).toBeInTheDocument();
    expect(getJobs).toHaveBeenLastCalledWith({ limit: 20, offset: 0, search: undefined, status: undefined });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Job 21')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Showing 21–40 of 55 jobs')).toBeInTheDocument();
    expect(getJobs).toHaveBeenLastCalledWith({ limit: 20, offset: 20, search: undefined, status: undefined });
  });

  it('keeps row export working after navigating to another page', async () => {
    const user = userEvent.setup();
    const pageOneJobs = Array.from({ length: 20 }, (_, index) => buildJob(index + 1));
    const pageTwoJobs = Array.from({ length: 20 }, (_, index) => buildJob(index + 21));

    getJobs
      .mockResolvedValueOnce({ items: pageOneJobs, totalCount: 55 })
      .mockResolvedValueOnce({ items: pageTwoJobs, totalCount: 55 });

    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    expect(await screen.findByText('Job 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Job 21')).toBeInTheDocument();

    const exportButtons = screen.getAllByRole('button', { name: 'Export' });
    await user.click(exportButtons[0]!);

    await waitFor(() => expect(downloadJobExport).toHaveBeenCalledWith('job-21', 'unique_valid'));
  });
});
