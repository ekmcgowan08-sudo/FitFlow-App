create table billing_accounts (
  id uuid primary key default gen_random_uuid(),
  trainer_user_id uuid not null references users(id) on delete cascade,
  provider varchar(64) not null,
  provider_account_ref varchar(128),
  currency char(3) not null default 'USD',
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now()
);

create table trainer_service_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_user_id uuid not null references users(id) on delete cascade,
  plan_name varchar(255) not null,
  billing_frequency varchar(32) not null,
  amount numeric(10,2) not null,
  session_limit int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  trainer_user_id uuid not null references users(id) on delete cascade,
  client_user_id uuid not null references users(id) on delete cascade,
  service_plan_id uuid references trainer_service_plans(id) on delete set null,
  start_date date not null,
  next_invoice_date date,
  status varchar(32) not null default 'active'
);

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description varchar(255) not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null,
  line_total numeric(10,2) not null
);

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
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

alter table payments
  add column payment_method_id uuid references payment_methods(id) on delete set null,
  add column provider_payment_intent_ref varchar(128);

alter table invoices
  add column subscription_id uuid references client_subscriptions(id) on delete set null,
  add column notes text;

create index idx_billing_accounts_trainer on billing_accounts(trainer_user_id, status);
create index idx_service_plans_trainer_active on trainer_service_plans(trainer_user_id, active);
create index idx_client_subscriptions_trainer_client on client_subscriptions(trainer_user_id, client_user_id, status);
create index idx_invoices_trainer_due_date on invoices(trainer_user_id, due_date, status);
create index idx_payments_invoice_status on payments(invoice_id, status);
