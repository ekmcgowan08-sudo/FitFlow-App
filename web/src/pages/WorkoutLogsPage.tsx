import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deleteWorkoutLog, listWorkoutLogs } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { WorkoutLog } from '../api/types';
import { Card, EmptyState, ErrorBanner, PageHeader, Pagination, Pill, Spinner } from '../components/ui';

const PAGE_SIZE = 10;

const STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red'> = {
  completed: 'green',
  in_progress: 'amber',
  cancelled: 'red',
};

export function WorkoutLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function refresh() {
    if (!user) return;
    setIsLoading(true);
    listWorkoutLogs(user.id, page, PAGE_SIZE)
      .then((res) => {
        setLogs(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load workout logs.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [user, page]);

  async function handleDelete(log: WorkoutLog) {
    const label = log.sessionExercises[0]?.exercise.name ?? 'this workout';
    if (!window.confirm(`Delete the log for "${label}"?`)) return;
    try {
      await deleteWorkoutLog(log.id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete workout log.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Workout Logs"
        description="Your logged workouts. Day-to-day logging happens in the mobile app — this is a read-only history."
      />
      <ErrorBanner message={error} />

      {isLoading ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <EmptyState message="No workout logs yet." />
      ) : (
        <>
          <Card>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Exercise(s)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Calories</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(log.startedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {log.sessionExercises.length === 0
                        ? '—'
                        : log.sessionExercises
                            .slice()
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((se) => se.exercise.name)
                            .join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={STATUS_TONE[log.status] ?? 'slate'}>{log.status}</Pill>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{log.caloriesBurned ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-sm text-red-600 hover:underline" onClick={() => void handleDelete(log)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
