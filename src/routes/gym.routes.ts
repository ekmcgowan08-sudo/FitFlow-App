// Gym and gym-check-in routes. Gyms are a shared catalog (any
// authenticated user may browse it; only ADMIN may add to it).
// Check-ins are scoped to self, ADMIN, or a COACH with an active
// CoachAssignment to that member (see src/rbac/member-scope.ts).
// `authenticate` runs once, centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import { requireRole } from '../rbac/rbac.middleware';
import { MemberRepository } from '../repositories/member.repository';
import {
  createGymSchema,
  listGymsQuerySchema,
  gymIdParamsSchema,
  updateGymSchema,
  createGymCheckInSchema,
  listGymCheckInsQuerySchema,
  type CreateGymInput,
  type UpdateGymInput,
  type CreateGymCheckInInput,
} from '../validation/gym.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();
const memberRepository = new MemberRepository(prisma);

// KNOWN LIMITATION, not a design decision: `source` (qr/geofence/manual)
// is a caller-supplied enum with no actual verification behind it — the
// Gym model carries no location data to check a geofence against, and
// there's no QR-token issuance/scan flow anywhere in this codebase. Any
// caller can claim `source: "qr"` on every check-in and always collect
// the "verified" bonus below; despite the name, nothing here currently
// distinguishes an honest QR scan from a lie, unlike this codebase's
// usual "don't trust unverified client input" stance elsewhere (e.g. JWT
// roles are always re-checked against the database rather than trusted
// from the token). Left unresolved rather than papered over with fake
// verification, since a real fix needs product-level decisions this
// route can't make on its own (gym geolocation + GPS accuracy
// threshold, or a rotating per-gym QR token and a scan endpoint).
// Low present-day impact only because `pointsEarned` has no downstream
// consumer yet (no leaderboard, no reward redemption, no badge
// threshold reads it) — that stops being true the moment one is added,
// at which point this becomes exploitable for real, not just cosmetic.
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

router.patch(
  '/gyms/:id',
  requireRole('ADMIN'),
  validate({ params: gymIdParamsSchema, body: updateGymSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateGymInput;

      const existing = await prisma.gym.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Gym not found.');

      const gym = await prisma.gym.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
        },
      });
      res.json({ gym });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/gyms/:id',
  requireRole('ADMIN'),
  validate({ params: gymIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };

      const existing = await prisma.gym.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Gym not found.');

      // Fails with a 409 (translatePrismaError maps Prisma's P2003) if
      // the gym still has check-ins — GymCheckIn.gym is `onDelete:
      // Restrict`, so removing a gym in active use is a deliberate
      // "retire it, don't delete history" surface, not a silent data
      // loss.
      await prisma.gym.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.get(
  '/gym-checkins',
  validate({ query: listGymCheckInsQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, page, pageSize } = req.validated!.query as { userId?: string; page: number; pageSize: number };

      const targetUserId = userId ?? authedReq.user.id;
      if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
        throw new ForbiddenError('You may only list your own gym check-ins.');
      }

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

    if (!(await canAccessMemberRecord(prisma, authedReq.user, input.userId))) {
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
