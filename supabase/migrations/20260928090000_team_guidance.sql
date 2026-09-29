-- A Gorgias team maps to one QA team. Drafts never affect automated grading.
alter table public.teams add column if not exists gorgias_team_id bigint;
create unique index if not exists teams_gorgias_team_id_key
  on public.teams(gorgias_team_id) where gorgias_team_id is not null;

create table if not exists public.team_guidance (
  team_id uuid primary key references public.teams(id) on delete cascade,
  draft_text text not null default '',
  published_text text,
  published_version integer not null default 0,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.team_guidance_versions (
  team_id uuid not null references public.teams(id) on delete cascade,
  version integer not null,
  content text not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  primary key (team_id, version)
);

alter table public.team_guidance enable row level security;
alter table public.team_guidance_versions enable row level security;
create policy team_guidance_read on public.team_guidance for select
  using (auth.role() = 'authenticated');
create policy team_guidance_insert on public.team_guidance for insert
  with check (public.current_user_role() = 'admin');
create policy team_guidance_update on public.team_guidance for update
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy team_guidance_versions_read on public.team_guidance_versions for select
  using (auth.role() = 'authenticated');

-- Publish and history insertion must commit together. Only an admin may call it.
create or replace function public.publish_team_guidance(p_team_id uuid)
returns public.team_guidance
language plpgsql security definer set search_path = public
as $$
declare
  guidance public.team_guidance;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can publish team guidance';
  end if;
  select * into guidance from public.team_guidance
    where team_id = p_team_id for update;
  if not found or length(trim(guidance.draft_text)) = 0 then
    raise exception 'Save a nonempty draft before publishing';
  end if;
  update public.team_guidance
    set published_text = guidance.draft_text,
        published_version = guidance.published_version + 1,
        published_at = now(), updated_at = now(), updated_by = auth.uid()
    where team_id = p_team_id returning * into guidance;
  insert into public.team_guidance_versions(team_id, version, content, published_by)
    values (p_team_id, guidance.published_version, guidance.published_text, auth.uid());
  return guidance;
end $$;
revoke all on function public.publish_team_guidance(uuid) from public;
grant execute on function public.publish_team_guidance(uuid) to authenticated;

-- Keep manual scores unaffected; Cortex writes one score per ticket.
alter table public.scores add column if not exists source text not null default 'manual';
create unique index if not exists scores_cortex_ticket_unique
  on public.scores(ticket_id) where source = 'cortex';

-- Automated inserts bypass the browser's addScore() notification path.
create or replace function public.notify_cortex_score()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  agent_id uuid;
begin
  if new.source <> 'cortex' then return new; end if;
  foreach agent_id in array new.agent_ids loop
    insert into public.notifications(agent_id, type, message, score_id)
      values (agent_id, 'score_published',
        'Your ticket #' || new.ticket_id || ' was graded — ' ||
        round(new.weighted_score::numeric) || '/100 · ' || replace(new.verdict, '_', ' '), new.id);
  end loop;
  if coalesce((new.full_score->'auto_fail'->>'triggered')::boolean, false) then
    perform public.notify_admins('auto_fail_triggered',
      'Auto-fail triggered on ticket #' || new.ticket_id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists scores_cortex_notify on public.scores;
create trigger scores_cortex_notify after insert on public.scores
  for each row execute function public.notify_cortex_score();
