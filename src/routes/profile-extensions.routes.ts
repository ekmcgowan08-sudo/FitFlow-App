// Extended member-profile routes: app preferences, health targets, and
// allergies — split out of member.routes.ts because they change on a
// different cadence and (for health-profile) carry more sensitive data
// than the base profile. Reads are self, ADMIN, or a COACH with an
// active CoachAssignment to that member (see src/rbac/member-scope.ts —
// a coach planning meals/workouts needs this, but only for their actual
// clients); writes are self, or ADMIN only — a coach may see a client's
// targets but not silently change them. `authenticate` runs once,
// centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  memberIdParamsSchema,
  updatePreferencesSchema,
  updateHealthProfileSchema,
  createAllergySchema,
  allergyIdParamsSchema,
  createMedicalNoteSchema,
  medicalNoteIdParamsSchema,
  type UpdatePreferencesInput,
  type UpdateHealthProfileInput,
  type CreateAllergyInput,
  type CreateMedicalNoteInput,
} from '../validation/profile-extensions.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

function canWrite(req: AuthenticatedRequest, targetUserId: string): boolean {
  return req.user.id === targetUserId || hasRole(req.user, 'ADMIN');
}

/**
 * Medical notes get their own, stricter check: self or ADMIN for BOTH
 * read and write — no COACH access at all, unlike preferences/health
 * profile/allergies above. Free-text clinical notes are materially more
 * sensitive than a structured allergy list.
 */
function canAccessMedicalNotes(req: AuthenticatedRequest, targetUserId: string): boolean {
  return req.user.id === targetUserId || hasRole(req.user, 'ADMIN');
}

// --- Preferences -----------------------------------------------------

router.get(
  '/members/:userId/preferences',
  validate({ params: memberIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!(await canAccessMemberRecord(prisma, authedReq.user, userId))) {
        throw new ForbiddenError('You may not view this member’s preferences.');
      }

      const preferences = await prisma.userPreference.findUnique({ where: { userId } });
      res.json({ preferences });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/members/:userId/preferences',
  validate({ params: memberIdParamsSchema, body: updatePreferencesSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!canWrite(authedReq, userId)) throw new ForbiddenError('You may not update this member’s preferences.');
      const input = req.validated!.body as UpdatePreferencesInput;

      const preferences = await prisma.userPreference.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });

      res.json({ preferences });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

// --- Health profile ----------------------------------------------------

router.get(
  '/members/:userId/health-profile',
  validate({ params: memberIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!(await canAccessMemberRecord(prisma, authedReq.user, userId))) {
        throw new ForbiddenError('You may not view this member’s health profile.');
      }

      const healthProfile = await prisma.userHealthProfile.findUnique({ where: { userId } });
      res.json({ healthProfile });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/members/:userId/health-profile',
  validate({ params: memberIdParamsSchema, body: updateHealthProfileSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!canWrite(authedReq, userId)) {
        throw new ForbiddenError('You may not update this member’s health profile.');
      }
      const input = req.validated!.body as UpdateHealthProfileInput;

      const healthProfile = await prisma.userHealthProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });

      res.json({ healthProfile });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

// --- Allergies -----------------------------------------------------

router.get(
  '/members/:userId/allergies',
  validate({ params: memberIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!(await canAccessMemberRecord(prisma, authedReq.user, userId))) {
        throw new ForbiddenError('You may not view this member’s allergies.');
      }

      const allergies = await prisma.userAllergy.findMany({ where: { userId } });
      res.json({ allergies });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/members/:userId/allergies',
  validate({ params: memberIdParamsSchema, body: createAllergySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!canWrite(authedReq, userId)) throw new ForbiddenError('You may not add allergies for this member.');
      const input = req.validated!.body as CreateAllergyInput;

      const allergy = await prisma.userAllergy.create({ data: { userId, allergyName: input.allergyName } });
      res.status(201).json({ allergy });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/members/:userId/allergies/:allergyId',
  validate({ params: allergyIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, allergyId } = req.validated!.params as { userId: string; allergyId: string };
      if (!canWrite(authedReq, userId)) throw new ForbiddenError('You may not remove allergies for this member.');

      const existing = await prisma.userAllergy.findUnique({ where: { id: allergyId } });
      if (!existing || existing.userId !== userId) throw new NotFoundError('Allergy not found.');

      await prisma.userAllergy.delete({ where: { id: allergyId } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

// --- Medical notes (self/ADMIN only — no COACH access) -----------------

router.get(
  '/members/:userId/medical-notes',
  validate({ params: memberIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!canAccessMedicalNotes(authedReq, userId)) {
        throw new ForbiddenError('You may not view this member’s medical notes.');
      }

      const medicalNotes = await prisma.userMedicalNote.findMany({ where: { userId } });
      res.json({ medicalNotes });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/members/:userId/medical-notes',
  validate({ params: memberIdParamsSchema, body: createMedicalNoteSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId } = req.validated!.params as { userId: string };
      if (!canAccessMedicalNotes(authedReq, userId)) {
        throw new ForbiddenError('You may not add medical notes for this member.');
      }
      const input = req.validated!.body as CreateMedicalNoteInput;

      const medicalNote = await prisma.userMedicalNote.create({ data: { userId, noteText: input.noteText } });
      res.status(201).json({ medicalNote });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/members/:userId/medical-notes/:noteId',
  validate({ params: medicalNoteIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, noteId } = req.validated!.params as { userId: string; noteId: string };
      if (!canAccessMedicalNotes(authedReq, userId)) {
        throw new ForbiddenError('You may not remove medical notes for this member.');
      }

      const existing = await prisma.userMedicalNote.findUnique({ where: { id: noteId } });
      if (!existing || existing.userId !== userId) throw new NotFoundError('Medical note not found.');

      await prisma.userMedicalNote.delete({ where: { id: noteId } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
