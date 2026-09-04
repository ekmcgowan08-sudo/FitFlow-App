import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { addCoachSpecialty, deleteCoachSpecialty, getCoachProfile, upsertCoachProfile } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import type { CoachProfile } from '../../api/types';
import { Button, Card, ErrorBanner, Field, Input, Label, PageHeader, Pill, Spinner } from '../../components/ui';

export function CoachProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [acceptsNewClients, setAcceptsNewClients] = useState(true);
  const [newSpecialty, setNewSpecialty] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  function refresh() {
    if (!user) return;
    setIsLoading(true);
    getCoachProfile(user.id)
      .then((res) => {
        setProfile(res.profile);
        setDisplayName(res.profile.displayName);
        setAcceptsNewClients(res.profile.acceptsNewClients);
      })
      .catch((err) => {
        // 404 just means "no profile yet" — a perfectly normal first-time state.
        if (err instanceof ApiError && err.status === 404) {
          setProfile(null);
        } else {
          setError(err instanceof ApiError ? err.message : 'Failed to load your coach profile.');
        }
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [user]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setIsSaving(true);
    setError(null);
    try {
      await upsertCoachProfile(user.id, { displayName, acceptsNewClients });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save your profile.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddSpecialty(event: FormEvent) {
    event.preventDefault();
    if (!user || !newSpecialty.trim()) return;
    try {
      await addCoachSpecialty(user.id, newSpecialty.trim());
      setNewSpecialty('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add specialty.');
    }
  }

  async function handleRemoveSpecialty(specialtyId: string) {
    if (!user) return;
    try {
      await deleteCoachSpecialty(user.id, specialtyId);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove specialty.');
    }
  }

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Coach Profile"
        description="Your public listing in the coach directory members browse."
      />
      <ErrorBanner message={error} />

      <Card className="mb-6 p-5">
        <form onSubmit={handleSave}>
          <Field>
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={acceptsNewClients}
                onChange={(e) => setAcceptsNewClients(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Accepting new clients
            </label>
          </Field>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : profile ? 'Save changes' : 'Create profile'}
          </Button>
        </form>
      </Card>

      {profile && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Specialties</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {(profile.specialties ?? []).map((s) => (
              <Pill key={s.id}>
                {s.specialty}{' '}
                <button className="ml-1 text-slate-500 hover:text-red-600" onClick={() => void handleRemoveSpecialty(s.id)}>
                  ×
                </button>
              </Pill>
            ))}
            {(profile.specialties ?? []).length === 0 && <p className="text-sm text-slate-500">No specialties added yet.</p>}
          </div>
          <form onSubmit={handleAddSpecialty} className="flex gap-2">
            <Input
              placeholder="e.g. Powerlifting"
              value={newSpecialty}
              onChange={(e) => setNewSpecialty(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
