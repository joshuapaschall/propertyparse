import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SmartExtractPreviewModal from './SmartExtractPreviewModal';

const items = [{ file_id: '1', file_name: 'a.pdf', recommended: true, reason: 'tricky', profile: { kind: 'scan_pdf', address_zone: 'property', exclude: [], confidence: 0.9, sample_addresses: ['123 Main St'] } }];

describe('SmartExtractPreviewModal', () => {
  it('renders and continues with skip set', () => {
    const onContinue = vi.fn();
    render(<SmartExtractPreviewModal open items={items} onClose={() => {}} onContinue={onContinue} />);
    fireEvent.click(screen.getByTestId('smart-extract-preview-continue'));
    expect(onContinue).toHaveBeenCalled();
  });
  it('decrements use count when unchecked', () => {
    render(<SmartExtractPreviewModal open items={items} onClose={() => {}} onContinue={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Use Smart Extract for a.pdf/));
    expect(screen.getByText(/used on 0 of 1 file/i)).toBeInTheDocument();
  });
});
