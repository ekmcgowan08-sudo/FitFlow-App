-- CreateIndex
CREATE INDEX "achievements_user_id_idx" ON "achievements"("user_id");

-- CreateIndex
CREATE INDEX "badges_user_id_unlocked_at_idx" ON "badges"("user_id", "unlocked_at" DESC);

-- CreateIndex
CREATE INDEX "coach_assignments_client_user_id_idx" ON "coach_assignments"("client_user_id");

-- CreateIndex
CREATE INDEX "grocery_plan_items_grocery_plan_id_idx" ON "grocery_plan_items"("grocery_plan_id");

-- CreateIndex
CREATE INDEX "meal_plan_meals_meal_plan_id_idx" ON "meal_plan_meals"("meal_plan_id");

-- CreateIndex
CREATE INDEX "user_medical_notes_user_id_idx" ON "user_medical_notes"("user_id");

-- CreateIndex
CREATE INDEX "workout_plan_session_exercises_plan_session_id_idx" ON "workout_plan_session_exercises"("plan_session_id");

-- CreateIndex
CREATE INDEX "workout_session_exercises_workout_session_id_idx" ON "workout_session_exercises"("workout_session_id");
