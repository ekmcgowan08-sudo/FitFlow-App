import { FormEvent, useEffect, useState } from 'react';
import { createExercise, deleteExercise, listExercises, updateExercise } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { Exercise } from '../../api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Label,
  PageHeader,
  Pagination,
  Select,
  Spinner,
} from '../../components/ui';

const PAGE_SIZE = 20;
const CATEGORIES = ['strength', 'cardio', 'mobility', 'recovery', 'sport'];

export function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    setIsLoading(true);
    listExercises(page, PAGE_SIZE)
      .then((res) => {
        setExercises(res.exercises);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load exercises.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [page]);

  async function handleDelete(exercise: Exercise) {
    if (!window.confirm(`Delete "${exercise.name}"? This is blocked if it's used in any plan or logged workout.`)) return;
    try {
      await deleteExercise(exercise.id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete exercise.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Exercise Catalog"
        description="Exercises available for workout plans and logs."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Add exercise
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {showForm && (
        <ExerciseForm
          exercise={editing}
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
      ) : exercises.length === 0 ? (
        <EmptyState message="No exercises yet." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Equipment</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exercises.map((exercise) => (
                <tr key={exercise.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{exercise.name}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{exercise.category}</td>
                  <td className="px-4 py-3 text-slate-600">{exercise.equipment ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="mr-3 text-sm text-brand-700 hover:underline"
                      onClick={() => {
                        setEditing(exercise);
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </button>
                    <button className="text-sm text-red-600 hover:underline" onClick={() => void handleDelete(exercise)}>
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

function ExerciseForm({
  exercise,
  onCancel,
  onSaved,
  onError,
}: {
  exercise: Exercise | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [category, setCategory] = useState(exercise?.category ?? CATEGORIES[0]);
  const [equipment, setEquipment] = useState(exercise?.equipment ?? '');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      if (exercise) {
        await updateExercise(exercise.id, { name, category, equipment: equipment || undefined });
      } else {
        await createExercise({ name, category, equipment: equipment || undefined });
      }
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to save exercise.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <Label htmlFor="ex-name">Name</Label>
            <Input id="ex-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="ex-category">Category</Label>
            <Select id="ex-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="ex-equipment">Equipment</Label>
            <Input id="ex-equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : exercise ? 'Save changes' : 'Create exercise'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
