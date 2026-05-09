import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FatalErrorScreen from './FatalErrorScreen';

const SAMPLE_PROPS = {
  errorMessage: 'Test crash: cannot read property foo of undefined',
  stackTrace: 'TypeError: cannot read property foo of undefined\n    at App (/src/App.tsx:42:10)',
  isChunkLoadError: false,
};

describe('FatalErrorScreen', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock, readText: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the stack trace in dev mode', async () => {
    vi.stubEnv('DEV', true);
    const user = userEvent.setup();
    render(<FatalErrorScreen {...SAMPLE_PROPS} />);
    // Open the details disclosure
    await user.click(screen.getByText('Details'));
    expect(screen.getByText(SAMPLE_PROPS.errorMessage)).toBeInTheDocument();
    expect(
      screen.getByText(/cannot read property foo of undefined\s+at App/),
    ).toBeInTheDocument();
  });

  it('hides the stack trace in production mode and shows a fallback hint', async () => {
    vi.stubEnv('DEV', false);
    const user = userEvent.setup();
    render(<FatalErrorScreen {...SAMPLE_PROPS} />);
    await user.click(screen.getByText('Details'));
    expect(screen.getByText(SAMPLE_PROPS.errorMessage)).toBeInTheDocument();
    // The stack <pre> must not be present
    expect(
      screen.queryByText(/at App \(\/src\/App\.tsx/),
    ).not.toBeInTheDocument();
    // The fallback hint pointing users at the Copy button must be present
    expect(
      screen.getByText(/Copy details.*to capture the full diagnostic/i),
    ).toBeInTheDocument();
  });


  it('shows the chunk-load banner only when isChunkLoadError is true', () => {
    vi.stubEnv('DEV', false);
    const { rerender } = render(<FatalErrorScreen {...SAMPLE_PROPS} />);
    expect(screen.queryByText(/Update detected/i)).not.toBeInTheDocument();
    rerender(<FatalErrorScreen {...SAMPLE_PROPS} isChunkLoadError={true} />);
    expect(screen.getByText(/Update detected/i)).toBeInTheDocument();
  });
});
