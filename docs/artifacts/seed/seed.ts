import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const memberOneId = 'mem_001';
const memberTwoId = 'mem_002';
const coachHumanId = 'coach_001';
const coachAiId = 'coach_ai_001';
const mealPlanId = 'mealplan_001';
const groceryPlanId = 'groc_001';
const workoutPlanId = 'wkp_001';
const gymId = 'gym_001';

async function main() {
  await prisma.member.upsert({
    where: { id: memberOneId },
    update: {
      email: 'alex.carter@example.com',
      firstName: 'Alex',
      lastName: 'Carter',
      birthDate: new Date('1992-05-14'),
      sexAtBirth: 'male',
      heightCm: new Prisma.Decimal('178.00'),
      weightKg: new Prisma.Decimal('82.40'),
    },
    create: {
      id: memberOneId,
      email: 'alex.carter@example.com',
      firstName: 'Alex',
      lastName: 'Carter',
      birthDate: new Date('1992-05-14'),
      sexAtBirth: 'male',
      heightCm: new Prisma.Decimal('178.00'),
      weightKg: new Prisma.Decimal('82.40'),
    },
  });

  await prisma.member.upsert({
    where: { id: memberTwoId },
    update: {
      email: 'jordan.lee@example.com',
      firstName: 'Jordan',
      lastName: 'Lee',
      birthDate: new Date('1988-10-02'),
      sexAtBirth: 'female',
      heightCm: new Prisma.Decimal('165.00'),
      weightKg: new Prisma.Decimal('64.20'),
    },
    create: {
      id: memberTwoId,
      email: 'jordan.lee@example.com',
      firstName: 'Jordan',
      lastName: 'Lee',
      birthDate: new Date('1988-10-02'),
      sexAtBirth: 'female',
      heightCm: new Prisma.Decimal('165.00'),
      weightKg: new Prisma.Decimal('64.20'),
    },
  });

  await prisma.memberPreference.upsert({
    where: { memberId: memberOneId },
    update: {
      goalStyle: 'fat_loss',
      workoutLocation: 'hybrid',
      dietStyle: 'high_protein',
      themeColor: '#0F766E',
      coachPreference: 'hybrid',
      smartwatchPlatform: 'apple_health',
    },
    create: {
      memberId: memberOneId,
      goalStyle: 'fat_loss',
      workoutLocation: 'hybrid',
      dietStyle: 'high_protein',
      themeColor: '#0F766E',
      coachPreference: 'hybrid',
      smartwatchPlatform: 'apple_health',
    },
  });

  await prisma.memberPreference.upsert({
    where: { memberId: memberTwoId },
    update: {
      goalStyle: 'muscle_gain',
      workoutLocation: 'gym',
      dietStyle: 'balanced',
      themeColor: '#7C3AED',
      coachPreference: 'human',
      smartwatchPlatform: 'garmin',
    },
    create: {
      memberId: memberTwoId,
      goalStyle: 'muscle_gain',
      workoutLocation: 'gym',
      dietStyle: 'balanced',
      themeColor: '#7C3AED',
      coachPreference: 'human',
      smartwatchPlatform: 'garmin',
    },
  });

  await prisma.memberHealthProfile.upsert({
    where: { memberId: memberOneId },
    update: {
      calorieTarget: 2100,
      proteinTargetGrams: 190,
      carbTargetGrams: 180,
      fatTargetGrams: 70,
      waterTargetOz: 100,
    },
    create: {
      memberId: memberOneId,
      calorieTarget: 2100,
      proteinTargetGrams: 190,
      carbTargetGrams: 180,
      fatTargetGrams: 70,
      waterTargetOz: 100,
    },
  });

  await prisma.memberHealthProfile.upsert({
    where: { memberId: memberTwoId },
    update: {
      calorieTarget: 2400,
      proteinTargetGrams: 150,
      carbTargetGrams: 260,
      fatTargetGrams: 80,
      waterTargetOz: 90,
    },
    create: {
      memberId: memberTwoId,
      calorieTarget: 2400,
      proteinTargetGrams: 150,
      carbTargetGrams: 260,
      fatTargetGrams: 80,
      waterTargetOz: 90,
    },
  });

  await prisma.memberAllergy.upsert({
    where: { memberId_allergyName: { memberId: memberOneId, allergyName: 'shellfish' } },
    update: {},
    create: { memberId: memberOneId, allergyName: 'shellfish' },
  });

  await prisma.memberAllergy.upsert({
    where: { memberId_allergyName: { memberId: memberTwoId, allergyName: 'peanuts' } },
    update: {},
    create: { memberId: memberTwoId, allergyName: 'peanuts' },
  });

  const alexNote = await prisma.memberMedicalNote.findFirst({
    where: { memberId: memberOneId, noteText: 'mild lactose sensitivity' },
    select: { id: true },
  });
  if (!alexNote) {
    await prisma.memberMedicalNote.create({ data: { memberId: memberOneId, noteText: 'mild lactose sensitivity' } });
  }

  const jordanNote = await prisma.memberMedicalNote.findFirst({
    where: { memberId: memberTwoId, noteText: 'prefers lower impact cardio' },
    select: { id: true },
  });
  if (!jordanNote) {
    await prisma.memberMedicalNote.create({ data: { memberId: memberTwoId, noteText: 'prefers lower impact cardio' } });
  }

  await prisma.goal.upsert({
    where: { id: 'goal_001' },
    update: {
      memberId: memberOneId,
      category: 'weight',
      title: 'Lose 8 pounds in 12 weeks',
      targetValue: new Prisma.Decimal('8.00'),
      targetUnit: 'pounds',
      dueDate: new Date('2026-10-20'),
      status: 'active',
    },
    create: {
      id: 'goal_001',
      memberId: memberOneId,
      category: 'weight',
      title: 'Lose 8 pounds in 12 weeks',
      targetValue: new Prisma.Decimal('8.00'),
      targetUnit: 'pounds',
      dueDate: new Date('2026-10-20'),
      status: 'active',
    },
  });

  await prisma.goal.upsert({
    where: { id: 'goal_002' },
    update: {
      memberId: memberTwoId,
      category: 'strength',
      title: 'Increase squat working weight by 20 pounds',
      targetValue: new Prisma.Decimal('20.00'),
      targetUnit: 'pounds',
      dueDate: new Date('2026-11-15'),
      status: 'active',
    },
    create: {
      id: 'goal_002',
      memberId: memberTwoId,
      category: 'strength',
      title: 'Increase squat working weight by 20 pounds',
      targetValue: new Prisma.Decimal('20.00'),
      targetUnit: 'pounds',
      dueDate: new Date('2026-11-15'),
      status: 'active',
    },
  });

  await prisma.coach.upsert({
    where: { id: coachHumanId },
    update: { coachType: 'human', displayName: 'Coach Maya' },
    create: { id: coachHumanId, coachType: 'human', displayName: 'Coach Maya' },
  });

  await prisma.coach.upsert({
    where: { id: coachAiId },
    update: { coachType: 'ai', displayName: 'FitFlow AI Coach' },
    create: { id: coachAiId, coachType: 'ai', displayName: 'FitFlow AI Coach' },
  });

  for (const specialty of ['strength', 'nutrition', 'habit building']) {
    await prisma.coachSpecialty.upsert({
      where: { coachId_specialty: { coachId: coachHumanId, specialty } },
      update: {},
      create: { coachId: coachHumanId, specialty },
    });
  }

  for (const specialty of ['meal planning', 'adaptive programming', 'recovery guidance']) {
    await prisma.coachSpecialty.upsert({
      where: { coachId_specialty: { coachId: coachAiId, specialty } },
      update: {},
      create: { coachId: coachAiId, specialty },
    });
  }

  await prisma.coachAssignment.upsert({
    where: { id: 'asn_001' },
    update: {
      memberId: memberOneId,
      coachId: coachAiId,
      startsOn: new Date('2026-07-28'),
      notes: 'Daily feedback and weekly plan refresh.',
    },
    create: {
      id: 'asn_001',
      memberId: memberOneId,
      coachId: coachAiId,
      startsOn: new Date('2026-07-28'),
      notes: 'Daily feedback and weekly plan refresh.',
    },
  });

  await prisma.coachAssignment.upsert({
    where: { id: 'asn_002' },
    update: {
      memberId: memberTwoId,
      coachId: coachHumanId,
      startsOn: new Date('2026-07-28'),
      notes: 'In-person programming with monthly progress review.',
    },
    create: {
      id: 'asn_002',
      memberId: memberTwoId,
      coachId: coachHumanId,
      startsOn: new Date('2026-07-28'),
      notes: 'In-person programming with monthly progress review.',
    },
  });

  const exercises = [
    {
      id: 'ex_001',
      name: 'Leg Press',
      category: 'strength' as const,
      equipment: 'Leg press machine',
      whyItWorks: 'Builds lower-body strength with guided stability.',
      howToVideoUrl: 'https://videos.fitflowsuite.example/exercises/leg-press.mp4',
      primaryMuscles: ['quadriceps', 'glutes'],
      secondaryMuscles: ['hamstrings'],
      instructions: [
        'Set feet shoulder-width on platform.',
        'Lower with control until knees reach a comfortable bend.',
        'Drive through mid-foot to return without locking knees.',
      ],
    },
    {
      id: 'ex_002',
      name: 'Dumbbell Bench Press',
      category: 'strength' as const,
      equipment: 'Adjustable bench and dumbbells',
      whyItWorks: 'Improves pressing strength and shoulder stability.',
      howToVideoUrl: 'https://videos.fitflowsuite.example/exercises/dumbbell-bench-press.mp4',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps', 'front delts'],
      instructions: [
        'Plant feet firmly on the floor.',
        'Lower dumbbells to chest level with elbows slightly tucked.',
        'Press up until arms are extended with control.',
      ],
    },
    {
      id: 'ex_003',
      name: 'Treadmill Incline Walk',
      category: 'cardio' as const,
      equipment: 'Treadmill',
      whyItWorks: 'Raises heart rate with low joint impact.',
      howToVideoUrl: 'https://videos.fitflowsuite.example/exercises/treadmill-incline-walk.mp4',
      primaryMuscles: ['calves', 'glutes'],
      secondaryMuscles: ['hamstrings'],
      instructions: [
        'Set incline and speed to a brisk but sustainable effort.',
        'Maintain upright posture and natural arm swing.',
        'Breathe rhythmically for the full interval.',
      ],
    },
  ];

  for (const exercise of exercises) {
    await prisma.exercise.upsert({
      where: { id: exercise.id },
      update: {
        name: exercise.name,
        category: exercise.category,
        equipment: exercise.equipment,
        whyItWorks: exercise.whyItWorks,
        howToVideoUrl: exercise.howToVideoUrl,
      },
      create: {
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        equipment: exercise.equipment,
        whyItWorks: exercise.whyItWorks,
        howToVideoUrl: exercise.howToVideoUrl,
      },
    });

    for (const muscle of exercise.primaryMuscles) {
      await prisma.exercisePrimaryMuscle.upsert({
        where: { exerciseId_muscleName: { exerciseId: exercise.id, muscleName: muscle } },
        update: {},
        create: { exerciseId: exercise.id, muscleName: muscle },
      });
    }

    for (const muscle of exercise.secondaryMuscles) {
      await prisma.exerciseSecondaryMuscle.upsert({
        where: { exerciseId_muscleName: { exerciseId: exercise.id, muscleName: muscle } },
        update: {},
        create: { exerciseId: exercise.id, muscleName: muscle },
      });
    }

    for (const [index, instruction] of exercise.instructions.entries()) {
      await prisma.exerciseInstruction.upsert({
        where: { exerciseId_stepNumber: { exerciseId: exercise.id, stepNumber: index + 1 } },
        update: { instructionText: instruction },
        create: { exerciseId: exercise.id, stepNumber: index + 1, instructionText: instruction },
      });
    }
  }

  await prisma.mealPlan.upsert({
    where: { id: mealPlanId },
    update: { memberId: memberOneId, title: 'High-protein fat-loss week', dailyCalories: 2100 },
    create: { id: mealPlanId, memberId: memberOneId, title: 'High-protein fat-loss week', dailyCalories: 2100 },
  });

  await prisma.mealPlanMeal.deleteMany({ where: { mealPlanId } });
  await prisma.mealPlanMeal.createMany({
    data: [
      { mealPlanId, dayOfWeek: 'Monday', mealType: 'breakfast', recipeName: 'Greek yogurt parfait', calories: 320, estimatedCostUsd: new Prisma.Decimal('2.75') },
      { mealPlanId, dayOfWeek: 'Monday', mealType: 'lunch', recipeName: 'Chicken quinoa bowl', calories: 540, estimatedCostUsd: new Prisma.Decimal('4.80') },
      { mealPlanId, dayOfWeek: 'Monday', mealType: 'dinner', recipeName: 'Salmon rice plate', calories: 610, estimatedCostUsd: new Prisma.Decimal('6.95') },
    ],
  });

  await prisma.groceryPlan.upsert({
    where: { id: groceryPlanId },
    update: { memberId: memberOneId, totalEstimatedCostUsd: new Prisma.Decimal('74.21') },
    create: { id: groceryPlanId, memberId: memberOneId, totalEstimatedCostUsd: new Prisma.Decimal('74.21') },
  });

  await prisma.groceryPlanItem.deleteMany({ where: { groceryPlanId } });
  await prisma.groceryPlanItem.createMany({
    data: [
      { groceryPlanId, storeName: 'Kroger', itemName: 'Chicken breast', quantity: '2 lb', unitPriceUsd: new Prisma.Decimal('7.99'), bestDeal: true },
      { groceryPlanId, storeName: 'Aldi', itemName: 'Greek yogurt', quantity: '32 oz', unitPriceUsd: new Prisma.Decimal('3.49'), bestDeal: true },
      { groceryPlanId, storeName: 'Walmart', itemName: 'Frozen berries', quantity: '16 oz', unitPriceUsd: new Prisma.Decimal('4.28'), bestDeal: false },
    ],
  });

  await prisma.workoutPlan.upsert({
    where: { id: workoutPlanId },
    update: { memberId: memberOneId, title: '4-day strength and conditioning', coachSource: 'ai' },
    create: { id: workoutPlanId, memberId: memberOneId, title: '4-day strength and conditioning', coachSource: 'ai' },
  });

  await prisma.workoutSessionExercise.deleteMany({ where: { workoutSession: { workoutPlanId } } });
  await prisma.workoutSession.deleteMany({ where: { workoutPlanId } });

  const upperPush = await prisma.workoutSession.create({
    data: {
      workoutPlanId,
      dayOfWeek: 'Tuesday',
      focus: 'Upper body push',
      estimatedMinutes: 52,
      restTimerSeconds: 75,
    },
  });

  const lowerBody = await prisma.workoutSession.create({
    data: {
      workoutPlanId,
      dayOfWeek: 'Thursday',
      focus: 'Lower body strength',
      estimatedMinutes: 58,
      restTimerSeconds: 90,
    },
  });

  const conditioning = await prisma.workoutSession.create({
    data: {
      workoutPlanId,
      dayOfWeek: 'Saturday',
      focus: 'Conditioning',
      estimatedMinutes: 30,
      restTimerSeconds: 30,
    },
  });

  await prisma.workoutSessionExercise.createMany({
    data: [
      { workoutSessionId: upperPush.id, exerciseId: 'ex_002', sets: 4, reps: '8-10', noteText: 'Use challenging but clean form.', sortOrder: 1 },
      { workoutSessionId: lowerBody.id, exerciseId: 'ex_001', sets: 4, reps: '10-12', noteText: 'Full depth within comfort range.', sortOrder: 1 },
      { workoutSessionId: conditioning.id, exerciseId: 'ex_003', sets: 1, reps: '20 min', workSeconds: 1200, noteText: 'Stay in moderate intensity zone.', sortOrder: 1 },
    ],
  });

  await prisma.nutritionLog.upsert({
    where: { id: 'nut_001' },
    update: {
      memberId: memberOneId,
      loggedAt: new Date('2026-07-28T08:15:00Z'),
      mealType: 'breakfast',
      itemName: 'Greek yogurt parfait',
      servingDescription: '1 bowl',
      calories: 320,
      proteinGrams: new Prisma.Decimal('24.00'),
      carbsGrams: new Prisma.Decimal('31.00'),
      fatGrams: new Prisma.Decimal('9.00'),
      waterOz: new Prisma.Decimal('12.00'),
    },
    create: {
      id: 'nut_001',
      memberId: memberOneId,
      loggedAt: new Date('2026-07-28T08:15:00Z'),
      mealType: 'breakfast',
      itemName: 'Greek yogurt parfait',
      servingDescription: '1 bowl',
      calories: 320,
      proteinGrams: new Prisma.Decimal('24.00'),
      carbsGrams: new Prisma.Decimal('31.00'),
      fatGrams: new Prisma.Decimal('9.00'),
      waterOz: new Prisma.Decimal('12.00'),
    },
  });

  await prisma.nutritionLog.upsert({
    where: { id: 'nut_002' },
    update: {
      memberId: memberOneId,
      loggedAt: new Date('2026-07-28T12:30:00Z'),
      mealType: 'lunch',
      itemName: 'Chicken quinoa bowl',
      servingDescription: '1 bowl',
      calories: 540,
      proteinGrams: new Prisma.Decimal('46.00'),
      carbsGrams: new Prisma.Decimal('42.00'),
      fatGrams: new Prisma.Decimal('16.00'),
      waterOz: new Prisma.Decimal('16.00'),
    },
    create: {
      id: 'nut_002',
      memberId: memberOneId,
      loggedAt: new Date('2026-07-28T12:30:00Z'),
      mealType: 'lunch',
      itemName: 'Chicken quinoa bowl',
      servingDescription: '1 bowl',
      calories: 540,
      proteinGrams: new Prisma.Decimal('46.00'),
      carbsGrams: new Prisma.Decimal('42.00'),
      fatGrams: new Prisma.Decimal('16.00'),
      waterOz: new Prisma.Decimal('16.00'),
    },
  });

  await prisma.gym.upsert({
    where: { id: gymId },
    update: { name: 'Fit House Sharonville', city: 'Sharonville', state: 'OH' },
    create: { id: gymId, name: 'Fit House Sharonville', city: 'Sharonville', state: 'OH' },
  });

  await prisma.gymCheckIn.upsert({
    where: { id: 'chk_001' },
    update: {
      memberId: memberOneId,
      gymId,
      checkedInAt: new Date('2026-07-28T22:05:00Z'),
      source: 'qr',
      pointsEarned: 25,
    },
    create: {
      id: 'chk_001',
      memberId: memberOneId,
      gymId,
      checkedInAt: new Date('2026-07-28T22:05:00Z'),
      source: 'qr',
      pointsEarned: 25,
    },
  });

  await prisma.memberStreak.upsert({
    where: { memberId_streakType: { memberId: memberOneId, streakType: 'workout_logging' } },
    update: { currentDays: 11, longestDays: 29 },
    create: { memberId: memberOneId, streakType: 'workout_logging', currentDays: 11, longestDays: 29 },
  });

  await prisma.badge.upsert({
    where: { id: 'badge_001' },
    update: { memberId: memberOneId, name: 'Seven-Day Streak', unlockedAt: new Date('2026-07-24T18:00:00Z') },
    create: { id: 'badge_001', memberId: memberOneId, name: 'Seven-Day Streak', unlockedAt: new Date('2026-07-24T18:00:00Z') },
  });

  await prisma.achievement.upsert({
    where: { id: 'ach_001' },
    update: { memberId: memberOneId, title: 'Logged meals for 14 straight days', progressPercent: new Prisma.Decimal('100.00'), status: 'unlocked' },
    create: { id: 'ach_001', memberId: memberOneId, title: 'Logged meals for 14 straight days', progressPercent: new Prisma.Decimal('100.00'), status: 'unlocked' },
  });

  await prisma.wearableDailySummary.upsert({
    where: { memberId_summaryDate: { memberId: memberOneId, summaryDate: new Date('2026-07-28') } },
    update: {
      steps: 10422,
      activeCalories: 612,
      exerciseMinutes: 48,
      restingHeartRate: 58,
      sleepHours: new Prisma.Decimal('7.60'),
    },
    create: {
      memberId: memberOneId,
      summaryDate: new Date('2026-07-28'),
      steps: 10422,
      activeCalories: 612,
      exerciseMinutes: 48,
      restingHeartRate: 58,
      sleepHours: new Prisma.Decimal('7.60'),
    },
  });

  console.log('FitFlow Suite seed complete');
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
