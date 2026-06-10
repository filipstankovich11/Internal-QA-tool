create table if not exists public.notifications (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  agent_id   uuid references public.agents(id) on delete cascade,
  type       text not null,
  message    text not null,
  score_id   uuid references public.scores(id) on delete set null,
  metadata   jsonb default '{}',
  read       boolean default false,
  created_at timestamptz default now(),
  constraint notifications_target_check check (user_id is not null or agent_id is not null)
);

alter table public.notifications enable row level security;

-- Users see their own direct notifications, or notifications addressed to their linked agent
create policy "notif_select" on public.notifications for select using (
  auth.uid() = user_id
  or exists (
    select 1 from public.agents
    where agents.id = notifications.agent_id
    and agents.email = (auth.jwt() ->> 'email')
  )
);

create policy "notif_insert" on public.notifications
  for insert with check (auth.role() = 'authenticated');

create policy "notif_update" on public.notifications for update using (
  auth.uid() = user_id
  or exists (
    select 1 from public.agents
    where agents.id = notifications.agent_id
    and agents.email = (auth.jwt() ->> 'email')
  )
);

create policy "notif_delete" on public.notifications for delete using (
  auth.uid() = user_id
  or exists (
    select 1 from public.agents
    where agents.id = notifications.agent_id
    and agents.email = (auth.jwt() ->> 'email')
  )
);

-- Index for fast per-user queries
create index if not exists notifications_user_id_idx  on public.notifications(user_id);
create index if not exists notifications_agent_id_idx on public.notifications(agent_id);
create index if not exists notifications_created_idx  on public.notifications(created_at desc);
