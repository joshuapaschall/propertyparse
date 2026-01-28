import { useMemo } from 'react';
import AppShell from '../components/AppShell';

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

const getStoredRole = () =>
  window.localStorage.getItem('pp-role') ?? window.localStorage.getItem('pp-user-role');

export default function AdminPage() {
  const storedRole = getStoredRole();
  const hasRoleInfo = storedRole !== null && storedRole !== '';
  const isAdmin = storedRole === 'admin';

  const members = useMemo<Member[]>(
    () => [
      {
        id: 'member-1',
        name: 'Alex Carter',
        email: 'alex@company.com',
        role: 'Admin',
        status: 'Active',
      },
      {
        id: 'member-2',
        name: 'Jordan Lee',
        email: 'jordan@company.com',
        role: 'Operator',
        status: 'Active',
      },
      {
        id: 'member-3',
        name: 'Sam Rivera',
        email: 'sam@company.com',
        role: 'Viewer',
        status: 'Pending Invite',
      },
    ],
    [],
  );

  return (
    <AppShell title="Admin" subtitle="Manage team access and account settings.">
      {!hasRoleInfo || !isAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Not authorized</h2>
          <p className="mt-2 text-sm text-slate-500">
            Admin access is restricted. If you believe you should have access, contact your account
            owner.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Team Members</h2>
                <p className="text-sm text-slate-500">
                  This is a preview UI. Connect the backend to make changes live.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                disabled
              >
                Invite member (coming soon)
              </button>
            </div>
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-800">{member.name}</td>
                        <td className="px-4 py-3 text-slate-700">{member.email}</td>
                        <td className="px-4 py-3 text-slate-700">{member.role}</td>
                        <td className="px-4 py-3 text-slate-700">{member.status}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-400"
                            disabled
                          >
                            Remove (placeholder)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
