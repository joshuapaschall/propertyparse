import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryDetailPage from './HistoryDetailPage';

const getJobDetail = vi.fn();
const getJobResults = vi.fn();
const getJobExportCatalog = vi.fn();
const navigateSpy = vi.fn();

vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: unknown }) => <div>{children as any}</div> }));
vi.mock('../contexts/AuthContext', () => ({ useAuthControls: () => ({ role: 'admin' }) }));
vi.mock('../components/TablePagination', () => ({ default: () => null }));
vi.mock('../components/exports/ExportPanel', () => ({ default: () => null }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../lib/liveUpdates', () => ({ subscribeJobUpdates: () => () => undefined }));
vi.mock('../lib/api', () => ({
  getJobDetail: (...args: unknown[]) => getJobDetail(...args),
  getJobResults: (...args: unknown[]) => getJobResults(...args),
  getJobExportCatalog: (...args: unknown[]) => getJobExportCatalog(...args),
  downloadJobExport: vi.fn(),
  updateJobMetadata: vi.fn(),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

describe('HistoryDetail Continue working button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobExportCatalog.mockResolvedValue([]);
    getJobResults.mockResolvedValue({ summary: { rows_received: 0, valid_total: 0, valid_unique: 0 }, row_results: [], canonical_addresses: [] });
  });

  it('Continue working navigates to /parse?job=<id> when job has no batch_id', async () => {
    const jobId = 'job-123';
    getJobDetail.mockResolvedValue({ job: { job_id: jobId }, summary: { rows_received: 0, valid_total: 0, valid_unique: 0 } });
    render(<MemoryRouter initialEntries={[`/history/${jobId}`]}><Routes><Route path="/history/:jobId" element={<HistoryDetailPage />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /continue working/i }));
    expect(navigateSpy).toHaveBeenCalledWith(`/parse?job=${jobId}`);
  });

  it('Continue working navigates to /parse?batch=<id> when job has batch_id', async () => {
    const jobId = 'job-123';
    const batchId = 'batch-123';
    getJobDetail.mockResolvedValue({ job: { job_id: jobId, batch_id: batchId }, summary: { rows_received: 0, valid_total: 0, valid_unique: 0 } });
    render(<MemoryRouter initialEntries={[`/history/${jobId}`]}><Routes><Route path="/history/:jobId" element={<HistoryDetailPage />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /continue working/i }));
    expect(navigateSpy).toHaveBeenCalledWith(`/parse?batch=${batchId}`);
  });
});
