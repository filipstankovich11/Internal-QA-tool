-- Dispute thread: messages exchanged on a disputed score (agent ↔ reviewer),
-- so a dispute is a conversation rather than a single note. The agent's original
-- dispute_note (on scores) is message #1; replies/resolutions live here.
create table if not exists public.dispute_messages (
  id          uuid default gen_random_uuid() primary key,
  score_id    uuid not null references public.scores(id) on delete cascade,
  author_id   uuid references auth.users(id),
  author_name text,
  author_role text,                 -- 'agent' | 'lead' | 'admin'
  body        text not null,
  created_at  timestamptz default now()
);

create index if not exists dispute_messages_score_idx on public.dispute_messages (score_id, created_at);

alter table public.dispute_messages enable row level security;

-- All authenticated users read the thread; you can only post as yourself.
create policy "dispute_msgs_read"   on public.dispute_messages for select using (auth.role() = 'authenticated');
create policy "dispute_msgs_insert" on public.dispute_messages for insert with check (auth.uid() = author_id);
