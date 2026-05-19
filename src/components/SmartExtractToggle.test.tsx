import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SmartExtractToggle from './SmartExtractToggle';

describe('SmartExtractToggle', () => {
  it('renders and toggles', () => {
    const onChange = vi.fn();
    render(<SmartExtractToggle enabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('smart-extract-toggle'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('honors disabled state', () => {
    const onChange = vi.fn();
    render(<SmartExtractToggle enabled={false} onChange={onChange} disabled />);
    expect(screen.getByTestId('smart-extract-toggle')).toBeDisabled();
  });

  it('expands info', () => {
    render(<SmartExtractToggle enabled={false} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText('What is Smart Extract?'));
    expect(screen.getByText(/When to use it:/i)).toBeInTheDocument();
  });
});
