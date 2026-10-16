-- Optional, email-free invitation links. Existing email invitations are unchanged.
-- A link is a bearer credential: 14-day validity, at most 25 accepted members,
-- revocable by workspace managers, and can only grant non-administrator roles.
create table if not exists public.tw_invite_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.tw_organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 role text not null default 'member'
   check(role in ('member','observer','stakeholder')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '14 days'),
 max_uses integer not null default 25 check(max_uses between 1 and 25),
 uses_count integer not null default 0 check(uses_count >= 0),
 revoked_at timestamptz,
 constraint tw_invite_link_usage_limit check (uses_count<=max_uses)
);
create index if not exists tw_invite_links_org_idx on public.tw_invite_links(organization_id,created_at desc);
alter table public.tw_invite_links enable row level security;
drop policy if exists tw_invite_links_manager_select on public.tw_invite_links;
create policy tw_invite_links_manager_select on public.tw_invite_links
 for select to authenticated using (public.tw_can_manage(organization_id));
revoke all on public.tw_invite_links from anon,authenticated;
grant select on public.tw_invite_links to authenticated;

create or replace function public.tw_create_invite_link(
 org_id uuid, invite_role text default 'member'
) returns uuid language plpgsql security definer set search_path=''
as $fn$
declare created_link uuid;
begin
 if auth.uid() is null or not public.tw_can_manage(org_id) then
  raise exception 'Only workspace leaders can create invitation links';
 end if;
 if invite_role is null or invite_role not in ('member','observer','stakeholder') then
  raise exception 'General invitation links may only grant member, observer or stakeholder access';
 end if;
 insert into public.tw_invite_links(organization_id,created_by,role)
 values(org_id,auth.uid(),invite_role) returning id into created_link;
 return created_link;
end;
$fn$;

create or replace function public.tw_accept_invite_link(
 link_id uuid
) returns uuid language plpgsql security definer set search_path=''
as $fn$
declare link_row public.tw_invite_links%rowtype; previous public.tw_memberships%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in to accept this invitation'; end if;
 -- A row lock enforces the link's maximum-use limit under concurrent acceptance.
 select * into link_row from public.tw_invite_links where id=link_id for update;
 if not found or link_row.revoked_at is not null or link_row.expires_at<=now()
    or link_row.uses_count>=link_row.max_uses then
  raise exception 'This invitation link has expired, been revoked, or reached its member limit';
 end if;
 select * into previous from public.tw_memberships
  where organization_id=link_row.organization_id and user_id=auth.uid() for update;
 if found then
  if previous.revoked_at is not null then
   raise exception 'Please request a personal invitation from the workspace administrator';
  end if;
  -- Already a member: do not replace the role or use up an invitation slot.
  return link_row.organization_id;
 end if;
 insert into public.tw_memberships(organization_id,user_id,role,revoked_at)
 values(link_row.organization_id,auth.uid(),link_row.role,null)
 on conflict (organization_id,user_id) do nothing;
 if found then
  update public.tw_invite_links set uses_count=uses_count+1 where id=link_id;
 end if;
 return link_row.organization_id;
end;
$fn$;

create or replace function public.tw_revoke_invite_link(link_id uuid)
returns void language plpgsql security definer set search_path=''
as $fn$
declare org uuid;
begin
 select organization_id into org from public.tw_invite_links where id=link_id for update;
 if org is null or not public.tw_can_manage(org) then
  raise exception 'Only workspace leaders can revoke invitation links';
 end if;
 update public.tw_invite_links set revoked_at=coalesce(revoked_at,now()) where id=link_id;
end;
$fn$;

revoke execute on function public.tw_create_invite_link(uuid,text) from public,anon;
revoke execute on function public.tw_accept_invite_link(uuid) from public,anon;
revoke execute on function public.tw_revoke_invite_link(uuid) from public,anon;
grant execute on function public.tw_create_invite_link(uuid,text),
 public.tw_accept_invite_link(uuid),public.tw_revoke_invite_link(uuid) to authenticated;
