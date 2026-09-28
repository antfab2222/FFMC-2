begin;
create or replace function public.dispatch_mail_job(job_action text) returns bigint
language plpgsql security invoker set search_path='' as $$
declare job_token text; request_id bigint;
begin
 if job_action not in ('sync','analyze') then raise exception 'Invalid mail job'; end if;
 delete from public.ca_mail_job_tokens where expires_at<now();
 if not exists(select 1 from public.ca_gmail_connections c join public.ca_members m on m.user_id=c.connected_by and m.role='coordinateur' where c.id='primary' and c.auto_enabled and c.lock_until<now()) then return null; end if;
 if job_action='analyze' and (
  not exists(select 1 from public.ca_mail_messages where analysis is null and reviewed_at is null)
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
-- Keep each incoming analysis as a dated update; never overwrite human follow-up notes.
create function public.record_mail_news() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.analysis is null or old.analysis is not null then return new; end if;
 if new.analysis->>'priority' not in ('Importante','Urgente')
    and not coalesce((new.analysis->'actions') ?| array['À débattre','À répondre','À partager'],false) then return new; end if;
 insert into public.ca_news_items(dedupe_key,kind,topic,title,body,next_step,status,source_refs,published_at)
 values('gmail:'||new.id,'suivi',coalesce(new.analysis->>'topic','Autre'),left(new.subject,250),
  'Analyse automatique Gemini — à relire.'||E'\n\n'||coalesce(new.analysis->>'summary','')||
  case when coalesce(new.analysis->>'uncertainties','')<>'' then E'\n\nPoints à vérifier : '||(new.analysis->>'uncertainties') else '' end,
  coalesce(nullif(new.analysis->>'discussion',''),new.analysis->>'reason','')||
  case when nullif(new.analysis->>'deadline','') is not null then E'\nÉchéance extraite du mail, à confirmer : '||(new.analysis->>'deadline') else '' end,
  case when (new.analysis->'actions') ? 'À débattre' then 'À discuter' else 'À suivre' end,
  jsonb_build_array(jsonb_build_object('label',new.subject,'url','https://mail.google.com/mail/u/?authuser=coordinateur.ffmc06%40gmail.com#all/'||new.thread_id,'date',to_char(new.sent_at at time zone 'Europe/Paris','YYYY-MM-DD'))),new.sent_at)
 on conflict(dedupe_key) do nothing;
 return new;
end $$;
revoke all on function public.record_mail_news() from public,anon,authenticated;
create trigger ca_mail_analysis_news after update of analysis on public.ca_mail_messages
 for each row when (old.analysis is null and new.analysis is not null)
 execute function public.record_mail_news();
commit;
