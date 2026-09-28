-- Reviewer judgments from side-by-side guidance tests. These are separate
-- from published ticket scores and never appear in agent score history.
create table if not exists public.team_guidance_test_feedback (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  ticket_id text not null,
  draft_text text not null,
  published_version integer,
  published_result jsonb not null,
  draft_result jsonb not null,
  preferred text not null check (preferred in ('published', 'draft', 'same')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists team_guidance_test_feedback_team_created_idx
  on public.team_guidance_test_feedback(team_id, created_at desc);

alter table public.team_guidance_test_feedback enable row level security;
create policy team_guidance_test_feedback_read on public.team_guidance_test_feedback
  for select using (public.current_user_role() = 'admin');
create policy team_guidance_test_feedback_insert on public.team_guidance_test_feedback
  for insert with check (public.current_user_role() = 'admin' and created_by = auth.uid());
create policy team_guidance_test_feedback_update on public.team_guidance_test_feedback
  for update using (public.current_user_role() = 'admin' and created_by = auth.uid())
  with check (public.current_user_role() = 'admin' and created_by = auth.uid());
