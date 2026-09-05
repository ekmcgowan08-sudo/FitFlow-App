// Minimal demo seed: roles, an admin, a coach, and a member with a
// profile, a goal, and one logged workout. Run with `npm run seed`.
import { PrismaClient, RoleCode, ExerciseCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertRole(code: RoleCode) {
  return prisma.role.upsert({ where: { code }, update: {}, create: { code } });
}

async function main() {
  const [adminRole, coachRole, userRole] = await Promise.all([
    upsertRole(RoleCode.ADMIN),
    upsertRole(RoleCode.COACH),
    upsertRole(RoleCode.USER),
  ]);

  const passwordHash = await bcrypt.hash('demo-password-123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@fitflow.example' },
    update: {},
    create: {
      email: 'admin@fitflow.example',
      passwordHash,
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });

  const coach = await prisma.user.upsert({
    where: { email: 'coach@fitflow.example' },
    update: {},
    create: {
      email: 'coach@fitflow.example',
      passwordHash,
      roles: { create: [{ roleId: coachRole.id }] },
      coachProfile: { create: { displayName: 'Alex the Coach' } },
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'member@fitflow.example' },
    update: {},
    create: {
      email: 'member@fitflow.example',
      passwordHash,
      roles: { create: [{ roleId: userRole.id }] },
      profile: { create: { firstName: 'Jamie', lastName: 'Athlete', timezone: 'America/Chicago' } },
      goals: { create: [{ category: 'strength', title: 'Squat 2x bodyweight' }] },
    },
  });

  await prisma.coachAssignment.upsert({
    where: { coachUserId_clientUserId: { coachUserId: coach.id, clientUserId: member.id } },
    // Explicitly 'active' on both branches, not left to the column
    // default ('pending' — see the schema comment on this column) and
    // not `update: {}`: this is a trusted, direct database seed, not a
    // POST /v1/coach/assignments call, so the consent requirement that
    // default exists to enforce doesn't apply here. Setting it on
    // `update` too means re-running this script resets the demo
    // relationship back to active even if it was left paused/ended by
    // whoever last poked at the demo account through the dashboard.
    update: { relationshipStatus: 'active' },
    create: { coachUserId: coach.id, clientUserId: member.id, relationshipStatus: 'active' },
  });

  // Matched by name rather than a hardcoded id: every other exercise in
  // the catalog gets a real generated UUID (@default(uuid()) in
  // prisma/schema.prisma), and several routes validate incoming exercise
  // ids as UUIDs (e.g. workout-plan.schema.ts) — a hardcoded readable id
  // here would be the one exercise in the whole catalog that couldn't be
  // referenced from those routes.
  const squat =
    (await prisma.exercise.findFirst({ where: { name: 'Back Squat', category: ExerciseCategory.strength } })) ??
    (await prisma.exercise.create({ data: { name: 'Back Squat', category: ExerciseCategory.strength } }));

  // WorkoutSession has no natural unique key to upsert against, so
  // idempotency here is "does this demo member already have a logged
  // workout at all" — safe for a seed script whose whole member account
  // is otherwise untouched by anything but this script and manual
  // dashboard exploration.
  const hasWorkout = await prisma.workoutSession.findFirst({ where: { userId: member.id } });
  if (!hasWorkout) {
    await prisma.workoutSession.create({
      data: {
        userId: member.id,
        startedAt: new Date(),
        completedAt: new Date(),
        status: 'completed',
        caloriesBurned: 250,
        sessionExercises: {
          create: {
            exerciseId: squat.id,
            sets: { create: [{ setNumber: 1, reps: 5, weightKg: 80, completed: true }] },
          },
        },
      },
    });
  }

  const gym =
    (await prisma.gym.findFirst({ where: { name: 'FitFlow Downtown' } })) ??
    (await prisma.gym.create({ data: { name: 'FitFlow Downtown', city: 'Austin', state: 'TX' } }));

  const hasCheckIn = await prisma.gymCheckIn.findFirst({ where: { userId: member.id, gymId: gym.id } });
  if (!hasCheckIn) {
    await prisma.gymCheckIn.create({
      data: { userId: member.id, gymId: gym.id, source: 'qr', pointsEarned: 10, checkedInAt: new Date() },
    });
  }

  // A pre-built streak (rather than replaying incrementStreak's date
  // logic here) so the dashboard's Overview page has something to show
  // immediately after seeding — lastActivityDate is today so it reads
  // as a live, current streak rather than one that already lapsed. Sets
  // the same fields on `update` as `create` (not `update: {}`) so
  // re-running this script against a database where this demo member
  // already has other streak activity resets it back to these known
  // demo values instead of silently leaving whatever was there.
  const todayKey = new Date().toISOString().slice(0, 10);
  const streakFields = {
    currentCount: 3,
    bestCount: 5,
    lastActivityDate: new Date(`${todayKey}T00:00:00.000Z`),
  };
  await prisma.streak.upsert({
    where: { userId_streakType: { userId: member.id, streakType: 'workout' } },
    update: streakFields,
    create: { userId: member.id, streakType: 'workout', ...streakFields },
  });

  console.log('Seeded:', { admin: admin.email, coach: coach.email, member: member.email });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
