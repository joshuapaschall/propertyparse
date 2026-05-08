import { FormEvent, useEffect, useState } from 'react';
import { useAuthControls } from '../App';
import AppShell from '../components/AppShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { supabase } from '../lib/supabase';

export default function AccountSecurityPage() {
  const { session } = useAuthControls();
  const userEmail = session?.user.email ?? null;
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userEmail) {
      showToast({ title: 'Unable to verify your account. Sign out and back in.', variant: 'error' });
    }
  }, [showToast, userEmail]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userEmail) {
      showToast({ title: 'Unable to verify your account. Sign out and back in.', variant: 'error' });
      return;
    }

    if (!currentPassword) {
      showToast({ title: 'Enter your current password to confirm the change.', variant: 'error' });
      return;
    }

    if (password.length < 8) {
      showToast({ title: 'New password must be at least 8 characters.', variant: 'error' });
      return;
    }

    if (password !== confirmPassword) {
      showToast({ title: 'Passwords do not match.', variant: 'error' });
      return;
    }

    if (password === currentPassword) {
      showToast({ title: 'New password must be different from your current password.', variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (reauthError) {
        showToast({ title: 'Current password is incorrect.', variant: 'error' });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }

      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      showToast({ title: 'Password updated successfully.', variant: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update password.';
      showToast({ title: message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Security" subtitle="Manage your account credentials.">
      <Card className="max-w-2xl">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Set your password</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            If you were invited to this organization, accept your invite first, then set your password here before your next sign in.
          </p>
        </div>

        {!userEmail ? (
          <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">
            Unable to verify your account — please sign out and sign back in.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="security-current-password">
                Current password
              </label>
              <input
                id="security-current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                We need to confirm your current password before changing it.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="security-password">
                New password
              </label>
              <input
                id="security-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300" htmlFor="security-confirm-password">
                Confirm new password
              </label>
              <input
                id="security-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
              />
            </div>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        )}
      </Card>
    </AppShell>
  );
}
