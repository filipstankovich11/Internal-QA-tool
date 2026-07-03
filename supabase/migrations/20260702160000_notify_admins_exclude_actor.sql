-- notify_admins v2: don't notify the person who triggered the event.
-- With rubric_updated / auto_fail_triggered fired by admins themselves,
-- self-notifications are noise — the actor already knows what they did.

create or replace function public.notify_admins(
  p_type     text,
  p_message  text,
  p_score_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, message, score_id)
  select id, p_type, p_message, p_score_id
  from public.profiles
  where role in ('admin', 'lead')
    and id is distinct from auth.uid();
$$;

revoke all on function public.notify_admins(text, text, uuid) from public;
grant execute on function public.notify_admins(text, text, uuid) to authenticated;
