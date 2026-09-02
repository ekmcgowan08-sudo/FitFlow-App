create table badges (
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  streak_type varchar(64) not null,
  current_count int not null default 0,
  best_count int not null default 0,
  last_qualified_on date,
  updated_at timestamptz not null default now()
);

create table achievements (
  id uuid primary key default gen_random_uuid(),
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

create table form_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references exercise_form_submissions(id) on delete cascade,
  reviewer_type varchar(32) not null,
  reviewer_user_id uuid references users(id) on delete set null,
  feedback_text text not null,
  confidence_score numeric(5,2),
  recommended_cues jsonb,
  created_at timestamptz not null default now()
);

create table ai_equipment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  requested_by_type varchar(32) not null,
  request_reason text not null,
  status varchar(32) not null default 'requested',
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table home_gym_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
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

create index idx_streaks_user_type on streaks(user_id, streak_type);
create index idx_form_feedback_submission on form_feedback(submission_id, created_at desc);
create index idx_ai_equipment_requests_user_status on ai_equipment_requests(user_id, status);
