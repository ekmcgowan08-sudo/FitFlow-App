create table foods (
  id uuid primary key default gen_random_uuid(),
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
  barcode varchar(64),
  created_at timestamptz not null default now()
);

create table food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  logged_at timestamptz not null,
  meal_type varchar(32),
  source varchar(32) not null,
  note text,
  created_at timestamptz not null default now()
);

create table food_log_items (
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  logged_at timestamptz not null,
  volume_ml numeric(10,2) not null,
  beverage_type varchar(64) not null,
  created_at timestamptz not null default now()
);
