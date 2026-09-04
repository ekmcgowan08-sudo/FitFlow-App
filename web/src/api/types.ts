// Shared response/domain shapes mirroring openapi/openapi.yaml. Kept
// intentionally narrow — only the fields each page actually reads — since
// the API's `omit`/`select` usage means response shapes already exclude
// anything sensitive (passwordHash, etc.) at the source.

export type RoleCode = 'USER' | 'COACH' | 'ADMIN';

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

export interface Goal {
  id: string;
  userId: string;
  goalType: string;
  targetValue?: number | null;
  status: string;
  targetDate?: string | null;
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

export interface CoachAssignment {
  id: string;
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
