/**
 * Example wiring: validate() middleware + Zod schema suite + repository
 * pattern, all together, for the member profile and workout log endpoints.
 */
import { Router } from 'express';
import { validate } from '../middleware/validate';
import {
  createMemberProfileSchema,
  listMembersQuerySchema,
  memberIdParamsSchema,
} from '../validation/member-profile.schema';
import {
  createWorkoutLogSchema,
  listWorkoutLogsQuerySchema,
} from '../validation/workout-log.schema';
import { MemberRepository } from '../repositories/member.repository';
import { WorkoutLogRepository } from '../repositories/workout-log.repository';
import { prisma } from '../lib/prisma-client';

const router = Router();
const memberRepository = new MemberRepository(prisma);
const workoutLogRepository = new WorkoutLogRepository(prisma);

router.get('/members', validate({ query: listMembersQuerySchema }), async (req, res) => {
  const { page, pageSize } = req.validated!.query as { page: number; pageSize: number };
  const members = await memberRepository.findMany({ take: pageSize, skip: (page - 1) * pageSize });
  res.json({ members });
});

router.get(
  '/members/:id',
  validate({ params: memberIdParamsSchema }),
  async (req, res) => {
    const { id } = req.validated!.params as { id: string };
    const member = await memberRepository.findWithProfileAndGoals(id);
    if (!member) return res.status(404).json({ error: 'NotFound', message: 'Member not found.' });
    res.json({ member });
  },
);

router.post('/members', validate({ body: createMemberProfileSchema }), async (req, res) => {
  const input = req.validated!.body as import('../validation/member-profile.schema').CreateMemberProfileInput;
  const member = await memberRepository.createWithProfile({
    user: { email: input.email },
    profile: {
      firstName: input.fullName.split(' ')[0],
      lastName: input.fullName.split(' ').slice(1).join(' '),
      currentWeightKg: input.weightKg,
      heightCm: input.heightCm,
      timezone: input.timezone,
    },
  });
  res.status(201).json({ member });
});

router.get('/workout-logs', validate({ query: listWorkoutLogsQuerySchema }), async (req, res) => {
  const { memberId, page, pageSize } = req.validated!.query as {
    memberId?: string;
    page: number;
    pageSize: number;
  };
  const logs = await workoutLogRepository.findRecentForMember(memberId ?? '', {
    take: pageSize,
    cursor: page > 1 ? undefined : undefined,
  });
  res.json(logs);
});

router.post('/workout-logs', validate({ body: createWorkoutLogSchema }), async (req, res) => {
  const input = req.validated!.body as import('../validation/workout-log.schema').CreateWorkoutLogInput;
  const session = await workoutLogRepository.create({
    user: { connect: { id: input.memberId } },
    startedAt: new Date(input.loggedAt),
    status: 'completed',
    caloriesBurned: input.caloriesBurned,
  } as never);
  res.status(201).json({ session });
});

export default router;
