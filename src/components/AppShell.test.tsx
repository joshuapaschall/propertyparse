import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from './AppShell';

const authState = { role: 'member', logout: vi.fn() };
const themeState = { theme: 'light', toggleTheme: vi.fn() };

vi.mock('../contexts/AuthContext', () => ({
  useAuthControls: () => authState,
}));
vi.mock('../contexts/ThemeContext', () => ({
  useThemeControls: () => themeState,
}));
describe('AppShell', () => {
  it('hides the Admin link from non-privileged roles (B59)', () => {
    authState.role = 'member';
    render(<MemoryRouter><AppShell title="x">child</AppShell></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
  });

  it('shows the Admin link to admins and owners (B59)', () => {
    authState.role = 'admin';
    const { rerender } = render(
      <MemoryRouter><AppShell title="x">child</AppShell></MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: /admin/i }).length).toBeGreaterThan(0);

    authState.role = 'owner';
    rerender(<MemoryRouter><AppShell title="x">child</AppShell></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: /admin/i }).length).toBeGreaterThan(0);
  });

  it('renders the Account security link in the account menu (B60)', () => {
    authState.role = 'member';
    render(<MemoryRouter><AppShell title="x">child</AppShell></MemoryRouter>);
    expect(screen.getByRole('link', { name: /account security/i })).toBeInTheDocument();
  });

  it('does not render status indicators in the header', () => {
    render(<MemoryRouter><AppShell title="x">child</AppShell></MemoryRouter>);
    expect(screen.queryByTestId('status-pill-api-health')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-pill-api-keys')).not.toBeInTheDocument();
  });

  it('keeps the mobile Menu button in the header', () => {
    render(<MemoryRouter><AppShell title="x">child</AppShell></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });
});
