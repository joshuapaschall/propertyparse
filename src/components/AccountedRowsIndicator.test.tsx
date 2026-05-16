import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AccountedRowsIndicator from './AccountedRowsIndicator';

describe('AccountedRowsIndicator', () => {
  it('renders fixed-height skeleton when values are unavailable', () => {
    render(<AccountedRowsIndicator rowsReceived={null} accountedRows={null} />);
    const skeleton = screen.getByText('Accounted rows: — / —');
    expect(skeleton.className).toContain('h-4');
  });

  it('shows green status when rows are balanced', () => {
    render(<AccountedRowsIndicator rowsReceived={5} accountedRows={5} />);
    const indicator = screen.getByTestId('accounted-rows-indicator');
    expect(indicator).toHaveTextContent('Accounted rows: 5 / 5');
    expect(indicator.className).toContain('text-emerald-600');
  });
});
