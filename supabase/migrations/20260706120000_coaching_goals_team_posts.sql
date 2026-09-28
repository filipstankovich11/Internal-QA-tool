-- Coaching goals (agent-visible development plan) and team posts (huddle topics
-- and team-feed shares) — the targets of the coaching hub's "Add to plan",
-- "Share with team" and "Turn into team topic" modals.

create table if not exists public.coaching_goals (
  id              uuid default gen_random_uuid() primary key,
  agent_id        uuid references public.agents(id) on delete cascade,
  title           text not null,
  detail          text default '',
  criterion_id    text,              -- rubric criterion this goal tracks (used to match "same root cause")
  status          text not null default 'open' check (status in ('open', 'done')),
  evidence        jsonb default '[]',   -- [{scoreId, ticketId}]
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.coaching_goals enable row level security;

create policy "coach_goals_all" on public.coaching_goals
  for all using (public.current_user_role() in ('admin', 'lead'))
  with check (public.current_user_role() in ('admin', 'lead'));

-- Goals are agent-visible by design ("<agent> sees the goal, not this card")
create policy "coach_goals_agent_read" on public.coaching_goals
  for select using (
    exists (
      select 1 from public.agents
      where agents.id = coaching_goals.agent_id
      and agents.email = (auth.jwt() ->> 'email')
    )
  );

create index if not exists coaching_goals_agent_idx on public.coaching_goals(agent_id);

create table if not exists public.team_posts (
  id              uuid default gen_random_uuid() primary key,
  kind            text not null check (kind in ('topic', 'strength')),
  destination     text not null default 'feed' check (destination in ('huddle', 'feed')),
  title           text not null,
  body            text default '',
  credit_agent_id uuid references public.agents(id) on delete set null,
  evidence        jsonb default '[]',   -- [{scoreId, ticketId}] — rendered for leads only in the UI
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz default now()
);

alter table public.team_posts enable row level security;

create policy "team_posts_all" on public.team_posts
  for all using (public.current_user_role() in ('admin', 'lead'))
  with check (public.current_user_role() in ('admin', 'lead'));

-- The whole team reads posts (that's the point of the feed)
create policy "team_posts_read" on public.team_posts
  for select using (auth.role() = 'authenticated');

create index if not exists team_posts_created_idx on public.team_posts(created_at desc);
