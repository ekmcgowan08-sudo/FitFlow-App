create table trainer_dashboards (
  trainer_user_id uuid primary key references users(id) on delete cascade,
  default_view varchar(32) not null default 'portfolio',
  created_at timestamptz not null default now()
);

create table trainer_client_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
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

create table wearable_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider varchar(64) not null,
  external_user_ref varchar(128),
  watch_device_name varchar(255),
  pairing_status varchar(32) not null default 'active',
  paired_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create table wearable_samples (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references wearable_pairings(id) on delete cascade,
  sample_type varchar(64) not null,
  sampled_at timestamptz not null,
  value_numeric numeric(12,4),
  value_text varchar(255),
  source_payload jsonb
);

create table sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_id uuid references user_devices(id) on delete set null,
  event_type varchar(64) not null,
  event_status varchar(32) not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create materialized view trainer_portfolio_daily_mv as
select
  cc.coach_user_id as trainer_user_id,
  current_date as snapshot_date,
  count(*) as active_clients,
  sum(case when cc.relationship_status = 'active' then 1 else 0 end) as active_relationships
from coach_clients cc
group by cc.coach_user_id;

create index idx_trainer_client_metrics_snapshot on trainer_client_metrics_snapshots(trainer_user_id, snapshot_date desc);
create index idx_wearable_pairings_user_status on wearable_pairings(user_id, pairing_status);
create index idx_wearable_samples_pairing_type_time on wearable_samples(pairing_id, sample_type, sampled_at desc);
create index idx_sync_events_user_created on sync_events(user_id, created_at desc);
