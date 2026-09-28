-- Run as database administrator. All fixtures and role changes are rolled back.
begin;
insert into public.ca_mail_messages(id,thread_id,subject,sender,sent_at,direction,body)
values('000000000000aa01','000000000000aa01','Test important','test@example.invalid',now(),'reçu','Fixture'),
('000000000000aa02','000000000000aa02','Test information','test@example.invalid',now(),'reçu','Fixture');
set local role service_role;
update public.ca_mail_messages set analysis='{"topic":"Réunions et CA","priority":"Importante","actions":["À débattre"],"summary":"Point à discuter","discussion":"Choisir la suite","uncertainties":"Date à confirmer","deadline":null}' where id='000000000000aa01';
update public.ca_mail_messages set analysis='{"topic":"Autre","priority":"Courante","actions":["Pour information"],"summary":"Notification"}' where id='000000000000aa02';
reset role;
do $$ begin
 if (select count(*) from public.ca_news_items where dedupe_key='gmail:000000000000aa01')<>1 then raise exception 'Missing automatic update'; end if;
 if exists(select 1 from public.ca_news_items where dedupe_key='gmail:000000000000aa02') then raise exception 'Noise added to news'; end if;
 if has_table_privilege('authenticated','public.ca_news_watch','update') or has_table_privilege('anon','public.ca_news_watch','select') then raise exception 'Watch state exposed for writing'; end if;
 if has_table_privilege('anon','public.ca_news_items','select') then raise exception 'Anonymous access'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select user_id::text from public.ca_members where role='coordinateur' limit 1),true);
set local role authenticated;
do $$ declare n integer; begin
 if not exists(select 1 from public.ca_news_watch where id='primary') then raise exception 'Coordinator cannot read watch state'; end if;
 update public.ca_news_items set progress='Human note' where dedupe_key='gmail:000000000000aa01';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Coordinator cannot edit'; end if;
end $$;
reset role;
update public.ca_mail_messages set analysis=null where id='000000000000aa01';
update public.ca_mail_messages set analysis='{"topic":"Réunions et CA","priority":"Urgente","actions":["À débattre"],"summary":"Retried"}' where id='000000000000aa01';
do $$ begin
 if (select progress from public.ca_news_items where dedupe_key='gmail:000000000000aa01')<>'Human note' then raise exception 'Human note overwritten'; end if;
 if (select count(*) from public.ca_news_items where dedupe_key='gmail:000000000000aa01')<>1 then raise exception 'Duplicate update'; end if;
end $$;
update public.ca_members set role='membre' where user_id=current_setting('request.jwt.claim.sub')::uuid;
set local role authenticated;
do $$ declare n integer; begin
 if exists(select 1 from public.ca_news_watch) then raise exception 'Member reads watch state'; end if;
 if exists(select 1 from public.ca_news_items) then raise exception 'Member reads private news'; end if;
 update public.ca_news_items set progress='Unauthorized';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Member writes private news'; end if;
 begin
  insert into public.ca_news_items(dedupe_key,kind,topic,title,body) values('unauthorized','veille','Test','Test','Test');
  raise exception 'Member can insert';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.ca_mail_messages) then raise exception 'Member reads private mail'; end if;
end $$;
reset role;
rollback;
select 'PASS: private access, automatic important updates, noise exclusion, retry deduplication and human notes preserved' as result;
