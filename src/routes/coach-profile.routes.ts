// Coach-profile routes: a coach's public-facing directory entry
// (displayName, acceptsNewClients) and specialties. Any authenticated
// user may browse the directory; only the coach themselves or ADMIN may
// edit it. `authenticate` runs once, centrally, in app.ts's protected
// sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  coachUserIdParamsSchema,
  specialtyParamsSchema,
  upsertCoachProfileSchema,
  listCoachProfilesQuerySchema,
  addSpecialtySchema,
  type UpsertCoachProfileInput,
  type AddSpecialtyInput,
} from '../validation/coach-profile.schema';
import { prisma } from '../lib/prisma-client';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

// ADMIN may edit any coach's directory entry. Otherwise, the caller must
// both be editing their own profile AND actually hold the COACH role —
// self-or-ADMIN alone would let any plain USER create a CoachProfile for
// themselves (userId is their own, self-check passes) and show up in the
// public GET /coach-profiles directory despite never having been granted
// COACH by anyone. Assigning that role is out of this route's authority
// (see auth.routes.ts: registration always hands out USER, never
// self-selected; only ADMIN-driven role changes could add COACH).
function canWrite(req: AuthenticatedRequest, targetUserId: string): boolean {
  if (hasRole(req.user, 'ADMIN')) return true;
  return req.user.id === targetUserId && hasRole(req.user, 'COACH');
}

router.get(
  '/coach-profiles',
  validate({ query: listCoachProfilesQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const { acceptingClients, page, pageSize } = req.validated!.query as {
        acceptingClients?: boolean;
        page: number;
        pageSize: number;
      };

      const where = acceptingClients !== undefined ? { acceptsNewClients: acceptingClients } : {};
      const [profiles, total] = await Promise.all([
        prisma.coachProfile.findMany({
          where,
          include: { specialties: true },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.coachProfile.count({ where }),
      ]);

      res.json({ profiles, page, pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/coach-profiles/:userId',
  validate({ params: coachUserIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const { userId } = req.validated!.params as { userId: string };

      const profile = await prisma.coachProfile.findUnique({
        where: { userId },
        include: { specialties: true },
      });
      if (!profile) throw new NotFoundError('Coach profile not found.');

      res.json({ profile });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/coach-profiles/:userId',
  validate({ params: coachUserIdParamsSchema, body: upsertCoachProfileSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!canWrite(authedReq, userId)) throw new ForbiddenError('You may not edit this coach profile.');
      const input = req.validated!.body as UpsertCoachProfileInput;

      const profile = await prisma.coachProfile.upsert({
        where: { userId },
        create: { userId, displayName: input.displayName, acceptsNewClients: input.acceptsNewClients },
        update: {
          displayName: input.displayName,
          ...(input.acceptsNewClients !== undefined ? { acceptsNewClients: input.acceptsNewClients } : {}),
        },
      });

      res.json({ profile });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.post(
  '/coach-profiles/:userId/specialties',
  validate({ params: coachUserIdParamsSchema, body: addSpecialtySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!canWrite(authedReq, userId)) throw new ForbiddenError('You may not edit this coach profile.');
      const input = req.validated!.body as AddSpecialtyInput;

      const profile = await prisma.coachProfile.findUnique({ where: { userId } });
      if (!profile) throw new NotFoundError('Create a coach profile before adding specialties.');

      const specialty = await prisma.coachSpecialty.create({
        data: { coachUserId: userId, specialty: input.specialty },
      });

      res.status(201).json({ specialty });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/coach-profiles/:userId/specialties/:specialtyId',
  validate({ params: specialtyParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, specialtyId } = req.validated!.params as { userId: string; specialtyId: string };
      if (!canWrite(authedReq, userId)) throw new ForbiddenError('You may not edit this coach profile.');

      const existing = await prisma.coachSpecialty.findUnique({ where: { id: specialtyId } });
      if (!existing || existing.coachUserId !== userId) throw new NotFoundError('Specialty not found.');

      await prisma.coachSpecialty.delete({ where: { id: specialtyId } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
