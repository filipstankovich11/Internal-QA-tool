-- Speeds up the dashboard/app initial load, which fetches the most recent
-- scores via `order by scored_at desc limit 500`. Without this index Postgres
-- sorts the entire scores table on every load.
create index if not exists scores_scored_at_idx on public.scores (scored_at desc);
