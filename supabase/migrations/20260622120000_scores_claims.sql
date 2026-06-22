-- Persisted reviewer claims for the "My Queue" workflow.
-- claimed_by: the reviewer who claimed the ticket; claimed_at: when (used for the
-- client-side auto-release TTL). Nulled out on unclaim.
alter table public.scores add column if not exists claimed_by uuid references auth.users(id);
alter table public.scores add column if not exists claimed_at timestamptz;
create index if not exists scores_claimed_by_idx on public.scores (claimed_by);

-- Enable realtime on scores so claims/overrides sync live across reviewers
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;
end $$;
