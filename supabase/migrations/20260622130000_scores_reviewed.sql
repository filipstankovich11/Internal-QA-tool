-- "Mark reviewed" — records that a reviewer worked a ticket and removes it from
-- the queue even when the verdict wasn't changed (the common "agreed, notified" case).
-- reviewed_by: who completed the review; reviewed_at: when. Nulled out on re-open.
alter table public.scores add column if not exists reviewed_by uuid references auth.users(id);
alter table public.scores add column if not exists reviewed_at timestamptz;
