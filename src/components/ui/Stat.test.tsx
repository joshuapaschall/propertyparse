import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Stat from './Stat';

describe('Stat', () => {
  it('renders label/value', () => {
    render(<Stat label="Rows" value={42} />);
    expect(screen.getByText('Rows')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders primary variant marker', () => {
    render(<Stat label="Total Cost" value="$5.00" variant="primary" />);
    expect(screen.getByTestId('stat-primary')).toBeInTheDocument();
  });
});
