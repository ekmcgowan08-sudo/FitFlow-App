// Typed wrappers around apiFetch for every endpoint the dashboard calls.
// Grouped in one file (rather than one per resource) since each wrapper
// is a one-liner — splitting further would be more files to navigate for
// no real benefit at this size.
import { apiFetch } from './client';
import type {
  AuthUser,
  CoachAssignment,
  CoachProfile,
  CoachSpecialty,
  Exercise,
  Gym,
  Member,
  RoleCode,
  Streak,
  TokenPair,
} from './types';

// --- Auth --------------------------------------------------------------

export function login(email: string, password: string) {
  return apiFetch<{ user: AuthUser } & TokenPair>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function logout(refreshToken: string) {
  return apiFetch<void>('/v1/auth/logout', { method: 'POST', body: { refreshToken } });
}

export function whoAmI() {
  return apiFetch<{ id: string; email: string; roles: RoleCode[] }>('/v1/users/me');
}

// --- Members (ADMIN) -----------------------------------------------------

export function listMembers(page: number, pageSize: number) {
  return apiFetch<{ members: Member[]; page: number; pageSize: number; total: number }>('/v1/members', {
    query: { page, pageSize },
  });
}

export function getMember(id: string) {
  return apiFetch<{ member: Member }>(`/v1/members/${id}`);
}

export function deleteUser(id: string) {
  return apiFetch<void>(`/v1/admin/users/${id}`, { method: 'DELETE' });
}

// --- Streaks (self by default) ---------------------------------------------

export function listMyStreaks() {
  return apiFetch<{ streaks: Streak[] }>('/v1/streaks');
}

// --- Gyms (ADMIN write, any authenticated read) ---------------------------

export function listGyms(page: number, pageSize: number) {
  return apiFetch<{ gyms: Gym[]; page: number; pageSize: number; total: number }>('/v1/gyms', {
    query: { page, pageSize },
  });
}

export function createGym(input: { name: string; city?: string; state?: string }) {
  return apiFetch<{ gym: Gym }>('/v1/gyms', { method: 'POST', body: input });
}

export function updateGym(id: string, input: { name?: string; city?: string; state?: string }) {
  return apiFetch<{ gym: Gym }>(`/v1/gyms/${id}`, { method: 'PATCH', body: input });
}

export function deleteGym(id: string) {
  return apiFetch<void>(`/v1/gyms/${id}`, { method: 'DELETE' });
}

// --- Exercises (ADMIN write, any authenticated read) ----------------------

export function listExercises(page: number, pageSize: number, category?: string) {
  return apiFetch<{ exercises: Exercise[]; page: number; pageSize: number; total: number }>('/v1/exercises', {
    query: { page, pageSize, category },
  });
}

export function createExercise(input: { name: string; category: string; equipment?: string }) {
  return apiFetch<{ exercise: Exercise }>('/v1/exercises', { method: 'POST', body: input });
}

export function updateExercise(id: string, input: { name?: string; category?: string; equipment?: string }) {
  return apiFetch<{ exercise: Exercise }>(`/v1/exercises/${id}`, { method: 'PATCH', body: input });
}

export function deleteExercise(id: string) {
  return apiFetch<void>(`/v1/exercises/${id}`, { method: 'DELETE' });
}

// --- Coach assignments -----------------------------------------------------
// Neither list endpoint is paginated on the API side (see
// listClientsQuerySchema/listCoachesQuerySchema) — a coach's real-world
// roster size makes that an acceptable simplification there.

export type AssignmentWithClient = CoachAssignment & { client: { id: string; email: string; status: string } };
export type AssignmentWithCoach = CoachAssignment & { coach: { id: string; email: string; status: string } };

export function listMyClients(coachUserId?: string) {
  return apiFetch<{ assignments: AssignmentWithClient[] }>('/v1/coach/clients', {
    query: { coachUserId },
  });
}

export function listMyCoaches(clientUserId?: string) {
  return apiFetch<{ assignments: AssignmentWithCoach[] }>('/v1/coach/coaches', {
    query: { clientUserId },
  });
}

export function createAssignment(input: { coachUserId: string; clientUserId: string; notes?: string }) {
  return apiFetch<{ assignment: CoachAssignment }>('/v1/coach/assignments', { method: 'POST', body: input });
}

export function updateAssignment(
  coachUserId: string,
  clientUserId: string,
  input: { relationshipStatus?: string; notes?: string },
) {
  return apiFetch<{ assignment: CoachAssignment }>(`/v1/coach/assignments/${coachUserId}/${clientUserId}`, {
    method: 'PATCH',
    body: input,
  });
}

// --- Coach profile (self-service) -----------------------------------------

export function getCoachProfile(userId: string) {
  return apiFetch<{ profile: CoachProfile }>(`/v1/coach-profiles/${userId}`);
}

export function listCoachProfiles(page: number, pageSize: number, acceptingClients?: boolean) {
  return apiFetch<{ profiles: CoachProfile[]; page: number; pageSize: number; total: number }>(
    '/v1/coach-profiles',
    { query: { page, pageSize, acceptingClients } },
  );
}

export function upsertCoachProfile(userId: string, input: { displayName: string; acceptsNewClients?: boolean }) {
  return apiFetch<{ profile: CoachProfile }>(`/v1/coach-profiles/${userId}`, { method: 'PATCH', body: input });
}

export function addCoachSpecialty(userId: string, specialty: string) {
  return apiFetch<{ specialty: CoachSpecialty }>(`/v1/coach-profiles/${userId}/specialties`, {
    method: 'POST',
    body: { specialty },
  });
}

export function deleteCoachSpecialty(userId: string, specialtyId: string) {
  return apiFetch<void>(`/v1/coach-profiles/${userId}/specialties/${specialtyId}`, { method: 'DELETE' });
}

// --- Self-service member profile -------------------------------------------

export function updateMyProfile(
  userId: string,
  input: { fullName?: string; heightCm?: number; weightKg?: number; timezone?: string },
) {
  return apiFetch<{ profile: unknown }>(`/v1/members/${userId}`, { method: 'PATCH', body: input });
}
