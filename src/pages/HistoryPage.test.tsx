import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import HistoryPage from './HistoryPage';

const getJobs = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/api', () => ({
  getJobs: (...args: unknown[]) => getJobs(...args),
  getJobExportCatalog: vi.fn(async () => []),
  downloadJobExport: vi.fn(async () => ({ blob: new Blob(['x']), filename: 'x.csv' })),
}));

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows filtered empty state separately from no-data empty state', async () => {
    getJobs.mockResolvedValue([{ job_id: 'j1', status: 'DONE', display_name: 'Done Job', file_name: 'a.csv' }]);
    const user = userEvent.setup();
    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    await screen.findByText('Done Job');

    await user.click(screen.getByRole('button', { name: /Running/i }));
    expect(await screen.findByText('No jobs in this filter')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /All/i }));
    await user.type(screen.getByPlaceholderText('Search job name or file'), 'missing-file');
    expect(await screen.findByText('No jobs matching search')).toBeInTheDocument();
  });

  it('running jobs trigger auto-refresh interval setup', async () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');
    getJobs.mockResolvedValue([{ job_id: 'j2', status: 'RUNNING', display_name: 'Running Job', file_name: 'b.csv' }]);
    render(<MemoryRouter><HistoryPage /></MemoryRouter>);
    await screen.findByText('Running Job');
    expect(intervalSpy).toHaveBeenCalled();
    intervalSpy.mockRestore();
  });
});
