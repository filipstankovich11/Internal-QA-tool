-- notify_admins: insert a notification for every admin/lead, callable by any
-- authenticated user.
--
-- Why: profiles RLS is read-own-only for non-admins, so the client-side
-- "select admin ids then insert notifications" approach silently returned
-- zero admins when an AGENT triggered it (dispute, mark-as-seen) — the
-- notification was never inserted. SECURITY DEFINER lets the lookup+insert
-- run with definer privileges without widening profile visibility.

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
  where role in ('admin', 'lead');
$$;

revoke all on function public.notify_admins(text, text, uuid) from public;
grant execute on function public.notify_admins(text, text, uuid) to authenticated;
