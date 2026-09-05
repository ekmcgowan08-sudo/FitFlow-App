import { useEffect, useState } from 'react';
import { listMyCoaches, updateAssignment, type AssignmentWithCoach } from '../api/endpoints';
import { ApiError } from '../api/client';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, Spinner } from '../components/ui';

const STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red'> = {
  pending: 'amber',
  active: 'green',
  paused: 'slate',
  ended: 'red',
};

export function MyCoachesPage() {
  const [assignments, setAssignments] = useState<AssignmentWithCoach[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function refresh() {
    setIsLoading(true);
    listMyCoaches()
      .then((res) => setAssignments(res.assignments))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your coaches.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, []);

  async function handleStatusChange(assignment: AssignmentWithCoach, relationshipStatus: string) {
    try {
      await updateAssignment(assignment.coachUserId, assignment.clientUserId, { relationshipStatus });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update this coaching relationship.');
    }
  }

  return (
    <div>
      <PageHeader title="My Coaches" description="Coaching requests you've received, and coaches you're working with." />
      <ErrorBanner message={error} />

      {isLoading ? (
        <Spinner />
      ) : assignments.length === 0 ? (
        <EmptyState message="No coaching relationships yet." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Coach</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a) => (
                <tr key={`${a.coachUserId}-${a.clientUserId}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.coach.email}</td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[a.relationshipStatus] ?? 'slate'}>{a.relationshipStatus}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.relationshipStatus === 'pending' && (
                      <>
                        <Button
                          className="mr-2"
                          onClick={() => void handleStatusChange(a, 'active')}
                        >
                          Accept
                        </Button>
                        <button
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => void handleStatusChange(a, 'ended')}
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {a.relationshipStatus === 'paused' && (
                      <button
                        className="mr-3 text-sm text-brand-700 hover:underline"
                        onClick={() => void handleStatusChange(a, 'active')}
                      >
                        Resume
                      </button>
                    )}
                    {(a.relationshipStatus === 'active' || a.relationshipStatus === 'paused') && (
                      <button
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => void handleStatusChange(a, 'ended')}
                      >
                        End
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
