import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { deleteUser, getMember, grantRole, revokeRole } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { Member, RoleCode } from '../../api/types';
import { Button, Card, ErrorBanner, PageHeader, Pill, Select, Spinner } from '../../components/ui';

const ALL_ROLES: RoleCode[] = ['ADMIN', 'COACH', 'SUBSCRIBER', 'USER', 'GYM_PARTNER'];

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [roleToAdd, setRoleToAdd] = useState<RoleCode>('COACH');
  const [isSavingRole, setIsSavingRole] = useState(false);

  function refresh() {
    if (!id) return;
    setIsLoading(true);
    getMember(id)
      .then((res) => setMember(res.member))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load member.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [id]);

  async function handleDelete() {
    if (!id || !window.confirm('Permanently delete this account? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      await deleteUser(id);
      navigate('/admin/members');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete member.');
      setIsDeleting(false);
    }
  }

  async function handleGrantRole() {
    if (!id) return;
    setIsSavingRole(true);
    setError(null);
    try {
      const updated = await grantRole(id, roleToAdd);
      setMember((prev) => (prev ? { ...prev, roles: updated.roles } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to grant role.');
    } finally {
      setIsSavingRole(false);
    }
  }

  async function handleRevokeRole(code: RoleCode) {
    if (!id) return;
    if (!window.confirm(`Remove the ${code} role from this account?`)) return;
    setError(null);
    try {
      await revokeRole(id, code);
      setMember((prev) => (prev ? { ...prev, roles: prev.roles.filter((r) => r !== code) } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove role.');
    }
  }

  if (isLoading) return <Spinner />;
  if (!member) return <ErrorBanner message={error ?? 'Member not found.'} />;

  const availableToGrant = ALL_ROLES.filter((r) => !member.roles.includes(r));
  const isSelf = member.id === currentUser?.id;

  return (
    <div>
      <Link to="/admin/members" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        ← Back to members
      </Link>
      <PageHeader
        title={member.profile?.firstName ? `${member.profile.firstName} ${member.profile.lastName ?? ''}`.trim() : member.email}
        description={member.email}
        action={
          <Button variant="danger" onClick={() => void handleDelete()} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete account'}
          </Button>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Profile</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Status"><Pill tone={member.status === 'active' ? 'green' : 'amber'}>{member.status}</Pill></Row>
            <Row label="Timezone">{member.profile?.timezone ?? '—'}</Row>
            <Row label="Height (cm)">{member.profile?.heightCm ?? '—'}</Row>
            <Row label="Weight (kg)">{member.profile?.currentWeightKg ?? '—'}</Row>
            <Row label="Joined">{new Date(member.createdAt).toLocaleDateString()}</Row>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Active Goals</h2>
          {member.goals.length === 0 ? (
            <p className="text-sm text-slate-500">No active goals.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {member.goals.map((goal) => (
                <li key={goal.id} className="py-2 text-sm text-slate-700">
                  {goal.title}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 sm:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Roles</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {member.roles.map((code) => {
              // Mirrors the API's own self-lockout guard (can't remove
              // your own ADMIN role) so this button isn't offered only
              // to 403 when clicked — the API still enforces this
              // regardless of what the UI shows.
              const canRemove = !(isSelf && code === 'ADMIN') && member.roles.length > 1;
              return (
                <Pill key={code} tone={code === 'ADMIN' ? 'red' : code === 'COACH' ? 'green' : 'slate'}>
                  {code}
                  {canRemove && (
                    <button
                      className="ml-1 text-slate-500 hover:text-red-600"
                      onClick={() => void handleRevokeRole(code)}
                      aria-label={`Remove ${code} role`}
                    >
                      ×
                    </button>
                  )}
                </Pill>
              );
            })}
          </div>
          {availableToGrant.length > 0 && (
            <div className="flex gap-2">
              <Select value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value as RoleCode)} className="max-w-xs">
                {availableToGrant.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={() => void handleGrantRole()} disabled={isSavingRole}>
                {isSavingRole ? 'Adding…' : 'Add role'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{children}</dd>
    </div>
  );
}
