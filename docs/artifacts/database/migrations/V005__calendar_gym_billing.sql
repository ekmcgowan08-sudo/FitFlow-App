create table training_calendar_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title varchar(255) not null,
  cycle_year int not null,
  goal_focus varchar(128),
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table training_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references training_calendar_cycles(id) on delete cascade,
  block_type varchar(64) not null,
  title varchar(255) not null,
  start_date date not null,
  end_date date not null,
  intensity_focus varchar(64),
  notes text
);

create table calendar_workout_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  workout_id uuid references workouts(id) on delete set null,
  event_date date not null,
  scheduled_start_time time,
  duration_minutes int,
  status varchar(32) not null default 'planned',
  source varchar(32) not null default 'trainer',
  notes text
);

create table gyms (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  chain_name varchar(255),
  city varchar(128),
  state varchar(64),
  latitude numeric(9,6),
  longitude numeric(9,6),
  partner_status varchar(32) not null default 'inactive'
);

create table gym_checkin_centers (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references gyms(id) on delete cascade,
  center_name varchar(255) not null,
  qr_code_value varchar(255),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  trainer_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  invoice_number varchar(64) unique not null,
  issue_date date not null,
  due_date date not null,
  subtotal numeric(10,2) not null,
  tax_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,
  status varchar(32) not null default 'draft',
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete set null,
  payer_user_id uuid not null references users(id) on delete cascade,
  payee_user_id uuid not null references users(id) on delete cascade,
  amount numeric(10,2) not null,
  currency char(3) not null default 'USD',
  status varchar(32) not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table billing_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  reminder_stage varchar(32) not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status varchar(32) not null default 'scheduled'
);
