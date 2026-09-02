create table muscle_groups (
  id serial primary key,
  code varchar(64) unique not null,
  label varchar(128) not null
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) unique not null,
  name varchar(255) not null,
  category varchar(64) not null,
  equipment_type varchar(64),
  primary_muscle_group_id int references muscle_groups(id),
  instructions text,
  why_it_helps text,
  safety_notes text,
  created_at timestamptz not null default now()
);

create table training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  authored_by_user_id uuid references users(id),
  authored_by_type varchar(32) not null,
  title varchar(255) not null,
  goal_focus varchar(64),
  difficulty_level varchar(32),
  status varchar(32) not null default 'draft',
  created_at timestamptz not null default now()
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  title varchar(255) not null,
  workout_type varchar(64) not null,
  estimated_duration_minutes int,
  notes text
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  workout_id uuid references workouts(id) on delete set null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status varchar(32) not null default 'in_progress',
  source varchar(32) not null default 'mobile'
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
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

create table body_progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  angle_label varchar(64),
  notes text,
  logged_at timestamptz not null default now()
);

create table meal_photo_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  meal_label varchar(64),
  notes text,
  logged_at timestamptz not null default now()
);
