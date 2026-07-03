-- Rubric change history: one snapshot per save, with a precomputed
-- human-readable summary of what changed vs the previous version.

create table if not exists public.rubric_revisions (
  id              uuid default gen_random_uuid() primary key,
  config          jsonb not null,
  summary         text[] default '{}',
  changed_by      uuid references auth.users(id) on delete set null,
  changed_by_name text,
  created_at      timestamptz default now()
);

alter table public.rubric_revisions enable row level security;

create policy "rubric_rev_read" on public.rubric_revisions
  for select using (auth.role() = 'authenticated');

create policy "rubric_rev_insert" on public.rubric_revisions
  for insert with check (public.current_user_role() in ('admin', 'lead'));

create index if not exists rubric_revisions_created_idx
  on public.rubric_revisions(created_at desc);
