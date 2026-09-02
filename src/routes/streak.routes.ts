// Streak routes: read-only. Streaks are written internally as a
// side-effect of other actions (e.g. logging a workout — see
// workout-log.routes.ts, which calls MemberRepository.incrementStreak),
// never directly by a client, so there is no POST/PATCH here.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import { listStreaksQuerySchema } from '../validation/streak.schema';
import { prisma } from '../lib/prisma-client';
import { ForbiddenError } from '../lib/errors';

const router = Router();

router.get('/streaks', validate({ query: listStreaksQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { userId } = req.validated!.query as { userId?: string };

    const isElevated = hasRole(authedReq.user, 'ADMIN', 'COACH');
    if (userId && userId !== authedReq.user.id && !isElevated) {
      throw new ForbiddenError('You may only view your own streaks.');
    }
    const targetUserId = isElevated && userId ? userId : authedReq.user.id;

    const streaks = await prisma.streak.findMany({ where: { userId: targetUserId } });
    res.json({ streaks });
  } catch (err) {
    next(err);
  }
});

export default router;
