# FitFlow Suite Build Pack v2

## Scope additions
This revision extends the platform with year-round workout calendar planning, trainee uploads for exercise-form videos, body-transformation photos, meal photos, AI requests for home-gym setup images, a trainer control screen with portfolio and individual charts, billing and invoicing workflows, a gym check-in center, and a formal ER diagram plus starter SQL migration set. These additions fit current trainer software patterns that combine programming, client management, progress tracking, and billing in one dashboard.[cite:70][cite:72][cite:78]

Media upload is also a practical extension because fitness apps already support workout-related photos and videos for progress logging, while coaching and video-analysis tools demonstrate demand for visual feedback and form review workflows.[cite:76][cite:71][cite:73]

## Added product modules
- Annual training calendar and periodization planner.
- Media review center for exercise videos, physique photos, and meal photos.
- AI-guided home-gym assessment requests.
- Trainer operations dashboard with client analytics.
- Billing, invoices, payment reminders, and payment ledger.
- Gym check-in center in the trainee experience.

## New entities and schema additions

### Calendar planning
```sql
create table training_calendar_cycles (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  title varchar(255) not null,
  cycle_year int not null,
  goal_focus varchar(128),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table training_calendar_blocks (
  id uuid primary key,
  cycle_id uuid not null references training_calendar_cycles(id) on delete cascade,
  block_type varchar(64) not null,
  title varchar(255) not null,
  start_date date not null,
  end_date date not null,
  intensity_focus varchar(64),
  notes text
);

create table calendar_workout_events (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  workout_id uuid references workouts(id) on delete set null,
  event_date date not null,
  scheduled_start_time time,
  duration_minutes int,
  status varchar(32) not null default 'planned',
  source varchar(32) not null default 'trainer',
  notes text
);
```

### Media uploads and review workflows
```sql
create table media_assets (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  media_kind varchar(32) not null,
  storage_url text not null,
  thumbnail_url text,
  mime_type varchar(128) not null,
  file_size_bytes bigint,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create table exercise_form_submissions (
  id uuid primary key,
  trainee_user_id uuid not null references users(id) on delete cascade,
  trainer_user_id uuid references users(id) on delete set null,
  workout_session_id uuid references workout_sessions(id) on delete set null,
  exercise_id uuid references exercises(id) on delete set null,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  confidence_rating int,
  trainee_notes text,
  status varchar(32) not null default 'submitted',
  submitted_at timestamptz not null default now()
);

create table form_feedback (
  id uuid primary key,
  submission_id uuid not null references exercise_form_submissions(id) on delete cascade,
  reviewer_type varchar(32) not null,
  reviewer_user_id uuid references users(id) on delete set null,
  feedback_text text not null,
  confidence_score numeric(5,2),
  recommended_cues jsonb,
  created_at timestamptz not null default now()
);

create table body_progress_entries (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  angle_label varchar(64),
  body_weight_kg numeric(6,2),
  body_fat_pct numeric(5,2),
  notes text,
  logged_at timestamptz not null default now()
);

create table meal_photo_entries (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  related_food_log_id uuid references food_logs(id) on delete set null,
  meal_label varchar(64),
  notes text,
  logged_at timestamptz not null default now()
);

create table ai_equipment_requests (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  requested_by_type varchar(32) not null,
  request_reason text not null,
  status varchar(32) not null default 'requested',
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table home_gym_profiles (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  equipment_summary text,
  space_type varchar(64),
  notes text,
  updated_at timestamptz not null default now()
);

create table home_gym_profile_assets (
  home_gym_profile_id uuid not null references home_gym_profiles(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  primary key (home_gym_profile_id, media_asset_id)
);
```

### Trainer control center and financial operations
```sql
create table trainer_dashboards (
  trainer_user_id uuid primary key references users(id) on delete cascade,
  default_view varchar(32) not null default 'portfolio',
  created_at timestamptz not null default now()
);

create table trainer_client_metrics_snapshots (
  id uuid primary key,
  trainer_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  snapshot_date date not null,
  adherence_pct numeric(5,2),
  workouts_completed int,
  calories_logged int,
  avg_sleep_hours numeric(4,2),
  weight_change_kg numeric(6,2),
  revenue_mtd numeric(10,2)
);

create table billing_accounts (
  id uuid primary key,
  trainer_user_id uuid not null references users(id) on delete cascade,
  provider varchar(64) not null,
  provider_account_ref varchar(128),
  currency char(3) not null default 'USD',
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now()
);

create table trainer_service_plans (
  id uuid primary key,
  trainer_user_id uuid not null references users(id) on delete cascade,
  plan_name varchar(255) not null,
  billing_frequency varchar(32) not null,
  amount numeric(10,2) not null,
  session_limit int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table client_subscriptions (
  id uuid primary key,
  trainer_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  service_plan_id uuid references trainer_service_plans(id) on delete set null,
  start_date date not null,
  next_invoice_date date,
  status varchar(32) not null default 'active'
);

create table invoices (
  id uuid primary key,
  trainer_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  subscription_id uuid references client_subscriptions(id) on delete set null,
  invoice_number varchar(64) unique not null,
  issue_date date not null,
  due_date date not null,
  subtotal numeric(10,2) not null,
  tax_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  status varchar(32) not null default 'draft',
  notes text,
  created_at timestamptz not null default now()
);

create table invoice_line_items (
  id uuid primary key,
  invoice_id uuid not null references invoices(id) on delete cascade,
  description varchar(255) not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null,
  line_total numeric(10,2) not null
);

create table payment_methods (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider varchar(64) not null,
  provider_payment_ref varchar(128),
  method_type varchar(64) not null,
  last4 varchar(4),
  exp_month int,
  exp_year int,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key,
  invoice_id uuid references invoices(id) on delete set null,
  payer_user_id uuid not null references users(id) on delete cascade,
  payee_user_id uuid not null references users(id) on delete cascade,
  payment_method_id uuid references payment_methods(id) on delete set null,
  amount numeric(10,2) not null,
  currency char(3) not null default 'USD',
  status varchar(32) not null,
  processed_at timestamptz,
  provider_payment_intent_ref varchar(128),
  created_at timestamptz not null default now()
);

create table billing_reminders (
  id uuid primary key,
  invoice_id uuid not null references invoices(id) on delete cascade,
  reminder_stage varchar(32) not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status varchar(32) not null default 'scheduled'
);
```

### Gym check-in center additions
```sql
create table gym_checkin_centers (
  id uuid primary key,
  gym_id uuid not null references gyms(id) on delete cascade,
  center_name varchar(255) not null,
  qr_code_value varchar(255),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table gym_checkin_rules (
  id uuid primary key,
  gym_id uuid not null references gyms(id) on delete cascade,
  min_minutes_between_checkins int not null default 60,
  geo_radius_meters int,
  require_qr boolean not null default false,
  reward_points int not null default 0,
  active boolean not null default true
);
```

## Trainer screen requirements
The trainer control screen should aggregate individual client data and portfolio-wide metrics because trainer platforms increasingly combine coaching delivery, client management, and payments in one operational workspace.[cite:70][cite:72][cite:78]

Required trainer screens:
- Client portfolio overview with adherence, plan status, risk flags, and revenue.
- Individual trainee screen with charts for weight trend, workout adherence, food logging consistency, sleep trend, and check-in frequency.
- Media review queue for form videos, transformation photos, meal photos, and home gym requests.
- Billing dashboard with draft invoices, sent invoices, overdue balances, reminder schedule, and payment status.
- Cash summary with MTD revenue, collected revenue, outstanding invoices, churned clients, and active subscriptions.

Suggested charts:
- Line charts: weight, sleep, revenue over time.
- Bar charts: workouts completed by week, meals logged by week, check-ins by month.
- Donut charts: invoice status mix, client adherence tiers.
- Portfolio table: one row per client with filters and drill-down.

## Trainee app additions
Required new trainee screens:
- Annual calendar screen showing mesocycles, deload weeks, scheduled workouts, and gym sessions.
- Gym check-in center screen with nearby gyms, QR check-in, streak points, and rewards status.
- Media uploads screen with tabs for form videos, body progress, meal photos, and home-gym images.
- Review feedback screen showing AI and human feedback side by side.

## ER diagram
The ERD should be centered on a shared `users` entity and then grouped into profile, nutrition, workout, media, billing, and gym domains. Fitness ERD references commonly separate workout, exercise, and set detail into linked entities, which supports the same modeling direction used here.[cite:65][cite:59][cite:77]

The Mermaid ER diagram is in the companion file and includes the newly added calendar, media review, billing, and trainer operations entities.[cite:65][cite:77]

## Migration strategy
Start the SQL migration set with ordered migrations so the database can be applied safely from foundational identity tables outward to feature domains. This follows practical relational build sequencing where parent tables and shared dimensions are created before dependent activity tables.[cite:69][cite:77]

Suggested migration order:
1. users, roles, user_roles, user_devices.
2. profiles, conditions, preferences, goals.
3. foods, meal templates, logs, hydration.
4. stores, prices, shopping lists.
5. muscle_groups, exercises, media, plans, workouts.
6. sessions, sets, body metrics.
7. badges, achievements, streaks.
8. gyms, memberships, check-ins.
9. coaches, assignments, notes.
10. calendar, media review, home gym, trainer finance.

## Build notes
- Store uploaded media in object storage and keep only metadata in PostgreSQL.
- Queue AI review jobs after upload so the client app stays responsive.
- Use signed upload URLs for large video uploads.
- Generate dashboard aggregates asynchronously for trainer portfolio screens.
- Treat payment provider tokens as external references, not raw card data.[cite:60][cite:72]
