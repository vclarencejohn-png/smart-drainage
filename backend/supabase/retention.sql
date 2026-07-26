-- Keep sensor readings for seven days, then remove them automatically.
-- Run this once in the Supabase SQL Editor as the postgres role.
-- The job runs daily at 00:15 UTC (08:15 Philippine time).

create extension if not exists pg_cron;

-- Re-running this file safely replaces this project's existing retention job.
select cron.unschedule(jobid)
from cron.job
where jobname = 'delete-expired-drainage-readings';

select cron.schedule(
  'delete-expired-drainage-readings',
  '15 0 * * *',
  $$
    delete from public.readings
    where timestamp < now() - interval '7 days';
  $$
);

-- Optional verification: this should return one scheduled job.
select jobid, jobname, schedule, command
from cron.job
where jobname = 'delete-expired-drainage-readings';
