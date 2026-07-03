-- Reviewer directory for claim badges and the Assign menu. profiles RLS is
-- read-own-only for non-admins, so leads couldn't resolve other reviewers'
-- names ("claimed by Another reviewer"). Reviewer names/roles are not
-- sensitive in an internal tool; expose just admin/lead rows via a
-- security-definer function.

create or replace function public.list_reviewer_profiles()
returns table (id uuid, name text, role text)
language sql
security definer
set search_path = public
as $$
  select id, name, role
  from public.profiles
  where role in ('admin', 'lead');
$$;

revoke all on function public.list_reviewer_profiles() from public;
grant execute on function public.list_reviewer_profiles() to authenticated;
