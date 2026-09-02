-- CreateEnum
CREATE TYPE "role_code" AS ENUM ('ADMIN', 'COACH', 'SUBSCRIBER', 'USER', 'GYM_PARTNER', 'SUPPORT_OPS');

-- CreateEnum
CREATE TYPE "CoachType" AS ENUM ('ai', 'human');

-- CreateEnum
CREATE TYPE "GoalStyle" AS ENUM ('fat_loss', 'muscle_gain', 'maintenance', 'endurance', 'recomposition');

-- CreateEnum
CREATE TYPE "WorkoutLocation" AS ENUM ('home', 'gym', 'hybrid');

-- CreateEnum
CREATE TYPE "DietStyle" AS ENUM ('balanced', 'high_protein', 'low_carb', 'vegetarian', 'vegan', 'pescatarian');

-- CreateEnum
CREATE TYPE "SmartwatchPlatform" AS ENUM ('apple_health', 'wear_os', 'garmin', 'fitbit', 'none');

-- CreateEnum
CREATE TYPE "GoalCategory" AS ENUM ('weight', 'strength', 'nutrition', 'consistency', 'sleep', 'budget');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'paused', 'achieved', 'archived');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack', 'drink');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('strength', 'cardio', 'mobility', 'recovery', 'sport');

-- CreateEnum
CREATE TYPE "WorkoutSessionStatus" AS ENUM ('in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "CheckinSource" AS ENUM ('qr', 'geofence', 'manual');

-- CreateEnum
CREATE TYPE "AchievementStatus" AS ENUM ('locked', 'in_progress', 'unlocked');

-- CreateEnum
CREATE TYPE "SexAtBirth" AS ENUM ('female', 'male', 'intersex', 'undisclosed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "code" "role_code" NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" TEXT NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "birth_date" DATE,
    "sex_at_birth" "SexAtBirth",
    "height_cm" DECIMAL(6,2),
    "current_weight_kg" DECIMAL(6,2),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Chicago',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" TEXT NOT NULL,
    "goal_style" "GoalStyle",
    "workout_location" "WorkoutLocation",
    "diet_style" "DietStyle",
    "theme_color" TEXT,
    "coach_preference" TEXT,
    "smartwatch_platform" "SmartwatchPlatform" NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_health_profiles" (
    "user_id" TEXT NOT NULL,
    "calorie_target" INTEGER,
    "protein_target_grams" INTEGER,
    "carb_target_grams" INTEGER,
    "fat_target_grams" INTEGER,
    "water_target_oz" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_health_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_allergies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "allergy_name" TEXT NOT NULL,

    CONSTRAINT "user_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_medical_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "note_text" TEXT NOT NULL,

    CONSTRAINT "user_medical_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "user_id" TEXT NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "accepts_new_clients" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "coach_specialties" (
    "id" TEXT NOT NULL,
    "coach_user_id" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,

    CONSTRAINT "coach_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_assignments" (
    "coach_user_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "relationship_status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "starts_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_assignments_pkey" PRIMARY KEY ("coach_user_id","client_user_id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "GoalCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "target_value" DECIMAL(10,2),
    "target_unit" TEXT,
    "due_date" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "streak_type" TEXT NOT NULL,
    "current_count" INTEGER NOT NULL DEFAULT 0,
    "best_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "daily_calories" INTEGER,
    "coach_source" "CoachType" NOT NULL DEFAULT 'ai',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_meals" (
    "id" TEXT NOT NULL,
    "meal_plan_id" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "recipe_name" TEXT NOT NULL,
    "calories" INTEGER,
    "estimated_cost_usd" DECIMAL(10,2),

    CONSTRAINT "meal_plan_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_estimated_cost_usd" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grocery_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_plan_items" (
    "id" TEXT NOT NULL,
    "grocery_plan_id" TEXT NOT NULL,
    "store_name" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" TEXT,
    "unit_price_usd" DECIMAL(10,2),
    "best_deal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "grocery_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "item_name" TEXT NOT NULL,
    "serving_description" TEXT,
    "calories" INTEGER,
    "protein_grams" DECIMAL(8,2),
    "carbs_grams" DECIMAL(8,2),
    "fat_grams" DECIMAL(8,2),
    "water_oz" DECIMAL(8,2),

    CONSTRAINT "nutrition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ExerciseCategory" NOT NULL,
    "equipment" TEXT,
    "why_it_works" TEXT,
    "how_to_video_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_primary_muscles" (
    "id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "muscle_name" TEXT NOT NULL,

    CONSTRAINT "exercise_primary_muscles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_secondary_muscles" (
    "id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "muscle_name" TEXT NOT NULL,

    CONSTRAINT "exercise_secondary_muscles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_instructions" (
    "id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "step_number" INTEGER NOT NULL,
    "instruction_text" TEXT NOT NULL,

    CONSTRAINT "exercise_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coach_source" "CoachType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plan_sessions" (
    "id" TEXT NOT NULL,
    "workout_plan_id" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "estimated_minutes" INTEGER,
    "rest_timer_seconds" INTEGER,

    CONSTRAINT "workout_plan_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plan_session_exercises" (
    "id" TEXT NOT NULL,
    "plan_session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "target_sets" INTEGER,
    "target_reps" TEXT,
    "target_work_seconds" INTEGER,
    "note_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workout_plan_session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_session_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "status" "WorkoutSessionStatus" NOT NULL DEFAULT 'in_progress',
    "calories_burned" INTEGER,

    CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_session_exercises" (
    "id" TEXT NOT NULL,
    "workout_session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 1,
    "note_text" TEXT,

    CONSTRAINT "workout_session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" TEXT NOT NULL,
    "session_exercise_id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "reps" INTEGER,
    "weight_kg" DECIMAL(6,2),
    "duration_seconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gyms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_check_ins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "gym_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL,
    "source" "CheckinSource" NOT NULL,
    "points_earned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gym_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3),

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "progress_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "AchievementStatus" NOT NULL DEFAULT 'locked',

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wearable_daily_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "summary_date" DATE NOT NULL,
    "steps" INTEGER,
    "active_calories" INTEGER,
    "exercise_minutes" INTEGER,
    "resting_heart_rate" INTEGER,
    "sleep_hours" DECIMAL(4,2),

    CONSTRAINT "wearable_daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_allergies_user_id_allergy_name_key" ON "user_allergies"("user_id", "allergy_name");

-- CreateIndex
CREATE UNIQUE INDEX "coach_specialties_coach_user_id_specialty_key" ON "coach_specialties"("coach_user_id", "specialty");

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "streaks_user_id_streak_type_key" ON "streaks"("user_id", "streak_type");

-- CreateIndex
CREATE INDEX "meal_plans_user_id_idx" ON "meal_plans"("user_id");

-- CreateIndex
CREATE INDEX "grocery_plans_user_id_idx" ON "grocery_plans"("user_id");

-- CreateIndex
CREATE INDEX "nutrition_logs_user_id_logged_at_idx" ON "nutrition_logs"("user_id", "logged_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_primary_muscles_exercise_id_muscle_name_key" ON "exercise_primary_muscles"("exercise_id", "muscle_name");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_secondary_muscles_exercise_id_muscle_name_key" ON "exercise_secondary_muscles"("exercise_id", "muscle_name");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_instructions_exercise_id_step_number_key" ON "exercise_instructions"("exercise_id", "step_number");

-- CreateIndex
CREATE INDEX "workout_plans_user_id_idx" ON "workout_plans"("user_id");

-- CreateIndex
CREATE INDEX "workout_plan_sessions_workout_plan_id_idx" ON "workout_plan_sessions"("workout_plan_id");

-- CreateIndex
CREATE INDEX "workout_sessions_user_id_started_at_idx" ON "workout_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "workout_sets_session_exercise_id_idx" ON "workout_sets"("session_exercise_id");

-- CreateIndex
CREATE INDEX "gym_check_ins_user_id_checked_in_at_idx" ON "gym_check_ins"("user_id", "checked_in_at" DESC);

-- CreateIndex
CREATE INDEX "wearable_daily_summaries_user_id_summary_date_idx" ON "wearable_daily_summaries"("user_id", "summary_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wearable_daily_summaries_user_id_summary_date_key" ON "wearable_daily_summaries"("user_id", "summary_date");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_health_profiles" ADD CONSTRAINT "user_health_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_allergies" ADD CONSTRAINT "user_allergies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_medical_notes" ADD CONSTRAINT "user_medical_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_specialties" ADD CONSTRAINT "coach_specialties_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "coach_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_assignments" ADD CONSTRAINT "coach_assignments_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_assignments" ADD CONSTRAINT "coach_assignments_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_meals" ADD CONSTRAINT "meal_plan_meals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_plans" ADD CONSTRAINT "grocery_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_plan_items" ADD CONSTRAINT "grocery_plan_items_grocery_plan_id_fkey" FOREIGN KEY ("grocery_plan_id") REFERENCES "grocery_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_logs" ADD CONSTRAINT "nutrition_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_primary_muscles" ADD CONSTRAINT "exercise_primary_muscles_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_secondary_muscles" ADD CONSTRAINT "exercise_secondary_muscles_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_instructions" ADD CONSTRAINT "exercise_instructions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_sessions" ADD CONSTRAINT "workout_plan_sessions_workout_plan_id_fkey" FOREIGN KEY ("workout_plan_id") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_session_exercises" ADD CONSTRAINT "workout_plan_session_exercises_plan_session_id_fkey" FOREIGN KEY ("plan_session_id") REFERENCES "workout_plan_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_session_exercises" ADD CONSTRAINT "workout_plan_session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_plan_session_id_fkey" FOREIGN KEY ("plan_session_id") REFERENCES "workout_plan_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_workout_session_id_fkey" FOREIGN KEY ("workout_session_id") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "workout_session_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_check_ins" ADD CONSTRAINT "gym_check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_check_ins" ADD CONSTRAINT "gym_check_ins_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_daily_summaries" ADD CONSTRAINT "wearable_daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
