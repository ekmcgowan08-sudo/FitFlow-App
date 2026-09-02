create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
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
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_type varchar(32) not null,
  platform varchar(32) not null,
  app_version varchar(32),
  push_token text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
