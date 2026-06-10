-- scores: override columns
alter table public.scores add column if not exists override_verdict text check (override_verdict in ('PASS', 'NEEDS_REVIEW', 'FAIL'));
alter table public.scores add column if not exists override_score   float;
alter table public.scores add column if not exists override_note    text;
alter table public.scores add column if not exists override_by      uuid references auth.users(id);
alter table public.scores add column if not exists override_at      timestamptz;

-- scores: reviewer notes
alter table public.scores add column if not exists notes text;

-- scores: dispute flow
alter table public.scores add column if not exists disputed       boolean default false;
alter table public.scores add column if not exists dispute_note   text;
alter table public.scores add column if not exists dispute_at     timestamptz;

-- scores: agent acknowledgement
alter table public.scores add column if not exists acknowledged    boolean default false;
alter table public.scores add column if not exists acknowledged_at timestamptz;

-- agents: Gorgias user mapping and performance goal
alter table public.agents add column if not exists gorgias_user_id integer;
alter table public.agents add column if not exists goal_score      integer;

-- scores: update policy (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'scores' and policyname = 'scores_update'
  ) then
    execute 'create policy "scores_update" on public.scores for update using (public.current_user_role() in (''admin'', ''lead''))';
  end if;
end $$;
