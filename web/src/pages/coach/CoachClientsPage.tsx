import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { createAssignment, listMyClients, updateAssignment, type AssignmentWithClient } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Label, PageHeader, Pill, Spinner } from '../../components/ui';

const STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red'> = {
  pending: 'amber',
  active: 'green',
  paused: 'slate',
  ended: 'red',
};

export function CoachClientsPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentWithClient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    setIsLoading(true);
    listMyClients()
      .then((res) => setAssignments(res.assignments))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your client roster.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, []);

  async function handleStatusChange(assignment: AssignmentWithClient, relationshipStatus: string) {
    try {
      await updateAssignment(assignment.coachUserId, assignment.clientUserId, { relationshipStatus });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update assignment.');
    }
  }

  return (
    <div>
      <PageHeader
        title="My Clients"
        description="Members you coach. A new request stays pending until the client accepts it."
        action={<Button onClick={() => setShowForm(true)}>Request a new client</Button>}
      />
      <ErrorBanner message={error} />

      {showForm && user && (
        <NewAssignmentForm
          coachUserId={user.id}
          onCancel={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
          onError={setError}
        />
      )}

      {isLoading ? (
        <Spinner />
      ) : assignments.length === 0 ? (
        <EmptyState message="You have no clients yet." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.client.email}</td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[a.relationshipStatus] ?? 'slate'}>{a.relationshipStatus}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.relationshipStatus === 'pending' && (
                      <span className="text-xs text-slate-400">Waiting on client to accept</span>
                    )}
                    {a.relationshipStatus === 'paused' && (
                      <>
                        <span className="mr-3 text-xs text-slate-400">Waiting on client to resume</span>
                        <button className="text-sm text-red-600 hover:underline" onClick={() => void handleStatusChange(a, 'ended')}>
                          End
                        </button>
                      </>
                    )}
                    {a.relationshipStatus === 'active' && (
                      <>
                        <button
                          className="mr-3 text-sm text-slate-600 hover:underline"
                          onClick={() => void handleStatusChange(a, 'paused')}
                        >
                          Pause
                        </button>
                        <button
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => void handleStatusChange(a, 'ended')}
                        >
                          End
                        </button>
                      </>
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

function NewAssignmentForm({
  coachUserId,
  onCancel,
  onSaved,
  onError,
}: {
  coachUserId: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [clientUserId, setClientUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await createAssignment({ coachUserId, clientUserId, notes: notes || undefined });
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to create the request.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="client-id">Client's member ID</Label>
            <Input
              id="client-id"
              required
              placeholder="uuid"
              value={clientUserId}
              onChange={(e) => setClientUserId(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Sending…' : 'Send request'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
