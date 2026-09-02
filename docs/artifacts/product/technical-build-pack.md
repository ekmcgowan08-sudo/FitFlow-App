# FitFlow Suite Technical Build Pack

## Product scope
FitFlow Suite is a mobile-first fitness platform with a smartwatch companion focused on nutrition logging, health-aware meal planning, grocery budgeting, adaptive training, gym check-ins, and coach-managed plans. The backend should model the product around core resources first, then layer APIs and clients on top, which aligns with modern mobile API guidance and practical schema design advice for fitness products.[cite:57][cite:52]

The platform should optimize for mobile workloads by reducing request count, keeping payloads compact, versioning APIs, enforcing strong authentication, and supporting real-time updates only where they materially improve the experience such as workout timers, coach updates, and challenge progress.[cite:51][cite:60][cite:63]

## Target architecture
Use a modular architecture with four primary clients: iOS app, Android app, smartwatch companion, and coach/admin web portal. The companion wearable model should use a paired-phone architecture for heavier logic and sync, which is a standard pattern in wearable companion development.[cite:28][cite:61]

Recommended backend services:
- Auth and identity service.
- User profile and health preferences service.
- Nutrition and meal planning service.
- Workout programming and exercise media service.
- Commerce and budgeting service.
- Gamification and engagement service.
- Gym partner and check-in service.
- Notification and sync orchestration service.

Recommended infrastructure:
- Mobile clients call a versioned HTTPS API gateway.
- Core transactional data lives in PostgreSQL.
- Search-heavy food and exercise lookup can be cached in Redis.
- Object storage serves videos, thumbnails, and coach-uploaded media.
- Read replicas and connection pooling support read-heavy mobile traffic patterns.[cite:51]

## Core domains
The data model should be organized into these domains:
- Identity and roles.
- Health profile and goals.
- Food, meals, hydration, and nutrition logs.
- Grocery catalog, store pricing, and shopping plans.
- Exercises, workout plans, sessions, and rest timers.
- Gyms, memberships, check-ins, and partner rewards.
- Achievements, streaks, badges, and unlockables.
- Coach-authored plans, client assignment, and approvals.
- Device pairing, wearable sync, and telemetry.

A fitness database should keep tables narrow, normalize repeated structures, and avoid patterns like putting multiple sets in a single workout row. Session details, exercise details, and set-level performance should be modeled as child tables rather than repeated columns.[cite:52][cite:50][cite:56]

## Logical data model

### 1) Identity and access
```sql
create table users (
  id uuid primary key,
  email varchar(320) unique not null,
  password_hash text not null,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roles (
  id smallserial primary key,
  code varchar(32) unique not null,
  description text
);

create table user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id smallint not null references roles(id),
  primary key (user_id, role_id)
);

create table user_devices (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  device_type varchar(32) not null,
  platform varchar(32) not null,
  app_version varchar(32),
  push_token text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 2) Profile, health, and goals
```sql
create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  first_name varchar(100),
  last_name varchar(100),
  birth_date date,
  sex_at_birth varchar(32),
  height_cm numeric(5,2),
  current_weight_kg numeric(6,2),
  activity_level varchar(32),
  timezone varchar(64) not null,
  units varchar(16) not null default 'imperial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table health_conditions (
  id serial primary key,
  code varchar(64) unique not null,
  label varchar(128) not null,
  notes text
);

create table user_health_conditions (
  user_id uuid not null references users(id) on delete cascade,
  condition_id int not null references health_conditions(id),
  severity varchar(32),
  notes text,
  primary key (user_id, condition_id)
);

create table dietary_preferences (
  id serial primary key,
  code varchar(64) unique not null,
  label varchar(128) not null
);

create table user_dietary_preferences (
  user_id uuid not null references users(id) on delete cascade,
  preference_id int not null references dietary_preferences(id),
  primary key (user_id, preference_id)
);

create table goals (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  goal_type varchar(64) not null,
  target_value numeric(10,2),
  target_unit varchar(32),
  start_date date not null,
  target_date date,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now()
);
```

### 3) Food, meals, and hydration
```sql
create table foods (
  id uuid primary key,
  source varchar(32) not null,
  external_ref varchar(128),
  name varchar(255) not null,
  brand_name varchar(255),
  serving_size numeric(10,2),
  serving_unit varchar(32),
  calories numeric(10,2) not null,
  protein_g numeric(10,2) default 0,
  carbs_g numeric(10,2) default 0,
  fat_g numeric(10,2) default 0,
  fiber_g numeric(10,2) default 0,
  sugar_g numeric(10,2) default 0,
  sodium_mg numeric(10,2) default 0,
  barcode varchar(64),
  created_at timestamptz not null default now()
);

create table meal_templates (
  id uuid primary key,
  owner_user_id uuid references users(id) on delete set null,
  title varchar(255) not null,
  meal_type varchar(32),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table meal_template_items (
  id uuid primary key,
  meal_template_id uuid not null references meal_templates(id) on delete cascade,
  food_id uuid not null references foods(id),
  quantity numeric(10,2) not null,
  unit varchar(32),
  sequence_no int not null default 1
);

create table food_logs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  logged_at timestamptz not null,
  meal_type varchar(32),
  source varchar(32) not null,
  note text,
  created_at timestamptz not null default now()
);

create table food_log_items (
  id uuid primary key,
  food_log_id uuid not null references food_logs(id) on delete cascade,
  food_id uuid not null references foods(id),
  quantity numeric(10,2) not null,
  unit varchar(32),
  calories numeric(10,2) not null,
  protein_g numeric(10,2) default 0,
  carbs_g numeric(10,2) default 0,
  fat_g numeric(10,2) default 0
);

create table hydration_logs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  logged_at timestamptz not null,
  volume_ml numeric(10,2) not null,
  beverage_type varchar(64) not null,
  created_at timestamptz not null default now()
);
```

### 4) Meal planning and shopping
```sql
create table meal_plans (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  generated_by varchar(32) not null,
  title varchar(255) not null,
  start_date date not null,
  end_date date not null,
  status varchar(32) not null default 'draft',
  created_at timestamptz not null default now()
);

create table meal_plan_days (
  id uuid primary key,
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  plan_date date not null,
  calorie_target numeric(10,2),
  protein_target_g numeric(10,2),
  carbs_target_g numeric(10,2),
  fat_target_g numeric(10,2)
);

create table meal_plan_entries (
  id uuid primary key,
  meal_plan_day_id uuid not null references meal_plan_days(id) on delete cascade,
  meal_type varchar(32) not null,
  meal_template_id uuid references meal_templates(id),
  notes text,
  sequence_no int not null default 1
);

create table stores (
  id uuid primary key,
  name varchar(255) not null,
  chain_code varchar(64),
  city varchar(128),
  state varchar(64),
  country varchar(64),
  latitude numeric(9,6),
  longitude numeric(9,6)
);

create table store_items (
  id uuid primary key,
  store_id uuid not null references stores(id) on delete cascade,
  food_id uuid not null references foods(id),
  item_name varchar(255) not null,
  pack_size varchar(64),
  current_price numeric(10,2) not null,
  currency char(3) not null default 'USD',
  in_stock boolean not null default true,
  observed_at timestamptz not null
);

create table shopping_lists (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  meal_plan_id uuid references meal_plans(id) on delete set null,
  title varchar(255) not null,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now()
);

create table shopping_list_items (
  id uuid primary key,
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  food_id uuid references foods(id),
  item_name varchar(255) not null,
  quantity numeric(10,2),
  unit varchar(32),
  best_store_id uuid references stores(id),
  best_price numeric(10,2),
  checked boolean not null default false
);
```

### 5) Exercises, media, and workout programs
```sql
create table muscle_groups (
  id serial primary key,
  code varchar(64) unique not null,
  label varchar(128) not null
);

create table exercises (
  id uuid primary key,
  code varchar(64) unique not null,
  name varchar(255) not null,
  category varchar(64) not null,
  equipment_type varchar(64),
  primary_muscle_group_id int references muscle_groups(id),
  movement_pattern varchar(64),
  instructions text,
  why_it_helps text,
  safety_notes text,
  created_at timestamptz not null default now()
);

create table exercise_media (
  id uuid primary key,
  exercise_id uuid not null references exercises(id) on delete cascade,
  media_type varchar(32) not null,
  media_url text not null,
  thumbnail_url text,
  duration_seconds int,
  caption text,
  created_at timestamptz not null default now()
);

create table exercise_muscles (
  exercise_id uuid not null references exercises(id) on delete cascade,
  muscle_group_id int not null references muscle_groups(id),
  role varchar(32) not null,
  primary key (exercise_id, muscle_group_id, role)
);

create table training_plans (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  authored_by_user_id uuid references users(id),
  authored_by_type varchar(32) not null,
  title varchar(255) not null,
  goal_focus varchar(64),
  difficulty_level varchar(32),
  start_date date,
  end_date date,
  status varchar(32) not null default 'draft',
  created_at timestamptz not null default now()
);

create table training_plan_weeks (
  id uuid primary key,
  training_plan_id uuid not null references training_plans(id) on delete cascade,
  week_number int not null,
  label varchar(128)
);

create table workouts (
  id uuid primary key,
  training_plan_week_id uuid references training_plan_weeks(id) on delete cascade,
  title varchar(255) not null,
  workout_type varchar(64) not null,
  estimated_duration_minutes int,
  scheduled_day_of_week int,
  notes text
);

create table workout_exercises (
  id uuid primary key,
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  sequence_no int not null,
  target_sets int,
  target_reps_min int,
  target_reps_max int,
  target_seconds int,
  rest_seconds int,
  intensity_type varchar(32),
  intensity_value numeric(10,2),
  cue_notes text
);
```

### 6) Workout execution and progress tracking
```sql
create table workout_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  workout_id uuid references workouts(id) on delete set null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status varchar(32) not null default 'in_progress',
  perceived_effort numeric(4,2),
  calories_burned numeric(10,2),
  source varchar(32) not null default 'mobile'
);

create table workout_session_exercises (
  id uuid primary key,
  workout_session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  sequence_no int not null,
  rest_seconds int,
  completed boolean not null default false,
  notes text
);

create table workout_sets (
  id uuid primary key,
  workout_session_exercise_id uuid not null references workout_session_exercises(id) on delete cascade,
  set_number int not null,
  reps int,
  weight_kg numeric(10,2),
  duration_seconds int,
  distance_m numeric(10,2),
  completed boolean not null default false,
  rest_taken_seconds int,
  logged_at timestamptz not null default now()
);

create table body_metrics (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(6,2),
  body_fat_pct numeric(5,2),
  waist_cm numeric(6,2),
  resting_hr int,
  sleep_hours numeric(4,2),
  source varchar(32)
);
```

### 7) Gamification, streaks, and rewards
```sql
create table badges (
  id uuid primary key,
  code varchar(64) unique not null,
  name varchar(255) not null,
  description text,
  icon_url text,
  rarity varchar(32)
);

create table user_badges (
  user_id uuid not null references users(id) on delete cascade,
  badge_id uuid not null references badges(id),
  awarded_at timestamptz not null,
  award_reason text,
  primary key (user_id, badge_id)
);

create table streaks (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  streak_type varchar(64) not null,
  current_count int not null default 0,
  best_count int not null default 0,
  last_qualified_on date,
  updated_at timestamptz not null default now()
);

create table achievements (
  id uuid primary key,
  code varchar(64) unique not null,
  title varchar(255) not null,
  description text,
  points int not null default 0,
  unlock_rule jsonb not null
);

create table user_achievements (
  user_id uuid not null references users(id) on delete cascade,
  achievement_id uuid not null references achievements(id),
  unlocked_at timestamptz not null,
  primary key (user_id, achievement_id)
);
```

### 8) Gyms, partners, and check-ins
```sql
create table gyms (
  id uuid primary key,
  name varchar(255) not null,
  chain_name varchar(255),
  address_line1 varchar(255),
  city varchar(128),
  state varchar(64),
  postal_code varchar(32),
  country varchar(64),
  latitude numeric(9,6),
  longitude numeric(9,6),
  partner_status varchar(32) not null default 'inactive'
);

create table gym_memberships (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  gym_id uuid not null references gyms(id) on delete cascade,
  membership_type varchar(64),
  start_date date,
  end_date date,
  status varchar(32) not null default 'active'
);

create table gym_checkins (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  gym_id uuid not null references gyms(id) on delete cascade,
  checkin_at timestamptz not null,
  method varchar(32) not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  reward_points int not null default 0
);
```

### 9) Coaches and plan management
```sql
create table coach_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name varchar(255) not null,
  certifications text,
  bio text,
  service_area varchar(255),
  accepts_new_clients boolean not null default true
);

create table coach_clients (
  coach_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  relationship_status varchar(32) not null default 'active',
  started_at timestamptz not null default now(),
  primary key (coach_user_id, client_user_id)
);

create table plan_assignments (
  id uuid primary key,
  training_plan_id uuid references training_plans(id) on delete cascade,
  meal_plan_id uuid references meal_plans(id) on delete cascade,
  assigned_to_user_id uuid not null references users(id) on delete cascade,
  assigned_by_user_id uuid not null references users(id),
  assignment_status varchar(32) not null default 'pending',
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table coach_notes (
  id uuid primary key,
  coach_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  related_session_id uuid references workout_sessions(id) on delete set null,
  note_body text not null,
  visibility varchar(32) not null default 'private',
  created_at timestamptz not null default now()
);
```

### 10) Wearable sync and events
```sql
create table wearable_pairings (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider varchar(64) not null,
  external_user_ref varchar(128),
  watch_device_name varchar(255),
  pairing_status varchar(32) not null default 'active',
  paired_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create table wearable_samples (
  id uuid primary key,
  pairing_id uuid not null references wearable_pairings(id) on delete cascade,
  sample_type varchar(64) not null,
  sampled_at timestamptz not null,
  value_numeric numeric(12,4),
  value_text varchar(255),
  source_payload jsonb
);

create table sync_events (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  device_id uuid references user_devices(id) on delete set null,
  event_type varchar(64) not null,
  event_status varchar(32) not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
```

## High-value indexes
```sql
create index idx_food_logs_user_logged_at on food_logs(user_id, logged_at desc);
create index idx_hydration_logs_user_logged_at on hydration_logs(user_id, logged_at desc);
create index idx_store_items_food_store_observed on store_items(food_id, store_id, observed_at desc);
create index idx_workout_sessions_user_started on workout_sessions(user_id, started_at desc);
create index idx_workout_sets_session_exercise on workout_sets(workout_session_exercise_id, set_number);
create index idx_body_metrics_user_measured on body_metrics(user_id, measured_at desc);
create index idx_gym_checkins_user_checkin on gym_checkins(user_id, checkin_at desc);
create index idx_wearable_samples_pairing_type_time on wearable_samples(pairing_id, sample_type, sampled_at desc);
create index idx_sync_events_user_created on sync_events(user_id, created_at desc);
```

## API surface
Mobile APIs should be versioned, secure, compact, and designed to avoid chatty page assembly. A practical rule for mobile is to return the full data needed to render a screen in one call whenever possible, while still preserving normalization underneath.[cite:51][cite:63][cite:60]

### Authentication
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/me`

### Onboarding and profile
- `PUT /v1/me/profile`
- `PUT /v1/me/health`
- `PUT /v1/me/goals`
- `GET /v1/me/dashboard`

### Nutrition
- `GET /v1/foods/search?q=`
- `POST /v1/food-logs`
- `GET /v1/food-logs?date=`
- `POST /v1/hydration-logs`
- `GET /v1/nutrition/daily-summary?date=`

### Meal planning and shopping
- `POST /v1/meal-plans/generate`
- `GET /v1/meal-plans/:id`
- `POST /v1/shopping-lists/from-meal-plan`
- `GET /v1/shopping-lists/:id`
- `GET /v1/stores/best-prices?item_ids=`

### Training
- `GET /v1/training-plans/current`
- `GET /v1/workouts/:id`
- `POST /v1/workout-sessions/start`
- `POST /v1/workout-sessions/:id/sets`
- `POST /v1/workout-sessions/:id/complete`
- `GET /v1/exercises/:id`

### Check-ins and gamification
- `POST /v1/gyms/:id/checkins`
- `GET /v1/achievements`
- `GET /v1/streaks`
- `GET /v1/rewards/wallet`

### Coach workflows
- `GET /v1/coach/clients`
- `POST /v1/coach/training-plans`
- `POST /v1/coach/meal-plans`
- `POST /v1/coach/assignments`
- `POST /v1/coach/notes`

### Wearables and sync
- `POST /v1/wearables/pair`
- `POST /v1/wearables/samples/batch`
- `GET /v1/wearables/status`
- `POST /v1/sync-events`

## Example API contracts
```json
POST /v1/workout-sessions/start
{
  "workoutId": "uuid",
  "source": "mobile",
  "startedAt": "2026-07-28T12:00:00Z"
}
```

```json
200 OK
{
  "sessionId": "uuid",
  "status": "in_progress",
  "workout": {
    "title": "Upper Body Strength A",
    "estimatedDurationMinutes": 48,
    "exercises": [
      {
        "sessionExerciseId": "uuid",
        "exerciseId": "uuid",
        "name": "Incline Dumbbell Press",
        "targetSets": 4,
        "targetRepsMin": 8,
        "targetRepsMax": 10,
        "restSeconds": 90,
        "videoUrl": "https://cdn.example/video.mp4",
        "whatItWorks": ["upper chest", "front delts", "triceps"]
      }
    ]
  }
}
```

## Suggested screen-to-endpoint mapping
- Home dashboard: `GET /v1/me/dashboard` returns calorie progress, hydration, active plan, today workout, streaks, and latest check-ins in one payload.[cite:63]
- Food search and quick add: `GET /v1/foods/search` plus `POST /v1/food-logs`.
- Workout player: `GET /v1/workouts/:id` then session mutations through `/workout-sessions`.
- Shopping optimizer: `POST /v1/shopping-lists/from-meal-plan` and `GET /v1/stores/best-prices`.
- Watch sync summary: `GET /v1/wearables/status` plus batched sample uploads.[cite:28][cite:61]

## Access control model
The platform should support role-based access control because mobile API guidance recommends strong authentication and access restriction for sensitive endpoints.[cite:51][cite:60]

Recommended roles:
- trainee
- coach
- gym_partner
- admin
- support_ops

Recommended rules:
- Users can read and write only their own logs, plans, and metrics unless explicitly shared.
- Coaches can access only assigned clients.
- Gym partners can validate check-ins only for their own gym entities.
- Admins can manage global catalogs, moderation, and fraud review.

## Data retention and privacy
Health and fitness data is sensitive, so the build should encrypt data in transit with HTTPS and protect sensitive data at rest with encryption and strict access control. Input validation, token-based auth, and rate limiting should be standard API protections from day one.[cite:60][cite:51]

Recommended controls:
- Encrypt credentials, tokens, and sensitive health payloads.
- Use audit logs for coach edits, check-in overrides, and plan assignments.
- Soft delete user-generated plans where recovery matters, hard delete regulated data on account deletion workflows.
- Separate analytics events from transactional health records.

## Eventing and notifications
Use asynchronous events for:
- badge unlocked
- streak updated
- coach assignment created
- workout completed
- wearable sync finished
- gym check-in verified

A simple first implementation can use a job queue and outbox pattern, then evolve to a message bus if scale justifies it. Mobile guidance supports push notifications and selective real-time patterns instead of constant polling.[cite:51]

## Engineering roadmap
### Phase 1: Foundation MVP
- Auth, onboarding, profile, goals.
- Food and hydration logging.
- Exercise catalog and training plans.
- Workout session tracking with set logging and rest timer.
- Basic dashboard and streak engine.

### Phase 2: Personalization
- AI meal plan generation.
- Grocery list generation.
- Store price comparison.
- Coach-authored plans and assignment flows.
- Smartwatch pairing and basic sync.

### Phase 3: Ecosystem
- Gym partner check-ins.
- Rewards marketplace and unlockables.
- Advanced wearable ingestion.
- Rich coach portal analytics.
- Fraud detection for check-ins and rewards.

## Delivery checklist
- OpenAPI 3 specification for all endpoints.[cite:57]
- Migration files for all tables.
- Seed data for foods, exercises, badges, and achievements.
- RBAC policy matrix.
- Postman or Bruno collection.
- Event catalog and webhook contract.
- Analytics tracking plan.
- QA test matrix for mobile, coach portal, and smartwatch sync.
