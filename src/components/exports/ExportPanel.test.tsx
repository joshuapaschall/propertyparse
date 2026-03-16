import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportPanel from './ExportPanel';
import { FALLBACK_EXPORT_CATALOG } from '../../lib/exportCatalog';

describe('ExportPanel', () => {
  it('shows grouped options only after click', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(
      <ExportPanel
        catalog={FALLBACK_EXPORT_CATALOG}
        onDownload={onDownload}
        activeDownloadType={null}
      />,
    );

    await user.click(screen.getByText('Export'));

    expect(screen.getByText('Most Used')).toBeInTheDocument();
    expect(screen.getByText('PropStream Import')).toBeInTheDocument();
    expect(screen.getByText('Audit / Reference')).toBeInTheDocument();
  });
});
