import { FormEvent, useEffect, useState } from 'react';
import { createGym, deleteGym, listGyms, updateGym } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { Gym } from '../../api/types';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Label, PageHeader, Pagination, Spinner } from '../../components/ui';

const PAGE_SIZE = 20;

export function GymsPage() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Gym | null>(null);
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    setIsLoading(true);
    listGyms(page, PAGE_SIZE)
      .then((res) => {
        setGyms(res.gyms);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load gyms.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [page]);

  async function handleDelete(gym: Gym) {
    if (!window.confirm(`Delete "${gym.name}"? This is blocked if the gym still has check-ins.`)) return;
    try {
      await deleteGym(gym.id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete gym.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Gyms"
        description="The gym catalog members check in against."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Add gym
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {showForm && (
        <GymForm
          gym={editing}
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
      ) : gyms.length === 0 ? (
        <EmptyState message="No gyms yet." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gyms.map((gym) => (
                <tr key={gym.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{gym.name}</td>
                  <td className="px-4 py-3 text-slate-600">{gym.city ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{gym.state ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="mr-3 text-sm text-brand-700 hover:underline"
                      onClick={() => {
                        setEditing(gym);
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </button>
                    <button className="text-sm text-red-600 hover:underline" onClick={() => void handleDelete(gym)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}

function GymForm({
  gym,
  onCancel,
  onSaved,
  onError,
}: {
  gym: Gym | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(gym?.name ?? '');
  const [city, setCity] = useState(gym?.city ?? '');
  const [state, setState] = useState(gym?.state ?? '');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      if (gym) {
        await updateGym(gym.id, { name, city: city || undefined, state: state || undefined });
      } else {
        await createGym({ name, city: city || undefined, state: state || undefined });
      }
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to save gym.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <Label htmlFor="gym-name">Name</Label>
            <Input id="gym-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="gym-city">City</Label>
            <Input id="gym-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="gym-state">State</Label>
            <Input id="gym-state" value={state} onChange={(e) => setState(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : gym ? 'Save changes' : 'Create gym'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
