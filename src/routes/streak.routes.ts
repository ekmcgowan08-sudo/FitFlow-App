// Streak routes: read-only. Streaks are written internally as a
// side-effect of other actions (e.g. logging a workout — see
// workout-log.routes.ts, which calls MemberRepository.incrementStreak),
// never directly by a client, so there is no POST/PATCH here. Reads are
// self, ADMIN, or a COACH with an active CoachAssignment to that member
// (see src/rbac/member-scope.ts).

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import { listStreaksQuerySchema } from '../validation/streak.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError } from '../lib/errors';

const router = Router();

router.get('/streaks', validate({ query: listStreaksQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { userId } = req.validated!.query as { userId?: string };

    const targetUserId = userId ?? authedReq.user.id;
    if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
      throw new ForbiddenError('You may only view your own streaks.');
    }

    const streaks = await prisma.streak.findMany({ where: { userId: targetUserId } });
    res.json({ streaks });
  } catch (err) {
    next(err);
  }
});

export default router;
