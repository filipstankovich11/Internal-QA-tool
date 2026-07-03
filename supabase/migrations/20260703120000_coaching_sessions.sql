-- Coaching sessions: drafted from a coaching opportunity (or ad hoc), edited
-- by reviewers, optionally visible to the agent once completed.

create table if not exists public.coaching_sessions (
  id               uuid default gen_random_uuid() primary key,
  agent_id         uuid references public.agents(id) on delete cascade,
  status           text not null default 'draft' check (status in ('draft', 'completed')),
  origin           text,
  opportunity_key  text,             -- hub opportunity id (agent:criterion:kind) this session came from
  ai_summary       text,             -- trend summary shown at the top ("**bold**" markers allowed)
  agenda           jsonb default '[]',   -- [{id, kind, title, detail, tickets:[{scoreId, ticketId}]}]
  notes            text default '',
  action_items     jsonb default '[]',   -- [{id, done, text, owner}]
  evidence         jsonb default '[]',   -- [{scoreId, ticketId, score, status, subject}]
  visible_to_agent boolean default true,
  created_by       uuid references auth.users(id) on delete set null,
  created_by_name  text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  completed_at     timestamptz
);

alter table public.coaching_sessions enable row level security;

-- Reviewers (admin/lead) manage sessions
create policy "coach_sess_all" on public.coaching_sessions
  for all using (public.current_user_role() in ('admin', 'lead'))
  with check (public.current_user_role() in ('admin', 'lead'));

-- Agents read their own sessions once completed and marked visible
create policy "coach_sess_agent_read" on public.coaching_sessions
  for select using (
    visible_to_agent
    and status = 'completed'
    and exists (
      select 1 from public.agents
      where agents.id = coaching_sessions.agent_id
      and agents.email = (auth.jwt() ->> 'email')
    )
  );

create index if not exists coaching_sessions_agent_idx   on public.coaching_sessions(agent_id);
create index if not exists coaching_sessions_created_idx on public.coaching_sessions(created_at desc);
