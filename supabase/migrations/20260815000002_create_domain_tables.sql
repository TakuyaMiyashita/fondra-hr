-- Phase 1B: Business domain tables, RLS, triggers, audit log, risk scores view

--------------------------------------------------------------------------------
-- Tables
--------------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  parent_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  employee_code text not null,
  full_name text not null,
  full_name_kana text,
  email text,
  position text,
  hired_on date,
  birth_date date,
  avatar_path text,
  status text not null default 'active' check (status in ('active', 'inactive', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, employee_code)
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.employee_skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  level int not null check (level between 1 and 5),
  certified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, skill_id)
);

create table public.one_on_ones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  interviewer_id uuid not null references public.employees(id) on delete cascade,
  held_on date not null,
  notes text,
  ai_summary text,
  mood_score int check (mood_score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluation_cycles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  evaluator_id uuid not null references public.employees(id) on delete cascade,
  ratings jsonb,
  comment text,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'submitted', 'confirmed', 'returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  changes jsonb,
  ip text,
  created_at timestamptz not null default now()
);

--------------------------------------------------------------------------------
-- Indexes
--------------------------------------------------------------------------------

create index idx_departments_org_id on public.departments(org_id);
create index idx_departments_parent_id on public.departments(parent_id);

create index idx_employees_org_id on public.employees(org_id);
create index idx_employees_department_id on public.employees(department_id);
create index idx_employees_user_id on public.employees(user_id);

create index idx_skills_org_id on public.skills(org_id);

create index idx_employee_skills_org_id on public.employee_skills(org_id);
create index idx_employee_skills_employee_id on public.employee_skills(employee_id);
create index idx_employee_skills_skill_id on public.employee_skills(skill_id);

create index idx_one_on_ones_org_id on public.one_on_ones(org_id);
create index idx_one_on_ones_employee_id on public.one_on_ones(employee_id);
create index idx_one_on_ones_interviewer_id on public.one_on_ones(interviewer_id);
create index idx_one_on_ones_held_on on public.one_on_ones(held_on);

create index idx_evaluation_cycles_org_id on public.evaluation_cycles(org_id);

create index idx_evaluations_org_id on public.evaluations(org_id);
create index idx_evaluations_cycle_id on public.evaluations(cycle_id);
create index idx_evaluations_employee_id on public.evaluations(employee_id);
create index idx_evaluations_evaluator_id on public.evaluations(evaluator_id);

create index idx_audit_logs_org_id on public.audit_logs(org_id);
create index idx_audit_logs_resource on public.audit_logs(resource_type, resource_id);
create index idx_audit_logs_actor on public.audit_logs(actor_user_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at);

--------------------------------------------------------------------------------
-- updated_at triggers
--------------------------------------------------------------------------------

create trigger handle_updated_at_departments
  before update on public.departments for each row
  execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at_employees
  before update on public.employees for each row
  execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at_skills
  before update on public.skills for each row
  execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at_employee_skills
  before update on public.employee_skills for each row
  execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at_one_on_ones
  before update on public.one_on_ones for each row
  execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at_evaluation_cycles
  before update on public.evaluation_cycles for each row
  execute function extensions.moddatetime(updated_at);

create trigger handle_updated_at_evaluations
  before update on public.evaluations for each row
  execute function extensions.moddatetime(updated_at);

--------------------------------------------------------------------------------
-- RLS: enable on all tables
--------------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.skills enable row level security;
alter table public.employee_skills enable row level security;
alter table public.one_on_ones enable row level security;
alter table public.evaluation_cycles enable row level security;
alter table public.evaluations enable row level security;
alter table public.audit_logs enable row level security;

--------------------------------------------------------------------------------
-- RLS policies: org_id tenant isolation
--------------------------------------------------------------------------------

-- departments
create policy "departments_select" on public.departments for select using (org_id = public.current_org_id());
create policy "departments_insert" on public.departments for insert with check (org_id = public.current_org_id());
create policy "departments_update" on public.departments for update using (org_id = public.current_org_id());
create policy "departments_delete" on public.departments for delete using (org_id = public.current_org_id());

-- employees
create policy "employees_select" on public.employees for select using (org_id = public.current_org_id());
create policy "employees_insert" on public.employees for insert with check (org_id = public.current_org_id());
create policy "employees_update" on public.employees for update using (org_id = public.current_org_id());
create policy "employees_delete" on public.employees for delete using (org_id = public.current_org_id());

-- skills
create policy "skills_select" on public.skills for select using (org_id = public.current_org_id());
create policy "skills_insert" on public.skills for insert with check (org_id = public.current_org_id());
create policy "skills_update" on public.skills for update using (org_id = public.current_org_id());
create policy "skills_delete" on public.skills for delete using (org_id = public.current_org_id());

-- employee_skills
create policy "employee_skills_select" on public.employee_skills for select using (org_id = public.current_org_id());
create policy "employee_skills_insert" on public.employee_skills for insert with check (org_id = public.current_org_id());
create policy "employee_skills_update" on public.employee_skills for update using (org_id = public.current_org_id());
create policy "employee_skills_delete" on public.employee_skills for delete using (org_id = public.current_org_id());

-- one_on_ones
create policy "one_on_ones_select" on public.one_on_ones for select using (org_id = public.current_org_id());
create policy "one_on_ones_insert" on public.one_on_ones for insert with check (org_id = public.current_org_id());
create policy "one_on_ones_update" on public.one_on_ones for update using (org_id = public.current_org_id());
create policy "one_on_ones_delete" on public.one_on_ones for delete using (org_id = public.current_org_id());

-- evaluation_cycles
create policy "evaluation_cycles_select" on public.evaluation_cycles for select using (org_id = public.current_org_id());
create policy "evaluation_cycles_insert" on public.evaluation_cycles for insert with check (org_id = public.current_org_id());
create policy "evaluation_cycles_update" on public.evaluation_cycles for update using (org_id = public.current_org_id());
create policy "evaluation_cycles_delete" on public.evaluation_cycles for delete using (org_id = public.current_org_id());

-- evaluations
create policy "evaluations_select" on public.evaluations for select using (org_id = public.current_org_id());
create policy "evaluations_insert" on public.evaluations for insert with check (org_id = public.current_org_id());
create policy "evaluations_update" on public.evaluations for update using (org_id = public.current_org_id());
create policy "evaluations_delete" on public.evaluations for delete using (org_id = public.current_org_id());

-- audit_logs: SELECT and INSERT only (no UPDATE/DELETE policies)
create policy "audit_logs_select" on public.audit_logs for select using (org_id = public.current_org_id());
create policy "audit_logs_insert" on public.audit_logs for insert with check (org_id = public.current_org_id());

--------------------------------------------------------------------------------
-- Audit logs: prevent UPDATE/DELETE at DB level
--------------------------------------------------------------------------------

create or replace function public.prevent_audit_log_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs cannot be modified or deleted';
end;
$$;

create trigger prevent_audit_log_update
  before update on public.audit_logs for each row
  execute function public.prevent_audit_log_modification();

create trigger prevent_audit_log_delete
  before delete on public.audit_logs for each row
  execute function public.prevent_audit_log_modification();

--------------------------------------------------------------------------------
-- Audit log auto-recording trigger
--------------------------------------------------------------------------------

create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_logs (org_id, actor_user_id, action, resource_type, resource_id, changes)
    values (NEW.org_id, auth.uid(), 'create', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('new', to_jsonb(NEW)));
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_logs (org_id, actor_user_id, action, resource_type, resource_id, changes)
    values (NEW.org_id, auth.uid(), 'update', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.audit_logs (org_id, actor_user_id, action, resource_type, resource_id, changes)
    values (OLD.org_id, auth.uid(), 'delete', TG_TABLE_NAME, OLD.id,
            jsonb_build_object('old', to_jsonb(OLD)));
    return OLD;
  end if;
  return null;
end;
$$;

-- Attach audit triggers to main business tables
create trigger audit_departments after insert or update or delete on public.departments
  for each row execute function public.audit_log_trigger();

create trigger audit_employees after insert or update or delete on public.employees
  for each row execute function public.audit_log_trigger();

create trigger audit_skills after insert or update or delete on public.skills
  for each row execute function public.audit_log_trigger();

create trigger audit_employee_skills after insert or update or delete on public.employee_skills
  for each row execute function public.audit_log_trigger();

create trigger audit_one_on_ones after insert or update or delete on public.one_on_ones
  for each row execute function public.audit_log_trigger();

create trigger audit_evaluation_cycles after insert or update or delete on public.evaluation_cycles
  for each row execute function public.audit_log_trigger();

create trigger audit_evaluations after insert or update or delete on public.evaluations
  for each row execute function public.audit_log_trigger();

--------------------------------------------------------------------------------
-- Employee risk scores view
--------------------------------------------------------------------------------

create view public.employee_risk_scores
with (security_invoker = true)
as
with tenure as (
  select id as employee_id, org_id,
    case
      when hired_on is null then 12
      when current_date - hired_on < 365 then 25
      when current_date - hired_on < 730 then 20
      when current_date - hired_on < 1095 then 15
      when current_date - hired_on < 1825 then 10
      else 0
    end as score
  from public.employees
  where status = 'active'
),
oo_freq as (
  select e.id as employee_id, e.org_id,
    greatest(0, 25 - count(o.id)::int * 5) as score
  from public.employees e
  left join public.one_on_ones o
    on o.employee_id = e.id and o.held_on >= current_date - 90
  where e.status = 'active'
  group by e.id, e.org_id
),
mood as (
  select e.id as employee_id, e.org_id,
    case
      when avg(sub.mood_score) is null then 12
      when avg(sub.mood_score) >= 4 then 0
      when avg(sub.mood_score) >= 3 then 8
      when avg(sub.mood_score) >= 2 then 16
      else 25
    end as score
  from public.employees e
  left join (
    select employee_id, mood_score,
      row_number() over (partition by employee_id order by held_on desc) as rn
    from public.one_on_ones
    where mood_score is not null
  ) sub on sub.employee_id = e.id and sub.rn <= 3
  where e.status = 'active'
  group by e.id, e.org_id
),
skill_chg as (
  select e.id as employee_id, e.org_id,
    case
      when max(es.updated_at) is null then 25
      when max(es.updated_at) >= current_timestamp - interval '3 months' then 0
      when max(es.updated_at) >= current_timestamp - interval '6 months' then 8
      when max(es.updated_at) >= current_timestamp - interval '12 months' then 16
      else 25
    end as score
  from public.employees e
  left join public.employee_skills es on es.employee_id = e.id
  where e.status = 'active'
  group by e.id, e.org_id
)
select
  t.employee_id,
  t.org_id,
  t.score as tenure_score,
  coalesce(f.score, 25) as one_on_one_score,
  coalesce(m.score, 12) as mood_score,
  coalesce(s.score, 25) as skill_change_score,
  (t.score + coalesce(f.score, 25) + coalesce(m.score, 12) + coalesce(s.score, 25)) as total_score,
  case
    when (t.score + coalesce(f.score, 25) + coalesce(m.score, 12) + coalesce(s.score, 25)) <= 33 then 'low'
    when (t.score + coalesce(f.score, 25) + coalesce(m.score, 12) + coalesce(s.score, 25)) <= 66 then 'medium'
    else 'high'
  end as risk_level
from tenure t
left join oo_freq f on f.employee_id = t.employee_id
left join mood m on m.employee_id = t.employee_id
left join skill_chg s on s.employee_id = t.employee_id;

--------------------------------------------------------------------------------
-- API access grants
--------------------------------------------------------------------------------

-- All domain tables: full CRUD for authenticated (row filtering by RLS)
grant select, insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.skills to authenticated;
grant select, insert, update, delete on public.employee_skills to authenticated;
grant select, insert, update, delete on public.one_on_ones to authenticated;
grant select, insert, update, delete on public.evaluation_cycles to authenticated;
grant select, insert, update, delete on public.evaluations to authenticated;

-- audit_logs: SELECT + INSERT only for authenticated
grant select, insert on public.audit_logs to authenticated;

-- employee_risk_scores view
grant select on public.employee_risk_scores to authenticated;

-- service_role: full access
grant all on public.departments to service_role;
grant all on public.employees to service_role;
grant all on public.skills to service_role;
grant all on public.employee_skills to service_role;
grant all on public.one_on_ones to service_role;
grant all on public.evaluation_cycles to service_role;
grant all on public.evaluations to service_role;
grant all on public.audit_logs to service_role;
grant select on public.employee_risk_scores to service_role;
