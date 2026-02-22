import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuthControls } from '../App';
import AppShell from '../components/AppShell';
import {
  getMetricsSummary,
  getOrgMembers,
  inviteOrgMember,
  MetricsRange,
  MetricsSummary,
  OrgMember,
  removeOrgMember,
  updateOrgMemberRole,
} from '../lib/api';

type RangeKey = MetricsRange;

type MetricCard = {
  key: string;
  label: string;
  description: string;
};

const metricCards: MetricCard[] = [
  { key: 'uploads', label: 'Uploads', description: 'Total parsing jobs created.' },
  { key: 'leads', label: 'Leads', description: 'Rows received across uploads.' },
  { key: 'matched', label: 'Matched', description: 'Matched rows returned.' },
  { key: 'unmatched', label: 'Unmatched', description: 'Unmatched rows returned.' },
  { key: 'exports', label: 'Exports', description: 'Exports generated from jobs.' },
  { key: 'googleCalls', label: 'Google Calls', description: 'Google API calls used.' },
];

const rangeTabs: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const roleOptions = ['member', 'manager', 'admin', 'owner'];

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const getMemberValue = (member: OrgMember, keys: string[]) => {
  for (const key of keys) {
    const value = member[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
};

export default function AdminPage() {
  const { role } = useAuthControls();
  const hasRoleInfo = role !== null && role !== '';
  const canAccessAdmin = role === 'admin' || role === 'owner';
  const canManageTeam = role === 'admin' || role === 'owner';

  const [activeRange, setActiveRange] = useState<RangeKey>('today');

  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteLoading, setInviteLoading] = useState(false);

  const [updatingRoleByUserId, setUpdatingRoleByUserId] = useState<Record<string, boolean>>({});
  const [removingByUserId, setRemovingByUserId] = useState<Record<string, boolean>>({});

  const loadMetrics = async (range: RangeKey) => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await getMetricsSummary(range);
      setMetrics(data ?? null);
    } catch (err) {
      setMetricsError((err as Error).message ?? 'Unable to load admin metrics.');
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadMembers = async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const list = await getOrgMembers();
      setMembers(Array.isArray(list) ? list : []);
    } catch (err) {
      setTeamError((err as Error).message ?? 'Unable to load team members.');
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccessAdmin) return;
    void loadMetrics(activeRange);
  }, [activeRange, canAccessAdmin]);

  useEffect(() => {
    if (!canAccessAdmin) return;
    void loadMembers();
  }, [canAccessAdmin]);

  const renderedCards = useMemo(() => {
    const cards = [...metricCards];
    const hasOcrCalls = metrics && Object.prototype.hasOwnProperty.call(metrics, 'ocrCalls');
    const hasOcrSpend = metrics && Object.prototype.hasOwnProperty.call(metrics, 'ocrSpend');

    if (hasOcrCalls) {
      cards.push({ key: 'ocrCalls', label: 'OCR Calls', description: 'OCR API calls used.' });
    }
    if (hasOcrSpend) {
      cards.push({ key: 'ocrSpend', label: 'OCR Spend', description: 'Estimated OCR spend.' });
    }

    return cards;
  }, [metrics]);

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageTeam) return;
    setInviteLoading(true);
    setTeamError(null);
    setTeamMessage(null);
    try {
      await inviteOrgMember(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setInviteRole('member');
      setTeamMessage('Invitation sent.');
      await loadMembers();
    } catch (err) {
      setTeamError((err as Error).message ?? 'Unable to send invitation.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: string) => {
    if (!canManageTeam) return;
    setTeamError(null);
    setTeamMessage(null);
    setUpdatingRoleByUserId((prev) => ({ ...prev, [userId]: true }));
    try {
      await updateOrgMemberRole(userId, nextRole);
      setTeamMessage('Member role updated.');
      await loadMembers();
    } catch (err) {
      setTeamError((err as Error).message ?? 'Unable to update member role.');
    } finally {
      setUpdatingRoleByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!canManageTeam) return;
    if (!window.confirm(`Remove ${email} from this organization?`)) {
      return;
    }
    setTeamError(null);
    setTeamMessage(null);
    setRemovingByUserId((prev) => ({ ...prev, [userId]: true }));
    try {
      await removeOrgMember(userId);
      setTeamMessage('Member removed.');
      await loadMembers();
    } catch (err) {
      setTeamError((err as Error).message ?? 'Unable to remove member.');
    } finally {
      setRemovingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <AppShell title="Admin" subtitle="Monitor parsing usage and manage your organization team.">
      {!hasRoleInfo || !canAccessAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Not authorized</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Admin access is restricted. If you believe you should have access, contact your account owner.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Admin Metrics</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Snapshot totals from server-side metrics.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {rangeTabs.map((tab) => {
                  const isActive = tab.key === activeRange;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveRange(tab.key)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {metricsLoading ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Loading admin metrics...
              </div>
            ) : metricsError ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-600 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
                {metricsError}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {renderedCards.map((metric) => {
                  const value = toNumber(metrics?.[metric.key]);
                  return (
                    <div
                      key={metric.key}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                    >
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{metric.label}</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{formatNumber(value)}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.description}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Team</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Manage members and organization access.</p>
              </div>
            </div>

            {canManageTeam ? (
              <form onSubmit={handleInvite} className="mt-5 grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800 md:grid-cols-[1fr_180px_auto]">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                  placeholder="name@company.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
                >
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviteLoading ? 'Inviting...' : 'Invite Member'}
                </button>
              </form>
            ) : null}

            {teamError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
                {teamError}
              </div>
            ) : null}
            {teamMessage ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                {teamMessage}
              </div>
            ) : null}

            {teamLoading ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Loading team...
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Joined</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                    {members.map((member) => {
                      const userId = String(getMemberValue(member, ['userId', 'user_id', 'id']) ?? '');
                      const email = String(getMemberValue(member, ['email']) ?? 'Unknown email');
                      const memberRole = String(getMemberValue(member, ['role']) ?? 'member');
                      const joinedValue = getMemberValue(member, ['createdAt', 'created_at']);
                      const joinedLabel =
                        typeof joinedValue === 'string' && !Number.isNaN(new Date(joinedValue).getTime())
                          ? new Date(joinedValue).toLocaleDateString()
                          : '--';

                      return (
                        <tr key={userId || email}>
                          <td className="px-3 py-3 text-sm font-medium text-slate-800 dark:text-slate-100">{email}</td>
                          <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
                            {canManageTeam ? (
                              <select
                                value={memberRole}
                                onChange={(event) => void handleRoleChange(userId, event.target.value)}
                                disabled={Boolean(updatingRoleByUserId[userId]) || !userId}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
                              >
                                {roleOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="capitalize">{memberRole}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">{joinedLabel}</td>
                          <td className="px-3 py-3 text-right text-sm">
                            {canManageTeam ? (
                              <button
                                type="button"
                                disabled={Boolean(removingByUserId[userId]) || !userId}
                                onClick={() => void handleRemove(userId, email)}
                                className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                              >
                                {removingByUserId[userId] ? 'Removing...' : 'Remove'}
                              </button>
                            ) : (
                              <span className="text-slate-400">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                          No team members found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
