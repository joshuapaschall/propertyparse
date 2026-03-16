import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HistoryDetailPage from './HistoryDetailPage';

const getJobDetail = vi.fn();
const getJobResults = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/api', () => ({
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobExportCatalog: vi.fn(async () => []),
  downloadJobExport: vi.fn(),
}));

describe('HistoryDetailPage summary normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobDetail.mockResolvedValue({ job: { job_id: 'job-1' }, summary: { rows_received: 0, valid_total: 0 } });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 0, valid_total: 0, valid_unique: 0, needs_review: 0 },
      row_results: [
        { source_row_id: 'r1', source_row_index: 0, status: 'VALID', canonical_id: 'c1' },
        { source_row_id: 'r2', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW' },
      ],
      canonical_addresses: [],
    });
  });

  it('prefers row-derived counts over stale backend zeros', async () => {
    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rows Received')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/Needs Review \(rows\)/)).toBeInTheDocument();
  });
});
