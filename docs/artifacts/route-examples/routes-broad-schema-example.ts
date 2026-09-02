import { Request, Response, NextFunction, Router } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, CoachType, GoalCategory, GoalStatus, MealType, WorkoutLocation, DietStyle, SmartwatchPlatform, AchievementStatus, CheckinSource } from '@prisma/client';

const prisma = new PrismaClient();

declare global {
  namespace Express {
    interface Request {
      auth?: { memberId: string; role: 'member' | 'coach' | 'admin' };
    }
  }
}

const router = Router();

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as { memberId: string; role?: 'member' | 'coach' | 'admin' };
    req.auth = { memberId: payload.memberId, role: payload.role || 'member' };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: Array<'member' | 'coach' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

router.get('/health', (_req, res) => res.json({ ok: true, service: 'fitflow-api' }));

router.get('/me', authMiddleware, async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { id: req.auth!.memberId },
    include: {
      preferences: true,
      healthProfile: true,
      goals: true,
      streaks: true,
      badges: true,
      achievements: true,
      wearableDailySummaries: { orderBy: { summaryDate: 'desc' }, take: 7 },
    },
  });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({ data: member });
});

router.get('/members/:memberId/dashboard', authMiddleware, async (req, res) => {
  const { memberId } = req.params;
  const [member, todayLogs, workoutPlan, wearable] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, include: { preferences: true, healthProfile: true, goals: true } }),
    prisma.nutritionLog.findMany({ where: { memberId }, orderBy: { loggedAt: 'desc' }, take: 5 }),
    prisma.workoutPlan.findFirst({ where: { memberId }, include: { sessions: { include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: 'asc' } } } } } }),
    prisma.wearableDailySummary.findFirst({ where: { memberId }, orderBy: { summaryDate: 'desc' } }),
  ]);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({ data: { member, todayLogs, workoutPlan, wearable } });
});

router.get('/members/:memberId/nutrition/logs', authMiddleware, async (req, res) => {
  const { memberId } = req.params;
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  const where = date ? { memberId, loggedAt: { gte: new Date(`${date}T00:00:00.000Z`), lt: new Date(`${date}T23:59:59.999Z`) } } : { memberId };
  const data = await prisma.nutritionLog.findMany({ where, orderBy: { loggedAt: 'desc' } });
  res.json({ data });
});

router.post('/members/:memberId/nutrition/logs', authMiddleware, async (req, res) => {
  const { memberId } = req.params;
  const created = await prisma.nutritionLog.create({ data: { memberId, ...req.body, loggedAt: req.body.loggedAt ? new Date(req.body.loggedAt) : new Date() } });
  res.status(201).json({ data: created });
});

router.get('/members/:memberId/workout-plans', authMiddleware, async (req, res) => {
  const { memberId } = req.params;
  const data = await prisma.workoutPlan.findMany({
    where: { memberId },
    include: { sessions: { include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: 'asc' } } } } },
  });
  res.json({ data });
});

router.post('/members/:memberId/workout-plans', authMiddleware, requireRole('coach', 'admin'), async (req, res) => {
  const { memberId } = req.params;
  const created = await prisma.workoutPlan.create({ data: { memberId, title: req.body.title, coachSource: req.body.coachSource || 'ai' } });
  res.status(201).json({ data: created });
});

router.get('/members/:memberId/meal-plans', authMiddleware, async (req, res) => {
  const { memberId } = req.params;
  const data = await prisma.mealPlan.findMany({ include: { meals: true }, where: { memberId } });
  res.json({ data });
});

router.get('/members/:memberId/grocery-plans', authMiddleware, async (req, res) => {
  const { memberId } = req.params;
  const data = await prisma.groceryPlan.findMany({ where: { memberId }, include: { items: true } });
  res.json({ data });
});

router.get('/exercises', authMiddleware, async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const equipment = typeof req.query.equipment === 'string' ? req.query.equipment : undefined;
  const muscleGroup = typeof req.query.muscleGroup === 'string' ? req.query.muscleGroup : undefined;
  const data = await prisma.exercise.findMany({
    where: {
      AND: [
        query ? { name: { contains: query, mode: 'insensitive' } } : {},
        equipment ? { equipment: { contains: equipment, mode: 'insensitive' } } : {},
        muscleGroup ? { OR: [{ primaryMuscles: { some: { muscleName: { contains: muscleGroup, mode: 'insensitive' } } } }, { secondaryMuscles: { some: { muscleName: { contains: muscleGroup, mode: 'insensitive' } } } }] } : {},
      ],
    },
    include: { primaryMuscles: true, secondaryMuscles: true, instructions: { orderBy: { stepNumber: 'asc' } } },
  });
  res.json({ data });
});

router.post('/gyms/check-ins', authMiddleware, async (req, res) => {
  const created = await prisma.gymCheckIn.create({
    data: {
      id: req.body.id || undefined,
      memberId: req.body.memberId,
      gymId: req.body.gymId,
      checkedInAt: req.body.checkedInAt ? new Date(req.body.checkedInAt) : new Date(),
      source: req.body.source || CheckinSource.qr,
      pointsEarned: req.body.pointsEarned ?? 25,
    },
  });
  res.status(201).json({ data: created });
});

router.get('/members/:memberId/achievements', authMiddleware, async (req, res) => {
  const { memberId } = req.params;
  const [streak, badges, achievements] = await Promise.all([
    prisma.memberStreak.findMany({ where: { memberId } }),
    prisma.badge.findMany({ where: { memberId } }),
    prisma.achievement.findMany({ where: { memberId } }),
  ]);
  res.json({ data: { streak, badges, achievements } });
});

router.post('/members/:memberId/coach-assignments', authMiddleware, requireRole('admin'), async (req, res) => {
  const { memberId } = req.params;
  const created = await prisma.coachAssignment.create({
    data: {
      id: req.body.id,
      memberId,
      coachId: req.body.coachId,
      startsOn: new Date(req.body.startsOn),
      notes: req.body.notes,
    },
  });
  res.status(201).json({ data: created });
});

export default router;
