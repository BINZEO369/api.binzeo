create extension if not exists pg_cron with schema extensions;
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-expired-pending-accounts') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-expired-pending-accounts';
  end if;
  perform cron.schedule(
    'cleanup-expired-pending-accounts',
    '*/2 * * * *',
    'select public.cleanup_expired_pending_accounts();'
  );
end
$do$;
