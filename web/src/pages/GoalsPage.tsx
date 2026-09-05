import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createGoal, deleteGoal, listGoals, updateGoal } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { Goal } from '../api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Label,
  PageHeader,
  Pill,
  Select,
  Spinner,
} from '../components/ui';

const CATEGORIES = ['weight', 'strength', 'nutrition', 'consistency', 'sleep', 'budget'];
const STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red'> = {
  active: 'green',
  paused: 'amber',
  achieved: 'green',
  archived: 'slate',
};

export function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    if (!user) return;
    setIsLoading(true);
    listGoals(user.id)
      .then((res) => setGoals(res.goals))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load goals.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [user]);

  async function handleMarkAchieved(goal: Goal) {
    try {
      await updateGoal(goal.id, { status: 'achieved' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update goal.');
    }
  }

  async function handleDelete(goal: Goal) {
    if (!window.confirm(`Delete the goal "${goal.title}"?`)) return;
    try {
      await deleteGoal(goal.id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete goal.');
    }
  }

  return (
    <div>
      <PageHeader
        title="My Goals"
        description="Track what you're working toward."
        action={<Button onClick={() => setShowForm(true)}>Add goal</Button>}
      />
      <ErrorBanner message={error} />

      {showForm && user && (
        <NewGoalForm
          userId={user.id}
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
      ) : goals.length === 0 ? (
        <EmptyState message="No goals yet." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {goals.map((goal) => (
                <tr key={goal.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{goal.title}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{goal.category}</td>
                  <td className="px-4 py-3 text-slate-500">{goal.dueDate ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[goal.status] ?? 'slate'}>{goal.status}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {goal.status === 'active' && (
                      <button
                        className="mr-3 text-sm text-brand-700 hover:underline"
                        onClick={() => void handleMarkAchieved(goal)}
                      >
                        Mark achieved
                      </button>
                    )}
                    <button className="text-sm text-red-600 hover:underline" onClick={() => void handleDelete(goal)}>
                      Delete
                    </button>
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

function NewGoalForm({
  userId,
  onCancel,
  onSaved,
  onError,
}: {
  userId: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await createGoal({ userId, category, title, dueDate: dueDate || undefined });
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to create goal.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <Label htmlFor="goal-title">Title</Label>
            <Input id="goal-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="goal-category">Category</Label>
            <Select id="goal-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="goal-due">Due date (optional)</Label>
            <Input id="goal-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Create goal'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
