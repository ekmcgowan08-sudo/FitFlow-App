import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deleteNutritionLog, listNutritionLogs } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { NutritionLog } from '../api/types';
import { Card, EmptyState, ErrorBanner, PageHeader, Pagination, Pill, Spinner } from '../components/ui';

const PAGE_SIZE = 10;

const MEAL_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red'> = {
  breakfast: 'amber',
  lunch: 'green',
  dinner: 'slate',
  snack: 'red',
  drink: 'slate',
};

export function NutritionLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function refresh() {
    if (!user) return;
    setIsLoading(true);
    listNutritionLogs(user.id, page, PAGE_SIZE)
      .then((res) => {
        setLogs(res.logs);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load nutrition logs.'))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [user, page]);

  async function handleDelete(log: NutritionLog) {
    if (!window.confirm(`Delete the log for "${log.itemName}"?`)) return;
    try {
      await deleteNutritionLog(log.id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete nutrition log.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Nutrition Logs"
        description="Your logged meals. Day-to-day logging happens in the mobile app — this is a read-only history."
      />
      <ErrorBanner message={error} />

      {isLoading ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <EmptyState message="No nutrition logs yet." />
      ) : (
        <>
          <Card>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Meal</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Calories</th>
                  <th className="px-4 py-3">Protein (g)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(log.loggedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Pill tone={MEAL_TONE[log.mealType] ?? 'slate'}>{log.mealType}</Pill>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{log.itemName}</td>
                    <td className="px-4 py-3 text-slate-600">{log.calories ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{log.proteinGrams ?? '—'}</td>
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
