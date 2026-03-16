import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HistoryDetailPage from './HistoryDetailPage';

const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getJobExportCatalog = vi.fn();
const downloadJobExport = vi.fn();

vi.mock('../components/AppShell', () => ({
  default: ({ children }: { children: unknown }) => <div>{children as any}</div>,
}));

vi.mock('../components/ui/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../lib/api', () => ({
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  downloadJobExport: (...args: unknown[]) => downloadJobExport(...args),
}));

describe('HistoryDetailPage exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobDetail.mockResolvedValue({ job: { display_name: 'Test', created_at: new Date().toISOString() }, summary: {} });
    getJobResults.mockResolvedValue({ summary: { rows_received: 10, valid_total: 8, valid_unique: 7, needs_review: 1, out_of_scope: 1, skipped: 1, duplicates: 1, matched: 8, attention_total: 3 }, row_results: [{ source_row_id: 'r1', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW', detected_address: '123 Main' }], canonical_addresses: [] });
    getJobExportCatalog.mockResolvedValue([]);
    downloadJobExport.mockResolvedValue({ blob: new Blob(['x']), filename: 'original-upload.xlsx' });
  });

  it('renders row/group labels consistently', async () => {
    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Needs Review \(rows\)/)).toBeInTheDocument();
  });

  it('renders one compact Export trigger and grouped options after interaction', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const exportTrigger = await screen.findByText('Export');
    await user.click(exportTrigger);
    expect(await screen.findByText('Most Used')).toBeInTheDocument();
  });
});
