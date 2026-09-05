import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getMember, listMyStreaks } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { Goal, Member, Streak } from '../api/types';
import { Card, EmptyState, ErrorBanner, PageHeader, Pill, Spinner } from '../components/ui';

export function OverviewPage() {
  const { user, roles } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    Promise.all([getMember(user.id), listMyStreaks()])
      .then(([memberRes, streaksRes]) => {
        setMember(memberRes.member);
        setStreaks(streaksRes.streaks);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your dashboard.'))
      .finally(() => setIsLoading(false));
  }, [user]);

  const displayName = member?.profile?.firstName
    ? `${member.profile.firstName} ${member.profile.lastName ?? ''}`.trim()
    : user?.email;

  return (
    <div>
      <PageHeader title={`Welcome back${displayName ? `, ${displayName}` : ''}`} description="Your FitFlow snapshot." />
      <ErrorBanner message={error} />

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Roles" value={roles.join(', ') || 'USER'} />
            <StatCard label="Active Goals" value={String(member?.goals.length ?? 0)} />
            <StatCard
              label="Best Streak"
              value={streaks.length ? String(Math.max(...streaks.map((s) => s.bestCount))) : '0'}
            />
          </div>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Streaks</h2>
            {streaks.length === 0 ? (
              <EmptyState message="No streaks yet — log a workout or check in at a gym to start one." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {streaks.map((streak) => (
                  <li key={streak.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-700 capitalize">{streak.streakType.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <Pill tone={streak.currentCount > 0 ? 'green' : 'slate'}>{streak.currentCount} day streak</Pill>
                      <span className="text-slate-400">best {streak.bestCount}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Active Goals</h2>
              <Link to="/goals" className="text-sm text-brand-700 hover:underline">
                Manage goals →
              </Link>
            </div>
            {(member?.goals.length ?? 0) === 0 ? (
              <EmptyState message="No active goals yet." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {member!.goals.map((goal: Goal) => (
                  <li key={goal.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">{goal.title}</span>
                    <span className="text-slate-400">{goal.dueDate ? `by ${goal.dueDate}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
}
