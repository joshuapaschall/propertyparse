import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HistoryDetailPage from './HistoryDetailPage';

const getJobDetail = vi.fn();
const getJobResults = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/liveUpdates', () => ({ subscribeJobUpdates: vi.fn(() => () => undefined) }));
vi.mock('../lib/api', () => ({
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobExportCatalog: vi.fn(async () => []),
  downloadJobExport: vi.fn(),
}));

describe('HistoryDetailPage summary normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses row-derived counts and backend spend, ignoring metadata spend', async () => {
    getJobDetail.mockResolvedValue({
      job: { job_id: 'job-1', spend_usd: 9.4 },
      summary: { rows_received: 0, valid_total: 0 },
    });
    getJobResults.mockResolvedValue({
      summary: { rows_received: 0, valid_total: 0, valid_unique: 0, needs_review: 0, spend_usd: 7.5 },
      metadata: { spend_usd: 999 },
      row_results: [
        { source_row_id: 'r1', source_row_index: 0, status: 'VALID', canonical_id: 'c1' },
        { source_row_id: 'r2', source_row_index: 1, status: 'UNMATCHED_NEEDS_REVIEW' },
      ],
      canonical_addresses: [],
    });

    render(
      <MemoryRouter initialEntries={['/history/job-1']}>
        <Routes>
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rows Received')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('$7.50')).toBeInTheDocument();
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument();
  });
});
