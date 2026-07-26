-- Run this in the Supabase SQL editor before starting the API.
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username varchar(10) not null unique check (username ~ '^[A-Za-z0-9_-]{1,10}$'),
  password_hash text not null,
  role text not null check (role in ('admin', 'user')) default 'user',
  created_at timestamptz not null default now()
);

create table if not exists public.drainage_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  device_id text not null unique,
  location text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.readings (
  id bigint generated always as identity primary key,
  unit_id text not null references public.drainage_units(device_id) on update cascade,
  debris_level double precision not null check (debris_level between 0 and 100),
  distance double precision not null check (distance >= 0),
  overflow boolean not null default false,
  led_status text not null check (led_status in ('GREEN', 'YELLOW', 'RED')),
  battery integer not null check (battery between 0 and 100),
  timestamp timestamptz not null default now()
);

create index if not exists readings_unit_timestamp_idx on public.readings (unit_id, timestamp desc);

-- The backend uses the service-role key. Keep direct browser access closed.
alter table public.users enable row level security;
alter table public.drainage_units enable row level security;
alter table public.readings enable row level security;

-- Create the first admin after generating a bcrypt hash, for example:
-- node -e "console.log(require('bcryptjs').hashSync('adminpass', 12))"
-- insert into public.users (username, password_hash, role) values ('admin', '$2b$12$...', 'admin');
