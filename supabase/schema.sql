-- ============================================================
-- Gorgias QA Scorer — Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- Teams
create table public.teams (
  id         uuid default gen_random_uuid() primary key,
  name       text not null,
  created_at timestamptz default now()
);

-- Support agents (the people being evaluated)
create table public.agents (
  id         uuid default gen_random_uuid() primary key,
  name       text not null,
  email      text,
  team_id    uuid references public.teams(id) on delete set null,
  created_at timestamptz default now()
);

-- App user profiles (people who log into this tool)
create table public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  name       text,
  role       text not null default 'agent' check (role in ('admin', 'lead', 'agent')),
  team_id    uuid references public.teams(id) on delete set null,
  created_at timestamptz default now()
);

-- QA scores
create table public.scores (
  id             uuid default gen_random_uuid() primary key,
  ticket_id      text not null,
  ticket_subject text,
  verdict        text check (verdict in ('PASS', 'NEEDS_REVIEW', 'FAIL')),
  weighted_score float,
  agent_ids      uuid[] default '{}',
  full_score     jsonb,
  notes          text,
  scored_by      uuid references auth.users(id),
  scored_at      timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.teams    enable row level security;
alter table public.agents   enable row level security;
alter table public.profiles enable row level security;
alter table public.scores   enable row level security;

-- Helper: get current user role (used in policies)
create or replace function public.current_user_role()
returns text as $$
  select role from public.profiles where id = auth.uid()
$$ language sql security definer stable;

-- TEAMS: everyone reads, only admin writes
create policy "teams_read"   on public.teams for select using (auth.role() = 'authenticated');
create policy "teams_insert" on public.teams for insert with check (public.current_user_role() = 'admin');
create policy "teams_update" on public.teams for update using  (public.current_user_role() = 'admin');
create policy "teams_delete" on public.teams for delete using  (public.current_user_role() = 'admin');

-- AGENTS: everyone reads, admin/lead write
create policy "agents_read"   on public.agents for select using (auth.role() = 'authenticated');
create policy "agents_insert" on public.agents for insert with check (public.current_user_role() in ('admin', 'lead'));
create policy "agents_update" on public.agents for update using  (public.current_user_role() in ('admin', 'lead'));
create policy "agents_delete" on public.agents for delete using  (public.current_user_role() in ('admin', 'lead'));

-- PROFILES: users read their own; admin reads all; users update their own
create policy "profiles_read_own"   on public.profiles for select using (auth.uid() = id or public.current_user_role() = 'admin');
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id or public.current_user_role() = 'admin');

-- SCORES: everyone reads, admin/lead insert, admin/lead update (notes), admin deletes
create policy "scores_read"   on public.scores for select using (auth.role() = 'authenticated');
create policy "scores_insert" on public.scores for insert with check (public.current_user_role() in ('admin', 'lead'));
create policy "scores_update" on public.scores for update using  (public.current_user_role() in ('admin', 'lead'));
create policy "scores_delete" on public.scores for delete using  (public.current_user_role() = 'admin');

-- ============================================================
-- Auto-create profile when a new user signs up
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- NOTE: Passwords are handled entirely by Supabase Auth (bcrypt).
-- You never store or touch raw passwords.
-- Create your first admin user via Supabase Dashboard > Auth > Users,
-- then run: update public.profiles set role = 'admin' where id = '<user-id>';
-- ============================================================

-- ============================================================
-- Run these migrations if upgrading an existing database
-- ============================================================

-- Rubric config (single row, admin-editable)
create table if not exists public.rubric (
  id         integer primary key default 1 check (id = 1),
  config     jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now()
);
alter table public.rubric enable row level security;
create policy "rubric_read"   on public.rubric for select using (auth.role() = 'authenticated');
create policy "rubric_insert" on public.rubric for insert with check (public.current_user_role() = 'admin');
create policy "rubric_update" on public.rubric for update using  (public.current_user_role() = 'admin');

-- Override columns on scores
alter table public.scores add column if not exists override_verdict text check (override_verdict in ('PASS', 'NEEDS_REVIEW', 'FAIL'));
alter table public.scores add column if not exists override_score   float;
alter table public.scores add column if not exists override_note    text;
alter table public.scores add column if not exists override_by      uuid references auth.users(id);
alter table public.scores add column if not exists override_at      timestamptz;

-- Notes column on scores (if not already added)
alter table public.scores add column if not exists notes text;

-- scores_update policy (if not already added)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'scores' and policyname = 'scores_update'
  ) then
    execute 'create policy "scores_update" on public.scores for update using (public.current_user_role() in (''admin'', ''lead''))';
  end if;
end $$;

-- gorgias_user_id on agents (if not already added)
alter table public.agents add column if not exists gorgias_user_id integer;
