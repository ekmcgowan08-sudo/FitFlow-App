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
    update: {},
    create: { coachUserId: coach.id, clientUserId: member.id },
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
