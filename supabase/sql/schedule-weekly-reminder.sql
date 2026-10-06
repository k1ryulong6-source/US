-- Run once in the SQL Editor of the hosted project, AFTER deploying the
-- weekly-reminder Edge Function. Only needed if you want the optional
-- weekly reminder. Replace the two placeholders first.
--
-- Requires the pg_cron and pg_net extensions
-- (Database → Extensions, or the two lines below).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('THE-SAME-CRON_SECRET-YOU-SET-ON-THE-FUNCTION', 'weekly_reminder_secret');

-- Every hour at :07; the function itself decides who is due (at most once a week each).
select cron.schedule(
  'weekly-reminder',
  '7 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/weekly-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_reminder_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
