// Shared response/domain shapes mirroring openapi/openapi.yaml. Kept
// intentionally narrow — only the fields each page actually reads — since
// the API's `omit`/`select` usage means response shapes already exclude
// anything sensitive (passwordHash, etc.) at the source.

export type RoleCode = 'USER' | 'COACH' | 'ADMIN' | 'SUBSCRIBER' | 'GYM_PARTNER';

export interface AuthUser {
  id: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: string;
}

export interface MemberProfile {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  sexAtBirth?: string | null;
  heightCm?: number | null;
  currentWeightKg?: number | null;
  timezone?: string | null;
}

export type GoalCategory = 'weight' | 'strength' | 'nutrition' | 'consistency' | 'sleep' | 'budget';
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'archived';

export interface Goal {
  id: string;
  userId: string;
  category: GoalCategory;
  title: string;
  targetValue?: number | null;
  targetUnit?: string | null;
  dueDate?: string | null;
  status: GoalStatus;
}

export interface Streak {
  id: string;
  userId: string;
  streakType: string;
  currentCount: number;
  bestCount: number;
  lastActivityDate?: string | null;
}

export interface Member {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  profile: MemberProfile | null;
  goals: Goal[];
  roles: RoleCode[];
}

export type WorkoutCategory = 'STRENGTH' | 'CARDIO' | 'MOBILITY' | 'SPORT' | 'RECOVERY';

export interface WorkoutSet {
  id: string;
  setNumber: number;
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  completed: boolean;
}

export interface WorkoutSessionExercise {
  id: string;
  exercise: { id: string; name: string; category: string };
  sortOrder: number;
  noteText?: string | null;
  sets: WorkoutSet[];
}

export interface WorkoutLog {
  id: string;
  userId: string;
  startedAt: string;
  completedAt?: string | null;
  status: string;
  caloriesBurned?: number | null;
  sessionExercises: WorkoutSessionExercise[];
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

export interface NutritionLog {
  id: string;
  userId: string;
  loggedAt: string;
  mealType: MealType;
  itemName: string;
  servingDescription?: string | null;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  waterOz?: number | null;
}

export interface Gym {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment?: string | null;
  whyItWorks?: string | null;
  howToVideoUrl?: string | null;
  createdAt: string;
}

export type RelationshipStatus = 'pending' | 'active' | 'paused' | 'ended';

// No synthetic `id` — CoachAssignment's real primary key is the
// composite (coachUserId, clientUserId) (see prisma/schema.prisma's
// `@@id([coachUserId, clientUserId])`), which is also exactly what
// PATCH /v1/coach/assignments/:coachUserId/:clientUserId addresses.
export interface CoachAssignment {
  coachUserId: string;
  clientUserId: string;
  relationshipStatus: RelationshipStatus;
  notes?: string | null;
  createdAt: string;
}

export interface CoachSpecialty {
  id: string;
  coachUserId: string;
  specialty: string;
}

export interface CoachProfile {
  userId: string;
  displayName: string;
  acceptsNewClients: boolean;
  specialties?: CoachSpecialty[];
}

export interface Page<T> {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}
