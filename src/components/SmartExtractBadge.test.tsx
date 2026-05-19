import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SmartExtractBadge from './SmartExtractBadge';

describe('SmartExtractBadge', () => {
  it('renders with tooltip details', () => {
    render(<SmartExtractBadge kind="scan_pdf" addressesExtracted={12} addressZone="property" />);
    expect(screen.getByTestId('smart-extract-badge')).toHaveAttribute('title', 'Type: scan pdf • 12 addresses extracted • Zone: property');
  });
});
