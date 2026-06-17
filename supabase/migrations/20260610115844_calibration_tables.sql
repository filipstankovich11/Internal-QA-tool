-- Calibration sessions
create table if not exists public.calibration_sessions (
  id              uuid default gen_random_uuid() primary key,
  ticket_id       text not null,
  ticket_subject  text default '',
  created_by      uuid references auth.users(id),
  created_by_name text,
  status          text not null default 'open' check (status in ('open', 'revealed')),
  ai_score        jsonb,
  created_at      timestamptz default now()
);

-- Calibration entries (one per reviewer per session)
create table if not exists public.calibration_entries (
  id             uuid default gen_random_uuid() primary key,
  session_id     uuid not null references public.calibration_sessions(id) on delete cascade,
  reviewer_id    uuid references auth.users(id),
  reviewer_name  text,
  verdict        text check (verdict in ('PASS', 'NEEDS_REVIEW', 'FAIL')),
  weighted_score float,
  notes          text,
  submitted_at   timestamptz default now(),
  unique (session_id, reviewer_id)
);

alter table public.calibration_sessions enable row level security;
alter table public.calibration_entries  enable row level security;

-- Sessions: all authenticated users read, admin/lead create and update (to reveal)
create policy "cal_sessions_read"   on public.calibration_sessions for select using (auth.role() = 'authenticated');
create policy "cal_sessions_insert" on public.calibration_sessions for insert with check (public.current_user_role() in ('admin', 'lead'));
create policy "cal_sessions_update" on public.calibration_sessions for update using  (public.current_user_role() in ('admin', 'lead'));
create policy "cal_sessions_delete" on public.calibration_sessions for delete using  (public.current_user_role() = 'admin');

-- Entries: all authenticated users read and submit; only the reviewer updates their own
create policy "cal_entries_read"   on public.calibration_entries for select using (auth.role() = 'authenticated');
create policy "cal_entries_insert" on public.calibration_entries for insert with check (auth.role() = 'authenticated');
create policy "cal_entries_update" on public.calibration_entries for update using (auth.uid() = reviewer_id);
create policy "cal_entries_delete" on public.calibration_entries for delete using (public.current_user_role() = 'admin');
