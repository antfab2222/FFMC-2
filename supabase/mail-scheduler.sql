begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
alter table public.ca_gmail_connections
 add column auto_enabled boolean not null default false,
 add column ai_pause_until timestamptz,
 add column ai_error text,
 add column sync_error text,
 add column auto_last_run timestamptz;
create table public.ca_mail_job_tokens (
 token_hash text primary key,
 action text not null check(action in ('sync','analyze')),
 expires_at timestamptz not null
);
alter table public.ca_mail_job_tokens enable row level security;
revoke all on public.ca_mail_job_tokens from public,anon,authenticated;
grant all on public.ca_mail_job_tokens to service_role;
-- Invoker only: solely the database administrator/cron owner can dispatch jobs.
create function public.dispatch_mail_job(job_action text) returns bigint
language plpgsql security invoker set search_path='' as $$
declare job_token text; request_id bigint;
begin
 if job_action not in ('sync','analyze') then raise exception 'Invalid mail job'; end if;
 delete from public.ca_mail_job_tokens where expires_at<now();
 if not exists(select 1 from public.ca_gmail_connections c join public.ca_members m on m.user_id=c.connected_by and m.role='coordinateur' where c.id='primary' and c.auto_enabled and c.lock_until<now()) then return null; end if;
 if job_action='analyze' and (
  not exists(select 1 from public.ca_mail_messages where analysis is null)
  or coalesce((select attempts from public.ca_mail_ai_usage where day=(now() at time zone 'UTC')::date),0)>=20
  or exists(select 1 from public.ca_gmail_connections where id='primary' and ai_pause_until>now())
 ) then return null; end if;
 job_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.ca_mail_job_tokens values(encode(extensions.digest(job_token,'sha256'),'hex'),job_action,now()+interval '5 minutes');
 select net.http_post(
  url:='https://hojiveehwtazeqiymnwg.supabase.co/functions/v1/mail-assistant',
  headers:=jsonb_build_object('Content-Type','application/json','x-mail-job-token',job_token),
  body:=jsonb_build_object('action',job_action),timeout_milliseconds:=140000
 ) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_mail_job(text) from public,anon,authenticated,service_role;
select cron.schedule('ffmc-mail-import','*/5 * * * *',$$select public.dispatch_mail_job('sync');$$);
select cron.schedule('ffmc-mail-analysis','2-59/5 * * * *',$$select public.dispatch_mail_job('analyze');$$);
-- No credentials or message contents in job history; retain one week for these jobs.
select cron.schedule('ffmc-mail-job-history','17 3 * * *',$$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname in ('ffmc-mail-import','ffmc-mail-analysis','ffmc-mail-job-history')) and end_time<now()-interval '7 days';$$);
commit;
