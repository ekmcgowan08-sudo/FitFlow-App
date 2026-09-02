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
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_type varchar(64) not null,
  target_value numeric(10,2),
  target_unit varchar(32),
  start_date date not null,
  target_date date,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now()
);
