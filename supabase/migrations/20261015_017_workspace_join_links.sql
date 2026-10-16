-- Optional self-service workspace invitations. Independent of email-targeted invites.
-- Anyone holding an active link may request member access after authenticating.
-- A removed member cannot automatically reinstate themselves using a general link.
create table if not exists public.tw_workspace_invite_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.tw_organizations(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 role text not null default 'member' check (role in ('member','observer','stakeholder')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '14 days'),
 max_uses integer not null default 25 check (max_uses between 1 and 100),
 used_count integer not null default 0 check (used_count>=0),
 revoked_at timestamptz
);
create index if not exists tw_join_links_org_idx on public.tw_workspace_invite_links(organization_id,created_at desc);
alter table public.tw_workspace_invite_links enable row level security;
drop policy if exists tw_join_links_manager_read on public.tw_workspace_invite_links;
create policy tw_join_links_manager_read on public.tw_workspace_invite_links
 for select to authenticated using (public.tw_can_manage(organization_id));
revoke all on public.tw_workspace_invite_links from public,anon,authenticated;
grant select on public.tw_workspace_invite_links to authenticated;

create or replace function public.tw_create_workspace_link(org_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare new_token uuid;
begin
 if auth.uid() is null or not public.tw_can_manage(org_id) then
  raise exception 'Only organization leaders can create a join link';
 end if;
 insert into public.tw_workspace_invite_links(organization_id,created_by)
 values(org_id,auth.uid()) returning token into new_token;
 return new_token;
end;
$$;
revoke execute on function public.tw_create_workspace_link(uuid) from public,anon;
grant execute on function public.tw_create_workspace_link(uuid) to authenticated;

create or replace function public.tw_workspace_link_preview(link_token uuid)
returns table(organization_name text,invite_role text,expires_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select o.name,l.role,l.expires_at
 from public.tw_workspace_invite_links l
 join public.tw_organizations o on o.id=l.organization_id
 where auth.uid() is not null and l.token=link_token and l.revoked_at is null
 and l.expires_at>now() and l.used_count<l.max_uses;
$$;
revoke execute on function public.tw_workspace_link_preview(uuid) from public,anon;
grant execute on function public.tw_workspace_link_preview(uuid) to authenticated;

create or replace function public.tw_join_workspace_link(link_token uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare l public.tw_workspace_invite_links%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in before joining a workspace'; end if;
 select * into l from public.tw_workspace_invite_links
 where token=link_token for update;
 if not found or l.revoked_at is not null or l.expires_at<=now()
   or l.used_count>=l.max_uses then
  raise exception 'This join link is expired, full or has been revoked';
 end if;
 if exists(select 1 from public.tw_memberships m where m.organization_id=l.organization_id
 and m.user_id=auth.uid()) then
  raise exception 'You already belong to this workspace, or your previous access was removed. Ask a leader for help';
 end if;
 insert into public.tw_memberships(organization_id,user_id,role,revoked_at)
 values(l.organization_id,auth.uid(),l.role,null);
 update public.tw_workspace_invite_links set used_count=used_count+1 where id=l.id;
 return l.organization_id;
end;
$$;
revoke execute on function public.tw_join_workspace_link(uuid) from public,anon;
grant execute on function public.tw_join_workspace_link(uuid) to authenticated;

create or replace function public.tw_revoke_workspace_link(link_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare link_org uuid;
begin
 select organization_id into link_org from public.tw_workspace_invite_links where id=link_id for update;
 if link_org is null or not public.tw_can_manage(link_org) then
  raise exception 'Only organization leaders can revoke a join link';
 end if;
 update public.tw_workspace_invite_links set revoked_at=now()
 where id=link_id and revoked_at is null;
end;
$$;
revoke execute on function public.tw_revoke_workspace_link(uuid) from public,anon;
grant execute on function public.tw_revoke_workspace_link(uuid) to authenticated;
