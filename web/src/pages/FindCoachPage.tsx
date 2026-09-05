import { useEffect, useState } from 'react';
import { listCoachProfiles } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { CoachProfile } from '../api/types';
import { Card, EmptyState, ErrorBanner, PageHeader, Pill, Spinner } from '../components/ui';

export function FindCoachPage() {
  const [profiles, setProfiles] = useState<CoachProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    listCoachProfiles(1, 50)
      .then((res) => setProfiles(res.profiles))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the coach directory.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Find a Coach"
        description="Coaches on FitFlow. A coach reaches out to start a coaching relationship — you can accept it from My Coaches."
      />
      <ErrorBanner message={error} />

      {isLoading ? (
        <Spinner />
      ) : profiles.length === 0 ? (
        <EmptyState message="No coaches listed yet." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {profiles.map((profile) => (
            <Card key={profile.userId} className="p-5">
              <div className="mb-2 flex items-start justify-between">
                <h3 className="font-semibold text-slate-900">{profile.displayName}</h3>
                <Pill tone={profile.acceptsNewClients ? 'green' : 'slate'}>
                  {profile.acceptsNewClients ? 'Accepting clients' : 'Not accepting clients'}
                </Pill>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(profile.specialties ?? []).map((s) => (
                  <Pill key={s.id}>{s.specialty}</Pill>
                ))}
                {(profile.specialties ?? []).length === 0 && (
                  <span className="text-sm text-slate-400">No specialties listed.</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
