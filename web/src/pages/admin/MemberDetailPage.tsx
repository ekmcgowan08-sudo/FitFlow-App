import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteUser, getMember } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { Member } from '../../api/types';
import { Button, Card, ErrorBanner, PageHeader, Pill, Spinner } from '../../components/ui';

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    getMember(id)
      .then((res) => setMember(res.member))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load member.'))
      .finally(() => setIsLoading(false));
  }, [id]);

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

  if (isLoading) return <Spinner />;
  if (!member) return <ErrorBanner message={error ?? 'Member not found.'} />;

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
                <li key={goal.id} className="py-2 text-sm capitalize text-slate-700">
                  {goal.goalType.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
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
