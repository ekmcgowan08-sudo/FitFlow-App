// Member-profile routes: validate() middleware + Zod schema suite +
// repository pattern, wired together against the canonical schema.
//
// Fixes applied vs. the original example wiring (see
// docs/artifacts/README.md "Known conflicts" #3 and
// docs/architecture/canonical-schema-decisions.md):
//   - Listing/reading another member's profile now requires an elevated
//     role (ADMIN/COACH) or being that member yourself — the original
//     example had no such scoping at all.
//   - There is no more standalone "create a member with no password"
//     endpoint; accounts are created through POST /v1/auth/register and
//     this file only edits the profile of an existing account.

// `authenticate` is applied once, centrally, in app.ts's protected
// sub-router — see the note in src/routes/user.routes.ts for why it must
// not also be run per-router here.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { requireRole, requireSelfOrRole } from '../rbac/rbac.middleware';
import { validate } from '../middleware/validate';
import {
  updateMemberProfileSchema,
  memberIdParamsSchema,
  listMembersQuerySchema,
  type UpdateMemberProfileInput,
} from '../validation/member-profile.schema';
import { MemberRepository } from '../repositories/member.repository';
import { prisma } from '../lib/prisma-client';
import { NotFoundError } from '../lib/errors';

const router = Router();
const memberRepository = new MemberRepository(prisma);

// GET /v1/members — admin/coach only: a plain member has no legitimate
// reason to enumerate every other member's profile.
router.get(
  '/members',
  requireRole('ADMIN', 'COACH'),
  validate({ query: listMembersQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const { page, pageSize } = req.validated!.query as { page: number; pageSize: number };
      const members = await memberRepository.findMany({
        take: pageSize,
        skip: (page - 1) * pageSize,
        omit: { passwordHash: true },
      });
      res.json({ members, page, pageSize });
    } catch (err) {
      next(err);
    }
  },
);

// GET /v1/members/:id — self, or ADMIN/COACH.
router.get(
  '/members/:id',
  requireSelfOrRole('id', 'ADMIN', 'COACH'),
  validate({ params: memberIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };
      const member = await memberRepository.findWithProfileAndGoals(id);
      if (!member) throw new NotFoundError('Member not found.');
      res.json({ member });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /v1/members/:id — self, or ADMIN.
router.patch(
  '/members/:id',
  requireSelfOrRole('id', 'ADMIN'),
  validate({ params: memberIdParamsSchema, body: updateMemberProfileSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateMemberProfileInput;

      const [firstName, ...rest] = input.fullName ? input.fullName.split(' ') : [];

      const profile = await prisma.userProfile.upsert({
        where: { userId: id },
        create: {
          userId: id,
          firstName,
          lastName: rest.join(' ') || undefined,
          heightCm: input.heightCm,
          currentWeightKg: input.weightKg,
          timezone: input.timezone,
        },
        update: {
          ...(input.fullName ? { firstName, lastName: rest.join(' ') || undefined } : {}),
          ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
          ...(input.weightKg !== undefined ? { currentWeightKg: input.weightKg } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
      });

      res.json({ profile });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
