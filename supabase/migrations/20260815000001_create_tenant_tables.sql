-- Phase 1A: Tenant foundation tables, RLS policies, Custom Access Token Hook
-- organizations / memberships / invitations

--------------------------------------------------------------------------------
-- Extensions
--------------------------------------------------------------------------------

create extension if not exists moddatetime with schema extensions;

--------------------------------------------------------------------------------
-- Tables
--------------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  token uuid unique not null default gen_random_uuid(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

--------------------------------------------------------------------------------
-- Indexes
--------------------------------------------------------------------------------

create index idx_memberships_org_id on public.memberships(org_id);
create index idx_memberships_user_id on public.memberships(user_id);
create index idx_invitations_org_id_email on public.invitations(org_id, email);

--------------------------------------------------------------------------------
-- updated_at triggers
--------------------------------------------------------------------------------

create trigger handle_updated_at_organizations
  before update on public.organizations
  for each row
  execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at_memberships
  before update on public.memberships
  for each row
  execute function extensions.moddatetime(updated_at);

--------------------------------------------------------------------------------
-- Helper: current org_id from JWT
--------------------------------------------------------------------------------

create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid;
$$;

--------------------------------------------------------------------------------
-- RLS: enable on all tables
--------------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

--------------------------------------------------------------------------------
-- RLS policies: organizations
-- INSERT/DELETE handled by service_role (bypasses RLS)
--------------------------------------------------------------------------------

create policy "organizations_select" on public.organizations
  for select using (id = public.current_org_id());

create policy "organizations_update" on public.organizations
  for update using (id = public.current_org_id());

--------------------------------------------------------------------------------
-- RLS policies: memberships
--------------------------------------------------------------------------------

create policy "memberships_select" on public.memberships
  for select using (org_id = public.current_org_id());

create policy "memberships_insert" on public.memberships
  for insert with check (org_id = public.current_org_id());

create policy "memberships_update" on public.memberships
  for update using (org_id = public.current_org_id());

create policy "memberships_delete" on public.memberships
  for delete using (org_id = public.current_org_id());

--------------------------------------------------------------------------------
-- RLS policies: invitations
--------------------------------------------------------------------------------

create policy "invitations_select" on public.invitations
  for select using (org_id = public.current_org_id());

create policy "invitations_insert" on public.invitations
  for insert with check (org_id = public.current_org_id());

create policy "invitations_update" on public.invitations
  for update using (org_id = public.current_org_id());

create policy "invitations_delete" on public.invitations
  for delete using (org_id = public.current_org_id());

--------------------------------------------------------------------------------
-- Custom Access Token Hook (in public schema — auth schema is not writable by migrations)
-- Embeds org_id and role into JWT app_metadata
--------------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  membership record;
  cur_org_id uuid;
begin
  claims := event -> 'claims';

  -- Ensure app_metadata exists
  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  -- Check if user already has an org_id in app_metadata
  cur_org_id := (claims -> 'app_metadata' ->> 'org_id')::uuid;

  if cur_org_id is not null then
    -- Verify the membership still exists for the selected org
    select m.org_id, m.role into membership
    from public.memberships m
    where m.user_id = (event ->> 'user_id')::uuid
      and m.org_id = cur_org_id
    limit 1;
  end if;

  -- Fall back to the first membership if current org is invalid
  if membership is null then
    select m.org_id, m.role into membership
    from public.memberships m
    where m.user_id = (event ->> 'user_id')::uuid
    order by m.created_at asc
    limit 1;
  end if;

  if membership is not null then
    claims := jsonb_set(claims, '{app_metadata, org_id}', to_jsonb(membership.org_id));
    claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(membership.role));
  else
    claims := jsonb_set(claims, '{app_metadata, org_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{app_metadata, role}', 'null'::jsonb);
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Permissions: only supabase_auth_admin can execute the hook
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- The hook runs as supabase_auth_admin and needs to read memberships
grant usage on schema public to supabase_auth_admin;
grant select on public.memberships to supabase_auth_admin;

--------------------------------------------------------------------------------
-- API access grants (auto_expose_new_tables is disabled)
--------------------------------------------------------------------------------

-- current_org_id() is used by RLS policies — authenticated must be able to call it
grant execute on function public.current_org_id to authenticated;

-- organizations: SELECT/UPDATE via authenticated, INSERT/DELETE via service_role only
grant select, update on public.organizations to authenticated;

-- memberships: full CRUD via authenticated (row filtering by RLS)
grant select, insert, update, delete on public.memberships to authenticated;

-- invitations: full CRUD via authenticated (row filtering by RLS)
grant select, insert, update, delete on public.invitations to authenticated;

-- service_role: full access (bypasses RLS but still needs table GRANTs)
grant all on public.organizations to service_role;
grant all on public.memberships to service_role;
grant all on public.invitations to service_role;
