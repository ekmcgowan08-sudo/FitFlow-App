// Coach-assignment routes: a coach's client roster, a client's coach(es),
// and creating/updating the CoachAssignment relationship itself.
// `authenticate` runs once, centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createCoachAssignmentSchema,
  updateCoachAssignmentSchema,
  coachAssignmentParamsSchema,
  listClientsQuerySchema,
  listCoachesQuerySchema,
  type CreateCoachAssignmentInput,
  type UpdateCoachAssignmentInput,
} from '../validation/coach-assignment.schema';
import { prisma } from '../lib/prisma-client';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';
import { requireRole } from '../rbac/rbac.middleware';

const router = Router();

function isAdmin(req: AuthenticatedRequest): boolean {
  return hasRole(req.user, 'ADMIN');
}

// GET /v1/coach/clients — a coach's own client roster, or (ADMIN only)
// any coach's roster via ?coachUserId=.
router.get(
  '/coach/clients',
  requireRole('COACH', 'ADMIN'),
  validate({ query: listClientsQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { coachUserId } = req.validated!.query as { coachUserId?: string };

      if (coachUserId && coachUserId !== authedReq.user.id && !isAdmin(authedReq)) {
        throw new ForbiddenError("You may only view your own client roster.");
      }
      const targetCoachId = isAdmin(authedReq) && coachUserId ? coachUserId : authedReq.user.id;

      const assignments = await prisma.coachAssignment.findMany({
        where: { coachUserId: targetCoachId },
        include: { client: { omit: { passwordHash: true } } },
      });

      res.json({ assignments });
    } catch (err) {
      next(err);
    }
  },
);

// GET /v1/coach/coaches — the caller's own coach(es), or (ADMIN only) any
// client's coaches via ?clientUserId=.
router.get('/coach/coaches', validate({ query: listCoachesQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { clientUserId } = req.validated!.query as { clientUserId?: string };

    if (clientUserId && clientUserId !== authedReq.user.id && !isAdmin(authedReq)) {
      throw new ForbiddenError('You may only view your own coach relationships.');
    }
    const targetClientId = isAdmin(authedReq) && clientUserId ? clientUserId : authedReq.user.id;

    const assignments = await prisma.coachAssignment.findMany({
      where: { clientUserId: targetClientId },
      include: { coach: { omit: { passwordHash: true } } },
    });

    res.json({ assignments });
  } catch (err) {
    next(err);
  }
});

// POST /v1/coach/assignments — create a coach<->client relationship. A
// COACH may only create an assignment where they are the coach; ADMIN
// may create any assignment (e.g. on a client's behalf).
//
// A COACH-created assignment starts `pending`, never `active`: since
// canAccessMemberRecord (src/rbac/member-scope.ts) grants a coach access
// to a member purely by checking this column, letting a coach create an
// already-`active` row would let any coach unilaterally grant themselves
// full access to any member's private data with a single API call — no
// client consent, no admin approval, nothing to notice or revoke before
// the damage is done. Only an ADMIN-created assignment starts `active`
// (admin is already a fully trusted actor with unrestricted access, so
// this doesn't introduce a new escalation path).
router.post(
  '/coach/assignments',
  requireRole('COACH', 'ADMIN'),
  validate({ body: createCoachAssignmentSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const input = req.validated!.body as CreateCoachAssignmentInput;

      if (input.coachUserId !== authedReq.user.id && !isAdmin(authedReq)) {
        throw new ForbiddenError('You may only create assignments where you are the coach.');
      }

      const assignment = await prisma.coachAssignment.create({
        data: {
          coachUserId: input.coachUserId,
          clientUserId: input.clientUserId,
          relationshipStatus: isAdmin(authedReq) ? 'active' : 'pending',
          startsOn: input.startsOn ? new Date(input.startsOn) : undefined,
          notes: input.notes,
        },
      });

      res.status(201).json({ assignment });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

// PATCH /v1/coach/assignments/:coachUserId/:clientUserId — update the
// relationship (e.g. accept, pause, or end it). Either party to the
// relationship, or an ADMIN, may update it — EXCEPT activating a
// `pending` assignment (accepting a coaching request), which only the
// client or an ADMIN may do. If the coach could self-activate, `pending`
// would be no safer than the `active`-by-default it replaced.
router.patch(
  '/coach/assignments/:coachUserId/:clientUserId',
  validate({ params: coachAssignmentParamsSchema, body: updateCoachAssignmentSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { coachUserId, clientUserId } = req.validated!.params as { coachUserId: string; clientUserId: string };
      const input = req.validated!.body as UpdateCoachAssignmentInput;

      const isParty = authedReq.user.id === coachUserId || authedReq.user.id === clientUserId;
      if (!isParty && !isAdmin(authedReq)) {
        throw new ForbiddenError('You are not a party to this coach assignment.');
      }

      const existing = await prisma.coachAssignment.findUnique({
        where: { coachUserId_clientUserId: { coachUserId, clientUserId } },
      });
      if (!existing) throw new NotFoundError('Coach assignment not found.');

      if (
        input.relationshipStatus === 'active' &&
        existing.relationshipStatus !== 'active' &&
        authedReq.user.id !== clientUserId &&
        !isAdmin(authedReq)
      ) {
        throw new ForbiddenError('Only the client (or an ADMIN) may accept and activate a coaching request.');
      }

      const assignment = await prisma.coachAssignment.update({
        where: { coachUserId_clientUserId: { coachUserId, clientUserId } },
        data: {
          ...(input.relationshipStatus !== undefined ? { relationshipStatus: input.relationshipStatus } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });

      res.json({ assignment });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
