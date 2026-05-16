import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthControls } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import StatusIndicators from '../components/StatusIndicators';
import { useModalA11y } from '../hooks/useModalA11y';
import Button from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import Card, { SectionHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import InternalCostPanel from '../components/InternalCostPanel';
import {
  ApiErrorInfo,
  getApiErrorInfo,
  getGoogleProviderUsageStatus,
  getMetricsSummary,
  getOpenAiProviderUsageSummary,
  getOrgMembers,
  getSystemDiagnostics,
  inviteOrgMember,
  MetricsSummary,
  OrgMember,
  ProviderUsageGoogleStatus,
  ProviderUsageOpenAiSummary,
  removeOrgMember,
  resetOrgMemberPassword,
  syncGoogleProviderUsage,
  syncOpenAiProviderUsage,
  SystemDiagnostics,
  updateOrgMember,
} from '../lib/api';
import { buildAdminMtdOnlySections } from '../lib/costTelemetry';
import { hasLocalOnlyBillingWarning, LOCAL_ONLY_BILLING_WARNING } from '../lib/telemetryWarnings';
import { flattenUsageSummary } from '../lib/usageSummary';

const roleOptions = ['member', 'manager', 'admin', 'owner'];

// Conservative email shape check — backend is source of truth.
// Only blocks obvious typos (no @, no dot in domain, whitespace).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDisplayValue = (value: string | number | boolean | null | undefined, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const formatDateTime = (value: string | null | undefined, fallback = '—') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const LOCAL_ONLY_EXPLANATION =
  'Project-local request logging is working, but billing-account sync has not populated provider snapshots yet. Remaining free cap and monthly cost are not billing-truth yet.';

const getMissingGoogleConfigEnvVars = (status: ProviderUsageGoogleStatus | null) => {
  if (!status) return [] as string[];
  if (Array.isArray(status.missing_env_vars)) return status.missing_env_vars;
  if (Array.isArray(status.missing_config_env_vars)) return status.missing_config_env_vars;
  return [] as string[];
};

const getGoogleBillingSyncConfigured = (status: ProviderUsageGoogleStatus | null) => {
  if (!status) return undefined;
  if (typeof status.google_billing_sync_configured === 'boolean') return status.google_billing_sync_configured;
  if (typeof status.billing_sync_configured === 'boolean') return status.billing_sync_configured;
  return undefined;
};

const getGoogleConfigStatusMessage = (status: ProviderUsageGoogleStatus | null) => {
  const missingEnvVars = getMissingGoogleConfigEnvVars(status);
  if (missingEnvVars.length > 0) {
    return `Missing env vars: ${missingEnvVars.join(', ')}`;
  }
  const billingSyncConfigured = getGoogleBillingSyncConfigured(status);
  if (billingSyncConfigured === false) {
    return 'Billing sync config is incomplete.';
  }
  if (billingSyncConfigured && status?.billing_snapshot_missing === true) {
    return 'Billing export configured, awaiting current provider data.';
  }
  return 'Configured';
};

function ProviderDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}


function ProviderSyncStatusBanner({ state, message, missingEnvVars, errorId, onRetry }: { state: 'ok' | 'not_configured' | 'local_only' | 'failed'; message?: string; missingEnvVars?: string[]; errorId?: string; onRetry?: () => void; }) {
  const { showToast } = useToast();
  if (state === 'ok') return null;
  if (state === 'local_only') return <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">{LOCAL_ONLY_EXPLANATION}</div>;
  if (state === 'not_configured') return <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><p className="font-semibold">Provider sync is not configured.</p><p className="mt-1 text-xs">Missing env vars: {(missingEnvVars ?? []).join(', ') || 'None listed'}</p><a href="#" onClick={async (e)=>{e.preventDefault(); const msg='Check provider usage env vars and redeploy API.'; try {await navigator.clipboard.writeText(msg); showToast({ title: 'Setup guide copied', variant: 'success' });} catch { window.prompt('Copy setup guide:', msg);} }} className="mt-2 inline-block text-xs font-semibold text-indigo-600">Setup guide</a></div>;
  return <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100"><p className="font-semibold">{message || 'Provider sync failed.'}</p>{errorId ? <p className="mt-1 text-xs">error_id: {errorId}</p> : null}<div className="mt-2 flex gap-2"><Button type="button" size="sm" variant="secondary" onClick={onRetry}>Retry</Button><Button type="button" size="sm" variant="ghost" onClick={async ()=>{const text=`${message ?? 'Provider sync failed.'} ${errorId ?? ''}`.trim(); await navigator.clipboard.writeText(text);}}>Copy error</Button></div></div>;
}
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

function SetupRequiredCard({ guidance, errorInfo }: { guidance: SetupGuidance | null; errorInfo: ApiErrorInfo }) {
  const { showToast } = useToast();
  const checklist = [
    {
      label: 'Supabase configured',
      value:
        guidance?.supabaseConfigured === null
          ? 'Unknown'
          : guidance?.supabaseConfigured
            ? 'Yes'
            : 'No',
    },
    {
      label: 'Missing tables',
      value: guidance?.missingTables.length ? guidance?.missingTables.join(', ') : 'None',
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
      showToast({ title: 'Copied', variant: 'success' });
    } catch {
      window.prompt('Copy details:', setupInstructions);
      showToast({ title: 'Copied', variant: 'info' });
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

const getMemberFirstName = (member: OrgMember) => String(getMemberValue(member, ['firstName', 'first_name']) ?? '').trim();
const getMemberLastName = (member: OrgMember) => String(getMemberValue(member, ['lastName', 'last_name']) ?? '').trim();

export default function AdminPage() {
  const { role } = useAuthControls();
  const hasRoleInfo = role !== null && role !== '';
  const canAccessAdmin = role === 'admin' || role === 'owner';
  const canManageTeam = role === 'admin' || role === 'owner';

  const { showToast } = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<ApiErrorInfo | null>(null);
  const [teamDiagnostics, setTeamDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);

  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteNextStepsEmail, setInviteNextStepsEmail] = useState<string | null>(null);
  const [pendingInviteEmail, setPendingInviteEmail] = useState<string | null>(null);
  const [pendingInviteResendLoading, setPendingInviteResendLoading] = useState(false);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState('member');
  const [editLoading, setEditLoading] = useState(false);

  const [removingByUserId, setRemovingByUserId] = useState<Record<string, boolean>>({});
  const [resettingByUserId, setResettingByUserId] = useState<Record<string, boolean>>({});
  const [removeConfirmTarget, setRemoveConfirmTarget] = useState<{
    userId: string;
    email: string;
  } | null>(null);

  const [googleUsageStatus, setGoogleUsageStatus] = useState<ProviderUsageGoogleStatus | null>(null);
  const [openAiUsageSummary, setOpenAiUsageSummary] = useState<ProviderUsageOpenAiSummary | null>(null);
  const [providerUsageLoading, setProviderUsageLoading] = useState(false);
  const [googleUsageError, setGoogleUsageError] = useState<ApiErrorInfo | null>(null);
  const [openAiUsageError, setOpenAiUsageError] = useState<ApiErrorInfo | null>(null);
  const [googleSyncLoading, setGoogleSyncLoading] = useState(false);
  const [openAiSyncLoading, setOpenAiSyncLoading] = useState(false);

  const [adminMetrics, setAdminMetrics] = useState<MetricsSummary | null>(null);
  const [adminMetricsLoading, setAdminMetricsLoading] = useState(false);
  const [adminMetricsError, setAdminMetricsError] = useState<string | null>(null);

  const loadProviderUsage = async () => {
    setProviderUsageLoading(true);
    setGoogleUsageError(null);
    setOpenAiUsageError(null);
    const [googleResult, openAiResult] = await Promise.allSettled([
      getGoogleProviderUsageStatus(),
      getOpenAiProviderUsageSummary(),
    ]);

    if (googleResult.status === 'fulfilled') {
      setGoogleUsageStatus(googleResult.value ?? null);
    } else {
      const errorInfo = getApiErrorInfo(googleResult.reason) ?? { message: 'Unable to load Google provider usage sync status.', endpoint: '/admin/provider-usage/google/status' };
      setGoogleUsageStatus(null);
      setGoogleUsageError(errorInfo);
    }

    if (openAiResult.status === 'fulfilled') {
      setOpenAiUsageSummary(openAiResult.value ?? null);
    } else {
      const errorInfo = getApiErrorInfo(openAiResult.reason) ?? { message: 'Unable to load OpenAI provider usage sync status.', endpoint: '/admin/provider-usage/openai/summary' };
      setOpenAiUsageSummary(null);
      setOpenAiUsageError(errorInfo);
    }

    setProviderUsageLoading(false);
  };

  const loadAdminMetrics = useCallback(async () => {
    setAdminMetricsLoading(true);
    setAdminMetricsError(null);
    try {
      const data = await getMetricsSummary('month');
      setAdminMetrics(data);
    } catch (err) {
      setAdminMetricsError((err as Error).message ?? 'Unable to load admin metrics.');
    } finally {
      setAdminMetricsLoading(false);
    }
  }, []);

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

  const editMemberDialogRef = useModalA11y<HTMLDivElement>(
    Boolean(editingMemberId),
    () => setEditingMemberId(null),
  );

  useEffect(() => {
    if (!canAccessAdmin) return;
    void Promise.all([loadMembers(), loadProviderUsage(), loadAdminMetrics()]);
  }, [canAccessAdmin, loadAdminMetrics]);

  const sendInvite = async ({ resend = false }: { resend?: boolean } = {}) => {
    if (!canManageTeam) return;

    const firstName = inviteFirstName.trim();
    const lastName = inviteLastName.trim();
    const email = inviteEmail.trim();

    if (!firstName || !lastName || !email) {
      const message = 'First name, last name, and email are required.';
      setTeamError({ message, endpoint: '/org/invite' });
      showToast({ title: message, variant: 'error' });
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      const message = 'Please enter a valid email address.';
      setTeamError({ message, endpoint: '/org/invite' });
      showToast({ title: message, variant: 'error' });
      return;
    }

    if (resend) {
      setPendingInviteResendLoading(true);
    } else {
      setInviteLoading(true);
    }

    setTeamError(null);
    setTeamMessage(null);
    setInviteNextStepsEmail(null);

    try {
      const inviteResponse = await inviteOrgMember({
        firstName,
        lastName,
        email,
        role: inviteRole,
        resend,
      });

      setInviteNextStepsEmail(email);
      setPendingInviteEmail(null);

      const responseMessage =
        typeof inviteResponse.message === 'string' && inviteResponse.message.trim().length > 0
          ? inviteResponse.message.trim()
          : 'Invite email sent. The user can finish onboarding from their invite email.';

      setTeamMessage(responseMessage);
      showToast({ title: responseMessage, variant: 'success' });

      if (!resend) {
        setInviteFirstName('');
        setInviteLastName('');
        setInviteEmail('');
        setInviteRole('member');
      }

      await loadMembers();
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to send invitation.', endpoint: '/org/invite' };

      if (errorInfo.status === 409) {
        setPendingInviteEmail(email);
        setInviteNextStepsEmail(null);
        const pendingMessage = 'An invitation is already pending for this email. You can resend the invite now.';
        setTeamError({ ...errorInfo, message: pendingMessage });
        showToast({ title: pendingMessage, variant: 'info' });
      } else {
        setPendingInviteEmail(null);
        setInviteNextStepsEmail(null);
        setTeamError(errorInfo);
        showToast({ title: errorInfo.message, variant: 'error' });
      }
    } finally {
      if (resend) {
        setPendingInviteResendLoading(false);
      } else {
        setInviteLoading(false);
      }
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendInvite();
  };

  const handleResendInvite = async () => {
    await sendInvite({ resend: true });
  };

  const handleCopyInviteTroubleshooting = async () => {
    const troubleshootingSteps = 'Check Supabase Email settings + URL Configuration Redirect URLs.';

    try {
      await navigator.clipboard.writeText(troubleshootingSteps);
      showToast({ title: 'Troubleshooting steps copied', variant: 'success' });
    } catch {
      window.prompt('Copy troubleshooting steps:', troubleshootingSteps);
      showToast({ title: 'Troubleshooting steps copied', variant: 'info' });
    }
  };

  const handleOpenEdit = (member: OrgMember) => {
    const userId = String(getMemberValue(member, ['userId', 'user_id', 'id']) ?? '');
    if (!userId) return;
    setEditingMemberId(userId);
    setEditFirstName(getMemberFirstName(member));
    setEditLastName(getMemberLastName(member));
    setEditRole(String(getMemberValue(member, ['role']) ?? 'member'));
  };

  const handleEditMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageTeam || !editingMemberId) return;
    setEditLoading(true);
    setTeamError(null);
    setTeamMessage(null);
    try {
      await updateOrgMember(editingMemberId, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        role: editRole,
      });
      setEditingMemberId(null);
      setTeamMessage('Member updated.');
      showToast({ title: 'Member updated', variant: 'success' });
      await loadMembers();
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to update member.', endpoint: `/org/members/${editingMemberId}` };
      setTeamError(errorInfo);
      showToast({ title: errorInfo.message, variant: 'error' });
    } finally {
      setEditLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!canManageTeam) return;
    setResettingByUserId((prev) => ({ ...prev, [userId]: true }));
    setTeamError(null);
    setTeamMessage(null);
    try {
      await resetOrgMemberPassword(userId);
      setTeamMessage('Password reset email sent.');
      showToast({ title: 'Password reset email sent', variant: 'success' });
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to reset member password.', endpoint: `/org/members/${userId}/reset-password` };
      setTeamError(errorInfo);
      showToast({ title: errorInfo.message, variant: 'error' });
    } finally {
      setResettingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleRemove = (userId: string, email: string) => {
    if (!canManageTeam) return;
    setRemoveConfirmTarget({ userId, email });
  };

  const confirmRemove = async () => {
    if (!canManageTeam) return;
    const target = removeConfirmTarget;
    if (!target) return;
    const { userId } = target;
    setRemoveConfirmTarget(null);
    setTeamError(null);
    setTeamMessage(null);
    setRemovingByUserId((prev) => ({ ...prev, [userId]: true }));
    try {
      await removeOrgMember(userId);
      setTeamMessage('Member removed.');
      await loadMembers();
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to remove member.', endpoint: `/org/members/${userId}` };
      setTeamError(errorInfo);
      showToast({ title: errorInfo.message, variant: 'error' });
    } finally {
      setRemovingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleRefreshProviderUsage = async () => {
    await loadProviderUsage();
  };

  const handleGoogleSync = async () => {
    setGoogleSyncLoading(true);
    setGoogleUsageError(null);
    try {
      const response = await syncGoogleProviderUsage();
      showToast({ title: response.message ?? 'Google billing sync started.', variant: 'success' });
      await loadProviderUsage();
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to sync Google billing usage.', endpoint: '/admin/provider-usage/google/sync' };
      setGoogleUsageError(errorInfo);
      showToast({ title: errorInfo.message, variant: 'error' });
    } finally {
      setGoogleSyncLoading(false);
    }
  };

  const handleOpenAiSync = async () => {
    setOpenAiSyncLoading(true);
    setOpenAiUsageError(null);
    try {
      const response = await syncOpenAiProviderUsage();
      showToast({ title: response.message ?? 'OpenAI usage sync started.', variant: 'success' });
      await loadProviderUsage();
    } catch (err) {
      const errorInfo = getApiErrorInfo(err) ?? { message: 'Unable to sync OpenAI usage.', endpoint: '/admin/provider-usage/openai/sync' };
      setOpenAiUsageError(errorInfo);
      showToast({ title: errorInfo.message, variant: 'error' });
    } finally {
      setOpenAiSyncLoading(false);
    }
  };

  const googleBillingSyncConfigured = getGoogleBillingSyncConfigured(googleUsageStatus);
  const showLocalOnlyExplanation = googleUsageStatus?.billing_snapshot_missing === true && googleBillingSyncConfigured !== true;

  const adminUsageMetrics = useMemo(
    () => (adminMetrics ? flattenUsageSummary(adminMetrics as Record<string, unknown>) : null),
    [adminMetrics],
  );
  const adminCostSections = useMemo(
    () => buildAdminMtdOnlySections({
      usage: adminUsageMetrics ?? {},
      estimatedJobCost: adminMetrics?.total_cost_usd ?? adminMetrics?.spend_usd ?? adminMetrics?.spendUsd,
      estimatedMonthlyTotal: adminMetrics?.google_month_to_date_actual_or_estimated_cost_usd ?? adminMetrics?.estimated_monthly_total_usd ?? adminMetrics?.estimated_monthly_cost_usd ?? adminMetrics?.total_cost_usd ?? adminMetrics?.spend_usd ?? adminMetrics?.spendUsd,
      jobGeocodingCalls: (adminMetrics as Record<string, unknown>)?.job_geocoding_calls ?? adminMetrics?.googleCalls,
    }),
    [adminMetrics, adminUsageMetrics],
  );
  const showAdminLocalOnlyWarning = useMemo(
    () => hasLocalOnlyBillingWarning(adminUsageMetrics ?? {}),
    [adminUsageMetrics],
  );


  return (
    <AppShell density="wide" title="Admin" subtitle="Manage your organization team.">
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
            <SectionHeader
              title="System status"
              subtitle="API health and credential checks for this environment."
            />
            <div className="mt-4">
              <StatusIndicators />
            </div>
          </Card>
          <Card>
            <SectionHeader
              title="Provider Usage"
              subtitle="Review provider sync health and trigger billing/usage refreshes without rerunning parse jobs."
              action={
                <Button type="button" variant="secondary" onClick={() => void handleRefreshProviderUsage()} disabled={providerUsageLoading || googleSyncLoading || openAiSyncLoading}>
                  {providerUsageLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              }
            />

            {providerUsageLoading && !googleUsageStatus && !openAiUsageSummary ? (
              <EmptyState className="mt-6 py-8" title="Loading provider usage" description="Fetching Google billing and OpenAI usage sync status..." />
            ) : (
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Google</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Billing-account sync and snapshot status.</p>
                    </div>
                    <Button type="button" variant="primary" onClick={() => void handleGoogleSync()} disabled={googleSyncLoading || providerUsageLoading}>
                      {googleSyncLoading ? 'Syncing...' : 'Sync Google billing now'}
                    </Button>
                  </div>

                  <ProviderSyncStatusBanner state={googleUsageError ? 'failed' : getMissingGoogleConfigEnvVars(googleUsageStatus).length > 0 ? 'not_configured' : showLocalOnlyExplanation ? 'local_only' : 'ok'} message={googleUsageError?.message} missingEnvVars={getMissingGoogleConfigEnvVars(googleUsageStatus)} onRetry={() => void handleGoogleSync()} />

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ProviderDetailRow label="Sync status" value={formatDisplayValue(googleUsageStatus?.sync_status)} />
                    <ProviderDetailRow
                      label="Pricing source/confidence"
                      value={
                        googleUsageStatus?.pricing_source || googleUsageStatus?.pricing_confidence
                          ? `${formatDisplayValue(googleUsageStatus?.pricing_source, 'Unknown source')} / ${formatDisplayValue(googleUsageStatus?.pricing_confidence, 'Unknown confidence')}`
                          : 'Unknown source / Unknown confidence'
                      }
                    />
                    <ProviderDetailRow
                      label="Billing snapshot as of"
                      value={googleUsageStatus?.billing_snapshot_as_of ? formatDateTime(googleUsageStatus.billing_snapshot_as_of) : 'Billing snapshot missing.'}
                    />
                    <ProviderDetailRow label="Snapshot rows count" value={formatDisplayValue(googleUsageStatus?.snapshot_rows_count, '0')} />
                    <ProviderDetailRow
                      label="Remaining free cap status mode"
                      value={formatDisplayValue(googleUsageStatus?.remaining_free_cap_status_mode)}
                    />
                    <ProviderDetailRow
                      label="Config status"
                      value={getGoogleConfigStatusMessage(googleUsageStatus)}
                    />
                  </div>

                  {showLocalOnlyExplanation ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                      {LOCAL_ONLY_EXPLANATION}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">OpenAI</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Project usage sync status.</p>
                    </div>
                    <Button type="button" variant="primary" onClick={() => void handleOpenAiSync()} disabled={openAiSyncLoading || providerUsageLoading}>
                      {openAiSyncLoading ? 'Syncing...' : 'Sync OpenAI usage now'}
                    </Button>
                  </div>

                  <ProviderSyncStatusBanner state={openAiUsageError ? 'failed' : 'ok'} message={openAiUsageError?.message} onRetry={() => void handleOpenAiSync()} />

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ProviderDetailRow label="Sync status" value={formatDisplayValue(openAiUsageSummary?.sync_status)} />
                    <ProviderDetailRow label="Last sync timestamp" value={formatDateTime(openAiUsageSummary?.last_sync_timestamp)} />
                    <ProviderDetailRow label="Project id" value={formatDisplayValue(openAiUsageSummary?.project_id)} />
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader
              title="Month-to-date cost & usage"
              subtitle="Internal cost detail for testing and reconciliation. Not shown to non-admin users."
              action={
                <Button type="button" variant="secondary" onClick={() => void loadAdminMetrics()} disabled={adminMetricsLoading}>
                  {adminMetricsLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              }
            />
            {adminMetricsError ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                {adminMetricsError}
              </div>
            ) : null}
            {showAdminLocalOnlyWarning ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                {LOCAL_ONLY_BILLING_WARNING}
              </div>
            ) : null}
            <div className="mt-4">
              <InternalCostPanel
                title="Month-to-date cost & usage"
                subtitle="Visible to admin and owner roles only."
                sections={adminCostSections}
                isPrivileged
              />
            </div>
          </Card>

          <Card>
            <SectionHeader title="Team" subtitle="Manage members and organization access." />

            {canManageTeam ? (
              <form onSubmit={handleInvite} className="mt-5 grid gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_180px_auto]">
                <input
                  type="text"
                  value={inviteFirstName}
                  onChange={(event) => setInviteFirstName(event.target.value)}
                  required
                  placeholder="First name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
                />
                <input
                  type="text"
                  value={inviteLastName}
                  onChange={(event) => setInviteLastName(event.target.value)}
                  required
                  placeholder="Last name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
                />
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
                <Button type="submit" disabled={inviteLoading} variant="primary">
                  {inviteLoading ? 'Inviting...' : 'Invite Member'}
                </Button>
              </form>
            ) : null}

            {teamError && teamError.status !== 409 && teamError.status !== 502 ? <SetupRequiredCard guidance={getSetupGuidanceFromDiagnostics(teamDiagnostics, teamError.message)} errorInfo={teamError} /> : null}
            {teamError?.status === 502 ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>{teamError.message}</p>
                  <Button type="button" variant="secondary" onClick={() => void handleCopyInviteTroubleshooting()}>
                    Copy troubleshooting steps
                  </Button>
                </div>
                <p className="mt-2 text-xs text-rose-700 dark:text-rose-200">Check Supabase Email settings + URL Configuration Redirect URLs.</p>
              </div>
            ) : null}
            {teamError?.status === 409 && pendingInviteEmail ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                <p>
                  Invite already pending for <span className="font-semibold">{pendingInviteEmail}</span>.
                </p>
                <Button type="button" variant="secondary" onClick={() => void handleResendInvite()} disabled={pendingInviteResendLoading || inviteLoading}>
                  {pendingInviteResendLoading ? 'Resending...' : 'Resend invite'}
                </Button>
              </div>
            ) : null}
            {teamMessage ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                {teamMessage}
              </div>
            ) : null}
            {inviteNextStepsEmail ? (
              <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800/70 dark:bg-indigo-950/30 dark:text-indigo-100">
                <p className="font-semibold">Next steps</p>
                <p className="mt-1">We emailed <span className="font-semibold">{inviteNextStepsEmail}</span>. They must click the link, then set a password to finish setup.</p>
              </div>
            ) : null}

            {teamLoading ? (
              <EmptyState className="mt-6 py-8" title="Loading team" description="Loading team..." />
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Joined</th>
                      <th className="border-l border-slate-200 px-3 py-2 text-right dark:border-slate-800">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                    {members.map((member) => {
                      const userId = String(getMemberValue(member, ['userId', 'user_id', 'id']) ?? '');
                      const firstName = getMemberFirstName(member);
                      const lastName = getMemberLastName(member);
                      const fullName = `${firstName} ${lastName}`.trim() || 'No name';
                      const email = String(getMemberValue(member, ['email']) ?? 'Unknown email');
                      const memberRole = String(getMemberValue(member, ['role']) ?? 'member');
                      const joinedValue = getMemberValue(member, ['createdAt', 'created_at']);
                      const joinedLabel =
                        typeof joinedValue === 'string' && !Number.isNaN(new Date(joinedValue).getTime())
                          ? new Date(joinedValue).toLocaleDateString()
                          : '--';

                      return (
                        <tr key={userId || email}>
                          <td className="px-3 py-3 text-sm font-medium text-slate-800 dark:text-slate-100">{fullName}</td>
                          <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">{email}</td>
                          <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300"><span className="capitalize">{memberRole}</span></td>
                          <td className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">{joinedLabel}</td>
                          <td className="border-l border-slate-100 px-3 py-3 text-right text-sm dark:border-slate-800">
                            {canManageTeam ? (
                              <div className="flex justify-end gap-2">
                                <Button type="button" disabled={!userId} onClick={() => handleOpenEdit(member)} variant="secondary" size="sm">
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  disabled={Boolean(resettingByUserId[userId]) || !userId}
                                  onClick={() => void handleResetPassword(userId)}
                                  variant="ghost" size="sm"
                                >
                                  {resettingByUserId[userId] ? 'Sending...' : 'Reset Password'}
                                </Button>
                                <Button
                                  type="button"
                                  disabled={Boolean(removingByUserId[userId]) || !userId}
                                  onClick={() => void handleRemove(userId, email)}
                                  variant="destructive" size="sm"
                                >
                                  {removingByUserId[userId] ? 'Removing...' : 'Remove'}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-slate-400">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
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

      {removeConfirmTarget ? (
        <RemoveConfirmDialog
          email={removeConfirmTarget.email}
          onCancel={() => setRemoveConfirmTarget(null)}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}

      {editingMemberId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditingMemberId(null);
          }}
        >
          <div
            ref={editMemberDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-member-dialog-title"
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950 focus:outline-none"
          >
            <h3 id="edit-member-dialog-title" className="text-lg font-semibold">Edit team member</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update name and role for this user.</p>
            <form className="mt-4 space-y-4" onSubmit={handleEditMember}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(event) => setEditFirstName(event.target.value)}
                  placeholder="First name"
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
                />
                <input
                  type="text"
                  value={editLastName}
                  onChange={(event) => setEditLastName(event.target.value)}
                  placeholder="Last name"
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
                />
              </div>
              <select
                value={editRole}
                onChange={(event) => setEditRole(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
              >
                {roleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditingMemberId(null)} disabled={editLoading}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}


type RemoveConfirmDialogProps = {
  email: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function RemoveConfirmDialog({ email, onConfirm, onCancel }: RemoveConfirmDialogProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(true, onCancel);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 dark:bg-slate-950/70"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      data-testid="remove-confirm-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-confirm-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950 dark:shadow-slate-950/50 focus:outline-none"
      >
        <h3
          id="remove-confirm-title"
          className="text-lg font-semibold text-slate-800 dark:text-slate-100"
        >
          Remove team member?
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Remove <span className="font-semibold">{email}</span> from this organization?
          They will lose access immediately.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}
