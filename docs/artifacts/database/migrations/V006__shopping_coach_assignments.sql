create table stores (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  chain_code varchar(64),
  city varchar(128),
  state varchar(64),
  country varchar(64),
  latitude numeric(9,6),
  longitude numeric(9,6)
);

create table store_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  food_id uuid not null references foods(id),
  item_name varchar(255) not null,
  pack_size varchar(64),
  current_price numeric(10,2) not null,
  currency char(3) not null default 'USD',
  in_stock boolean not null default true,
  observed_at timestamptz not null
);

create table meal_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references users(id) on delete set null,
  title varchar(255) not null,
  meal_type varchar(32),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table meal_template_items (
  id uuid primary key default gen_random_uuid(),
  meal_template_id uuid not null references meal_templates(id) on delete cascade,
  food_id uuid not null references foods(id),
  quantity numeric(10,2) not null,
  unit varchar(32),
  sequence_no int not null default 1
);

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  generated_by varchar(32) not null,
  title varchar(255) not null,
  start_date date not null,
  end_date date not null,
  status varchar(32) not null default 'draft',
  created_at timestamptz not null default now()
);

create table meal_plan_days (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  plan_date date not null,
  calorie_target numeric(10,2),
  protein_target_g numeric(10,2),
  carbs_target_g numeric(10,2),
  fat_target_g numeric(10,2)
);

create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  meal_plan_day_id uuid not null references meal_plan_days(id) on delete cascade,
  meal_type varchar(32) not null,
  meal_template_id uuid references meal_templates(id),
  notes text,
  sequence_no int not null default 1
);

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  meal_plan_id uuid references meal_plans(id) on delete set null,
  title varchar(255) not null,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now()
);

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  food_id uuid references foods(id),
  item_name varchar(255) not null,
  quantity numeric(10,2),
  unit varchar(32),
  best_store_id uuid references stores(id),
  best_price numeric(10,2),
  checked boolean not null default false
);

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
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid references training_plans(id) on delete cascade,
  meal_plan_id uuid references meal_plans(id) on delete cascade,
  assigned_to_user_id uuid not null references users(id) on delete cascade,
  assigned_by_user_id uuid not null references users(id),
  assignment_status varchar(32) not null default 'pending',
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  related_session_id uuid references workout_sessions(id) on delete set null,
  note_body text not null,
  visibility varchar(32) not null default 'private',
  created_at timestamptz not null default now()
);

create index idx_store_items_food_store_observed on store_items(food_id, store_id, observed_at desc);
create index idx_meal_plans_user_dates on meal_plans(user_id, start_date, end_date);
create index idx_shopping_lists_user_status on shopping_lists(user_id, status);
create index idx_coach_clients_client on coach_clients(client_user_id);
create index idx_plan_assignments_assigned_to_status on plan_assignments(assigned_to_user_id, assignment_status);
