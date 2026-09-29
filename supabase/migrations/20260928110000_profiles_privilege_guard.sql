-- profiles_update_own permits editing one's profile. Protect the role and
-- team columns so a signed-in agent cannot grant themselves admin access.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
     and (new.role is distinct from old.role or new.team_id is distinct from old.team_id)
     and public.current_user_role() <> 'admin' then
    raise exception 'Only admins can change profile roles or teams';
  end if;
  return new;
end $$;

drop trigger if exists profiles_privilege_guard on public.profiles;
create trigger profiles_privilege_guard before update on public.profiles
  for each row execute function public.guard_profile_privileges();
