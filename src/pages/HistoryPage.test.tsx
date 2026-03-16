import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import HistoryPage from './HistoryPage';

const showToast = vi.fn();
const getJobs = vi.fn();
const getJobExportCatalog = vi.fn();
const downloadJobExport = vi.fn();


vi.mock('../components/AppShell', () => ({
  default: ({ children }: { children: unknown }) => <div>{children as any}</div>,
}));

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('../lib/api', () => ({
  getJobs: (...args: unknown[]) => getJobs(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  downloadJobExport: (...args: unknown[]) => downloadJobExport(...args),
}));

describe('HistoryPage exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobs.mockResolvedValue([
      {
        job_id: 'job-1',
        status: 'DONE',
        created_at: new Date().toISOString(),
        display_name: 'Test Job',
        file_name: 'upload.xlsx',
      },
    ]);
    getJobExportCatalog.mockResolvedValue([]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'original-upload.xlsx' });
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
  });


  it('shows one compact Export trigger per row', async () => {
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    const exportTriggers = await screen.findAllByText('Export');
    expect(exportTriggers.filter((node) => node.tagName.toLowerCase() === 'summary')).toHaveLength(1);
  });


  it('normalizes backend summary fields for row counts', async () => {
    getJobs.mockResolvedValueOnce([
      {
        job_id: 'job-2',
        status: 'DONE',
        created_at: new Date().toISOString(),
        display_name: 'Summary Job',
        file_name: 'summary.csv',
        unmatched: 6,
        needs_review: 2,
      },
    ]);

    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    await screen.findByText('Summary Job');
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('uses backend-provided filename for downloads', async () => {
    const user = userEvent.setup();
    let createdAnchor: HTMLAnchorElement | null = null;
    const createElementSpy = vi.spyOn(document, 'createElement');
    createElementSpy.mockImplementation(((tagName: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
      if (tagName === 'a') {
        createdAnchor = element as HTMLAnchorElement;
      }
      return element as HTMLElement;
    }) as typeof document.createElement);

    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    const exportTriggers = await screen.findAllByText('Export');
    const exportTrigger = exportTriggers.find((node) => node.tagName.toLowerCase() === 'summary') ?? exportTriggers[0];
    await user.click(exportTrigger);

    const downloadButtons = await screen.findAllByRole('button', { name: 'Download' });
    await user.click(downloadButtons[0]);

    await waitFor(() => {
      expect(downloadJobExport).toHaveBeenCalled();
      expect(createdAnchor?.download).toBe('original-upload.xlsx');
    });
  });

  it('shows PropStream in shared grouped exports', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    );

    const exportTriggers = await screen.findAllByText('Export');
    const exportTrigger = exportTriggers.find((node) => node.tagName.toLowerCase() === 'summary') ?? exportTriggers[0];
    await user.click(exportTrigger);

    expect(await screen.findByText('PropStream Import')).toBeInTheDocument();
    expect(screen.getByText('Most Used')).toBeInTheDocument();
  });
});
