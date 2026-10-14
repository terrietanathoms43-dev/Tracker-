-- Organization-scoped team assignments, requests, and audit trail.
create table if not exists public.tw_activity (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.tw_organizations(id) on delete cascade,
 actor_id uuid references auth.users(id),
 entity_type text not null,
 entity_id uuid not null,
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists tw_activity_org_created_idx on public.tw_activity(organization_id,created_at desc);
alter table public.tw_activity enable row level security;
create policy tw_activity_select on public.tw_activity for select to authenticated using(public.tw_is_member(organization_id));
revoke insert,update,delete on public.tw_activity from anon,authenticated;
create or replace function public.tw_audit_change() returns trigger language plpgsql security definer set search_path=''
as $$
declare org uuid; ent uuid; actor uuid;
begin
 org:=case when TG_OP='DELETE' then OLD.organization_id else NEW.organization_id end;
 ent:=case when TG_OP='DELETE' then OLD.id else NEW.id end;
 actor:=auth.uid();
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action,details)
 values(org,actor,TG_TABLE_NAME,ent,lower(TG_OP),case when TG_OP='UPDATE' then jsonb_build_object('status',NEW.status,'previous_status',OLD.status) else '{}'::jsonb end);
 return coalesce(NEW,OLD);
end; $$;
drop trigger if exists tw_tasks_audit on public.tw_tasks;
create trigger tw_tasks_audit after insert or update or delete on public.tw_tasks for each row execute function public.tw_audit_change();
create or replace function public.tw_assign_team_member(target_team uuid,target_user uuid,target_role text default 'member')
returns void language plpgsql security definer set search_path=''
as $$
declare org uuid;
begin
 select organization_id into org from public.tw_teams where id=target_team;
 if org is null or not public.tw_can_manage(org) then raise exception 'Permission denied'; end if;
 if target_role not in ('leader','member') then raise exception 'Invalid team role'; end if;
 if not exists(select 1 from public.tw_memberships where organization_id=org and user_id=target_user) then raise exception 'User is not an organization member'; end if;
 insert into public.tw_team_members(team_id,user_id,role) values(target_team,target_user,target_role)
 on conflict(team_id,user_id) do update set role=excluded.role;
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action,details)
 values(org,auth.uid(),'team_member',target_team,'assigned',jsonb_build_object('user_id',target_user,'role',target_role));
end; $$;
revoke all on function public.tw_assign_team_member(uuid,uuid,text) from public;
grant execute on function public.tw_assign_team_member(uuid,uuid,text) to authenticated;
-- Requests are submitted by organization members, decisions by managers only.
create or replace function public.tw_decide_request(request_id uuid,new_decision text,reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare r public.tw_requests%rowtype;
begin
 select * into r from public.tw_requests where id=request_id for update;
 if not found or not public.tw_can_manage(r.organization_id) then raise exception 'Permission denied'; end if;
 if r.decision not in ('submitted','deferred') then raise exception 'Request already finalized'; end if;
 if new_decision not in ('approved','deferred','rejected') then raise exception 'Invalid decision'; end if;
 if nullif(trim(coalesce(reason,'')),'') is null then raise exception 'A reason is required'; end if;
 update public.tw_requests set decision=new_decision,decision_reason=trim(reason),decided_by=auth.uid(),decided_at=now() where id=request_id;
 insert into public.tw_activity(organization_id,actor_id,entity_type,entity_id,action,details)
 values(r.organization_id,auth.uid(),'request',request_id,'decision',jsonb_build_object('decision',new_decision));
end; $$;
revoke all on function public.tw_decide_request(uuid,text,text) from public;
grant execute on function public.tw_decide_request(uuid,text,text) to authenticated;
revoke update,delete on public.tw_requests from authenticated;
revoke insert,update,delete on public.tw_team_members from authenticated;
