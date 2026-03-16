import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobWarnings from './JobWarnings';

describe('JobWarnings', () => {
  it('renders clean migration warning message', async () => {
    const user = userEvent.setup();
    render(
      <JobWarnings
        warnings={[
          { code: 'SUPABASE_SCHEMA_NOT_MIGRATED', message: 'internal' },
        ]}
      />,
    );

    expect(
      screen.getByText('Database schema is behind. Run the latest Supabase migration and refresh the app.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show technical details' }));
    expect(screen.getByText(/SUPABASE_SCHEMA_NOT_MIGRATED/)).toBeInTheDocument();
  });
});
