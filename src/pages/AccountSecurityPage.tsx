import { FormEvent, useState } from 'react';
import AppShell from '../components/AppShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { supabase } from '../lib/supabase';

export default function AccountSecurityPage() {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      showToast({ title: 'Password must be at least 8 characters.', variant: 'error' });
      return;
    }

    if (password !== confirmPassword) {
      showToast({ title: 'Passwords do not match.', variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }
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

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
      </Card>
    </AppShell>
  );
}
