import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobWarnings from './JobWarnings';

describe('JobWarnings', () => {
  it('renders concise copy for JOB_PROGRESS_DISABLED and keeps details behind disclosure', async () => {
    const user = userEvent.setup();
    render(
      <JobWarnings
        warnings={[
          { code: 'JOB_PROGRESS_DISABLED', message: 'raw backend text', detail: { status: 503 } },
        ]}
      />,
    );

    expect(screen.getByText('Live progress is temporarily unavailable for this run.')).toBeInTheDocument();
    expect(screen.queryByText('raw backend text')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show technical details' }));
    expect(screen.getByText(/JOB_PROGRESS_DISABLED/)).toBeInTheDocument();
  });
});
