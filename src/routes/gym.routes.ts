// Gym and gym-check-in routes. Gyms are a shared catalog (any
// authenticated user may browse it; only ADMIN may add to it).
// Check-ins are scoped to self, or ADMIN/COACH for another member.
// `authenticate` runs once, centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import { requireRole } from '../rbac/rbac.middleware';
import { MemberRepository } from '../repositories/member.repository';
import {
  createGymSchema,
  listGymsQuerySchema,
  createGymCheckInSchema,
  listGymCheckInsQuerySchema,
  type CreateGymInput,
  type CreateGymCheckInInput,
} from '../validation/gym.schema';
import { prisma } from '../lib/prisma-client';
import { ForbiddenError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();
const memberRepository = new MemberRepository(prisma);

// Verified check-in sources (QR code scan or geofence) earn points;
// `manual` (self-reported, unverifiable) does not — a small anti-gaming
// rule consistent with this codebase's "don't trust unverified client
// input" stance elsewhere (e.g. JWT roles are always re-checked against
// the database rather than trusted from the token).
const POINTS_PER_VERIFIED_CHECKIN = 10;

router.get('/gyms', validate({ query: listGymsQuerySchema }), async (req, res: Response, next) => {
  try {
    const { page, pageSize } = req.validated!.query as { page: number; pageSize: number };
    const [gyms, total] = await Promise.all([
      prisma.gym.findMany({ orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.gym.count(),
    ]);
    res.json({ gyms, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

router.post('/gyms', requireRole('ADMIN'), validate({ body: createGymSchema }), async (req, res: Response, next) => {
  try {
    const input = req.validated!.body as CreateGymInput;
    const gym = await prisma.gym.create({ data: input });
    res.status(201).json({ gym });
  } catch (err) {
    next(translatePrismaError(err));
  }
});

router.get(
  '/gym-checkins',
  validate({ query: listGymCheckInsQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, page, pageSize } = req.validated!.query as { userId?: string; page: number; pageSize: number };

      const isElevated = hasRole(authedReq.user, 'ADMIN', 'COACH');
      if (userId && userId !== authedReq.user.id && !isElevated) {
        throw new ForbiddenError('You may only list your own gym check-ins.');
      }
      const targetUserId = isElevated && userId ? userId : authedReq.user.id;

      const where = { userId: targetUserId };
      const [checkIns, total] = await Promise.all([
        prisma.gymCheckIn.findMany({
          where,
          orderBy: { checkedInAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { gym: true },
        }),
        prisma.gymCheckIn.count({ where }),
      ]);

      res.json({ checkIns, page, pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/gym-checkins', validate({ body: createGymCheckInSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const input = req.validated!.body as CreateGymCheckInInput;

    const isElevated = hasRole(authedReq.user, 'ADMIN', 'COACH');
    if (input.userId !== authedReq.user.id && !isElevated) {
      throw new ForbiddenError('You may only check yourself in.');
    }

    const pointsEarned = input.source === 'manual' ? 0 : POINTS_PER_VERIFIED_CHECKIN;

    const checkIn = await prisma.gymCheckIn.create({
      data: {
        userId: input.userId,
        gymId: input.gymId,
        source: input.source,
        checkedInAt: input.checkedInAt ? new Date(input.checkedInAt) : new Date(),
        pointsEarned,
      },
    });

    await memberRepository.incrementStreak(input.userId, 'gym_checkin');

    res.status(201).json({ checkIn });
  } catch (err) {
    next(translatePrismaError(err));
  }
});

export default router;
