// Live workout-session routes: start a session (optionally from a
// WorkoutPlanSession template), add exercises to it, log completed sets
// progressively as the member works out, and finish or cancel it.
// Distinct from POST /workout-logs (workout-log.routes.ts), which
// retroactively logs an already-finished ad-hoc workout in one shot —
// these routes model the "start now, log each set as you go" flow a
// live workout screen needs. Scoped to the owning member, ADMIN, or a
// COACH with an active CoachAssignment to that member (see
// src/rbac/member-scope.ts). `authenticate` runs once, centrally, in
// app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  startWorkoutSessionSchema,
  workoutSessionIdParamsSchema,
  addSessionExerciseSchema,
  sessionExerciseParamsSchema,
  logSetSchema,
  completeSessionSchema,
  type StartWorkoutSessionInput,
  type AddSessionExerciseInput,
  type LogSetInput,
  type CompleteSessionInput,
} from '../validation/workout-session.schema';
import { WorkoutLogRepository } from '../repositories/workout-log.repository';
import { MemberRepository } from '../repositories/member.repository';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();
const workoutLogRepository = new WorkoutLogRepository(prisma);
const memberRepository = new MemberRepository(prisma);

async function loadOwnedSession(sessionId: string, authedReq: AuthenticatedRequest) {
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    include: { sessionExercises: { include: { exercise: true, sets: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) throw new NotFoundError('Workout session not found.');
  if (!(await canAccessMemberRecord(prisma, authedReq.user, session.userId))) {
    // 404, not 403 — same "don't confirm existence" convention every
    // other member-scoped resource in this codebase follows.
    throw new NotFoundError('Workout session not found.');
  }
  return session;
}

router.post(
  '/workout-sessions/start',
  validate({ body: startWorkoutSessionSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const input = req.validated!.body as StartWorkoutSessionInput;

      if (!(await canAccessMemberRecord(prisma, authedReq.user, input.userId))) {
        throw new ForbiddenError('You may only start workout sessions for yourself.');
      }

      if (input.planSessionId) {
        const planSession = await prisma.workoutPlanSession.findUnique({
          where: { id: input.planSessionId },
          select: { id: true, workoutPlan: { select: { userId: true } } },
        });
        if (!planSession || planSession.workoutPlan.userId !== input.userId) {
          throw new NotFoundError('Workout plan session not found.');
        }
      }

      const session = await workoutLogRepository.startSession(input);
      res.status(201).json({ session });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.get(
  '/workout-sessions/:sessionId',
  validate({ params: workoutSessionIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { sessionId } = req.validated!.params as { sessionId: string };
      const session = await loadOwnedSession(sessionId, authedReq);
      res.json({ session });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/workout-sessions/:sessionId/exercises',
  validate({ params: workoutSessionIdParamsSchema, body: addSessionExerciseSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { sessionId } = req.validated!.params as { sessionId: string };
      const input = req.validated!.body as AddSessionExerciseInput;

      const session = await loadOwnedSession(sessionId, authedReq);
      if (session.status !== 'in_progress') {
        throw new ValidationError('This workout session is no longer in progress.');
      }

      // `sortOrder` is a display-ordering hint, not a uniqueness
      // invariant: `startSession`'s plan-template copy (above) already
      // carries over whatever `sortOrder` the plan's own exercises were
      // given, including client-supplied duplicates/defaults — so this
      // column deliberately has no `@@unique` constraint to enforce here
      // either. Two exercises added to the same in-progress session in
      // true concurrent requests could in principle compute the same
      // `sortOrder` from this stale count and tie for a display position;
      // accepted as a cosmetic edge case rather than adding transactional
      // locking for a non-uniqueness field.
      const sessionExercise = await prisma.workoutSessionExercise.create({
        data: {
          workoutSessionId: sessionId,
          exerciseId: input.exerciseId,
          noteText: input.noteText,
          sortOrder: session.sessionExercises.length + 1,
        },
        include: { exercise: true },
      });

      res.status(201).json({ sessionExercise });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.post(
  '/workout-sessions/:sessionId/exercises/:sessionExerciseId/sets',
  validate({ params: sessionExerciseParamsSchema, body: logSetSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { sessionId, sessionExerciseId } = req.validated!.params as {
        sessionId: string;
        sessionExerciseId: string;
      };
      const input = req.validated!.body as LogSetInput;

      const session = await loadOwnedSession(sessionId, authedReq);
      if (session.status !== 'in_progress') {
        throw new ValidationError('This workout session is no longer in progress.');
      }
      const sessionExercise = session.sessionExercises.find((exercise) => exercise.id === sessionExerciseId);
      if (!sessionExercise) throw new NotFoundError('Session exercise not found.');

      const set = await workoutLogRepository.logCompletedSet({
        sessionExerciseId,
        reps: input.reps,
        weightKg: input.weightKg,
        durationSeconds: input.durationSeconds,
      });

      res.status(201).json({ set });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.post(
  '/workout-sessions/:sessionId/complete',
  validate({ params: workoutSessionIdParamsSchema, body: completeSessionSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { sessionId } = req.validated!.params as { sessionId: string };
      const input = req.validated!.body as CompleteSessionInput;

      const session = await loadOwnedSession(sessionId, authedReq);
      if (session.status !== 'in_progress') {
        throw new ValidationError('This workout session is not in progress.');
      }

      const completed = await workoutLogRepository.completeSession(sessionId, input.caloriesBurned);
      // A completed live session advances the "workout" streak, same as
      // an ad-hoc logged one (workout-log.routes.ts).
      await memberRepository.incrementStreak(session.userId, 'workout');

      res.json({ session: completed });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.post(
  '/workout-sessions/:sessionId/cancel',
  validate({ params: workoutSessionIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { sessionId } = req.validated!.params as { sessionId: string };

      const session = await loadOwnedSession(sessionId, authedReq);
      if (session.status !== 'in_progress') {
        throw new ValidationError('This workout session is not in progress.');
      }

      const cancelled = await prisma.workoutSession.update({
        where: { id: sessionId },
        data: { status: 'cancelled', completedAt: new Date() },
      });

      res.json({ session: cancelled });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
