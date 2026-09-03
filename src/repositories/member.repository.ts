/**
 * MemberRepository — aggregate root: users + user_profiles + goals.
 * This is the ONLY file allowed to call `prisma.user.*` / `prisma.userProfile.*`
 * directly. Services and routes depend on this interface instead.
 */
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { BaseRepository } from './base.repository';

export type MemberWithProfile = Omit<User, 'passwordHash'> & {
  profile: Prisma.UserProfileGetPayload<Record<string, never>> | null;
  goals: Prisma.GoalGetPayload<Record<string, never>>[];
};

export const DEFAULT_TIMEZONE = 'America/Chicago';
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Formats a Date as YYYY-MM-DD in a given IANA timezone, using only the
 * built-in Intl API — no date-library dependency needed. The `en-CA`
 * locale happens to format dates as YYYY-MM-DD, convenient for direct
 * string comparison.
 *
 * Deliberate simplification: `incrementStreak` below gets "yesterday" by
 * subtracting a fixed 24 hours in absolute time, then formatting the
 * result in the target timezone. Right at a DST transition (twice a
 * year, only in DST-observing timezones, only within the transition's
 * ~1-hour window), a calendar day is actually 23 or 25 hours, so this
 * can misclassify a same-day/consecutive-day/gap comparison by one day.
 * Accepted as a rare edge case rather than pulling in a full timezone
 * library for it.
 */
export function calendarDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    date,
  );
}

/**
 * Reads back a `YYYY-MM-DD` key from a `@db.Date` column value.
 * `Streak.lastActivityDate` holds no time-of-day or timezone — Prisma
 * represents it as a UTC-midnight JS Date matching the calendar-date
 * string it was written with (see `incrementStreak`'s `lastActivityDate
 * = new Date(`${todayKey}T00:00:00.000Z`)`). Reformatting it through
 * `calendarDateKey(date, timezone)` a second time would be wrong for any
 * timezone behind UTC (all of the Americas): UTC midnight of "2026-09-03"
 * is 7pm on "2026-09-02" in America/Chicago, so it would read back as
 * the day *before* the one actually stored. Pulling the UTC components
 * directly avoids reinterpreting an already-resolved calendar date as a
 * fresh instant to convert.
 */
function storedDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class MemberRepository extends BaseRepository<
  Prisma.UserWhereUniqueInput,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  User
> {
  // `incrementStreak` owns its own transaction boundary (`$transaction`,
  // which a `Prisma.TransactionClient` doesn't expose), so — like
  // WorkoutLogRepository — this takes a full `PrismaClient` rather than
  // `PrismaClientOrTx`.
  constructor(private readonly client: PrismaClient) {
    super(client.user);
  }

  /** Domain-named finder used by the dashboard and coach portfolio screens. */
  async findWithProfileAndGoals(userId: string): Promise<MemberWithProfile | null> {
    return this.client.user.findUnique({
      where: { id: userId },
      // `omit` keeps `passwordHash` out of every caller's response by
      // construction, rather than relying on every route handler to
      // remember to strip it before sending JSON back to the client.
      omit: { passwordHash: true },
      include: {
        profile: true,
        goals: { where: { status: 'active' } },
      },
    }) as Promise<MemberWithProfile | null>;
  }

  /**
   * incrementStreak — advances `currentCount` based on actual consecutive
   * calendar days (in the member's own timezone, from UserProfile.
   * timezone), not just "how many times has this been called": logging a
   * second workout the same day is a no-op, not a double-count; logging
   * again after a 2+ day gap resets to 1 instead of continuing to climb.
   * `bestCount` only ever rises to match a new high — a broken streak
   * doesn't erase the member's personal best. Needs a read-modify-write
   * in a transaction rather than a single `upsert` with `currentCount:
   * { increment: 1 }`: Prisma has no "set bestCount to
   * GREATEST(bestCount, currentCount)" update operator, and no
   * conditional "increment, or reset to 1, depending on the date" one
   * either.
   *
   * Always anchors to wall-clock `new Date()`, never a caller-supplied
   * date — deliberately, even though workout-log.routes.ts's ad-hoc log
   * endpoint accepts an arbitrary past `loggedAt`. Advancing the streak
   * as of a backdated `loggedAt` would let a member fabricate an
   * arbitrarily long streak in one sitting by logging one backdated
   * entry per missed day. See the comment at that call site for the
   * full reasoning.
   */
  async incrementStreak(userId: string, streakType: string): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const [existing, profile] = await Promise.all([
        tx.streak.findUnique({ where: { userId_streakType: { userId, streakType } } }),
        tx.userProfile.findUnique({ where: { userId }, select: { timezone: true } }),
      ]);
      const timezone = profile?.timezone ?? DEFAULT_TIMEZONE;

      const now = new Date();
      const todayKey = calendarDateKey(now, timezone);
      const lastActivityDate = new Date(`${todayKey}T00:00:00.000Z`);

      if (!existing) {
        await tx.streak.create({ data: { userId, streakType, currentCount: 1, bestCount: 1, lastActivityDate } });
        return;
      }

      const lastActivityKey = existing.lastActivityDate ? storedDateKey(existing.lastActivityDate) : null;
      if (lastActivityKey === todayKey) {
        // Already counted today.
        return;
      }

      const yesterdayKey = calendarDateKey(new Date(now.getTime() - ONE_DAY_MS), timezone);
      const currentCount = lastActivityKey === yesterdayKey ? existing.currentCount + 1 : 1;

      await tx.streak.update({
        where: { userId_streakType: { userId, streakType } },
        data: { currentCount, bestCount: Math.max(existing.bestCount, currentCount), lastActivityDate },
      });
    });
  }
}
