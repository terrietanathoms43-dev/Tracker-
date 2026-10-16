-- Trackwise: shareable workspace invitation links without a recipient email.
-- Tokens are generated randomly, stored only as hashes, limited, and revocable.
create table if not exists public.tw_join_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tw_organizations(id) on delete cascade,
  token_hash text not null unique,
  role text not null check(role in ('member','observer','stakeholder')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer not null default 25 check(max_uses between 1 and 50),
  used_count integer not null default 0 check(used_count>=0 and used_count<=max_uses),
  revoked_at timestamptz
);
create index if not exists tw_join_links_org_date_idx on public.tw_join_links(organization_id,created_at desc);
alter table public.tw_join_links enable row level security;
revoke all on public.tw_join_links from public, anon, authenticated;

create or replace function public.tw_create_join_link(org_id uuid, join_role text default 'member')
returns text language plpgsql security definer set search_path=''
as $$
declare new_token text; existing_count integer;
begin
 if auth.uid() is null or not public.tw_can_manage(org_id) then
   raise exception 'Only workspace leaders may create invitation links';
 end if;
 if join_role not in ('member','observer','stakeholder') then
   raise exception 'For safety, invite leaders directly by email';
 end if;
 select count(*) into existing_count from public.tw_join_links
  where organization_id=org_id and revoked_at is null and expires_at>now() and used_count<max_uses;
 if existing_count>=10 then raise exception 'Revoke an old link before creating another'; end if;
 new_token:=encode(gen_random_bytes(24),'hex');
 insert into public.tw_join_links(organization_id,token_hash,role,created_by,expires_at)
 values(org_id,encode(digest(new_token,'sha256'),'hex'),join_role,auth.uid(),now()+interval '14 days');
 return new_token;
end;
$$;

create or replace function public.tw_list_join_links(org_id uuid)
returns table(id uuid, role text, created_at timestamptz, expires_at timestamptz, used_count integer, max_uses integer, revoked_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.tw_can_manage(org_id) then raise exception 'Workspace leader access required'; end if;
 return query select l.id,l.role,l.created_at,l.expires_at,l.used_count,l.max_uses,l.revoked_at
 from public.tw_join_links l where l.organization_id=org_id order by l.created_at desc limit 60;
end;
$$;

create or replace function public.tw_preview_join_link(join_token text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare link public.tw_join_links%rowtype; workspace_name text;
begin
 if auth.uid() is null then raise exception 'Sign in to view this invitation'; end if;
 if join_token is null or join_token !~ '^[0-9a-f]{48}$' then raise exception 'Invalid invitation link'; end if;
 select * into link from public.tw_join_links
  where token_hash=encode(digest(join_token,'sha256'),'hex')
  and revoked_at is null and expires_at>now() and used_count<max_uses;
 if not found then raise exception 'This link has expired or has been revoked'; end if;
 select name into workspace_name from public.tw_organizations where id=link.organization_id;
 return jsonb_build_object('organization_name',workspace_name,'role',link.role,'expires_at',link.expires_at);
end;
$$;

create or replace function public.tw_accept_join_link(join_token text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare link public.tw_join_links%rowtype; prior public.tw_memberships%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in before joining'; end if;
 if join_token is null or join_token !~ '^[0-9a-f]{48}$' then raise exception 'Invalid invitation link'; end if;
 select * into link from public.tw_join_links
  where token_hash=encode(digest(join_token,'sha256'),'hex') for update;
 if not found or link.revoked_at is not null or link.expires_at<=now() or link.used_count>=link.max_uses
 then raise exception 'This invitation has expired or is no longer available'; end if;
 select * into prior from public.tw_memberships
 where organization_id=link.organization_id and user_id=auth.uid();
 if found then
  if prior.revoked_at is not null then
   raise exception 'Your access was removed. Ask a workspace administrator to invite you directly.';
  end if;
  return link.organization_id;
 end if;
 insert into public.tw_memberships(organization_id,user_id,role)
 values(link.organization_id,auth.uid(),link.role);
 update public.tw_join_links set used_count=used_count+1 where id=link.id;
 return link.organization_id;
end;
$$;

create or replace function public.tw_revoke_join_link(link_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare org uuid;
begin
 select organization_id into org from public.tw_join_links where id=link_id;
 if org is null or not public.tw_can_manage(org) then raise exception 'Only workspace leaders can revoke links'; end if;
 update public.tw_join_links set revoked_at=coalesce(revoked_at,now()) where id=link_id;
end;
$$;

revoke all on function public.tw_create_join_link(uuid,text),public.tw_list_join_links(uuid),
 public.tw_preview_join_link(text),public.tw_accept_join_link(text),public.tw_revoke_join_link(uuid)
 from public,anon;
grant execute on function public.tw_create_join_link(uuid,text),public.tw_list_join_links(uuid),
 public.tw_preview_join_link(text),public.tw_accept_join_link(text),public.tw_revoke_join_link(uuid)
 to authenticated;
