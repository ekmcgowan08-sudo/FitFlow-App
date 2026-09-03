-- Backs two find-or-compute-then-create patterns that were otherwise
-- racy under concurrent requests:
--   - WorkoutLogRepository.logAdHocWorkout's find-or-create Exercise
--     catalog lookup by (name, category)
--   - WorkoutLogRepository.logCompletedSet's server-computed next
--     setNumber for a session exercise
-- Both application-side fixes now retry on a unique-constraint conflict
-- instead of relying solely on a stale in-memory read.

ALTER TABLE "exercises" ADD CONSTRAINT "exercises_name_category_key" UNIQUE ("name", "category");

ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_exercise_id_set_number_key" UNIQUE ("session_exercise_id", "set_number");
