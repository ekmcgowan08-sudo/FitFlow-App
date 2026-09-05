import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getMember, updateMyProfile } from '../api/endpoints';
import { ApiError } from '../api/client';
import { Button, Card, ErrorBanner, Field, Input, Label, PageHeader, Spinner } from '../components/ui';

export function MyProfilePage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [timezone, setTimezone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMember(user.id)
      .then((res) => {
        const p = res.member.profile;
        setFullName(p?.firstName ? `${p.firstName} ${p.lastName ?? ''}`.trim() : '');
        setHeightCm(p?.heightCm != null ? String(p.heightCm) : '');
        setWeightKg(p?.currentWeightKg != null ? String(p.currentWeightKg) : '');
        setTimezone(p?.timezone ?? '');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your profile.'))
      .finally(() => setIsLoading(false));
  }, [user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateMyProfile(user.id, {
        fullName: fullName || undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        timezone: timezone || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save your profile.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title="My Profile" description="Basic details used across FitFlow." />
      <ErrorBanner message={error} />
      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Profile updated.
        </div>
      )}

      <Card className="max-w-lg p-5">
        <form onSubmit={handleSubmit}>
          <Field>
            <Label htmlFor="full-name">Full name</Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <Label htmlFor="height">Height (cm)</Label>
              <Input id="height" type="number" min="0" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </Field>
            <Field>
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" type="number" min="0" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </Field>
          </div>
          <Field>
            <Label htmlFor="timezone">Timezone (IANA)</Label>
            <Input id="timezone" placeholder="America/Chicago" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
