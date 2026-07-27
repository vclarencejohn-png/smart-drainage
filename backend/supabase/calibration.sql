-- Run this once in the Supabase SQL Editor before deploying calibration support.
-- 21 cm is the fixed JSN-SR04T full point / blind-zone boundary.

alter table public.drainage_units
  add column if not exists empty_distance double precision,
  add column if not exists full_distance double precision,
  add column if not exists calibration_requested_at timestamptz,
  add column if not exists calibrated_at timestamptz;

update public.drainage_units
set full_distance = 21
where full_distance is null;

alter table public.drainage_units
  alter column full_distance set default 21,
  alter column full_distance set not null;

alter table public.drainage_units
  drop constraint if exists drainage_units_full_distance_check;

alter table public.drainage_units
  add constraint drainage_units_full_distance_check check (full_distance = 21);
