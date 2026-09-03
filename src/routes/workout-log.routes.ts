// Workout-log routes: validate() middleware + Zod schema suite +
// repository pattern, wired together against the canonical schema.
//
// Fixes applied vs. the original example wiring (see
// docs/artifacts/README.md "Known conflicts" #3 and
// docs/architecture/canonical-schema-decisions.md):
//   - GET no longer accepts an arbitrary `memberId` from a plain user —
//     it's scoped to the caller's own id unless the caller is ADMIN/COACH.
//     The original example passed `memberId ?? ''`, which silently became
//     an empty-string lookup (matching nothing) whenever the query param
//     was omitted.
//   - GET pagination is real offset pagination (page/pageSize), not the
//     original's `cursor: undefined` that never advanced past page 1.
//   - POST creates the full WorkoutSession -> WorkoutSessionExercise ->
//     WorkoutSet chain the validation contract promises, instead of a
//     bare session row.

// `authenticate` is applied once, centrally, in app.ts's protected
// sub-router — see the note in src/routes/user.routes.ts for why it must
// not also be run per-router here.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createWorkoutLogSchema,
  updateWorkoutLogSchema,
  workoutLogIdParamsSchema,
  listWorkoutLogsQuerySchema,
  toExerciseCategory,
  type CreateWorkoutLogInput,
  type UpdateWorkoutLogInput,
} from '../validation/workout-log.schema';
import { WorkoutLogRepository } from '../repositories/workout-log.repository';
import { MemberRepository } from '../repositories/member.repository';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();
const workoutLogRepository = new WorkoutLogRepository(prisma);
const memberRepository = new MemberRepository(prisma);

router.get('/workout-logs', validate({ query: listWorkoutLogsQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { memberId, category, from, to, page, pageSize } = req.validated!.query as {
      memberId?: string;
      category?: 'STRENGTH' | 'CARDIO' | 'MOBILITY' | 'SPORT' | 'RECOVERY';
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    };

    // A plain user may only ever list their own logs. Only ADMIN, or a
    // COACH with an active CoachAssignment to that member, may request
    // another member's logs via `memberId` (see src/rbac/member-scope.ts).
    const targetUserId = memberId ?? authedReq.user.id;
    if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
      throw new ForbiddenError('You may only list your own workout logs.');
    }

    const result = await workoutLogRepository.listForUser(targetUserId, {
      category: category ? toExerciseCategory(category) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page,
      pageSize,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/workout-logs', validate({ body: createWorkoutLogSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const input = req.validated!.body as CreateWorkoutLogInput;

    // `memberId` in the body is never trusted for whose log this becomes
    // unless the caller is authorized for that member — otherwise any
    // user (or any coach with no real relationship to this member) could
    // write workout data into someone else's history.
    if (!(await canAccessMemberRecord(prisma, authedReq.user, input.memberId))) {
      throw new ForbiddenError('You may only log workouts for yourself.');
    }

    const session = await workoutLogRepository.logAdHocWorkout({
      userId: input.memberId,
      exerciseName: input.exerciseName,
      category: toExerciseCategory(input.category),
      loggedAt: new Date(input.loggedAt),
      sets: input.sets,
      reps: input.reps,
      durationMinutes: input.durationMinutes,
      caloriesBurned: input.caloriesBurned,
      notes: input.notes,
    });

    // A logged workout advances the member's "workout" streak. This is
    // the first real caller of MemberRepository.incrementStreak, which
    // previously existed but was never wired to anything.
    //
    // Deliberately NOT passed `input.loggedAt`: incrementStreak always
    // advances against wall-clock "now", even though this ad-hoc log
    // endpoint accepts an arbitrary past `loggedAt` (logging yesterday's
    // forgotten workout is a normal, supported use of this endpoint).
    // The alternative — advancing the streak as of `loggedAt` — would let
    // a member fabricate an arbitrarily long streak in one sitting by
    // backdating a run of ad-hoc entries, one per missed day; a streak
    // that can be built entirely after the fact isn't measuring anything.
    // Anchoring to "now" means the streak only ever reflects genuine,
    // same-day logging activity, which is the property a streak feature
    // exists to encourage — at the (accepted) cost that a late, honest
    // "forgot to log yesterday" entry counts toward today's streak rather
    // than repairing yesterday's gap.
    await memberRepository.incrementStreak(input.memberId, 'workout');

    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/workout-logs/:id',
  validate({ params: workoutLogIdParamsSchema, body: updateWorkoutLogSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateWorkoutLogInput;

      const existing = await prisma.workoutSession.findUnique({
        where: { id },
        include: { sessionExercises: { include: { exercise: true } } },
      });
      if (!existing) throw new NotFoundError('Workout log not found.');
      if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
        throw new NotFoundError('Workout log not found.');
      }
      if (existing.sessionExercises.length !== 1) {
        throw new ValidationError(
          'This endpoint only edits single-exercise ad-hoc logs; use the workout-session routes to manage a multi-exercise session.',
        );
      }

      const session = await workoutLogRepository.updateAdHocWorkout(existing, {
        exerciseName: input.exerciseName,
        category: input.category ? toExerciseCategory(input.category) : undefined,
        loggedAt: input.loggedAt ? new Date(input.loggedAt) : undefined,
        caloriesBurned: input.caloriesBurned,
        notes: input.notes,
      });

      res.json({ session });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete('/workout-logs/:id', validate({ params: workoutLogIdParamsSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { id } = req.validated!.params as { id: string };

    const existing = await prisma.workoutSession.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundError('Workout log not found.');
    if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
      throw new NotFoundError('Workout log not found.');
    }

    // Cascades to sessionExercises and their sets (onDelete: Cascade).
    await prisma.workoutSession.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(translatePrismaError(err));
  }
});

export default router;
