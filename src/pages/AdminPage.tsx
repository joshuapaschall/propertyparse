import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuthControls } from '../App';
import AppShell from '../components/AppShell';
import Button from '../components/ui/Button';
import Card, { SectionHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import {
  ApiErrorInfo,
  getApiErrorInfo,
  getMetricsSummary,
  getOrgMembers,
  getSystemDiagnostics,
  inviteOrgMember,
  MetricsRange,
  MetricsSummary,
  OrgMember,
  removeOrgMember,
  SystemDiagnostics,
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



type SetupGuidance = {
  title: string;
  messages: string[];
  rawError: string;
  supabaseConfigured: boolean | null;
  missingTables: string[];
  requiredMigrations: string[];
};

const getSetupGuidanceFromDiagnostics = (diagnostics: SystemDiagnostics | null, rawError: string): SetupGuidance => {
  const messages: string[] = [];

  if (diagnostics === null) {
    messages.push('We couldn\'t load system diagnostics. Check API connectivity/CORS and try again.');
  }

  if (diagnostics?.supabase_configured === false) {
    messages.push('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API droplet and redeploy.');
  }

  const missingTables = Array.isArray(diagnostics?.tables_missing) ? diagnostics.tables_missing : [];
  const migrationsNeeded = Array.isArray(diagnostics?.migrations_needed) ? diagnostics.migrations_needed : [];

  if (missingTables.length > 0 || migrationsNeeded.length > 0) {
    const migrationHint = migrationsNeeded.length > 0 ? ` Required migrations: ${migrationsNeeded.join(', ')}.` : '';
    messages.push(`Run the SQL migrations in Supabase (show the filenames from migrations_needed).${migrationHint}`);
  }

  if (messages.length === 0) {
    messages.push('Check API and Supabase connectivity, then redeploy the API after resolving setup issues.');
  }

  return {
    title: 'Setup required',
    messages,
    rawError,
    supabaseConfigured: typeof diagnostics?.supabase_configured === 'boolean' ? diagnostics.supabase_configured : null,
    missingTables,
    requiredMigrations: migrationsNeeded,
  };
};

const getMetricTrendBars = (value: number) => {
  const seed = Math.max(1, Math.floor(Math.abs(value)));
  return Array.from({ length: 7 }, (_, index) => {
    const slice = Math.floor(seed / 10 ** (index % 3)) % 10;
    return Math.max(20, Math.min(100, 25 + slice * 8));
  });
};

const formatMetricValue = (metricKey: string, value: number) => {
  if (metricKey === 'spend' || metricKey === 'spend_usd' || metricKey === 'ocrSpend') {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
  }
  return formatNumber(value);
};

function SetupRequiredCard({ guidance, errorInfo }: { guidance: SetupGuidance | null; errorInfo: ApiErrorInfo }) {
  const checklist = [
    {
      label: 'Supabase configured',
      value:
        guidance?.supabaseConfigured === null
          ? 'Unknown'
          : guidance.supabaseConfigured
            ? 'Yes'
            : 'No',
    },
    {
      label: 'Missing tables',
      value: guidance?.missingTables.length ? guidance.missingTables.join(', ') : 'None',
    },
  ];

  const setupInstructions = [
    'Admin setup checklist:',
    `- Supabase configured: ${checklist[0].value}`,
    `- Missing tables: ${checklist[1].value}`,
    `- Required migrations: ${guidance?.requiredMigrations.length ? guidance.requiredMigrations.join(', ') : 'None reported'}`,
    '',
    'Next steps:',
    ...(guidance?.messages ?? ['Resolve setup issues and retry.']).map((message) => `- ${message}`),
    '',
    'Request diagnostics:',
    `- Endpoint: ${errorInfo.endpoint}`,
    `- Status: ${errorInfo.status ?? 'n/a'}`,
    `- Message: ${errorInfo.message}`,
  ].join('\n');

  const handleCopyInstructions = async () => {
    try {
      await navigator.clipboard.writeText(setupInstructions);
    } catch {
      window.prompt('Copy details:', setupInstructions);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">{guidance?.title ?? 'Setup required'}</p>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">Complete these steps to restore admin data.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => void handleCopyInstructions()}>
          Copy details
        </Button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {checklist.map((item) => (
          <div key={item.label} className="rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2 text-xs dark:border-amber-800/50 dark:bg-slate-900/40">
            <p className="font-semibold uppercase tracking-wide">{item.label}</p>
            <p className="mt-1 text-sm font-medium">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide">Required migrations</p>
        <p className="mt-1 text-xs">
          {guidance?.requiredMigrations.length ? guidance.requiredMigrations.join(', ') : 'No required migration filenames reported.'}
        </p>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">Details</summary>
        <div className="mt-2 space-y-1 text-xs">
          <p><span className="font-semibold">Endpoint:</span> {errorInfo.endpoint}</p>
          <p><span className="font-semibold">Status:</span> {errorInfo.status ?? 'n/a'}</p>
          <p><span className="font-semibold">Message:</span> {errorInfo.message}</p>
        </div>
      </details>
    </div>
  );
}
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
  const [metricsError, setMetricsError] = useState<ApiErrorInfo | null>(null);
  const [metricsDiagnostics, setMetricsDiagnostics] = useState<SystemDiagnostics | null>(null);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<ApiErrorInfo | null>(null);
  const [teamDiagnostics, setTeamDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteLoading, setInviteLoading] = useState(false);

  const [updatingRoleByUserId, setUpdatingRoleByUserId] = useState<Record<string, boolean>>({});
  const [removingByUserId, setRemovingByUserId] = useState<Record<string, boolean>>({});

  const loadMetrics = async (range: RangeKey) => {
    setMetricsLoading(true);
    setMetricsError(null);
    setMetricsDiagnostics(null);
    try {
      const data = await getMetricsSummary(range);
      setMetrics(data ?? null);
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to load admin metrics.', endpoint: '/metrics/summary' };
      setMetricsError(errorInfo);
      try {
        const diagnostics = await getSystemDiagnostics();
        setMetricsDiagnostics(diagnostics ?? null);
      } catch {
        setMetricsDiagnostics(null);
      }
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadMembers = async () => {
    setTeamLoading(true);
    setTeamError(null);
    setTeamDiagnostics(null);
    try {
      const list = await getOrgMembers();
      setMembers(Array.isArray(list) ? list : []);
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to load team members.', endpoint: '/org/members' };
      setTeamError(errorInfo);
      try {
        const diagnostics = await getSystemDiagnostics();
        setTeamDiagnostics(diagnostics ?? null);
      } catch {
        setTeamDiagnostics(null);
      }
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
    const hasSpend = metrics && (Object.prototype.hasOwnProperty.call(metrics, 'spend_usd') || Object.prototype.hasOwnProperty.call(metrics, 'spendUsd'));

    if (hasOcrCalls) {
      cards.push({ key: 'ocrCalls', label: 'OCR Calls', description: 'OCR API calls used.' });
    }
    if (hasOcrSpend) {
      cards.push({ key: 'ocrSpend', label: 'OCR Spend', description: 'Estimated OCR spend.' });
    }
    if (hasSpend) {
      cards.push({ key: 'spend_usd', label: 'Spend', description: 'Total platform spend for selected range.' });
    }

    return cards.slice(0, 6);
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
      setTeamError(getApiErrorInfo(err) ?? { message: 'Unable to send invitation.', endpoint: '/org/invite' });
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
      setTeamError(getApiErrorInfo(err) ?? { message: 'Unable to update member role.', endpoint: `/org/members/${userId}` });
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
      setTeamError(getApiErrorInfo(err) ?? { message: 'Unable to remove member.', endpoint: `/org/members/${userId}` });
    } finally {
      setRemovingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <AppShell title="Admin" subtitle="Monitor parsing usage and manage your organization team.">
      {!hasRoleInfo || !canAccessAdmin ? (
        <Card className="p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Not authorized</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Admin access is restricted. If you believe you should have access, contact your account owner.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <SectionHeader title="Admin Metrics" subtitle="Snapshot totals from server-side metrics." action={<div className="flex flex-wrap gap-2">
                {rangeTabs.map((tab) => {
                  const isActive = tab.key === activeRange;
                  return (
                    <Button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveRange(tab.key)}
                      size="sm"
                      variant={isActive ? 'secondary' : 'ghost'}
                    >
                      {tab.label}
                    </Button>
                  );
                })}
              </div>} />
            {metricsLoading ? (
              <EmptyState className="mt-6" title="Loading metrics" description="Loading admin metrics..." />
            ) : metricsError ? (
              <SetupRequiredCard guidance={getSetupGuidanceFromDiagnostics(metricsDiagnostics, metricsError.message)} errorInfo={metricsError} />
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {renderedCards.map((metric) => {
                  const value = toNumber(metrics?.[metric.key] ?? (metric.key === 'spend_usd' ? metrics?.spendUsd : 0));
                  const trendBars = getMetricTrendBars(value);
                  return (
                    <Card key={metric.key} className="flex min-h-[170px] flex-col justify-between bg-gradient-to-b from-white to-slate-50/80 p-5 dark:from-slate-950 dark:to-slate-900/60">
                      <div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{metric.label}</p>
                        <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{formatMetricValue(metric.key, value)}</p>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.description}</p>
                      </div>
                      <div className="mt-4 flex items-end gap-1" aria-hidden="true">
                        {trendBars.map((barHeight, index) => (
                          <span key={`${metric.key}-${index}`} className="w-2 rounded-sm bg-indigo-400/70 dark:bg-indigo-500/70" style={{ height: `${barHeight * 0.28}px` }} />
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Team" subtitle="Manage members and organization access." />

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
                <Button
                  type="submit"
                  disabled={inviteLoading}
                  variant="primary"
                >
                  {inviteLoading ? 'Inviting...' : 'Invite Member'}
                </Button>
              </form>
            ) : null}

            {teamError ? <SetupRequiredCard guidance={getSetupGuidanceFromDiagnostics(teamDiagnostics, teamError.message)} errorInfo={teamError} /> : null}
            {teamMessage ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                {teamMessage}
              </div>
            ) : null}

            {teamLoading ? (
              <EmptyState className="mt-6 py-8" title="Loading team" description="Loading team..." />
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
                              <Button
                                type="button"
                                disabled={Boolean(removingByUserId[userId]) || !userId}
                                onClick={() => void handleRemove(userId, email)}
                                variant="destructive"
                              >
                                {removingByUserId[userId] ? 'Removing...' : 'Remove'}
                              </Button>
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
          </Card>
        </div>
      )}
    </AppShell>
  );
}
