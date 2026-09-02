import { z } from 'zod';
import { CheckinSource } from '@prisma/client';

const cuid = z.string().min(8);
const isoDate = z.string().datetime().or(z.string().date());
const positiveNumber = z.number().nonnegative();

export const memberIdParamSchema = z.object({
  memberId: cuid,
});

export const memberDateQuerySchema = z.object({
  date: z.string().date().optional(),
});

export const exerciseQuerySchema = z.object({
  query: z.string().trim().min(1).max(80).optional(),
  equipment: z.string().trim().min(1).max(60).optional(),
  muscleGroup: z.string().trim().min(1).max(60).optional(),
});

export const createNutritionLogSchema = z.object({
  foodName: z.string().trim().min(1).max(120),
  brandName: z.string().trim().max(120).optional(),
  servingSize: z.string().trim().min(1).max(60),
  calories: z.number().int().min(0).max(5000),
  proteinGrams: positiveNumber.max(500).optional(),
  carbsGrams: positiveNumber.max(1000).optional(),
  fatGrams: positiveNumber.max(500).optional(),
  fiberGrams: positiveNumber.max(250).optional(),
  sugarGrams: positiveNumber.max(500).optional(),
  sodiumMilligrams: positiveNumber.max(20000).optional(),
  waterMilliliters: positiveNumber.max(10000).optional(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  notes: z.string().trim().max(300).optional(),
  loggedAt: isoDate.optional(),
});

export const createWorkoutPlanSchema = z.object({
  title: z.string().trim().min(3).max(120),
  coachSource: z.enum(['ai', 'human']).default('ai'),
});

export const createGymCheckInSchema = z.object({
  id: z.string().optional(),
  memberId: cuid,
  gymId: cuid,
  checkedInAt: isoDate.optional(),
  source: z.nativeEnum(CheckinSource).optional(),
  pointsEarned: z.number().int().min(0).max(10000).optional(),
});

export const createCoachAssignmentSchema = z.object({
  id: z.string().min(8),
  coachId: cuid,
  startsOn: isoDate,
  notes: z.string().trim().max(500).optional(),
});

export const routeSchemas = {
  me: { params: z.object({}) },
  memberDashboard: { params: memberIdParamSchema },
  nutritionList: { params: memberIdParamSchema, query: memberDateQuerySchema },
  nutritionCreate: { params: memberIdParamSchema, body: createNutritionLogSchema },
  workoutPlansList: { params: memberIdParamSchema },
  workoutPlansCreate: { params: memberIdParamSchema, body: createWorkoutPlanSchema },
  mealPlansList: { params: memberIdParamSchema },
  groceryPlansList: { params: memberIdParamSchema },
  exercisesList: { query: exerciseQuerySchema },
  gymCheckinCreate: { body: createGymCheckInSchema },
  achievementsList: { params: memberIdParamSchema },
  coachAssignmentCreate: { params: memberIdParamSchema, body: createCoachAssignmentSchema },
};

export type CreateNutritionLogInput = z.infer<typeof createNutritionLogSchema>;
export type CreateWorkoutPlanInput = z.infer<typeof createWorkoutPlanSchema>;
export type CreateGymCheckInInput = z.infer<typeof createGymCheckInSchema>;
export type CreateCoachAssignmentInput = z.infer<typeof createCoachAssignmentSchema>;
