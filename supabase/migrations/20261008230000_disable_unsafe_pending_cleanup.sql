-- The previous two-minute cleanup job can remove valid users when profile state
-- and auth metadata are temporarily out of sync. Keep it disabled until a
-- reviewed, non-destructive retention policy is deployed.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-expired-pending-accounts') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-expired-pending-accounts';
  end if;
end
$$;
