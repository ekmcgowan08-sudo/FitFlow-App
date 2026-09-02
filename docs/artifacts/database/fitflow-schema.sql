-- FitFlow Suite PostgreSQL starter schema
-- Designed to support the OpenAPI contract, seed data, and demo data.

create extension if not exists pgcrypto;

create type coach_type as enum ('ai', 'human');
create type goal_style as enum ('fat_loss', 'muscle_gain', 'maintenance', 'endurance', 'recomposition');
create type workout_location as enum ('home', 'gym', 'hybrid');
create type diet_style as enum ('balanced', 'high_protein', 'low_carb', 'vegetarian', 'vegan', 'pescatarian');
create type smartwatch_platform as enum ('apple_health', 'wear_os', 'garmin', 'fitbit', 'none');
create type goal_category as enum ('weight', 'strength', 'nutrition', 'consistency', 'sleep', 'budget');
create type goal_status as enum ('active', 'paused', 'achieved', 'archived');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack', 'drink');
create type exercise_category as enum ('strength', 'cardio', 'mobility', 'recovery');
create type checkin_source as enum ('qr', 'geofence', 'manual');
create type achievement_status as enum ('locked', 'in_progress', 'unlocked');
create type sex_at_birth as enum ('female', 'male', 'intersex', 'undisclosed');

create table members (
  id text primary key,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  birth_date date,
  sex_at_birth sex_at_birth,
  height_cm numeric(6,2),
  weight_kg numeric(6,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table member_preferences (
  member_id text primary key references members(id) on delete cascade,
  goal_style goal_style,
  workout_location workout_location,
  diet_style diet_style,
  theme_color text,
  coach_preference text check (coach_preference in ('ai','human','hybrid')),
  smartwatch_platform smartwatch_platform not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table member_health_profiles (
  member_id text primary key references members(id) on delete cascade,
  calorie_target integer,
  protein_target_grams integer,
  carb_target_grams integer,
  fat_target_grams integer,
  water_target_oz integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table member_allergies (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references members(id) on delete cascade,
  allergy_name text not null,
  unique (member_id, allergy_name)
);

create table member_medical_notes (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references members(id) on delete cascade,
  note_text text not null
);

create table goals (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  category goal_category not null,
  title text not null,
  target_value numeric(10,2),
  target_unit text,
  due_date date,
  status goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table coaches (
  id text primary key,
  coach_type coach_type not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table coach_specialties (
  id uuid primary key default gen_random_uuid(),
  coach_id text not null references coaches(id) on delete cascade,
  specialty text not null,
  unique (coach_id, specialty)
);

create table coach_assignments (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  coach_id text not null references coaches(id) on delete restrict,
  starts_on date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table exercises (
  id text primary key,
  name text not null,
  category exercise_category not null,
  equipment text,
  why_it_works text,
  how_to_video_url text,
  created_at timestamptz not null default now()
);

create table exercise_primary_muscles (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null references exercises(id) on delete cascade,
  muscle_name text not null,
  unique (exercise_id, muscle_name)
);

create table exercise_secondary_muscles (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null references exercises(id) on delete cascade,
  muscle_name text not null,
  unique (exercise_id, muscle_name)
);

create table exercise_instructions (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null references exercises(id) on delete cascade,
  step_number integer not null,
  instruction_text text not null,
  unique (exercise_id, step_number)
);

create table meal_plans (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  title text not null,
  daily_calories integer,
  created_at timestamptz not null default now()
);

create table meal_plan_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id text not null references meal_plans(id) on delete cascade,
  day_of_week text not null,
  meal_type meal_type not null,
  recipe_name text not null,
  calories integer,
  estimated_cost_usd numeric(10,2)
);

create table grocery_plans (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  total_estimated_cost_usd numeric(10,2),
  created_at timestamptz not null default now()
);

create table grocery_plan_items (
  id uuid primary key default gen_random_uuid(),
  grocery_plan_id text not null references grocery_plans(id) on delete cascade,
  store_name text not null,
  item_name text not null,
  quantity text,
  unit_price_usd numeric(10,2),
  best_deal boolean not null default false
);

create table workout_plans (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  title text not null,
  coach_source coach_type not null,
  created_at timestamptz not null default now()
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id text not null references workout_plans(id) on delete cascade,
  day_of_week text not null,
  focus text not null,
  estimated_minutes integer,
  rest_timer_seconds integer
);

create table workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id text not null references exercises(id) on delete restrict,
  sets integer,
  reps text,
  work_seconds integer,
  note_text text,
  sort_order integer not null default 1
);

create table nutrition_logs (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  logged_at timestamptz not null,
  meal_type meal_type not null,
  item_name text not null,
  serving_description text,
  calories integer,
  protein_grams numeric(8,2),
  carbs_grams numeric(8,2),
  fat_grams numeric(8,2),
  water_oz numeric(8,2)
);

create table gyms (
  id text primary key,
  name text not null,
  city text,
  state text,
  created_at timestamptz not null default now()
);

create table gym_check_ins (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  gym_id text not null references gyms(id) on delete restrict,
  checked_in_at timestamptz not null,
  source checkin_source not null,
  points_earned integer not null default 0
);

create table member_streaks (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references members(id) on delete cascade,
  streak_type text not null,
  current_days integer not null default 0,
  longest_days integer not null default 0,
  unique (member_id, streak_type)
);

create table badges (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  name text not null,
  unlocked_at timestamptz
);

create table achievements (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  title text not null,
  progress_percent numeric(5,2) not null default 0,
  status achievement_status not null default 'locked'
);

create table wearable_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references members(id) on delete cascade,
  summary_date date not null,
  steps integer,
  active_calories integer,
  exercise_minutes integer,
  resting_heart_rate integer,
  sleep_hours numeric(4,2),
  unique (member_id, summary_date)
);

create index idx_goals_member_id on goals(member_id);
create index idx_nutrition_logs_member_id_logged_at on nutrition_logs(member_id, logged_at desc);
create index idx_meal_plans_member_id on meal_plans(member_id);
create index idx_grocery_plans_member_id on grocery_plans(member_id);
create index idx_workout_plans_member_id on workout_plans(member_id);
create index idx_workout_sessions_plan_id on workout_sessions(workout_plan_id);
create index idx_gym_check_ins_member_id_checked_in_at on gym_check_ins(member_id, checked_in_at desc);
create index idx_wearable_daily_summaries_member_id_date on wearable_daily_summaries(member_id, summary_date desc);

-- Seed data
insert into members (id, email, first_name, last_name, birth_date, sex_at_birth, height_cm, weight_kg) values
('mem_001', 'alex.carter@example.com', 'Alex', 'Carter', '1992-05-14', 'male', 178, 82.4),
('mem_002', 'jordan.lee@example.com', 'Jordan', 'Lee', '1988-10-02', 'female', 165, 64.2);

insert into member_preferences (member_id, goal_style, workout_location, diet_style, theme_color, coach_preference, smartwatch_platform) values
('mem_001', 'fat_loss', 'hybrid', 'high_protein', '#0F766E', 'hybrid', 'apple_health'),
('mem_002', 'muscle_gain', 'gym', 'balanced', '#7C3AED', 'human', 'garmin');

insert into member_health_profiles (member_id, calorie_target, protein_target_grams, carb_target_grams, fat_target_grams, water_target_oz) values
('mem_001', 2100, 190, 180, 70, 100),
('mem_002', 2400, 150, 260, 80, 90);

insert into member_allergies (member_id, allergy_name) values
('mem_001', 'shellfish'),
('mem_002', 'peanuts');

insert into member_medical_notes (member_id, note_text) values
('mem_001', 'mild lactose sensitivity'),
('mem_002', 'prefers lower impact cardio');

insert into goals (id, member_id, category, title, target_value, target_unit, due_date, status) values
('goal_001', 'mem_001', 'weight', 'Lose 8 pounds in 12 weeks', 8, 'pounds', '2026-10-20', 'active'),
('goal_002', 'mem_002', 'strength', 'Increase squat working weight by 20 pounds', 20, 'pounds', '2026-11-15', 'active');

insert into coaches (id, coach_type, display_name) values
('coach_001', 'human', 'Coach Maya'),
('coach_ai_001', 'ai', 'FitFlow AI Coach');

insert into coach_specialties (coach_id, specialty) values
('coach_001', 'strength'),
('coach_001', 'nutrition'),
('coach_001', 'habit building'),
('coach_ai_001', 'meal planning'),
('coach_ai_001', 'adaptive programming'),
('coach_ai_001', 'recovery guidance');

insert into coach_assignments (id, member_id, coach_id, starts_on, notes) values
('asn_001', 'mem_001', 'coach_ai_001', '2026-07-28', 'Daily feedback and weekly plan refresh.'),
('asn_002', 'mem_002', 'coach_001', '2026-07-28', 'In-person programming with monthly progress review.');

insert into exercises (id, name, category, equipment, why_it_works, how_to_video_url) values
('ex_001', 'Leg Press', 'strength', 'Leg press machine', 'Builds lower-body strength with guided stability.', 'https://videos.fitflowsuite.example/exercises/leg-press.mp4'),
('ex_002', 'Dumbbell Bench Press', 'strength', 'Adjustable bench and dumbbells', 'Improves pressing strength and shoulder stability.', 'https://videos.fitflowsuite.example/exercises/dumbbell-bench-press.mp4'),
('ex_003', 'Treadmill Incline Walk', 'cardio', 'Treadmill', 'Raises heart rate with low joint impact.', 'https://videos.fitflowsuite.example/exercises/treadmill-incline-walk.mp4');

insert into exercise_primary_muscles (exercise_id, muscle_name) values
('ex_001', 'quadriceps'), ('ex_001', 'glutes'),
('ex_002', 'chest'),
('ex_003', 'calves'), ('ex_003', 'glutes');

insert into exercise_secondary_muscles (exercise_id, muscle_name) values
('ex_001', 'hamstrings'),
('ex_002', 'triceps'), ('ex_002', 'front delts'),
('ex_003', 'hamstrings');

insert into exercise_instructions (exercise_id, step_number, instruction_text) values
('ex_001', 1, 'Set feet shoulder-width on platform.'),
('ex_001', 2, 'Lower with control until knees reach a comfortable bend.'),
('ex_001', 3, 'Drive through mid-foot to return without locking knees.'),
('ex_002', 1, 'Plant feet firmly on the floor.'),
('ex_002', 2, 'Lower dumbbells to chest level with elbows slightly tucked.'),
('ex_002', 3, 'Press up until arms are extended with control.'),
('ex_003', 1, 'Set incline and speed to a brisk but sustainable effort.'),
('ex_003', 2, 'Maintain upright posture and natural arm swing.'),
('ex_003', 3, 'Breathe rhythmically for the full interval.');

insert into meal_plans (id, member_id, title, daily_calories) values
('mealplan_001', 'mem_001', 'High-protein fat-loss week', 2100);

insert into meal_plan_meals (meal_plan_id, day_of_week, meal_type, recipe_name, calories, estimated_cost_usd) values
('mealplan_001', 'Monday', 'breakfast', 'Greek yogurt parfait', 320, 2.75),
('mealplan_001', 'Monday', 'lunch', 'Chicken quinoa bowl', 540, 4.80),
('mealplan_001', 'Monday', 'dinner', 'Salmon rice plate', 610, 6.95);

insert into grocery_plans (id, member_id, total_estimated_cost_usd) values
('groc_001', 'mem_001', 74.21);

insert into grocery_plan_items (grocery_plan_id, store_name, item_name, quantity, unit_price_usd, best_deal) values
('groc_001', 'Kroger', 'Chicken breast', '2 lb', 7.99, true),
('groc_001', 'Aldi', 'Greek yogurt', '32 oz', 3.49, true),
('groc_001', 'Walmart', 'Frozen berries', '16 oz', 4.28, false);

insert into workout_plans (id, member_id, title, coach_source) values
('wkp_001', 'mem_001', '4-day strength and conditioning', 'ai');

with s1 as (
  insert into workout_sessions (workout_plan_id, day_of_week, focus, estimated_minutes, rest_timer_seconds)
  values ('wkp_001', 'Tuesday', 'Upper body push', 52, 75)
  returning id
),
s2 as (
  insert into workout_sessions (workout_plan_id, day_of_week, focus, estimated_minutes, rest_timer_seconds)
  values ('wkp_001', 'Thursday', 'Lower body strength', 58, 90)
  returning id
),
s3 as (
  insert into workout_sessions (workout_plan_id, day_of_week, focus, estimated_minutes, rest_timer_seconds)
  values ('wkp_001', 'Saturday', 'Conditioning', 30, 30)
  returning id
)
insert into workout_session_exercises (workout_session_id, exercise_id, sets, reps, work_seconds, note_text, sort_order)
select id, 'ex_002', 4, '8-10', null, 'Use challenging but clean form.', 1 from s1
union all
select id, 'ex_001', 4, '10-12', null, 'Full depth within comfort range.', 1 from s2
union all
select id, 'ex_003', 1, '20 min', 1200, 'Stay in moderate intensity zone.', 1 from s3;

insert into nutrition_logs (id, member_id, logged_at, meal_type, item_name, serving_description, calories, protein_grams, carbs_grams, fat_grams, water_oz) values
('nut_001', 'mem_001', '2026-07-28T08:15:00Z', 'breakfast', 'Greek yogurt parfait', '1 bowl', 320, 24, 31, 9, 12),
('nut_002', 'mem_001', '2026-07-28T12:30:00Z', 'lunch', 'Chicken quinoa bowl', '1 bowl', 540, 46, 42, 16, 16);

insert into gyms (id, name, city, state) values
('gym_001', 'Fit House Sharonville', 'Sharonville', 'OH');

insert into gym_check_ins (id, member_id, gym_id, checked_in_at, source, points_earned) values
('chk_001', 'mem_001', 'gym_001', '2026-07-28T22:05:00Z', 'qr', 25);

insert into member_streaks (member_id, streak_type, current_days, longest_days) values
('mem_001', 'workout_logging', 11, 29);

insert into badges (id, member_id, name, unlocked_at) values
('badge_001', 'mem_001', 'Seven-Day Streak', '2026-07-24T18:00:00Z');

insert into achievements (id, member_id, title, progress_percent, status) values
('ach_001', 'mem_001', 'Logged meals for 14 straight days', 100, 'unlocked');

insert into wearable_daily_summaries (member_id, summary_date, steps, active_calories, exercise_minutes, resting_heart_rate, sleep_hours) values
('mem_001', '2026-07-28', 10422, 612, 48, 58, 7.6);
